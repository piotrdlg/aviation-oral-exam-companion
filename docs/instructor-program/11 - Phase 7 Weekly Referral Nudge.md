# Phase 7 — Weekly Referral Nudge

## Overview

Micro-add to the existing weekly instructor email. When an instructor has 0 connected students, the weekly email includes a referral CTA instead of the normal weekly summary. Instructors with 1 or more students see exactly the same email as before — no changes to the existing format.

## Template Changes

### `src/emails/instructor-weekly-summary.tsx`

Conditional rendering based on `totalStudents`:

| Condition | Render |
|-----------|--------|
| `totalStudents > 0` | Normal weekly summary (stats row, student cards, "Open Command Center" CTA) — **unchanged** |
| `totalStudents === 0` | Referral CTA variant (3-step guide, referral link, QR download link, courtesy disclaimer) |

### 0-Students Variant Content

1. **Heading**: "Get Started with Student Connections" (amber, centered)
2. **Intro**: "Connect with your students on HeyDPE in three simple steps:" (muted, centered)
3. **3-step guide** (dark cards with amber step numbers):
   - Step 1: Share your referral link with students
   - Step 2: Students click the link and sign up
   - Step 3: Once a student subscribes, you unlock courtesy access
4. **Referral link box**: dark card with "Your referral link:" label and clickable link
5. **CTA button**: "COPY REFERRAL LINK" (amber, full-width)
6. **QR download link**: "Download QR Code — Print or share with students"
7. **Courtesy disclaimer**: "Courtesy access (Checkride Prep tier) is automatically granted when at least one of your connected students has an active paid subscription." (muted, italic)

### New Props on `InstructorWeeklySummaryProps`

```typescript
referralCode?: string;
referralLink?: string;   // e.g. "https://heydpe.com/ref/ABCD1234"
qrUrl?: string;          // e.g. "https://heydpe.com/api/public/qr/referral/ABCD1234"
```

All three are optional and only populated for the 0-students variant.

## Builder Changes

### `src/lib/instructor-summary-builder.ts`

#### Previous Behavior

`buildInstructorWeeklySummary` returned `null` for instructors with 0 students, causing the weekly send script to skip them entirely.

#### New Behavior

- **0 students**: Returns a complete `InstructorWeeklySummaryProps` object with `totalStudents: 0`, empty students array, and referral props (`referralCode`, `referralLink`, `qrUrl`) populated from the instructor's referral code
- **>=1 students**: Returns the normal summary as before — referral props are **not** included

#### New Helper

```typescript
function buildReferralUrls(referralCode: string | undefined): {
  referralCode?: string;
  referralLink?: string;
  qrUrl?: string;
}
```

Uses `NEXT_PUBLIC_SITE_URL` env var (falls back to `https://aviation-oral-exam-companion.vercel.app`).

### `InstructorForEmail` Type Extension

```typescript
export interface InstructorForEmail {
  userId: string;
  email: string;
  displayName: string | null;
  referralCode?: string;  // NEW — from instructor_profiles.referral_code
}
```

## Script Changes

### `scripts/send-instructor-weekly.ts`

- Instructor query now includes `referral_code` in the SELECT
- `InstructorForEmail` constructed with `referralCode: instr.referral_code`
- 0-student instructors are no longer skipped — they receive the referral nudge variant

## Backwards Compatibility

Instructors **with** students see exactly the same email as before. The referral props (`referralCode`, `referralLink`, `qrUrl`) are only populated when `totalStudents === 0`, and the template only renders the referral CTA in that branch. Shared elements (greeting, sign-off, unsubscribe footer) are identical in both variants.

## Sample Renders

Sample HTML renders saved in evidence folder:
- `docs/instructor-program/evidence/2026-03-06-phase7/email/weekly-0-students.html`
- `docs/instructor-program/evidence/2026-03-06-phase7/email/weekly-with-students.html`

## Testing

- `src/lib/__tests__/instructor-summary-builder.test.ts` — 6 new tests:
  1. Returns data with referral CTA when 0 students
  2. Returns data without referral CTA when >= 1 students
  3. `referralLink` and `qrUrl` are populated from `referralCode`
  4. `referralLink` and `qrUrl` are undefined when no `referralCode`
  5. Uses fallback base URL when `NEXT_PUBLIC_SITE_URL` is not set
  6. Uses "Instructor" as fallback name when `displayName` is null

## Files

### Modified Files

- `src/emails/instructor-weekly-summary.tsx` — conditional referral CTA, new props, new styles
- `src/lib/instructor-summary-builder.ts` — `buildReferralUrls()`, 0-student handling, `InstructorForEmail.referralCode`
- `scripts/send-instructor-weekly.ts` — `referral_code` in SELECT, `referralCode` prop pass-through

### New Files

- `src/lib/__tests__/instructor-summary-builder.test.ts` — 6 unit tests

## Rollback

All changes are additive. To rollback:
- Revert the three modified files
- Delete the new test file
- The weekly email reverts to skipping 0-student instructors (previous behavior)
