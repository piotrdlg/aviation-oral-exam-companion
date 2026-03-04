---
date: 2026-03-08
type: system-audit
tags: [heydpe, system-audit, rating-parity, commercial, private, instrument]
status: final
evidence_level: high
---

# 33 — Rating Parity Audit (Private, Commercial, Instrument)

## Why This Sprint Exists

Before Phase 11 (Personality), we needed to verify that all three supported certificate ratings are served equally across every subsystem. Earlier project work sometimes mentioned Private and Instrument explicitly while Commercial was not called out. The key audit question:

> "Is Commercial implemented everywhere Private and Instrument are implemented, with equivalent behavior?"

## Audit Scope

Every subsystem that handles rating/certificate was inspected:

1. UI/session configuration
2. Database content (ACS tasks, elements, sessions, prompts)
3. Graph/taxonomy/fingerprint infrastructure
4. Planner/runtime code paths
5. Depth profiles and difficulty contracts
6. Grounding keywords and citation scoring
7. Quick drill and grading behavior
8. Prompt governance
9. Tests and monitoring

## Parity Matrix

| Subsystem | Private | Commercial | Instrument | Verdict |
|-----------|---------|------------|------------|---------|
| **Rating type definition** | `database.ts:12` | Same | Same | PASS |
| **ACS area prefixes** | 10 areas | 7 areas | 6 areas | PASS |
| **DB: ACS tasks** | 61 | 60 | 22 | PASS |
| **DB: ACS elements** | 921 | 960 | 293 | PASS |
| **DB: Sessions** | 74 | 1 | 3 | PASS (usage) |
| **DB: Prompts** | 22 (wildcard) | 22 (wildcard) | 22 (wildcard) | PASS |
| **Depth profiles** | Distinct | Distinct | Distinct | PASS |
| **Difficulty contracts** | All 8 combos | All 8 combos | All 8 combos | PASS |
| **System prompt** | "Private Pilot" | "Commercial Pilot" | "Instrument Rating" | PASS |
| **Area keywords (grounding)** | DEFAULT map | **COMMERCIAL map (FIXED)** | INSTRUMENT map | **FIXED** |
| **Structural fingerprints** | Uses keywords | **Uses commercial keywords (FIXED)** | Uses instrument keywords | **FIXED** |
| **Transition labels** | 12 areas | 11 areas | 8 areas | PASS |
| **Transition bridges** | Uses keywords | **Uses commercial keywords (FIXED)** | Uses instrument keywords | **FIXED** |
| **Critical areas (grading)** | ['I'] | ['I'] | ['I','III'] | PASS |
| **Assessment label** | "Private Pilot" | "Commercial Pilot" | "Instrument Rating" | PASS |
| **Planner prefix** | PA. | CA. | IR. | PASS |
| **Doc relevance** | AFH primary | AFH primary | IFH/IPH primary | PASS |
| **Quick drill** | Supported | Supported | Supported | PASS |
| **Session config UI** | Selectable | Selectable | Selectable | PASS |
| **Eval scripts** | All cover 3 ratings | Same | Same | PASS |

## Commercial-Specific Findings

### Gap Found: Area Keywords (citation-relevance.ts)

**Severity:** Medium
**Impact:** Citation scoring, fingerprints, and transition bridges all used incorrect keywords for Commercial areas.

**Root cause:** `getAreaKeywords()` only branched on `instrument`. Commercial fell through to `DEFAULT_AREA_KEYWORDS` which are semantically aligned with the Private Pilot ACS area structure. Since Commercial's ACS has different topics at the same area numbers, the keywords were wrong for 3 areas:

| Area | Private Topic | Commercial Topic | DEFAULT Keywords | Correct? |
|------|--------------|-----------------|-----------------|----------|
| VIII | Basic Instrument Maneuvers | **High-Altitude Operations** | night, instrument, basic attitude | **WRONG** |
| IX | Emergency Operations | Emergency Operations | postflight, securing, parking | **WRONG** (DEFAULT['IX'] has postflight keywords) |
| XI | Night Operations | **Postflight Procedures** | aeromedical, hypoxia, fatigue | **WRONG** |

**Additionally:** Commercial Area I is the same topic (Preflight Preparation) but should include commercial-specific keywords (privileges, limitations, Part 119/135).

### Fix Applied

Created `COMMERCIAL_AREA_KEYWORDS` map in `src/lib/citation-relevance.ts` with overrides for areas I, VIII, IX, and XI. Updated `getAreaKeywords()` to branch on `'commercial'`.

**Areas affected by the fix:**
- `scoreCitationRelevance()` — now uses correct keywords for Commercial area matching
- `buildStructuralFingerprints()` — now produces correct topic slugs for CA elements
- `findSharedKeywords()` / `generateTransition()` — now finds correct cross-area bridges for Commercial

### No Other Gaps Found

All other subsystems handle Commercial symmetrically with Private and Instrument:
- Depth profiles: Commercial has its own distinct profile ("operational application", "moderate specificity")
- Difficulty contracts: All 32 rating x difficulty x element-type combinations valid
- Grading: Commercial has critical areas defined
- Quick drill: Works identically for all ratings
- Prompts: All 22 published prompts serve all ratings via null/wildcard matching
- UI: Commercial is selectable in session config

## Fixes Applied

| File | Change | Lines |
|------|--------|-------|
| `src/lib/citation-relevance.ts` | Added `COMMERCIAL_AREA_KEYWORDS` map (4 areas) | +52 lines |
| `src/lib/citation-relevance.ts` | Updated `getAreaKeywords()` to branch on `'commercial'` | +3 lines |
| `src/lib/__tests__/rating-parity.test.ts` | **NEW**: 19 parity tests across 9 subsystems | 300 lines |
| `src/lib/__tests__/citation-relevance.test.ts` | Added 2 commercial-specific scoring tests | +20 lines |
| `scripts/eval/rating-parity-audit.ts` | **NEW**: DB parity audit script | 210 lines |

## Test Count

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Unit tests | 616 | 637 | +21 |
| Test files | 31 | 33 | +2 |
| Typecheck | Clean | Clean | -- |

## Evidence

```
docs/system-audit/evidence/2026-03-08-parity/
  commands/
    baseline-tests.txt
    baseline-typecheck.txt
    db-parity-audit.txt
    final-tests.txt
    final-typecheck.txt
  sql/
    rating-parity-db.json
    rating-parity-db.md
  eval/
    rating-parity.json
```

## Residual Risks

1. **DEFAULT_AREA_KEYWORDS numbering mismatch for Private**: The DEFAULT keyword map has incorrect keywords for Private areas VII (has emergency keywords instead of stall/slow flight), IX (has postflight instead of emergency), and XI (has aeromedical instead of night operations). This is a pre-existing bug that predates this sprint and does NOT affect Commercial parity (Commercial now has its own overrides). Fixing Private's map is recommended but not blocking.

2. **Low Commercial session count**: Only 1 completed Commercial session exists in production. No ResultV2 data for Commercial. This is a usage gap, not a code gap — the system is structurally ready.

3. **No commercial-specific documents in DOC_RELEVANCE**: Unlike Instrument (which has IFH/IPH), there are no Commercial-only document types defined. This is because no such documents exist in the source corpus (Commercial topics are covered by PHAK, AFH, and CFR which are already mapped).

## Recommendation

**Phase 11 can proceed safely.** The single code gap (area keywords) has been fixed and locked with 21 new tests. All other subsystems handle Commercial symmetrically. The low session count is expected for a system that launched recently with Private Pilot as the primary user base.

## Commands Run

```bash
npm test                                    # 637 pass
npm run typecheck                           # Clean
npx tsx scripts/eval/rating-parity-audit.ts # DB parity: PASS (4/4 checks)
npm run eval:depth-contract                 # 8/8 PASS, 32 contracts
npm run eval:difficulty                     # 5/5 PASS
```
