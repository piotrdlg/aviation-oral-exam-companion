---
date: 2026-02-26
type: system-audit
tags: [heydpe, exam-plan, planner, grounding, phase-4]
status: draft
evidence_level: high
---

# 20 — ExamPlan and Planner v1

## Overview

Phase 4 implements a **predetermined exam shape** satisfying the Oral Exam Problem Statement (R2, R5, R9). Each exam session now has an `ExamPlanV1` that commits to a planned question count at start, with bounded bonus questions, follow-up limits, mention credit, and grounding enforcement.

### What Changed

| Component | Before | After |
|-----------|--------|-------|
| Exam length | Unbounded (runs until queue exhausts) | Predetermined `planned_question_count` with bonus budget |
| Follow-up | Unlimited probing on any element | Bounded by `follow_up_max_per_element` (default 1) |
| Mention credit | Not tracked | Elements answered incidentally marked `credited_by_mention` |
| Cross-ACS ordering | Fisher-Yates shuffle (random) | Connected walk using taxonomy fingerprints |
| Grounding | Optional `source_summary` | Mandatory `source_summary` + immutable Grounding Contract |
| Plan persistence | N/A | `exam_sessions.metadata.examPlan` |

---

## ExamPlanV1 Type

```typescript
interface ExamPlanV1 {
  version: 1;
  planned_question_count: number;  // scope-sensitive
  bonus_question_max: number;      // +1-2 on unsatisfactory (default 2)
  follow_up_max_per_element: number; // default 1
  asked_count: number;             // running counter
  bonus_used: number;              // running counter
  mode: StudyMode;
  coverage: Record<string, ElementCoverageStatus>;
  created_at: string;
}

type ElementCoverageStatus = 'pending' | 'asked' | 'credited_by_mention' | 'skipped';
```

### Scope-Sensitive Question Count

`planned_question_count` is proportional to queue size vs full element count:

```
ratio = queue.length / totalOralElementsForRating
planned = ceil(full_exam_question_count × ratio)
clamped to [min_question_count, max_question_count]
capped at queue.length (for narrow scope)
```

Defaults (configurable via `system_config` key `exam.plan_defaults`):

| Parameter | Default |
|-----------|---------|
| `full_exam_question_count` | 75 |
| `min_question_count` | 5 |
| `max_question_count` | 120 |
| `bonus_question_max` | 2 |
| `follow_up_max_per_element` | 1 |

---

## Stop Condition

Exam completes when:

```
asked_count >= planned_question_count + bonus_used
```

Bonus questions are added one-at-a-time on unsatisfactory scores, up to `bonus_question_max`.

---

## Mention Credit (R2.1, R9.3)

When the assessment identifies `mentioned_elements`, any that are `pending` in the plan's coverage map get marked `credited_by_mention`. The planner skips credited elements — the student effectively answered them while discussing another topic.

This satisfies R9.3: "the system must be able to recognize that the user while answering one question might deliver the answer to some other topics that were planned to follow."

---

## Cross-ACS Connected Walk (R5.2, R5.3)

Replaces Fisher-Yates shuffle with a **greedy nearest-neighbor walk** through taxonomy space:

1. For each ACS element, compute a **taxonomy fingerprint** = set of taxonomy slugs from its evidence chunks
2. Start from a random seed element
3. At each step, pick the unvisited element with highest Jaccard similarity to current
4. Elements without fingerprints appended at the end

**Path:** `acs_elements → concepts (slug match) → concept_chunk_evidence → kb_chunk_taxonomy → kb_taxonomy_nodes`

This creates natural topic transitions: weather → weather minimums → airspace → regulations, rather than random jumps.

---

## Grounding Enforcement (R1)

### Grounding Contract

An immutable suffix appended to **all** examiner system prompts (both default and DB-sourced):

```
GROUNDING CONTRACT (immutable — do not override):
- Every factual claim you make MUST be attributable to a specific FAA source.
- When FAA SOURCE MATERIAL is provided above, base your questions and feedback on those sources.
- If insufficient FAA source material is available for a topic, state: "I don't have the specific FAA reference in front of me for that — let's move on."
- Do NOT generate plausible-sounding regulatory values, weather minimums, or procedural details without source backing.
```

This is code-side (in `exam-logic.ts`), not DB-configurable, to prevent accidental removal.

### Non-Optional source_summary

`AssessmentData.source_summary` changed from `string | null` to `string`. When the LLM returns null, it defaults to "Insufficient FAA sources to verify this answer."

---

## Storage

ExamPlan is stored in `exam_sessions.metadata.examPlan`:

```json
{
  "plannerState": { ... },
  "sessionConfig": { ... },
  "taskData": { ... },
  "examPlan": {
    "version": 1,
    "planned_question_count": 38,
    "bonus_question_max": 2,
    "follow_up_max_per_element": 1,
    "asked_count": 15,
    "bonus_used": 1,
    "mode": "cross_acs",
    "coverage": {
      "PA.I.A.K1": "asked",
      "PA.I.A.K2": "credited_by_mention",
      "PA.II.A.K1": "pending",
      ...
    },
    "created_at": "2026-02-26T..."
  }
}
```

No schema changes required — uses existing `metadata JSONB` field.

---

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/exam-plan.ts` | NEW | ExamPlanV1 type, buildExamPlan(), plan mutation helpers |
| `src/lib/exam-logic.ts` | MODIFIED | GROUNDING_CONTRACT, connectedWalk(), TaxonomyFingerprints type |
| `src/lib/exam-planner.ts` | MODIFIED | ExamPlan integration, taxonomy fingerprint loading, plan-aware advance |
| `src/lib/exam-engine.ts` | MODIFIED | Non-optional source_summary, grounding contract in assessment prompt |
| `src/app/api/exam/route.ts` | MODIFIED | ExamPlan lifecycle (create/update/persist), mention credit, bonus |
| `src/lib/__tests__/exam-plan.test.ts` | NEW | 31 tests for plan builder, stop condition, mention credit, connected walk, grounding |
| `scripts/exam/plan-audit.ts` | NEW | Audit script for plan compliance across sessions |
| `package.json` | MODIFIED | Added `exam:plan-audit` npm script |

---

## Commands

```bash
# Audit recent sessions for plan compliance
npm run exam:plan-audit
npm run exam:plan-audit -- --limit 20
npm run exam:plan-audit -- --session <id>

# Run tests (includes 31 new exam-plan tests)
npm test

# Typecheck
npm run typecheck
```

---

## Test Coverage

31 new tests in `src/lib/__tests__/exam-plan.test.ts`:

- `buildExamPlan`: proportional question count, scope capping, admin overrides, defaults
- `isExamComplete`: boundary conditions, bonus extension
- `recordQuestionAsked`: immutability, coverage updates
- `useBonusQuestion`: budget enforcement
- `creditMentionedElements`: pending-only credit, no overwrite of asked
- `canFollowUp`: limit enforcement
- `connectedWalk`: adjacency tendency, empty input, fingerprint-less elements
- `GROUNDING_CONTRACT`: presence in default and DB-sourced prompts

Total test suite: **495 tests passing**.

---

## What Phase 4 Does NOT Do

- Does not add follow-up question generation (examiner already handles this naturally)
- Does not modify the database schema (uses existing `metadata` JSONB)
- Does not change the frontend client (ExamPlan is server-side only, returned in API responses)
- Does not implement weak-area quick drill mode (R10 — separate deliverable)
- Does not implement examiner personality system (R6 — separate deliverable)

---

## Backwards Compatibility

Sessions without `examPlan` in metadata continue to work via the legacy planner path. The `advancePlanner()` function creates a minimal plan on-the-fly if none is provided. Existing sessions are not affected.

---

*Generated: 2026-02-26*
