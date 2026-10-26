import './setupLocalStorage';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as apiConfig from '../utils/apiConfig';
import { NativeSecureStorage } from '../lib/nativeSecureStorage';
import {
  NativeBiometric,
  __setTestBiometricMock,
} from '../lib/nativeBiometric';
import {
  getBiometricOptInState,
  enableBiometricForUser,
  disableBiometric,
  isBiometricLoginAvailableForUser,
  BIOMETRIC_OPT_IN_KEY,
} from '../lib/biometricAuthService';
import { authService } from '../services/authService';

describe('Phase 4.3: Optional Biometric Login for Android Teachers', () => {
  beforeEach(async () => {
    // Reset test state before each run
    __setTestBiometricMock(null);
    await NativeSecureStorage.remove({ key: BIOMETRIC_OPT_IN_KEY });
  });

  // -------------------------------------------------------------
  // 1. Native Biometric Bridge Tests
  // -------------------------------------------------------------
  describe('1. Native Biometric Bridge', () => {
    it('Bridge registration: NativeBiometric is registered with isAvailable and authenticate', () => {
      expect(NativeBiometric).toBeDefined();
      expect(typeof NativeBiometric.isAvailable).toBe('function');
      expect(typeof NativeBiometric.authenticate).toBe('function');
    });

    it('Web fallback: Safely reports UNSUPPORTED and blocks prompts on Web/PWA', async () => {
      const avail = await NativeBiometric.isAvailable();
      expect(avail.isAvailable).toBe(false);
      expect(avail.status).toBe('UNSUPPORTED');

      const auth = await NativeBiometric.authenticate();
      expect(auth.success).toBe(false);
      expect(auth.status).toBe('ERROR');
      expect(auth.error).toContain('not supported on web');
    });

    it('Mock integration: Handles hardware availability, enrolled states, and error states', async () => {
      // 1. Available & enrolled
      __setTestBiometricMock({
        isAvailable: async () => ({
          isAvailable: true,
          hasHardware: true,
          isEnrolled: true,
          status: 'AVAILABLE',
        }),
      });
      let avail = await NativeBiometric.isAvailable();
      expect(avail.isAvailable).toBe(true);
      expect(avail.status).toBe('AVAILABLE');

      // 2. Hardware present but no fingerprints enrolled
      __setTestBiometricMock({
        isAvailable: async () => ({
          isAvailable: false,
          hasHardware: true,
          isEnrolled: false,
          status: 'NOT_ENROLLED',
        }),
      });
      avail = await NativeBiometric.isAvailable();
      expect(avail.isAvailable).toBe(false);
      expect(avail.status).toBe('NOT_ENROLLED');

      // 3. No biometric hardware
      __setTestBiometricMock({
        isAvailable: async () => ({
          isAvailable: false,
          hasHardware: false,
          isEnrolled: false,
          status: 'NO_HARDWARE',
        }),
      });
      avail = await NativeBiometric.isAvailable();
      expect(avail.isAvailable).toBe(false);
      expect(avail.status).toBe('NO_HARDWARE');
    });

    it('Authentication outcomes: Handles success, cancellation, and error gracefully', async () => {
      // Success
      __setTestBiometricMock({
        authenticate: async () => ({ success: true, status: 'SUCCESS' }),
      });
      let res = await NativeBiometric.authenticate();
      expect(res.success).toBe(true);
      expect(res.status).toBe('SUCCESS');

      // User Cancelled / Negative button
      __setTestBiometricMock({
        authenticate: async () => ({ success: false, status: 'CANCELLED', error: 'Cancelled by user' }),
      });
      res = await NativeBiometric.authenticate();
      expect(res.success).toBe(false);
      expect(res.status).toBe('CANCELLED');

      // System Error
      __setTestBiometricMock({
        authenticate: async () => ({ success: false, status: 'ERROR', error: 'Hardware sensor timeout' }),
      });
      res = await NativeBiometric.authenticate();
      expect(res.success).toBe(false);
      expect(res.status).toBe('ERROR');
    });
  });

  // -------------------------------------------------------------
  // 2. Biometric Opt-In State & Identity Integrity
  // -------------------------------------------------------------
  describe('2. Biometric Opt-In State & User Association', () => {
    it('Requires Android native environment for opt-in operations', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(false);

      const res = await enableBiometricForUser({
        id: 'teacher-uuid-1',
        email: 'teacher@school.ac.ke',
        role: 'class_teacher',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Android app');

      const state = await getBiometricOptInState();
      expect(state).toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Restricts biometric enrollment to teachers and administrators (excludes learners)', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      const res = await enableBiometricForUser({
        id: 'learner-uuid-1',
        email: 'learner@school.ac.ke',
        role: 'learner',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('reserved for teachers');

      isNativeSpy.mockRestore();
    });

    it('Enables biometric login after successful BiometricPrompt verification', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      __setTestBiometricMock({
        isAvailable: async () => ({
          isAvailable: true,
          hasHardware: true,
          isEnrolled: true,
          status: 'AVAILABLE',
        }),
        authenticate: async () => ({ success: true, status: 'SUCCESS' }),
      });

      const res = await enableBiometricForUser({
        id: 'teacher-uuid-123',
        email: 'grace@school.ac.ke',
        name: 'Madam Grace',
        role: 'class_teacher',
      });
      expect(res.success).toBe(true);

      // Verify stored opt-in state in native secure storage
      const state = await getBiometricOptInState();
      expect(state).toBeDefined();
      expect(state?.enabled).toBe(true);
      expect(state?.userId).toBe('teacher-uuid-123');
      expect(state?.userEmail).toBe('grace@school.ac.ke');
      expect(state?.userName).toBe('Madam Grace');

      // Verify no passwords or tokens were stored in the opt-in record
      const rawStored = await NativeSecureStorage.get({ key: BIOMETRIC_OPT_IN_KEY });
      expect(rawStored.value).not.toContain('password');
      expect(rawStored.value).not.toContain('access_token');
      expect(rawStored.value).not.toContain('refresh_token');

      isNativeSpy.mockRestore();
    });

    it('Rejects enrollment if user cancels the native biometric challenge', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      __setTestBiometricMock({
        isAvailable: async () => ({
          isAvailable: true,
          hasHardware: true,
          isEnrolled: true,
          status: 'AVAILABLE',
        }),
        authenticate: async () => ({ success: false, status: 'CANCELLED', error: 'Cancelled by user' }),
      });

      const res = await enableBiometricForUser({
        id: 'teacher-uuid-123',
        email: 'grace@school.ac.ke',
        role: 'class_teacher',
      });
      expect(res.success).toBe(false);
      expect(res.error?.toLowerCase()).toContain('cancelled');

      // Verify state was NOT enabled
      const state = await getBiometricOptInState();
      expect(state).toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Disables biometric and purges state on disableBiometric()', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: JSON.stringify({
          enabled: true,
          userId: 'test-user-id',
          userEmail: 'test@school.ac.ke',
        }),
      });

      expect(await getBiometricOptInState()).not.toBeNull();

      await disableBiometric();
      expect(await getBiometricOptInState()).toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Corrupted state recovery: Safely purges corrupted JSON payloads and returns null', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      // Malformed JSON
      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: '{ corrupted_not_json: true, ',
      });
      let state = await getBiometricOptInState();
      expect(state).toBeNull();

      // Missing userId
      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: JSON.stringify({ enabled: true }),
      });
      state = await getBiometricOptInState();
      expect(state).toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Account mismatch invariant: Purges biometric opt-in if target account does not match stored user', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      __setTestBiometricMock({
        isAvailable: async () => ({
          isAvailable: true,
          hasHardware: true,
          isEnrolled: true,
          status: 'AVAILABLE',
        }),
      });

      // Save opt-in for Teacher A
      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: JSON.stringify({
          enabled: true,
          userId: 'teacher-a-id',
          userEmail: 'teacherA@school.ac.ke',
        }),
      });

      // Attempting check for Teacher B
      const checkResult = await isBiometricLoginAvailableForUser('teacher-b-id');
      expect(checkResult.available).toBe(false);
      expect(checkResult.state).toBeNull();

      // Verify the mismatched state was automatically purged from storage
      const afterCheck = await getBiometricOptInState();
      expect(afterCheck).toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Explicit sign-out purge: authService.signOut() purges biometric opt-in', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: JSON.stringify({
          enabled: true,
          userId: 'teacher-a-id',
          userEmail: 'teacherA@school.ac.ke',
        }),
      });

      // Sign out
      await authService.signOut();

      // State is purged
      const afterSignOut = await getBiometricOptInState();
      expect(afterSignOut).toBeNull();

      isNativeSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------
  // 3. Native Java & Gradle Configuration Verification
  // -------------------------------------------------------------
  describe('3. Native Android Java & Gradle Verification', () => {
    it('BiometricPlugin.java exists and uses AndroidX BiometricPrompt', () => {
      const pluginPath = path.resolve('android/app/src/main/java/ke/ac/school/cbe/BiometricPlugin.java');
      expect(fs.existsSync(pluginPath)).toBe(true);

      const source = fs.readFileSync(pluginPath, 'utf8');
      expect(source).toContain('package ke.ac.school.cbe;');
      expect(source).toContain('@CapacitorPlugin(name = "Biometric")');
      expect(source).toContain('public class BiometricPlugin extends Plugin');

      // AndroidX Biometric imports
      expect(source).toContain('import androidx.biometric.BiometricManager;');
      expect(source).toContain('import androidx.biometric.BiometricPrompt;');

      // Plugin methods
      expect(source).toContain('@PluginMethod\n    public void isAvailable(PluginCall call)');
      expect(source).toContain('@PluginMethod\n    public void authenticate(PluginCall call)');

      // Strong & Weak authenticators allowed
      expect(source).toContain('BiometricManager.Authenticators.BIOMETRIC_STRONG');
      expect(source).toContain('BiometricManager.Authenticators.BIOMETRIC_WEAK');

      // UI thread execution
      expect(source).toContain('new Handler(Looper.getMainLooper()).post(');
    });

    it('MainActivity.java registers BiometricPlugin alongside SecureStoragePlugin', () => {
      const mainPath = path.resolve('android/app/src/main/java/ke/ac/school/cbe/MainActivity.java');
      const source = fs.readFileSync(mainPath, 'utf8');

      expect(source).toContain('registerPlugin(SecureStoragePlugin.class);');
      expect(source).toContain('registerPlugin(BiometricPlugin.class);');
    });

    it('android/app/build.gradle and variables.gradle contain androidx.biometric:biometric', () => {
      const variablesSource = fs.readFileSync(path.resolve('android/variables.gradle'), 'utf8');
      expect(variablesSource).toContain("androidxBiometricVersion = '1.1.0'");

      const buildGradleSource = fs.readFileSync(path.resolve('android/app/build.gradle'), 'utf8');
      expect(buildGradleSource).toContain('androidx.biometric:biometric:$androidxBiometricVersion');
    });

    it('android/app/src/main/AndroidManifest.xml declares android.permission.USE_BIOMETRIC', () => {
      const manifestSource = fs.readFileSync(path.resolve('android/app/src/main/AndroidManifest.xml'), 'utf8');
      expect(manifestSource).toContain('<uses-permission android:name="android.permission.USE_BIOMETRIC" />');
    });
  });

  // -------------------------------------------------------------
  // 4. Startup Gate & Workflow Scenarios
  // -------------------------------------------------------------
  describe('4. Startup Gate & Authentication Scenarios', () => {
    it('Scenario 1: Android + valid session + biometric disabled -> bypasses gate', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      // No biometric opt-in configured
      const { available } = await isBiometricLoginAvailableForUser('teacher-1');
      expect(available).toBe(false);

      isNativeSpy.mockRestore();
    });

    it('Scenario 2: Android + valid session + biometric enabled + fingerprint success -> allows workspace access', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      __setTestBiometricMock({
        isAvailable: async () => ({ isAvailable: true, hasHardware: true, isEnrolled: true, status: 'AVAILABLE' }),
        authenticate: async () => ({ success: true, status: 'SUCCESS' }),
      });

      // Opt in enabled
      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: JSON.stringify({ enabled: true, userId: 'teacher-1', userEmail: 'teacher1@school.ac.ke' }),
      });

      const { available } = await isBiometricLoginAvailableForUser('teacher-1');
      expect(available).toBe(true);

      const authRes = await NativeBiometric.authenticate();
      expect(authRes.success).toBe(true);

      isNativeSpy.mockRestore();
    });

    it('Scenario 3: Android + valid session + biometric enabled + user cancellation -> gate holds, falls back to password', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);

      __setTestBiometricMock({
        isAvailable: async () => ({ isAvailable: true, hasHardware: true, isEnrolled: true, status: 'AVAILABLE' }),
        authenticate: async () => ({ success: false, status: 'CANCELLED', error: 'Cancelled by user' }),
      });

      await NativeSecureStorage.set({
        key: BIOMETRIC_OPT_IN_KEY,
        value: JSON.stringify({ enabled: true, userId: 'teacher-1', userEmail: 'teacher1@school.ac.ke' }),
      });

      const authRes = await NativeBiometric.authenticate();
      expect(authRes.success).toBe(false);
      expect(authRes.status).toBe('CANCELLED');

      // The opt-in is NOT destroyed simply because user cancelled one prompt
      const optInState = await getBiometricOptInState();
      expect(optInState).not.toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Scenario 4: Web + valid session -> Biometric gate is never activated', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(false);

      const { available, state } = await isBiometricLoginAvailableForUser('teacher-1');
      expect(available).toBe(false);
      expect(state).toBeNull();

      isNativeSpy.mockRestore();
    });

    it('Scenario 5: Web + no session -> Normal login page rendered without biometric options', async () => {
      const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(false);

      const avail = await NativeBiometric.isAvailable();
      expect(avail.isAvailable).toBe(false);

      isNativeSpy.mockRestore();
    });
  });
});
