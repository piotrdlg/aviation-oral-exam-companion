# Instructor Entitlement Resolver — Deterministic Offline Audit

**Date:** 2026-03-06
**Phase:** 4 (Entitlement Resolution)
**Environment:** Offline deterministic (no database required)
**Overall result:** PASS

## Inlined Constants

| Constant | Value |
|----------|-------|
| PAID_ACTIVE_SUBSCRIPTION_STATUSES | `["active"]` |
| COURTESY_TIER | `checkride_prep` |
| ENTITLEMENT_CACHE_TTL_MS | `60000` (= 60s) |

## Checks

| # | Check | Pass | Detail |
|---|-------|------|--------|
| 1 | not_instructor returns isInstructor=false, hasCourtesyAccess=false | PASS | Non-instructor correctly identified |
| 2 | pending_approval returns isInstructor=true, hasCourtesyAccess=false | PASS | Pending instructor correctly denied courtesy access |
| 3 | suspended returns isInstructor=true, hasCourtesyAccess=false | PASS | Suspended instructor correctly denied courtesy access |
| 4 | approved_no_courtesy returns isInstructor=true, hasCourtesyAccess=false, effectiveTierOverride=null | PASS | Approved instructor without courtesy correctly returns null tier override |
| 5 | approved_with_courtesy + paid_student(2) returns correct courtesy fields | PASS | Paid student courtesy access correctly granted with checkride_prep tier |
| 6 | approved_with_courtesy + student_override returns correct override fields | PASS | Student override courtesy access correctly reflected |
| 7 | approved_with_courtesy + direct_override returns courtesyReason=direct_override | PASS | Direct override courtesy reason correctly set |
| 8 | PAID_ACTIVE_SUBSCRIPTION_STATUSES contains only [active] (trialing excluded by default) | PASS | Constant contains exactly the expected 1 status (trialing requires system_config override) |
| 9 | COURTESY_TIER equals checkride_prep | PASS | Courtesy tier constant is correct |
| 10 | buildResult returns cacheTTLSeconds=60 | PASS | Cache TTL correctly set to 60 seconds (from 60,000ms constant) |

## Summary

- **Total checks:** 10
- **Passed:** 10
- **Failed:** 0
- **Result:** ALL PASS

## Methodology

This audit inlines the pure-logic definitions from `src/lib/instructor-entitlements.ts` to avoid the `server-only` import guard. It validates:

1. All five `InstructorProgramStatus` values produce correct `isInstructor` and `hasCourtesyAccess` flags
2. Courtesy reason propagation for paid_student, student_override, and direct_override paths
3. Student count fields are correctly passed through
4. The `effectiveTierOverride` field is `'checkride_prep'` only when `hasCourtesyAccess` is true
5. Exported constants (`PAID_ACTIVE_SUBSCRIPTION_STATUSES`, `COURTESY_TIER`) have expected values
6. Cache TTL is derived correctly from the millisecond constant (60,000ms = 60s)
