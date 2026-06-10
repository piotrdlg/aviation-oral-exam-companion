# Review 02 — Exam Engine, Grading & Progress Tracking

> Date: 2026-06-09 · Reviewer: AI agent (code correctness review)
> Scope: exam-engine.ts, exam-logic.ts, exam-result.ts, exam-plan(ner).ts, api/exam, api/session, practice page, progress page, element_attempts migrations

## Confirmed bugs

### 1. The planner never advances during a live exam — entire exam stays pinned to the first element/task
- **Evidence:** `action: 'next-task'` is called from exactly one place in the whole client: the resume flow at `src/app/(dashboard)/practice/page.tsx:1455` (verified repo-wide grep; `git log -S` shows it was only ever added for resume). The normal answer loop (`sendAnswer`, practice/page.tsx:722–734) only ever sends `action: 'respond'`.
- **What happens:** The element queue, `advancePlanner` (src/lib/exam-planner.ts:356), transition hints (api/exam/route.ts:1038), per-element depth contracts, and plan-based auto-complete (api/exam/route.ts:966–1030) are unreachable in a live session. Every question and every assessment is run against the *first* task's element list (`buildSystemPrompt`, exam-logic.ts:183–191), so `element_attempts` cluster on one task per session and `acs_tasks_covered` only ever contains the starting task (practice/page.tsx:1064–1066).
- **Severity:** critical
- **Fix:** Wire planner advancement into the live loop — e.g., after N exchanges or when the assessment marks the element satisfactory, call `next-task` (or fold advancement into `respond` server-side using server-persisted planner state).

### 2. Client never sends `plannerState` or `examPlan` on respond — mention credit, bonus questions, graph retrieval, and element-aware grading are all dead code
- **Evidence:** `sendAnswer` body at practice/page.tsx:725–734 contains only `taskData, history, studentAnswer, sessionId, sessionConfig, stream, chunkedResponse`. There is **zero** occurrence of `examPlan` anywhere in practice/page.tsx (grep).
- **What happens:** In `src/app/api/exam/route.ts`: `clientExamPlan` is always undefined so `creditMentionedElements`/`useBonusQuestion` blocks never run (route.ts:738, 871–897); `clientPlannerState` is undefined so the graph-retrieval `elementCode` is undefined (route.ts:617 → `graph.enhanced_retrieval` never activates on respond), `assetContext.elementCode` is undefined (route.ts:667), and the depth/grading contract's element type is always `'knowledge'` (route.ts:644–649) even for risk elements.
- **Severity:** critical
- **Fix:** Track `examPlan`/`plannerState` in client state (it's already returned by start/next-task) and include them in the respond body — or better, stop trusting the client and load them from `exam_sessions.metadata` server-side.

### 3. `isExamComplete` can never fire even on the resume path — plan budget resets every call
- **Evidence:** `advancePlanner` at src/lib/exam-planner.ts:362–368 builds a fresh fallback plan with `asked_count: 0` whenever `examPlan` is undefined (and the resume caller at practice/page.tsx:1451–1459 never passes one). `isExamComplete` (exam-plan.ts:134–136) compares `asked_count >= planned`, so it's checked against 0 or 1 every time. The route also never reads the persisted `metadata.examPlan` for advancement — only for grading.
- **What happens:** Natural completion (`sessionComplete: true`, route.ts:1026–1029) and `completion_trigger: 'all_tasks_covered'` grading (route.ts:993) are unreachable; exams only end when the user ends them. The persisted `metadata.examPlan` is also overwritten each next-task with the rebuilt plan (`asked_count` reset, coverage all-pending; route.ts:1099–1108), corrupting the V2 grading input.
- **Severity:** high
- **Fix:** Load the authoritative `examPlan` from `exam_sessions.metadata` inside the next-task handler before calling `advancePlanner`.

### 4. One-active-exam enforcement is a no-op for respond/next-task
- **Evidence:** `enforceOneActiveExam` upserts `{ is_exam_active: true, exam_session_id: examSessionId }` for the calling token *before* verification (src/lib/session-enforcement.ts:53–64), then the respond/next-task check reads back that same row (session-enforcement.ts:109–117).
- **What happens:** The row it just wrote always matches, so `rejected: true` can never be returned; a superseded device just reactivates itself on its next answer. The 409 `session_superseded` path (route.ts:356–361) and client handling (practice/page.tsx:746) are dead. Two devices can write transcripts/attempts to two "active" exams concurrently.
- **Severity:** high
- **Fix:** For respond/next-task, read the active-session row first and verify before upserting (or make the upsert conditional: only set `is_exam_active`/`exam_session_id` when no conflicting active exam exists).

### 5. `resume-current` resumes the wrong element (off-by-one with planner cursor)
- **Evidence:** `pickNextElement` returns the chosen element and advances `cursor` past it (exam-logic.ts:534–537, 548); the current/pending element is `recent[last]`, while `queue[cursor]` is the *next* element. `resume-current` uses `queue[cursor]` (route.ts:915) and derives the task from it (route.ts:920–927). The route itself uses the correct convention elsewhere (`recent[last]` at route.ts:644–646), proving the inconsistency.
- **What happens:** After resume with a pending examiner question, `taskData` is set to the next element's task, so the student's answer to the pending question is assessed against the wrong task's element list, and the resulting `primary_element` is mis-attributed.
- **Severity:** high
- **Fix:** Use `plannerState.recent[recent.length - 1]` (fall back to `queue[(cursor - 1 + len) % len]`) in resume-current, and at route.ts:617/667.

### 6. One bad element code from the LLM silently destroys the whole exchange's progress write
- **Evidence:** `writeElementAttempts` inserts primary attempt + all mentions as a single batch (route.ts:144–153) with only a `console.error` on failure. `element_attempts` has `element_code REFERENCES acs_elements(code)`, `score CHECK (IN ('satisfactory','partial','unsatisfactory'))`, and `UNIQUE (transcript_id, element_code, tag_type)` (supabase/migrations/20260214000006_element_attempts.sql:10–13, 25–26). `assessAnswer` does not validate `primary_element`, `mentioned_elements`, or even `score` (`parsed.score || 'partial'` passes any truthy string through; exam-engine.ts:818, 822–823).
- **What happens:** A single hallucinated element code, a non-enum score, or a duplicated mention causes a FK/CHECK/UNIQUE violation that aborts the entire insert — the scored primary attempt is lost too. Grading, weak areas, and the treemap silently miss exchanges.
- **Severity:** high
- **Fix:** Validate `score` against the enum and filter `primary_element`/`mentioned_elements` against the task's known element codes (already in memory in `assessAnswer`); dedupe mentions; insert the primary attempt as its own statement so mention failures can't kill it.

### 7. Assessment failures silently grade as 'partial' (0.7 points)
- **Evidence:** JSON-parse failure fallback returns `score: 'partial'` (exam-engine.ts:828–840); streaming assessment-error fallback also `'partial'` (exam-engine.ts:643–651).
- **What happens:** Infrastructure/parse failures award 70% credit and display a "PARTIAL" badge (practice/page.tsx:1977–1990) as if the student gave a half-right answer. Combined with bug 6's unvalidated `score`, grading inflation is systematic on degraded responses.
- **Severity:** medium-high
- **Fix:** Use a distinct `score: null`/`'ungraded'` state that is excluded from points and shown as "not assessed" in the UI; retry the assessment once before falling back.

### 8. A failed assessment aborts the examiner transcript write too
- **Evidence:** In the streaming after() block, `Promise.all([fullTextPromise, assessmentPromise])` (route.ts:689–692) sits in a single try whose catch is at route.ts:760–761; the examiner transcript insert (route.ts:695–703), assessment update, attempts, citations, and plan updates all live after the `Promise.all`.
- **What happens:** If `assessAnswer` throws (Anthropic 429/529 etc.), the examiner's reply is never persisted even though the client received and displayed it. On resume, the loaded transcript is missing examiner turns, breaking the `examinerAskedLast` detection (practice/page.tsx:1425–1426) and exchange numbering.
- **Severity:** medium-high
- **Fix:** Persist the examiner transcript from `fullTextPromise` independently (separate try), then handle the assessment result separately.

### 9. V1 grade is 'incomplete' for any naturally-completed exam
- **Evidence:** exam-logic.ts:660–662: for non-`user_ended` triggers, `elementsAsked < totalElementsInSet` ⇒ `'incomplete'`. The auto-complete path passes the *full queue length* as `totalElementsInSet` (route.ts:985, 993) while the plan budget caps questions at ~75 (exam-plan.ts:58–64, 96–105), so asked < total is essentially guaranteed.
- **What happens:** If/when natural completion is fixed (bugs 1–3), every full exam would grade INCOMPLETE in `exam_sessions.result`, and the progress page shows the amber "INCOMPLETE" badge for completed sessions (progress/page.tsx:466–468) while V2 in metadata may say "pass" — contradictory UX.
- **Severity:** medium (latent today, guaranteed once 1–3 are fixed)
- **Fix:** For `all_tasks_covered`, grade against `examPlan.planned_question_count` (or asked elements), not the raw queue length.

### 10. Resuming a session wipes its accumulated `acs_tasks_covered`
- **Evidence:** `resumeSession` resets `taskScoresRef.current = {}` (practice/page.tsx:1398) and never rehydrates it from `session.acs_tasks_covered` (available in the fetched session, session/route.ts:316). Every subsequent exchange sends `acs_tasks_covered` rebuilt from the ref (practice/page.tsx:1077–1081), and the server does a full replace: `if (acs_tasks_covered) updateData.acs_tasks_covered = acs_tasks_covered` (session/route.ts:123).
- **What happens:** First answer after resume overwrites the session's covered-task history with just the current task. `get_uncovered_acs_tasks` (migrations/20260214000001:430–456) and progress-page task coverage (progress/page.tsx:196–197) lose data.
- **Severity:** high
- **Fix:** Seed `taskScoresRef` from `session.acs_tasks_covered` on resume, or merge instead of replace server-side.

### 11. "Last write wins" attempt dedupe runs on an unordered query — nondeterministic grades
- **Evidence:** Both grading call sites fetch attempts with no `.order()`: route.ts:970–976 and session/route.ts:134–139. `computeExamResult` (exam-logic.ts:619–625) and `computeExamResultV2` (exam-result.ts:189–192) document "latest score wins" but depend entirely on array order.
- **What happens:** When an element was attempted multiple times with different scores, the kept score is whatever Postgres returns last — the grade can flip between identical re-computations.
- **Severity:** medium
- **Fix:** Add `.order('created_at', { ascending: true })` to both queries.

### 12. ExamResultV2 numerator/denominator mismatch — score inflated, can exceed 100%
- **Evidence:** exam-result.ts:195–221: `pointsEarned` sums over *all* deduped attempts (any element code), plus `elementsCredited * 1.0`, but the denominator is `totalInPlan` (plan elements only). Attempts on out-of-plan codes are possible because the assessment prompt lists skill elements (exam-engine.ts:699–703) that the planner excludes from the plan (exam-logic.ts:400), and `primary_element` is unvalidated. The `Math.max(0, …)` clamp at exam-result.ts:211 hides the resulting negative not-asked count; an element both credited and later scored is double-counted at exam-result.ts:218.
- **Severity:** medium
- **Fix:** Filter attempts to `examPlan.coverage` keys before scoring, and exclude credited elements that also have a scored attempt.

### 13. "Credited by mention" grants full satisfactory credit regardless of answer quality
- **Evidence:** `creditMentionedElements` credits any pending mentioned code (exam-plan.ts:172–183) and is invoked even when `assessment.score === 'unsatisfactory'` (route.ts:740–745, 873–880); credits score 1.0 points in V2 (exam-result.ts:218). `mentioned_elements` are defined in the prompt merely as "other element codes *touched on*" (exam-engine.ts:763).
- **What happens:** Elements merely brushed in a wrong answer count as fully passed and are skipped from future questioning (exam-planner.ts:401–403). Currently dead due to bug 2 but will inflate grades the moment plan plumbing is fixed.
- **Severity:** medium
- **Fix:** Only credit mentions on satisfactory answers, or track them as a distinct partial-credit status.

### 14. Exchange numbering is inconsistent between respond and next-task, breaking transcript order
- **Evidence:** Respond derives `exchange_number = floor(history.length / 2) + 1` from client-supplied history (route.ts:597); next-task assigns `transcript row count + 1` (route.ts:1083–1087 and 1140–1144) — a per-row count used as a per-exchange number.
- **What happens:** After any next-task/resume, a transition examiner row gets, e.g., exchange 6 while the student's answer to it gets exchange 4; transcript loading orders by `exchange_number` (route.ts:947–952; session/route.ts:368) so answers sort before their questions in resumed history and the resume "examinerAskedLast" heuristic can misfire.
- **Severity:** medium
- **Fix:** Derive exchange number server-side from `MAX(exchange_number)+1` of existing rows for both paths.

### 15. "All Exams (Lifetime)" treemap option is unselectable
- **Evidence:** The auto-select effect re-selects the latest session whenever `selectedSessionId === null` (progress/page.tsx:147–151); the select's "All Exams" option sets it to null (progress/page.tsx:426–430).
- **What happens:** Choosing "All Exams (Lifetime)" immediately snaps back to the newest session; lifetime treemap/WeakAreas/StudyRecommendations views are unreachable.
- **Severity:** medium (UI)
- **Fix:** Track "user has explicitly chosen" (e.g., use a sentinel `'lifetime'` value or an `initialized` flag) so the effect only auto-selects once.

### 16. "Lifetime" progress stats computed from only the last 20 sessions across all ratings
- **Evidence:** Progress page uses the default `/api/session` list (progress/page.tsx:127) which is `limit(20)` over all ratings (session/route.ts:384), then filters by rating (progress/page.tsx:141–144) and computes `totalSessions/totalExchanges/uniqueTasksCovered` and achievements from it (progress/page.tsx:193–197, 234–237).
- **What happens:** For active users, exam counts, exchange totals, and achievement badges ("10 Exams", "200 Exchanges") undercount and can even regress.
- **Severity:** medium
- **Fix:** Add a server-side aggregate endpoint (count/sum query) or filter by rating + raise the limit server-side.

### 17. Discarded (abandoned) exams still count toward progress despite UI promise
- **Evidence:** Discard confirm says "won't count toward your progress" (practice/page.tsx:1678, 2366), but `get_element_scores`/`get_session_element_scores` join `element_attempts` with no session-status filter (migrations/20260218200001_session_resume_and_scores.sql:106–109, 50–52).
- **What happens:** Attempts from abandoned/expired sessions feed the treemap, weak areas, readiness score, and quick-drill targeting.
- **Severity:** medium
- **Fix:** Add `AND es.status != 'abandoned'` (and likely `'expired'`) to the RPC joins.

### 18. Planner includes flight-only ACS areas despite the documented oral-area exclusion
- **Evidence:** `buildElementQueue`'s comment claims "Filter to oral-exam-relevant areas only" but the code only excludes `element_type === 'skill'` (exam-logic.ts:399–400). The oral-area prefix filter (`ORAL_EXAM_AREA_PREFIXES`, exam-logic.ts:25–56) is applied only in the legacy task-selection path (`filterEligibleTasks`, exam-logic.ts:61–82), which planner sessions don't use (exam-planner.ts:263–267 loads all `PA.%`/`CA.%`/`IR.%` elements).
- **What happens:** Planner exams quiz K/R elements from excluded areas (e.g., PA.IV Takeoffs/Landings, PA.V Performance Maneuvers; CA areas IV/V/VII/X; IR areas IV/VI), and coverage denominators (plan size, `countTotalOralElements` at exam-planner.ts:77–85) disagree with the documented 9-of-12-areas design.
- **Severity:** medium
- **Fix:** Apply the area-prefix filter inside `buildElementQueue` (and in `countTotalOralElements`).

### 19. End-of-exam grading races the last exchange's background writes
- **Evidence:** Streaming respond persists attempts inside `after()` which waits on the assessment LLM call (route.ts:687–759); `gradeSession` can fire immediately after the stream closes (practice/page.tsx:1210–1245) and the grading query (session/route.ts:134–139) reads `element_attempts` that may not exist yet.
- **What happens:** The final answer (often several) is missing from the grade; result understates performance and is non-reproducible.
- **Severity:** medium
- **Fix:** Have the completion handler wait/retry until the latest student transcript has an assessment, or grade in `after()` keyed on the last exchange.

### 20. Readiness math uses different partial-credit weight than the grading engine
- **Evidence:** Progress readiness uses `partial * 0.5` (progress/page.tsx:208); the exam engine uses 0.7 everywhere (exam-logic.ts:634; exam-result.ts:214).
- **Severity:** low
- **Fix:** Use the shared 0.7 constant (export it from exam-logic).

## Suspicious but unconfirmed

### A. Respond-path metadata clobber (latent)
- route.ts:747–757 and 884–894 write `metadata: { plannerState, sessionConfig, taskData, examPlan }` *without* spreading existing metadata — would wipe `persona`, `promptTrace`, `fingerprintMeta`, `depthDifficultyContract`, `voiceEnabled`, `examResultV2`, `grounding_quality_metrics` written at start (route.ts:429–450) and by /api/session merge (session/route.ts:211–218). Currently unreachable because `clientExamPlan` is never sent (bug 2), but it becomes live the moment bug 2 is fixed. Severity if activated: high. Fix: read-merge-write (or a JSONB merge update).

### B. Concurrent metadata writers lose updates
- The client fires fire-and-forget `/api/session` updates after each exchange (practice/page.tsx:1070–1087) while the server writes metadata in `next-task` (route.ts:1099–1108, also a full key-set replace without spreading prior keys like `persona`/`promptTrace`). Both do read-modify-write with no concurrency control. Fix: single writer (server) or `jsonb_set`-style partial updates.

### C. `response.content[0]` may be undefined
- exam-engine.ts:350–351 and 811–812 index `response.content[0]` without a length check; an empty content array (e.g., max-tokens edge or refusal-stop) throws and 500s the exchange. Fix: guard with `response.content.find(b => b.type === 'text')`.

### D. Full `AssessmentData` (including `rag_chunks` with full chunk content) persisted into `session_transcripts.assessment`
- route.ts:710–714 stores the whole assessment object; `rag_chunks` carry complete chunk texts. Transcript rows balloon and resume payloads (session/route.ts:364–369) ship all of it to the client. Fix: strip `rag_chunks` to id/citation fields before persisting.

### E. `loadPromptFromDB` caches empty candidate lists
- exam-engine.ts:90–100: a transient DB error yields `data = null` → caches `[]` for 5 minutes → all sessions fall back to hardcoded prompts and fire `prompt_fallback` events. Fix: don't cache when the query errored.

## Architecture risks

1. **Client-authoritative exam state.** The server trusts client-supplied `history` (used for exchange numbering and the entire LLM context), `taskData`, `plannerState`, `examPlan`, and `exchange_count` (route.ts:315–327; session/route.ts:115–124). Any client bug (see #2, #10) silently corrupts stored progress; a malicious client can fabricate grades. Remediation: make `exam_sessions.metadata` the single source of truth, with the route loading/advancing it server-side.

2. **Two parallel Claude calls with no consistency contract.** `assessAnswer` and `generateExaminerTurn` run in parallel on the same answer (route.ts:662–683); the examiner's spoken feedback can contradict the persisted score badge (examiner says "exactly right", assessment says unsatisfactory). No reconciliation or telemetry compares them.

3. **No transactionality across the per-exchange write chain.** student transcript → assessment update → element_attempts → citations → metadata are 5 independent writes spread across two clients (user-scoped + service-role) and an `after()` callback, each failing with only `console.error` (route.ts:621–624, 702, 714, 733). Partial exchanges are unobservable. Remediation: an RPC that writes the exchange atomically, plus an integrity check.

4. **Dual grading systems (V1 `result` column vs V2 `metadata.examResultV2`) with divergent semantics** (incomplete thresholds, mention credit, denominators — exam-logic.ts:597–682 vs exam-result.ts:149–387). The UI mixes them (practice/page.tsx:2424–2465 renders V1; progress badge V1; weak-area report V2). Remediation: pick V2 as canonical, derive the badge from it, keep V1 only as a frozen legacy field.

5. **Plan/coverage state degraded by fallback rebuilds.** Because `advancePlanner` rebuilds a default plan when none is passed (exam-planner.ts:362–368) and then persists it (route.ts:1099–1108), the stored plan loses `asked_count`/credits over time — V2 grading inputs degrade invisibly. Remediation: server-side plan ownership + versioned plan writes (reject stale `version`).
