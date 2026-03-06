# Instructor Public Launch Gate Evaluation

**Date:** 2026-03-06
**Phase:** 9 (Public Launch Gate)
**Environment:** Offline deterministic (no database required)
**Result:** **VERDICT: GO**

## Verdict Rules

- **GO**: All checks pass
- **REVIEW**: 1-2 non-critical failures
- **HOLD**: 3+ failures or any critical failure

## Activation & State Machine

| # | Check | Critical | Result | Detail |
|---|-------|----------|--------|--------|
| 1 | Feature flag key is 'instructor_partnership_v1' | Yes | PASS | Feature flag key constant found in instructor-access.ts |
| 2 | State machine has all 5 states (draft, pending, approved, rejected, suspended) | Yes | PASS | All 5 states found in InstructorStatus type |
| 3 | Valid transitions cover approve/reject/suspend/reinstate | Yes | PASS | All 4 transition functions found |

## Connections

| # | Check | Critical | Result | Detail |
|---|-------|----------|--------|--------|
| 4 | Self-connection is prevented | Yes | PASS | Self-connection guard found in requestConnection() |
| 5 | Connection states include all 6 required values | Yes | PASS | All 6 connection states found in ConnectionState type |
| 6 | Search returns privacy-safe fields only (excludes certificate_number) | Yes | PASS | searchInstructors select: id, user_id, first_name, last_name, certificate_type (no certificate_number) |

## Invites & Referrals

| # | Check | Critical | Result | Detail |
|---|-------|----------|--------|--------|
| 7 | Invite token length is 48 chars (24 bytes hex) | No | PASS | TOKEN_BYTES=24 → 48 hex chars |
| 8 | Referral code uses unambiguous alphabet (excludes 0/O/I/1) | No | PASS | REFERRAL_ALPHABET has 32 chars, correctly excludes 0, O, I, 1 |
| 9 | Self-referral check exists (invite and/or referral claim) | Yes | PASS | Found: invite claim guard, referral claim guard |

## Entitlements

| # | Check | Critical | Result | Detail |
|---|-------|----------|--------|--------|
| 10 | PAID_ACTIVE_STATUSES is ['active'] (trialing excluded by default) | Yes | PASS | PAID_ACTIVE_STATUSES contains exactly ['active'] |
| 11 | Courtesy tier is 'checkride_prep' | Yes | PASS | COURTESY_TIER = 'checkride_prep' |

## Abuse & Monitoring

| # | Check | Critical | Result | Detail |
|---|-------|----------|--------|--------|
| 12 | Rate limit defaults are 20 email / 50 token | No | PASS | rate-limiter: email=20, token=50; quotas: email=20, token=50 |
| 13 | Fraud signal count is 6 | No | PASS | 6 signals: high_invite_low_connect, rate_limit_abuse, burst_invite_activity, high_churn, zero_engagement, suspicious_paid_ratio |

## Operational

| # | Check | Critical | Result | Detail |
|---|-------|----------|--------|--------|
| 14 | FAA import script exists at scripts/instructor/import-faa-airmen.ts | Yes | PASS | Script exists with faa_airmen, faa_airmen_certs, faa_import_log references |
| 15 | FAA freshness threshold is 45 days | No | PASS | 45-day threshold found in scripts/eval/instructor-faa-freshness.ts |

## Summary

- **Total checks:** 15
- **Passed:** 15
- **Failed:** 0
- **Verdict:** GO

## Methodology

This launch gate evaluation verifies 15 deterministic checks across 6 categories:

1. **Activation & State Machine** — Feature flag, state enum, transition functions
2. **Connections** — Self-connection guard, state enum, privacy-safe search
3. **Invites & Referrals** — Token entropy, unambiguous alphabet, self-referral prevention
4. **Entitlements** — Paid-active statuses, courtesy tier constant
5. **Abuse & Monitoring** — Rate limit defaults, fraud signal count
6. **Operational** — FAA import script, freshness threshold

All checks use pure function imports or filesystem-based source verification to bypass `server-only` import guards. No database connection required.
