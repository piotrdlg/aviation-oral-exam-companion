import { beforeEach, describe, expect, it, vi } from 'vitest';

const { items, get } = vi.hoisted(() => ({ items: new Map<string, string>(), get: vi.fn() }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: get,
  setItemAsync: vi.fn(async (key: string, value: string) => { items.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { items.delete(key); }),
}));

beforeEach(() => {
  vi.resetModules();
  items.clear();
  get.mockImplementation(async (key: string) => items.get(key) ?? null);
});

describe('Keychain-backed sessions', () => {
  it.each(['', 'small session', 'x'.repeat(8000)])('round-trips a session of length %s', async (value) => {
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    await storage.setItem('session', value);
    expect(await storage.getItem('session')).toBe(value);
  });
  it('removes all chunks on sign-out', async () => {
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    await storage.setItem('session', 'x'.repeat(7000));
    await storage.removeItem('session');
    expect(items.size).toBe(0);
  });
  it('cleans obsolete chunks when tokens shrink', async () => {
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    await storage.setItem('session', 'x'.repeat(7000));
    await storage.setItem('session', 'short');
    expect([...items.keys()].sort()).toEqual(['session', 'session.0']);
  });
  it('treats incomplete sessions as absent', async () => {
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    items.set('session', '2');
    items.set('session.0', 'partial');
    expect(await storage.getItem('session')).toBeNull();
  });
  it('reads legacy unchunked JSON', async () => {
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    items.set('session', '{"access_token":"test"}');
    expect(await storage.getItem('session')).toBe('{"access_token":"test"}');
  });
  it('does not silently fall back to memory in a release build', async () => {
    get.mockRejectedValue(new Error('Keychain unavailable'));
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    await expect(storage.setItem('session', 'token')).rejects.toThrow('Keychain unavailable');
  });
  it('keeps Unicode session metadata under the Keychain byte limit', async () => {
    const { SecureStorageAdapter: storage } = await import('../secure-storage');
    const text = '\u{1f600}\u65e5\u672c\u8a9e'.repeat(500);
    await storage.setItem('session', text);
    expect(await storage.getItem('session')).toBe(text);
    for (const [key, value] of items) if (key.startsWith('session.')) expect(Buffer.byteLength(value, 'utf8')).toBeLessThanOrEqual(1800);
  });
});
