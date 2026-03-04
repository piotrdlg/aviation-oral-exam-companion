# Depth & Difficulty Contract Audit (Phase 10)

**Date:** 2026-03-04

## Checks

| Check | Pass | Detail |
|-------|------|--------|
| all_combinations_valid | ✅ | 32 contracts generated, all fields populated: true |
| deterministic | ✅ | All contracts deterministic |
| examiner_format_sections | ✅ | 6 required sections: all present |
| assessment_format_sections | ✅ | 6 required sections: all present |
| difficulty_gradient | ✅ | easy→hard gradient verified for all ratings |
| rating_gradient | ✅ | private→instrument gradient verified for all difficulties |
| summary_char_counts | ✅ | All contract summaries have reasonable char counts (depth>=100, prec>=50, tol>=50) |
| depth_profiles_complete | ✅ | 4 depth profiles: all defined |

## Contract Matrix (char counts)

| Rating | Difficulty | Element | TargetDepth | Precision | Tolerance | Examiner | Assessment |
|--------|------------|---------|-------------|-----------|-----------|----------|------------|
| private | easy | knowledge | 443 | 422 | 463 | 1661 | 1205 |
| private | easy | risk | 345 | 422 | 463 | 1563 | 1205 |
| private | medium | knowledge | 443 | 452 | 403 | 1729 | 1177 |
| private | medium | risk | 345 | 452 | 403 | 1631 | 1177 |
| private | hard | knowledge | 443 | 434 | 409 | 1786 | 1163 |
| private | hard | risk | 345 | 434 | 409 | 1688 | 1163 |
| private | mixed | knowledge | 443 | 443 | 399 | 1689 | 1163 |
| private | mixed | risk | 345 | 443 | 399 | 1591 | 1163 |
| commercial | easy | knowledge | 457 | 422 | 538 | 1768 | 1308 |
| commercial | easy | risk | 403 | 422 | 538 | 1714 | 1308 |
| commercial | medium | knowledge | 457 | 452 | 478 | 1836 | 1280 |
| commercial | medium | risk | 403 | 452 | 478 | 1782 | 1280 |
| commercial | hard | knowledge | 457 | 434 | 484 | 1893 | 1266 |
| commercial | hard | risk | 403 | 434 | 484 | 1839 | 1266 |
| commercial | mixed | knowledge | 457 | 443 | 474 | 1796 | 1266 |
| commercial | mixed | risk | 403 | 443 | 474 | 1742 | 1266 |
| instrument | easy | knowledge | 439 | 462 | 522 | 1791 | 1315 |
| instrument | easy | risk | 416 | 462 | 522 | 1768 | 1315 |
| instrument | medium | knowledge | 439 | 492 | 462 | 1859 | 1287 |
| instrument | medium | risk | 416 | 492 | 462 | 1836 | 1287 |
| instrument | hard | knowledge | 439 | 474 | 468 | 1916 | 1273 |
| instrument | hard | risk | 416 | 474 | 468 | 1893 | 1273 |
| instrument | mixed | knowledge | 439 | 483 | 458 | 1819 | 1273 |
| instrument | mixed | risk | 416 | 483 | 458 | 1796 | 1273 |
| atp | easy | knowledge | 215 | 317 | 397 | 1207 | 953 |
| atp | easy | risk | 240 | 317 | 397 | 1232 | 953 |
| atp | medium | knowledge | 215 | 347 | 337 | 1275 | 925 |
| atp | medium | risk | 240 | 347 | 337 | 1300 | 925 |
| atp | hard | knowledge | 215 | 329 | 343 | 1332 | 911 |
| atp | hard | risk | 240 | 329 | 343 | 1357 | 911 |
| atp | mixed | knowledge | 215 | 338 | 333 | 1235 | 911 |
| atp | mixed | risk | 240 | 338 | 333 | 1260 | 911 |

## Overall

**PASS** — 8/8 checks passed
