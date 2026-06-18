import * as SecureStore from 'expo-secure-store';

/**
 * Supabase storage adapter backed by the device Keychain/Keystore via
 * expo-secure-store. SecureStore caps a single value at ~2 KB, but Supabase
 * session blobs exceed that — so large values are transparently chunked across
 * indexed keys (`<key>.0`, `<key>.1`, …) with a count stored under `<key>`.
 * The session therefore lives encrypted at rest, not in plaintext AsyncStorage.
 *
 * Fallback: when the Keychain is unavailable (e.g. an unsigned simulator dev
 * build lacks the keychain-access-group entitlement — SecureStore throws "a
 * required entitlement isn't present"), we degrade to an in-memory store so the
 * app stays usable. The session then doesn't survive a cold restart in that
 * environment, but real device/TestFlight/App Store builds are properly signed
 * and use the Keychain. The fallback is logged once in dev.
 */
const CHUNK_SIZE = 1800;

const part = (key: string, i: number) => `${key}.${i}`;

// null = unprobed; true = Keychain works; false = use the in-memory fallback.
let keychainOk: boolean | null = null;
const memory = new Map<string, string>();

async function useKeychain(): Promise<boolean> {
  if (keychainOk === null) {
    try {
      await SecureStore.getItemAsync('__heydpe_probe__');
      keychainOk = true;
    } catch {
      keychainOk = false;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[secure-storage] Keychain unavailable — using in-memory session store (dev/simulator only; production device builds use the Keychain).'
        );
      }
    }
  }
  return keychainOk;
}

export const SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (!(await useKeychain())) return memory.get(key) ?? null;
    const head = await SecureStore.getItemAsync(key);
    if (head == null) return null;
    const count = Number(head);
    if (!Number.isInteger(count) || count <= 0) return head; // legacy single small value
    let out = '';
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(part(key, i));
      if (chunk == null) return null; // partial write — treat as absent
      out += chunk;
    }
    return out;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!(await useKeychain())) {
      memory.set(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE) || 1;
    const prev = Number(await SecureStore.getItemAsync(key));
    if (Number.isInteger(prev)) {
      for (let i = count; i < prev; i++) await SecureStore.deleteItemAsync(part(key, i));
    }
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(part(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(key, String(count));
  },

  async removeItem(key: string): Promise<void> {
    if (!(await useKeychain())) {
      memory.delete(key);
      return;
    }
    const count = Number(await SecureStore.getItemAsync(key));
    if (Number.isInteger(count)) {
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(part(key, i));
    }
    await SecureStore.deleteItemAsync(key);
  },
};
