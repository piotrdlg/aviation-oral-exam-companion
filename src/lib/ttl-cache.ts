/**
 * Serverless-safe in-memory TTL cache.
 *
 * Each Vercel serverless invocation has its own isolated module scope.
 * Warm invocations reuse cached values (saving DB round-trips);
 * cold starts begin with an empty cache.
 *
 * Correctness never depends on this cache — it is a performance hint only.
 * All consumers fall through to DB/API when the cache misses or expires.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Date.now() + ttlMs
}

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(
    /** Default time-to-live in milliseconds. */
    private readonly defaultTtlMs: number
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /** Remove a specific key. */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Number of entries (including expired but not yet evicted). */
  get size(): number {
    return this.store.size;
  }
}
