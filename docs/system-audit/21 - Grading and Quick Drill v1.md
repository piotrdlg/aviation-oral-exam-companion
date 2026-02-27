---
date: 2026-02-26
type: system-audit
tags: [heydpe, system-audit, grading, quick-drill, exam-result, phase-5]
status: draft
evidence_level: high
---

# 21 — Grading and Quick Drill v1

**Phase 5 of the Oral Exam Problem Statement (R9 + R10)**

---

## What This Phase Does

1. **ExamResultV2** — plan-based grading with per-area breakdown and weak element tracking
2. **Per-area gating** — each area independently evaluated (DPE realism)
3. **Weak-area synthesis** — grounded citations from FAA sources for post-exam review
4. **Quick Drill mode** — short focused exam (10-20 questions) targeting weak elements
5. **Result audit tooling** — `npm run exam:result-audit` for monitoring grade consistency

## What This Phase Does Not Do

- Does not change the V1 `ExamResult` — it continues to be stored in `exam_sessions.result` for backwards compatibility
- Does not add new database tables or migrations — all new data persists to `exam_sessions.metadata`
- Does not modify the DPE examiner prompts or assessment logic
- Does not add a weak-area dashboard UI (data layer only)

---

## ExamResultV2

### Type Definition

```typescript
interface ExamResultV2 {
  version: 2;
  overall_status: 'pass' | 'fail' | 'incomplete';
  overall_score: number;      // plan-based: points / total_in_plan
  asked_score: number;        // asked-only: points / elements_asked (V1 compat)
  total_in_plan: number;
  elements_asked: number;
  elements_credited: number;  // credited_by_mention from ExamPlanV1
  elements_not_asked: number;
  elements_satisfactory: number;
  elements_partial: number;
  elements_unsatisfactory: number;
  areas: AreaBreakdown[];
  weak_elements: WeakElement[];
  failed_areas: string[];
  completion_trigger: CompletionTrigger;
  plan_exhausted: boolean;
  graded_at: string;
}
```

### Key Difference from V1

| Aspect | V1 (`computeExamResult`) | V2 (`computeExamResultV2`) |
|--------|--------------------------|---------------------------|
| Denominator | Elements asked | Elements in plan (includes not-asked as 0) |
| Credited mentions | Not counted | Counted as 1.0 points |
| Per-area gating | Not enforced | Per-area pass/fail with thresholds |
| Weak elements | Not tracked | Listed with severity |
| Critical areas | Not checked | Unsatisfactory = area fail |
| Persistence | `exam_sessions.result` | `exam_sessions.metadata.examResultV2` |

### Scoring

Same point values as V1 for consistency:
- Satisfactory = 1.0
- Partial = 0.7
- Unsatisfactory = 0.0
- Not asked = 0.0 (contributes to plan-based denominator)
- Credited by mention = 1.0

### File

`src/lib/exam-result.ts` — pure function, zero external dependencies.

---

## Per-Area Gating

### Rules

1. **Overall threshold**: `overall_score >= 0.70` (configurable)
2. **Per-area threshold**: each area `score >= 0.60` with minimum `K` scored elements
3. **Minimum attempts**: `K = 2` for full exam, `K = 1` for narrow scope
4. **Critical areas**: any unsatisfactory in a critical area = area fail, regardless of score

### Critical Areas by Rating

| Rating | Critical Areas | Rationale |
|--------|---------------|-----------|
| Private | I | Preflight Preparation (regs, airworthiness, weather) |
| Commercial | I | Commercial privileges/limitations, regs |
| Instrument | I, III | IFR regs + ATC clearances |

### Area Statuses

- `pass` — score >= threshold AND (not critical OR no unsatisfactory)
- `fail` — score below threshold OR critical area with unsatisfactory
- `insufficient_data` — fewer than `min_area_attempts` scored elements

### File

`src/lib/exam-result.ts` — `GatingConfig`, `CRITICAL_AREAS_BY_RATING`, integrated into `computeExamResultV2`.

---

## Weak-Area Synthesis

### API Endpoint

```
GET /api/exam?action=summary&sessionId=<id>
```

Returns a `WeakAreaReport` with per-element grounded citations.

### Citation Chain

```
element_code → transcript_citations (session-specific)
             → concept_chunk_evidence → source_chunks → source_documents
```

Two sources, in priority order:
1. **Transcript citations** — chunks actually used during the exam exchange
2. **Evidence bundle** — pre-computed concept→chunk links via `get_concept_bundle` RPC

Each weak element receives 2-4 citations with:
- Document abbreviation and title
- Page reference
- Section heading
- Content snippet (200 chars)
- Source type (transcript or evidence)
- Confidence score

### Grounding Guarantee

If insufficient citations found, `element.grounded = false`. The report stats include `insufficient_sources_count` for monitoring.

### File

`src/lib/weak-area-report.ts` — uses service-role Supabase client for cross-table joins.

---

## Quick Drill (R10)

### What It Is

A short, focused exam mode that targets weak elements from prior sessions. No connected walk, no bonus questions — just rapid-fire questions on areas needing improvement.

### Configuration

| Parameter | Value |
|-----------|-------|
| Study mode | `quick_drill` |
| Planned questions | 10-20 (scope-sensitive) |
| Bonus questions | 0 (no bonus) |
| Follow-up max | 1 (same as regular) |
| Connected walk | Disabled |
| Element selection | Weighted shuffle: unsatisfactory > partial > untouched |
| Satisfactory elements | Excluded from queue |

### Type Change

`StudyMode` now includes `'quick_drill'`:
```typescript
type StudyMode = 'linear' | 'cross_acs' | 'weak_areas' | 'quick_drill';
```

### How It Differs from `weak_areas`

| Aspect | `weak_areas` | `quick_drill` |
|--------|-------------|---------------|
| Includes satisfactory | Yes (low priority) | No (excluded) |
| Question count | Full scope | 10-20 max |
| Bonus questions | Yes | No |
| Connected walk | Yes (if `cross_acs`) | No |
| Purpose | Full exam with weak emphasis | Short targeted review |

### Files Modified

- `src/types/database.ts` — `StudyMode` union
- `src/lib/exam-logic.ts` — `buildElementQueue()` quick_drill case
- `src/lib/exam-planner.ts` — `initPlanner()` plan defaults override

---

## Integration Points

### Completion Paths (ExamResultV2 computed here)

1. **Auto-complete** — `src/app/api/exam/route.ts` lines ~717-770
   - When `advancePlanner()` returns null (all elements exhausted)
   - Loads server-side plan from metadata, computes V2, merges into metadata

2. **User-ended** — `src/app/api/session/route.ts` lines ~126-195
   - When client sends `status: 'completed'`
   - Loads plan from metadata, computes V2, merges into metadata

Both paths preserve V1 result in `exam_sessions.result` for backwards compatibility.

---

## Tests

**File:** `src/lib/__tests__/exam-result.test.ts` — 27 tests

| Suite | Tests | Coverage |
|-------|-------|----------|
| Basic computation | 7 | Empty plan, plan-based denominator, full pass, full fail, partial scoring, mention credit, dedup |
| Per-area gating | 5 | Area fail, insufficient data, critical area, critical pass, custom overrides |
| Weak elements | 5 | Unsatisfactory, partial, not-asked, mention exclusion, severity sort |
| Completion triggers | 3 | Plan exhausted, early end incomplete, normal user-end |
| Area breakdown | 2 | Per-area counts, Roman numeral sorting |
| Critical areas config | 1 | Rating-specific critical area definitions |
| Quick Drill queue | 3 | Excludes satisfactory, fallback on empty stats, all-satisfactory fallback |

**Total test count after Phase 5:** 522 (was 495)

---

## Monitoring

### Result Audit Script

```bash
npm run exam:result-audit
npm run exam:result-audit -- --limit 10
npm run exam:result-audit -- --session <session-id>
```

Reports:
- V1 vs V2 grade comparison
- Per-area gating results
- Weak element severity distribution
- Plan-based vs asked-only score delta
- Grade mismatch warnings

### File

`scripts/exam/result-audit.ts`

---

## Rollback

### ExamResultV2 Data

ExamResultV2 is persisted in `exam_sessions.metadata.examResultV2`. To remove:

```sql
-- Remove V2 results from all sessions
UPDATE exam_sessions
SET metadata = metadata - 'examResultV2'
WHERE metadata ? 'examResultV2';
```

### Quick Drill Study Mode

Sessions created with `study_mode = 'quick_drill'` can be identified:

```sql
SELECT id, started_at FROM exam_sessions WHERE study_mode = 'quick_drill';
```

### Code Rollback

Revert commits for:
- `src/lib/exam-result.ts` (new file)
- `src/lib/weak-area-report.ts` (new file)
- `src/lib/__tests__/exam-result.test.ts` (new file)
- `scripts/exam/result-audit.ts` (new file)
- `src/types/database.ts` — remove `'quick_drill'` from StudyMode
- `src/lib/exam-logic.ts` — remove quick_drill case from buildElementQueue
- `src/lib/exam-planner.ts` — remove quick_drill plan override + weak stats loading
- `src/app/api/exam/route.ts` — remove V2 computation from auto-complete + summary endpoint
- `src/app/api/session/route.ts` — remove V2 computation from user-ended path

---

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/exam-result.ts` | NEW | ExamResultV2 type + computation + gating |
| `src/lib/weak-area-report.ts` | NEW | Grounded citation chain for weak elements |
| `src/lib/__tests__/exam-result.test.ts` | NEW | 27 unit tests |
| `scripts/exam/result-audit.ts` | NEW | Monitoring script |
| `src/types/database.ts` | MODIFIED | Added `quick_drill` to StudyMode |
| `src/lib/exam-logic.ts` | MODIFIED | Added quick_drill case to buildElementQueue |
| `src/lib/exam-planner.ts` | MODIFIED | Quick Drill plan overrides, weak stats for quick_drill |
| `src/app/api/exam/route.ts` | MODIFIED | V2 computation in auto-complete + summary endpoint |
| `src/app/api/session/route.ts` | MODIFIED | V2 computation in user-ended path |
| `package.json` | MODIFIED | Added `exam:result-audit` npm script |
| `docs/system-audit/00 - Index.md` | MODIFIED | Added doc 21, updated Key Finding #4 |
