---
date: 2026-02-24
type: system-audit
tags: [aviation-oral-exam, rag, grounding, production-audit]
status: complete
audit-area: RAG Pipeline & Grounding Guarantees
severity: high
---

# 04 — RAG Grounding Audit

## Purpose

This document audits the Retrieval-Augmented Generation (RAG) pipeline that supplies FAA source material to the Claude examiner and assessor. It traces every stage from query construction through embedding, retrieval, filtering, and prompt injection, and evaluates whether the system provides adequate grounding guarantees — i.e., whether the examiner's questions and the assessor's feedback are reliably anchored in authoritative FAA publications.

---

## 1. Query Construction

**File**: `src/lib/exam-engine.ts:197-199`

```typescript
const recentText = history.slice(-2).map(m => m.text).join(' ');
const answerText = studentAnswer ? ` ${studentAnswer}` : '';
const query = `${task.task} ${recentText}${answerText}`.slice(0, 500);
```

The RAG query is built by concatenating three sources:

1. **`task.task`** — The ACS task description (e.g., "Aeromedical Factors")
2. **`recentText`** — The text of the last 2 conversation messages (examiner + student)
3. **`answerText`** — The student's current answer, if present

The result is truncated to 500 characters.

> [!risk] Query Dilution
> The last two conversation turns often contain conversational filler, examiner preamble, or student hedging. When concatenated with the task description, the embedding vector drifts toward the average of all three semantic signals rather than targeting the specific knowledge element being tested. A student answer about "Coriolis illusion" appended to an examiner question about "spatial disorientation" and a task title of "Aeromedical Factors" produces a query that may retrieve broadly relevant PHAK content rather than the specific paragraph on Coriolis illusion.

> [!risk] No Element Code in Query
> The current element code (e.g., `PA.II.E.K2`) is available in `plannerState` but is NOT used in query construction. Element codes map directly to specific ACS knowledge requirements and could dramatically improve retrieval precision if used as a filter or query prefix.

> [!note] 500-Character Truncation
> For most exchanges the concatenation stays under 500 characters. However, verbose student answers can push the total well past this limit, and the `.slice(0, 500)` operation may cut the student's answer mid-sentence or remove it entirely, leaving only the task title and examiner's prior question as the search signal.

---

## 2. Embedding and Caching

**File**: `src/lib/rag-retrieval.ts:45-93`

**Model**: OpenAI `text-embedding-3-small`

**Cache mechanism**:
- Table: `embedding_cache`
- Key: SHA-256 hash of the normalized (lowercased, whitespace-collapsed) query string
- On cache hit: returns stored 1536-dimensional vector directly
- On cache miss: calls OpenAI Embeddings API, writes result to `embedding_cache` via non-blocking Supabase insert

> [!risk] Cache Writes Silently Failing
> Production observation: **0 cache hits** recorded. The non-blocking write (`supabase.from('embedding_cache').insert(...)` without `await` or error handling) may be silently failing due to RLS policies, column type mismatches, or network timeouts. Every query pays the full OpenAI embedding latency (~80-150ms) on every request. This is a latency tax, not a correctness issue, but it indicates an untested write path.

> [!note] Embedding Model Choice
> `text-embedding-3-small` is the lowest-cost OpenAI embedding model. It performs well on general text but has not been benchmarked against aviation-specific retrieval tasks. The 1536-dimensional output is stored in Supabase's pgvector column. No dimensionality reduction or quantization is applied.

---

## 3. Hybrid Search

**File**: `src/lib/rag-retrieval.ts:99-141`

**RPC function**: `chunk_hybrid_search`

| Parameter | Value | Notes |
|-----------|-------|-------|
| `match_count` | 5 (from `fetchRagContext`) | Default in RPC is 6 |
| `similarity_threshold` | 0.3 | Cosine similarity floor |
| `filterDocType` | Optional | From `inferRagFilters` if enabled |
| `filterAbbreviation` | Optional | From `inferRagFilters` if enabled |

The hybrid search combines:
1. **Vector similarity** — pgvector cosine distance against the query embedding
2. **Full-text search (FTS)** — PostgreSQL `tsvector` matching against the query text
3. **Combined scoring** — Weighted blend of vector and FTS scores (weights defined in the RPC)

> [!note] Similarity Threshold
> The 0.3 threshold is relatively permissive. For `text-embedding-3-small`, cosine similarities in the 0.3-0.4 range often indicate only loose topical overlap. This means the system will return chunks that are vaguely related to the query even when no highly relevant content exists, potentially injecting misleading context.

> [!risk] No Result Quality Gate
> There is no post-retrieval check on whether the returned chunks are actually relevant to the specific ACS element being tested. If all 5 results score between 0.3 and 0.45, the system treats them identically to results scoring 0.85+. The examiner receives them all as "FAA SOURCE MATERIAL" without any signal about retrieval confidence.

---

## 4. Metadata Filtering

**Files**: `src/lib/rag-filters.ts`, `src/lib/rag-search-with-fallback.ts`

**Feature flag**: `rag.metadata_filter`

> [!risk] DISABLED in Production
> The `rag.metadata_filter` feature flag is **not set** in the production feature flags table. This means `inferRagFilters` is never called, and all searches are unfiltered. The entire metadata filtering subsystem — regex-based document type detection, two-pass fallback logic, and minimum result thresholds — is dead code in production.

**How it would work if enabled**:

1. `inferRagFilters` scans conversation text for document type patterns:
   - PHAK references (e.g., "Pilot's Handbook", "PHAK chapter")
   - AFH references (e.g., "Airplane Flying Handbook")
   - AIM references (e.g., "AIM section", "Aeronautical Information Manual")
   - CFR references (e.g., "14 CFR", "FAR 91")

2. Two-pass fallback (`rag-search-with-fallback.ts`):
   - **Pass 1**: Search with inferred `filterDocType` and/or `filterAbbreviation`
   - **Gate check**: If results < `MIN_RESULTS` (2) or top score < `MIN_TOP_SCORE` (0.4), fall back
   - **Pass 2**: Repeat search without filters

> [!note] Design Intent
> The filtering system is well-designed for its purpose: when a student mentions "14 CFR 91.205", the system should prefer retrieving the actual regulation text over a PHAK paraphrase. The two-pass fallback prevents empty results. However, since it is disabled, all searches return an unweighted mix of document types, and regulatory text competes with handbook paraphrases on embedding similarity alone.

---

## 5. Image Retrieval

**File**: `src/lib/rag-retrieval.ts:186-211`

**RPC function**: `get_images_for_chunks`

**Production data**: 1,596 images, 7,460 chunk-to-image links

After text chunks are retrieved, the system fetches associated images:

1. Collected chunk IDs from the hybrid search results
2. Call `get_images_for_chunks` RPC with those IDs
3. Sort by `relevance_score` descending
4. Take top 3 images
5. Send image URLs to client for display
6. Pass image URLs to `assessAnswer` for visual question assessment

> [!note] Image Pipeline Is Functional
> Unlike metadata filtering, image retrieval is active in production. The 7,460 links provide good coverage across PHAK and AFH figures. The top-3 limit keeps payload size manageable.

> [!risk] No Image Relevance Verification
> Images are linked to chunks at ingestion time, not at query time. If a chunk is marginally relevant (similarity 0.31), its linked images may be entirely irrelevant to the current question. The student sees authoritative-looking FAA diagrams that may not correspond to the topic under discussion.

---

## 6. Graph Retrieval Integration

**File**: `src/lib/graph-retrieval.ts`, `src/lib/exam-engine.ts:207-263`

**Feature flags**:
- `graph.enhanced_retrieval` — **ENABLED** in production
- `graph.shadow_mode` — **ENABLED** in production

**RPC function**: `get_concept_bundle`

When both flags are enabled, `enhanced_retrieval` takes precedence over `shadow_mode`. The graph retrieval path:

1. Extract `elementCode` from the current `plannerState`
2. Call `get_concept_bundle` RPC with that element code
3. Format the returned bundle into structured sections:
   - REGULATORY REQUIREMENTS
   - KEY CONCEPTS
   - DEFINITIONS
   - COMMON STUDENT ERRORS
   - SUGGESTED FOLLOW-UP DIRECTIONS
   - REFERENCES
4. Prepend the formatted graph context before the RAG chunk context in the system prompt

> [!note] Graph Context Is Active
> Unlike metadata filtering, graph retrieval is live and injecting structured knowledge into the examiner prompt. This provides element-specific context that the RAG query construction misses (since element codes are not used in RAG queries).

> [!risk] Dual Context Without Deduplication
> The examiner receives both graph context (element-specific, structured) and RAG context (query-driven, unstructured) without any deduplication. If the graph bundle includes a concept definition and the RAG results include a chunk from the same PHAK page, the examiner sees redundant information consuming prompt tokens. More critically, if the two sources present slightly different formulations of the same fact, the model may synthesize rather than choose, introducing subtle inaccuracies.

> [!risk] Graph Completeness Unknown
> The knowledge graph was populated via migration `20260220100002` with ACS skeleton data. The completeness of concept bundles per element code is not audited. Elements with sparse or missing graph data fall back to RAG-only context silently, with no logging to track which elements lack graph support.

---

## 7. Prompt Injection and Grounding Guarantees

### How Retrieved Context Reaches Claude

RAG chunks are formatted by `formatChunksForPrompt` and injected into the system prompt under the header:

```
FAA SOURCE MATERIAL (use to ask accurate, specific questions):
```

Graph context (when enabled) is prepended before the RAG section.

### Grounding Analysis

> [!risk] No Grounding Enforcement — Critical Gap
> The system provides **advisory** context to Claude but does **not enforce** that responses must be grounded in that context. Specifically:
>
> 1. **No citation mandate**: The system prompt says "use to ask accurate, specific questions" but does not instruct Claude to cite sources or refuse to answer when sources are insufficient.
>
> 2. **Assessment allows null sources**: The `assessAnswer` prompt defines `source_summary` as optional — "If no FAA source material was provided, set to null." This means the assessor can evaluate a student's answer without any FAA reference, relying entirely on Claude's parametric knowledge.
>
> 3. **No entailment verification**: There is no second-pass check that the examiner's questions or the assessor's feedback are entailed by the retrieved content. Claude may generate questions about topics not covered in the retrieved chunks.
>
> 4. **No authority weighting**: A PHAK paraphrase and a 14 CFR regulation carry equal weight in the prompt. The system does not instruct Claude to prefer regulatory text over handbook explanations, or to flag conflicts between sources.
>
> 5. **No retrieval confidence signal**: Claude receives the chunks without knowing their similarity scores. A chunk at 0.31 similarity looks identical to one at 0.92. The model cannot self-calibrate its confidence based on retrieval quality.

---

## 8. Known Failure Modes

| # | Failure Mode | Trigger | Impact | Severity |
|---|-------------|---------|--------|----------|
| 1 | **Query dilution** | Verbose student answer pushes task title out of 500-char window | Retrieves content unrelated to the ACS element | Medium |
| 2 | **Cache write failure** | Non-blocking insert silently fails | Every query pays full embedding latency (~100ms) | Low |
| 3 | **Low-relevance results treated as authoritative** | All results between 0.3-0.4 similarity | Examiner asks questions based on tangentially related content | High |
| 4 | **Metadata filtering disabled** | Feature flag not set | Cannot target specific FAA publications (CFR vs PHAK) | Medium |
| 5 | **Ungrounded examiner questions** | No citation enforcement in system prompt | Examiner may ask questions from parametric knowledge, not FAA sources | High |
| 6 | **Ungrounded assessment feedback** | `source_summary` is optional | Assessor may evaluate answers against Claude's beliefs, not FAA standards | High |
| 7 | **Graph-RAG deduplication gap** | Same content in graph bundle and RAG chunks | Wasted prompt tokens; potential for conflicting formulations | Low |
| 8 | **Irrelevant images surfaced** | Low-relevance chunk has linked images | Student sees FAA diagrams unrelated to current topic | Medium |

---

## 9. Next Correctness Levers

These are prioritized improvements that would materially strengthen grounding. None are implemented; this section describes what each would entail.

### 9.1 — Enforce Citation in System Prompt

Add explicit instructions to both the examiner and assessor system prompts:

- "You MUST base your questions on the FAA SOURCE MATERIAL provided. If the source material does not cover a topic, state that you are moving to a topic with available references."
- "In your assessment, cite the specific source chunk number (e.g., [1], [3]) that supports your evaluation. If no source supports the student's claim, explicitly state 'not supported by provided sources.'"

**Effort**: Prompt engineering only. No code changes. Highest ROI lever.

### 9.2 — Add Retrieval Confidence Signal

Pass similarity scores to Claude alongside chunks:

```
[1] PHAK — Aerodynamics (p.42) [relevance: 0.87]
content...

[2] AIM — Weather Services (p.7-1) [relevance: 0.34]
content...
```

Add instruction: "Prefer sources with relevance > 0.6. Treat sources below 0.5 as supplementary only."

**Effort**: Modify `formatChunksForPrompt` to include scores. Prompt changes.

### 9.3 — Use Element Code in Query Construction

Replace the current query construction with:

```typescript
const elementDesc = currentElement.description || '';
const query = `${elementDesc} ${task.task} ${recentText}`.slice(0, 500);
```

Or better, pass the element code as a metadata filter to the hybrid search, restricting results to chunks tagged with the relevant ACS element.

**Effort**: Modify `exam-engine.ts:197-199`. May require chunk-to-element tagging in the database if not already present.

### 9.4 — Enable Metadata Filtering

Set the `rag.metadata_filter` feature flag to `true` in production. The code is already written and tested (32 unit tests in `rag-filters.test.ts`). Monitor the two-pass fallback rate to ensure filtered searches return sufficient results.

**Effort**: Single database update. Monitor for 1-2 weeks.

### 9.5 — Add Post-Retrieval Quality Gate

Before injecting chunks into the prompt, check:

- If top score < 0.5, log a warning and add a preamble: "Note: retrieved sources have low relevance to this specific question."
- If fewer than 2 chunks above 0.5, consider triggering a second retrieval with a reformulated query (e.g., element description only, without conversation history).

**Effort**: New function in `rag-retrieval.ts`. Moderate complexity.

### 9.6 — Authority Weighting by Document Type

Add document type hierarchy to the prompt:

```
Authority hierarchy (prefer higher-ranked sources):
1. 14 CFR (regulations — legally binding)
2. AIM (procedures — FAA standard)
3. PHAK / AFH (handbooks — educational)
4. AC (advisory circulars — guidance)
```

**Effort**: Prompt engineering. Requires `doc_type` to be reliably set on chunks (already present in schema).

### 9.7 — Entailment Verification Pass

Add a lightweight third Claude call (or use a smaller model) that takes the examiner's generated question + the retrieved chunks and returns a boolean: "Is this question answerable from the provided sources?" If not, regenerate or flag.

**Effort**: High. Adds latency and cost. Consider as a quality gate for production, not a per-request check. Could be implemented as a sampling audit (check 10% of exchanges).

---

*Audit conducted 2026-02-24. Based on production state as of commit `80dbc7e`.*
