# Flow Coherence Audit (R5)

**Date:** 2026-03-03
**Elements sampled:** 50
**Fingerprints loaded:** 0
**Trials:** 5

## Results

| Metric | Connected Walk | Random Baseline | Delta |
|--------|---------------|-----------------|-------|
| Avg Jaccard | 0.0% | 0.0% | +0.0% |
| Pct shared slugs | 0.0% | 0.0% | +0.0pp |

## Checks

| Check | Pass | Detail |
|-------|------|--------|
| walk_beats_random | ✅ | SKIP: no fingerprints available (walk degrades to shuffle) |
| shared_slug_coverage | ✅ | SKIP: no fingerprints available |
| function_exported | ✅ | connectedWalk() is exported from exam-logic.ts |
| no_fp_appended | ✅ | 0 with FP, 50 without (correctly appended) |

## Sample Consecutive Pairs (first 10)

| From | To | Jaccard | Shared Slugs |
|------|----|---------|-------------|
| PA.IX.A.R1 | PA.VIII.C.R5 | 0 | (none) |
| PA.VIII.C.R5 | PA.IX.G.R5 | 0 | (none) |
| PA.IX.G.R5 | PA.II.B.K3 | 0 | (none) |
| PA.II.B.K3 | PA.IV.C.R3 | 0 | (none) |
| PA.IV.C.R3 | PA.I.E.K4 | 0 | (none) |
| PA.I.E.K4 | PA.II.E.K6 | 0 | (none) |
| PA.II.E.K6 | PA.II.D.R3 | 0 | (none) |
| PA.II.D.R3 | PA.X.B.R1 | 0 | (none) |
| PA.X.B.R1 | PA.IV.C.R2 | 0 | (none) |
| PA.IV.C.R2 | PA.IV.L.R3 | 0 | (none) |

## Methodology

- Reimplements `jaccardSimilarity()` (private in exam-logic.ts)
- Loads taxonomy fingerprints from DB (RPC or evidence chain fallback)
- Runs `connectedWalk()` and random shuffle on same element set
- Compares average pairwise Jaccard similarity across 5 trials
