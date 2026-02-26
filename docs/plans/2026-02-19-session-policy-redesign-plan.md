# Session Policy Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate "exam" from "session", fix stale session accumulation with pg_cron, enforce 3-exam free trial limit (onboarding excluded), add exam grading, and make all transcript writes reliable.

**Architecture:** Reuse existing tables (`exam_sessions` = exams, `active_sessions` = activity windows). Add `is_onboarding`, `expires_at`, `result` columns. pg_cron for cleanup. Blocking transcript writes. Pure-function grading in `exam-logic.ts`.

**Tech Stack:** Supabase PostgreSQL (pg_cron extension), Next.js 16 App Router, TypeScript, Vitest, Tailwind CSS v4

**Design doc:** `docs/plans/2026-02-19-session-policy-redesign-design.md`

---

## Task 1: Database Migration — Schema Changes + pg_cron + Backfill

**Files:**
- Create: `supabase/migrations/20260219100001_session_policy_redesign.sql`

**Context:** The `exam_sessions` table currently has a status check constraint allowing `('active', 'paused', 'completed', 'abandoned', 'errored')`. We need to swap `errored` for `expired`, add three new columns, enable pg_cron, schedule three cron jobs, and backfill stale data. The pg_cron extension must be enabled in the Supabase dashboard first (Extensions tab > search "pg_cron" > enable).

**Step 1: Write the migration SQL**

```sql
-- Session Policy Redesign: schema changes, pg_cron jobs, and backfill
-- Design doc: docs/plans/2026-02-19-session-policy-redesign-design.md

-- 1. Add new columns
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS is_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS result JSONB;

-- 2. Update status constraint: replace 'errored' with 'expired'
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_status_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'expired', 'abandoned'));

-- 3. Index for trial limit counting (fast count of non-onboarding exams per user)
CREATE INDEX IF NOT EXISTS idx_exam_sessions_trial_count
  ON exam_sessions(user_id, is_onboarding, status)
  WHERE is_onboarding = FALSE AND status != 'abandoned';

-- 4. Index for expiry cron job
CREATE INDEX IF NOT EXISTS idx_exam_sessions_expires
  ON exam_sessions(expires_at)
  WHERE expires_at IS NOT NULL AND status IN ('active', 'paused');

-- 5. Backfill: mark stale active sessions as abandoned
UPDATE exam_sessions
SET status = 'abandoned', ended_at = NOW()
WHERE status = 'active'
  AND (
    exchange_count = 0
    OR started_at < NOW() - INTERVAL '7 days'
  );

-- 6. Backfill: set expires_at for existing free-trial active/paused exams
UPDATE exam_sessions e
SET expires_at = e.started_at + INTERVAL '7 days'
FROM user_profiles p
WHERE e.user_id = p.user_id
  AND p.subscription_status = 'none'
  AND e.status IN ('active', 'paused')
  AND e.expires_at IS NULL;

-- 7. pg_cron jobs (requires pg_cron extension enabled in Supabase dashboard)
-- NOTE: If pg_cron is not yet enabled, these will fail. Enable it first:
--   Supabase Dashboard > Database > Extensions > search "pg_cron" > Enable

-- Job 1: Clear stale activity windows (every 15 minutes)
-- Clears is_exam_active on devices idle for 2+ hours.
-- Does NOT change the exam's status — exam stays resumable.
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

-- Job 2: Expire free trial exams past their 7-day window (every hour)
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

-- Job 3: Clean up orphaned exams with 0 exchanges (daily at 3 AM UTC)
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

**Step 2: Apply migration locally**

Run: `npx supabase db push` or apply via Supabase dashboard SQL editor.

Before running, enable pg_cron:
1. Go to Supabase Dashboard > Database > Extensions
2. Search "pg_cron"
3. Enable it
4. Then run the migration

**Step 3: Verify**

Run in SQL editor:
```sql
-- Verify columns exist
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'exam_sessions' AND column_name IN ('is_onboarding', 'expires_at', 'result');

-- Verify backfill worked (should be 0 or very few active sessions now)
SELECT status, count(*) FROM exam_sessions GROUP BY status;

-- Verify cron jobs
SELECT * FROM cron.job;
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260219100001_session_policy_redesign.sql
git commit -m "feat: add session policy schema changes, pg_cron jobs, and backfill"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts:79-96` (ExamSession interface)
- Modify: `src/types/database.ts:85` (status union type)

**Context:** The `ExamSession` interface must match the new schema columns. Add `ExamResult` interface for the `result` JSONB column. Update status union to include `'expired'` and remove `'errored'`.

**Step 1: Add ExamResult interface and update ExamSession**

In `src/types/database.ts`, after the `AssessmentResult` interface (line 133), add:

```typescript
export type ExamGrade = 'satisfactory' | 'unsatisfactory' | 'incomplete';
export type CompletionTrigger = 'user_ended' | 'all_tasks_covered' | 'expired';

export interface ExamResult {
  grade: ExamGrade;
  total_elements_in_set: number;
  elements_asked: number;
  elements_satisfactory: number;
  elements_unsatisfactory: number;
  elements_partial: number;
  elements_not_asked: number;
  score_by_area: Record<string, {
    asked: number;
    satisfactory: number;
    unsatisfactory: number;
  }>;
  completion_trigger: CompletionTrigger;
  graded_at: string;
}
```

Update `ExamSession` interface (line 79-96):
- Change status type from `'active' | 'paused' | 'completed' | 'abandoned' | 'errored'` to `'active' | 'paused' | 'completed' | 'expired' | 'abandoned'`
- Add `is_onboarding: boolean;`
- Add `expires_at: string | null;`
- Add `result: ExamResult | null;`

**Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add ExamResult type, is_onboarding, expires_at to ExamSession"
```

---

## Task 3: Exam Grading Pure Function + Tests (TDD)

**Files:**
- Modify: `src/lib/exam-logic.ts` (add `computeExamResult` function)
- Modify: `src/lib/__tests__/exam-logic.test.ts` (add grading tests)

**Context:** The grading function is a pure function with zero dependencies. It takes element attempt data and returns an `ExamResult`. Three grades: `satisfactory` (all asked, all satisfactory), `unsatisfactory` (any unsatisfactory), `incomplete` (not all elements asked).

**Step 1: Write the failing tests**

Add to `src/lib/__tests__/exam-logic.test.ts`:

```typescript
import { computeExamResult } from '../exam-logic';
import type { CompletionTrigger } from '@/types/database';

describe('computeExamResult', () => {
  // Helper to create element attempt summaries
  function makeAttempts(entries: Array<{ code: string; score: 'satisfactory' | 'unsatisfactory' | 'partial' }>) {
    return entries.map(e => ({
      element_code: e.code,
      score: e.score,
      area: e.code.split('.')[1], // e.g., "PA.I.A.K1" -> "I"
    }));
  }

  it('returns satisfactory when all elements asked and all satisfactory', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.I.A.R1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 3, 'all_tasks_covered');
    expect(result.grade).toBe('satisfactory');
    expect(result.elements_asked).toBe(3);
    expect(result.elements_satisfactory).toBe(3);
    expect(result.elements_unsatisfactory).toBe(0);
    expect(result.elements_not_asked).toBe(0);
    expect(result.completion_trigger).toBe('all_tasks_covered');
  });

  it('returns unsatisfactory when any element is unsatisfactory', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'unsatisfactory' },
      { code: 'PA.II.A.K1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 3, 'user_ended');
    expect(result.grade).toBe('unsatisfactory');
    expect(result.elements_unsatisfactory).toBe(1);
  });

  it('returns incomplete when not all elements asked (user ended early)', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 5, 'user_ended');
    expect(result.grade).toBe('incomplete');
    expect(result.elements_asked).toBe(1);
    expect(result.elements_not_asked).toBe(4);
  });

  it('returns incomplete for expired exams', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 10, 'expired');
    expect(result.grade).toBe('incomplete');
    expect(result.completion_trigger).toBe('expired');
  });

  it('computes score_by_area correctly', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'unsatisfactory' },
      { code: 'PA.II.A.K1', score: 'satisfactory' },
      { code: 'PA.II.B.R1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 4, 'all_tasks_covered');
    expect(result.score_by_area['I']).toEqual({ asked: 2, satisfactory: 1, unsatisfactory: 1 });
    expect(result.score_by_area['II']).toEqual({ asked: 2, satisfactory: 2, unsatisfactory: 0 });
  });

  it('handles empty attempts (zero exchanges)', () => {
    const result = computeExamResult([], 10, 'user_ended');
    expect(result.grade).toBe('incomplete');
    expect(result.elements_asked).toBe(0);
    expect(result.elements_not_asked).toBe(10);
  });

  it('counts partial elements separately', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'partial' },
    ]);
    const result = computeExamResult(attempts, 2, 'all_tasks_covered');
    // Partial is NOT satisfactory, so grade should be unsatisfactory
    // (all elements asked but not all satisfactory)
    expect(result.grade).toBe('unsatisfactory');
    expect(result.elements_partial).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/exam-logic.test.ts --reporter=verbose`
Expected: FAIL — `computeExamResult is not a function`

**Step 3: Implement computeExamResult**

Add to `src/lib/exam-logic.ts` (after the existing utility functions, before the end of file):

```typescript
import type { ExamResult, ExamGrade, CompletionTrigger } from '@/types/database';

/**
 * Compute the grade and result summary for a completed exam.
 * Pure function — no external dependencies.
 *
 * @param attempts Array of { element_code, score, area } for all scored elements
 * @param totalElementsInSet Total number of elements in the exam's planned set
 * @param completionTrigger How the exam ended
 */
export function computeExamResult(
  attempts: Array<{ element_code: string; score: 'satisfactory' | 'unsatisfactory' | 'partial'; area: string }>,
  totalElementsInSet: number,
  completionTrigger: CompletionTrigger
): ExamResult {
  const elementsAsked = attempts.length;
  const elementsSatisfactory = attempts.filter(a => a.score === 'satisfactory').length;
  const elementsUnsatisfactory = attempts.filter(a => a.score === 'unsatisfactory').length;
  const elementsPartial = attempts.filter(a => a.score === 'partial').length;
  const elementsNotAsked = Math.max(0, totalElementsInSet - elementsAsked);

  // Build score by area
  const scoreByArea: Record<string, { asked: number; satisfactory: number; unsatisfactory: number }> = {};
  for (const attempt of attempts) {
    if (!scoreByArea[attempt.area]) {
      scoreByArea[attempt.area] = { asked: 0, satisfactory: 0, unsatisfactory: 0 };
    }
    scoreByArea[attempt.area].asked++;
    if (attempt.score === 'satisfactory') scoreByArea[attempt.area].satisfactory++;
    if (attempt.score === 'unsatisfactory') scoreByArea[attempt.area].unsatisfactory++;
  }

  // Determine grade
  let grade: ExamGrade;
  if (elementsAsked < totalElementsInSet) {
    grade = 'incomplete';
  } else if (elementsUnsatisfactory > 0 || elementsPartial > 0) {
    grade = 'unsatisfactory';
  } else {
    grade = 'satisfactory';
  }

  return {
    grade,
    total_elements_in_set: totalElementsInSet,
    elements_asked: elementsAsked,
    elements_satisfactory: elementsSatisfactory,
    elements_unsatisfactory: elementsUnsatisfactory,
    elements_partial: elementsPartial,
    elements_not_asked: elementsNotAsked,
    score_by_area: scoreByArea,
    completion_trigger: completionTrigger,
    graded_at: new Date().toISOString(),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/exam-logic.test.ts --reporter=verbose`
Expected: All new tests PASS

**Step 5: Commit**

```bash
git add src/lib/exam-logic.ts src/lib/__tests__/exam-logic.test.ts
git commit -m "feat: add computeExamResult() pure grading function with tests"
```

---

## Task 4: Trial Limit Enforcement in Session API

**Files:**
- Modify: `src/app/api/session/route.ts:15-36` (create action)

**Context:** The session create endpoint (`POST /api/session { action: 'create' }`) currently inserts a row with no limit checks. We need to:
1. Check trial limit (3 non-onboarding exams for free users)
2. Accept `is_onboarding` flag from client
3. Set `expires_at` for free trial exams (7 days from now)
4. Look up user tier to determine if limit applies

The `getUserTier` function is in `src/lib/voice/tier-lookup.ts` and needs a Supabase client. We'll need to import the service role client since the session route currently only uses the user's anon client.

**Step 1: Update the create action**

Replace the `if (action === 'create')` block (lines 15-36) in `src/app/api/session/route.ts`:

```typescript
if (action === 'create') {
  const { study_mode, difficulty_preference, selected_areas, aircraft_class, selected_tasks, rating, is_onboarding } = body;

  // Trial limit enforcement for free users
  const { getUserTier } = await import('@/lib/voice/tier-lookup');
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const tier = await getUserTier(serviceSupabase, user.id);

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

  // Set 7-day expiry for free trial exams
  const expiresAt = tier !== 'dpe_live'
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('exam_sessions')
    .insert({
      user_id: user.id,
      rating: rating || 'private',
      status: 'active',
      study_mode: study_mode || 'cross_acs',
      difficulty_preference: difficulty_preference || 'mixed',
      selected_areas: selected_areas || [],
      aircraft_class: aircraft_class || 'ASEL',
      selected_tasks: selected_tasks || [],
      is_onboarding: is_onboarding || false,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ session: data });
}
```

**Step 2: Add grading on exam completion in the update action**

In the same file, update the `if (action === 'update')` block. After `if (status === 'completed') updateData.ended_at = new Date().toISOString();` (line 44), add exam grading:

```typescript
if (status === 'completed') {
  updateData.ended_at = new Date().toISOString();

  // Compute exam result/grade
  if (sessionId) {
    try {
      const { computeExamResult } = await import('@/lib/exam-logic');
      // Load element attempts for this session
      const { data: attempts } = await supabase
        .from('element_attempts')
        .select('element_code, score')
        .eq('session_id', sessionId)
        .eq('tag_type', 'attempt')
        .not('score', 'is', null);

      // Load the exam's planner state to know total elements
      const { data: examRow } = await supabase
        .from('exam_sessions')
        .select('metadata')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      const plannerState = (examRow?.metadata as Record<string, unknown>)?.plannerState as { queue: string[] } | undefined;
      const totalElements = plannerState?.queue?.length || 0;

      if (attempts && totalElements > 0) {
        const attemptData = attempts.map(a => ({
          element_code: a.element_code,
          score: a.score as 'satisfactory' | 'unsatisfactory' | 'partial',
          area: a.element_code.split('.')[1],
        }));
        const result = computeExamResult(attemptData, totalElements, 'user_ended');
        updateData.result = result;
      }
    } catch (err) {
      console.error('Exam grading error:', err);
      // Don't block the completion update if grading fails
    }
  }
}
```

**Step 3: Verify locally**

Run the dev server and test:
1. Create a session as a free user — should work (count < 3)
2. Create 3 sessions — 4th should return 403 with `trial_limit_reached`
3. End a session — should have `result` JSONB populated

**Step 4: Commit**

```bash
git add src/app/api/session/route.ts
git commit -m "feat: add trial limit enforcement and exam grading on completion"
```

---

## Task 5: Make Transcript Writes Blocking in Exam API

**Files:**
- Modify: `src/app/api/exam/route.ts`

**Context:** Currently, examiner transcript inserts, assessment updates, element_attempts, and citations are fire-and-forget (`.then()` without await). This causes silent data loss. Change all to awaited writes. Focus on the streaming `respond` path (most critical) and the non-streaming path.

**Step 1: Fix streaming respond path (lines 391-444)**

Change the `onStreamComplete` callback from fire-and-forget to awaited. The callback must return a promise:

Replace lines 391-402:
```typescript
const onStreamComplete = async (fullText: string) => {
  if (sessionId && fullText) {
    const { error } = await supabase.from('session_transcripts').insert({
      session_id: sessionId,
      exchange_number: exchangeNumber,
      role: 'examiner',
      text: fullText,
    });
    if (error) console.error('Examiner transcript write error:', error.message);
  }
};
```

Replace lines 412-444 (the background assessment handler). Change from `.then().catch()` to proper async handling with awaited writes:

```typescript
assessmentPromise.then(async (assessment) => {
  logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });

  if (studentTranscriptId && assessment) {
    // All DB writes are now blocking (awaited)
    const { error: assessErr } = await serviceSupabase
      .from('session_transcripts')
      .update({ assessment })
      .eq('id', studentTranscriptId);
    if (assessErr) console.error('Assessment write error:', assessErr.message);

    if (sessionId) {
      await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
    }

    if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
      const citations = assessment.rag_chunks.map((chunk, idx) => ({
        transcript_id: studentTranscriptId,
        chunk_id: chunk.id,
        rank: idx + 1,
        score: chunk.score,
        snippet: chunk.content.slice(0, 300),
      }));
      const { error: citErr } = await serviceSupabase.from('transcript_citations').insert(citations);
      if (citErr) console.error('Citation write error:', citErr.message);
    }
  }
}).catch(err => console.error('Background assessment/DB error:', err));
```

**Step 2: Fix non-streaming respond path (lines 468-513)**

Replace the `Promise.all(dbWrites).catch(...)` fire-and-forget pattern with awaited writes:

```typescript
if (studentTranscriptId && assessment) {
  const { error: assessErr } = await serviceSupabase
    .from('session_transcripts')
    .update({ assessment })
    .eq('id', studentTranscriptId);
  if (assessErr) console.error('Assessment write error:', assessErr.message);

  if (sessionId) {
    await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
  }

  if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
    const citations = assessment.rag_chunks.map((chunk, idx) => ({
      transcript_id: studentTranscriptId,
      chunk_id: chunk.id,
      rank: idx + 1,
      score: chunk.score,
      snippet: chunk.content.slice(0, 300),
    }));
    const { error: citErr } = await serviceSupabase.from('transcript_citations').insert(citations);
    if (citErr) console.error('Citation write error:', citErr.message);
  }

  // Write examiner transcript (now awaited)
  if (sessionId) {
    const { error: examErr } = await supabase.from('session_transcripts').insert({
      session_id: sessionId,
      exchange_number: exchangeNumber,
      role: 'examiner',
      text: turn.examinerMessage,
    });
    if (examErr) console.error('Examiner transcript write error:', examErr.message);
  }
} else if (sessionId) {
  const { error: examErr } = await supabase.from('session_transcripts').insert({
    session_id: sessionId,
    exchange_number: exchangeNumber,
    role: 'examiner',
    text: turn.examinerMessage,
  });
  if (examErr) console.error('Examiner transcript error:', examErr.message);
}
```

**Step 3: Fix planner state persistence on start and next-task**

Lines 279-285 (start action metadata persist) — change fire-and-forget to awaited:
```typescript
if (sessionId) {
  const { error: metaErr } = await serviceSupabase
    .from('exam_sessions')
    .update({ metadata: { plannerState: plannerResult.plannerState, sessionConfig, taskData: plannerResult.task } })
    .eq('id', sessionId);
  if (metaErr) console.error('Planner state persist error:', metaErr.message);
}
```

Lines 611-618 (next-task action metadata persist) — same change:
```typescript
if (sessionId) {
  const { error: metaErr } = await serviceSupabase
    .from('exam_sessions')
    .update({ metadata: { plannerState: plannerResult.plannerState, sessionConfig, taskData: plannerResult.task } })
    .eq('id', sessionId);
  if (metaErr) console.error('Planner state persist error:', metaErr.message);
}
```

**Step 4: Add auto-complete when planner exhausts all elements**

In the `next-task` action (around lines 578-585), when `advancePlanner` returns null (queue exhausted), add grading before returning:

```typescript
if (!plannerResult) {
  // Exam is complete — all elements covered. Compute grade.
  if (sessionId) {
    try {
      const { computeExamResult } = await import('@/lib/exam-logic');
      const { data: attempts } = await supabase
        .from('element_attempts')
        .select('element_code, score')
        .eq('session_id', sessionId)
        .eq('tag_type', 'attempt')
        .not('score', 'is', null);

      const totalElements = clientPlannerState.queue.length;
      const attemptData = (attempts || []).map(a => ({
        element_code: a.element_code,
        score: a.score as 'satisfactory' | 'unsatisfactory' | 'partial',
        area: a.element_code.split('.')[1],
      }));
      const result = computeExamResult(attemptData, totalElements, 'all_tasks_covered');

      await serviceSupabase
        .from('exam_sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString(), result })
        .eq('id', sessionId);
    } catch (err) {
      console.error('Auto-complete grading error:', err);
    }
  }

  return NextResponse.json({
    examinerMessage: 'We have covered all the elements in your study plan. Great job today!',
    sessionComplete: true,
  });
}
```

**Step 5: Verify**

Run: `npm run build` — ensure no TypeScript errors.
Test manually: start an exam, answer questions, verify transcripts are reliably in the DB.

**Step 6: Commit**

```bash
git add src/app/api/exam/route.ts
git commit -m "feat: make all transcript writes blocking, add auto-complete grading"
```

---

## Task 6: Onboarding Wizard — Pass is_onboarding Flag

**Files:**
- Modify: `src/app/(dashboard)/practice/components/OnboardingWizard.tsx`
- Modify: `src/app/(dashboard)/practice/page.tsx` (startSession function)

**Context:** The onboarding wizard creates an exam to let new users try the app. This exam should NOT count against the 3-exam trial limit. The wizard's `onComplete` callback provides config data to the practice page's `startSession()` function. We need to thread `is_onboarding: true` through from the wizard to the session create API call.

**Step 1: Update OnboardingWizard onComplete callback type**

In `src/app/(dashboard)/practice/components/OnboardingWizard.tsx`, update the `Props` interface (line 8-23) to add `is_onboarding` to the config returned by `onComplete`:

The `onComplete` callback type already returns a config object. The wizard should set `is_onboarding: true` when calling `onComplete`. No type change needed — just ensure the practice page reads it.

**Step 2: Update startSession in practice/page.tsx**

In `src/app/(dashboard)/practice/page.tsx`, find the `startSession` function (around line 400). Add `is_onboarding` to the session create fetch body.

Update the `SessionConfigData` type (or wherever the config type is defined for `startSession`) to include `isOnboarding?: boolean`.

In the session create fetch call (around line 436-448), add `is_onboarding`:

```typescript
body: JSON.stringify({
  action: 'create',
  rating: configData.rating,
  study_mode: configData.studyMode,
  difficulty_preference: configData.difficulty,
  selected_areas: configData.selectedAreas,
  aircraft_class: configData.aircraftClass,
  selected_tasks: configData.selectedTasks,
  is_onboarding: configData.isOnboarding || false,
}),
```

**Step 3: Update the onboarding completion handler**

Find where the onboarding wizard's `onComplete` result is passed to `startSession`. Ensure it includes `isOnboarding: true` when the session originates from onboarding.

**Step 4: Commit**

```bash
git add src/app/(dashboard)/practice/components/OnboardingWizard.tsx src/app/(dashboard)/practice/page.tsx
git commit -m "feat: pass is_onboarding flag from onboarding wizard to session create"
```

---

## Task 7: Client-Side Trial Limit Error Handling

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx` (startSession function)
- Modify: `src/app/(dashboard)/practice/components/SessionConfig.tsx`

**Context:** When the session create API returns `{ error: 'trial_limit_reached', limit: 3, upgrade_url: '/pricing' }` with status 403, the client should show an upgrade prompt instead of crashing or showing a generic error.

**Step 1: Handle trial_limit_reached in startSession**

In `src/app/(dashboard)/practice/page.tsx`, after the session create fetch (around line 449-454), add error handling:

```typescript
const sessionData = await sessionRes.json();
if (!sessionRes.ok) {
  if (sessionData.error === 'trial_limit_reached') {
    setError(`You've used all ${sessionData.limit} free exam slots. Upgrade to continue practicing.`);
    setSessionActive(false);
    setLoading(false);
    return;
  }
  throw new Error(sessionData.error || 'Failed to create session');
}
```

**Step 2: Add upgrade link in error display**

Where the error is displayed in the practice page UI, check if the error message includes "Upgrade" and render a link to `/pricing`:

```typescript
{error && (
  <div className="...">
    <p>{error}</p>
    {error.includes('Upgrade') && (
      <Link href="/pricing" className="text-c-amber underline mt-2 inline-block">
        View Plans
      </Link>
    )}
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/app/(dashboard)/practice/page.tsx src/app/(dashboard)/practice/components/SessionConfig.tsx
git commit -m "feat: handle trial_limit_reached error with upgrade prompt"
```

---

## Task 8: UI Terminology Updates — Practice Page

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`

**Context:** Rename all user-facing "session" references to "exam" in the practice page.

**Step 1: Find and replace user-facing strings**

Search for these strings and replace:

| Find | Replace |
|------|---------|
| `"End Session"` or `"END SESSION"` | `"End Exam"` or `"END EXAM"` |
| `"Start New"` | `"Start New Exam"` |
| `"Continue"` (in resume card context) | `"Continue Exam"` |
| `"session superseded"` | `"exam paused on this device"` |
| `"This exam session has been superseded"` | `"This exam has been paused by another device"` |
| `"Your exam on another device has been paused"` | Keep as-is (already correct) |

**Important:** Only change user-facing strings, NOT variable names, API parameters, or comments. The internal code still uses `session` terminology (matching table names).

**Step 2: Update resume card to show exam config summary**

In the resume card UI, instead of showing just the date and exchange count, show:
- Rating label + aircraft class + difficulty
- Example: "Private ASEL, Easy — 12 exchanges"

**Step 3: Commit**

```bash
git add src/app/(dashboard)/practice/page.tsx
git commit -m "feat: rename session -> exam in practice page UI"
```

---

## Task 9: UI Terminology Updates — Progress Page

**Files:**
- Modify: `src/app/(dashboard)/progress/page.tsx:451` ("RECENT SESSIONS" heading)
- Modify: `src/app/(dashboard)/progress/page.tsx:458-493` (session list items)
- Modify: `src/app/(dashboard)/progress/page.tsx:348-350` (stats section)
- Modify: `src/app/(dashboard)/progress/page.tsx:33-44` (Session interface — add result field)

**Context:** The progress page "Recent Sessions" section becomes "Recent Exams". Each list item should show exam config summary and grade (if available). The stats section should say "EXAMS" instead of "SESSIONS".

**Step 1: Update the Session interface**

Add `result` to the `Session` interface (line 33):

```typescript
interface Session {
  id: string;
  rating: Rating;
  status: 'active' | 'paused' | 'completed' | 'expired' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  exchange_count: number;
  study_mode: string;
  difficulty_preference: string;
  aircraft_class?: string;
  acs_tasks_covered: { task_id: string; status: string; attempts?: number }[];
  result?: {
    grade: string;
    elements_asked: number;
    total_elements_in_set: number;
    completion_trigger: string;
  } | null;
}
```

**Step 2: Update heading and stats**

Line 451: Change `"RECENT SESSIONS"` to `"RECENT EXAMS"`
Line 350: Change `SESSIONS` to `EXAMS`
Line 455: Change `"No {RATING_LABELS[selectedRating]} sessions yet"` to `"No {RATING_LABELS[selectedRating]} exams yet"`
Line 424: Change `"All Sessions (Lifetime)"` to `"All Exams (Lifetime)"`

**Step 3: Update exam list items**

Replace the list item rendering (lines 458-493) to show exam config + grade:

```tsx
filteredSessions.slice(0, 10).map((session) => (
  <div key={session.id} className="iframe rounded-lg p-3 flex items-center justify-between">
    <div>
      <p className="text-base font-mono text-c-text">
        {RATING_LABELS[session.rating]}
        {session.aircraft_class ? ` ${session.aircraft_class}` : ''}
        {session.difficulty_preference ? `, ${session.difficulty_preference}` : ''}
      </p>
      <p className="font-mono text-xs text-c-dim mt-0.5">
        {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        {' · '}{session.exchange_count || 0} exchanges
        {session.result ? ` · ${Math.round((session.result.elements_asked / session.result.total_elements_in_set) * 100)}% coverage` : ''}
      </p>
    </div>
    <div className="flex items-center gap-2">
      {session.result && (
        <span className={`font-mono text-xs px-2 py-0.5 rounded border uppercase ${
          session.result.grade === 'satisfactory'
            ? 'bg-c-green-lo text-c-green border-c-green/20'
            : session.result.grade === 'unsatisfactory'
            ? 'bg-red-500/10 text-red-400 border-red-400/20'
            : 'bg-c-amber-lo text-c-amber border-c-amber/20'
        }`}>
          {session.result.grade}
        </span>
      )}
      <span className={`font-mono text-xs px-2 py-0.5 rounded border uppercase ${
        session.status === 'completed'
          ? 'bg-c-green-lo text-c-green border-c-green/20'
          : session.status === 'active'
          ? 'bg-c-cyan-lo text-c-cyan border-c-cyan/20'
          : session.status === 'expired'
          ? 'bg-c-amber-lo text-c-amber border-c-amber/20'
          : 'bg-c-amber-lo text-c-amber border-c-amber/20'
      }`}>
        {session.status === 'active' ? 'IN PROGRESS' : session.status}
      </span>
    </div>
  </div>
))
```

**Step 4: Update achievement labels**

Lines 75-77: Change achievement labels:
- `'First Session'` → `'First Exam'`
- `'5 Sessions'` → `'5 Exams'`
- `'10 Sessions'` → `'10 Exams'`

**Step 5: Commit**

```bash
git add src/app/(dashboard)/progress/page.tsx
git commit -m "feat: rename Recent Sessions -> Recent Exams with grade display"
```

---

## Task 10: Admin Dashboard — Update Active Sessions Count

**Files:**
- Modify: `src/app/api/admin/dashboard/route.ts` (if the active sessions count needs to exclude abandoned/expired)

**Context:** The admin dashboard counts `exam_sessions WHERE status = 'active'`. After the backfill migration (Task 1), this count should already be accurate. But verify and consider adding a breakdown by status.

**Step 1: Verify the admin dashboard query**

Read `src/app/api/admin/dashboard/route.ts` and confirm the active sessions count query. After the migration backfill, the count should be dramatically lower (from 48 to only truly active ones).

**Step 2: Optionally add status breakdown**

If useful, add a breakdown to the dashboard:
```sql
SELECT status, count(*) FROM exam_sessions GROUP BY status;
```

**Step 3: Commit (if changes made)**

```bash
git add src/app/api/admin/dashboard/route.ts
git commit -m "feat: update admin dashboard session counting post-migration"
```

---

## Task 11: Final Verification and Obsidian Update

**Files:**
- Create: Obsidian session log note

**Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass, including new `computeExamResult` tests.

**Step 2: Run build**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Manual smoke test**

1. Start app locally
2. Create an exam — verify `is_onboarding: false`, `expires_at` is set (7 days out)
3. Answer a few questions — verify transcripts in DB
4. End exam — verify `result` JSONB populated with grade
5. Progress page — verify "Recent Exams" heading, grade badges
6. Create 3 exams — verify 4th is blocked with upgrade prompt

**Step 4: Write Obsidian session log**

Write to: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Piotr's Second Brain/Imagine Flying/NextGen CFI/Products/Aviation Oral Exam Companion/Session Management/Session Policy Implementation Log.md`

**Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete session policy redesign implementation"
```
