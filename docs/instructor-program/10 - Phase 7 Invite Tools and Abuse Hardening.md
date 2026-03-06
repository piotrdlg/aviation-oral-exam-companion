# Phase 7 — Invite Tools and Abuse Hardening

## Overview

Phase 7 completes the invite toolchain (QR codes, email invites), hardens against abuse (rate limiting, self-referral protection), and corrects the courtesy access eligibility rule. The `trialing` subscription status no longer counts as paid by default, aligning with the PRD requirement that courtesy access requires an actual paying student. All new endpoints are feature-flagged, rate-limited, and produce PostHog events for observability.

## Migration

- **`20260306000007_instructor_invite_events.sql`**
  - Creates `instructor_invite_events` table for rate limiting and audit trail
  - Columns: `id` (UUID PK), `instructor_user_id` (FK to auth.users), `event_type`, `metadata` (JSONB), `created_at`
  - CHECK constraint on `event_type`: `('token_created', 'email_sent', 'claimed', 'revoked', 'rate_limited')`
  - Indexes: `(instructor_user_id, created_at)` for rate limit queries, `(event_type, created_at)` for admin analytics
  - RLS: instructors can read their own events; service role bypasses

## Entitlement Correction

### Problem

The PRD specifies that courtesy access requires at least one connected student with an **active paid subscription**. The Phase 4 implementation included `trialing` in `PAID_ACTIVE_SUBSCRIPTION_STATUSES`, which meant instructors could receive courtesy access from a student who had not yet paid.

### Fix

- `PAID_ACTIVE_SUBSCRIPTION_STATUSES` changed from `['active', 'trialing']` to `['active']`
- `trialing` no longer counts as paid by default
- System config override: `instructor.courtesy_counts_trialing` (boolean)
  - When `true`, the entitlement resolver adds `'trialing'` to the paid status list
  - Allows future opt-in without code changes
- Reason: PRD alignment — courtesy access requires actual paying student

### Affected Files

- `src/lib/instructor-entitlements.ts` — `PAID_ACTIVE_STATUSES` constant, new `shouldCountTrialing()` helper
- `src/lib/__tests__/instructor-entitlements.test.ts` — updated tests for new default
- `scripts/eval/instructor-entitlement-audit.ts` — updated inlined constants and Check 8

## QR Code Generation

### Server Endpoint

- `GET /api/public/qr/referral/[code]` — returns PNG image
- Public endpoint (no auth required)
- Code validation: 3-20 alphanumeric characters (case-insensitive)
- QR target URL: `https://heydpe.com/ref/{CODE}` (uppercased)
- Generation: `qrcode` library with `toBuffer()` for PNG output
- Dimensions: 400px width, 2px margin, error correction level M
- Colors: amber-500 (`#F59E0B`) on transparent background (`#00000000`)
- Headers: `Content-Type: image/png`, `Cache-Control: public, max-age=86400, immutable`
- Content-Disposition: `inline; filename="heydpe-referral-{CODE}.png"`

### Client Download

- Instructor command center "Share with Students" panel includes QR download link
- Links to the server endpoint for the instructor's referral code

### PostHog Event

- `instructor_referral_qr_downloaded` — tracked on client download click

## Email Invite Sending

### Endpoint

- `POST /api/instructor/invites/email`
- Authenticated, feature-flagged (`instructor_partnership_v1`)
- Body: `{ email: string; studentName?: string }`
- Returns: `{ success: true; inviteId: string }` on success

### Flow

1. Auth check (401 if not authenticated)
2. Feature flag check (404 if disabled)
3. Instructor status check — must be `approved` (403 otherwise)
4. Email validation — RFC 5321 max length (254), basic format regex
5. Rate limit check via `checkInstructorRateLimit()`
6. Create invite token via `createInviteLink()`
7. Log `token_created` event
8. Send email via `sendInstructorInviteEmail()` (Resend)
9. Log `email_sent` event
10. Fire PostHog event

### Email Template

- `src/emails/instructor-invite.tsx`
- React Email component using shared `EmailLayout`
- Props: `instructorName`, `certType` (nullable), `inviteUrl`
- Content: invitation heading, instructor intro with cert type, HeyDPE product description, amber CTA button, legal disclaimer, ignore notice with support email
- Dark theme styling consistent with other HeyDPE emails

### PostHog Events

- `instructor_invite_email_sent` — successful invite send (includes `invite_id`, `has_student_name`)
- `instructor_invite_rate_limited` — rate limit hit (includes `event_type`, `current`, `limit`)

## Rate Limiting

### Architecture

- DB-backed via `instructor_invite_events` table (serverless safe — no in-memory state)
- Sliding window: last 24 hours from current time
- Counts events by `instructor_user_id` and `event_type`

### Limits

| Event Type | Default Limit | Config Key |
|------------|---------------|------------|
| `email_sent` | 20/day | `instructor.email_invite_limit` |
| `token_created` | 50/day | `instructor.token_creation_limit` |

### Configuration

- Limits read from `system_config` table (key: `instructor`)
- Falls back to defaults if config is missing or throws
- `overrideLimit` parameter available for programmatic override (testing)
- Window: 24 hours (constant, not configurable)

### Rate Limit Response

When rate limit is exceeded:
- `rate_limited` event logged to `instructor_invite_events`
- PostHog event: `instructor_invite_rate_limited`
- HTTP 429 response with `{ error, current, limit, windowHours }`

### Module API

```typescript
checkInstructorRateLimit(supabase, instructorUserId, eventType, overrideLimit?)
  → Promise<{ allowed, current, limit, windowHours }>

logInviteEvent(supabase, instructorUserId, eventType, metadata?)
  → Promise<void>
```

## Admin Monitoring

### Extended `/api/admin/quality/referrals`

Phase 7 extends the admin referral metrics endpoint with two new sections:

| Section | Fields |
|---------|--------|
| `inviteEvents` | `emailsSent7d`, `tokensCreated7d`, `claims7d`, `rateLimitHits7d` |
| `courtesyBreakdown` | `directOverrides`, `paidActiveStudents`, `trialingStudents`, `trialingCountsAsPaid` |

The `courtesyBreakdown.trialingCountsAsPaid` field is hardcoded to `false` (reflecting the new default). When `instructor.courtesy_counts_trialing` is enabled via system config, the entitlement resolver will count trialing students, but the admin endpoint reflects the default policy.

## Key Invariants

1. **Approved only** — Only approved instructors can send email invites or generate QR codes
2. **Rate limited** — Email invites capped at 20/day, token creation at 50/day (configurable)
3. **Self-referral blocked** — Claim route rejects `instructorUserId === user.id`
4. **Feature flag gated** — All invite routes require `instructor_partnership_v1` enabled
5. **No PII in public routes** — QR endpoint and lookup never expose certificate_number or email
6. **Trialing is not paid** — `PAID_ACTIVE_SUBSCRIPTION_STATUSES = ['active']` by default
7. **Audit trail** — Every invite action (create, send, claim, revoke, rate limit) logged to `instructor_invite_events`
8. **Idempotent** — Re-claiming same referral code returns existing connection without side effects

## Testing

- `src/lib/__tests__/instructor-rate-limiter.test.ts` — 19 unit tests (defaults, rate limit checks, event logging)
- `src/lib/__tests__/instructor-entitlements.test.ts` — updated tests for trialing exclusion
- `scripts/eval/instructor-abuse-audit.ts` — 12 deterministic offline checks (constants, source analysis, security invariants)

## Files

### New Files

- `supabase/migrations/20260306000007_instructor_invite_events.sql`
- `src/lib/instructor-rate-limiter.ts`
- `src/lib/__tests__/instructor-rate-limiter.test.ts`
- `src/app/api/instructor/invites/email/route.ts`
- `src/app/api/public/qr/referral/[code]/route.ts`
- `src/emails/instructor-invite.tsx`
- `scripts/eval/instructor-abuse-audit.ts`

### Modified Files

- `src/lib/instructor-entitlements.ts` — `PAID_ACTIVE_STATUSES` correction, `shouldCountTrialing()` helper
- `src/lib/__tests__/instructor-entitlements.test.ts` — tests updated for new trialing default
- `scripts/eval/instructor-entitlement-audit.ts` — inlined constants and Check 8 updated
- `src/app/api/admin/quality/referrals/route.ts` — `inviteEvents` and `courtesyBreakdown` sections added
- `src/lib/email.ts` — `sendInstructorInviteEmail()` function added
- `src/types/database.ts` — no structural changes (existing types reused)

## Rollback

All changes are additive. To rollback:
- Revert modified files (instructor-entitlements.ts, email.ts, admin quality route)
- Delete new files listed above
- Migration is additive — `DROP TABLE instructor_invite_events` if needed
- Restore `PAID_ACTIVE_STATUSES` to `['active', 'trialing']` if reverting entitlement correction
