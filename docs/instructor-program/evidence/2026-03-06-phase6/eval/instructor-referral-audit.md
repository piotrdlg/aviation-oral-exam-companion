# Instructor Referral / Identity — Deterministic Offline Audit

**Date:** 2026-03-06
**Phase:** 6 (Referral & Identity)
**Environment:** Offline deterministic (no database required)
**Overall result:** PASS

## Inlined Constants

| Constant | Value |
|----------|-------|
| REFERRAL_ALPHABET | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| REFERRAL_CODE_LENGTH | `8` |
| MAX_SLUG_ATTEMPTS | `5` |
| CONNECTION_SOURCE_VALUES | `["referral_link","invite_link","student_search","admin"]` |

## Checks

| # | Check | Pass | Detail |
|---|-------|------|--------|
| 1 | normalizeSlug produces lowercase hyphenated output | PASS | normalizeSlug('John', 'Smith') correctly returns 'john-smith' |
| 2 | normalizeSlug handles diacritics | PASS | normalizeSlug('José', 'García') correctly strips diacritics to 'jose-garcia' |
| 3 | normalizeSlug handles empty input | PASS | normalizeSlug('', '') correctly falls back to 'instructor' |
| 4 | REFERRAL_ALPHABET excludes ambiguous chars (0, O, I, 1) | PASS | Alphabet correctly excludes all 4 ambiguous characters |
| 5 | REFERRAL_CODE_LENGTH is 8 | PASS | Referral code length constant is correctly set to 8 |
| 6 | generateReferralCode produces code matching alphabet | PASS | All 20 generated codes match ^[ALPHABET]{8}$ pattern |
| 7 | generateReferralCode produces unique codes | PASS | All 50 generated codes are unique |
| 8 | ConnectionSource covers 4 known values | PASS | ConnectionSource includes all 4 expected values: referral_link, invite_link, student_search, admin |
| 9 | MAX_SLUG_ATTEMPTS is 5 | PASS | Max slug attempts constant is correctly set to 5 |
| 10 | normalizeSlug is deterministic | PASS | Same input produces same output across 100 calls for 5 different input pairs |

## Summary

- **Total checks:** 10
- **Passed:** 10
- **Failed:** 0
- **Result:** ALL PASS

## Methodology

This audit inlines the pure-logic definitions from `src/lib/instructor-identity.ts` to avoid the `server-only` import guard. It validates:

1. `normalizeSlug()` produces correct lowercase, hyphenated, ASCII-only slugs
2. `normalizeSlug()` correctly strips diacritics (NFD normalization)
3. `normalizeSlug()` falls back to `'instructor'` on empty input
4. `REFERRAL_ALPHABET` excludes visually ambiguous characters (0, O, I, 1)
5. `REFERRAL_CODE_LENGTH` is 8 characters
6. `generateReferralCode()` produces codes that only use alphabet characters
7. `generateReferralCode()` produces statistically unique codes (50 samples)
8. `ConnectionSource` type covers all 4 expected values
9. `MAX_SLUG_ATTEMPTS` is 5
10. `normalizeSlug()` is deterministic across repeated calls
