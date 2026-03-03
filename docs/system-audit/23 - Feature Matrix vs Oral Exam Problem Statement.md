---
date: 2026-02-27
type: system-audit
tags: [heydpe, system-audit, feature-matrix, requirements, evidence]
status: final
evidence_level: high
---

# Feature Matrix vs Oral Exam Problem Statement

This document maps every requirement from the **Oral Exam Problem Statement** (dated 2026-02-23) against concrete implementation evidence on `main` and in open PRs. Each requirement is graded with a status, backed by file paths and database observations, and accompanied by risk and next-step assessments.

---

## Requirements Source

`docs/system-audit/production-audit/Oral Exam Problem Statement.txt`

**Problem statement date**: 2026-02-23
**Audit date**: 2026-02-27
**Branch audited**: `inventory-verification-sprint-20260227` (identical to `main` for all referenced files)
**DB introspection**: `docs/system-audit/evidence/2026-02-27/sql/db-introspection.md`

---

## Status Legend

| Status | Meaning |
|--------|---------|
| **Implemented** | Feature is on `main`, tested, and functional in production |
| **Partial** | Core mechanism exists but gaps remain (missing UI, missing verification, or shallow enforcement) |
| **PR Only** | Implementation exists in an open PR but is not yet on `main` |
| **Not Started** | No implementation evidence found |

---

## Detailed Requirement Matrix

### R1 --- Knowledge Grounding (Non-Negotiable)

> "The system must be grounded in official FAA knowledge sources."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial** |
| **On Main** | Yes |
| **Tests** | 17 graph-retrieval tests, 32 RAG filter tests, 15 image tests |
| **UI** | Implicit (context injected into exam, not user-visible) |

**Evidence:**

| Layer | File | Detail |
|-------|------|--------|
| Vector search | `src/lib/rag-retrieval.ts` | OpenAI `text-embedding-3-small`, DB-backed embedding cache (200 entries), `searchChunks()` via `hybrid_search` RPC |
| Multi-strategy fallback | `src/lib/rag-search-with-fallback.ts` | Vector + FTS + exact match cascade |
| Graph retrieval | `src/lib/graph-retrieval.ts` | `fetchConceptBundle()` — recursive edge traversal (max depth 2, max 50 rows) from ACS element nodes |
| Source corpus | DB: `source_documents` = 172, `source_chunks` = 4,674, `source_images` = 1,596 | FAA handbooks, AIM, ACS documents, advisory circulars |
| Evidence chain | DB: `concept_chunk_evidence` = 30,689 links | Concepts traceable to source chunks |
| Grounding contract | `src/lib/exam-logic.ts:124-128` | Immutable text block appended to every system prompt: *"Every factual claim you make MUST be attributable to a specific FAA source"* |
| Fail-closed prompt | `src/lib/prompts.ts:22-36` | `getPromptContent()` always prepends `IMMUTABLE_SAFETY_PREFIX`; never serves empty prompt |

**Gaps:**

- **No post-hoc verification.** The system injects FAA context before generation but does not check whether the examiner's output actually used or cited those sources. A hallucinated claim that sounds authoritative will pass through unchecked.
- **No citation surfacing.** The student never sees which FAA source backs a given examiner statement.
- **Grounding contract is prompt-level only.** It depends on the LLM honoring the instruction --- no structural enforcement.

**Risks:**

1. Hallucination of regulatory values (minimums, distances, time limits) remains possible despite strong context injection.
2. Without post-hoc verification, there is no automated way to detect grounding failures in production.

**Next Steps:**

1. Add post-generation citation verification: cross-check examiner output tokens against retrieved chunk content.
2. Surface FAA source references in the UI (expandable citations under examiner messages).
3. Build a regulatory assertion test set for automated accuracy regression testing.

---

### R2 --- Predetermined Exam Shape

> "Each exam must have an anticipated end condition defined at start."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Implemented (Phase 4)** |
| **On Main** | Yes |
| **Tests** | 31 tests in `src/lib/__tests__/exam-plan.test.ts` |
| **UI** | No admin config UI for plan defaults |

**Evidence:**

| Sub-req | Implementation | File |
|---------|---------------|------|
| R2.1 Question-count planning | `buildExamPlan()` computes `planned_question_count` proportional to `queue.length / totalElementsForRating`, clamped to `[min_question_count, max_question_count]` | `src/lib/exam-plan.ts:83-124` |
| R2.2 Admin configurable | `loadPlanDefaults()` reads from `system_config` key `exam.plan_defaults` | `src/lib/exam-planner.ts:46-60` |
| R2.3 Scope-sensitive values | Ratio-based scaling: narrow scope (single task) caps at queue length; full exam uses `full_exam_question_count` | `src/lib/exam-plan.ts:91-105` |
| R9.3/R2 Mention credit | `creditMentionedElements()` marks pending elements as `credited_by_mention` when the student answers multiple questions at once | `src/lib/exam-plan.ts:172-183` |

**Default Plan Parameters** (`DEFAULT_PLAN_DEFAULTS` in `src/lib/exam-plan.ts:58-64`):

```typescript
{
  full_exam_question_count: 75,
  min_question_count: 5,
  max_question_count: 120,
  bonus_question_max: 2,
  follow_up_max_per_element: 1,
}
```

**Completion Logic** (`src/lib/exam-plan.ts:134-136`):

```typescript
export function isExamComplete(plan: ExamPlanV1): boolean {
  return plan.asked_count >= plan.planned_question_count + plan.bonus_used;
}
```

**Gaps:**

- Admin UI for plan config is not built. `loadPlanDefaults()` reads from `system_config` but no admin panel writes to it. Defaults are code-level only.
- The problem statement example values (60/75/100) differ from code defaults (75/5/120). This is acceptable --- the code is more granular --- but the discrepancy should be documented.

**Risks:**

1. Without admin UI, changing plan defaults requires a code deployment or direct DB write.
2. `bonus_question_max: 2` is conservative. The problem statement suggested "+1-2 per incorrect," which could mean per-incorrect-answer rather than per-session. Current implementation is per-session.

**Next Steps:**

1. Wire plan defaults through admin config panel.
2. Clarify bonus question semantics: per-session cap vs. per-incorrect-answer cap.

---

### R3 --- ACS Compliance With Certificate-Level Depth Control

> "The exam generator must anchor each question to the ACS scope and apply a certificate/rating profile that changes depth and expectation."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Implemented** |
| **On Main** | Yes |
| **Tests** | 80 tests in `src/lib/__tests__/exam-logic.test.ts` |
| **UI** | Yes (rating selector on practice page) |

**Evidence:**

| Component | File | Detail |
|-----------|------|--------|
| Rating-specific task sets | DB: `acs_tasks` = 143 (private: 61, commercial: 60, instrument: 22) | Seeded from FAA-S-ACS-6C, 7B, 8C |
| Element-level tracking | DB: `acs_elements` = 2,174 | K (knowledge), R (risk management), S (skill) per task |
| Oral area filtering | `src/lib/exam-logic.ts:25-56` | `ORAL_EXAM_AREA_PREFIXES` per rating --- excludes flight-only areas (IV, V for private; etc.) |
| Rating in system prompt | `src/lib/exam-logic.ts:166-172` | `ratingLabel` map: private/commercial/instrument/atp embedded in DPE persona |
| Element queue filtered by rating | `src/lib/exam-logic.ts:362-380` | `buildElementQueue()` filters by `selectedTasks` or `selectedAreas` from `SessionConfig` |

**Gaps:**

- **Depth differentiation is prompt-driven only.** The system prompt says "FAA Commercial Pilot oral examination" but does not include explicit depth expectations (e.g., "Commercial candidates must demonstrate understanding of commercial operations privileges and limitations at a deeper level than private"). The same element description might produce the same question depth for both ratings.
- **No structural depth enforcement.** There is no mechanism to verify that commercial questions are actually harder/deeper than private questions on the same topic.

**Risks:**

1. A commercial candidate might receive private-pilot-level questions on shared topics (e.g., airspace, weather).
2. No test coverage for depth differentiation between certificates.

**Next Steps:**

1. Add certificate-specific depth guidelines to system prompt templates (e.g., "For commercial: emphasize commercial privileges, limitations, and operational knowledge beyond private pilot level").
2. Embed depth expectations in ACS element metadata or in the prompt template for each rating.

---

### R4 --- Difficulty as Independent Control Layer

> "Within the chosen certificate/rating scope, the system must support: easy, medium, difficult, mixed."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial** |
| **On Main** | Yes |
| **Tests** | No dedicated difficulty tests |
| **UI** | Yes (difficulty selector on practice page) |

**Evidence:**

| Component | File | Detail |
|-----------|------|--------|
| Session config | `exam_sessions.difficulty_preference` column: `CHECK (difficulty_preference IN ('easy','medium','hard','mixed'))` | Migration `20260214000004` |
| Element-level difficulty | `acs_elements.difficulty_default` column: `CHECK (difficulty_default IN ('easy','medium','hard'))` | Migration `20260214000003` |
| Queue filtering | `src/lib/exam-logic.ts:383-388` | `buildElementQueue()` filters by `difficulty_default` when not `mixed` (with fallback: if filtering removes all elements, skip filter) |
| Prompt shaping | `src/lib/exam-logic.ts:151-157` | Difficulty instruction in `buildSystemPrompt()`: easy = "straightforward recall/definition", medium = "application and scenario-based", hard = "complex edge cases", mixed = "vary difficulty naturally" |
| Difficulty-specific prompts | Migrations: `20260216100003`, `20260216100004`, `20260218100002` | DB prompt versioning with difficulty column |

**Gaps:**

- **No measurement of difficulty.** There is no mechanism to verify that "easy" questions are actually easier than "hard" questions. Difficulty is entirely prompt-driven.
- **No test coverage.** No tests verify that difficulty selection produces meaningfully different questions.
- **Element difficulty_default is static.** The `difficulty_default` on `acs_elements` is a single value per element, not a range. This means some elements are permanently "easy" and others permanently "hard," which limits the mixed mode.

**Risks:**

1. Difficulty may be inconsistent across sessions --- prompt-driven difficulty relies on LLM interpretation.
2. No validation that difficulty actually impacts question complexity, required precision, or tolerance for partial answers (all four impacts listed in the problem statement).

**Next Steps:**

1. Add difficulty-aware evaluation: compare assessment leniency at different difficulty levels.
2. Build a test set of questions at each difficulty level for regression validation.
3. Consider making `difficulty_default` a range rather than a single value.

---

### R5 --- Flow Modes: Linear vs Across-ACS

> "Linear = step-by-step through ACS. Across-ACS = naturally connected, not random jumps."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial** |
| **On Main** | Yes |
| **Tests** | Yes (in exam-logic.test.ts, 80 tests cover queue building) |
| **UI** | Yes (study mode selector: linear / cross_acs / weak_areas) |

**Evidence:**

| Sub-req | Implementation | File |
|---------|---------------|------|
| R5.1 Linear mode | `buildElementQueue()` case `'linear'` --- returns codes in DB `order_index` order | `src/lib/exam-logic.ts:396-398` |
| R5.2 Across-ACS mode | `buildElementQueue()` case `'cross_acs'` --- uses `connectedWalk()` with taxonomy fingerprints for natural topic transitions; falls back to shuffle if no fingerprints | `src/lib/exam-logic.ts:400-406` |
| R5.3 Graph-assisted bridging | `connectedWalk()` implements greedy nearest-neighbor traversal using Jaccard similarity of taxonomy fingerprints | `src/lib/exam-logic.ts:432-475` |
| Weak-areas mode | `buildElementQueue()` case `'weak_areas'` --- weighted shuffle by failure rate (unsatisfactory > partial > untouched > satisfactory) | `src/lib/exam-logic.ts:408-414` |
| Taxonomy data | DB: `kb_taxonomy_nodes` = 2,529 nodes; `kb_chunk_taxonomy` = 4,674 chunk-taxonomy links | Multi-hub structure with 4 hubs |

**Gaps:**

- **No transition explanation.** When the examiner moves from one topic to another in cross-ACS mode, it does not explain the conceptual connection. A real DPE might say "Now, speaking of weather, let's talk about..." --- the system does not inject bridge language based on the taxonomy connection.
- **Fallback to shuffle.** If taxonomy fingerprints are unavailable for an element (elements without fingerprints are appended at the end of the walk), the ordering degrades to random. The completeness of taxonomy fingerprints is not monitored.
- **Concept relation types limited.** DB shows only 1 relation type (`is_component_of`, 74,271 edges). The connected walk quality depends on taxonomy fingerprints, not the knowledge graph edges directly.

**Risks:**

1. Cross-ACS mode may feel disjointed if taxonomy fingerprints are sparse or missing for certain elements.
2. No user-facing feedback on why topics transition --- the pedagogical value of connected transitions is invisible to the student.

**Next Steps:**

1. Add transition explanation injection: the system prompt should include the taxonomy-based reason for the topic change.
2. Monitor taxonomy fingerprint coverage: what percentage of elements have non-empty fingerprints?
3. Diversify concept relation types beyond `is_component_of` for richer graph traversal.

---

### R6 --- Examiner Personality

> "Different examiners behave differently: phrasing, patience, drilldown speed, transition style, strictness."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial** |
| **On Main** | Yes (infrastructure only) |
| **Tests** | No |
| **UI** | No user-facing personality selector in exam |

**Evidence:**

| Component | File | Detail |
|-----------|------|--------|
| Voice personas table | Migration `20260219000003` | `voice_personas` table with personality traits |
| Persona-specific prompts | Migration `20260220000003` | `seed_persona_prompts` seeded to `system_prompts` |
| Prompt versioning | Migration `20260216100002` | `system_prompts` table with versioning support |
| Admin prompt API | `src/app/api/admin/prompts/route.ts` | CRUD for prompt management |

**Gaps:**

- **`system_prompts` table may be empty.** DB introspection shows `system_prompts: null` row count, suggesting the table exists but may contain no data (or could not be counted).
- **No user-facing personality selection.** The practice page does not offer personality choice. Personality is infrastructure-only.
- **No measurable behavioral difference.** There are no tests or evaluations confirming that different personality prompts produce measurably different examiner behavior (phrasing style, strictness, probing frequency).
- **Personality does not interact with other axes.** The problem statement requires personality to be bounded by ACS scope, planned exam length, and grounding requirements. No structural enforcement of these bounds exists.

**Risks:**

1. Users cannot experience different examiner styles --- the feature is invisible.
2. Personality prompts may not actually change examiner behavior in measurable ways.
3. No test coverage means personality regressions are undetectable.

**Next Steps:**

1. Verify `system_prompts` table population. If empty, run seed migrations.
2. Add personality selector to practice page configuration.
3. Create personality-specific evaluation tests: given the same question and answer, do different personalities produce measurably different responses?
4. Add structural bounds: personality cannot override exam plan limits or grounding contract.

---

### R7 --- Multimodal Questions (Text + Pictures)

> "Some questions must be asked with a picture displayed or specific text presented."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial** |
| **On Main** | Yes (infrastructure) |
| **Tests** | 15 tests in `src/lib/__tests__/image-retrieval.test.ts` |
| **UI** | Untested in exam flow |

**Evidence:**

| Component | File | Detail |
|-----------|------|--------|
| Image corpus | DB: `source_images` = 1,596 images extracted from FAA PDFs | |
| Image-chunk mapping | DB: `image_chunk_mappings` table (row count: null --- possibly empty or uncounted) | |
| Chunk-to-image retrieval | `src/lib/rag-retrieval.ts:186-211` | `getImagesForChunks()` calls `get_images_for_chunks` RPC, returns public URLs |
| Image in assessment | `src/lib/exam-engine.ts:606-725` | `assessAnswer()` can include images in the Claude API call (with fallback to text-only on download failure) |

**Gaps:**

- **Image linking is page-proximity-based.** Images are linked to chunks by page number proximity during ingestion, not by semantic content. This means the system may select an image from the same page as a relevant chunk even if the image is unrelated to the question topic.
- **No concept-to-image semantic linking.** There is no mechanism to say "this image of an airspace chart is relevant to the airspace classification question."
- **UI not tested.** No evidence of image display in the exam practice page. The API can return image URLs, but the frontend rendering path is unverified.
- **`image_chunk_mappings` may be empty.** DB introspection shows null row count.

**Risks:**

1. Wrong image selection: a weight and balance chart might appear during an airspace question because they happen to be on adjacent pages in the source PDF.
2. Images may not render in the exam UI at all.
3. No automated validation that selected images are actually relevant to the question being asked.

**Next Steps:**

1. Verify `image_chunk_mappings` population.
2. Add concept-to-image semantic linking (use embedding similarity between image captions/alt text and question context).
3. Test image display in the exam practice page UI.
4. Add image relevance validation to the retrieval pipeline.

---

### R8 --- Prompt Governance (Admin-Tunable Prompts)

> "Prompts must be accessible in an Admin interface, versioned/tunable, targetable by context."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial** |
| **On Main** | Yes |
| **Tests** | No dedicated prompt governance tests |
| **UI** | Admin API exists; admin panel status unclear |

**Evidence:**

| Component | File | Detail |
|-----------|------|--------|
| Prompt table | Migrations: `20260216100002`, `20260216100003`, `20260216100004`, `20260218100001`, `20260218100002`, `20260220000003` | `system_prompts` with versioning, difficulty column, persona prompts |
| Admin API | `src/app/api/admin/prompts/route.ts` | CRUD operations for prompt management |
| Prompt loading | `src/lib/prompts.ts:22-36` | `getPromptContent()` assembles DB data with fail-closed fallback |
| Safety prefix | `src/lib/prompts.ts:1-6` | `IMMUTABLE_SAFETY_PREFIX` hardcoded, never overridden by DB |
| Fallback prompts | `src/lib/prompts.ts:8-11` | `FALLBACK_PROMPTS` for `examiner_system` and `assessment_system` |
| DB-to-prompt flow | `src/lib/exam-logic.ts:187-189` | `buildSystemPrompt()` accepts `dbPromptContent` parameter, appends task section + grounding contract |

**Gaps:**

- **`system_prompts` table may be empty.** DB introspection shows null count. If the table is empty, all prompts fall back to hardcoded defaults, which defeats the purpose of admin tunability.
- **Prompt selection determinism is unclear.** The problem statement requires "deterministic and debuggable" selection. The system has a fallback chain (DB prompt -> fallback prompt -> error prompt) but no logging of which path was taken.
- **Context targeting is partial.** Prompts can be targeted by difficulty (via the difficulty column) and persona, but targeting by rating, study mode, and exam length is not structurally supported in the prompt table schema.

**Risks:**

1. If `system_prompts` is empty, all prompt governance infrastructure is unused in production.
2. No prompt audit trail: when a prompt version is used, there is no log of which version was selected for a given session.
3. Context targeting gaps mean some prompt variations must still be handled in code rather than DB.

**Next Steps:**

1. Verify `system_prompts` population. If empty, run the seed migrations on production.
2. Add prompt selection logging: record which prompt key, version, and path (DB vs. fallback) was used per session.
3. Extend prompt table schema to support rating and study mode targeting.
4. Build or verify admin UI for prompt editing.

---

### R9 --- Grading + Weak-Area Feedback

> "Grading must be a first-class subsystem, not an afterthought."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partial (V1 on main, V2 in PR #3)** |
| **On Main** | V1 assessment + basic scoring |
| **Tests** | V1: in exam-logic tests; V2: 27 tests in PR #3 (`exam-result.test.ts`) |
| **UI** | No results display UI |

**Evidence on `main`:**

| Sub-req | Implementation | File |
|---------|---------------|------|
| R9.1 Per-exchange evaluation | `assessAnswer()` returns satisfactory/unsatisfactory/partial + feedback + element mapping | `src/lib/exam-engine.ts:606-725` |
| R9.1 Element tracking | `element_attempts` table with per-element per-session scoring | Migration `20260214000006` |
| Basic scoring | `computeExamResult()` computes overall exam grade from attempt data | `src/lib/exam-logic.ts:564-567` |
| R9.3 Mention credit | `creditMentionedElements()` in exam-plan.ts marks pending elements as `credited_by_mention` | `src/lib/exam-plan.ts:172-183` |

**Evidence in PR #3** (not merged):

| Component | File | Detail |
|-----------|------|--------|
| ExamResultV2 | `src/lib/exam-result.ts` (412 lines) | Per-area gating (overall >= 0.70, per-area >= 0.60), critical area enforcement, weak element identification |
| Weak-area synthesis | `src/lib/weak-area-report.ts` (393 lines) | Grounded citations from FAA sources via transcript + evidence chain |
| Summary API | `GET /api/exam?action=summary&sessionId=...` | Returns V2 result + weak-area report |
| Tests | `src/lib/__tests__/exam-result.test.ts` (27 tests) | 522 total tests passing |

**Gaps:**

- **V2 grading not on main.** The comprehensive grading system (per-area gating, weak element identification, grounded weak-area report) exists only in PR #3.
- **No results display UI.** Even V1 scoring has no user-facing display. The student finishes an exam and sees no summary, no score, no weak areas.
- **R9.2 weak-area synthesis is PR-only.** The synthesized review plan with grounded citations is not available in production.

**Risks:**

1. Students complete exams with no actionable feedback --- defeating the core purpose of exam preparation.
2. V2 depends on evidence chain quality (`concept_chunk_evidence`). If evidence links are incorrect, weak-area citations will be misleading.

**Next Steps:**

1. Merge PR #3 (`phase5-grading-v2-quick-drill`).
2. Build results display UI: session summary with per-area breakdown, weak elements, and FAA citations.
3. Test weak-area report accuracy against manually evaluated sessions.

---

### R10 --- Quick Drill

> "A distinct mode where the system asks a small number of focused questions in weak areas."

| Attribute | Detail |
|-----------|--------|
| **Status** | **PR Only (not on main)** |
| **On Main** | No |
| **Tests** | Yes (in PR #3) |
| **UI** | No |

**Evidence in PR #3:**

| Component | File | Detail |
|-----------|------|--------|
| StudyMode extension | `src/types/database.ts` | `'quick_drill'` added to `StudyMode` type |
| Queue builder | `src/lib/exam-logic.ts` | `buildElementQueue` case `'quick_drill'` targeting weak/untouched elements only |
| Planner overrides | `src/lib/exam-planner.ts` | 10-20 questions, excludes satisfactory elements |
| DB migration | `supabase/migrations/20260226100001_add_quick_drill_study_mode.sql` | Updates CHECK constraint on `exam_sessions.study_mode` |

**Current DB State:**

The DB introspection confirms `quick_drill` is **blocked by CHECK constraint**: attempting to insert `study_mode = 'quick_drill'` fails. The migration must be applied before use.

**Gaps:**

- **Not merged.** The entire feature is in PR #3.
- **No UI.** No "Quick Drill" option exists in the practice page configuration.
- **Migration required.** DB schema change must be applied before the feature can function.

**Risks:**

1. Migration ordering: if the code is deployed before the migration, quick drill requests will fail with constraint violations.
2. No UI means the feature is API-only even after merge.

**Next Steps:**

1. Merge PR #3.
2. Apply migration `20260226100001` to production.
3. Add Quick Drill option to practice page study mode selector.

---

## Summary Table

| Req | Description | Status | On Main? | Tests | UI | Priority Gap |
|-----|-------------|--------|----------|-------|----|-------------|
| **R1** | Knowledge Grounding | Partial | Yes | 64 (RAG + graph + image) | Implicit | Post-hoc verification |
| **R2** | Predetermined Exam Shape | Implemented | Yes | 31 | No admin config | Admin UI |
| **R3** | Certificate-Level Depth | Implemented | Yes | 80 | Yes (rating selector) | Depth differentiation |
| **R4** | Difficulty Control | Partial | Yes | 0 dedicated | Yes (difficulty selector) | Measurement + validation |
| **R5** | Flow Modes | Partial | Yes | In exam-logic (80) | Yes (mode selector) | Transition explanation |
| **R6** | Examiner Personality | Partial | Yes (infra) | 0 | No | Entire user experience |
| **R7** | Multimodal Questions | Partial | Yes (infra) | 15 | Untested | Semantic image linking |
| **R8** | Prompt Governance | Partial | Yes | 0 | Admin API exists | Verify population + audit trail |
| **R9** | Grading + Feedback | Partial | V1 only | 27 (PR) | No | Merge PR #3 + results UI |
| **R10** | Quick Drill | PR Only | No | Yes (PR) | No | Merge + migration + UI |

---

## Design Constraint Assessment

### C1 --- Examiner Leads, Not the Student's Errors

> "Wrong answers should trigger controlled probing, but the exam cannot become unbounded."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Addressed** |
| **Evidence** | `src/lib/exam-plan.ts` --- `DEFAULT_PLAN_DEFAULTS` |

The ExamPlanV1 enforces structural bounds:

- `bonus_question_max: 2` --- at most 2 additional questions per session due to incorrect answers
- `follow_up_max_per_element: 1` --- at most 1 follow-up probe per element before moving on
- `isExamComplete()` gates on `asked_count >= planned_question_count + bonus_used`

These bounds prevent unbounded rabbit holes from wrong answers. The examiner always advances through the predetermined plan rather than dwelling on errors.

**Gap:** The bounds are per-session (bonus) and per-element (follow-up), not per-incorrect-answer. The problem statement's "+1-2 additional questions" on each incorrect answer would be a different (more permissive) model. Current implementation is more conservative.

---

### C2 --- Multiple Axes Compose Cleanly

> "Certificate/rating, difficulty, study mode, personality, multimodal, prompt version, and exam length must combine without contradictions."

| Attribute | Detail |
|-----------|--------|
| **Status** | **Partially Addressed** |
| **Evidence** | `src/types/database.ts:260-267` --- `SessionConfig` |

The `SessionConfig` interface composes:

```typescript
export interface SessionConfig {
  rating: Rating;              // certificate/rating scope
  aircraftClass: AircraftClass; // aircraft class filter
  studyMode: StudyMode;         // linear / cross_acs / weak_areas
  difficulty: DifficultyPreference; // easy / medium / hard / mixed
  selectedAreas: string[];      // area-level scope restriction
  selectedTasks: string[];      // task-level scope restriction
}
```

These flow through `buildElementQueue()` which applies filters in a defined order:
1. Task selection (most granular)
2. Area selection (fallback if no tasks selected)
3. Difficulty filtering (with fallback if filter removes all elements)
4. Oral-only filtering (exclude skill elements)
5. Mode-specific ordering (linear / connected walk / weighted shuffle)

**Gaps:**

- **Personality is not in SessionConfig.** It lives in voice/prompt infrastructure but is not composed with the exam flow.
- **Multimodal is not in SessionConfig.** Image retrieval happens as a side-effect of chunk retrieval, not as a configurable axis.
- **Prompt version is not in SessionConfig.** Prompt selection is determined by `loadPromptFromDB()` logic, not by session configuration.
- **No formal composition testing.** No tests verify that (rating=commercial, difficulty=hard, mode=cross_acs) produces a valid, non-contradictory exam.
- **No hierarchy of control implementation.** The problem statement suggests a priority ordering (safety > ACS scope > planned structure > mode > difficulty > personality > multimodal > prompts). This hierarchy is not structurally enforced; it is emergent from the code flow.

**Risk:** Unknown interaction effects between axes. For example: does `difficulty=hard` + `mode=cross_acs` + `rating=instrument` produce a coherent session? No test data exists.

**Next Steps:**

1. Add personality and multimodal to `SessionConfig` or a parallel config structure.
2. Build composition smoke tests: generate session configs from a combinatorial space and verify no contradictions or empty queues.
3. Document the implicit hierarchy of control as it exists in the code flow.

---

## Open Questions from Problem Statement vs Implementation

The problem statement raised seven open design decisions. Here is their resolution status:

| # | Open Question | Resolution Status |
|---|--------------|-------------------|
| 1 | Canonical unit of "question count" | **Resolved.** One question = one `asked_count` increment in ExamPlanV1. Mapped to elements via `coverage`. |
| 2 | Planned length for arbitrary scope | **Resolved.** `buildExamPlan()` uses ratio-based scaling: `ceil(full_exam_question_count * (queue.length / totalElementsForRating))`, clamped to `[min, max]`. |
| 3 | Rules for "+1-2 on incorrect" | **Partially resolved.** `bonus_question_max: 2` is a per-session cap, not per-incorrect-answer. Simpler than the problem statement implies. |
| 4 | Formal definition of "difficulty" | **Not resolved.** Difficulty is defined as prompt text only. No formal, measurable definition exists. |
| 5 | Personality as stable parameters | **Not resolved.** `voice_personas` table exists but personality is adjective-based (prompt text), not parameterized (strictness: 0.8, verbosity: 0.3). |
| 6 | Multimodal asset indexing by concept | **Not resolved.** Images are linked by page proximity, not concept-level semantic indexing. |
| 7 | Grounding guarantee for numeric/regulatory | **Partially resolved.** Grounding contract + graph bundle `regulatory_claim` nodes inject verified CFR references, but no post-hoc verification. |

---

## Success Criteria Mapping

The problem statement defines seven success criteria for "what done looks like." Assessment:

| Criterion | Met? | Evidence |
|-----------|------|----------|
| Exam has planned length and reaches believable end | **Yes** | ExamPlanV1 with `isExamComplete()` |
| Questions feel ACS-aligned, match certificate depth and difficulty | **Partial** | ACS-aligned: yes. Certificate depth: prompt-only. Difficulty: prompt-only. |
| Across-ACS mode feels logically connected | **Partial** | `connectedWalk()` with taxonomy fingerprints. No transition explanation. |
| Examiner behavior distinct across personalities | **No** | Personality infrastructure exists but is not user-facing or tested. |
| Weak student: probes appropriately, records, generates weak-area plan | **Partial** | Probing: yes (follow-up). Recording: yes (element_attempts). Plan: PR #3 only. |
| Multimodal questions with correct artifacts | **Partial** | Infrastructure exists. Semantic correctness of image selection unverified. |
| Admin can tune prompts without code changes | **Partial** | DB + API exists. Table may be empty. No verified admin workflow. |

---

## Cross-References

- [[20 - ExamPlan and Planner v1]] --- Phase 4 implementation details
- [[11 - Production Reality Audit Refresh]] --- Production state snapshot
- [[03 - Knowledge Base and Retrieval Pipeline]] --- RAG pipeline architecture
- [[12 - Knowledge Graph Quality Audit and Refactor Plan]] --- Graph quality metrics
- PR #3: `phase5-grading-v2-quick-drill` --- R9 and R10 implementation

---

## Conclusion

Of the 10 core requirements and 2 design constraints in the Oral Exam Problem Statement:

- **2 requirements are fully implemented** (R2 Exam Shape, R3 ACS Compliance)
- **6 requirements are partially implemented** (R1, R4, R5, R6, R7, R8)
- **2 requirements exist only in PR #3** (R9 V2 grading, R10 Quick Drill)
- **0 requirements have no implementation at all**

The most impactful next action is **merging PR #3** to bring R9 and R10 onto main. After that, the highest-value gaps are:

1. **Post-hoc grounding verification** (R1) --- the highest-risk failure mode
2. **Results display UI** (R9) --- students currently receive no feedback
3. **Difficulty validation** (R4) --- no evidence that difficulty setting works
4. **Personality exposure** (R6) --- infrastructure exists but is invisible to users
5. **Admin prompt verification** (R8) --- table may be empty in production
