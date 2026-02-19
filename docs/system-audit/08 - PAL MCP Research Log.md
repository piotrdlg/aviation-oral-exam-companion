---
title: PAL MCP Research Log
created: 2026-02-19
tags: [heydpe, system-audit, research, graphrag, latency, evaluation]
status: final
evidence_level: high
---

# PAL MCP Research Log

External model consultations conducted via PAL MCP on 2026-02-19. Two models were used: **Gemini 3.0 Pro Preview** (Google) and **GPT-5.2** (OpenAI). Each was given detailed context about the HeyDPE architecture and asked targeted questions.

---

## Prompt 1: GraphRAG Design for Oral Exam Flow

### Gemini 3.0 Pro Preview Response

**Graph Schema:**
- Node types via `type` column on `concepts`: `ACS_TASK`, `ACS_ELEMENT`, `REGULATION`, `CONCEPT`, `SCENARIO`
- Edge types: `GOVERNS` (Regulation → Concept), `PREREQUISITE_FOR` (Concept → Concept), `TESTS` (Scenario → ACS_Element), `CROSS_REFERENCES` (Task → Task)

**Population Strategy — "Backbone Approach":**
1. Phase 1: ACS Skeleton (deterministic parse of ACS structure → tree of nodes)
2. Phase 2: Regulatory Layer (LLM extraction of CFR references + linking to ACS skeleton)
3. Phase 3: Chunk Linking (junction table `chunk_concepts` via Claude tagging of existing chunks)

**Traversal — "Anchor and Expand":**
- Anchor: locate `ACS_ELEMENT` node
- Expand depth 1: follow `GOVERNS` (regs) and `PREREQUISITE_FOR` (concepts)
- Inject expanded context into DPE prompt (not just "ask about X" but "governed by Y, prerequisite Z")

### GPT-5.2 Response

**Graph Schema — Multi-Layer:**
- Node types: `acs_element`, `topic`, `regulatory_claim`, `definition`, `procedure`, `artifact`, `figure`, `scenario_template`
- **Key insight — `regulatory_claim` nodes:** Atomic, citable rules with structured metadata (e.g., `{ "domain": "weather_mins", "airspace": "Class D", "vis_sm": 3 }`)
- Edge types (8): `SUPPORTED_BY`, `DEFINES`, `REQUIRES`, `CONTRASTS_WITH`, `APPLIES_UNDER`, `PART_OF`, `ASSESSED_BY`, `COMMON_MISCONCEPTION`
- Bridge table: `concept_chunk_evidence` (concept_id, chunk_id, evidence_type, quote, confidence)

**Population — Two-Pass Pipeline:**
- Pass A (automated): noun phrase extraction, CFR reference detection, claim detection for normative language ("must", "required"), topic hierarchy from PDF TOC
- Pass B (curation): verification queue UI for checkride-critical claims, prioritized by risk (weather mins > endorsements > performance)

**Traversal — Policy-Driven Graph Walk:**
- Prerequisite expansion, boundary/exception expansion, authority anchoring, misconception probes
- Scoring: `next_node_score = w1*not_covered + w2*prerequisite + w3*boundary_test + w4*weakness + w5*authority_need - w6*already_mastered`

### Synthesis

| Aspect | Consensus | Disagreement |
|--------|-----------|--------------|
| Node types | Both agree on ACS/topic/regulation separation | GPT-5.2 adds `regulatory_claim` as distinct from `topic` — stronger for accuracy |
| Edge types | Both include prerequisites + contrasts | Gemini prefers 4 types; GPT-5.2 prefers 8 (more granular) |
| Population | Both recommend ACS skeleton first, then LLM extraction | GPT-5.2 emphasizes structured claim extraction; Gemini emphasizes chunk linking |
| Traversal | Both agree on depth 2-3, purpose-driven hops | Gemini proposes anchor+expand; GPT-5.2 proposes scoring function |

**Recommendation:** Adopt GPT-5.2's `regulatory_claim` node type (strongest accuracy lever). Use Gemini's simpler 3-phase backbone population. Combine both traversal ideas: anchor+expand for context building, scoring for adaptive probing.

---

## Prompt 2: ACS-Aligned Adaptive Exam Flow

### Gemini 3.0 Pro Preview Response

**Replace queue with Navigation Stack:**
- State 1 — Happy Path (linear): pop stack → push next ACS element
- State 2 — Drill Down (graph-driven): on unsatisfactory → follow `PREREQUISITE_FOR` edges → push prerequisites
- State 3 — Bridge (transition): find shortest graph path between last concept of Area A and first of Area B for natural transitions

**ExamState structure:**
```typescript
type ExamState = {
  mode: 'ASSESSMENT' | 'DRILL_DOWN' | 'TEACHING';
  current_node_id: string;
  stack: string[];
  history: Array<{ node_id: string; score: number; }>;
}
```

### Synthesis with Current System

The existing `PlannerState` uses a cursor-based queue with `recent` anti-repetition. Gemini's stack-based approach would require refactoring `pickNextElement()` in `exam-logic.ts:275-316` but is architecturally compatible. The stack can be implemented as an extension of `PlannerState` without breaking the existing API contract.

---

## Prompt 3: Low-Latency RAG (p95 < 3s first token)

### GPT-5.2 Response

**Caching Strategies (serverless-safe):**
1. **Embedding cache** (highest ROI): `embedding_cache` table keyed by `hash(normalized_text)`, or Upstash Redis
2. **Search result cache**: `{query_hash, topK_doc_ids, scores}` with 5-30 min TTL
3. **Prompt template cache**: pre-compiled system prompt fragments
4. **RAG chunk snippet cache**: formatted chunk text by ID

**Streaming Patterns:**
- **Pattern 1 — "Immediate reaction → Grounded continuation":** Stream safe acknowledgment first (no citations), then inject RAG context and continue with grounded details. Natural for DPE persona: "Okay. Now let's dig into what the FAA says…"
- **Pattern 2 — Speculative draft:** Generate without RAG in hidden buffer, ground with citations after retrieval, then stream
- **Pattern 3 — Partial context streaming:** progressive FTS → vector → reranked delivery (complex, usually not worth it)

**Concurrency:**
- Start assessment immediately (no/minimal RAG)
- Embed + retrieve in parallel
- Start examiner streaming at 250-400ms timeout or when retrieval arrives
- Start TTS at first sentence boundary, not end of response

**pgvector Tuning:**
- HNSW index (better latency than IVFFLAT for most cases)
- Filter early (certificate type, ACS area) before vector search
- Separate tables for different corpora (acs_chunks, regs_chunks)
- Return only doc_id + score from RPC, fetch text separately

**Prefetching:**
- After examiner asks question: embed the question and prefetch supporting docs
- Topic graph prefetch: when entering "Weather services", prefetch METAR/TAF/91.155 etc.
- Session-scoped "retrieval bundle cache" keyed by `(session_id, topic_id)`

### Synthesis

Pattern 1 (immediate reaction → grounded continuation) is the most practical for HeyDPE. It aligns with the DPE persona ("let me think about that…") and is achievable with current SSE infrastructure. The embedding cache in Supabase is the highest-ROI single change.

---

## Prompt 4: Evaluation Strategy

### GPT-5.2 Response

**Offline Retrieval Evaluation:**
- Precision@k, Recall@k, MRR, NDCG@k
- Human annotation loop with CFI/DPE reviewers
- Error taxonomy: wrong ACS area, outdated regs, semantically similar but wrong, missing thresholds, acronym mismatches

**Offline Flow Evaluation:**
- Scripted scenarios graded on coverage, progression quality, consistency, factuality
- LLM-as-judge with citations + human review for aviation correctness

**Online Metrics:**
- System: TTFT p50/p95, retrieval latency, SSE throughput, TTS TTFA
- User: session rating, "felt realistic" Likert, dropout rate, return rate
- Exam: ACS coverage, corrections issued, improvement signals

**Gold Standard Test Set (3 layers):**
1. Query → Relevant sources (300-2000 queries with labeled chunks)
2. Scenario transcripts (50-200 full oral exam mini-scenarios)
3. Fact checks / regulatory assertions (atomic claims with true/false + citations)

**A/B Testing:**
- Randomize at session level (not request level)
- Log: retrieved doc IDs + scores, citations, user rating, latency
- Primary metric: user satisfaction + regulatory accuracy flags

### Synthesis

The 3-layer gold standard approach is actionable. Layer 3 (regulatory assertions) is the most unique to aviation and should be built first — it directly validates the highest-risk failure mode (hallucinated regulations).

---

## Prompt 5: Failure Modes and Mitigations

### Gemini 3.0 Pro Preview Response

| Failure Mode | Risk | Mitigation |
|---|---|---|
| Hallucinated regs | Critical | Citation enforcement: only answer if similarity > 0.75; verbatim regulation injection |
| Stale data | High | `valid_from`/`valid_until` columns; checksum-triggered re-ingestion |
| False satisfactory | High | Chain-of-thought grading: extract facts → compare to ACS → output diff → score |
| Voice/STT errors | Medium | Deepgram vocab biasing for aviation terms; phonetic fuzzy matching |
| Dangerous edge cases | Critical | Separate smaller model scanning for Hazardous Attitudes |
| Adversarial/jailbreak | Low | System prompt sandwich; refusal token mechanism |

### GPT-5.2 Response

| Failure Mode | Risk | Mitigation |
|---|---|---|
| Hallucinated regs | Critical | Claim-first answering with verified `regulatory_claim` nodes; authority weighting |
| Assessment accuracy | High | Rubric-bound scoring tied to ACS elements; confidence-aware scoring; second-pass entailment check |
| Source currency | High | Versioned artifacts with deprecation workflow; scheduled currency checks |
| Student safety | Critical | Safety policy layer; scenario reframing ("legal + safe"); red-flag keyword detection |
| Adversarial inputs | Medium | Tool/prompt isolation; rate limits + abuse monitoring |
| Voice errors | Medium | ASR confidence integration; number confirmation UX; dual input option |

### Synthesis

Both models agree on the critical risk ranking: **hallucinated regulations > false assessment scores > stale data > safety edge cases**. GPT-5.2's `regulatory_claim` node approach is the strongest structural mitigation for hallucinations. Both recommend ASR confidence-aware grading rather than hard-failing on voice transcription.

---

## Prompt 6: Migration Plan (Chunk RAG → GraphRAG)

### Gemini 3.0 Pro Preview Response

**4-Phase Plan:**
1. **"Gardener" Pipeline** (Week 1): Background job iterates chunks, Claude extracts concepts + relations, upserts to graph tables
2. **Shadow Mode** (Week 2): Dual retrieval — standard vector search + shadow graph traversal, log both to `retrieval_logs`
3. **Hybrid "Glued" Retrieval** (Week 3-4): Feature flag for 10% users, combine top-3 chunk + top-2 graph results, deduplicate
4. **Graph-First Navigation** (future): DPE uses graph to drive exam rather than just search

**Supabase Considerations:**
- Index `source_concept_id` and `target_concept_id` in `concept_relations`
- Cap recursion depth at 2-3
- Use stored procedures (RPC) to avoid N+1 queries

### Synthesis with GPT-5.2's Population Strategy

Combine Gemini's phased rollout with GPT-5.2's two-pass (automated + curated) population. The "Gardener" extraction should include GPT-5.2's `regulatory_claim` extraction pass. Shadow mode logging is essential before any live traffic.

---

## Cross-Model Consensus Summary

| Topic | Strong Consensus | Key Divergence |
|---|---|---|
| Graph population | ACS skeleton first, then LLM extraction | Granularity of node types (4 vs 8) |
| Retrieval accuracy | Structured claim nodes beat fuzzy chunks | Whether claims need separate table vs same `concepts` table |
| Exam flow | Stack/graph-driven > linear queue | Traversal algorithm (scoring vs anchor+expand) |
| Latency | Embedding cache is highest ROI | Redis vs Postgres for cache storage |
| Evaluation | 3-layer gold standard essential | Level of automation vs human curation |
| Safety | Citation gating for regulated answers | Whether separate safety model is needed |
| Migration | Shadow mode + feature flags | Timeline (4 weeks vs longer) |
