/**
 * Distributed sliding window rate limiter with Upstash Redis fallback.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured:
 * - Uses Upstash Redis for distributed rate limiting (works across Vercel instances)
 * - Suitable for production serverless deployments
 *
 * When Redis env vars are missing:
 * - Falls back to in-memory limiter (with console.warn)
 * - Suitable for local development and testing
 * - Per-instance state resets on Lambda cold starts
 *
 * NOTE: The owner must create a free Upstash database and set env vars in Vercel
 * for this to provide protection; until then behavior is unchanged with a warning.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

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
  '/api/user/export': { limit: 1, windowMs: 3_600_000, keyType: 'user' },
  '/api/admin': { limit: 60, windowMs: 60_000, keyType: 'user' },
};

// Fallback in-memory store when Redis is unavailable
const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup interval for memory store
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Initialize Upstash client if Redis env vars are configured
let redisClient: Redis | null = null;
let hasWarnedAboutMissingRedis = false;

function initRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!hasWarnedAboutMissingRedis && typeof process !== 'undefined') {
      hasWarnedAboutMissingRedis = true;
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured. ' +
        'Using in-memory fallback (ineffective across Lambda instances). ' +
        'See docs/SECURITY-FIX-W1.4.md for setup instructions.'
      );
    }
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch (err) {
    console.error('[rate-limit] Failed to initialize Redis client:', err);
    return null;
  }
}

function startMemoryCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const maxWindow = Math.max(...Object.values(RATE_LIMIT_CONFIGS).map((c) => c.windowMs));
    const threshold = now - maxWindow * 2;

    for (const [key, entry] of memoryStore.entries()) {
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < threshold) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60_000);

  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Check and consume a rate limit token using Redis if available, otherwise in-memory.
 *
 * @param route - The API route path (e.g., '/api/exam')
 * @param identifier - User ID or IP address
 * @returns Rate limit result
 */
export async function checkRateLimit(route: string, identifier: string): Promise<RateLimitResult> {
  // Find matching config
  let config = RATE_LIMIT_CONFIGS[route];
  let matchedPattern = route;
  if (!config) {
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

  const key = `${matchedPattern}:${identifier}`;

  // Try Redis first if configured
  const redis = initRedisClient();
  if (redis) {
    return checkRateLimitRedis(redis, matchedPattern, identifier, key, config);
  }

  // Fallback to in-memory
  return checkRateLimitMemory(key, config);
}

// One Ratelimit instance per route pattern (each pattern has its own
// limit/window). @upstash/ratelimit's sliding window runs as a single
// atomic Redis script — one round trip per check, no race conditions.
const ratelimiters = new Map<string, Ratelimit>();

function getRatelimiter(pattern: string, config: RateLimitConfig, redis: Redis): Ratelimit {
  let rl = ratelimiters.get(pattern);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowMs} ms`),
      prefix: `rl:${pattern}`,
    });
    ratelimiters.set(pattern, rl);
  }
  return rl;
}

/**
 * Check rate limit using Upstash Redis (atomic sliding window via @upstash/ratelimit).
 */
async function checkRateLimitRedis(
  redis: Redis,
  pattern: string,
  identifier: string,
  memoryKey: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const rl = getRatelimiter(pattern, config, redis);
    const result = await rl.limit(identifier);
    return {
      allowed: result.success,
      remaining: result.remaining,
      limit: result.limit,
      resetAt: result.reset,
    };
  } catch (err) {
    console.error('[rate-limit] Redis operation failed:', err);
    // Graceful degradation: fall back to in-memory on Redis error
    return checkRateLimitMemory(memoryKey, config);
  }
}

/**
 * Check rate limit using in-memory sliding window (fallback).
 */
function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  startMemoryCleanup();

  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get or create entry
  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    memoryStore.set(key, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  // Check limit
  if (entry.timestamps.length >= config.limit) {
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
 * Reset the in-memory store. Primarily used for testing.
 */
export function resetRateLimitStore(): void {
  memoryStore.clear();
}
