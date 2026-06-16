import * as SecureStore from 'expo-secure-store';

/**
 * Supabase storage adapter backed by the device Keychain/Keystore via
 * expo-secure-store. SecureStore caps a single value at ~2 KB, but Supabase
 * session blobs exceed that — so large values are transparently chunked across
 * indexed keys (`<key>.0`, `<key>.1`, …) with a count stored under `<key>`.
 * The session therefore lives encrypted at rest, not in plaintext AsyncStorage.
 */
const CHUNK_SIZE = 1800;

const part = (key: string, i: number) => `${key}.${i}`;

export const SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
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
    const count = Number(await SecureStore.getItemAsync(key));
    if (Number.isInteger(count)) {
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(part(key, i));
    }
    await SecureStore.deleteItemAsync(key);
  },
};
