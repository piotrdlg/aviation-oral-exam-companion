import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache } from '../ttl-cache';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after default TTL', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');

    vi.advanceTimersByTime(999);
    expect(cache.get('key')).toBe('value');

    vi.advanceTimersByTime(2);
    expect(cache.get('key')).toBeUndefined();
  });

  it('supports custom TTL per entry', () => {
    const cache = new TtlCache<string>(10_000);
    cache.set('short', 'val', 500);
    cache.set('long', 'val', 5000);

    vi.advanceTimersByTime(600);
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('val');
  });

  it('delete() removes an entry', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('key', 'value');
    cache.delete('key');
    expect(cache.get('key')).toBeUndefined();
  });

  it('clear() removes all entries', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('reports correct size', () => {
    const cache = new TtlCache<number>(1000);
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });

  it('overwrites existing keys', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('key', 'old');
    cache.set('key', 'new');
    expect(cache.get('key')).toBe('new');
    expect(cache.size).toBe(1);
  });

  it('cleans up expired entries on get()', () => {
    const cache = new TtlCache<string>(100);
    cache.set('key', 'value');
    vi.advanceTimersByTime(200);
    // The internal store still has the entry until get() cleans it
    expect(cache.get('key')).toBeUndefined();
  });
});
