---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, email, learning-digest, engagement]
status: final
evidence_level: high
---

# 59 — Learning Digest Engine

**Phase:** 20 — Email Preferences + Learning Digest Engine
**Date:** 2026-03-04
**Scope:** Grounded daily email briefing based on user's actual practice performance, resolving Gap 2 from [[57 - Email Gaps and Recommendations]]

---

## Overview

The learning digest is a daily email that summarizes a user's recent practice performance, highlights weak ACS elements, reinforces strong areas, and provides actionable study recommendations. All data is grounded in the user's actual session history -- no generic tips or fabricated statistics. The digest is sent only to users who have opted in (enabled by default) and who have at least one practice session on record.

---

## Data Pipeline

The digest builder (`src/lib/digest-builder.ts`) assembles per-user data from two sources:

1. **Element scores** via `get_element_scores` RPC -- per-element satisfactory rates across all sessions
2. **Recent sessions** (7-day window) -- session count and total exchange count

### Derived Metrics

| Metric | Logic |
|--------|-------|
| Weak areas | Elements with satisfactory rate < 80%, sorted worst-first, top 5 |
| Strong areas | Elements with satisfactory rate >= 80%, sorted best-first, top 3 |
| Recommendations | Auto-generated from weakness patterns (e.g., "Focus on Area II — Preflight Procedures") |
| Session stats | Sessions in last 7 days, total exchanges, overall satisfactory rate |

Users with no practice data are skipped entirely -- no empty or placeholder digests are sent.

---

## Email Template

**File:** `src/emails/learning-digest.tsx`

The template uses React Email components with the HeyDPE dark theme (gray-950 base, amber accent). Key sections:

- **Stats row** -- sessions this week, exchanges, overall score
- **Weak areas** -- progress bars with color coding: red (< 50%), amber (50-79%), green (>= 80%)
- **Strong areas** -- green progress bars for top performers
- **Recommendations** -- bulleted study suggestions derived from weak elements
- **CTA button** -- "Practice Now" linking to `/practice`
- **Unsubscribe footer** -- category-specific one-click unsubscribe link via HMAC token

---

## Cron Script

**File:** `scripts/email/send-daily-digest.ts`
**npm command:** `npm run email:daily-digest`

### Execution Flow

1. Query eligible users via `get_email_eligible_users('learning_digest')`
2. For each user, check `email_logs` for an existing `learning_digest` entry sent today -- skip if found (idempotency)
3. Build digest data via `buildDigestData(userId)`
4. Skip users with no practice data (no sessions on record)
5. Render and send via `sendLearningDigest()`
6. Log to `email_logs` with category, subject, and Resend ID
7. Rate limiting: 200ms delay between sends to avoid provider throttling

### Idempotency

The script checks `email_logs` before sending to ensure no user receives a duplicate digest on re-run. This makes the script safe for cron retry or manual re-execution.

---

## Send Function

`sendLearningDigest()` in `src/lib/email.ts`:

- Sets `List-Unsubscribe` and `List-Unsubscribe-Post` headers for RFC 8058 one-click unsubscribe
- Generates category-specific HMAC token for `learning_digest`
- Logs send to `email_logs` via `logEmailSent()`
- Non-blocking error handling (logs failure, does not throw)

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/digest-builder.ts` | Data assembly: element scores, session stats, recommendations |
| `src/emails/learning-digest.tsx` | React Email template with progress bars and stats |
| `scripts/email/send-daily-digest.ts` | Cron script with idempotency and rate limiting |

---

## Related Documents

- [[58 - Email Preference System Architecture]] -- Preference and unsubscribe infrastructure used by this engine
- [[60 - Motivation Nudge Engine]] -- Companion lifecycle email for inactive users
- [[57 - Email Gaps and Recommendations]] -- Gap 2 (weekly learning summary) resolved by this work
