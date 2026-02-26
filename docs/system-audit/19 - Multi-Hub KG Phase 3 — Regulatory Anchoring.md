---
date: 2026-02-26
type: system-audit
tags: [heydpe, knowledge-graph, multi-hub, regulations, phase-3]
status: draft
evidence_level: high
---

# 19 — Multi-Hub KG Phase 3: Regulatory Anchoring

## Overview

Phase 3 lifts Concept->Hub traceability from 82.86% (WARN) to 98.9% (PASS) by anchoring the two untraceable categories from Phase 2:

1. **regulatory_claim** (3,938 untraceable at 53.21%) — evidence chunks all on knowledge:triage-unclassified, no regulations-hub assignment
2. **artifact** (118 untraceable at 0%) — zero evidence rows in concept_chunk_evidence

### Root Cause (from gap report)

All 3,938 untraceable regulatory_claims had evidence rows, but 100% of evidence chunks were on triage taxonomy nodes. The fix required **direct CFR reference parsing** from concept text, bypassing chunk-evidence voting entirely.

### Success Metrics

| Metric | Phase 2 | Phase 3 | Target | Status |
|--------|---------|---------|--------|--------|
| **A** — Concept->Hub traceability | 82.86% | **98.9%** | >= 95% | **PASS** |
| **B** — Chunk triage rate | 13.78% | **13.78%** | <= 15% | PASS |
| Concepts | 23,988 | **24,613** (+625) | — | — |
| Relations | 69,666 | **74,271** (+4,605) | — | — |
| Orphans | 4 | **0** | — | — |
| Components | 15 | **3** | — | — |
| Largest Component | 99.4% | **99.89%** | — | — |

---

## What Phase 3 Does

### Step A: Baseline & Gap Diagnosis (read-only)

**Script:** `scripts/graph/traceability-gap-report.ts`
**npm:** `npm run graph:traceability:gaps`

Diagnostic script that identifies untraceable concepts and diagnoses root causes:
- Evidence existence per concept
- Triage status of evidence chunks
- CFR/AC/NOTAM reference extraction from concept text
- Artifact evidence gaps

### Step B: Expand Regulations Taxonomy

**Script:** `scripts/taxonomy/expand_regulations_taxonomy.ts`
**npm:** `npm run taxonomy:expand:regulations`

Reads regulatory_claim concepts and extracts CFR section references from name + key_facts + content. Creates L3 section-level taxonomy nodes under existing (or new) L2 part nodes.

- **Input:** 8,417 regulatory_claim concepts
- **Output:** 22 new L2 part nodes + 603 L3 section nodes
- **Slug scheme:** `regulations:14cfr-part-91:sec-91-155`
- **Top parts by section count:** Part 91 (258), Part 61 (127), Part 93 (70)

### Step C: Promote New Regulation Taxonomy Nodes

**Script:** `scripts/graph/sync_taxonomy_to_concepts.ts --context phase3_reg_taxonomy_tree:v1`
**npm:** `npm run taxonomy:sync:concepts -- --context phase3_reg_taxonomy_tree:v1`

Promotes 625 new taxonomy nodes into graph concepts with `is_component_of` edges:
- 625 new concepts (category: `taxonomy_node`)
- 2,510 parent->child edges (context: `phase3_reg_taxonomy_tree:v1:parent`)
- 14 L1->hub edges (context: `phase3_reg_taxonomy_tree:v1:l1-to-hub`)

### Step D: Chunk Classification (skipped)

The classify_chunks_regulations.ts script was created but found 0 triage chunks in the regulations hub. All evidence chunks were in the knowledge hub. Chunk reclassification was not needed because the fix uses direct CFR parsing (Step E) instead of chunk-evidence voting.

### Step E: Direct Regulatory Claim Attachment + Artifact Anchoring

**Script (claims):** `scripts/graph/attach_regulatory_claims_to_sections.ts`
**npm:** `npm run graph:attach:regulatory-claims`

Parses CFR references directly from each unattached regulatory_claim concept's text and creates `is_component_of` edges to matching regulation section (L3) or part (L2) taxonomy concepts.

- **Input:** 4,076 unattached regulatory_claims
- **Section-level matches (L3):** 3,703 (90.8%)
- **Part-level matches (L2):** 159 (3.9%)
- **No match:** 214 (5.3%)
- **Total edges created:** 3,862
- **Context:** `phase3_concept_taxonomy_attach:v1:cfr_parse`

**Script (artifacts):** `scripts/graph/attach_artifacts_to_hub_root.ts`
**npm:** `npm run graph:attach:artifacts`

Direct-attach all 118 artifact concepts to `hub:knowledge` root.

- **Edges created:** 118
- **Context:** `phase3_artifact_anchor:v1:hub-root`

---

## What Phase 3 Does NOT Do

- Does not reclassify knowledge-hub chunks (Metric B unchanged)
- Does not add edge type diversification (still 3/6 types)
- Does not generate embeddings for new taxonomy_node concepts
- Does not modify the exam engine or retrieval pipeline
- Does not create evidence rows for artifacts

---

## Commands

```bash
# Diagnostic (read-only)
npm run graph:traceability:gaps

# Write sequence
ALLOW_PROD_WRITE=1 npm run taxonomy:expand:regulations -- --write
ALLOW_PROD_WRITE=1 npm run taxonomy:sync:concepts -- --write --context phase3_reg_taxonomy_tree:v1
ALLOW_PROD_WRITE=1 npm run graph:attach:regulatory-claims -- --write
ALLOW_PROD_WRITE=1 npm run graph:attach:artifacts -- --write

# Monitoring
npm run graph:validate
npm run graph:metrics
```

---

## Context Prefixes for Rollback

| Context | Source | Count |
|---------|--------|-------|
| `phase3_reg_taxonomy_tree:v1:parent` | Step C: parent->child taxonomy edges | 2,510 |
| `phase3_reg_taxonomy_tree:v1:l1-to-hub` | Step C: L1->hub root edges | 14 |
| `phase3_concept_taxonomy_attach:v1:cfr_parse` | Step E: regulatory_claim->section edges | 3,862 |
| `phase3_artifact_anchor:v1:hub-root` | Step E: artifact->hub edges | 118 |

---

## Rollback SQL

```sql
-- 1. Remove regulatory_claim->section attachment edges
DELETE FROM concept_relations WHERE context = 'phase3_concept_taxonomy_attach:v1:cfr_parse';

-- 2. Remove artifact->hub edges
DELETE FROM concept_relations WHERE context = 'phase3_artifact_anchor:v1:hub-root';

-- 3. Remove Phase 3 taxonomy tree edges
DELETE FROM concept_relations WHERE context LIKE 'phase3_reg_taxonomy_tree:v1:%';

-- 4. Remove Phase 3 taxonomy_node concepts (625 regulation nodes)
DELETE FROM concepts WHERE slug LIKE 'regulations:14cfr-part-%' AND category = 'taxonomy_node';

-- 5. Remove Phase 3 taxonomy nodes from kb_taxonomy_nodes
DELETE FROM kb_taxonomy_nodes WHERE level = 3 AND hub_slug = 'regulations';
DELETE FROM kb_taxonomy_nodes WHERE level = 2 AND hub_slug = 'regulations'
  AND slug NOT IN (
    'regulations:14cfr-part-1', 'regulations:14cfr-part-23', 'regulations:14cfr-part-43',
    'regulations:14cfr-part-61', 'regulations:14cfr-part-67', 'regulations:14cfr-part-71',
    'regulations:14cfr-part-91', 'regulations:14cfr-part-97', 'regulations:14cfr-part-119',
    'regulations:14cfr-part-135'
  );
```

---

## Final Results (2026-02-26)

### Traceability by Category

| Category | Phase 2 | Phase 3 | Total | Phase 3 % |
|----------|---------|---------|-------|-----------|
| regulatory_claim | 4,479 | **8,203** | 8,417 | **97.46%** |
| topic | 4,985 | 4,985 | 5,005 | 99.6% |
| procedure | 3,337 | 3,337 | 3,350 | 99.61% |
| definition | 2,840 | 2,840 | 2,850 | 99.65% |
| taxonomy_node | 1,887 | **2,512** | 2,525 | 99.49% |
| acs_element | 2,174 | 2,174 | 2,174 | 100% |
| acs_task | 143 | 143 | 143 | 100% |
| artifact | 0 | **118** | 118 | **100%** |
| acs_area | 31 | 31 | 31 | 100% |
| **TOTAL** | **19,876** | **24,343** | **24,613** | **98.9%** |

### Remaining Untraceable (270 concepts)

- 214 `regulatory_claim` with no parseable CFR/AC/NOTAM reference in text
- ~56 other categories (topics/definitions/procedures at triage-only evidence nodes)

### Hub Root Reachability

| Root | Nodes | % |
|------|-------|---|
| Knowledge Hub | 24,413 | 99.19% |
| ACS Hub | 24,526 | 99.65% |
| Regulations Hub | 21,672 | 88.05% |
| Aircraft Hub | 13 | 0.05% |

---

## Phase 4 Preview

- Edge type diversification: `requires_knowledge_of`, `contrasts_with`, `mitigates_risk_of`
- Graph-enhanced exam planner: use `is_component_of` paths for topic transitions
- Embedding generation for 625 new taxonomy_node concepts
- Aircraft hub population from type certificate data
- Regulations hub reachability improvement (88% -> target 95%+)

---

*Generated: 2026-02-26*
