# Review 03 — Knowledge Graph & RAG

> Date: 2026-06-09 · Reviewer: AI agent (graph/RAG audit)
> Scope: graph-retrieval.ts, rag-retrieval.ts, rag-filters.ts, exam-planner graph usage, concept/relation migrations, RPCs, graph scripts, docs 06/12/16/17/29/31

## Verdict summary

The graph/RAG plumbing is competently built (clean module boundaries, feature-flagged, timing-instrumented, graceful failure paths), but the system's intelligence claims are largely unproven and partly disconnected. The production retrieval path uses only `chunk_hybrid_search` + `get_concept_bundle`; the two flagship RPCs documented in CLAUDE.md (`hybrid_search`, `get_related_concepts`) are dead code, never called from the app. The cross_acs study mode does **not** use the 24K-node graph at all: a slug-format mismatch (`acs:element:pa-i-a-k1` queried vs. `acs_element:PA.I.A.K1` stored) makes the evidence-chain fingerprint loader return zero rows every time, so it silently falls back to hardcoded area-keyword Jaccard similarity — and the team's own doc misdiagnosed this as "missing data" rather than a bug. The graph's edge semantics are weak: 3 of 6 relation types have zero edges, and the majority of the 50-74K edges are bulk keyword/embedding-heuristic attachments, not curated knowledge. The only quantitative quality evidence in the repo shows the graph **hurting** output: the grounding audit FAILed at 35.9% unsupported citations (threshold ≤10%), explicitly blamed on `get_concept_bundle` evidence chunks. Shadow mode produced no comparison dataset, and no with/without-graph eval harness exists, so "does the graph improve questions?" is currently unanswerable. Recommendation: fix the slug bug and bundle truncation, keep the chunk-RAG path (which is sound), and treat the graph as an experiment to be measured before any further investment — it is closer to "simplify or prove" than "expand."

## Findings

### 1. cross_acs mode never uses the graph — slug convention mismatch
**File:** `src/lib/exam-planner.ts:113-115,127` vs `supabase/migrations/20260220100002_acs_skeleton_graph.sql:127` — **Severity: High**
The planner queries concepts with slugs `acs:element:pa-i-a-k1` (lowercase, hyphenated, colon-namespaced), but the migration creates them as `'acs_element:' || ae.code` → `acs_element:PA.I.A.K1`. The `.in('slug', ...)` match returns 0 rows, evidence-chain fingerprints are always empty, and the code falls to `buildStructuralFingerprints()` (`exam-planner.ts:229-246`) — pure area-keyword Jaccard (`src/lib/exam-logic.ts:456-499,698-701`, keywords from `src/lib/citation-relevance.ts:66+`). Doc `31 - Flow Coherence Activation.md:18-27` documents the symptom ("evidence chain returned 0 fingerprints") but attributes it to missing data; the 2,174 `acs_element` concepts exist (graph-metrics 2026-02-26). **Action:** fix the slug pattern, then re-run `scripts/eval/flow-coherence-audit.ts` comparing evidence-chain vs structural fingerprints. Note `kb_chunk_taxonomy` may also still be sparsely populated (doc 16 line 128: "created but not yet populated"; only a 198-chunk pilot ran), so fixing the slug alone may not suffice.

### 2. `hybrid_search` and `get_related_concepts` are dead code
**File:** `supabase/migrations/20260214000001_initial_schema.sql` (both functions); only reference outside migrations is `scripts/audit/db-snapshot.ts:271-272` — **Severity: Medium**
The 60/40 weighting and depth-3 recursive CTE that CLAUDE.md advertises are never invoked by the app. Production uses `chunk_hybrid_search` (65/35, `20260214000005_source_tables.sql:106-150`) and `get_concept_bundle`. The SQL itself is mostly correct (DISTINCT ON (id) ORDER BY id, depth correctly keeps the shallowest occurrence; path-array cycle prevention works), but the recursive CTE enumerates all paths before dedup, which is combinatorial on dense subgraphs at depth 3. **Action:** delete or clearly mark as unused; update CLAUDE.md.

### 3. HNSW indexes exist but are bypassed by the query shape
**File:** `20260214000001_initial_schema.sql:60`, `20260214000005_source_tables.sql:50` (indexes); `chunk_hybrid_search` body `20260214000005_source_tables.sql:136-148` — **Severity: Medium**
Both hybrid RPCs filter on `(1 - (embedding <=> q)) > threshold` and `ORDER BY score` (a computed blend), not `ORDER BY embedding <=> q LIMIT k`, so pgvector cannot use the HNSW index — every call is a sequential scan computing 1536-dim cosine for every embedded row. At the actual scale (4,674 chunks per doc 11:36) this is tolerable (~tens of ms); it would not be at the "10K+/24K" scale CLAUDE.md claims. **Action:** restructure as a two-stage query (KNN via index in a CTE with `ORDER BY embedding <=> q LIMIT 50`, then re-rank with FTS blend).

### 4. Stale embeddings are still served
**File:** `20260214000001_initial_schema.sql:80-95` (trigger marks `embedding_status='stale'` on content change); `chunk_hybrid_search`/`hybrid_search` WHERE clauses check only `embedding IS NOT NULL` — **Severity: Low**
Staleness is tracked and `scripts/pipeline/embed-concepts.ts:117-118` re-embeds, but nothing in the search path excludes or prioritizes refresh. **Action:** add `embedding_status = 'current'` to search predicates or a cron for re-embedding.

### 5. Concept bundle truncated by random UUID order
**File:** `src/lib/graph-retrieval.ts:39-44` (`.limit(maxRows=50)`); `supabase/migrations/20260225000001_fix_bundle_rpc_multi_category.sql:64,94` — **Severity: High (when flag on)**
The bidirectional-fix version of `get_concept_bundle` must `ORDER BY g.id, g.depth, g.category` to satisfy `DISTINCT ON (g.id)`, so rows come back in UUID order, and the client-side `limit(50)` keeps an **arbitrary** 50 concepts — not the closest, not the highest-confidence. Doc `12:134-139` (P4) flagged exactly this and it was never done. Also: depth-0 incoming-edge expansion means an element with many `applies_in_scenario` claims pointing at it fans out before any relevance cut. **Action:** add `max_nodes`/relevance ordering inside the RPC (ORDER BY depth, confidence) and limit there, not client-side.

### 6. Bundle evidence content fetched but never used
**File:** RPC builds `left(sc.content, 500)` × up to 3 chunks per concept (`20260225000001:74-92`); `src/lib/graph-retrieval.ts:79-88` reads only `doc_title`/`page_ref` — **Severity: Low (waste)**
Up to 50 concepts × 3 × 500 chars (~75KB) of chunk text is joined, serialized, and shipped per call and then discarded. **Action:** drop `content` from the RPC's evidence JSON, or actually use it.

### 7. `formatBundleForPrompt` duplicates definitions and has an unbounded section
**File:** `src/lib/graph-retrieval.ts:115-129` — **Severity: Medium (economy)**
Definitions are printed in both KEY CONCEPTS (line 117) and DEFINITIONS (123-129), and KEY CONCEPTS has no slice — with a 50-row bundle, all topic/definition/procedure contents go into the prompt, twice for definitions. Regulatory claims are capped at 15 (line 101); nothing else is. **Action:** dedupe, cap KEY CONCEPTS, drop the redundant DEFINITIONS block.

### 8. Graph context is injected into both Claude calls per exchange
**File:** examiner: `src/lib/exam-engine.ts:268-269,326-327,406-408`; assessment: `exam-engine.ts:729-732` ("VERIFIED REGULATORY CLAIMS") — **Severity: Medium (economy)**
With the flag on, the same graph bundle text is paid for in both `assessAnswer` and `generateExaminerTurnStreaming` input tokens every exchange. Combined with 5 RAG chunks at ~800-token target chunking, retrieval context alone is roughly 4K (chunks) + ~1-3K (graph) tokens × 2 calls ≈ **10-14K input tokens per exchange** before history/system prompt. **Action:** pass only the regulatory-claims subset to assessment; use Anthropic prompt caching for static system prompt + persona blocks.

### 9. Edge semantics are mostly scaffolding, not knowledge
**Source:** `docs/graph-reports/2026-02-26-graph-metrics.json` (relations_by_type: only `is_component_of` 26,813 / `applies_in_scenario` 26,997 / `leads_to_discussion_of` 20,461); doc `12:35,57-59` (0 edges for `requires_knowledge_of`, `contrasts_with`, `mitigates_risk_of`); doc `16:89-98` (Class B and Class D claim→concept linkage still **0%**) — **Severity: High (concept)**
The edge types the GraphRAG proposal (doc `06:21-23`) was justified by — prerequisite chains and confusion pairs for DPE-style probing — do not exist. Existing edges came from embedding similarity (hardcoded to one type), CFR regex cross-ref, and keyword attachment. The 2026-02-26 metrics also show the Aircraft Hub effectively orphaned (reachability 0.05%) and evidence coverage diluted 98.6%→88.5% after taxonomy nodes were added. **Action:** before spending on LLM edge inference (doc 12 P1), first prove the bundle improves output.

### 10. The only measured quality signal implicates the graph negatively
**Source:** `docs/system-audit/29 - Exam Quality Harness and Calibration.md:80-110` — **Severity: High (evidence)**
Grounding audit: 35.9% unsupported citations vs ≤10% threshold → FAIL, with the stated cause being `get_concept_bundle` evidence chunks that are "topically adjacent but not directly relevant."

### 11. Shadow mode never produced comparison data
**Source:** `docs/system-audit/production-audit/08 - Graph and Flow Opportunities Audit.md:167-182,236-244` — **Severity: High (evidence gap)**
Shadow mode only `console.log`s a character count (`src/lib/exam-engine.ts:273-275`) — nothing is persisted, so there is no recorded "graph vs chunk-only" dataset. Flags were seeded `false` in `20260224000002_graph_feature_flags.sql:6-7` but doc 11 (2026-02-24) records both `true` in production; the repo cannot tell you the current value.

### 12. Latency profile: 4-6 DB round trips + 0-1 embedding call per exchange, minimal caching
**File:** `src/app/api/exam/route.ts:599-619` (transcript insert ∥ `fetchRagContext`); `src/lib/rag-retrieval.ts:50-92` (embedding cache check → OpenAI on miss); `exam-engine.ts:219-232` (bundle in parallel — good); `exam-engine.ts:277-279` (`get_images_for_chunks` runs **sequentially after** chunk search every exchange); `exam-engine.ts:66-99` (only prompt candidates are TTL-cached) — **Severity: Medium**
No per-element cache for `get_concept_bundle`, even though consecutive exchanges usually stay on the same element — the depth-2 recursive CTE re-runs every turn. Doc 11:58 flags embedding cache reuse rate as 0/possibly broken. **Action:** TTL-cache bundles keyed by elementCode; make image retrieval conditional or parallel; verify embedding-cache hit rate.

### 13. Bundle anchor vs planner element-code source is fragile
**File:** `src/app/api/exam/route.ts:616` — `elementCode: clientPlannerState?.queue?.[clientPlannerState?.cursor]` comes from **client-supplied** planner state; if absent, graph retrieval silently no-ops (`exam-engine.ts:221`). **Severity: Low** (resolved by server-side state ownership)

## Measurement gaps

1. **Are the flags on right now?** Repo seeds `graph.enhanced_retrieval=false`; docs from 2026-02 say true. Query `system_config` (keys `graph.enhanced_retrieval`, `graph.shadow_mode`, `rag.metadata_filter`) or hit `/api/flags`. Everything else hinges on this.
2. **Per-exchange retrieval latency.** Instrumentation exists (`rag.embedding.*`, `rag.hybridSearch`, `rag.graph.bundle`, `rag.imageSearch` spans → `latency_logs.timings`). Run the p50/p95 SQL in `docs/system-audit/05:184-194` grouped by span.
3. **Bundle size distribution.** Run `npm run verify:graph-e2e`; extend to all 2,174 elements to find how often the arbitrary 50-row truncation bites and the real token cost.
4. **Question quality with vs without graph — the core unknown.** No harness exists (doc 08 P4). Cheapest credible version: extend `scripts/eval/run-regulatory-assertions.ts` with a `--with-graph` mode; plus an LLM-judge pass over `generateExaminerTurn` outputs for ~50 elements with `graphContext` on/off, scoring specificity, factual accuracy, cross-topic probing.
5. **Token economy.** `usage_logs` records `input_tokens`/`output_tokens` with `{action, call}` metadata. Aggregate input tokens per exchange split by flag-on vs flag-off periods.
6. **Embedding cache effectiveness.** `SELECT count(*) FILTER (WHERE last_used_at > created_at) ...` on `embedding_cache`.
