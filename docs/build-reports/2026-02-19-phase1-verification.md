---
date: 2026-02-19
type: staging-verification
tags: [aviation-oral-exam, staging, phase1, verification]
status: pre-deploy
---

# Phase 1 — Staging Verification Report

> **Branch:** `wire-rag-metadata-filter-runtime`
> **Commits:** `cabd509` (wire metadata filter) + `dc22274` (compound patterns + staging runner)
> **Reference:** [[09 - Staging Verification]]

---

## Migrations Checklist

| # | Migration | Status |
|---|-----------|--------|
| 1 | `20260220100001_embedding_cache_and_latency_timings.sql` | [ ] Not yet applied |
| 2 | `20260220100002_acs_skeleton_graph.sql` | [ ] Not yet applied |

Apply in order. Both depend on `20260214000001_initial_schema.sql`. ACS graph also depends on `acs_elements` being populated.

---

## Automated Checks

Run after migrations are applied and at least one exam exchange has been performed:

```bash
npm run verify:staging
```

The script checks:

| Check | Section | Expected |
|-------|---------|----------|
| Latency Logs (1h) | a | > 0 rows in `latency_logs` |
| Timing Spans | b | Populated `timings` JSONB with P50/P95 per span |
| Embedding Cache | c | > 0 rows in `embedding_cache`, reuse rate growing |
| ACS Graph | d | ~30 areas, ~143 tasks, ~500+ elements, `is_component_of` edges |
| Metadata Filter Flag | e | Informational — reports current flag status |

Output: console summary + `docs/staging-reports/YYYY-MM-DD-phase1-verification.md` (overwrites this file with live data).

---

## Manual Smoke Tests

- [ ] Start exam (`action=start` via `POST /api/exam`) — verify `latency_logs` row appears
- [ ] Respond to question (`action=respond`) — verify `timings` JSONB has named spans
- [ ] Check `embedding_cache` has rows after respond call
- [ ] Verify TTS works end-to-end (`POST /api/tts` returns MP3)
- [ ] Verify `system_config` cache reads do not throw errors

---

## Metadata Filter Verification

- [ ] Enable:
  ```sql
  INSERT INTO system_config (key, value)
  VALUES ('rag.metadata_filter', '{"enabled": true}')
  ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
  ```
- [ ] Run exam `respond` action — verify `latency_logs.timings` includes `rag.filters.infer` span
- [ ] Ask CFR question (e.g., "What does 91.155 require?") — verify `rag.search.filtered` span
- [ ] Ask generic question — verify no `rag.search.filtered` span
- [ ] Disable after:
  ```sql
  UPDATE system_config SET value = '{"enabled": false}'
  WHERE key = 'rag.metadata_filter';
  ```

---

## Eval Harness Results (Pre-Deploy Baseline)

| Metric | Result |
|--------|--------|
| Baseline (no filters) | 22/25 (88%) |
| With filters | 25/25 (100%) |
| Delta | +3 (medical-003, documents-001, documents-002) |
| Regressions | 0 |

---

## Go / No-Go

| Criterion | Status |
|-----------|--------|
| Migrations applied | [ ] |
| Latency logs populated | [ ] |
| Timing spans present | [ ] |
| Embedding cache active | [ ] |
| ACS graph populated | [ ] |
| TTS end-to-end | [ ] |
| Metadata filter flag test | [ ] |
| Unit tests (294) | PASS |
| TypeScript clean | PASS |
| Eval baseline >= 80% | PASS (88%) |
| Eval with-filters >= baseline | PASS (100%) |
| **Overall** | **PENDING — run verify:staging after deploy** |

---

## Notes / Anomalies

- 129 pre-existing lint errors (none from this branch) — CI lint step is non-blocking
- `airspace-001` regression fixed: standalone "certificate"/"endorsement" keywords replaced with compound patterns
- Eval harness uses shared `inferRagFilters` from `src/lib/rag-filters.ts` (no stale local copy)

---

*See also: [[09 - Staging Verification]], [[07 - Optimization Roadmap]], [[03 - Knowledge Base and Retrieval Pipeline]]*
