# Phase 6 — Referrals, Landing Pages, and Attribution

## Overview

Phase 6 reduces instructor referral friction to near-zero by introducing public identity (slug + referral code), public landing pages, and automatic connection-on-claim. Every connection is attributed to its source (referral link, invite link, student search, admin) for analytics.

## Migration

- **`20260306000006_instructor_referrals.sql`**
  - Adds `slug TEXT UNIQUE` and `referral_code TEXT UNIQUE` to `instructor_profiles`
  - Adds `connection_source TEXT` to `student_instructor_connections` with CHECK constraint
  - Backfills existing connections based on `invite_id` presence
  - RLS policy for anonymous slug lookup (approved instructors only)

## Instructor Public Identity

### Slug Generation

- `normalizeSlug(firstName, lastName)` → `"john-smith"` (lowercase, ASCII, hyphenated)
- Handles diacritics, special characters, collapsing whitespace
- Collision handling: `-2`, `-3`, ..., random hex suffix fallback
- Constants: `MAX_SLUG_ATTEMPTS = 5`

### Referral Code

- 8-character uppercase alphanumeric (alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
- No ambiguous characters (0/O/I/1 excluded)
- Retry loop on collision (max 10 attempts, 32^8 = ~1T possibilities)

### Identity Assignment

- `ensureInstructorIdentity()` — idempotent, called on:
  - Approval (`approveInstructor()`)
  - Auto-approval (`submitInstructorApplication()`)
  - Reinstatement (`reinstateInstructor()`)
  - Lazy backfill (GET `/api/user/instructor` for approved instructors missing identity)

## Connection Source Attribution

| Source | Value | When |
|--------|-------|------|
| Referral link claim | `referral_link` | Student uses `/ref/[code]` or `/instructor/[slug]` |
| Invite claim | `invite_link` | Student uses `/invite/[token]` |
| Student search | `student_search` | Student finds instructor via search |
| Admin action | `admin` | Admin creates connection manually |

- Column: `student_instructor_connections.connection_source`
- CHECK constraint: `('referral_link', 'invite_link', 'student_search', 'admin')`
- Legacy connections backfilled based on `invite_id` presence

## Public Routes

### `/ref/[code]` — Referral Claim Page

- Client component, shows instructor info (name, cert type, bio)
- If not logged in → redirect to `/login?redirect=/ref/[code]`
- "Connect" button calls `POST /api/referral/claim`
- Success → sessionStorage flag + redirect to `/practice`

### `/instructor/[slug]` — Public Instructor Profile

- Nav bar with SIGN IN / GET STARTED
- Avatar initial, name, cert type, bio, "When you connect" explainer
- "Connect" button uses referral code from slug lookup

### `/api/referral/lookup` — Public Lookup

- `GET ?code=ABCD1234` or `?slug=john-smith`
- No auth required, feature flag gated
- NEVER returns certificate_number or email

### `/api/referral/claim` — Claim Endpoint

- `POST { code: string }`, auth required
- One-instructor-at-a-time: 409 if already connected to different instructor
- Idempotent: returns existing connection if same instructor
- Auto-connects (state='connected', no pending step)
- PostHog event: `referral_code_claimed`

## Auth Redirect Chain

1. `/ref/[code]` → click Connect → not logged in → redirect to `/login?redirect=/ref/[code]`
2. Login page reads `redirect` param → passes as `?next=` to OAuth callback
3. Auth callback reads `next` param → redirects to `/ref/[code]`
4. Middleware honors `redirect` param for already-authenticated users on auth routes

## Invite Tools UI Panel

- New "Share with Students" panel on instructor command center
- Shows Referral Code (amber monospace), Quick Link (`/ref/{code}`), Profile Page (`/instructor/{slug}`)
- Copy-to-clipboard for all three
- Lazy backfill: GET endpoint calls `ensureInstructorIdentity` for approved instructors missing identity

## Referral Welcome Banner

- `useInstructorConnection` hook reads sessionStorage flags
- `ReferralWelcomeBanner` component renders on practice page
- Shows "Connected with [Name]!" after successful referral claim
- One-time display (sessionStorage key cleared after read)

## Key Invariants

1. **One instructor at a time** — Student can only have one non-disconnected connection
2. **Privacy** — Public pages/APIs never expose certificate_number or email
3. **Feature flag** — All referral routes gated by `instructor_partnership_v1`
4. **Idempotency** — Re-claiming same referral code returns success without side effects
5. **Auto-connect** — Referral claims skip pending step (state='connected' immediately)

## Admin Monitoring

- `GET /api/admin/quality/referrals` — connections by source, identity coverage, top referrers, recent claims

## Files

### New Files

- `supabase/migrations/20260306000006_instructor_referrals.sql`
- `src/lib/instructor-identity.ts`
- `src/lib/__tests__/instructor-identity.test.ts`
- `src/lib/__tests__/instructor-referrals.test.ts`
- `src/app/api/referral/claim/route.ts`
- `src/app/api/referral/lookup/route.ts`
- `src/app/ref/[code]/page.tsx`
- `src/app/instructor/[slug]/page.tsx`
- `src/components/ui/ReferralWelcomeBanner.tsx`
- `src/hooks/useInstructorConnection.ts`
- `src/app/api/admin/quality/referrals/route.ts`
- `scripts/eval/instructor-referral-audit.ts`

### Modified Files

- `src/types/database.ts` — connection_source type, slug/referral_code fields
- `src/lib/instructor-access.ts` — ensureInstructorIdentity calls on approval/reinstatement
- `src/app/api/user/instructor/route.ts` — lazy backfill for approved instructors missing identity
- `src/app/(dashboard)/instructor/page.tsx` — "Share with Students" invite tools panel
- `src/app/(dashboard)/practice/page.tsx` — referral welcome banner
- `src/app/(auth)/login/page.tsx` — redirect param handling
- `src/app/auth/callback/route.ts` — next param redirect
- `src/middleware.ts` — redirect param for authenticated users on auth routes

## Test Coverage

- `src/lib/__tests__/instructor-identity.test.ts` — 25 unit tests (slug, referral code, lookups)
- `src/lib/__tests__/instructor-referrals.test.ts` — 40 unit tests (attribution, invariants, safety)
- `scripts/eval/instructor-referral-audit.ts` — 10 deterministic checks

## Rollback

All changes are additive. To rollback:
- Revert modified files (instructor-access.ts, database.ts, UI pages, middleware.ts, auth routes)
- Delete new files listed above
- Migration is additive — `ALTER TABLE ... DROP COLUMN` for slug, referral_code, connection_source if needed
