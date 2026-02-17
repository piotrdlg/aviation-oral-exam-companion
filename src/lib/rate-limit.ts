/**
 * In-memory sliding window rate limiter.
 *
 * Suitable for single-region Vercel deployment. For production scale with
 * multiple regions, migrate to Upstash Redis.
 *
 * NOTE: In-memory state resets on Lambda cold starts. This is acceptable for
 * abuse prevention but should not be relied upon for billing enforcement.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Maximum number of requests allowed */
  limit: number;
  /** Unix timestamp (ms) when the rate limit resets */
  resetAt: number;
}

/**
 * Route-specific rate limit configurations.
 *
 * Keys match route path patterns. Per-user limits use the authenticated user ID;
 * per-IP limits use the request IP address.
 */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig & { keyType: 'user' | 'ip' }> = {
  '/api/exam': { limit: 20, windowMs: 60_000, keyType: 'user' },
  '/api/tts': { limit: 30, windowMs: 60_000, keyType: 'user' },
  '/api/stt/token': { limit: 4, windowMs: 60_000, keyType: 'user' },
  '/api/stripe/webhook': { limit: 100, windowMs: 60_000, keyType: 'ip' },
  '/api/stripe/checkout': { limit: 5, windowMs: 60_000, keyType: 'user' },
  '/api/report': { limit: 10, windowMs: 60_000, keyType: 'user' },
  '/api/admin': { limit: 60, windowMs: 60_000, keyType: 'user' },
};

// Global in-memory store. Entries are keyed by `route:identifier`.
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup interval (every 5 minutes)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    // Find the max window across all configs to determine stale threshold
    const maxWindow = Math.max(...Object.values(RATE_LIMIT_CONFIGS).map((c) => c.windowMs));
    const threshold = now - maxWindow * 2;

    for (const [key, entry] of store.entries()) {
      // Remove entries where all timestamps are older than 2x the max window
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < threshold) {
        store.delete(key);
      }
    }
  }, 5 * 60_000);

  // Don't prevent process exit
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Check and consume a rate limit token for the given route and identifier.
 *
 * @param route - The API route path (e.g., '/api/exam')
 * @param identifier - User ID or IP address
 * @returns Rate limit result
 */
export function checkRateLimit(route: string, identifier: string): RateLimitResult {
  // Find matching config — check exact match first, then prefix match for /api/admin/*
  let config = RATE_LIMIT_CONFIGS[route];
  let matchedPattern = route;
  if (!config) {
    // Check prefix matches (e.g., /api/admin/users matches /api/admin)
    for (const [pattern, cfg] of Object.entries(RATE_LIMIT_CONFIGS)) {
      if (route.startsWith(pattern)) {
        config = cfg;
        matchedPattern = pattern;
        break;
      }
    }
  }

  if (!config) {
    // No rate limit configured for this route
    return { allowed: true, remaining: Infinity, limit: Infinity, resetAt: 0 };
  }

  startCleanup();

  // Use the matched config pattern (not the full dynamic path) as the bucket key
  // so /api/admin/users/abc and /api/admin/users/xyz share one bucket per user
  const key = `${matchedPattern}:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove expired timestamps (outside the sliding window)
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  // Check limit
  if (entry.timestamps.length >= config.limit) {
    // Rate limited — calculate when the oldest request in the window expires
    const oldestInWindow = entry.timestamps[0];
    const resetAt = oldestInWindow + config.windowMs;

    return {
      allowed: false,
      remaining: 0,
      limit: config.limit,
      resetAt,
    };
  }

  // Allow and record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
    limit: config.limit,
    resetAt: now + config.windowMs,
  };
}

/**
 * Get the rate limit configuration for a route, if any.
 * Useful for determining whether to use user ID or IP as the identifier.
 */
export function getRateLimitConfig(route: string): (RateLimitConfig & { keyType: 'user' | 'ip' }) | null {
  const exact = RATE_LIMIT_CONFIGS[route];
  if (exact) return exact;

  for (const [pattern, cfg] of Object.entries(RATE_LIMIT_CONFIGS)) {
    if (route.startsWith(pattern)) {
      return cfg;
    }
  }

  return null;
}

/**
 * Reset the rate limit store. Primarily used for testing.
 */
export function resetRateLimitStore(): void {
  store.clear();
}
