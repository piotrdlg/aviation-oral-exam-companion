---
title: "Multi-Hub Knowledge Graph Architecture"
date: 2026-02-26
type: system-audit
tags: [heydpe, knowledge-graph, multi-hub, architecture, phase-1]
status: draft
evidence_level: high
---

# 17 — Multi-Hub KG Architecture

**Implemented:** 2026-02-26
**Environment:** Production (`pvuiwwqsumoqjepukjhz`)
**Branch:** `prod-reality-audit-20260224`

---

## Executive Summary

Phase 1 introduces a **4-hub structural scaffold** for the HeyDPE knowledge graph. Every source chunk is assigned to exactly one hub based on its source document type. Hub root concepts are created in the `concepts` table with `is_component_of` edges connecting existing domain roots and ACS areas to their respective hub roots. No existing data is modified or deleted.

### What Phase 1 Does

- Creates `kb_hubs` registry table with 4 hubs
- Extends `kb_taxonomy_nodes` and `kb_chunk_taxonomy` with `hub_slug` column
- Assigns 100% of source_chunks to hubs via deterministic abbreviation rules
- Seeds taxonomy nodes per hub (knowledge: 1,700, acs: ~177, regulations: ~15, aircraft: ~12)
- Creates 4 hub root concept nodes + ~40 `is_component_of` scaffold edges
- Adds Phase 1 validation gate (6 checks)

### What Phase 1 Does NOT Do

- No LLM-based classification (all assignments are deterministic)
- No cross-hub relation types (only `is_component_of`)
- No granular chunk→L2/L3 taxonomy classification (all chunks go to triage nodes)
- No runtime retrieval changes (exam engine unchanged)
- No deletion of existing concepts, relations, or edges

---

## Hub Definitions

| Hub | Slug | Purpose | Source Documents | Taxonomy Depth | Expected Chunks |
|-----|------|---------|-----------------|----------------|-----------------|
| Knowledge | `knowledge` | FAA handbooks, AIM, advisory circulars | phak, afh, aim, ac, ifh, awh, rmh, wbh, iph, seaplane, other | 3 levels (1,700 nodes) | ~87% |
| ACS | `acs` | Airman Certification Standards by rating/area/task | acs | 3 levels (~177 nodes) | ~9% |
| Regulations | `regulations` | 14 CFR regulatory framework | cfr | 2 levels (~15 nodes) | ~3% |
| Aircraft | `aircraft` | Aircraft-specific systems and procedures | poh, afm | 2 levels (~12 nodes) | 0% (no POH/AFM docs ingested yet) |

---

## Schema Changes

### New Table: `kb_hubs`

| Column | Type | Constraint |
|--------|------|-----------|
| hub_slug | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | — |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Seeded with 4 rows: knowledge, acs, regulations, aircraft.

### Modified: `kb_taxonomy_nodes`

| New Column | Type | Default |
|------------|------|---------|
| hub_slug | TEXT NOT NULL | 'knowledge' |
| taxonomy_slug | TEXT NOT NULL | 'default' |

New indexes: `(hub_slug, taxonomy_slug, parent_id)`, `(hub_slug, taxonomy_slug, slug)`.
FK to `kb_hubs(hub_slug)`.

### Modified: `kb_chunk_taxonomy`

| New Column | Type | Default |
|------------|------|---------|
| hub_slug | TEXT NOT NULL | 'knowledge' |
| taxonomy_slug | TEXT NOT NULL | 'default' |

Old constraint `UNIQUE(chunk_id, taxonomy_node_id)` replaced with `UNIQUE(chunk_id)` for Phase 1 single-assignment enforcement.

---

## Graph Topology

```
hub:knowledge (topic)
  ├── topic:national-airspace-system (is_component_of)
  ├── topic:aviation-weather (is_component_of)
  ├── topic:aircraft-systems-and-performance (is_component_of)
  ├── topic:navigation-and-flight-planning (is_component_of)
  ├── topic:regulations-and-compliance (is_component_of)
  ├── topic:flight-operations-and-procedures (is_component_of)
  ├── topic:aerodynamics-and-principles-of-flight (is_component_of)
  ├── topic:human-factors-and-adm (is_component_of)
  └── topic:instrument-flying (is_component_of)
        └── [existing 22,000+ concept graph]

hub:acs (topic)
  ├── acs_area:private:I (is_component_of)
  ├── acs_area:private:II (is_component_of)
  ├── ... (31 ACS area concepts total)
  └── acs_area:instrument:VI (is_component_of)
        └── [existing task→element hierarchy]

hub:regulations (topic)
  └── [no graph edges yet — taxonomy only]

hub:aircraft (topic)
  └── [no graph edges yet — taxonomy only]
```

All scaffold edges use `context LIKE 'hub_scaffold:v1:%'` for rollback.

---

## Chunk Assignment Rules

| source_documents.abbreviation | Hub |
|---|---|
| `acs` | acs |
| `cfr` | regulations |
| `poh`, `afm` | aircraft |
| Everything else | knowledge |

Method: `doc_abbreviation_rule` (deterministic, no LLM). Confidence: 1.0.

---

## Commands

```bash
# 1. Apply migration (must be first)
# Run via Supabase dashboard or supabase db push

# 2. Build taxonomy nodes per hub
npm run taxonomy:build:hubs -- --dry-run     # Preview
ALLOW_PROD_WRITE=1 npm run taxonomy:build:hubs -- --write

# 3. Assign chunks to hubs
npm run taxonomy:assign:hubs -- --dry-run    # Preview
ALLOW_PROD_WRITE=1 npm run taxonomy:assign:hubs -- --write

# 4. Create hub scaffold edges
npm run graph:attach:hubs -- --dry-run       # Preview
ALLOW_PROD_WRITE=1 npm run graph:attach:hubs -- --write

# 5. Validate Phase 1
npm run taxonomy:validate:hubs

# 6. Run existing diagnostics
npm run graph:metrics
npm run graph:validate
npm run graph:audit:paths
```

---

## Rollback

All Phase 1 changes are additive and can be reversed in order:

```sql
-- 1. Remove scaffold edges (by context prefix)
DELETE FROM concept_relations
WHERE context LIKE 'hub_scaffold:v1:%';

-- 2. Remove hub root concepts
DELETE FROM concepts
WHERE slug IN ('hub:knowledge', 'hub:acs', 'hub:regulations', 'hub:aircraft');

-- 3. Clear all chunk assignments
TRUNCATE kb_chunk_taxonomy;

-- 4. Delete non-knowledge taxonomy nodes
DELETE FROM kb_taxonomy_nodes WHERE hub_slug != 'knowledge';

-- 5. Delete triage nodes
DELETE FROM kb_taxonomy_nodes WHERE slug LIKE '%:triage-unclassified';

-- 6. Reverse migration (if needed — see migration file for full DDL)
ALTER TABLE kb_chunk_taxonomy DROP CONSTRAINT IF EXISTS uq_chunk_single_hub;
ALTER TABLE kb_chunk_taxonomy DROP CONSTRAINT IF EXISTS fk_chunk_taxonomy_hub;
ALTER TABLE kb_chunk_taxonomy DROP COLUMN IF EXISTS taxonomy_slug;
ALTER TABLE kb_chunk_taxonomy DROP COLUMN IF EXISTS hub_slug;
ALTER TABLE kb_taxonomy_nodes DROP CONSTRAINT IF EXISTS fk_taxonomy_nodes_hub;
DROP INDEX IF EXISTS idx_taxonomy_nodes_hub_parent;
DROP INDEX IF EXISTS idx_taxonomy_nodes_hub_slug_composite;
ALTER TABLE kb_taxonomy_nodes DROP COLUMN IF EXISTS taxonomy_slug;
ALTER TABLE kb_taxonomy_nodes DROP COLUMN IF EXISTS hub_slug;
DROP TABLE IF EXISTS kb_hubs;
```

---

## Phase 2 Preview

Phase 2 (not yet planned) will build on this scaffold:

1. **Granular chunk classification** — Use Anthropic prompt caching to classify each chunk into L2/L3 taxonomy nodes within its assigned hub, reducing triage rate from ~100% to <25%.
2. **Cross-hub relation types** — Add `requires_knowledge_of`, `leads_to_discussion_of`, and `applies_in_scenario` edges between hubs (e.g., regulatory claims in the regulations hub linked to topic concepts in the knowledge hub).
3. **Runtime hub-scoped retrieval** — Modify the exam engine to scope RAG search to the relevant hub(s) based on the current ACS task.
4. **Certificate-depth shaping** — Use taxonomy depth within hubs to stratify difficulty (L2 = foundational, L3 = advanced).

---

## Evidence

Migration: `supabase/migrations/20260226000001_multi_hub_taxonomy.sql`

Scripts:
- `scripts/taxonomy/build_multi_hub_taxonomy.ts` — taxonomy node seeding
- `scripts/taxonomy/assign_chunks_to_hubs.ts` — chunk→hub assignment
- `scripts/graph/attach_hub_scaffold.ts` — hub concept + edge creation
- `scripts/taxonomy/validate_multi_hub_phase1.ts` — Phase 1 validation gate

Reports: `docs/graph-reports/2026-02-26-*.md`

---

*Last updated: 2026-02-26*
