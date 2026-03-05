---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, email, nudge, re-engagement, retention]
status: final
evidence_level: high
---

# 60 — Motivation Nudge Engine

**Phase:** 20 — Email Preferences + Learning Digest Engine
**Date:** 2026-03-04
**Scope:** Decaying cadence nudge system for inactive users, resolving Gap 3 from [[57 - Email Gaps and Recommendations]]

---

## Overview

The motivation nudge engine sends re-engagement emails to users who have stopped practicing, using a decaying cadence that starts frequent and tapers off. Each milestone has a distinct message variant tailored to the duration of inactivity. The system respects email preferences (users can opt out of `motivation_nudges`) and deduplicates via `email_logs` to prevent sending the same milestone twice.

---

## Cadence Policy

| Milestone (days) | Variant | Heading |
|-------------------|---------|---------|
| 1 | `day_1` | "Miss you already! Quick 5-minute practice?" |
| 3 | `day_3` | "Your weak areas are waiting." |
| 7 | `day_7` | "A week away? Your DPE won't wait." |
| 14 | `day_14` | "Don't lose your progress." |
| 30 | `day_30` | "30 days is a long time." |

After day 30, no further nudges are sent. The decaying cadence avoids over-contacting long-inactive users.

---

## Milestone Matching

The nudge engine (`src/lib/nudge-engine.ts`) calculates days since each user's last session and checks against milestone targets with tolerance windows:

| Milestone | Tolerance |
|-----------|-----------|
| 1, 3, 7 days | +/- 1 day |
| 14, 30 days | +/- 2 days |

Tolerance windows account for cron timing variance and ensure users are not skipped if the script runs slightly early or late.

### Deduplication

Before sending, the engine queries `email_logs` for any prior `motivation_nudges` entry with a matching milestone in the metadata. If a nudge for that milestone has already been sent to that user, it is skipped. This prevents duplicate sends on script re-runs or overlapping tolerance windows.

---

## Email Template

**File:** `src/emails/motivation-nudge.tsx`

Each variant has its own heading, body copy, and CTA text, selected by the milestone. The template includes:

- **Variant-specific heading** -- tone shifts from playful (day 1) to urgent (day 30)
- **Body text** -- contextual motivation tied to checkride preparation
- **Stats** -- days since last session, total sessions completed
- **CTA button** -- "Start Practicing" linking to `/practice`
- **Unsubscribe footer** -- category-specific one-click unsubscribe link for `motivation_nudges`

Uses the HeyDPE dark theme (gray-950 base, amber accent) consistent with all other email templates.

---

## Cron Script

**File:** `scripts/email/send-nudges.ts`
**npm command:** `npm run email:nudges`

### Execution Flow

1. Query eligible users via `get_email_eligible_users('motivation_nudges')`
2. For each user, calculate days since last session
3. Match against milestone targets with tolerance windows
4. Check `email_logs` for prior sends of the matched milestone -- skip if already sent
5. Render and send via the nudge send function
6. Log to `email_logs` with category, subject, Resend ID, and milestone metadata
7. Rate limiting: 200ms delay between sends

### Safety

- Users with no sessions at all are skipped (they receive welcome flow emails instead)
- Users who have practiced within the last 24 hours are never nudged
- The script is idempotent and safe for cron retry

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/nudge-engine.ts` | Milestone matching, tolerance windows, deduplication logic |
| `src/emails/motivation-nudge.tsx` | React Email template with variant-specific copy |
| `scripts/email/send-nudges.ts` | Cron script with rate limiting and idempotency |

---

## Related Documents

- [[58 - Email Preference System Architecture]] -- Preference and unsubscribe infrastructure used by this engine
- [[59 - Learning Digest Engine]] -- Companion lifecycle email for active users
- [[57 - Email Gaps and Recommendations]] -- Gap 3 (re-engagement email) resolved by this work
