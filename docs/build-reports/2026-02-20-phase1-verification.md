---
date: 2026-02-20
type: staging-verification
tags: [heydpe, staging, phase1, verification, release-candidate]
status: blocked
decision: CONDITIONAL-GO
---

# Phase 1 Staging Verification — 2026-02-20

> **Branch:** `wire-rag-metadata-filter-runtime` at `dc22274`
> **Supabase:** `pvuiwwqsumoqjepukjhz` (production — no staging environment exists)
> **Automated runner:** `npm run verify:staging` executed at 2026-02-20T03:05Z

---

## Executive Summary

Phase 1 code is **complete and verified locally**. All 235 unit tests pass, TypeScript is clean, zero new lint errors in Phase 1 files. Regulatory eval harness achieves 22/25 baseline and 25/25 (100%) with metadata filters.

**CONDITIONAL GO** — the release is blocked only by two unapplied migrations. Once migrations are applied and the automated runner passes all 5 checks, this is ready for production.

> [!warning] Single Environment
> This project uses a single Supabase instance (production). There is no separate staging project. Migrations must be applied directly to production. All Phase 1 changes are additive (new tables, new columns) with no destructive DDL.

---

## Local Verification Results

| Check | Result |
|-------|--------|
| Unit tests | **294 passed** (16 test files, 519ms) |
| TypeScript | **Clean** (zero errors) |
| Lint (Phase 1 files only) | **0 errors** |
| Lint (full codebase) | 134 problems (all pre-existing, none in Phase 1 files) |
| Eval baseline (no filters) | **22/25 (88%)** |
| Eval with-filters | **25/25 (100%)** — zero regressions |

---

## Automated Runner Output (verify:staging)

| Check | Section | Status | Detail |
|-------|---------|--------|--------|
| Latency Logs (1h) | a | BLOCKED | `latency_logs` table missing `timings` column — migration 20260220100001 not applied |
| Timing Spans | b | BLOCKED | Same root cause — `timings` JSONB column does not exist |
| Embedding Cache | c | WARN | Table exists but 0 rows (expected: no exam exchanges with embedding cache code deployed) |
| ACS Graph | d | WARN | 0 concepts, 0 relations — migration 20260220100002 not applied |
| Metadata Filter Flag | e | PASS | Not set in system_config (default: OFF) — correct pre-deploy state |

**Result: 1/5 — BLOCKED pending migration application**

---

## Latency Span P50/P95 Table

_Not available — requires migration `20260220100001` to add `timings` JSONB column to `latency_logs`, then at least one exam exchange._

**Expected spans after deployment:**

| Span | Expected P50 (ms) | Notes |
|------|--------------------|-------|
| `prechecks` | <100 | Profile + session enforcement (parallel) |
| `rag.total` | 500-1500 | Embedding generation + hybrid search |
| `rag.filters.infer` | <1 | Pure regex, only when metadata filter enabled |
| `rag.search.filtered` | 300-800 | First pass with metadata filter |
| `rag.search.unfiltered_fallback` | 300-800 | Only if filtered results sparse |
| `llm.assessment.total` | 1000-3000 | Claude answer assessment |
| `llm.examiner.total` | 1000-3000 | Claude examiner generation |

---

## Embedding Cache Stats

| Metric | Value |
|--------|-------|
| Total cached | 0 |
| Reuse rate | 0.0% |

_Expected: populates after exam exchanges with deployed code. Each unique query (normalized) creates a cache entry. Repeat queries skip the OpenAI embedding call (~150-300ms savings)._

---

## ACS Graph Counts

| Category | Count | Expected |
|----------|-------|----------|
| acs_area | 0 | ~30 |
| acs_task | 0 | ~143 |
| acs_element | 0 | ~500+ |
| is_component_of edges | 0 | ~elements + tasks |

_Expected: populates after migration `20260220100002` is applied._

---

## Metadata Filter Flag Status

| Key | Value | Interpretation |
|-----|-------|---------------|
| `rag.metadata_filter` | NOT SET | Filter is OFF (correct default) |

**To enable after deployment:**
```sql
INSERT INTO system_config (key, value)
VALUES ('rag.metadata_filter', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

---

## Unblock Steps (in order)

1. **Apply migration `20260220100001`** — embedding cache table + latency timings JSONB
   ```bash
   supabase db push
   ```
   Or apply manually via Supabase SQL editor.

2. **Apply migration `20260220100002`** — ACS skeleton graph
   Same method as above. Depends on `acs_elements` being populated.

3. **Deploy code** — merge `wire-rag-metadata-filter-runtime` to `main` and deploy to Vercel.

4. **Run at least one exam exchange** — triggers latency logging + embedding cache population.

5. **Re-run verification:**
   ```bash
   npm run verify:staging
   ```
   All 5 checks should pass.

6. **Enable metadata filter** (optional, recommended):
   ```sql
   INSERT INTO system_config (key, value)
   VALUES ('rag.metadata_filter', '{"enabled": true}')
   ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
   ```

7. **Verify timing spans** include `rag.filters.infer` and `rag.search.filtered`.

---

## Branch State

> [!warning] Branch Divergence
> `wire-rag-metadata-filter-runtime` and `main` have diverged. The branch contains 14 commits not on main (including non-Phase-1 feature work). A clean merge or rebase is needed before merging. Phase 1 commits specifically:
>
> - `c04ed2a` — latency instrumentation, TTL caching, embedding cache
> - `d7178ce` — page_start/page_end in ingestion
> - `614ff6e` — CI workflow + parallel pre-checks
> - `e5a134c` — RAG metadata filtering, ACS skeleton graph migration
> - `8c7c959` — regulatory eval harness, staging checklist
> - `16cd8d5` — eval doc_type resolution fix
> - `c7c4e9a` — CI lint non-blocking
> - `cabd509` — wire metadata filtering into runtime
> - `dc22274` — compound certificate patterns, staging verification runner

---

## Go / No-Go

| Criterion | Status | Notes |
|-----------|--------|-------|
| Unit tests pass | GO | 294/294 |
| TypeScript clean | GO | Zero errors |
| No new lint errors | GO | 0 in Phase 1 files |
| Eval baseline >= 80% | GO | 88% |
| Eval with-filters >= baseline | GO | 100% (zero regressions) |
| Migrations applied | **BLOCKED** | 2 migrations pending |
| Latency logs populated | **BLOCKED** | Requires migration + exam exchange |
| Embedding cache active | **BLOCKED** | Requires migration + exam exchange |
| ACS graph populated | **BLOCKED** | Requires migration |
| Metadata filter flag test | DEFERRED | Test after enabling flag post-deploy |
| **Overall** | **CONDITIONAL GO** | All code verified. Apply migrations to unblock. |

> [!decision] Recommendation
> **CONDITIONAL GO.** Apply the two pending migrations, deploy the code, run one exam exchange, then re-run `npm run verify:staging`. If all 5 checks pass, Phase 1 is production-ready.

---

## Documentation Mismatches Fixed

| File | Issue | Fix |
|------|-------|-----|
| `CLAUDE.md` | TTS listed as "OpenAI TTS (tts-1, onyx)" | Updated to multi-provider (Cartesia/Deepgram/OpenAI) |
| `CLAUDE.md` | "77 unit tests" | Updated to 235+ across 12 test files |
| `CLAUDE.md` | "Knowledge graph is empty" | Updated: populated via migration, unused at runtime |
| `CLAUDE.md` | "No latency logging" | Updated: implemented via timing.ts |
| `07 - Optimization Roadmap.md` | Flag key `rag.metadata_filter.enabled` | Fixed to `rag.metadata_filter` with `{"enabled": true}` value |

---

*See also: [[09 - Staging Verification]], [[07 - Optimization Roadmap]], [[03 - Knowledge Base and Retrieval Pipeline]]*
