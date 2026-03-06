# Phase 4 — Courtesy Access, Entitlements & Authorization Integration

## Summary

Phase 4 makes instructor privileges dynamically depend on approval status, connected student subscriptions, and admin overrides. Instructors with at least one paying student receive courtesy access (equivalent to `checkride_prep` tier). This access is explicitly a *courtesy benefit*, not a contractual entitlement, and is revocable at any time.

## Eligibility Rule (Exact)

An instructor has **courtesy access** if ALL of:

1. `instructor_profiles.status == 'approved'`

AND any ONE of:

2a. At least one connected student has `user_profiles.subscription_status` IN (`'active'`, `'trialing'`)

2b. At least one connected student has an active, non-expired `user_entitlement_overrides` row with `entitlement_key = 'paid_equivalent'`

2c. The instructor has an active, non-expired `instructor_access_overrides` row (any type)

**Priority order**: direct override (2c) > paid student (2a) > student override (2b)

## Effective Tier Mapping

| Instructor Status | Courtesy Access | Effective Tier |
|---|---|---|
| Not instructor | N/A | Normal user tier from `user_profiles.tier` |
| Pending approval | No | Normal user tier |
| Approved, no courtesy | No | Normal user tier |
| Approved, with courtesy | Yes | MAX(user tier, `checkride_prep`) |
| Suspended | No | Normal user tier |

**Key constraint**: Courtesy access never *downgrades* a tier. If the instructor already has `dpe_live` (paid subscription), they keep it.

## Paid-Active Student Definition

A student is considered "paid-active" if:
- `user_profiles.subscription_status` is `'active'` OR `'trialing'`

Conservative approach: `past_due`, `incomplete`, `canceled`, and `'none'` are NOT counted.

## Schema Changes

### New Table: `user_entitlement_overrides`

```sql
CREATE TABLE user_entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL CHECK (entitlement_key IN ('paid_equivalent')),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entitlement_key)
);
```

**Purpose**: General-purpose override allowing admin to grant paid-equivalent status to any user (demo accounts, beta testers, partnerships). When such a user is connected to an instructor, the instructor benefits from their paid-equivalent status.

**RLS**: Admin-only (no RLS policies = default deny for all authenticated users; service role bypasses).

### Rollback SQL

```sql
DROP TABLE IF EXISTS user_entitlement_overrides;
```

No other schema changes; existing tables are unchanged.

## Code Integration Points

### Entitlement Resolver (single source of truth)

**File**: `src/lib/instructor-entitlements.ts`

| Export | Purpose |
|--------|---------|
| `resolveInstructorEntitlements(userId, opts)` | Full entitlement resolution with TTL cache |
| `isStudentPaidActive(studentUserId, supabase)` | Check if student has paid subscription |
| `hasPaidEquivalentOverride(userId, supabase)` | Check for admin override |
| `buildResult(status, reason, ...)` | Pure function to construct result |
| `invalidateEntitlementCache(userId)` | Clear cache for specific user |
| `clearEntitlementCache()` | Clear all cached entitlements |
| `COURTESY_TIER` | The tier granted: `'checkride_prep'` |
| `PAID_ACTIVE_SUBSCRIPTION_STATUSES` | `['active', 'trialing']` |

### Tier Lookup Integration

**File**: `src/lib/voice/tier-lookup.ts`

`getUserTier()` now:
1. Fetches base tier from `user_profiles.tier` (existing)
2. If base tier < `checkride_prep`, checks instructor courtesy access
3. Returns the higher of (base tier, courtesy tier)
4. Error in entitlement check is swallowed (does not break tier resolution)

### API Endpoint Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/user/instructor` | Now returns `hasCourtesyAccess`, `courtesyReason`, `paidStudentCount` |

### New Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/instructor-entitlements` | Aggregate entitlement metrics |
| `GET /api/admin/user-overrides` | List active user overrides |
| `POST /api/admin/user-overrides` | Grant/revoke paid_equivalent override |
| `GET /api/admin/quality/instructor-entitlements` | Daily aggregate quality metrics |

### UI Changes

| Page | Change |
|------|--------|
| Instructor Command Center | Courtesy access banner (green/amber/red) |
| Settings (Instructor Mode) | Courtesy status, paid student count, disclaimer text |

## Caching

- **Entitlement cache**: 60-second TTL (module-level `TtlCache`)
- **Tier cache**: 5-minute TTL (existing, in `tier-lookup.ts`)
- Both survive across warm serverless invocations
- Cache miss always falls through to DB (correctness never depends on cache)

## Feature Flag Behavior

When `instructor_partnership_v1` is **disabled**:
- `resolveInstructorEntitlements()` still returns `not_instructor` for users without profiles
- The tier lookup integration only checks courtesy when base tier < `checkride_prep`
- All instructor UI/routes remain blocked at the route level (existing behavior)

## Test Coverage

| File | Tests |
|------|-------|
| `instructor-entitlements.test.ts` | 33 (buildResult, resolver, cache, privacy) |
| **Phase 4 total** | **33 new tests** |
| **Project total** | **928 tests, 42 files** |

## Audit Script

```bash
npm run eval:instructor-entitlements
```

Runs 10 deterministic offline checks validating the pure entitlement logic.

## Verification

- `npx tsc --noEmit` → Exit code 0
- `npm test` → 42 files, 928 tests passed
- `npm run eval:instructor-entitlements` → 10/10 checks pass
