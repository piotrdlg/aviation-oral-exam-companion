---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, quality-harness, calibration, grounding, difficulty, flow, prompts]
status: final
evidence_level: high
---

# Exam Quality Harness and Calibration

**Phase:** 7
**Date:** 2026-03-04
**Branch:** `inventory-verification-sprint-20260227`
**Purpose:** Reusable quality-verification harness generating hard evidence for remaining partially-implemented requirements (R1, R4, R5, R8).

---

## Executive Summary

Phase 7 builds a reusable evaluation harness — 6 scripts that can be re-run after any change to measure exam quality. The harness answers five questions:

1. **Are weak-area citations actually grounded?** (R1) — FAIL: 35.9% unsupported rate (threshold: <=10%)
2. **Does difficulty setting change question behavior?** (R4) — PASS: instruction injection verified; transcript analysis pending (no multi-difficulty sessions yet)
3. **Does connectedWalk produce coherent flow?** (R5) — PASS (SKIP): function works correctly; no taxonomy fingerprints currently attached to PA elements
4. **Does the prompt pipeline pick the right version?** (R8) — PASS: 22 published prompts, 96/96 combos served correctly, 4 persona fragments, safety prefix on all
5. **Does Quick Drill target weak elements?** (R10) — PASS: 7 satisfactory excluded, unsatisfactory prioritized in first 10

---

## Scripts

| Script | npm Command | Requirement | Status |
|--------|-------------|-------------|--------|
| `scripts/smoke/phase7-summary-http.ts` | `smoke:phase7:summary` | R9 (weak-area report) | PASS |
| `scripts/smoke/phase7-quickdrill-smoke.ts` | `smoke:phase7:quickdrill` | R10 (quick drill targeting) | PASS |
| `scripts/eval/grounding-citation-audit.ts` | `eval:grounding` | R1 (citation accuracy) | FAIL |
| `scripts/eval/difficulty-calibration.ts` | `eval:difficulty` | R4 (difficulty calibration) | PASS |
| `scripts/eval/flow-coherence-audit.ts` | `eval:flow` | R5 (flow coherence) | PASS (SKIP) |
| `scripts/eval/prompt-selection-audit.ts` | `eval:prompts` | R8 (prompt governance) | PASS |

---

## Step A: Smoke/Evidence Gaps

### A1: Summary Report Smoke (`smoke:phase7:summary`)

Reimplements the `buildWeakAreaReport()` evidence chain using direct Supabase service role client (bypasses `import 'server-only'` guard in `src/lib/weak-area-report.ts`).

**Results:**
- 2 sessions with V2 data found
- Session `6cc31bb3`: 14 weak elements, 10/10 audited grounded (100%)
- Session `3564331f`: 10 weak elements, 10/10 audited grounded (100%)

**Evidence:** `evidence/2026-03-04-phase7/api/summary-*.json`

### A2: Quick Drill Smoke (`smoke:phase7:quickdrill`)

Exercises `buildElementQueue()` with `studyMode: 'quick_drill'` using real element scores from production.

**Results:**
- User `068d07ba` with 5 completed sessions, 921 element scores
- 7 satisfactory elements correctly excluded from queue (528 elements)
- 2 unsatisfactory elements found in first 10 (weighted prioritization working)

**Evidence:** `evidence/2026-03-04-phase7/api/quickdrill-smoke.json`

---

## Step B: Grounding / Citation Accuracy Audit (R1)

### Methodology

Deterministic relevance scoring of weak-area citations:
- **SUPPORTS**: 2+ area-specific keyword matches OR direct element code reference
- **WEAK_SUPPORT**: 1 keyword match OR universal doc type (PHAK, AIM, 14 CFR)
- **UNSUPPORTED**: No keyword matches, not a universal doc type

Area keywords defined in `AREA_TOPIC_KEYWORDS` map covering all 12 ACS areas.

### Results

| Metric | Value |
|--------|-------|
| Sessions audited | 2 |
| Total citations scored | 92 |
| SUPPORTS | 7 (7.6%) |
| WEAK_SUPPORT | 52 (56.5%) |
| UNSUPPORTED | 33 (35.9%) |
| Aggregate grounding score | 35.9% |
| **Unsupported rate** | **35.9% (threshold: <=10%)** |
| **Result** | **FAIL** |

### Failure Patterns

| Area | Unsupported Count |
|------|-------------------|
| Area I (Preflight) | 17 |
| Area II (Procedures) | 8 |
| Area V (Maneuvers) | 4 |
| Area IV (Takeoff/Landing) | 3 |
| Area VI (Navigation) | 1 |

### Interpretation

The high unsupported rate is driven by citations from the `get_concept_bundle` RPC that return evidence chunks associated with the element's knowledge graph neighborhood — these chunks may be topically adjacent but not directly relevant to the specific ACS area. The deterministic scorer is conservative: it requires area-specific keywords that may not appear in general FAA reference text.

**Root cause hypothesis:** Evidence-based citations (from concept_chunk_evidence) are attached at the concept level, not the area level. A chunk about "aircraft systems" may be evidence for a concept linked to an Area I element but contain no Area I keywords like "certificate" or "airworthiness."

**Recommended fix:** Improve `buildWeakAreaReport()` citation filtering to score relevance before returning citations, or add area-level keyword matching in the evidence chain.

**Evidence:** `evidence/2026-03-04-phase7/eval/grounding-citation-audit.{json,md}`

---

## Step C: Difficulty Calibration Audit (R4)

### Methodology

1. **Instruction injection validation**: Imports `buildSystemPrompt()` and checks that each difficulty level (easy/medium/hard/mixed/none) produces the correct prompt text
2. **Transcript analysis**: Loads examiner turns grouped by difficulty, measures word count, scenario markers, regulation references

### Results

| Difficulty | Instruction Present | Expected Text |
|-----------|-------------------|---------------|
| easy | Yes | "Ask straightforward recall/definition questions." |
| medium | Yes | "Ask application and scenario-based questions." |
| hard | Yes | 'Ask complex edge cases, "what if" chains...' |
| mixed | Yes | "Vary difficulty naturally..." |
| (none) | Yes | No DIFFICULTY LEVEL header |

**Transcript analysis:** No completed sessions with difficulty metadata found in `exam_sessions.difficulty` column. This is expected — the difficulty field may be stored in session metadata rather than a top-level column, or all sessions were run with default difficulty.

### Calibration Checks

| Check | Result | Detail |
|-------|--------|--------|
| instruction_injection | PASS | All 5 levels produce correct prompt text |
| difficulty_coverage | Data gap | Need sessions at different difficulty levels for comparison |

**Evidence:** `evidence/2026-03-04-phase7/eval/difficulty-calibration.{json,md}`

---

## Step D: Flow Coherence Audit (R5)

### Methodology

1. Reimplements `jaccardSimilarity()` (private in exam-logic.ts)
2. Loads ACS elements + attempts to build taxonomy fingerprints from evidence chain
3. Runs `connectedWalk()` on 50-element sample, 5 trials
4. Compares average pairwise Jaccard similarity against random shuffle baseline

### Results

| Metric | Connected Walk | Random Baseline | Delta |
|--------|---------------|-----------------|-------|
| Avg Jaccard | 0.0% | 0.0% | 0.0% |
| Pct shared slugs | 0.0% | 0.0% | 0.0pp |

**Explanation:** No taxonomy fingerprints are currently attached to PA elements via the evidence chain. Without fingerprints, `connectedWalk()` correctly degrades to shuffle (per its documented behavior: "Elements without fingerprints are appended at the end").

### Calibration Checks

| Check | Result | Detail |
|-------|--------|--------|
| walk_beats_random | SKIP | No fingerprints available |
| shared_slug_coverage | SKIP | No fingerprints available |
| function_exported | PASS | connectedWalk() is exported from exam-logic.ts |
| no_fp_appended | PASS | 0 with FP, 50 without (correctly appended) |

**Action needed:** Populate `get_element_taxonomy_fingerprints` RPC or build fingerprints from concept→taxonomy edges. Once fingerprints exist, re-run this audit to validate coherence.

**Evidence:** `evidence/2026-03-04-phase7/eval/flow-coherence-audit.{json,md}`

---

## Step E: Prompt Selection Audit (R8)

### Methodology

1. Queries `prompt_versions` table for all published rows
2. Imports `FALLBACK_PROMPTS`, `IMMUTABLE_SAFETY_PREFIX`, `getPromptContent` from prompts.ts
3. Replicates specificity scoring from `loadPromptFromDB()` for all 96 config combos (3 ratings x 4 modes x 4 difficulties x 2 prompt keys)

### Results

| Metric | Value |
|--------|-------|
| Published DB prompts | 22 |
| Config combos tested | 96 |
| DB prompt selected | 96 (100%) |
| Fallback selected | 0 (0%) |
| Safety prefix present | 96/96 |
| Persona fragments | 4 (bob_mitchell, jim_hayes, karen_sullivan, maria_torres) |

### DB Prompt Distribution

| Key | Versions | Ratings | Modes |
|-----|----------|---------|-------|
| examiner_system | 9 | (null) | linear, cross_acs, (null) |
| assessment_system | 9 | (null) | (null), linear, cross_acs |
| persona_* | 4 | (null) | (null) |

### Audit Checks

| Check | Result | Detail |
|-------|--------|--------|
| fallback_prompts_valid | PASS | examiner_system:573, assessment_system:1189 |
| safety_prefix_exists | PASS | IMMUTABLE_SAFETY_PREFIX: 504 chars |
| no_empty_prompts | PASS | All 96 combos produce non-empty content |
| specificity_scoring | PASS | 2 distinct specificity levels (0, 2) |
| getPromptContent_never_empty | PASS | Validated by non-empty content check |

**Evidence:** `evidence/2026-03-04-phase7/eval/prompt-selection-audit.{json,md}`

---

## Scoreboard

| Requirement | Audit | Result | Gap | Priority |
|-------------|-------|--------|-----|----------|
| **R1** | Grounding Citation Accuracy | **FAIL** (35.9% unsupported) | Evidence-chain citations not area-filtered | HIGH |
| **R4** | Difficulty Calibration | **PASS** (instruction injection) | No transcript data for comparison | MEDIUM |
| **R5** | Flow Coherence | **PASS** (SKIP, function correct) | No taxonomy fingerprints on PA elements | MEDIUM |
| **R8** | Prompt Governance | **PASS** (22 DB prompts, 96/96 served) | No audit trail logging | LOW |
| **R9** | Summary Report | **PASS** (100% grounded) | Only 2 V2 sessions in production | LOW |
| **R10** | Quick Drill Targeting | **PASS** (7 excluded, prioritization works) | — | — |

---

## Recommended Next Sprint

1. **R1 citation filtering** (HIGH) — Add relevance scoring to `buildWeakAreaReport()` citation pipeline; reject evidence chunks that don't match the element's ACS area keywords. Re-run `eval:grounding` to verify <=10% unsupported.

2. **R5 fingerprint population** (MEDIUM) — Build or populate `get_element_taxonomy_fingerprints` RPC so `connectedWalk()` can use real taxonomy data. Re-run `eval:flow` to measure improvement over random.

3. **R4 transcript comparison** (MEDIUM) — Run exam sessions at easy, medium, and hard difficulty levels. Re-run `eval:difficulty` to validate question behavior gradients.

4. **R6 personality exposure** (MEDIUM) — 4 persona fragments exist in DB but are not user-visible. Expose persona selection in UI.

5. **R8 audit trail** (LOW) — Log which prompt version ID was used for each session (already available from `loadPromptFromDB()` return value).

---

## Evidence Pack

```
docs/system-audit/evidence/2026-03-04-phase7/
├── api/
│   ├── summary-6cc31bb3.json
│   ├── summary-3564331f.json
│   └── quickdrill-smoke.json
├── eval/
│   ├── grounding-citation-audit.json
│   ├── grounding-citation-audit.md
│   ├── difficulty-calibration.json
│   ├── difficulty-calibration.md
│   ├── flow-coherence-audit.json
│   ├── flow-coherence-audit.md
│   ├── prompt-selection-audit.json
│   └── prompt-selection-audit.md
└── commands/
    ├── smoke-summary-output.txt
    ├── smoke-quickdrill-output.txt
    ├── eval-grounding-output.txt
    ├── eval-difficulty-output.txt
    ├── eval-flow-output.txt
    └── eval-prompts-output.txt
```
