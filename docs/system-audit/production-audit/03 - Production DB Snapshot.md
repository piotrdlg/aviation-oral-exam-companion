---
title: "Production DB Snapshot"
date: 2026-02-25
tags: [audit, database, metrics, heydpe]
status: current
evidence_level: high
audit_ref: prod-reality-audit-20260224
supabase_ref: pvuiwwqsumoqjepukjhz
---

# Production DB Snapshot

Detailed database state captured from production Supabase (`pvuiwwqsumoqjepukjhz`) on 2026-02-24. All numbers are exact row counts unless otherwise noted.

---

## Table Row Counts

### Content Pipeline

| Table | Rows | Description |
|-------|------|-------------|
| `source_documents` | 172 | Ingested FAA publications (PHAK, AFH, AIM, CFR, IFH, AWH, etc.) |
| `source_chunks` | 4,674 | Text chunks extracted from source documents |
| `source_images` | 1,596 | Charts, figures, tables extracted from source documents |
| `chunk_image_links` | 7,460 | Many-to-many links between chunks and their associated images |
| `embedding_cache` | 84 | Cached embedding vectors for query deduplication |

### Knowledge Graph

| Table | Rows | Description |
|-------|------|-------------|
| `concepts` | 22,075 | Knowledge graph nodes (all have embeddings) |
| `concept_relations` | 45,728 | Knowledge graph edges (6 relation types) |
| `concept_chunk_evidence` | 30,689 | Links grounding concepts to source chunks |

### ACS Structure

| Table | Rows | Description |
|-------|------|-------------|
| `acs_tasks` | 143 | ACS task definitions (private=61, commercial=60, instrument=22) |
| `acs_elements` | 2,174 | Knowledge/Risk/Skill elements within tasks |

### Exam Activity

| Table | Rows | Description |
|-------|------|-------------|
| `exam_sessions` | 70 | User exam sessions |
| `session_transcripts` | 720 | Individual Q&A exchanges |
| `element_attempts` | 306 | Per-element grading results |
| `transcript_citations` | 1,555 | Source references in examiner responses |
| `latency_logs` | 83 | Per-exchange timing telemetry |
| `usage_logs` | 1,355 | API consumption tracking |

### System

| Table | Rows | Description |
|-------|------|-------------|
| `prompt_versions` | 24 | Versioned system prompts (10 examiner, 10 assessment, 4 persona) |
| `user_profiles` | 11 | Registered users |

---

## Session Status Distribution

| Status | Count | Percentage |
|--------|-------|------------|
| Active | 21 | 30.0% |
| Abandoned | 27 | 38.6% |
| Completed | 14 | 20.0% |
| Paused | 8 | 11.4% |
| **Total** | **70** | **100%** |

> [!risk] High abandonment rate
> 38.6% of sessions are abandoned. Combined with 30% still "active" (which may include stale sessions that were never properly closed), the effective completion rate may be as low as 20%. Possible causes:
> - Sessions left open in browser tabs (active but stale)
> - Exam length feels too long
> - Users experimenting with the product without intent to complete
> - Technical issues (latency, voice recognition failures) causing drop-off
>
> **Recommended action**: Implement session timeout to auto-transition stale "active" sessions to "abandoned" after a configurable period. Investigate whether abandoned sessions cluster at specific exchange counts (early dropout vs mid-exam).

---

## Coverage Metrics Analysis

### Embedding Coverage

| Metric | Value | Assessment |
|--------|-------|------------|
| Total chunks | 4,674 | |
| Chunks with embeddings | 4,624 | 98.9% coverage |
| Chunks missing embeddings | **50** | 1.1% gap |
| Concepts with embeddings | 22,075 / 22,075 | 100% coverage |

> [!note] 50 chunks without embeddings
> 50 of 4,674 chunks (1.1%) lack embedding vectors. These chunks are invisible to vector search and will never be retrieved by the RAG pipeline. If they contain critical content (e.g., emergency procedures, regulatory minimums), this is a safety gap. Identify which source documents these chunks belong to and re-run embedding generation.

### Page Tracking

| Metric | Value |
|--------|-------|
| Chunks with `page_start` | **0** |
| Chunks without `page_start` | 4,674 (100%) |

> [!risk] Zero page tracking
> Not a single chunk has `page_start` populated. This means:
> - Citations cannot reference specific pages in source documents
> - Students cannot be directed to "see PHAK page 4-12" for further study
> - The `page_start` column exists in the schema but was never populated during ingestion
>
> **Impact**: Degrades the study-aid value of transcript citations. The 1,555 transcript citations link to chunk text but not to a page reference the student can look up in their physical copy of the book.

### Embedding Cache Effectiveness

| Metric | Value |
|--------|-------|
| Cache entries | 84 |
| Cache hits (reuse count > 0) | **0** |
| Cache hit rate | **0%** |

> [!risk] Embedding cache never hits
> 84 entries exist in `embedding_cache` but zero have been reused. The cache check runs on every exchange (39-87ms per check), adding latency without benefit. Possible causes:
> - Cache key is too specific (exact query match instead of semantic similarity)
> - Students rarely ask identical questions
> - Cache TTL is too short and entries expire before reuse
>
> **Recommended action**: Either fix the cache key strategy to use approximate matching, or disable the cache check to save 39-87ms per exchange. At current hit rate, the cache is pure overhead.

---

## Concept Graph State

The knowledge graph is the largest data structure in the system:

| Component | Count | Notes |
|-----------|-------|-------|
| Concepts (nodes) | 22,075 | All have embeddings |
| Relations (edges) | 45,728 | 6 relation types |
| Evidence links | 30,689 | Grounding concepts to source chunks |

### Concepts by Category (Partial — Supabase Default Limit)

| Category | Count | Notes |
|----------|-------|-------|
| `acs_area` | 31 | ACS areas of operation |
| `acs_element` | 969 | ACS knowledge/risk/skill elements |
| Other categories | ~21,075 | topic, regulatory_claim, definition, procedure, artifact — exact breakdown unavailable due to Supabase 1000-row default limit on the snapshot query |

> [!note] Category breakdown incomplete
> The snapshot query returned only the first 1,000 rows per category grouping due to Supabase's default pagination limit. The full breakdown of 22,075 concepts across categories (topic, regulatory_claim, definition, procedure, artifact, etc.) requires a dedicated aggregation query.

### Relations by Type (Partial)

| Type | Count (from snapshot) | Notes |
|------|----------------------|-------|
| `is_component_of` | 1,000+ | First 1,000 rows captured; actual total across all types is 45,728 |

> [!todo] Full relation type breakdown
> Only the first 1,000 `is_component_of` relations were captured in the snapshot. A `GROUP BY type` aggregation query is needed to get the true distribution across all 6 relation types (likely: `is_component_of`, `related_to`, `requires`, `prerequisite_for`, `contradicts`, `exemplifies` or similar).

---

## System Configuration State

### Feature Flags

| Key | Value | Environment |
|-----|-------|-------------|
| `graph.enhanced_retrieval` | `true` | Production |
| `graph.shadow_mode` | `true` | Production |
| `rag.metadata_filter` | *(absent)* | Production — defaults to disabled |
| `tts_sentence_stream` | *(absent)* | Production — defaults to disabled |

### Kill Switches

All kill switches are **disabled**. `maintenance_mode` is **disabled**.

### User Hard Caps

| Cap | Value | Daily Reset |
|-----|-------|-------------|
| `daily_llm_tokens` | 100,000 | Yes |
| `daily_tts_chars` | 50,000 | Yes |
| `daily_stt_seconds` | 3,600 | Yes |

---

## RPC Function Presence

### Detection Method and Its Limitations

RPC presence was checked by calling each function with empty parameters and observing whether the error indicated "function not found" vs "invalid parameters." This technique returned `false` for all RPCs tested.

> [!note] RPC detection was unreliable
> The empty-params detection technique proved unreliable. **However**, latency logs conclusively prove the following RPCs are functional in production:
>
> - **`chunk_hybrid_search`** — latency spans show `rag.hybridSearch` timing (148-3,839ms)
> - **`get_images_for_chunks`** — latency spans show `rag.imageSearch` timing (40-91ms)
> - **`get_uncovered_acs_tasks`** — used by the `next-task` exam action
>
> The RPCs exist and work. The detection technique simply cannot confirm presence when functions require specific parameter signatures.

---

## Latency Statistics

Derived from the 20 most recent production exchange latency logs.

### Per-Span Latency

| Span | p50 (median) | p95 | Min | Max |
|------|-------------|-----|-----|-----|
| `prechecks` | ~155ms | ~208ms | 126ms | 208ms |
| `rag.total` | ~700ms | ~4,900ms | 475ms | 4,929ms |
| `rag.embedding` | ~400ms | ~1,000ms | 210ms | 1,022ms |
| `rag.embedding.openai` | ~350ms | ~970ms | 155ms | 972ms |
| `rag.embedding.cache_check` | ~55ms | ~87ms | 39ms | 87ms |
| `rag.hybridSearch` | ~225ms | ~3,800ms | 148ms | 3,839ms |
| `rag.imageSearch` | ~55ms | ~90ms | 40ms | 91ms |
| `llm.examiner.ttft` | ~1,150ms | ~3,400ms | 780ms | 3,432ms |
| `llm.assessment.total` | ~5,800ms | ~9,900ms | 2,843ms | 9,940ms |

### Latency Budget Breakdown (Median Exchange)

```
Student speaks answer
    |
    v
prechecks ............... ~155ms
rag.total ............... ~700ms
  |- rag.embedding ...... ~400ms
  |    |- openai ........ ~350ms
  |    |- cache_check ... ~55ms
  |- rag.hybridSearch ... ~225ms
  |- rag.imageSearch .... ~55ms
llm.assessment.total .... ~5,800ms
llm.examiner.ttft ....... ~1,150ms
    |
    v
TTS begins streaming
```

**Total median latency from answer to first TTS audio**: approximately **7,800ms** (prechecks + RAG + assessment + examiner TTFT). The per-paragraph TTS streaming means the student hears the first paragraph before the full response is generated.

> [!risk] p95 worst case
> At p95, the total latency stretches to approximately **18,400ms** (208 + 4,900 + 9,900 + 3,400). Nearly 20 seconds from answer to first audio at the 95th percentile. This is a degraded user experience that may contribute to session abandonment.

> [!todo] Latency optimization targets
> 1. **Assessment latency** (p50 5.8s) is the dominant span. Consider: streaming assessment, parallel assessment + examiner generation, or simplified assessment for easy-mode sessions.
> 2. **Hybrid search outliers** (p95 3.8s vs p50 225ms) suggest occasional database performance issues. Investigate whether specific query patterns trigger slow plans.
> 3. **Embedding cache** adds 55ms per exchange with 0% hit rate. Either fix or remove.

---

## Prompt Version Analysis

| Type | Count | Rating-Specific |
|------|-------|-----------------|
| `examiner_system` | 10 | None (all `rating=NULL`) |
| `assessment_system` | 10 | None (all `rating=NULL`) |
| `persona` | 4 | None (all `rating=NULL`) |
| **Total** | **24** | **0** |

The 10 examiner and 10 assessment variants cover combinations of `studyMode` and `difficulty` parameters. All 24 versions have `rating=NULL`, meaning no rating-specific prompt tuning exists.

> [!note] Prompt variant matrix
> With 4 difficulty levels (easy/medium/hard/mixed) and at least 2 study modes, the expected variant count is 8+ per prompt type. The 10 variants each for examiner and assessment suggest slightly more granularity (possibly including default/fallback variants). The 4 persona prompts are independent of difficulty and study mode.

---

## Key Anomalies

### 1. page_start = 0 Everywhere

**Severity**: Medium
**Impact**: Citations lack page references; students cannot look up source material by page number
**Root cause**: Ingestion pipeline did not extract page numbers from PDFs
**Fix**: Re-run ingestion with page extraction enabled, or backfill via PDF metadata analysis

### 2. Embedding Cache Hit Rate = 0%

**Severity**: Low-Medium
**Impact**: 39-87ms wasted per exchange on a cache that never helps
**Root cause**: Likely exact-match cache keys on queries that are never identical
**Fix**: Switch to approximate matching, implement semantic cache, or disable cache check

### 3. Session Abandonment at 38.6%

**Severity**: Medium-High
**Impact**: Majority of sessions don't complete; unclear whether this represents product issues or expected behavior
**Root cause**: Unknown — could be UX, latency, session length, or user experimentation
**Fix**: Add session timeout logic, analyze abandonment timing patterns, add exit surveys

### 4. 50 Chunks Without Embeddings

**Severity**: Low
**Impact**: 1.1% of content invisible to vector search
**Root cause**: Likely failed embedding API calls during ingestion
**Fix**: Identify affected chunks and re-run embedding generation

### 5. 21 "Active" Sessions (Possibly Stale)

**Severity**: Low-Medium
**Impact**: Inflates active user metrics; may indicate missing session cleanup
**Root cause**: No session timeout mechanism
**Fix**: Implement auto-abandonment after configurable inactivity period

---

## Production vs Staging Drift

| Dimension | Production | Staging | Drift Severity |
|-----------|-----------|---------|----------------|
| **Supabase ref** | `pvuiwwqsumoqjepukjhz` | `curpdzczzawpnniaujgq` | -- |
| **graph.enhanced_retrieval** | ENABLED | DISABLED | **High** |
| **graph.shadow_mode** | ENABLED | DISABLED | **High** |
| **tts_sentence_stream** | NOT SET | ENABLED | Medium |
| **concepts** | 22,075 | 2,348 | **High** (10.6% parity) |
| **concept_relations** | 45,728 | 2,317 | **High** (5.1% parity) |
| **concept_chunk_evidence** | 30,689 | 0 | **Critical** (0% parity) |
| **source_images** | 1,596 | 0 | **Critical** (0% parity) |
| **chunk_image_links** | 7,460 | 0 | **Critical** (0% parity) |
| **embedding_cache** | 84 | 0 | Low |
| **latency_logs** | 83 | 0 | Low (expected) |
| **source_documents** | 172 | *(not captured)* | Unknown |
| **source_chunks** | 4,674 | *(not captured)* | Unknown |

> [!risk] Staging cannot test production code paths
> With zero source images, zero evidence links, and graph retrieval disabled, the staging environment exercises a fundamentally different code path than production. The following production behaviors CANNOT be tested in staging:
>
> 1. Image retrieval and display (`get_images_for_chunks` has no data)
> 2. Graph-enhanced retrieval (feature flag disabled)
> 3. Concept-to-source grounding (zero evidence links)
> 4. Embedding cache behavior (no cache entries)
>
> **Recommendation**: Create a staging data sync script that copies a representative subset of production content data (source_documents, source_chunks, source_images, concepts, relations, evidence) to staging. User data and sessions should NOT be synced.

---

## Data Relationship Integrity

### Expected Ratios

| Ratio | Value | Assessment |
|-------|-------|------------|
| Chunks per document | 4,674 / 172 = **27.2** | Reasonable for FAA documents |
| Images per document | 1,596 / 172 = **9.3** | Reasonable for chart-heavy publications |
| Image links per image | 7,460 / 1,596 = **4.7** | Each image referenced by ~5 chunks on average |
| Relations per concept | 45,728 / 22,075 = **2.1** | Sparse graph — typical for hierarchical ACS structure |
| Evidence per concept | 30,689 / 22,075 = **1.4** | Most concepts grounded in 1-2 source chunks |
| Transcripts per session | 720 / 70 = **10.3** | ~10 exchanges per session |
| Citations per transcript | 1,555 / 720 = **2.2** | ~2 source references per examiner response |
| Element attempts per session | 306 / 70 = **4.4** | ~4-5 elements graded per session |
| Prompts: examiner vs assessment | 10 / 10 = **1.0** | Symmetric — expected |

---

*Snapshot taken: 2026-02-24 from Supabase project pvuiwwqsumoqjepukjhz at commit 6b82b95. See [[01 - Requirements and Non-Negotiables]] for product gap analysis and [[02 - Deployed Reality Snapshot]] for runtime behavior mapping.*
