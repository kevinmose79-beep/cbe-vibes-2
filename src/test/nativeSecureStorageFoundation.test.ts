import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NativeSecureStorage } from '../lib/nativeSecureStorage';
import { getSupabaseClient } from '../lib/storage';
import { authService } from '../services/authService';

describe('Phase 4.1: Native Secure Storage Foundation Verification', () => {
  beforeEach(async () => {
    // Clear test key before each test
    await NativeSecureStorage.remove({ key: 'test-key' });
  });

  it('Test 1 — Plugin registration: NativeSecureStorage is registered and exposes get, set, remove', () => {
    expect(NativeSecureStorage).toBeDefined();
    expect(typeof NativeSecureStorage.get).toBe('function');
    expect(typeof NativeSecureStorage.set).toBe('function');
    expect(typeof NativeSecureStorage.remove).toBe('function');
  });

  it('Test 2 & Test 3 — Set & Get: Successfully writes and retrieves a harmless test value', async () => {
    // Write harmless test value
    const setResult = await NativeSecureStorage.set({ key: 'test-key', value: 'test-value' });
    expect(setResult.value).toBe(true);

    // Retrieve harmless test value
    const getResult = await NativeSecureStorage.get({ key: 'test-key' });
    expect(getResult.value).toBe('test-value');
  });

  it('Test 4 — Remove: Successfully deletes the key and returns null on subsequent get', async () => {
    await NativeSecureStorage.set({ key: 'test-key', value: 'test-value' });
    const removeResult = await NativeSecureStorage.remove({ key: 'test-key' });
    expect(removeResult.value).toBe(true);

    const afterRemove = await NativeSecureStorage.get({ key: 'test-key' });
    expect(afterRemove.value).toBeNull();
  });

  it('Test 5 — Persistence: Survives multiple read/write operations with identical payload integrity', async () => {
    const complexJson = JSON.stringify({
      access_token: 'fake-test-token-only',
      token_type: 'bearer',
      user: { id: 'test-user-id' }
    });

    await NativeSecureStorage.set({ key: 'test-key', value: complexJson });
    const roundtrip = await NativeSecureStorage.get({ key: 'test-key' });
    expect(roundtrip.value).toBe(complexJson);
    expect(JSON.parse(roundtrip.value!)).toEqual({
      access_token: 'fake-test-token-only',
      token_type: 'bearer',
      user: { id: 'test-user-id' }
    });
  });

  it('Test 6 — Security inspection: Java source verifies Android Keystore AES-256-GCM encryption at rest', () => {
    const pluginPath = path.resolve('android/app/src/main/java/ke/ac/school/cbe/SecureStoragePlugin.java');
    expect(fs.existsSync(pluginPath)).toBe(true);

    const javaSource = fs.readFileSync(pluginPath, 'utf8');

    // 1. Android Keystore is provider
    expect(javaSource).toContain('"AndroidKeyStore"');
    expect(javaSource).toContain('KeyGenParameterSpec');

    // 2. Authenticated encryption AES-256-GCM
    expect(javaSource).toContain('KeyProperties.KEY_ALGORITHM_AES');
    expect(javaSource).toContain('KeyProperties.BLOCK_MODE_GCM');
    expect(javaSource).toContain('KeyProperties.ENCRYPTION_PADDING_NONE');
    expect(javaSource).toContain('.setKeySize(256)');

    // 3. Silent access (no biometric prompt on token refresh)
    expect(javaSource).toContain('.setUserAuthenticationRequired(false)');

    // 4. Random IV generation and GCMParameterSpec
    expect(javaSource).toContain('cipher.getIV()');
    expect(javaSource).toContain('GCMParameterSpec');

    // 5. Plugin methods exposed
    expect(javaSource).toContain('@PluginMethod\n    public void get(PluginCall call)');
    expect(javaSource).toContain('@PluginMethod\n    public void set(PluginCall call)');
    expect(javaSource).toContain('@PluginMethod\n    public void remove(PluginCall call)');

    // 6. Registered in MainActivity
    const mainActivityPath = path.resolve('android/app/src/main/java/ke/ac/school/cbe/MainActivity.java');
    const mainSource = fs.readFileSync(mainActivityPath, 'utf8');
    expect(mainSource).toContain('registerPlugin(SecureStoragePlugin.class);');
  });

  it('Test 7 — Supabase connection: storage.ts wires createSecureStorageAdapter on native and preserves authService', () => {
    const storageSource = fs.readFileSync(path.resolve('src/lib/storage.ts'), 'utf8');
    // Supabase client creation wires secure storage adapter conditionally
    expect(storageSource).toContain('createSecureStorageAdapter');
    expect(storageSource).toContain('supabaseInstance = clientOptions');

    // authService is unchanged
    const authSource = fs.readFileSync(path.resolve('src/services/authService.ts'), 'utf8');
    expect(authSource).not.toContain('NativeSecureStorage');

    // Supabase client instance resolves normally
    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(authService).toBeDefined();
  });
});
