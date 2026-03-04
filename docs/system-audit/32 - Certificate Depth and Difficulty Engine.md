---
date: 2026-03-07
type: system-audit
tags: [heydpe, system-audit, depth-profile, difficulty-contract, phase10, quality]
status: final
evidence_level: high
---

# 32 — Certificate Depth & Difficulty Engine (Phase 10)

## Summary

Phase 10 makes the examiner and grading system structurally aware of **certificate level** (private/commercial/instrument/atp) and **difficulty setting** (easy/medium/hard/mixed). A deterministic `DepthDifficultyContract` is generated at plan time for each question target and injected into both the examiner system prompt and the assessment scoring prompt. 32 distinct contracts cover all rating x difficulty x element-type combinations.

## Problem Statement

Before Phase 10, certificate depth and difficulty were handled as loose text strings:
- **R3 (Certificate Depth):** The system prompt said "FAA Commercial Pilot oral examination" but provided no structural guidance on expected depth, regulatory precision, or partial-credit tolerance per rating.
- **R4 (Difficulty):** Four difficulty strings were appended to the prompt but had no effect on grading tolerance, scenario complexity, or follow-up style.

Result: A private pilot easy session and an instrument hard session produced nearly identical examiner behavior and grading standards.

## Solution: Depth Profiles + Difficulty Contracts

### Architecture

```
Rating (private/commercial/instrument/atp)
  -> DepthProfile (static, per-rating expectations)
     + DifficultyModifier (static, per-difficulty adjustments)
       -> DepthDifficultyContract (deterministic, per-element)
          -> formatContractForExaminer() -> system prompt injection
          -> formatContractForAssessment() -> grading prompt injection
```

### DepthProfile

Each rating defines baseline expectations:

| Rating | Expected Depth | Regulatory Precision | Partial Tolerance |
|--------|---------------|---------------------|------------------|
| Private | Foundational recall | General awareness | Generous |
| Commercial | Operational application | Moderate specificity | Moderate |
| Instrument | Procedural precision | High specificity | Strict |
| ATP | Systems-level mastery | Exact citation expected | Minimal |

### DifficultyModifier

Each difficulty adjusts precision, tolerance, follow-up style, and scenario complexity:

| Difficulty | Precision | Tolerance | Follow-Up | Scenario |
|------------|-----------|-----------|-----------|----------|
| Easy | General understanding accepted | Lenient | Supportive hints | Simple, single-factor |
| Medium | Specific details expected | Moderate | Neutral probing | Multi-factor |
| Hard | Exact/precise answers demanded | Strict | Challenging pushback | Complex, multi-system |
| Mixed | Varies within session | Adaptive | Escalating | Progressive complexity |

### Contract Composition

`buildDepthDifficultyContract(rating, difficulty, elementType)` composes:
1. `targetDepth` from rating profile + element type guidance (knowledge vs risk)
2. `requiredPrecision` from rating baseline + difficulty modifier
3. `partialTolerance` from rating baseline + difficulty modifier
4. `followUpStyle` from difficulty modifier
5. `scenarioComplexity` from rating scenario style + difficulty modifier
6. `crossHubExpectation` from rating profile

### Prompt Injection

Two format functions produce different contract views:

**Examiner** (`formatContractForExaminer()`): Target Depth, Required Precision, Scenario Complexity, Follow-Up Style, Cross-Topic Awareness

**Assessment** (`formatContractForAssessment()`): Certificate Level, Difficulty, Required Precision, Partial Tolerance, Cross-Topic Awareness

The examiner gets guidance on *how to ask*; the assessor gets guidance on *how to grade*.

## Integration Points

### Planner (`exam-planner.ts`)

- `advancePlannerInternal()` generates contract after resolving difficulty
- Contract stored on `PlannerResult.depthDifficultyContract`
- Element type derived from current element's `element_type` field

### System Prompt (`exam-logic.ts`)

- `buildSystemPrompt()` accepts 6th parameter `depthContractSection?: string`
- Contract section appended to taskSection after difficultyInstruction
- Section header: `DEPTH & DIFFICULTY CONTRACT (follow these calibration rules):`

### Examiner Generation (`exam-engine.ts`)

- `generateExaminerTurn()` and `generateExaminerTurnStreaming()` accept `depthContractSection` parameter
- Passed through to `buildSystemPrompt()`

### Assessment (`exam-engine.ts`)

- `assessAnswer()` accepts `gradingContractSection?: string`
- Injected into dynamicSection after RAG + graph context
- Section header: `GRADING CALIBRATION CONTRACT (follow these scoring rules):`

### API Route (`api/exam/route.ts`)

| Action | Contract Source | Injection |
|--------|----------------|-----------|
| `start` | `plannerResult.depthDifficultyContract` | Examiner only |
| `respond` | Rebuilt from `sessionConfig` + element code | Both examiner + grading |
| `next-task` | `plannerResult.depthDifficultyContract` | Examiner only |

Element type inference in `respond`: parses element code suffix via `currentElementCode?.match(/\.(K|R|S)\d+$/)` (K=knowledge, R=risk, S=skill).

## Monitoring

### PostHog Event: `depth_contract_applied`

Fires on `start` and `next-task` actions with properties:
- `contract_rating`, `contract_difficulty`
- `element_code`, `element_type`, `study_mode`
- `contract_summary` (char counts via `contractSummary()`)

### Admin Endpoint: `GET /api/admin/quality/depth`

Reports:
- `sessions_with_contract` / `contract_adoption_rate`
- `rating_distribution`, `difficulty_distribution`
- `contract_pair_distribution` (e.g., `commercial:medium: 5`)
- Per-session details with contract metadata

## Changes Made

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/depth-profile.ts` | **NEW** (119 lines) | Rating-specific depth profiles for all 4 ratings |
| `src/lib/difficulty-contract.ts` | **NEW** (181 lines) | Contract builder, formatter (examiner + assessment), summary |
| `src/lib/__tests__/depth-profile.test.ts` | **NEW** (113 lines) | 14 unit tests |
| `src/lib/__tests__/difficulty-contract.test.ts` | **NEW** (180 lines) | 20 unit tests |
| `src/lib/exam-planner.ts` | MODIFIED | Contract generation in `advancePlannerInternal()` |
| `src/lib/exam-logic.ts` | MODIFIED | `depthContractSection` param on `buildSystemPrompt()` |
| `src/lib/exam-engine.ts` | MODIFIED | Contract params on `generateExaminerTurn()`, `assessAnswer()` |
| `src/app/api/exam/route.ts` | MODIFIED | Contract wiring in start/respond/next-task + PostHog events |
| `src/app/api/admin/quality/depth/route.ts` | **NEW** (109 lines) | Admin monitoring endpoint |
| `scripts/eval/depth-contract-audit.ts` | **NEW** (343 lines) | 8-check contract validation audit |
| `package.json` | MODIFIED | Added `eval:depth-contract` script |

## Evaluation Results

### Depth Contract Audit (`npm run eval:depth-contract`)

| Check | Result | Detail |
|-------|--------|--------|
| all_combinations_valid | PASS | 32 contracts generated, all fields populated |
| deterministic | PASS | Same input -> same output |
| examiner_format_sections | PASS | 6 required sections present |
| assessment_format_sections | PASS | 6 required sections present |
| difficulty_gradient | PASS | easy->hard gradient verified for all ratings |
| rating_gradient | PASS | private->instrument gradient verified for all difficulties |
| summary_char_counts | PASS | All summaries have reasonable char counts |
| depth_profiles_complete | PASS | 4 depth profiles defined |

**Overall: 8/8 PASS**

### Difficulty Calibration (`npm run eval:difficulty`)

**PASS** — 5/5 instruction injection checks pass for all rating x difficulty combinations.

## Test Count

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Unit tests | 582 | 616 | +34 |
| Test files | 29 | 31 | +2 |
| Typecheck | Clean | Clean | -- |

## Evidence

```
docs/system-audit/evidence/2026-03-07-phase10/
  commands/
    baseline-tests.txt
    baseline-typecheck.txt
    final-tests.txt
    final-typecheck.txt
  eval/
    baseline-difficulty-calibration.json
    depth-contract-audit.json
    depth-contract-audit.md
```

## Requirement Impact

| Req | Description | Before | After |
|-----|-------------|--------|-------|
| R3 | Certificate Depth | Prompt-driven only | Deterministic contract with per-rating depth profiles |
| R4 | Difficulty | 4 text strings, no grading effect | Full contract with precision, tolerance, follow-up, scenario |

## Rollback

The contract system is additive and backward-compatible. All new parameters default to `undefined`, making the contract injection opt-out:

1. Remove contract generation from `advancePlannerInternal()` in `exam-planner.ts`
2. Remove contract formatting from `start`/`respond`/`next-task` in `api/exam/route.ts`
3. Remove PostHog events
4. No database changes to revert
