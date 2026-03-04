---
date: 2026-03-13
type: system-audit
tags: [heydpe, system-audit, phase-16, security, hardening, review]
status: Final
evidence_level: high
---

# 46 — Security Hardening Review
**Phase:** 16 | **Date:** 2026-03-13 | **Scope:** Practical beta-launch security audit

## Security Audit Summary

| Area | Verdict | Details |
|------|---------|---------|
| Auth/Session handling | SECURE | Supabase auth with token refresh, cookie security, PKCE |
| Admin endpoint protection | SECURE | All 23 admin routes protected by `requireAdmin()` |
| Stripe webhook verification | SECURE | Signature verification + idempotency + out-of-order guard |
| Input validation | SECURE | Whitelist validation, parameterized queries, rate limiting |
| Rate limiting | SECURE | Per-endpoint limits, 429 responses, Retry-After headers |
| Sensitive data exposure | SECURE | No client-side secrets, sanitized error responses |
| XSS vectors | SECURE | 1 safe usage of dangerouslySetInnerHTML (JSON-LD only) |
| SQL injection | SECURE | All queries via Supabase SDK (parameterized) |
| CORS & headers | SECURE | X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Environment variables | SECURE | No hardcoded secrets, proper NEXT_PUBLIC_ prefixing |
| Row Level Security (RLS) | SECURE | All tables have RLS policies enforced |
| Email webhook security | SECURE | Svix signature verification, HTML stored but never rendered |

## Rate Limiting Configuration

| Endpoint | Limit | Identifier |
|----------|-------|-----------|
| `/api/exam` | 20 req/min | User ID |
| `/api/tts` | 30 req/min | User ID |
| `/api/stt/token` | 4 req/min | User ID |
| `/api/stripe/webhook` | 100 req/min | IP |
| `/api/stripe/checkout` | 5 req/min | User ID |
| `/api/report` | 10 req/min | User ID |
| `/api/admin/*` | 60 req/min | User ID |

## Security Headers

| Header | Value | Status |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | SET |
| `X-Frame-Options` | `DENY` | SET |
| `X-XSS-Protection` | `1; mode=block` | SET |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | SET |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` | SET |
| `Content-Security-Policy` | — | NOT SET (review item) |

## Findings by Classification

### Beta Blockers (0)
None identified.

### Public Launch Blockers (0)
None identified.

### Review Items (3)

1. **Session ownership in `/api/report`** — Report endpoint does not verify that `session_id` belongs to the authenticated user. RLS prevents reading other users' reports, but app-level ownership check recommended for defense-in-depth.
   - **File**: `src/app/api/report/route.ts`
   - **Risk**: Low (UUID collision improbable, RLS prevents data leakage)

2. **Content Security Policy (CSP) header not set** — Would add another layer of XSS protection. Not critical since no inline scripts or third-party JS vulnerabilities detected.
   - **File**: `next.config.ts`
   - **Risk**: Low (no known XSS vectors)

3. **`trackLogin()` fire-and-forget** — Auth callback uses `void trackLogin()` pattern. If tracking fails, user auth succeeds but telemetry is lost. Acceptable for non-critical data.
   - **File**: `src/app/auth/callback/route.ts`
   - **Risk**: Informational only

### Informational (2)

1. **Rate limiting is in-memory** — Resets on Lambda cold start. Acceptable for single-region beta deployment. Migrate to Upstash Redis before multi-region scaling.
   - **File**: `src/lib/rate-limit.ts`

2. **JSON-LD `dangerouslySetInnerHTML`** — Safe usage in `src/components/JsonLd.tsx` for structured data. `JSON.stringify()` output cannot contain executable code.

## RLS Policy Summary

| Table | Read | Write | Delete |
|-------|------|-------|--------|
| `acs_tasks` | Authenticated | None (immutable) | None |
| `concepts` | Validated + Admin | Admin only | Admin only |
| `exam_sessions` | Owner only | Owner only | None |
| `session_transcripts` | Via session ownership | Via session ownership | None |
| `support_tickets` | Admin only | Admin only | Admin only |
| `admin_users` | Admin only | None | None |
| `user_profiles` | Owner reads own | Owner updates own | None |

## Account Status Enforcement

| Status | Middleware Action | Routes Affected |
|--------|------------------|-----------------|
| Active | Allow access | All |
| Suspended | Redirect to `/suspended` | Dashboard routes |
| Banned | Redirect to `/banned` | All protected routes |

## Verdict
**GO for beta** — All critical security controls are in place. Zero beta blockers, zero public launch blockers. Three minor review items are non-blocking improvements.
