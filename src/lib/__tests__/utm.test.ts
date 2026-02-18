import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureUTMParams, getStoredUTMParams } from '../utm';

// Create a simple sessionStorage mock backed by a Map
function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe('UTM utilities (browser environment)', () => {
  let storageMock: ReturnType<typeof createSessionStorageMock>;

  beforeEach(() => {
    storageMock = createSessionStorageMock();
    vi.stubGlobal('window', {
      location: { search: '' },
    });
    vi.stubGlobal('sessionStorage', storageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('captureUTMParams', () => {
    test('returns null when no UTM params in URL', () => {
      (window as any).location.search = '?foo=bar&page=1';
      expect(captureUTMParams()).toBeNull();
    });

    test('captures utm_source when present', () => {
      (window as any).location.search = '?utm_source=google';
      const result = captureUTMParams();
      expect(result).toEqual({ utm_source: 'google' });
    });

    test('captures all 5 UTM params', () => {
      (window as any).location.search =
        '?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=banner&utm_term=flight+school';
      const result = captureUTMParams();
      expect(result).toEqual({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'spring',
        utm_content: 'banner',
        utm_term: 'flight school',
      });
    });

    test('captures partial params (only present ones)', () => {
      (window as any).location.search = '?utm_source=facebook&utm_campaign=winter';
      const result = captureUTMParams();
      expect(result).toEqual({
        utm_source: 'facebook',
        utm_campaign: 'winter',
      });
      expect(result).not.toHaveProperty('utm_medium');
      expect(result).not.toHaveProperty('utm_content');
      expect(result).not.toHaveProperty('utm_term');
    });

    test('stores captured params in sessionStorage', () => {
      (window as any).location.search = '?utm_source=google&utm_medium=cpc';
      captureUTMParams();
      const stored = storageMock.getItem('heydpe_utm');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual({
        utm_source: 'google',
        utm_medium: 'cpc',
      });
    });

    test('ignores non-UTM query params', () => {
      (window as any).location.search = '?ref=homepage&utm_source=twitter&page=2';
      const result = captureUTMParams();
      expect(result).toEqual({ utm_source: 'twitter' });
      expect(result).not.toHaveProperty('ref');
      expect(result).not.toHaveProperty('page');
    });

    test('returns null for empty search string', () => {
      (window as any).location.search = '';
      expect(captureUTMParams()).toBeNull();
    });
  });

  describe('getStoredUTMParams', () => {
    test('returns null when nothing stored', () => {
      expect(getStoredUTMParams()).toBeNull();
    });

    test('returns parsed object when valid data exists', () => {
      storageMock.setItem('heydpe_utm', JSON.stringify({ utm_source: 'bing', utm_campaign: 'fall' }));
      const result = getStoredUTMParams();
      expect(result).toEqual({ utm_source: 'bing', utm_campaign: 'fall' });
    });

    test('returns null for corrupt JSON', () => {
      storageMock.setItem('heydpe_utm', '{not valid json!!!');
      expect(getStoredUTMParams()).toBeNull();
    });
  });
});

describe('UTM utilities (SSR / no window)', () => {
  beforeEach(() => {
    // In node environment, window is not defined by default.
    // Ensure it is truly absent for these tests.
    vi.unstubAllGlobals();
  });

  test('captureUTMParams returns null when window is undefined', () => {
    expect(captureUTMParams()).toBeNull();
  });

  test('getStoredUTMParams returns null when window is undefined', () => {
    expect(getStoredUTMParams()).toBeNull();
  });
});
