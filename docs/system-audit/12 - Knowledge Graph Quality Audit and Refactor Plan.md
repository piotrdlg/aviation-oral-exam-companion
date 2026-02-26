---
title: "Knowledge Graph Quality Audit and Refactor Plan"
date: 2026-02-25
type: system-audit
tags: [heydpe, knowledge-graph, audit, refactor, graph-quality]
status: active
evidence_level: high
---

# 12 — Knowledge Graph Quality Audit and Refactor Plan

**Conducted:** 2026-02-25
**Environment:** Production (`pvuiwwqsumoqjepukjhz`)
**Branch:** `prod-reality-audit-20260224`

---

## Executive Summary

The HeyDPE knowledge graph has **22,084 concepts, 49,351 relations, and 30,689 evidence links** in production. Graph-enhanced retrieval (`graph.enhanced_retrieval`) and shadow mode are both **enabled and active**.

A backbone repair operation on 2026-02-25 reduced orphan nodes from **14.9% to 0.9%** and increased the largest connected component from **48.8% to 60.0%** of the graph. However, three of six defined relation types remain unused, and ~1,574 components still exist (down from 4,691).

---

## Before/After Metrics

| Metric | Before (2026-02-25 AM) | After Backbone Repair | Target |
|--------|------------------------|-----------------------|--------|
| Concepts | 22,075 | 22,084 (+9 domain roots) | — |
| Relations | 45,728 | 49,351 (+3,623) | — |
| Orphan rate | 14.9% (3,289) | **0.9% (198)** | <5% |
| Components | 4,691 | **1,574** | <100 |
| Largest component | 48.8% (10,776) | **60.0% (13,257)** | >80% |
| Edge types used | 3/6 | 3/6 | 5/6+ |
| Evidence coverage | 98.68% | 98.64% | >95% |
| Dangling edges | 0 | 0 | 0 |
| Self-loops | 0 | 0 | 0 |

---

## Root Cause Analysis

### Why were there so many orphans?

> [!decision] Primary cause: Extraction without attachment
> The `extract-topics.ts` and `extract-regulatory-claims.ts` scripts create concepts and evidence links but **do not create edges to existing graph nodes**. Edge creation depends entirely on `infer-edges.ts`, which:
> - Strategy B (embedding similarity) only creates `leads_to_discussion_of` edges (hardcoded at `scripts/infer-edges.ts:425`)
> - Strategy C (CFR cross-ref) only creates `applies_in_scenario` edges (hardcoded at `scripts/infer-edges.ts:559`)
> - Strategy A (LLM) CAN create all 6 types but batches only 20 concepts at a time — many orphans were never in a batch with a connected concept

### Edge Gap Taxonomy

| Gap | Description | Impact | Fix |
|-----|-------------|--------|-----|
| **Missing hierarchy** | Topics/definitions not connected to domain roots | 14.9% orphan rate | **FIXED**: `build-backbone.ts` seeds 9 domain roots + attaches orphans |
| **Missing `requires_knowledge_of`** | No prerequisite edges exist (0 edges) | No adaptive follow-up | Re-run `infer-edges.ts --strategy llm` with focus on prerequisites |
| **Missing `contrasts_with`** | No contrast edges exist (0 edges) | No confusion probing | Re-run LLM inference with contrast-focused prompts |
| **Missing `mitigates_risk_of`** | No risk mitigation edges (0 edges) | No risk management connections | Re-run LLM inference with risk-focused prompts |
| **Airspace hierarchy** | Airspace concepts disconnected from NAS | NAS root reached only 0.01% | **FIXED**: `build-backbone.ts` creates 673 airspace→NAS edges |
| **ACS elements isolated** | Many ACS elements only have `is_component_of` to parent task | Limited bundle traversal | Need `requires_knowledge_of` edges from elements to topics |

---

## What Was Fixed

### Backbone seeding (`scripts/graph/build-backbone.ts`)

**9 domain root concepts created:**
1. National Airspace System (`topic:national-airspace-system`)
2. Aviation Weather (`topic:aviation-weather`)
3. Aircraft Systems and Performance (`topic:aircraft-systems-and-performance`)
4. Navigation and Flight Planning (`topic:navigation-and-flight-planning`)
5. Regulations and Compliance (`topic:regulations-and-compliance`)
6. Flight Operations and Procedures (`topic:flight-operations-and-procedures`)
7. Aerodynamics and Principles of Flight (`topic:aerodynamics-and-principles-of-flight`)
8. Human Factors and ADM (`topic:human-factors-and-adm`)
9. Instrument Flying (`topic:instrument-flying`)

**3,092 orphan concepts attached** via keyword matching → `leads_to_discussion_of` edges to the best-matching domain root.

**673 airspace hierarchy edges** created: airspace-class concepts → NAS root via `is_component_of`.

### Validation gate (`scripts/graph/graph-validate.ts`)

New automated validation with 5 checks:
1. Orphan rate <= 15% (FAIL), <=10% (target)
2. Dangling edges = 0
3. ACS area backbone roots exist
4. Largest component >= 40% (FAIL), >=60% (target)
5. At least 3/6 relation types active

---

## Recommended Next Steps

### P1 — Edge type diversification (requires LLM API calls)

> [!todo] Re-run `infer-edges.ts --strategy llm` with ALLOW_PROD_WRITE=1
> **DoD:** `requires_knowledge_of` and `contrasts_with` edges > 0 in `graph:validate`
> **Effort:** M (LLM API costs ~$5-10, ~2h runtime)
> **Risk:** Low (upsert is idempotent, existing edges preserved)

**Strategy update (2026-02-25):**
1. Do NOT use random batches of 20 concepts — this is why 3 edge types have 0 edges
2. **Organized batches:** Group concepts by taxonomy L1 domain (NAS, Weather, etc.)
3. **Focused prompts per edge type:**
   - `requires_knowledge_of`: Batch ACS elements + topic/definition concepts from same domain → ask "which topics must a student understand before they can answer questions about this element?"
   - `contrasts_with`: Batch commonly confused pairs (Class B vs Class C, METAR vs TAF, VOR vs GPS) → ask "which concepts are often confused and why?"
   - `mitigates_risk_of`: Batch procedure + regulatory_claim concepts → ask "which procedures or regulations mitigate which operational risks?"
4. **Coverage guarantee:** Process all 9 domains × 3 edge types = 27 focused batches
5. **Estimated cost:** ~$15-20 (more batches but smaller, focused prompts)

### P2 — Reduce remaining components — **PARTIALLY DONE (2026-02-25)**

> [!done] Taxonomy-based attachment reduced components from 1,574 to 1,484
> **Previous target:** Components < 500, largest component > 70%
> **Current:** 1,484 components, largest = 74.2% ✓

Remaining 196 orphans and 1,484 components need:
- Full chunk→taxonomy classification run (pilot showed 99.5% classification rate)
- Then concept→taxonomy attachment using classified evidence chunks

### P3 — Graph version management

> [!decision] Recommended approach: Option A (rebuild in place with backups) for now
> Graph versioning (Option B) adds schema complexity that isn't justified yet. The current graph is in good shape after backbone repair. For future large-scale rebuilds:
> 1. Create backup tables: `concepts_backup_YYYYMMDD`, `concept_relations_backup_YYYYMMDD`
> 2. Rebuild graph with improved pipeline
> 3. Swap by truncating originals and inserting from backup if rollback needed

The backbone builder is already idempotent, so re-running it is safe.

### P4 — Bundle traversal optimization

The `get_concept_bundle` RPC traverses bidirectionally but only goes to depth=2. With the new domain root layer, some bundles may be too large (domain roots connect to hundreds of concepts). Consider:
- Adding a `max_nodes` parameter to the RPC
- Filtering by relevance score during traversal
- Limiting domain root expansion to only the most relevant subtopics

---

## How to Run

```bash
# Measure current graph state
npm run graph:metrics

# Validate against thresholds
npm run graph:validate

# Repair backbone (dry-run first, then live)
npx tsx scripts/graph/build-backbone.ts --dry-run
ALLOW_PROD_WRITE=1 npx tsx scripts/graph/build-backbone.ts

# Re-run edge inference (expensive — LLM API calls)
ALLOW_PROD_WRITE=1 npx tsx scripts/infer-edges.ts --strategy llm
```

---

## Rollback

The backbone repair created new concepts and edges. To rollback:

1. **Remove domain root concepts** (by slug prefix):
   ```sql
   DELETE FROM concept_relations
   WHERE target_id IN (SELECT id FROM concepts WHERE slug LIKE 'topic:national-airspace-system' OR slug LIKE 'topic:aviation-weather' OR slug LIKE 'topic:aircraft-systems%' OR slug LIKE 'topic:navigation%' OR slug LIKE 'topic:regulations%' OR slug LIKE 'topic:flight-operations%' OR slug LIKE 'topic:aerodynamics%' OR slug LIKE 'topic:human-factors%' OR slug LIKE 'topic:instrument-flying');

   DELETE FROM concepts WHERE slug IN (
     'topic:national-airspace-system', 'topic:aviation-weather',
     'topic:aircraft-systems-and-performance', 'topic:navigation-and-flight-planning',
     'topic:regulations-and-compliance', 'topic:flight-operations-and-procedures',
     'topic:aerodynamics-and-principles-of-flight', 'topic:human-factors-and-adm',
     'topic:instrument-flying'
   );
   ```

2. **Remove airspace hierarchy edges** (is_component_of to NAS root):
   ```sql
   DELETE FROM concept_relations
   WHERE target_id = (SELECT id FROM concepts WHERE slug = 'topic:national-airspace-system')
   AND relation_type = 'is_component_of';
   ```

---

## Evidence

All metrics are from production database queries run on 2026-02-25. Full reports:
- `docs/graph-reports/2026-02-25-graph-metrics.json`
- `docs/graph-reports/2026-02-25-graph-metrics.md`
- `docs/graph-reports/2026-02-25-graph-validation.md`

Scripts:
- `scripts/graph/graph-metrics.ts` — metrics collection
- `scripts/graph/graph-validate.ts` — validation gate
- `scripts/graph/build-backbone.ts` — backbone repair

---

*Last updated: 2026-02-25*
