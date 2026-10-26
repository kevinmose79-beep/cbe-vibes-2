import { registerPlugin } from '@capacitor/core';

export interface BiometricAvailability {
  isAvailable: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  status: 'AVAILABLE' | 'NO_HARDWARE' | 'HARDWARE_UNAVAILABLE' | 'NOT_ENROLLED' | 'UNSUPPORTED';
  error?: string;
}

export interface BiometricAuthResult {
  success: boolean;
  status: 'SUCCESS' | 'CANCELLED' | 'FAILED' | 'ERROR';
  error?: string;
}

export interface BiometricAuthOptions {
  title?: string;
  subtitle?: string;
  negativeButtonText?: string;
}

export interface NativeBiometricPlugin {
  isAvailable(): Promise<BiometricAvailability>;
  authenticate(options?: BiometricAuthOptions): Promise<BiometricAuthResult>;
}

// In-memory test mock state for automated Vitest test harnesses
let testMockHandler: {
  isAvailable?: () => Promise<BiometricAvailability>;
  authenticate?: (options?: BiometricAuthOptions) => Promise<BiometricAuthResult>;
} | null = null;

export function __setTestBiometricMock(handler: typeof testMockHandler) {
  testMockHandler = handler;
}

/**
 * Direct typed bridge to native Android BiometricPlugin (AndroidX BiometricPrompt).
 *
 * On Android: prompts via system BiometricPrompt modal.
 * On Web/PWA: safely reports UNSUPPORTED and does not display biometric prompts.
 */
export const NativeBiometric = registerPlugin<NativeBiometricPlugin>('Biometric', {
  web: {
    async isAvailable(): Promise<BiometricAvailability> {
      if (testMockHandler?.isAvailable) {
        return testMockHandler.isAvailable();
      }
      return {
        isAvailable: false,
        hasHardware: false,
        isEnrolled: false,
        status: 'UNSUPPORTED',
      };
    },
    async authenticate(options?: BiometricAuthOptions): Promise<BiometricAuthResult> {
      if (testMockHandler?.authenticate) {
        return testMockHandler.authenticate(options);
      }
      return {
        success: false,
        status: 'ERROR',
        error: 'Biometric authentication is not supported on web',
      };
    },
  },
});
