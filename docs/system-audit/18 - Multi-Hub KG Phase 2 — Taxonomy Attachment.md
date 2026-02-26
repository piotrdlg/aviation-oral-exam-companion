---
date: 2026-02-26
type: system-audit
tags: [heydpe, knowledge-graph, multi-hub, taxonomy, phase-2]
status: draft
evidence_level: high
---

# 18 — Multi-Hub KG Phase 2: Taxonomy Attachment

## Overview

Phase 2 bridges the structural scaffold from Phase 1 with the existing 22k-concept knowledge graph. Three workstreams run in sequence:

1. **Classify chunks** out of triage into real taxonomy nodes (LLM for knowledge hub, regex for regulations)
2. **Promote taxonomy nodes** into graph concepts with `is_component_of` tree edges
3. **Attach existing concepts** to taxonomy via evidence-chunk majority voting

### Success Metrics

| Metric | Description | Target | Baseline (Phase 1) |
|--------|-------------|--------|---------------------|
| **A** — Concept→Hub traceability | % of concepts with `is_component_of` path to a hub root | >= 95% | 13.09% |
| **B** — Chunk triage rate | % of knowledge-hub chunks still on triage node | <= 15% | 100% |
| **C** — Hub root reachability | % of graph reachable from hub roots (undirected BFS, 6 hops) | Report only | Knowledge 63.3% |

---

## What Phase 2 Does

### Workstream 1: Granular Chunk Classification

**Script:** `scripts/taxonomy/classify_chunks_knowledge.ts`
**npm:** `npm run taxonomy:classify:knowledge`

Reclassifies ~4,674 knowledge-hub chunks from `*:triage-unclassified` into real L1/L2 taxonomy nodes.

- **Knowledge hub:** Anthropic prompt caching (taxonomy + rubric in cached system block), per-chunk user message. Model: `claude-sonnet-4-20250514`, max_tokens: 256, content truncated to 800 chars.
- **Regulations hub:** Deterministic regex `/\b(?:14\s*CFR|part)\s*(\d+)/i` mapping to `regulations:14cfr-part-{N}` nodes.
- Writes to `kb_chunk_taxonomy` via upsert (`method: 'llm'` or `'regex'`).

### Workstream 2: Taxonomy → Graph Concept Promotion

**Script:** `scripts/graph/sync_taxonomy_to_concepts.ts`
**npm:** `npm run taxonomy:sync:concepts`

Promotes ~1,900 `kb_taxonomy_nodes` into the `concepts` table with `category='taxonomy_node'`. Creates:

- **Parent→child edges:** `is_component_of` from child concept → parent concept (context: `phase2_taxonomy_tree:v1:parent`)
- **L1→hub edges:** `is_component_of` from L1 concept → hub root (context: `phase2_taxonomy_tree:v1:l1-to-hub`)
- Skips triage/unclassified nodes and slugs that already exist as concepts.

### Workstream 3: Evidence-Based Concept→Taxonomy Attachment

**Script:** `scripts/graph/attach_concepts_to_taxonomy_from_evidence.ts`
**npm:** `npm run graph:attach:concepts-taxonomy`

Attaches ~22k existing concepts to taxonomy nodes via evidence-chunk majority voting:

1. For each concept, look up its evidence chunks via `concept_chunk_evidence`
2. For each chunk, look up its taxonomy assignment via `kb_chunk_taxonomy`
3. Count votes per taxonomy node. Winner = highest count, tie-break by deeper level, then higher cumulative confidence
4. Create `is_component_of` edge from concept → taxonomy concept node (context: `phase2_concept_taxonomy_attach:v1:evidence_vote`)

### Workstream 4: Metrics & Validation Updates

**Modified files:**
- `scripts/graph/graph-metrics.ts` — Added Metric A (hub traceability) and Metric B (chunk triage) sections
- `scripts/graph/graph-validate.ts` — Added check 7 (Concept→Hub Traceability: FAIL <80%, WARN <95%, PASS >=95%)
- `src/types/database.ts` — Added `'taxonomy_node'` to `ConceptCategory` union type

---

## What Phase 2 Does NOT Do

- Does not modify the exam engine or retrieval pipeline
- Does not create `requires_knowledge_of`, `leads_to_discussion_of`, or other non-structural edges
- Does not touch ACS elements/tasks (they're already traceable at 100%)
- Does not reclassify aircraft-hub chunks (only 0 assigned in Phase 1)
- Does not run embeddings on new taxonomy_node concepts

---

## Commands

```bash
# Dry-run sequence
npm run graph:metrics                                    # Baseline
npm run taxonomy:classify:knowledge -- --dry-run --limit 200
npm run taxonomy:sync:concepts -- --dry-run
npm run graph:attach:concepts-taxonomy -- --dry-run --limit 500

# Write sequence (production)
ALLOW_PROD_WRITE=1 npm run taxonomy:classify:knowledge -- --write
ALLOW_PROD_WRITE=1 npm run taxonomy:sync:concepts -- --write
ALLOW_PROD_WRITE=1 npm run graph:attach:concepts-taxonomy -- --write
npm run graph:validate
npm run graph:metrics
```

---

## Context Prefixes for Rollback

| Context | Source |
|---------|--------|
| `phase2_taxonomy_tree:v1:parent` | Workstream 2: parent→child taxonomy edges |
| `phase2_taxonomy_tree:v1:l1-to-hub` | Workstream 2: L1→hub root edges |
| `phase2_concept_taxonomy_attach:v1:evidence_vote` | Workstream 3: concept→taxonomy edges |

---

## Rollback SQL

```sql
-- 1. Remove concept→taxonomy attachment edges
DELETE FROM concept_relations WHERE context LIKE 'phase2_concept_taxonomy_attach:v1:%';

-- 2. Remove taxonomy tree edges
DELETE FROM concept_relations WHERE context LIKE 'phase2_taxonomy_tree:v1:%';

-- 3. Remove taxonomy_node concepts
DELETE FROM concepts WHERE category = 'taxonomy_node';

-- 4. Revert chunk classifications back to triage (optional)
UPDATE kb_chunk_taxonomy ct
SET taxonomy_node_id = tn.id
FROM kb_taxonomy_nodes tn
WHERE tn.slug = ct.hub_slug || ':triage-unclassified'
  AND ct.method = 'llm';
```

---

## Final Results (2026-02-26)

| Metric | Before (Phase 1) | After (Phase 2) | Target | Status |
|--------|-------------------|-------------------|--------|--------|
| Concepts | 22,088 | 23,988 (+1,900) | — | — |
| Relations | 50,451 | 69,666 (+19,215) | — | — |
| **A — Hub Traceability** | 13.09% | **82.86%** | >= 95% | WARN |
| **B — Chunk Triage** | 100% | **13.78%** | <= 15% | PASS |
| **C — Knowledge Hub Reachability** | 63.3% | **98.67%** | Report | — |
| Orphans | 198 (0.9%) | 4 (0.0%) | — | PASS |
| Largest Component | 74.36% | **99.4%** | >= 40% | PASS |
| Components | 1,485 | 15 | — | — |

### Traceability by Category

| Category | Traceable | Total | % |
|----------|-----------|-------|---|
| acs_element | 2,174 | 2,174 | 100% |
| acs_task | 143 | 143 | 100% |
| acs_area | 31 | 31 | 100% |
| topic | 4,985 | 5,005 | 99.6% |
| definition | 2,840 | 2,850 | 99.65% |
| procedure | 3,337 | 3,350 | 99.61% |
| taxonomy_node | 1,887 | 1,900 | 99.32% |
| regulatory_claim | 4,479 | 8,417 | **53.21%** |
| artifact | 0 | 118 | 0% |

### Why Metric A is 82.9% (not 95%)

The gap is primarily **~4,076 `regulatory_claim` concepts** whose evidence chunks are still on triage nodes or have no evidence at all. These regulatory claims cite specific CFR sections, ACs, and NOTAMs that don't map cleanly to the knowledge hub's topic taxonomy. Fixing this requires either:
- A dedicated regulations-hub classification pass
- Evidence expansion to link regulatory claims to chunks in non-triage nodes
- Direct LLM-based concept→taxonomy assignment (bypassing chunk evidence)

### Classification Stats

| Batch | Chunks | Classified | Rate |
|-------|--------|-----------|------|
| Batch 1 | 1,000 | 945 | 94.5% |
| Batch 2 | 3,171 | 2,992 | 94.4% |
| Batch 3 | 108 | 81 | 75.0% |
| **Total** | **4,279** | **4,018** | **93.9%** |

---

## Phase 3 Preview

- Edge type diversification: `requires_knowledge_of`, `contrasts_with`, `mitigates_risk_of` via LLM inference
- Regulations-hub chunk classification to lift regulatory_claim traceability
- Graph-enhanced exam planner: use `is_component_of` paths for topic transitions
- Embedding generation for taxonomy_node concepts
- Aircraft hub population from type certificate data

---

*Generated: 2026-02-26*
