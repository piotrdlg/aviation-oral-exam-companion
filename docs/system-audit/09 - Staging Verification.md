---
date: 2026-02-19
type: system-audit
tags: [aviation-oral-exam, staging, verification, migrations, latency]
status: draft
---

# 09 - Staging Verification

> This document covers the staging verification checklist for the latency instrumentation and embedding cache migration. It should be executed in order against the staging environment before promoting to production.

---

## Migration Apply Order

Apply the following migration in sequence:

1. `20260220100001_embedding_cache_and_latency_timings.sql` — embedding cache table + latency timings JSONB
2. `20260220100002_acs_skeleton_graph.sql` — ACS skeleton in concepts + concept_relations

Both depend on the initial schema (`20260214000001_initial_schema.sql`). The ACS graph migration also depends on `acs_elements` being populated (via `seed-elements.ts` or migration `20260214000003_acs_elements.sql`). Apply in order.

---

## SQL Verification Queries

### a) Sanity Check — Rows in `latency_logs` in the Last Hour

Confirms that the exam API is writing latency records after the migration is applied.

```sql
SELECT count(*) AS recent_latency_rows
FROM latency_logs
WHERE created_at > now() - interval '1 hour';
```

Expected result after running at least one exam exchange: `recent_latency_rows > 0`.

---

### b) P50 / P95 Per Span from `timings` JSONB

Breaks down each named timing span extracted from the `timings` JSONB column, reporting median and 95th-percentile latencies with sample counts.

```sql
SELECT
  key AS span,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY value::numeric) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY value::numeric) AS p95_ms,
  count(*) AS samples
FROM latency_logs, jsonb_each_text(timings)
WHERE created_at > now() - interval '1 hour'
GROUP BY key
ORDER BY key;
```

Expected spans after a full exam exchange: `assess_answer`, `generate_examiner_turn`, `tts`, and any additional spans instrumented in the exam engine. All `p50_ms` values should be within acceptable thresholds (see [[07 - Optimization Roadmap]]).

---

### c) Embedding Cache Stats

Row count, newest entry, and approximate hit rate from the `embedding_cache` table.

```sql
-- Row count and age
SELECT
  count(*)          AS total_cached_embeddings,
  max(created_at)   AS newest_entry,
  min(created_at)   AS oldest_entry
FROM embedding_cache;

-- Hit proxy: entries where last_used_at > created_at (reused at least once)
SELECT
  count(*) FILTER (WHERE last_used_at > created_at + interval '1 second') AS reused_entries,
  count(*)                                                                 AS total_entries,
  round(
    count(*) FILTER (WHERE last_used_at > created_at + interval '1 second')::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                                        AS reuse_rate_pct
FROM embedding_cache;
```

Expected: `total_cached_embeddings > 0` after exam exchanges. `reuse_rate_pct` grows as users ask similar questions.

---

### d) ACS Graph Verification

After applying `20260220100002_acs_skeleton_graph.sql`:

```sql
-- Concept counts by category (expect: acs_area ~30, acs_task ~143, acs_element ~500+)
SELECT category, count(*) AS concept_count
FROM concepts
WHERE category IN ('acs_area', 'acs_task', 'acs_element')
GROUP BY category
ORDER BY concept_count DESC;

-- Relation counts (expect: is_component_of edges = elements + tasks)
SELECT relation_type, count(*) AS edge_count
FROM concept_relations
GROUP BY relation_type
ORDER BY edge_count DESC;

-- Sample: verify PA.I.A.K1 element links to PA.I.A task, which links to Private Area I
SELECT
  src.slug  AS from_slug,
  cr.relation_type,
  tgt.slug  AS to_slug
FROM concept_relations cr
JOIN concepts src ON cr.source_id = src.id
JOIN concepts tgt ON cr.target_id = tgt.id
WHERE src.slug = 'acs_element:PA.I.A.K1'
   OR src.slug = 'acs_task:PA.I.A'
ORDER BY src.slug;
```

---

## Manual Smoke Test Checklist

Run these steps against the staging environment in order. Tick each box only when the expected outcome is confirmed.

- [ ] Apply migration `20260220100001_embedding_cache_and_latency_timings.sql` to staging
- [ ] Start exam (`action=start` via `POST /api/exam`) — verify a new row appears in `latency_logs` within a few seconds
- [ ] Respond to a question (`action=respond` via `POST /api/exam`) — verify the `timings` JSONB column on the new `latency_logs` row is populated with at least one named span
- [ ] Check that `embedding_cache` has new rows after the `respond` call (if vector search was triggered)
- [ ] Verify voice TTS still works end-to-end (`POST /api/tts` returns MP3 audio without errors)
- [ ] Check that `system_config` cache reads do not throw errors and that the kill-switch flag (if present) is respected correctly
- [ ] **Metadata filter verification:**
  - [ ] Enable: `INSERT INTO system_config (key, value) VALUES ('rag.metadata_filter', '{"enabled": true}') ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';`
  - [ ] Run exam `respond` action → verify `latency_logs.timings` includes `rag.filters.infer` span
  - [ ] Ask a question that mentions a specific CFR section (e.g., "What does 91.155 require?") → verify `rag.search.filtered` span appears
  - [ ] Ask a generic question → verify no `rag.search.filtered` span (inferRagFilters returned null)
  - [ ] Disable after: `UPDATE system_config SET value = '{"enabled": false}' WHERE key = 'rag.metadata_filter';`

---

## How to Run `eval:regulatory`

**Prerequisites:** `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

```bash
# Basic run (no metadata filters)
npm run eval:regulatory

# Run with metadata filter comparison
npm run eval:regulatory -- --with-filters
```

**What it does:** Runs 25 regulatory assertions (VFR minimums, currency, instruments, airspace, medical, documents) against the live RAG pipeline. For each assertion, it checks whether at least one returned chunk matches the expected `doc_type`/`abbreviation` AND contains at least one of the `must_contain_any` tokens.

**Expected results:**
- Initial pass rate: depends on corpus quality and embedding coverage
- With `--with-filters`: should show equal or improved pass rate vs baseline
- Target: >80% pass rate for production readiness

**Data file:** `scripts/eval/regulatory-assertions.json` (25 assertions, easily extensible)

---

*See also: [[05 - Latency Audit and Instrumentation Plan]], [[07 - Optimization Roadmap]], [[08 - PAL MCP Research Log]]*
