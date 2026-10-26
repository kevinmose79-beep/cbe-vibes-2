import { registerPlugin } from '@capacitor/core';

export interface NativeSecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<{ value: boolean }>;
  remove(options: { key: string }): Promise<{ value: boolean }>;
}

// In-memory web fallback strictly for non-native development and test harnesses
const webMemoryStore = new Map<string, string>();

/**
 * Direct typed bridge to the local native Android Keystore SecureStoragePlugin.
 *
 * On native Android: routes calls across the Capacitor bridge to SecureStoragePlugin.java.
 * On web/test: uses isolated in-memory store so unit tests run cleanly without native bindings.
 */
export const NativeSecureStorage = registerPlugin<NativeSecureStoragePlugin>('SecureStorage', {
  web: {
    async get(options: { key: string }) {
      const val = webMemoryStore.has(options.key) ? webMemoryStore.get(options.key)! : null;
      return { value: val };
    },
    async set(options: { key: string; value: string }) {
      webMemoryStore.set(options.key, options.value);
      return { value: true };
    },
    async remove(options: { key: string }) {
      webMemoryStore.delete(options.key);
      return { value: true };
    },
  },
});
