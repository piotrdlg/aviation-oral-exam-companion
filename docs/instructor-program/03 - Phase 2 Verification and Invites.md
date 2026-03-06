# Phase 2 — Fast-Path Verification + Instructor-Initiated Invitations

## Overview
Phase 2 adds automated FAA verification of instructor credentials and a complete invite flow for connecting instructors with students. Key capabilities:
- Hybrid FAA verification using the FAA Airmen Certification Releasable Database
- Fast-path auto-approval for high-confidence single-match verifications
- Instructor-initiated invite links (DB-backed tokens, 30-day expiry)
- Student invite claim flow with connection creation
- Verification evidence display in admin review panel
- Full audit trail: every verification decision is explainable

## Architecture

### Verification Pipeline
1. Instructor submits application with name + certificate type + certificate number
2. API route (`/api/user/instructor`) calls `verifyInstructor()` from `instructor-verification.ts`
3. Verification queries `faa_airmen` (normalized names) + `faa_airmen_certs` tables
4. Pure function `computeVerificationResult()` determines confidence:
   - **HIGH** — exactly 1 exact name+cert match, no partial matches — auto-approve
   - **MEDIUM** — multiple matches, or partial name, or wrong cert type — manual review
   - **LOW** — name found but no instructor cert — manual review
   - **NONE** — no match or no FAA data — manual review
5. Result stored in `instructor_profiles` verification fields
6. Auto-approved profiles skip admin queue entirely

### FAA Data Constraint
The downloadable FAA dataset does NOT contain certificate numbers. Verification is name + cert type matching only. Every verification result includes `certificate_number_unverifiable` reason code.

### Invite Flow
1. Approved instructor creates invite via Settings page
2. System generates 48-char cryptographic token, stores in `instructor_invites`
3. Instructor copies invite URL and shares with student
4. Student opens `/invite/[token]` — sees instructor name + cert type
5. Student clicks "Accept Invite" — creates `student_instructor_connections` entry
6. Single-use tokens: each invite can be claimed once

## Database Changes

Migration: `20260305000002_instructor_verification.sql`

### instructor_profiles (ALTER TABLE)
| Column | Type | Notes |
|--------|------|-------|
| verification_status | TEXT | 'unverified', 'verified_auto', 'needs_manual_review', 'verified_admin' |
| verification_source | TEXT | e.g., 'faa_database' |
| verification_confidence | TEXT | 'high', 'medium', 'low', 'none' |
| verification_data | JSONB | Candidates, reason codes, explanation |
| verification_attempted_at | TIMESTAMPTZ | When verification ran |
| auto_approved | BOOLEAN | Whether fast-path was used |

### faa_airmen (new table)
Imported from FAA PILOT_BASIC.csv. Normalized name fields for matching.
- Unique index on (faa_unique_id, source_date)
- Normalized first_name and last_name for case-insensitive lookup

### faa_airmen_certs (new table)
Imported from FAA PILOT_CERT.csv.
- cert_type: P (Pilot), F (Flight Instructor), G (Ground Instructor)
- cert_level: rating text (e.g., "AIRPLANE SINGLE ENGINE LAND")

### faa_import_log (new table)
Audit trail for FAA data imports.

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260305000002_instructor_verification.sql` | Schema changes |
| `src/lib/instructor-verification.ts` | FAA verification matcher (pure + async) |
| `src/lib/instructor-invites.ts` | Invite generation, claiming, management |
| `scripts/instructor/import-faa-airmen.ts` | FAA CSV import pipeline |
| `src/app/api/user/instructor/invites/route.ts` | Invite CRUD API |
| `src/app/api/invite/[token]/route.ts` | Public invite lookup + claim |
| `src/app/invite/[token]/page.tsx` | Student invite claim page |
| `src/lib/__tests__/instructor-verification.test.ts` | 20 verification matcher tests |
| `src/lib/__tests__/instructor-invites.test.ts` | 16 invite flow tests |

## Files Modified

| File | Changes |
|------|---------|
| `src/types/database.ts` | Added verification + FAA types |
| `src/lib/instructor-access.ts` | Extended types, added VerificationPayload, auto-approve logic |
| `src/app/api/user/instructor/route.ts` | Added verification call in POST handler |
| `src/app/(dashboard)/settings/page.tsx` | Added invite management UI for approved instructors |
| `src/app/(admin)/admin/instructors/page.tsx` | Added verification evidence column + expandable detail |
| `src/lib/__tests__/instructor-access.test.ts` | Updated fixtures for new fields |
| `package.json` | Added instructor:import:faa script |

## Confidence Tiers

| Confidence | Criteria | Action |
|-----------|----------|--------|
| HIGH | Exactly 1 exact name + correct cert type match, no partial matches | Auto-approve |
| MEDIUM | Multiple matches, partial name, or mismatched cert type | Manual review |
| LOW | Name found but no instructor certificate | Manual review |
| NONE | No match or no FAA data imported | Manual review |

## Verification Reason Codes

| Code | Meaning |
|------|---------|
| unique_name_certtype_match | Single exact match found |
| multiple_candidates | Multiple FAA records match |
| name_match_no_instructor_cert | Name found but no instructor cert |
| no_name_match | No FAA record matches |
| partial_name_match | First name is initial/prefix match only |
| certificate_number_unverifiable | Always present — FAA dataset lacks cert numbers |
| manual_review_required | Catch-all for non-auto cases |
| faa_data_not_available | No FAA import completed yet |

## Test Coverage

- 20 verification matcher tests (computeVerificationResult pure function)
- 16 invite flow tests (token generation, URL building, create/claim with mocked DB)
- Total project: 842 tests, 0 typecheck errors

## Verification

- `npm run typecheck` — 0 errors
- `npm test` — 842/842 pass
