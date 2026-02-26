# Session Policy Redesign — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the corresponding implementation plan.

**Goal:** Separate the concepts of "exam" (a scored attempt with a fixed configuration) from "session" (a technical activity window), fix stale session accumulation, enforce a 3-exam free trial limit, and guarantee reliable transcript recording.

**Architecture:** Reuse existing tables (`exam_sessions` = exams, `active_sessions` = activity windows). Add columns for trial enforcement, exam grading, and expiry. Use pg_cron for automated cleanup. Make all transcript writes blocking.

**Tech Stack:** Supabase PostgreSQL (pg_cron), Next.js API routes, React client

---

## Problem Statement

The admin dashboard shows 48 "active" exam sessions despite almost zero real activity in the last 24 hours. Root causes:

1. **No auto-termination**: Sessions stay `active` indefinitely if the user never clicks "End Session"
2. **Conflated concepts**: "Exam" (the scored attempt) and "session" (the activity window) are the same entity
3. **No trial limit enforcement**: Free users can create unlimited exams (current tier gives 60/month)
4. **Fire-and-forget writes**: Transcript and assessment data can be silently lost
5. **No exam grading**: No computed result stored when an exam ends

---

## Core Concepts

### Exam (`exam_sessions` table)

A **scored attempt** with a fixed configuration. Represents the user's choice of rating, aircraft class, difficulty, study mode, and selected ACS areas/tasks. An exam accumulates Q&A exchanges, element scores, and ACS coverage over one or more sessions.

- **Created** when user starts a new exam from the config screen
- **Persists** across multiple activity sessions (user can close tab and come back)
- **Completed** when user explicitly ends it OR the planner exhausts all tasks
- **Expired** after 7 days for free trial users (pg_cron)
- **Graded** on completion — result stored in `result` JSONB column

Free trial users: **3 lifetime exams** (onboarding exam excluded).

### Session (`active_sessions` table)

A **technical activity window** within an exam. Tracks which device is active and when the last API call happened.

- **Created** when user starts or resumes an exam
- **Refreshed** on every `respond` or `next-task` API call
- **Expired** after 2 hours of inactivity (pg_cron)
- **Expiring a session does NOT close the exam** — the exam stays resumable

### Transcript (`session_transcripts` table)

A **reliable record** of every exchange: student answer text, examiner question/response text, and the system's grading assessment. All writes are blocking (awaited), not fire-and-forget.

---

## Data Model Changes

### `exam_sessions` — New Columns

```sql
ALTER TABLE exam_sessions ADD COLUMN is_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exam_sessions ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN result JSONB;
```

| Column | Type | Purpose |
|--------|------|---------|
| `is_onboarding` | `BOOLEAN` | Onboarding wizard exams don't count against trial limit |
| `expires_at` | `TIMESTAMPTZ` | 7 days from creation for free trial exams; NULL for paid |
| `result` | `JSONB` | Computed grade on exam completion (see Grading section) |

### `exam_sessions` — Status Constraint Update

```sql
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_status_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'expired', 'abandoned'));
```

Note: `errored` removed (never used, no planned use). `expired` added for 7-day trial expiry.

---

## Exam Lifecycle

```
                    ┌─────────────────────────┐
                    │      create (API)        │
                    └──────────┬──────────────┘
                               ▼
                          ┌─────────┐
              ┌──────────▶│  active  │◀──────────┐
              │           └────┬────┘            │
              │                │                 │
         resume (API)    ┌─────┼─────┐      resume (API)
              │          │     │     │           │
              │          ▼     ▼     ▼           │
              │    user   device  planner        │
              │    ends   switch  exhausts       │
              │          │     │     │           │
              │          ▼     │     ▼           │
              │    ┌──────┐   │  ┌──────────┐   │
              │    │compl.│   │  │ completed │   │
              │    └──────┘   │  │ (graded)  │   │
              │               ▼  └──────────┘   │
              │          ┌────────┐              │
              └──────────│ paused │──────────────┘
                         └───┬────┘
                             │
                        7-day expiry
                        (free trial)
                             │
                             ▼
                        ┌─────────┐
                        │ expired │
                        └─────────┘
```

### Completion Triggers

| Trigger | Detection | Status Set |
|---------|-----------|-----------|
| User clicks "End Exam" | Client calls `POST /api/session { action: 'update', status: 'completed' }` | `completed` |
| Planner exhausts all elements | `next-task` returns `{ examComplete: true }` | `completed` |
| 7-day expiry (free trial) | pg_cron checks `expires_at < NOW()` | `expired` |

In all cases where status becomes `completed`, the exam is graded and `result` is populated.

---

## Session (Activity Window) Lifecycle

```
User starts/resumes exam
         │
         ▼
  UPSERT active_sessions
  (is_exam_active = true)
         │
         ├── respond/next-task refreshes last_activity_at
         │
         ├── 2 hours idle ──► pg_cron clears is_exam_active
         │                     (exam stays active/paused)
         │
         └── User closes tab ──► next visit shows resume card
                                  (exam stays active/paused)
```

Clearing an activity window (`is_exam_active = false`) does NOT change the exam's status. The exam remains `active` or `paused` and the resume card appears on the user's next visit.

---

## Exam Grading

### Result Schema

```json
{
  "grade": "satisfactory" | "unsatisfactory" | "incomplete",
  "total_elements_in_set": 24,
  "elements_asked": 18,
  "elements_satisfactory": 14,
  "elements_unsatisfactory": 3,
  "elements_partial": 1,
  "elements_not_asked": 6,
  "score_by_area": {
    "I": { "asked": 4, "satisfactory": 3, "unsatisfactory": 1 },
    "II": { "asked": 3, "satisfactory": 3, "unsatisfactory": 0 }
  },
  "completion_trigger": "user_ended" | "all_tasks_covered" | "expired",
  "graded_at": "2026-02-19T15:30:00Z"
}
```

### Grading Rules

| Grade | Condition |
|-------|-----------|
| `satisfactory` | All elements asked AND all scored satisfactory |
| `unsatisfactory` | At least one element scored unsatisfactory (regardless of coverage) |
| `incomplete` | Not all elements asked (user ended early or exam expired) |

### Grading Function

Pure function in `exam-logic.ts` — `computeExamResult(elementAttempts, totalElementsInSet, completionTrigger)`. Called server-side when exam status transitions to `completed` or `expired`.

---

## Free Trial Enforcement

### Counting Rule

```sql
SELECT count(*) FROM exam_sessions
WHERE user_id = $1
  AND is_onboarding = FALSE
  AND status != 'abandoned';
```

- Free trial users (`subscription_status = 'none'`): blocked at >= 3
- Paid users (`dpe_live` tier): no limit
- Onboarding exams: excluded from count
- Abandoned exams: excluded from count (system killed them)
- Expired exams: DO count (user had 7 days to use them)

### Enforcement Point

In `POST /api/session` action `create`:

```typescript
if (tier !== 'dpe_live') {
  const { count } = await supabase
    .from('exam_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_onboarding', false)
    .not('status', 'eq', 'abandoned');

  if ((count || 0) >= 3) {
    return NextResponse.json(
      { error: 'trial_limit_reached', limit: 3, upgrade_url: '/pricing' },
      { status: 403 }
    );
  }
}
```

### Exam Creation with Expiry

When a free trial user creates an exam:

```typescript
const expiresAt = tier !== 'dpe_live'
  ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  : null;
```

### Onboarding Flag

The onboarding wizard passes `is_onboarding: true` when creating a session. This flag is immutable after creation.

---

## pg_cron Jobs

### Job 1: Clear Stale Activity Windows (every 15 minutes)

```sql
SELECT cron.schedule(
  'clear-stale-activity-windows',
  '*/15 * * * *',
  $$
    UPDATE active_sessions
    SET is_exam_active = FALSE, exam_session_id = NULL
    WHERE is_exam_active = TRUE
      AND last_activity_at < NOW() - INTERVAL '2 hours';
  $$
);
```

### Job 2: Expire Free Trial Exams (every hour)

```sql
SELECT cron.schedule(
  'expire-trial-exams',
  '0 * * * *',
  $$
    UPDATE exam_sessions
    SET status = 'expired', ended_at = NOW()
    WHERE status IN ('active', 'paused')
      AND expires_at IS NOT NULL
      AND expires_at < NOW();
  $$
);
```

### Job 3: Clean Up Orphaned Exams (daily)

```sql
SELECT cron.schedule(
  'cleanup-orphaned-exams',
  '0 3 * * *',
  $$
    UPDATE exam_sessions
    SET status = 'abandoned', ended_at = NOW()
    WHERE status = 'active'
      AND exchange_count = 0
      AND started_at < NOW() - INTERVAL '24 hours';
  $$
);
```

---

## Reliable Transcript Recording

### All Transcript Writes Become Blocking

| Write | Current | New |
|-------|---------|-----|
| Student answer INSERT | Blocking | Blocking (no change) |
| Examiner response INSERT | Fire-and-forget | **Blocking (awaited)** |
| Assessment UPDATE | Fire-and-forget | **Blocking (awaited)** |
| Element attempts INSERT | Fire-and-forget | **Blocking (awaited)** |
| Transcript citations INSERT | Fire-and-forget | **Blocking (awaited)** |

### Streaming Response Handling

For streaming responses (`stream: true`), the examiner transcript is written in the `onComplete` callback. This callback must be awaited before the SSE stream closes. The stream stays open slightly longer (~50-100ms) while the write completes.

### Error Handling

If a transcript write fails:
- Log the error with full context (user_id, session_id, exchange_number)
- Include `{ transcript_warning: true }` in the API response
- Client shows a non-blocking warning: "Some data may not have been saved"
- Do NOT block the exam flow — the user can continue

---

## User-Facing Terminology Updates

| Current | New | Location |
|---------|-----|----------|
| "Recent Sessions" | "Recent Exams" | Progress page |
| "End Session" | "End Exam" | Practice page button |
| "Resume Session" / "Continue" | "Continue Exam" | Resume card |
| "Start New" | "Start New Exam" | Resume card |
| "Session superseded" error | "Exam paused on this device" | Error toast |
| Session count on resume card | Exam config summary (e.g., "Private ASEL, Easy") | Resume card |

### Progress Page "Recent Exams" Table

Columns:
- Exam config summary (rating + aircraft class + difficulty)
- Result/grade (Satisfactory / Unsatisfactory / Incomplete / In Progress)
- Date started
- Date completed (or "In Progress")
- Exchange count
- ACS coverage percentage

---

## Files Affected

### Database Migrations (new)
- `supabase/migrations/YYYYMMDD_session_policy_redesign.sql`
  - Add columns: `is_onboarding`, `expires_at`, `result`
  - Update status constraint
  - Create pg_cron jobs
  - Backfill: mark all current `active` sessions with 0 exchanges as `abandoned`

### API Routes (modify)
- `src/app/api/session/route.ts` — Trial limit enforcement on `create`, exam grading on `update` to `completed`
- `src/app/api/exam/route.ts` — Blocking transcript writes, auto-complete on planner exhaustion, pass `is_onboarding` flag

### Library (modify + new)
- `src/lib/exam-logic.ts` — Add `computeExamResult()` pure function
- `src/lib/exam-engine.ts` — Blocking writes, grading integration

### Client (modify)
- `src/app/(dashboard)/practice/page.tsx` — Terminology updates, trial limit error handling, exam result display
- `src/app/(dashboard)/practice/components/OnboardingWizard.tsx` — Pass `is_onboarding: true`
- `src/app/(dashboard)/practice/components/SessionConfig.tsx` — Trial limit warning
- `src/app/(dashboard)/progress/page.tsx` — "Recent Exams" table, grade display

### Types (modify)
- `src/types/database.ts` — Add new columns to `ExamSession` interface

---

## Migration Strategy

### Backfill Existing Data

```sql
-- Mark stale active sessions as abandoned
UPDATE exam_sessions
SET status = 'abandoned', ended_at = NOW()
WHERE status = 'active'
  AND (
    exchange_count = 0
    OR started_at < NOW() - INTERVAL '7 days'
  );

-- Set expires_at for existing free trial active/paused exams
UPDATE exam_sessions e
SET expires_at = e.started_at + INTERVAL '7 days'
FROM user_profiles p
WHERE e.user_id = p.user_id
  AND p.subscription_status = 'none'
  AND e.status IN ('active', 'paused');
```

This immediately cleans up the 48 stale sessions and sets expiry dates going forward.

---

## Out of Scope

- Renaming `exam_sessions` table to `exams` (too many downstream references, not worth the migration)
- Renaming `session_transcripts` table (same reason)
- Session resume via `sendBeacon()` (optimization, not policy)
- Unifying exchange number calculation (consistency issue, separate fix)
- Removing unused schema columns (cleanup, separate fix)
