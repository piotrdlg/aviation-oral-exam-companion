# PromptOps Governance Audit (Phase 14)

**Date:** 2026-03-04
**Total prompt_versions rows:** 24
**Overall result:** PASS

## Check 1: Row Counts by prompt_key

| prompt_key | draft | published | archived |
|------------|-------|-----------|----------|
| assessment_system | 1 | 9 | 1 |
| examiner_system | 0 | 9 | 0 |
| persona_bob_mitchell | 0 | 1 | 0 |
| persona_jim_hayes | 0 | 1 | 0 |
| persona_karen_sullivan | 0 | 1 | 0 |
| persona_maria_torres | 0 | 1 | 0 |

## Check 2: Coverage Matrix

Dimensions: 3 ratings x 4 modes x 4 difficulties x 2 keys = 96 combos

| Metric | Value |
|--------|-------|
| Total combos | 96 |
| Covered (specificity > 0) | 24 (25.0%) |
| Wildcard/fallback only | 72 |

<details><summary>Wildcard-only combos (72)</summary>

- `examiner_system/private/full_exam/easy`
- `examiner_system/private/full_exam/medium`
- `examiner_system/private/full_exam/hard`
- `examiner_system/private/full_exam/mixed`
- `examiner_system/private/topic_focus/easy`
- `examiner_system/private/topic_focus/medium`
- `examiner_system/private/topic_focus/hard`
- `examiner_system/private/topic_focus/mixed`
- `examiner_system/private/quick_drill/easy`
- `examiner_system/private/quick_drill/medium`
- `examiner_system/private/quick_drill/hard`
- `examiner_system/private/quick_drill/mixed`
- `examiner_system/commercial/full_exam/easy`
- `examiner_system/commercial/full_exam/medium`
- `examiner_system/commercial/full_exam/hard`
- `examiner_system/commercial/full_exam/mixed`
- `examiner_system/commercial/topic_focus/easy`
- `examiner_system/commercial/topic_focus/medium`
- `examiner_system/commercial/topic_focus/hard`
- `examiner_system/commercial/topic_focus/mixed`
- `examiner_system/commercial/quick_drill/easy`
- `examiner_system/commercial/quick_drill/medium`
- `examiner_system/commercial/quick_drill/hard`
- `examiner_system/commercial/quick_drill/mixed`
- `examiner_system/instrument/full_exam/easy`
- `examiner_system/instrument/full_exam/medium`
- `examiner_system/instrument/full_exam/hard`
- `examiner_system/instrument/full_exam/mixed`
- `examiner_system/instrument/topic_focus/easy`
- `examiner_system/instrument/topic_focus/medium`
- `examiner_system/instrument/topic_focus/hard`
- `examiner_system/instrument/topic_focus/mixed`
- `examiner_system/instrument/quick_drill/easy`
- `examiner_system/instrument/quick_drill/medium`
- `examiner_system/instrument/quick_drill/hard`
- `examiner_system/instrument/quick_drill/mixed`
- `assessment_system/private/full_exam/easy`
- `assessment_system/private/full_exam/medium`
- `assessment_system/private/full_exam/hard`
- `assessment_system/private/full_exam/mixed`
- `assessment_system/private/topic_focus/easy`
- `assessment_system/private/topic_focus/medium`
- `assessment_system/private/topic_focus/hard`
- `assessment_system/private/topic_focus/mixed`
- `assessment_system/private/quick_drill/easy`
- `assessment_system/private/quick_drill/medium`
- `assessment_system/private/quick_drill/hard`
- `assessment_system/private/quick_drill/mixed`
- `assessment_system/commercial/full_exam/easy`
- `assessment_system/commercial/full_exam/medium`
- `assessment_system/commercial/full_exam/hard`
- `assessment_system/commercial/full_exam/mixed`
- `assessment_system/commercial/topic_focus/easy`
- `assessment_system/commercial/topic_focus/medium`
- `assessment_system/commercial/topic_focus/hard`
- `assessment_system/commercial/topic_focus/mixed`
- `assessment_system/commercial/quick_drill/easy`
- `assessment_system/commercial/quick_drill/medium`
- `assessment_system/commercial/quick_drill/hard`
- `assessment_system/commercial/quick_drill/mixed`
- `assessment_system/instrument/full_exam/easy`
- `assessment_system/instrument/full_exam/medium`
- `assessment_system/instrument/full_exam/hard`
- `assessment_system/instrument/full_exam/mixed`
- `assessment_system/instrument/topic_focus/easy`
- `assessment_system/instrument/topic_focus/medium`
- `assessment_system/instrument/topic_focus/hard`
- `assessment_system/instrument/topic_focus/mixed`
- `assessment_system/instrument/quick_drill/easy`
- `assessment_system/instrument/quick_drill/medium`
- `assessment_system/instrument/quick_drill/hard`
- `assessment_system/instrument/quick_drill/mixed`

</details>

## Check 3: Version Ambiguity

No ambiguous groups found.

## Check 4: Required Prompt Keys

| Key | Status |
|-----|--------|
| examiner_system | ✅ Present |
| assessment_system | ✅ Present |
| persona_maria_torres | ✅ Present |
| persona_bob_mitchell | ✅ Present |
| persona_jim_hayes | ✅ Present |
| persona_karen_sullivan | ✅ Present |

## Check 5: Persona Coverage

Published persona prompts: 4

| Persona | Status |
|---------|--------|
| persona_maria_torres | ✅ Present |
| persona_bob_mitchell | ✅ Present |
| persona_jim_hayes | ✅ Present |
| persona_karen_sullivan | ✅ Present |

## Summary

| Check | Pass | Detail |
|-------|------|--------|
| row_counts_by_key | ✅ | 6 distinct prompt_key(s) found across 24 total rows |
| coverage_matrix | ✅ | 24/96 combos have specificity > 0; 72 rely on wildcard/fallback |
| version_ambiguity | ✅ | No (prompt_key, rating, study_mode, difficulty) groups have multiple published rows |
| required_prompt_keys | ✅ | All 6 required prompt keys have at least 1 published row |
| persona_coverage | ✅ | All 4 persona prompts found (4 total published persona rows) |

## Methodology

- Queries all rows from `prompt_versions` table (draft, published, archived)
- Check 1: Counts rows by `prompt_key` and `status`
- Check 2: Tests 96 combos (3 ratings x 4 modes x 4 difficulties x 2 keys) for published rows with specificity > 0
- Check 3: Finds (prompt_key, rating, study_mode, difficulty) groups with multiple published rows
- Check 4: Verifies 6 required keys each have at least 1 published row
- Check 5: Verifies all 4 persona prompts exist as published
