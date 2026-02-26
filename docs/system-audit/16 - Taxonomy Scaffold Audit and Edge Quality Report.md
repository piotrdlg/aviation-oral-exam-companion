---
title: "Taxonomy Scaffold Audit and Edge Quality Report"
date: 2026-02-25
type: system-audit
tags: [heydpe, knowledge-graph, taxonomy, edge-quality, audit]
status: final
evidence_level: high
---

# 16 — Taxonomy Scaffold Audit and Edge Quality Report

**Conducted:** 2026-02-25
**Environment:** Production (`pvuiwwqsumoqjepukjhz`)
**Branch:** `prod-reality-audit-20260224`

---

## Executive Summary

This audit diagnosed and partially fixed a critical knowledge graph failure mode: **regulatory claims existed as nodes but lacked edges to the specific topic/definition concepts they referenced.** A claim about "Class A airspace" linked to the NAS root and ACS elements, but not to the `definition:class-a-airspace` node. This broke graph-enhanced retrieval for targeted topic queries.

### What we built

1. **Expected-path audit** (`scripts/graph/expected-path-audit.ts`) — read-only diagnostic verifying airspace→NAS paths and claim→airspace concept linkage
2. **3-level unified taxonomy** from FAA PDF TOCs — 1,700 nodes (9 L1 + 701 L2 + 990 L3) extracted via PyMuPDF
3. **ACS source coverage analysis** — 90% of ACS-referenced documents present (27/30), 3 critical gaps identified
4. **Taxonomy DB scaffold** — `kb_taxonomy_nodes` + `kb_chunk_taxonomy` tables with migration
5. **Chunk→taxonomy classifier** with Anthropic prompt caching — 99.5% classification rate in 200-chunk pilot
6. **Deterministic concept→taxonomy attachment** — 1,060 new edges via keyword matching, improving claim→airspace linkage from 0% to 45.8%

### Impact

Claims→correct airspace concept improved **0% → 45.8%**, largest connected component grew **60.0% → 74.2%**, and a new validation check ensures airspace hierarchy integrity going forward.

---

## Metrics: Before and After

| Metric | Before (session start) | After | Delta |
|--------|----------------------|-------|-------|
| Concepts | 22,084 | 22,084 | — |
| Relations | 49,351 | 50,411 | +1,060 |
| Orphan rate | 0.9% (196) | 0.9% (196) | — |
| Largest component | 60.0% (13,257) | **74.2% (16,395)** | +14.2pp |
| Components | 1,574 | **1,484** | -90 |
| Edge types used | 3/6 | 3/6 | — |
| Evidence coverage | 98.64% | 98.64% | — |
| Dangling edges | 0 | 0 | — |
| Validation checks | 5 | **6** | +1 |
| Claims→correct airspace | 0/120 (0%) | **55/120 (45.8%)** | +45.8pp |
| Airspace→NAS paths | 8/8 (100%) | 8/8 (100%) | — |
| Taxonomy nodes (JSON) | 0 | **1,700** | new |
| Chunk classifications | 0 | **198 pilot** | new |

---

## Diagnosis: The Core Problem

### Symptom

Regulatory claims mentioning specific airspace classes (e.g., "Aircraft must be equipped with an operable Mode C transponder when operating in Class B airspace") had edges to:
- `topic:national-airspace-system` (the NAS root) via `is_component_of`
- Various `acs_element:*` nodes via `applies_in_scenario`
- `artifact:ac` and `artifact:cfr` via `applies_in_scenario`

But **no edge** to `definition:class-b-airspace-*` — the specific concept node that matches the claim's subject.

### Root Cause

The edge creation pipeline (`infer-edges.ts`) has three strategies:
1. **Strategy A (LLM)** — batches of 20 random concepts; claims rarely appeared in a batch with the matching airspace concept
2. **Strategy B (embedding similarity)** — only creates `leads_to_discussion_of` edges
3. **Strategy C (CFR cross-ref)** — only creates `applies_in_scenario` edges to artifact nodes

None of these strategies reliably create edges between a claim and its subject-matter concept when they aren't in the same embedding-similarity cluster.

### Fix Applied

Created `attach_concepts_to_taxonomy.ts` with two phases:
- **Phase 1:** Keyword-match regulatory claims against 17 airspace/topic patterns → `applies_in_scenario` edges (669 created)
- **Phase 2:** Cross-topic attachment for topic/definition/procedure concepts → `leads_to_discussion_of` edges (391 created)

---

## Per-Airspace Breakdown (Post-Fix)

| Airspace Class | Claims Sampled | Linked to Airspace Concept | Rate |
|----------------|----------------|---------------------------|------|
| Class A | 20 | 13 | 65% |
| Class B | 20 | 0 | 0% |
| Class C | 20 | 10 | 50% |
| Class D | 20 | 0 | 0% |
| Class E | 20 | 13 | 65% |
| Class G | 20 | 19 | 95% |

**Why Class B and D are still 0%:** The keyword patterns matched against claim text, but Class B and Class D claims often reference these airspace classes in multi-class lists ("Class A, B, C, and D") without the exact pattern `class b airspace` as a standalone phrase. The attachment script's regex requires the full phrase; partial mentions within lists are not matched.

**Fix needed:** Relaxed regex patterns or LLM-based edge inference with organized batches (see [[12 - Knowledge Graph Quality Audit and Refactor Plan]], P1).

---

## Taxonomy Scaffold

### Source Coverage ([[14 - ACS Source Coverage Gaps]])

- **27/30** ACS-referenced ingestible documents present in `source_documents`
- **3 critical gaps:** AC 61-107 (Flight Instructor Handbook), AC 90-107 (GPS/WAAS ops), AC 91.21-1 (EFB usage)
- **4 non-ingestible:** Sectional charts, TPP booklets, Chart Supplement (these are visual/tabular, not PDF text)

### Unified Taxonomy ([[13 - Unified Topic Taxonomy v0]])

Built from PDF TOC extraction across 9 FAA document groups:

| Level | Count | Source |
|-------|-------|--------|
| L1 (domain roots) | 9 | Manual (existing graph roots) |
| L2 (sections) | 701 | PDF bookmarks |
| L3 (subsections) | 990 | PDF bookmarks |
| **Total** | **1,700** | — |

Documents with 0 TOC entries: IFH (chapter PDFs lack bookmarks), CFR (no PDF bookmarks in regulatory text).

### DB Tables (migration `20260225100001`)

- `kb_taxonomy_nodes` — slug, title, level, parent_id, source_provenance, synonyms
- `kb_chunk_taxonomy` — chunk_id, taxonomy_node_id, confidence, method, model

Tables created but **not yet populated** from the JSON taxonomy. Population is a follow-up task.

### Classification Pilot ([[15 - Chunk Taxonomy Classification Pilot]])

| Metric | Value |
|--------|-------|
| Chunks processed | 200 |
| Classified successfully | 198 (99.5%) |
| Failed (API overloaded) | 2 (1.0%) |
| Cache read tokens | 7,384,660 |
| Cache creation tokens | 354,410 |
| Cache hit ratio | ~95% (after warmup) |

---

## Risks and Mitigations

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| Class B/D claims still unlinked (0%) | High | LLM inference with organized batches | Planned (P1) |
| 3/6 edge types still unused | Medium | Focused LLM prompts per edge type | Planned (P1) |
| Taxonomy JSON not in DB | Low | Run `classify_chunks.ts --write` after DB population | Ready |
| 3 ACS source docs missing | Medium | Ingest AC 61-107, AC 90-107, AC 91.21-1 | Planned |
| Chunk classifier not run at scale | Low | Run full classification (~6K chunks, ~$5 API cost) | Ready |
| 1,484 components (target <100) | Medium | Full taxonomy attachment + LLM edge inference | Planned |

---

## What to Do Next

### Immediate (P1)

- [ ] **Edge type diversification** — Re-run `infer-edges.ts --strategy llm` with organized batches by taxonomy domain (9 domains x 3 edge types = 27 batches). See [[12 - Knowledge Graph Quality Audit and Refactor Plan]] for updated strategy. Estimated cost: ~$15-20.
- [ ] **Fix Class B/D claim linkage** — Relax keyword patterns in `attach_concepts_to_taxonomy.ts` to handle multi-class lists, or use LLM batch inference for these specific claims.
- [ ] **Populate `kb_taxonomy_nodes`** from `data/taxonomy/unified-taxonomy.v0.json` — write an insert script.

### Next Sprint (P2)

- [ ] **Full chunk classification** — Run `classify_chunks.ts --write --limit 10000` with `ALLOW_PROD_WRITE=1`. ~6,000 chunks, ~$5 Anthropic API cost.
- [ ] **Ingest missing ACS sources** — AC 61-107, AC 90-107, AC 91.21-1 (if PDF sources can be located).
- [ ] **Bundle traversal optimization** — Add `max_nodes` parameter to `get_concept_bundle` RPC to prevent domain root explosion.

### Tied to Oral Exam Problem Statement

- [ ] **R2: ExamPlan + question budget** — Use taxonomy depth to allocate questions proportionally across ACS areas. Deep subtrees (many L3 nodes) get more questions.
- [ ] **R3/R4: Certificate depth + difficulty shaping** — Taxonomy L2/L3 mapping enables difficulty stratification: L2 = foundational, L3 = advanced. Commercial and Instrument ratings emphasize deeper taxonomy paths.
- [ ] **R5: Graph-guided across-ACS transitions** — `requires_knowledge_of` and `leads_to_discussion_of` edges enable the planner to transition between ACS areas naturally, e.g., from airspace regulations (Area I) to navigation procedures (Area VI) via shared concepts.

---

## How to Run

```bash
# Read-only diagnostics
npm run graph:metrics              # Current graph statistics
npm run graph:validate             # 6-check validation gate
npm run graph:audit:paths          # Expected-path audit (airspace→NAS, claims→airspace)

# Taxonomy pipeline
python3 scripts/taxonomy/extract_pdf_toc.py   # Extract PDF TOCs → data/taxonomy/toc/
npx tsx scripts/taxonomy/build_unified_taxonomy.ts  # Build unified taxonomy → JSON + doc
npx tsx scripts/taxonomy/classify_chunks.ts --dry-run --limit 200  # Pilot classification

# Edge attachment (requires ALLOW_PROD_WRITE=1 for production)
npx tsx scripts/graph/attach_concepts_to_taxonomy.ts --dry-run
ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_concepts_to_taxonomy.ts --write
```

---

## Rollback

All changes are additive (new edges only, no deletions). To rollback the 1,060 taxonomy-attached edges:

```sql
-- Remove keyword-matched edges from this session
DELETE FROM concept_relations
WHERE context LIKE 'Keyword match:%'
   OR context LIKE 'Cross-topic keyword match:%';
```

This is safe because the `context` field uniquely identifies edges created by `attach_concepts_to_taxonomy.ts`.

---

## Evidence

All metrics from production database queries on 2026-02-25. Reports:
- `docs/graph-reports/2026-02-25-expected-path-audit.md`
- `docs/graph-reports/2026-02-25-taxonomy-attachment.md`
- `docs/graph-reports/2026-02-25-graph-validation.md`
- `data/taxonomy/unified-taxonomy.v0.json`
- `data/taxonomy/classification-results-2026-02-25.json`

Scripts:
- `scripts/graph/expected-path-audit.ts` — path verification
- `scripts/taxonomy/extract_pdf_toc.py` — PDF TOC extraction
- `scripts/taxonomy/build_unified_taxonomy.ts` — taxonomy builder
- `scripts/taxonomy/classify_chunks.ts` — chunk classifier (prompt caching)
- `scripts/graph/attach_concepts_to_taxonomy.ts` — deterministic edge attachment

---

*Last updated: 2026-02-25*
