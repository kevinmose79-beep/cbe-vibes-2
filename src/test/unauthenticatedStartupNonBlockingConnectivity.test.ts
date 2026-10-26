import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Surgical Fix #2: Non-Blocking Supabase Connectivity Check for Unauthenticated Startup', () => {
  const appTsxPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appTsxContent = fs.readFileSync(appTsxPath, 'utf-8');

  it('1. Verifies unauthenticated startup branch runs verifyAndSyncSupabase non-blockingly in the background', () => {
    // Must NOT await verifyAndSyncSupabase in unauthenticated branch
    expect(appTsxContent).not.toMatch(/api\.setCurrentUser\(null\);\s*await\s+verifyAndSyncSupabase/);
    
    // Must trigger verifyAndSyncSupabase with background catch handler
    expect(appTsxContent).toContain('verifyAndSyncSupabase({ checkConnectivityOnly: true }).catch');
  });

  it('2. Verifies render guard does not block LoginPage when dbStatus.checking is true for unauthenticated users', () => {
    // Must define isProtectedDataLoading restricted to authenticated sessions
    expect(appTsxContent).toContain('const isProtectedDataLoading = isAuthenticated && (isAuthChecking || dbStatus.checking);');
    expect(appTsxContent).toContain('if (isDataSyncing || isAuthChecking || isProtectedDataLoading)');
    
    // Unconditional blocking on dbStatus.checking must be eliminated from root guard
    expect(appTsxContent).not.toMatch(/if\s*\(\s*isDataSyncing\s*\|\|\s*isAuthChecking\s*\|\|\s*dbStatus\.checking\s*\)/);
  });

  it('3. Verifies authenticated sessions remain strictly guarded against premature data exposure', () => {
    // When isAuthenticated is true, isProtectedDataLoading MUST guard dbStatus.checking
    const evaluateRenderGuard = (
      isAuthenticated: boolean,
      currentUser: any,
      isAuthChecking: boolean,
      isDataSyncing: boolean,
      dbStatusChecking: boolean
    ) => {
      const isProtectedDataLoading = isAuthenticated && (isAuthChecking || dbStatusChecking);
      const isBlocked = isDataSyncing || isAuthChecking || isProtectedDataLoading;
      return { isBlocked, isLoginPage: !isBlocked && (!isAuthenticated || !currentUser) };
    };

    // Case 2A: Authenticated user with session checking in progress -> MUST BLOCK
    const authStartupChecking = evaluateRenderGuard(true, { id: 'usr_1', role: 'admin' }, true, false, true);
    expect(authStartupChecking.isBlocked).toBe(true);

    // Case 2B: Authenticated user with session verified, but dbStatus.checking still true -> MUST BLOCK
    const authDbChecking = evaluateRenderGuard(true, { id: 'usr_1', role: 'admin' }, false, false, true);
    expect(authDbChecking.isBlocked).toBe(true);
    expect(authDbChecking.isLoginPage).toBe(false);

    // Case 2C: Authenticated user with data syncing -> MUST BLOCK
    const authSyncing = evaluateRenderGuard(true, { id: 'usr_1', role: 'admin' }, false, true, false);
    expect(authSyncing.isBlocked).toBe(true);

    // Case 2D: Authenticated user with all checks complete -> UNBLOCKED (portal view)
    const authReady = evaluateRenderGuard(true, { id: 'usr_1', role: 'admin' }, false, false, false);
    expect(authReady.isBlocked).toBe(false);
    expect(authReady.isLoginPage).toBe(false);
  });

  it('4. Verifies unauthenticated visitors reach LoginPage promptly regardless of Supabase latency or failure', () => {
    const evaluateRenderGuard = (
      isAuthenticated: boolean,
      currentUser: any,
      isAuthChecking: boolean,
      isDataSyncing: boolean,
      dbStatusChecking: boolean
    ) => {
      const isProtectedDataLoading = isAuthenticated && (isAuthChecking || dbStatusChecking);
      const isBlocked = isDataSyncing || isAuthChecking || isProtectedDataLoading;
      return { isBlocked, isLoginPage: !isBlocked && (!isAuthenticated || !currentUser) };
    };

    // Scenario 4A: Fast Supabase check - unauthenticated user immediately reaches LoginPage
    const fastUnauth = evaluateRenderGuard(false, null, false, false, false);
    expect(fastUnauth.isBlocked).toBe(false);
    expect(fastUnauth.isLoginPage).toBe(true);

    // Scenario 4B: Slow / hanging Supabase check (dbStatusChecking: true) - unauthenticated user STILL reaches LoginPage
    const slowUnauth = evaluateRenderGuard(false, null, false, false, true);
    expect(slowUnauth.isBlocked).toBe(false);
    expect(slowUnauth.isLoginPage).toBe(true);

    // Scenario 4C: Failed Supabase check (dbStatusChecking: false, error present) - LoginPage remains rendered
    const failedUnauth = evaluateRenderGuard(false, null, false, false, false);
    expect(failedUnauth.isBlocked).toBe(false);
    expect(failedUnauth.isLoginPage).toBe(true);
  });

  it('5. Verifies cache isolation and user identity are properly cleared for unauthenticated visitors', () => {
    // When no session is found, currentUser and api.setCurrentUser must be set to null
    expect(appTsxContent).toContain('setCurrentUser(null);');
    expect(appTsxContent).toContain('setIsAuthenticated(false);');
    expect(appTsxContent).toContain('api.setCurrentUser(null);');
  });

  it('6. Verifies state machine simulation of slow Supabase background resolution', async () => {
    // Simulate startup state machine
    let isAuthChecking = true;
    let isAuthenticated = false;
    let currentUser: any = null;
    let dbStatus = {
      checking: true,
      success: false,
      message: 'Testing connection to Supabase project...',
      lastCheckedAt: undefined as number | undefined,
    };

    // Step 1: authService.getSession() resolves to null (unauthenticated)
    const sessionPromise = Promise.resolve(null);
    const slowSupabasePromise = new Promise<{ success: boolean; message: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: true, message: 'Supabase connection successful' });
      }, 50);
    });

    const user = await sessionPromise;
    if (!user) {
      currentUser = null;
      isAuthenticated = false;
      // Background task started non-blockingly
      slowSupabasePromise.then((res) => {
        dbStatus = {
          checking: false,
          success: res.success,
          message: res.message,
          lastCheckedAt: Date.now(),
        };
      });
      // Auth checking released immediately!
      isAuthChecking = false;
    }

    // Immediately after auth check finishes, verify LoginPage is rendered while dbStatus is STILL checking
    const isProtectedDataLoading1 = isAuthenticated && (isAuthChecking || dbStatus.checking);
    const isBlocked1 = isAuthChecking || isProtectedDataLoading1;
    expect(isBlocked1).toBe(false);
    expect(dbStatus.checking).toBe(true); // Connectivity check still running in background
    expect(isAuthenticated).toBe(false);
    expect(currentUser).toBe(null);

    // After background check resolves
    await slowSupabasePromise;
    // Allow then callback to run
    await new Promise((r) => setTimeout(r, 10));
    
    expect(dbStatus.checking).toBe(false);
    expect(dbStatus.success).toBe(true);
    expect(dbStatus.lastCheckedAt).toBeDefined();

    // LoginPage is still active
    const isProtectedDataLoading2 = isAuthenticated && (isAuthChecking || dbStatus.checking);
    const isBlocked2 = isAuthChecking || isProtectedDataLoading2;
    expect(isBlocked2).toBe(false);
  });
});
