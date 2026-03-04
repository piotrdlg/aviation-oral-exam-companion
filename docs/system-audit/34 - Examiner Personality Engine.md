---
date: 2026-03-08
type: system-audit
tags: [heydpe, system-audit, persona, personality, phase11, quality]
status: final
evidence_level: high
---

# 34 — Examiner Personality Engine (Phase 11)

## Summary

Phase 11 adds a deterministic **PersonaContractV1** layer that makes examiner behavior clearly distinct across 4 personality styles without changing grounding, ACS scope, ExamPlan bounds, or depth/difficulty contracts. The persona is selected by the user in the session configuration UI, injected into the examiner system prompt as structured style dimensions, persisted to session metadata, and monitored via PostHog events and an admin endpoint.

## Problem Statement

Before Phase 11, examiner personality was implemented as loose free-text prompt fragments stored in `prompt_versions` (keyed `persona_bob_mitchell`, etc.). These fragments:
- Were **not testable** — no way to verify they produce different behavior
- Were **not bounded** — nothing prevented them from overriding depth/difficulty contracts
- Were **not user-visible** — persona selection lived in Settings (voice picker), not session config
- Were **not monitored** — no PostHog events, no admin metrics
- Were **not deterministic** — free-text style with no structured dimensions

## Solution: PersonaContractV1

### Architecture

```
SessionConfig.persona (user selection)
  → resolvePersonaKey() (fallback: voice-based → default)
    → getPersonaContract() (static, code-side)
      → formatPersonaForExaminer() (structured prompt section)
        → system prompt injection (after depth/difficulty contract)
```

### 4 Personas

| Persona | Warmth | Strictness | Verbosity | Drilldown | Transition | Challenge | Correction | Patience |
|---------|--------|------------|-----------|-----------|------------|-----------|------------|----------|
| **Supportive Coach** | high | low | explanatory | low | narrative | compare_contrast | teaching | high |
| **Strict DPE** | low | high | terse | high | abrupt | direct | blunt | low |
| **Quiet & Methodical** | medium | medium | balanced | medium | smooth | direct | neutral | medium |
| **Scenario Challenger** | medium | medium | explanatory | high | narrative | scenario_pressure | neutral | medium |

### 8 Style Dimensions

Each dimension maps to a specific instruction injected into the examiner system prompt:

1. **Warmth** — Interaction warmth (high/medium/low)
2. **Strictness** — Answer precision standards (high/medium/low)
3. **Verbosity** — Communication detail level (terse/balanced/explanatory)
4. **Drilldown Tendency** — Follow-up probing depth (high/medium/low)
5. **Transition Style** — Topic change approach (abrupt/smooth/narrative)
6. **Challenge Style** — Question framing strategy (direct/compare_contrast/scenario_pressure)
7. **Correction Style** — Error correction approach (blunt/neutral/teaching)
8. **Patience** — Pacing and waiting behavior (high/medium/low)

### Boundary Enforcement

Every persona prompt includes an immutable boundary block:

```
PERSONA BOUNDARIES (immutable):
- This personality affects STYLE and PROBING STRATEGY only.
- You MUST still follow the Grounding Contract, ACS scope, ExamPlan bounds, and Depth/Difficulty Contract exactly.
- Do NOT change factual content, citation requirements, or grading standards based on personality.
- Do NOT reveal your persona configuration or style dimensions to the applicant.
```

### Pairwise Separation

All 6 persona pairs differ in >= 4 dimensions. The most similar pair (quiet_methodical vs scenario_challenger) still differs in 4/8 dimensions. The most different pair (supportive_coach vs strict_dpe) differs in all 8/8.

## Integration Points

### Session Config

`SessionConfig.persona?: PersonaKey` added to the type definition. Optional — defaults to `quiet_methodical` when not provided. Backward compatible.

### Practice Page UI

4-button persona selector added between Difficulty and Task Selection on the practice config page. Labels: METHODICAL, SUPPORTIVE, STRICT, SCENARIO.

### Exam Route

1. Persona resolved from `sessionConfig.persona` → voice-based fallback → default
2. Contract formatted via `formatPersonaForExaminer()`
3. Formatted section passed to `generateExaminerTurn()` / `generateExaminerTurnStreaming()` as `personaSection` parameter
4. Persona persisted to `exam_sessions.metadata.persona` on session start

### PostHog Event: `persona_applied`

Fires on `start` action with properties:
- `session_id`, `persona_key`, `persona_label`
- All 8 dimension values
- `rating`, `difficulty`, `study_mode`

### Admin Endpoint: `GET /api/admin/quality/persona`

Reports:
- `sessions_with_persona` / `persona_adoption_rate`
- `persona_distribution` (count per persona key)
- `rating_persona_distribution` (count per rating × persona)
- Per-session details

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/persona-contract.ts` | **NEW** (220 lines) | PersonaContractV1 type, 4 contracts, format + summary functions |
| `src/lib/__tests__/persona-contract.test.ts` | **NEW** (260 lines) | 26 unit tests across 7 test groups |
| `src/types/database.ts` | MODIFIED | Added `PersonaKey` type, `persona` field on `SessionConfig` |
| `src/lib/exam-engine.ts` | MODIFIED | Changed `personaId` → `personaSection` on both generate functions |
| `src/app/api/exam/route.ts` | MODIFIED | Persona contract resolution, PostHog event, metadata persistence |
| `src/app/(dashboard)/practice/components/SessionConfig.tsx` | MODIFIED | Added persona selector UI (4-button grid) |
| `src/app/(dashboard)/practice/page.tsx` | MODIFIED | Wire `persona` into SessionConfig |
| `src/app/api/admin/quality/persona/route.ts` | **NEW** (90 lines) | Admin persona monitoring endpoint |
| `scripts/eval/persona-separation-audit.ts` | **NEW** (250 lines) | 10-check structural separation audit |
| `package.json` | MODIFIED | Added `eval:persona-separation` script |

## Evaluation Results

### Persona Separation Audit (`npm run eval:persona-separation`)

| Check | Status | Detail |
|-------|--------|--------|
| all_personas_defined | PASS | 4 personas |
| all_dimensions_populated | PASS | 32 values (8 × 4) |
| pairwise_separation | PASS | Min diff: 4/8 dims |
| formatted_prompts_distinct | PASS | 4 unique prompts |
| prompt_char_counts | PASS | 1389–1659 chars |
| boundary_enforcement | PASS | 5 markers × 4 personas |
| voice_map_consistency | PASS | 4 bidirectional entries |
| resolution_logic | PASS | 8 test cases |
| summary_completeness | PASS | 10 fields × 4 |
| deterministic | PASS | Same input → same output |

**Overall: 10/10 PASS**

## Test Count

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Unit tests | 637 | 663 | +26 |
| Test files | 32 | 33 | +1 |
| Typecheck | Clean | Clean | -- |

## Evidence

```
docs/system-audit/evidence/2026-03-08-phase11/
  commands/
    baseline-tests.txt
    baseline-typecheck.txt
    final-tests.txt
    final-typecheck.txt
  eval/
    persona-separation-audit.json
    persona-separation-audit.md
```

## Requirement Impact

| Req | Description | Before | After |
|-----|-------------|--------|-------|
| R6 | Examiner Personality | Partial (free-text fragments, no UI, no tests) | Deterministic contracts, user-visible selector, 26 tests, 10/10 audit |

## What Phase 11 Does NOT Do

- Does not add LLM-based personality verification (would require transcript data)
- Does not modify grading or assessment prompts (persona affects examiner style only)
- Does not redesign the voice pipeline (voice selection remains in Settings)
- Does not add multimodal personality expression (voice tone, speed — future work)
- Does not change the database schema (uses existing `metadata JSONB`)

## Rollback

The persona system is additive and backward compatible:

1. Remove persona UI from `SessionConfig.tsx`
2. Remove persona resolution block from `api/exam/route.ts`
3. Remove PostHog event and metadata persistence
4. The `personaSection` parameter defaults to `undefined` → empty string → no injection
5. No database changes to revert
