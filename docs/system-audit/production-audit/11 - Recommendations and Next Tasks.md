---
date: 2026-02-24
type: audit-report
tags: [aviation-oral-exam, system-audit, recommendations, roadmap]
status: active
priority-scheme: P1-knowledge, P2-realism, P3-latency, defer
---

# 11 — Recommendations and Next Tasks

> [!summary]
> Prioritized action items derived from the production audit. Organized by impact category: knowledge correctness first (user trust), exam realism second (product quality), latency third (only if blocking UX). Each item includes definition of done, code touchpoints, rollback strategy, and testing requirements.

---

## Priority Framework

| Priority | Category | Rationale |
|----------|----------|-----------|
| **P1** | Knowledge Correctness / Grounding | Wrong answers destroy trust. RAG quality is the product. |
| **P2** | Exam Flow Realism | Realistic exam simulation is the value proposition. |
| **P3** | Latency | Only matters if it degrades UX below acceptable thresholds. |
| **Defer** | Safe to defer | Nice-to-have or low-impact items. |

---

## Stop-the-Line Blockers

> [!danger] These issues should be addressed before any new feature work.

1. **Embedding cache writes are broken** (P1.1) — every query re-embeds, wasting OpenAI costs and adding ~300ms latency per query. `cache_reused=0` across all production usage.
2. **All chunks have `page_start=0`** (P1.2) — citations cannot include page numbers, reducing grounding verifiability for users studying from FAA publications.

---

## P1: Knowledge Correctness / Grounding

### P1.1 — Fix Embedding Cache Writes

**Goal**: Embedding cache actually caches. After fix, repeated queries reuse cached embeddings instead of re-calling OpenAI.

**Definition of done**: Run the same exam query twice; second query shows `cache_reused=true` in logs. `SELECT COUNT(*) FROM embedding_cache` increases after exam usage.

**Code touchpoints**:
- `src/lib/rag-retrieval.ts` lines 80-91 — the non-blocking upsert that writes to `embedding_cache`
- Likely issue: silent failure in the upsert (Supabase RLS blocking the write, or the async fire-and-forget swallowing errors)

**DB migrations**: None needed. Table exists.

**Feature flag**: None (this is a bug fix, not a feature toggle).

**Tests to add**:
- Integration test: call embedding retrieval twice with same query, assert cache hit on second call
- Unit test: mock Supabase client, verify upsert is called with correct payload

**Rollback**: No rollback needed. If the fix introduces issues, revert the commit. Cache is additive (reads fall through to OpenAI on miss).

**Staging first**: Yes. Run 5 exam queries on staging, verify `embedding_cache` row count increases.

---

### P1.2 — Re-ingest Chunks with Page Tracking

**Goal**: All 4,674 source chunks have accurate `page_start` and `page_end` values populated from the original PDF sources.

**Definition of done**: `SELECT COUNT(*) FROM source_chunks WHERE page_start IS NULL OR page_start = 0` returns 0.

**Code touchpoints**:
- `scripts/ingest-sources.ts` — the ingestion script that processes PDF sources
- `scripts/extract-images/` — related extraction tooling
- Source PDFs: PHAK, AIM, CFR Part 61/91, FAA-S-ACS documents

**DB migrations**: None needed. Columns exist.

**Feature flag**: None.

**Tests to add**:
- Post-ingest validation query: assert no rows with `page_start = 0` or `NULL`
- Spot-check 10 chunks against source PDFs to verify page numbers are correct

**Rollback**: Re-run ingestion. The script is idempotent by `content_hash` — re-ingesting overwrites existing rows.

**Execution**:
```bash
npx tsx scripts/ingest-sources.ts --subset all
```

**Staging first**: Yes. Ingest on staging, verify page numbers, then run on prod.

---

### P1.3 — Enable Metadata Filtering in Production

**Goal**: RAG queries for specific FAA sources (e.g., "What does 14 CFR 61.113 say?") use metadata filters to narrow the search space, improving precision.

**Definition of done**: Queries mentioning specific CFR sections, PHAK chapters, or AIM sections return chunks from the correct source document with higher ranking.

**Code touchpoints**:
- `src/lib/rag-search-with-fallback.ts` — reads the `rag.metadata_filter` flag from `system_config`
- `src/lib/rag-filters.ts` — 32 unit tests covering filter inference logic
- `src/lib/__tests__/rag-filters.test.ts` — existing test coverage

**DB migration (staging first)**:
```sql
INSERT INTO system_config (key, value)
VALUES ('rag.metadata_filter', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

**Feature flag**: `rag.metadata_filter` in `system_config` table.
- Enable: `UPDATE system_config SET value='{"enabled": true}' WHERE key='rag.metadata_filter';`
- Disable: `UPDATE system_config SET value='{"enabled": false}' WHERE key='rag.metadata_filter';`

**Tests to add**:
- E2E test: ask a question referencing "14 CFR 91.205" and verify returned chunks are from CFR source
- Regression test: ask a general question (no source reference) and verify no filter is applied (fallback behavior preserved)

**Rollback**: Set flag to `false` (see above). Instant, no deployment needed.

**Staging first**: Yes. Enable on staging, run 10 exam queries with source-specific references, compare retrieval quality against baseline.

---

### P1.4 — Add Grounding Instruction to Examiner Prompt

**Goal**: The DPE examiner persona consistently cites FAA source material (regulation numbers, PHAK chapters, AIM sections) when asking questions and providing feedback.

**Definition of done**: Spot-check 10 examiner turns across different ACS areas. At least 8/10 include a specific FAA reference when discussing regulatory or procedural content.

**Code touchpoints**:
- `prompt_versions` table in Supabase — the active system prompt for the examiner
- No code changes needed; this is a prompt content update

**DB migration (staging first)**:
```sql
-- Add grounding instruction to the active examiner prompt
-- Exact wording to append to the system prompt:
-- "Always base your questions on the provided FAA source material.
--  When referencing a regulation, standard, or procedure, cite the
--  specific source (e.g., '14 CFR 91.205', 'PHAK Chapter 5',
--  'AIM 4-3-2'). If the source material does not cover the topic,
--  say so rather than fabricating a reference."
```

**Feature flag**: None. Prompt versioning in `prompt_versions` table provides rollback capability.

**Tests to add**:
- Manual eval: 10 examiner turns, score citation quality (0-2 scale: 0=no citation, 1=vague reference, 2=specific citation)
- Target: mean score >= 1.5

**Rollback**: Revert to previous prompt version in `prompt_versions` table.

**Staging first**: Yes. Update prompt on staging, run 5 exam sessions, evaluate citation quality before promoting to prod.

---

## P2: Exam Flow Realism

### P2.5 — Add Question Budget

**Goal**: Each exam session has a predetermined number of questions (default 20, configurable at session start). The exam ends naturally when the budget is exhausted, simulating real checkride time constraints.

**Definition of done**: A session started with `question_budget=20` ends automatically after 20 exchanges. The user sees a summary screen. The budget is visible in the session config.

**Code touchpoints**:
- `src/types/database.ts` — add `question_budget` to `SessionConfig` interface
- `src/lib/exam-logic.ts` — add budget check to `pickNextElement()` or the element queue consumer
- `src/app/api/exam/route.ts` — check budget before advancing to next question; return `sessionComplete` when exhausted
- `src/app/(dashboard)/practice/page.tsx` — display remaining question count (optional, nice-to-have)

**DB migrations**:
```sql
-- Add question_budget column to exam_sessions (nullable, default 20)
ALTER TABLE exam_sessions
ADD COLUMN question_budget INTEGER DEFAULT 20;
```

**Feature flag**: None. Config-driven via `question_budget` column. Default 20. `NULL` means unlimited (backward compatible).

**Tests to add**:
- Unit test: `pickNextElement()` returns `null` when exchange count >= budget
- Integration test: start session with `question_budget=5`, submit 5 answers, verify session completes
- Edge case: budget of 0 (should immediately complete), budget of 1

**Rollback**: Set `question_budget = NULL` for new sessions (reverts to unlimited). No code rollback needed if the check is `if (budget && count >= budget)`.

---

### P2.6 — Add Follow-up Probe Limit

**Goal**: When a student gives an unsatisfactory answer, the examiner probes up to 2 more times on the same element before moving on. This prevents infinite loops on weak areas and matches real DPE behavior (examiners don't drill the same question forever).

**Definition of done**: After 2 consecutive unsatisfactory follow-ups on the same element, the examiner moves to the next element. The element is marked as unsatisfactory in the session record.

**Code touchpoints**:
- `src/lib/exam-logic.ts` — track `consecutive_unsatisfactory_count` per element; add `MAX_PROBES = 2` constant
- `src/app/api/exam/route.ts` — after assessment, check probe count before deciding whether to follow up or advance

**DB migrations**: None. Probe count is ephemeral (lives in session state, not persisted).

**Feature flag**: None. Constant `MAX_PROBES` in `exam-logic.ts`.

**Tests to add**:
- Unit test: simulate 3 consecutive unsatisfactory answers on same element, verify element advances after 2 probes
- Unit test: satisfactory answer resets probe counter
- Unit test: partial answer counts as a probe attempt

**Rollback**: Set `MAX_PROBES` to a very high number (e.g., 999) to effectively disable.

---

### P2.7 — Logically Connected Cross-ACS Mode

**Goal**: Instead of random element selection, use knowledge graph edges (`leads_to_discussion_of`, `requires_knowledge_of`) to order elements in a way that mimics how a real DPE naturally transitions between topics.

**Definition of done**: When `cross_acs` mode is enabled, element ordering follows graph edges. A session transcript shows logical topic flow (e.g., weather -> flight planning -> performance, not weather -> regulations -> weather).

**Code touchpoints**:
- `src/lib/exam-logic.ts` — new `buildGraphOrderedQueue()` function that uses `concept_relations` edges to create a traversal order
- Depends on: `concept_relations` table having sufficient `leads_to_discussion_of` and `requires_knowledge_of` edges between ACS elements

**DB migrations**: None (uses existing `concept_relations` table).

**Feature flag**: Could be gated by a session config option (`ordering: 'random' | 'graph'`). Default `random` for safety.

**Tests to add**:
- Unit test: given a mock graph with known edges, verify `buildGraphOrderedQueue()` produces a connected traversal
- Integration test: start a graph-ordered session, verify consecutive elements share a graph edge
- Fallback test: if graph has no edges for a given element, fall back to random selection

**Rollback**: Set ordering config to `random`.

**Depends on**: Quality of graph edges. Audit `concept_relations` for `leads_to_discussion_of` edge coverage before implementing.

---

## P3: Latency (Only If Blocking UX)

### P3.8 — Fix `exchange.total` Timing Span

**Goal**: The `exchange.total` latency span records the full round-trip time from student answer submission to examiner response completion. Currently `null` in all 83 production logs.

**Definition of done**: New latency log entries have non-null `exchange.total` values. Median total exchange time is measurable.

**Code touchpoints**:
- `src/app/api/exam/route.ts` approximately line 525 — the streaming response path does not call `timing.end('exchange.total')` before the stream closes
- `src/lib/timing.ts` — the timing utility itself is correct; the issue is in the call site

**DB migrations**: None.

**Feature flag**: None (bug fix).

**Tests to add**:
- Integration test: submit an answer via the exam API, verify the latency log entry has a non-null `exchange.total`
- Verify: `SELECT COUNT(*) FROM latency_logs WHERE spans->>'exchange.total' IS NOT NULL` increases after fix

**Rollback**: Revert commit. No data impact (latency logs are append-only).

---

### P3.9 — Evaluate Graph Retrieval Latency Impact

**Goal**: Quantify the latency added by `graph.enhanced_retrieval` (the additional RPC call to `get_related_concepts()`). Determine if it needs optimization.

**Definition of done**: Report showing p50/p95 latency for `rag.graph.bundle` span across 50+ exchanges. Decision documented: acceptable, needs caching, or needs async prefetch.

**Code touchpoints**:
- Latency logs: `SELECT spans->>'rag.graph.bundle' FROM latency_logs WHERE spans->>'rag.graph.bundle' IS NOT NULL`
- `src/lib/rag-retrieval.ts` — the graph retrieval call site

**DB migrations**: None.

**Feature flag**: `graph.enhanced_retrieval` in `system_config` (already exists, set to `true`).

**Tests to add**: None (this is a measurement task, not a code change).

**Rollback**: If latency is unacceptable, set `graph.enhanced_retrieval` to `false` in `system_config`.

---

## Safe to Defer

> [!info] These items are genuine improvements but do not block core product quality. Implement when bandwidth allows or when they become prerequisites for other work.

| Item | Rationale for Deferral |
|------|----------------------|
| **Rating-specific prompt tuning** | Private/commercial/instrument exams have different depth expectations, but the current generic prompt produces acceptable results for all three. Tune when user feedback indicates depth mismatch. |
| **Admin UI for prompt editing** | Prompts are managed via DB. Admin UI is a developer convenience, not a user-facing need. |
| **Error tracking service integration** | Vercel logs and Supabase logs provide sufficient visibility for current scale. Add Sentry/similar when user count exceeds manual debugging capacity. |
| **Session cleanup automation** | Abandoned sessions (`in_progress` for >24h) accumulate but do not impact active users. Add a cron job when table size becomes a concern. |
| **Monolithic `practice/page.tsx` refactor** | The main exam page is large but functional. Refactor when adding significant new UI features to the practice page. |
| **Transcript persistence** | `session_transcripts` table exists but is not written to. Enable when building features that need historical transcript access (e.g., review mode, spaced repetition). |
| **Admin graph visualization improvements** | 4-tab interface exists and is functional. Polish when graph management becomes a regular workflow. |

---

## Implementation Sequence

> [!tip] Recommended order of execution

```
Week 1:  P1.1 (embedding cache fix) + P1.3 (enable metadata filter)
         Both are low-risk, high-impact, no code deployment needed for P1.3

Week 2:  P1.2 (re-ingest with page tracking)
         Requires script run and validation

Week 3:  P1.4 (grounding instruction) + P3.8 (exchange.total fix)
         Prompt update + small code fix

Week 4:  P2.5 (question budget) + P2.6 (probe limit)
         Both modify exam-logic.ts, can be developed together

Later:   P2.7 (graph-ordered elements) — depends on edge quality audit
         P3.9 (graph latency evaluation) — measurement only, do anytime
```

---

## Cross-References

- [[10 - Drift vs Existing Docs]] — identifies which existing docs need updating based on these findings
- [[02 - Deployed Reality Snapshot]] — production state data underlying these recommendations
- [[01 - Requirements and Non-Negotiables]] — constraints that these recommendations must respect
