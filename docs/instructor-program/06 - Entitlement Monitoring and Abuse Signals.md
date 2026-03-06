# Entitlement Monitoring and Abuse Signals

## PostHog Events

### `instructor_courtesy_access_resolved`

Fired on every entitlement cache miss for an approved instructor (approximately once per 60 seconds per active instructor).

| Property | Type | Description |
|----------|------|-------------|
| `instructorStatus` | string | `approved_with_courtesy` or `approved_no_courtesy` |
| `hasCourtesyAccess` | boolean | Whether instructor currently has courtesy access |
| `courtesyReason` | string | `paid_student`, `student_override`, `direct_override`, or `none` |
| `paidStudentCount` | number | Connected students with active/trialing subscription |
| `paidEquivalentStudentCount` | number | Connected students with admin-granted paid_equivalent |
| `effectiveTier` | string | `checkride_prep` or `none` |

### Recommended Future Events (Phase 7)

| Event | Trigger | Purpose |
|-------|---------|---------|
| `instructor_courtesy_access_gained` | Status changes from no-courtesy to courtesy | Track onboarding conversion |
| `instructor_courtesy_access_lost` | Status changes from courtesy to no-courtesy | Track churn signals |

## Admin Endpoints

### `GET /api/admin/instructor-entitlements`

Aggregate metrics for admin dashboard.

```json
{
  "instructorsApproved": 12,
  "instructorsWithCourtesy": 8,
  "instructorsWithoutCourtesy": 4,
  "overridesActive": 2,
  "studentOverridesActive": 3,
  "expiringOverrides": [
    { "userId": "...", "expiresAt": "2026-03-20T00:00:00Z", "reason": "beta tester" }
  ]
}
```

### `GET /api/admin/user-overrides`

List all active user entitlement overrides.

### `POST /api/admin/user-overrides`

Grant or revoke paid_equivalent override.

```json
{ "action": "grant", "userId": "...", "entitlementKey": "paid_equivalent", "reason": "Beta tester", "expiresAt": "2026-06-01T00:00:00Z" }
```

### `GET /api/admin/quality/instructor-entitlements`

Daily aggregate quality metrics (no PII).

```json
{
  "timestamp": "2026-03-05T20:00:00Z",
  "approvedInstructors": 12,
  "withCourtesy": 8,
  "withoutCourtesy": 4,
  "directOverridesActive": 2,
  "studentOverridesActive": 3,
  "courtesyByReason": { "paid_student": 6, "student_override": 1, "direct_override": 1 }
}
```

## Recommended PostHog Dashboards

### Instructor Entitlement Overview

| Panel | Query |
|-------|-------|
| Courtesy instructors (trend) | `instructor_courtesy_access_resolved` where `hasCourtesyAccess=true`, unique users, daily |
| No-courtesy instructors (trend) | Same where `hasCourtesyAccess=false` |
| Courtesy by reason (pie) | Breakdown by `courtesyReason` |
| Paid student distribution | Breakdown by `paidStudentCount` bucket (0, 1, 2-5, 6+) |

### Abuse Signals

| Signal | Threshold | Action |
|--------|-----------|--------|
| Instructor with > 20 connected students | > 20 | Manual review |
| Instructor gained + lost courtesy > 3 times in 30 days | > 3 state flips | Manual review |
| Override granted with < 7 day expiry | < 7 days | Verify intent |
| Student with paid_equivalent connecting to > 3 instructors | > 3 connections | Investigate |

## Trial Abuse Audit (Phase 7 Risks)

The following abuse vectors were identified during read-only audit:

| Vector | Risk | Fix Phase |
|--------|------|-----------|
| Trial re-entry (new account = new trial) | Critical | Phase 7 |
| No trial history tracking in DB | Medium | Phase 7 |
| Instructor dual identity (two accounts, one paid) | Medium | Phase 7 |
| Unlimited invite generation per instructor | Low | Phase 7+ |
| No app-level rate limiting on signup | Low | Phase 8 |

### Recommended Phase 7 Actions

1. Add `trial_started_at` and `trial_count` to `user_profiles`
2. Create `trial_events` table for audit trail
3. Add device fingerprint/IP logging for instructor-student connections
4. Add invite rate limiting (50 active per instructor per 7 days)
