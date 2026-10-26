import { NativeSecureStorage } from './nativeSecureStorage';

export interface SupportedStorage {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

/**
 * Creates an asynchronous SupportedStorage adapter for Supabase Auth on native Android.
 *
 * Interacts with NativeSecureStorage (hardware-backed AndroidKeyStore with AES-256-GCM).
 *
 * Implements one-time atomic migration from legacy WebView localStorage:
 * If an existing valid session is found in localStorage on initial read, it is migrated into
 * hardware-backed native secure storage and immediately removed from localStorage.
 *
 * This ensures there is strictly ONE authoritative session store on Android without duplicate copies.
 */
export function createSecureStorageAdapter(): SupportedStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        const res = await NativeSecureStorage.get({ key });
        if (res && res.value !== null && res.value !== undefined) {
          return res.value;
        }

        // One-time migration: Check if legacy unencrypted session exists in WebView localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
          const legacyValue = window.localStorage.getItem(key);
          if (legacyValue) {
            // Write to native secure storage
            await NativeSecureStorage.set({ key, value: legacyValue });
            // Immediately purge from localStorage to prevent duplicate stores
            window.localStorage.removeItem(key);
            return legacyValue;
          }
        }
        return null;
      } catch (err) {
        console.warn('secureStorageAdapter.getItem error:', err);
        return null;
      }
    },

    async setItem(key: string, value: string): Promise<void> {
      try {
        await NativeSecureStorage.set({ key, value });
        // Guarantee no stale duplicate persists in localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch (err) {
        console.error('secureStorageAdapter.setItem error:', err);
      }
    },

    async removeItem(key: string): Promise<void> {
      try {
        await NativeSecureStorage.remove({ key });
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch (err) {
        console.error('secureStorageAdapter.removeItem error:', err);
      }
    },
  };
}
