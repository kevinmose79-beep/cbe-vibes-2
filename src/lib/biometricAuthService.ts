import { isNativeEnvironment } from '../utils/apiConfig';
import { NativeSecureStorage } from './nativeSecureStorage';
import { NativeBiometric, BiometricAvailability } from './nativeBiometric';

export const BIOMETRIC_OPT_IN_KEY = 'cbe_biometric_enabled';

export interface BiometricOptInState {
  enabled: boolean;
  userId: string;
  userEmail: string;
  userName?: string;
  enrolledAt: string;
}

/**
 * Reads the local device biometric opt-in record from native secure storage.
 * Safely handles missing, invalid, or corrupted records by purging them.
 */
export async function getBiometricOptInState(): Promise<BiometricOptInState | null> {
  if (!isNativeEnvironment()) {
    return null;
  }

  try {
    const res = await NativeSecureStorage.get({ key: BIOMETRIC_OPT_IN_KEY });
    if (!res || !res.value) {
      return null;
    }

    const parsed = JSON.parse(res.value);
    if (!parsed || parsed.enabled !== true || !parsed.userId || typeof parsed.userId !== 'string') {
      // Corrupted or malformed state: purge immediately
      await NativeSecureStorage.remove({ key: BIOMETRIC_OPT_IN_KEY });
      return null;
    }

    return {
      enabled: true,
      userId: parsed.userId,
      userEmail: parsed.userEmail || '',
      userName: parsed.userName || '',
      enrolledAt: parsed.enrolledAt || '',
    };
  } catch (err) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
      console.warn('Error reading biometric opt-in state:', err);
    }
    try {
      await NativeSecureStorage.remove({ key: BIOMETRIC_OPT_IN_KEY });
    } catch {
      // Ignore cleanup error
    }
    return null;
  }
}

/**
 * Enables biometric login for an authenticated teacher/admin on this device.
 * Triggers native BiometricPrompt to verify fingerprint possession before saving.
 */
export async function enableBiometricForUser(user: {
  id: string;
  email: string;
  name?: string;
  role?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isNativeEnvironment()) {
    return { success: false, error: 'Fingerprint authentication is only available on the Android app.' };
  }

  // Learner accounts are excluded from biometric enrollment
  if (user.role === 'learner') {
    return { success: false, error: 'Fingerprint authentication is reserved for teachers and administrators.' };
  }

  try {
    const availability: BiometricAvailability = await NativeBiometric.isAvailable();
    if (!availability.isAvailable) {
      if (availability.status === 'NOT_ENROLLED') {
        return {
          success: false,
          error: 'No fingerprints enrolled on this Android device. Please set up a fingerprint in Android Settings first.',
        };
      }
      return {
        success: false,
        error: 'Biometric hardware is currently unavailable on this device.',
      };
    }

    const authRes = await NativeBiometric.authenticate({
      title: 'Enable Fingerprint Sign In',
      subtitle: `Verify fingerprint to activate quick sign-in for ${user.name || user.email}`,
      negativeButtonText: 'Cancel',
    });

    if (!authRes.success) {
      return {
        success: false,
        error: authRes.error || 'Fingerprint verification was cancelled or unrecognised.',
      };
    }

    const optInPayload: BiometricOptInState = {
      enabled: true,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      enrolledAt: new Date().toISOString(),
    };

    await NativeSecureStorage.set({
      key: BIOMETRIC_OPT_IN_KEY,
      value: JSON.stringify(optInPayload),
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to enable biometric authentication:', err);
    return {
      success: false,
      error: err?.message || 'An unexpected error occurred while enabling fingerprint authentication.',
    };
  }
}

/**
 * Disables biometric login and removes the device-local opt-in record.
 */
export async function disableBiometric(): Promise<void> {
  if (!isNativeEnvironment()) {
    return;
  }
  try {
    await NativeSecureStorage.remove({ key: BIOMETRIC_OPT_IN_KEY });
  } catch (err) {
    console.warn('Error clearing biometric opt-in state:', err);
  }
}

/**
 * Checks whether biometric login is available and configured for the current session or a target user.
 * Enforces strict user identity checking: invalidates opt-in if an account mismatch is detected.
 */
export async function isBiometricLoginAvailableForUser(
  targetUserId?: string
): Promise<{ available: boolean; state: BiometricOptInState | null }> {
  if (!isNativeEnvironment()) {
    return { available: false, state: null };
  }

  try {
    const availability = await NativeBiometric.isAvailable();
    if (!availability.isAvailable) {
      return { available: false, state: null };
    }

    const state = await getBiometricOptInState();
    if (!state || !state.enabled) {
      return { available: false, state: null };
    }

    if (targetUserId && state.userId !== targetUserId) {
      // Stored biometric account does not match target user.
      // Purge stale association to prevent cross-account privilege leakage.
      await disableBiometric();
      return { available: false, state: null };
    }

    return { available: true, state };
  } catch (err) {
    console.warn('Error verifying biometric login availability:', err);
    return { available: false, state: null };
  }
}
