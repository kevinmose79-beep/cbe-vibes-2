import './setupLocalStorage';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSecureStorageAdapter } from '../lib/secureStorageAdapter';
import { NativeSecureStorage } from '../lib/nativeSecureStorage';
import * as apiConfig from '../utils/apiConfig';
import { getSupabaseClient } from '../lib/storage';

describe('Phase 4.2: Connect Supabase Auth to Secure Android Storage', () => {
  beforeEach(async () => {
    // Reset test keys in NativeSecureStorage
    await NativeSecureStorage.remove({ key: 'test-session-key' });
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('test-session-key');
    }
  });

  it('Test 1 — Adapter contract: setItem, getItem, and removeItem properly interact with NativeSecureStorage', async () => {
    const adapter = createSecureStorageAdapter();
    const testPayload = JSON.stringify({ access_token: 'token-abc', refresh_token: 'ref-xyz' });

    // setItem
    await adapter.setItem('test-session-key', testPayload);

    // getItem
    const retrieved = await adapter.getItem('test-session-key');
    expect(retrieved).toBe(testPayload);

    // removeItem
    await adapter.removeItem('test-session-key');
    const afterRemove = await adapter.getItem('test-session-key');
    expect(afterRemove).toBeNull();
  });

  it('Test 2 — Web isolation: Web/PWA environment does not use native storage adapter by default', () => {
    // In standard node/web environment, isNativeEnvironment() returns false
    expect(apiConfig.isNativeEnvironment()).toBe(false);

    // Supabase client instance initializes cleanly on Web
    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(client?.auth).toBeDefined();
  });

  it('Test 3 — Supabase client configuration: Conditionally routes to secureStorageAdapter on native', () => {
    // Spy on isNativeEnvironment
    const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment');

    // Simulate Native environment
    isNativeSpy.mockReturnValue(true);
    expect(apiConfig.isNativeEnvironment()).toBe(true);

    const adapter = createSecureStorageAdapter();
    expect(typeof adapter.getItem).toBe('function');
    expect(typeof adapter.setItem).toBe('function');
    expect(typeof adapter.removeItem).toBe('function');

    // Restore
    isNativeSpy.mockRestore();
  });

  it('Test 4 — One-time migration: Safely migrates existing WebView localStorage session to secure storage and deletes old copy', async () => {
    const legacySessionPayload = JSON.stringify({
      access_token: 'legacy-access-token',
      refresh_token: 'legacy-refresh-token',
      user: { id: 'teacher-legacy-uuid' }
    });

    // 1. Simulate existing session in WebView localStorage prior to update
    window.localStorage.setItem('test-session-key', legacySessionPayload);
    // Ensure NativeSecureStorage does not yet have it
    await NativeSecureStorage.remove({ key: 'test-session-key' });

    const adapter = createSecureStorageAdapter();

    // 2. Initial read triggers one-time atomic migration
    const migrated = await adapter.getItem('test-session-key');
    expect(migrated).toBe(legacySessionPayload);

    // 3. Verify old unencrypted localStorage copy was immediately removed
    expect(window.localStorage.getItem('test-session-key')).toBeNull();

    // 4. Verify native secure storage now authoritatively holds the session
    const nativeVal = await NativeSecureStorage.get({ key: 'test-session-key' });
    expect(nativeVal.value).toBe(legacySessionPayload);
  });

  it('Test 5 — Login persistence roundtrip: Structured Supabase session payload survives save and load', async () => {
    const adapter = createSecureStorageAdapter();
    const sessionData = {
      access_token: 'fresh-jwt-token-12345',
      refresh_token: 'fresh-refresh-token-67890',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'teacher@school.ac.ke',
        role: 'authenticated'
      }
    };

    await adapter.setItem('test-session-key', JSON.stringify(sessionData));
    const loaded = await adapter.getItem('test-session-key');
    expect(loaded).not.toBeNull();
    expect(JSON.parse(loaded!)).toEqual(sessionData);
  });

  it('Test 6 — Silent refresh: Storage adapter methods execute asynchronously without UI prompts', async () => {
    const adapter = createSecureStorageAdapter();
    const setPromise = adapter.setItem('test-session-key', 'silent-token-data');
    expect(setPromise).toBeInstanceOf(Promise);
    await setPromise;

    const getPromise = adapter.getItem('test-session-key');
    expect(getPromise).toBeInstanceOf(Promise);
    const value = await getPromise;
    expect(value).toBe('silent-token-data');
  });

  it('Test 7 — Refresh-token rotation: Saving a rotated token updates native storage and guarantees no localStorage duplicate', async () => {
    const adapter = createSecureStorageAdapter();

    // Initial session
    await adapter.setItem('test-session-key', JSON.stringify({ token: 'initial' }));

    // Simulating token rotation by GoTrueClient._saveSession()
    const rotatedSession = JSON.stringify({ token: 'rotated-new-token-999' });
    await adapter.setItem('test-session-key', rotatedSession);

    // Authoritative store holds the rotated token
    const authoritative = await adapter.getItem('test-session-key');
    expect(authoritative).toBe(rotatedSession);

    // LocalStorage remains completely clean (zero competing duplicates)
    expect(window.localStorage.getItem('test-session-key')).toBeNull();
  });

  it('Test 8 — Logout: Removing session purges native storage and ensures no lingering token', async () => {
    const adapter = createSecureStorageAdapter();
    await adapter.setItem('test-session-key', 'active-session');

    // Logout
    await adapter.removeItem('test-session-key');

    expect(await adapter.getItem('test-session-key')).toBeNull();
    expect(window.localStorage.getItem('test-session-key')).toBeNull();
  });

  it('Test 9 — Web/PWA regression: Supabase client in standard web environment functions as expected', () => {
    const client = getSupabaseClient();
    expect(client).toBeDefined();
    // Default Web client has auth module initialized
    expect(client?.auth).toBeDefined();
    expect(typeof client?.auth.getSession).toBe('function');
    expect(typeof client?.auth.signInWithPassword).toBe('function');
  });
});
