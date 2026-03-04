# Flow Coherence Audit (R5)

**Date:** 2026-03-03
**Elements sampled:** 50
**Fingerprints loaded:** 535
**Trials:** 5

## Results

| Metric | Connected Walk | Random Baseline | Delta |
|--------|---------------|-----------------|-------|
| Avg Jaccard | 70.9% | 14.3% | +395.3% |
| Pct shared slugs | 99.6% | 63.4% | +36.2pp |

## Checks

| Check | Pass | Detail |
|-------|------|--------|
| walk_beats_random | ✅ | walk 70.9% > random 14.3% (395.3% improvement) |
| shared_slug_coverage | ✅ | 99.6% of pairs share >= 1 taxonomy slug (threshold: 50%) |
| function_exported | ✅ | connectedWalk() is exported from exam-logic.ts |
| no_fp_appended | ✅ | 50 with FP, 0 without (correctly appended) |

## Sample Consecutive Pairs (first 10)

| From | To | Jaccard | Shared Slugs |
|------|----|---------|-------------|
| PA.I.B.R1 | PA.I.G.K2 | 0.882 | topic:preflight, topic:airworthiness, topic:certificate, topic:document, topic:logbook |
| PA.I.G.K2 | PA.II.B.K2 | 0.061 | topic:preflight, topic:inspection, etype:knowledge |
| PA.II.B.K2 | PA.II.E.R1 | 0.818 | topic:preflight, topic:procedures, topic:inspection, topic:cockpit, topic:checklist |
| PA.II.E.R1 | PA.II.F.R1 | 0.905 | topic:preflight, topic:procedures, topic:inspection, topic:cockpit, topic:checklist |
| PA.II.F.R1 | PA.IV.I.R5 | 0.054 | topic:configuration, etype:risk |
| PA.IV.I.R5 | PA.IV.I.R1 | 1 | topic:takeoff, topic:landing, topic:pattern, topic:approach, topic:crosswind |
| PA.IV.I.R1 | PA.IV.I.K2 | 0.9 | topic:takeoff, topic:landing, topic:pattern, topic:approach, topic:crosswind |
| PA.IV.I.K2 | PA.IV.D.K3 | 0.9 | topic:takeoff, topic:landing, topic:pattern, topic:approach, topic:crosswind |
| PA.IV.D.K3 | PA.IV.D.K1 | 1 | topic:takeoff, topic:landing, topic:pattern, topic:approach, topic:crosswind |
| PA.IV.D.K1 | PA.IV.D.R3 | 0.9 | topic:takeoff, topic:landing, topic:pattern, topic:approach, topic:crosswind |

## Methodology

- Reimplements `jaccardSimilarity()` (private in exam-logic.ts)
- Loads taxonomy fingerprints from DB (RPC or evidence chain fallback)
- Runs `connectedWalk()` and random shuffle on same element set
- Compares average pairwise Jaccard similarity across 5 trials
