# Instructor Abuse Hardening — Deterministic Offline Audit

**Date:** 2026-03-06
**Phase:** 7 (Abuse Hardening)
**Environment:** Offline deterministic (no database required)
**Overall result:** PASS

## Inlined Constants

| Constant | Value |
|----------|-------|
| PAID_ACTIVE_SUBSCRIPTION_STATUSES | `["active"]` |
| COURTESY_TIER | `checkride_prep` |
| DEFAULTS.EMAIL_INVITE_LIMIT | `20` |
| DEFAULTS.TOKEN_CREATION_LIMIT | `50` |
| DEFAULTS.RATE_LIMIT_WINDOW_HOURS | `24` |
| REFERRAL_ALPHABET | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| REFERRAL_CODE_LENGTH | `8` |
| CONNECTION_SOURCE_VALUES | `["referral_link","invite_link","student_search","admin"]` |

## Source Files Checked

| File | Exists |
|------|--------|
| `src/app/api/public/qr/referral/[code]/route.ts` | Yes |
| `src/app/api/instructor/invites/email/route.ts` | Yes |
| `src/app/api/referral/claim/route.ts` | Yes |
| `src/app/api/referral/lookup/route.ts` | Yes |
| `src/app/api/admin/quality/referrals/route.ts` | Yes |
| `src/lib/instructor-identity.ts` | Yes |

## Checks

| # | Check | Pass | Detail |
|---|-------|------|--------|
| 1 | Courtesy does NOT count trialing by default | PASS | PAID_ACTIVE_SUBSCRIPTION_STATUSES is exactly ['active'] — trialing excluded |
| 2 | QR endpoint route file exists and returns image/png | PASS | Route file at src/app/api/public/qr/referral/[code]/route.ts exists and contains image/png content type |
| 3 | QR route uses qrcode library with toBuffer for PNG generation | PASS | Route imports QRCode and calls toBuffer() for PNG generation |
| 4 | Email invite route rejects non-approved instructors | PASS | Route checks profile.status !== 'approved' and returns 403 |
| 5 | Rate limit defaults: email=20, token=50 | PASS | EMAIL_INVITE_LIMIT=20, TOKEN_CREATION_LIMIT=50 |
| 6 | Rate limit window is 24 hours | PASS | RATE_LIMIT_WINDOW_HOURS=24 |
| 7 | Self-referral blocked in claim route | PASS | Claim route checks instructorUserId === user.id and returns user-friendly error |
| 8 | ConnectionSource values are exactly 4: referral_link, invite_link, student_search, admin | PASS | All 4 expected ConnectionSource values present |
| 9 | Email invite sends produce log event (logInviteEvent) | PASS | Email invite route imports and calls logInviteEvent |
| 10 | Admin metrics endpoint returns expected schema keys | PASS | Route at src/app/api/admin/quality/referrals/route.ts exists and contains all 6 expected response keys |
| 11 | Feature flag gating: referral claim checks isInstructorFeatureEnabled | PASS | Claim route imports and checks isInstructorFeatureEnabled before processing |
| 12 | No certificate_number in public referral responses | PASS | Neither lookupByReferralCode nor lookupBySlug select certificate_number; ReferralLookup interface is clean |

## Summary

- **Total checks:** 12
- **Passed:** 12
- **Failed:** 0
- **Result:** ALL PASS

## Methodology

This audit validates the Phase 7 abuse hardening features using two strategies:

### 1. Inlined Constant Verification

Pure-logic constants are inlined from source modules to avoid `server-only` import guards. Constants verified:

- `PAID_ACTIVE_SUBSCRIPTION_STATUSES` from `src/lib/instructor-entitlements.ts` (must be `['active']` only — trialing excluded by default)
- Rate limit defaults from `src/lib/instructor-rate-limiter.ts` (email=20/day, token=50/day, 24h window)
- `ConnectionSource` enum values from `src/types/database.ts` (exactly 4 values)

### 2. Source Code Content Analysis

Route files are read and searched for critical security patterns:

- QR endpoint existence and content-type (`image/png`)
- Approved-status gating on email invites
- Self-referral blocking in claim route (`instructorUserId === user.id`)
- Feature flag gating (`isInstructorFeatureEnabled`)
- Invite event logging (`logInviteEvent`)
- Admin metrics response schema completeness
- Public data safety: `certificate_number` never in public selects or responses
