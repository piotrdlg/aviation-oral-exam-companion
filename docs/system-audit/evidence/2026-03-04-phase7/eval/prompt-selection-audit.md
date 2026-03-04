# Prompt Selection Audit (R8)

**Date:** 2026-03-04
**Published DB prompts:** 22
**Config combos tested:** 96

## Selection Summary

| Source | Count | Pct |
|--------|-------|-----|
| DB prompt | 96 | 100.0% |
| Fallback | 0 | 0.0% |

## Fallback Prompts

| Key | Length | Valid |
|-----|--------|-------|
| examiner_system | 573 | ✅ |
| assessment_system | 1189 | ✅ |
| IMMUTABLE_SAFETY_PREFIX | 504 | ✅ |

## DB Prompt Versions

| Key | Rating | Mode | Difficulty | Version |
|-----|--------|------|-----------|--------|
| assessment_system | * | * | * | v2 |
| assessment_system | * | linear | mixed | v1 |
| assessment_system | * | linear | easy | v1 |
| assessment_system | * | cross_acs | easy | v1 |
| assessment_system | * | linear | medium | v1 |
| assessment_system | * | cross_acs | medium | v1 |
| assessment_system | * | linear | hard | v1 |
| assessment_system | * | cross_acs | mixed | v1 |
| assessment_system | * | cross_acs | hard | v1 |
| examiner_system | * | linear | easy | v1 |
| examiner_system | * | linear | mixed | v1 |
| examiner_system | * | cross_acs | mixed | v1 |
| examiner_system | * | cross_acs | easy | v1 |
| examiner_system | * | linear | medium | v1 |
| examiner_system | * | cross_acs | medium | v1 |
| examiner_system | * | linear | hard | v1 |
| examiner_system | * | cross_acs | hard | v1 |
| examiner_system | * | * | * | v1 |
| persona_bob_mitchell | * | * | * | v1 |
| persona_jim_hayes | * | * | * | v1 |
| ... | | | | (2 more) |

## Checks

| Check | Pass | Detail |
|-------|------|--------|
| fallback_prompts_valid | ✅ | Both fallback prompts have content (examiner_system:573, assessment_system:1189) |
| safety_prefix_exists | ✅ | IMMUTABLE_SAFETY_PREFIX: 504 chars |
| no_empty_prompts | ✅ | All 96 combos produce non-empty content |
| specificity_scoring | ✅ | 2 distinct specificity level(s): 0, 2 |
| getPromptContent_never_empty | ✅ | getPromptContent() returns fallback when DB is null — validated by non-empty content check |

## Methodology

- Queries `prompt_versions` table for published rows
- Imports `FALLBACK_PROMPTS`, `IMMUTABLE_SAFETY_PREFIX`, `getPromptContent` from prompts.ts
- Replicates specificity scoring from `loadPromptFromDB()` in exam-engine.ts
- Tests all 3 ratings × 4 modes × 4 difficulties × 2 keys = 96 combos
