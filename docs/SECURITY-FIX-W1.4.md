# Security Fix W1.4: Middleware & Cron Hardening + Distributed Rate Limiting

**Date**: 2026-06-10  
**Severity**: Medium (M1/M2/M3 from Review 06)  
**Status**: Implemented  
**Affected**: All routes (rate limiting), E2E tests (PLAYWRIGHT_TEST), cron jobs

## Summary

Three medium-severity hardening fixes in one PR:

1. **M2: PLAYWRIGHT_TEST bypass** — Disabled in production environments to prevent accidental global auth bypass
2. **M3: Cron job fail-open** — Changed from fail-open ("Bearer undefined" guessable) to fail-closed  
3. **M1: In-memory rate limiter** — Replaced with distributed Upstash Redis, with graceful in-memory fallback

## Problem 1: PLAYWRIGHT_TEST Global Bypass (M2)

**Location**: `src/middleware.ts:8-10`

**Vulnerability**:
```typescript
if (process.env.PLAYWRIGHT_TEST === '1') {
  return NextResponse.next({ request }); // Skips ALL auth + rate limiting
}
```

**Risk**: If env var leaks to production, ALL security is bypassed globally.

**Fix**: Gate the bypass by environment:
```typescript
const isProductionEnv = process.env.NEXT_PUBLIC_APP_ENV === 'production'
  || process.env.VERCEL_ENV === 'production';
if (process.env.PLAYWRIGHT_TEST === '1' && !isProductionEnv) {
  return NextResponse.next({ request });
}
```

**Impact**:
- ✅ E2E tests still work locally (PLAYWRIGHT_TEST=1 + dev environment)
- ✅ Accidental production bypass prevented
- ✅ No impact to legitimate traffic

## Problem 2: Cron Secrets Fail-Open (M3)

**Location**: `src/app/api/cron/*/route.ts:16-19`

**Vulnerability**:
```typescript
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

When `CRON_SECRET` is undefined, this becomes `"Bearer undefined"` — guessable by attackers.

**Fix**: Explicitly check if env var exists:
```typescript
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Impact**:
- ✅ Routes return 401 if CRON_SECRET is missing (fail-closed)
- ✅ No guessable default values
- ✅ Production deployments must explicitly set CRON_SECRET

**Files Fixed**:
- `src/app/api/cron/daily-digest/route.ts`
- `src/app/api/cron/nudges/route.ts`

## Problem 3: In-Memory Rate Limiter Ineffective at Scale (M1)

**Location**: `src/lib/rate-limit.ts`

**Vulnerability**:
```typescript
const store = new Map<string, RateLimitEntry>(); // Per-Lambda instance
```

On Vercel (multiple Lambda instances), the in-memory store is per-instance. A user can:
1. Make 20 requests to instance A (allowed)
2. Make 20 more requests to instance B (allowed again, fresh store)
3. Bypass the 20-request/min limit

**Fix**: Use Upstash Redis for distributed rate limiting with in-memory fallback:

### Architecture

```
┌─────────────────────────────────────────────┐
│      Check Request Rate Limit               │
└────────────────────┬────────────────────────┘
                     │
              ┌──────▼──────┐
              │ Redis       │
              │ configured? │
              └──┬───────┬──┘
          YES  │       │  NO
              │       │
         ┌─────▼──┐  ┌─┴─────────────┐
         │ Use    │  │ Use in-memory │
         │ Redis  │  │ (with warning)│
         │ (live) │  │ (fallback)    │
         └────────┘  └───────────────┘
```

### Implementation

**New file**: Replaced `src/lib/rate-limit.ts` with Redis + fallback:

1. **Redis mode** (when configured):
   - Uses Upstash Redis sorted sets for sliding window
   - Distributed across all Lambda instances
   - Shared state between instances
   - TTL-based cleanup

2. **In-memory fallback** (when Redis env vars missing):
   - Uses previous Map-based implementation
   - Logs warning about ineffectiveness
   - Suitable for local dev and testing
   - Zero production impact if not configured

### Configuration

**Environment Variables**:
```bash
UPSTASH_REDIS_REST_URL=https://your-project.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

Create free Upstash database:
1. Go to https://console.upstash.com
2. Create new Redis database
3. Copy REST API credentials
4. Set in Vercel environment

**If not configured**: Behavior unchanged, fallback warning logged:
```
[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured. 
Using in-memory fallback (ineffective across Lambda instances).
```

### Rate Limit Config (Unchanged)

All existing routes and limits remain the same:
- `/api/exam`: 20 req/min per user
- `/api/tts`: 30 req/min per user
- `/api/stt/token`: 4 req/min per user
- `/api/stripe/checkout`: 5 req/min per user
- `/api/admin`: 60 req/min per user
- etc.

### Graceful Degradation

```typescript
try {
  // Use Redis
  return await checkRateLimitRedis(redis, key, config);
} catch (err) {
  // If Redis fails, fall back to in-memory
  return checkRateLimitMemory(key, config);
}
```

If Redis becomes unavailable:
- Requests still work (memory fallback)
- Per-instance limits still apply (reduced effectiveness but not broken)
- No impact to application availability

## Files Changed

### Code Changes
- `src/middleware.ts` — Gate PLAYWRIGHT_TEST bypass by environment + await checkRateLimit
- `src/lib/rate-limit.ts` — Complete rewrite with Redis + fallback
- `src/app/api/cron/daily-digest/route.ts` — Fail-closed cron auth
- `src/app/api/cron/nudges/route.ts` — Fail-closed cron auth
- `package.json` — Added @upstash/redis and @upstash/ratelimit

### Configuration
- `.env.example` — Added UPSTASH_REDIS_REST_URL/TOKEN + CRON_SECRET

### Testing
- `src/lib/__tests__/rate-limit-fallback.test.ts` — Tests for fallback behavior

## Testing & Verification

### Local Development (In-Memory Fallback)

```bash
# Rate limiter will warn about Redis not configured but work
npm run dev
# [rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured...
```

Tests pass without Redis:
```bash
npm test -- rate-limit-fallback.test.ts
# All tests pass (in-memory mode)
```

### With Redis Configured

```bash
# Set in .env.local
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

npm run dev
# No warning — Redis active
```

### Cron Testing

```bash
# Should return 401 without secret
curl https://app.example.com/api/cron/daily-digest

# Should return 401 with wrong secret
curl -H "Authorization: Bearer wrong" https://app.example.com/api/cron/daily-digest

# Should work with correct secret
curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/daily-digest
```

### PLAYWRIGHT_TEST Testing

```bash
# Locally: bypass works (dev environment)
PLAYWRIGHT_TEST=1 npm run dev
# Auth skipped, tests can mock APIs

# In production: bypass is inert
# PLAYWRIGHT_TEST=1 + VERCEL_ENV=production → bypass disabled
```

## Deployment Checklist

### Before Production Deployment

1. **Set CRON_SECRET** in Vercel environment
   - Use a strong random secret: `openssl rand -base64 32`

2. **Optional: Set up Upstash Redis** (recommended for production)
   - Create free database at https://console.upstash.com
   - Copy REST URL and token
   - Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel

3. **Verify rate limiting works**
   - Even without Redis, in-memory fallback ensures basic protection
   - Production safety not dependent on Redis (graceful degradation)

### Production Impact

- ✅ All three fixes are backward compatible
- ✅ Zero breaking changes to legitimate traffic
- ✅ Only malicious/misconfigured access blocked
- ✅ Rate limiter works without Redis (less effective but not broken)
- ✅ Tests continue to work with PLAYWRIGHT_TEST bypass in dev

## Security Improvements

| Issue | Before | After |
|-------|--------|-------|
| PLAYWRIGHT_TEST bypass | Can reach production | Requires dev environment |
| Cron secret missing | "Bearer undefined" guessable | 401 Unauthorized |
| Rate limiting across instances | Ineffective (20x per instance) | Distributed (1x total) |
| Production without Redis | N/A | Works, warns in logs |

## Monitoring

### Watch for in Logs

```
[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured.
```

If this appears in production after 2026-06-10, Upstash Redis is not configured. Upgrade to Redis to get effective rate limiting.

## Related Issues

- **M2**: PLAYWRIGHT_TEST global bypass — Fixed in middleware
- **M3**: Cron secrets fail-open — Fixed in both cron routes
- **M1**: In-memory rate limiter — Replaced with Redis + fallback
- Complements W1.1/W1.2/W1.3 (critical fixes) — these are hardening (medium severity)

## References

- Security Review 06: Medium findings M1/M2/M3
- Upstash Redis: https://upstash.com
- Upstash SDK: https://github.com/upstash/upstash-js
