---
date: 2026-02-24
type: system-audit
tags: [aviation-oral-exam, production-audit, knowledge-graph, rag, graphrag]
status: completed
audit-scope: graph-state-and-opportunities
---

# 08 — Graph and Flow Opportunities Audit

## 1. Current Graph State in Production

### Volume Summary

| Entity | Count | Notes |
|--------|-------|-------|
| **Concepts** | 22,075 | All have embeddings |
| **Relations** | 45,728 | Multiple edge types (is_component_of, LLM-inferred, similarity, CFR cross-ref) |
| **Evidence links** | 30,689 | `concept_chunk_evidence` rows linking concepts to source chunks |

### Concept Type Breakdown

| Type | Count (approximate) | Source |
|------|---------------------|--------|
| `acs_area` | 31 | Migration-seeded (PA, CA, IR areas) |
| `acs_element` | 969 | Migration-seeded (knowledge/risk/skill elements) |
| `topic`, `regulatory_claim`, `definition`, `procedure`, `artifact` | ~21,075 | Extraction scripts run against prod |

> [!note] Full Embedding Coverage
> All 22,075 concepts have embeddings populated. This means vector similarity search across the entire graph is functional — no dead nodes from a partial embedding run.

### Relation Types

The first 1,000 relations captured by snapshot (Supabase default `LIMIT`) were all `is_component_of`, indicating the ACS hierarchy forms the densest cluster. The total of 45,728 edges confirms that additional edge types exist:

- **`is_component_of`** — ACS hierarchy (area -> task -> element)
- **LLM-inferred edges** — Semantic relationships extracted by Claude during knowledge graph population
- **Embedding similarity edges** — Auto-generated from vector proximity
- **CFR cross-reference edges** — Regulatory citation links (14 CFR Part 61, 91, etc.)

### RPC Functions

| RPC | Status | Migration |
|-----|--------|-----------|
| `hybrid_search()` | Active | Pre-existing |
| `get_related_concepts()` | Active | Pre-existing (recursive CTE, depth 3) |
| `get_uncovered_acs_tasks()` | Active | Pre-existing |
| `get_concept_bundle()` | Active | `20260224000003_concept_bundle_rpc.sql` |

The `get_concept_bundle()` RPC performs:
- Outgoing edges + incoming edges at depth 0
- Matches slug prefixes: `acs_element:`, `acs_task:`, `acs_area:`
- Returns a structured bundle suitable for prompt injection

---

## 2. Graph IS Being Used at Runtime

> [!note] Key Finding
> The knowledge graph is **actively integrated** into the production exam engine. This is not a dormant feature.

### Feature Flag State

| Flag | Value | Effect |
|------|-------|--------|
| `graph.enhanced_retrieval` | `ENABLED` | Graph context is prepended to RAG results in examiner prompts |
| `graph.shadow_mode` | `ENABLED` | Redundant — shadow mode is superseded by enhanced mode |

### Examiner Prompt Injection (`exam-engine.ts:281-343`)

When `graph.enhanced_retrieval` is enabled, the system prompt includes:

```
KNOWLEDGE GRAPH CONTEXT:
{graph bundle from get_concept_bundle()}

CHUNK-BASED RETRIEVAL:
{standard RAG chunks from hybrid_search()}
```

The graph context appears **before** chunk-based retrieval, giving it positional priority in the context window.

### Assessment Prompt Injection

Graph context is also injected into the assessment call as a "VERIFIED REGULATORY CLAIMS" section. This provides the assessment model with authoritative regulatory references to compare against the student's answer, improving grading accuracy for regulation-heavy questions.

### Element Code Flow

The element code is passed from the client-side planner state:

```typescript
// api/exam/route.ts:411
const elementCode = clientPlannerState?.queue?.[clientPlannerState?.cursor];
```

This element code drives the `get_concept_bundle()` lookup, ensuring the graph context is relevant to the specific ACS element currently being examined.

---

## 3. GraphRAG Viability Assessment

The existing graph infrastructure opens three high-value opportunities that go beyond traditional chunk-based RAG.

### 3.1 Prerequisite Drill-Down Potential

**Concept:** When a student demonstrates weakness on a topic, the graph can identify prerequisite concepts and guide the examiner to probe foundational knowledge.

**Feasibility with current graph:**
- The `is_component_of` edges already encode the ACS hierarchy (area -> task -> element)
- LLM-inferred edges likely include prerequisite-type relationships
- `get_related_concepts()` with depth 3 traversal can reach prerequisite chains
- Evidence links (30,689 rows) provide source material for each concept

**Example flow:**
```
Student struggles with "Class B airspace requirements"
  → Graph traversal finds prerequisite: "airspace classification system"
  → Examiner: "Let's step back — can you walk me through the different
    airspace classes and their basic characteristics?"
```

> [!todo] Prerequisite Drill-Down Implementation
> Requires: (1) tagging edges with `prerequisite_of` relation type (may already exist in LLM-inferred edges), (2) planner logic to traverse prerequisites when assessment returns `unsatisfactory`, (3) prompt instruction for the examiner to use prerequisite context naturally.

### 3.2 Logical Cross-Topic Transitions

**Concept:** The `examiner_transition` field (if populated on concept or task records) enables the examiner to transition between ACS areas in a way that mirrors a real DPE's conversational flow.

**Feasibility with current graph:**
- Cross-reference edges (CFR links, similarity edges) connect concepts across ACS areas
- A question about "weather minimums for VFR flight" naturally connects to "airspace" via shared regulatory references (14 CFR 91.155)
- The graph can surface these connections to make transitions feel organic rather than random

**Example flow:**
```
Examiner finishes Area I (Preflight Preparation) weather discussion
  → Graph finds shared CFR edge to Area VI (Navigation) weather-related elements
  → Examiner: "You mentioned checking weather along your route. Speaking of
    route planning, how would you handle an unexpected AIRMET along your
    cross-country?"
```

> [!note] Current State
> The existence of an `examiner_transition` field suggests this was anticipated in the schema design. The 45,728 edges provide the connectivity needed. The missing piece is planner-level logic to query transition candidates when selecting the next task.

### 3.3 Regulatory Claim Accuracy Boost

**Concept:** The "VERIFIED REGULATORY CLAIMS" section injected into assessment prompts directly improves grading accuracy for questions involving specific regulations, minimums, or procedural requirements.

**Current state:** This is **already active in production**. The assessment model receives graph-sourced regulatory claims alongside the student's answer, reducing hallucination risk when grading regulation-heavy responses.

**Measurable impact potential:**
- Regulations are binary (correct or incorrect) — ideal for automated accuracy measurement
- Could compare assessment accuracy on regulatory questions with vs. without graph context
- The 30,689 evidence links provide traceable citations back to source material

---

## 4. Staged Adoption Plan

The graph integration has progressed through a phased rollout. Current position: **Stage 2 (Enhanced)**.

### Stage 1: Shadow Mode (Completed)

| Aspect | Status |
|--------|--------|
| Feature flag | `graph.shadow_mode = ENABLED` |
| Behavior | Graph context fetched but results logged, not injected into prompts |
| Purpose | Validate graph retrieval latency and relevance without affecting user experience |
| Outcome | Sufficient to proceed to Enhanced |

> [!risk] Shadow Mode Logging Gap
> Shadow mode is still flagged as `ENABLED` but is superseded by `enhanced_retrieval`. During the shadow phase, the logging did not produce useful comparison data — there is no recorded dataset of "what shadow mode would have retrieved" vs "what chunk-only retrieval produced" that could be used for retroactive analysis. This is a missed observability opportunity.

### Stage 2: Enhanced Retrieval (Current)

| Aspect | Status |
|--------|--------|
| Feature flag | `graph.enhanced_retrieval = ENABLED` |
| Behavior | Graph context prepended to RAG results in both examiner and assessment prompts |
| Purpose | Improve examiner question quality and assessment accuracy with structured knowledge |
| Risks | Graph retrieval adds latency; irrelevant graph context could confuse the model |

### Stage 3: Graph-Guided Flow (Next)

| Aspect | Status |
|--------|--------|
| Feature flag | Not yet created (proposed: `graph.guided_flow`) |
| Behavior | Graph drives task selection, prerequisite drill-down, and cross-topic transitions |
| Purpose | Transform the exam from random task selection to an intelligent, adaptive flow |
| Prerequisites | Planner integration, prerequisite edge tagging, transition candidate scoring |

**Proposed feature flags for Stage 3:**

| Flag | Purpose |
|------|---------|
| `graph.guided_flow` | Master enable for graph-driven task/topic selection |
| `graph.prerequisite_drilldown` | Enable prerequisite traversal on unsatisfactory assessments |
| `graph.cross_topic_transitions` | Enable graph-informed topic transitions |
| `graph.transition_logging` | Log transition decisions for eval (shadow mode for flow) |

---

## 5. Missing Capabilities

### 5.1 No Shadow Mode Comparison Data

> [!risk] Missed Observability
> Shadow mode was enabled but did not produce a structured dataset comparing graph-augmented retrieval vs. chunk-only retrieval. Without this data, it is impossible to quantify the accuracy improvement from Stage 2 (Enhanced). Recommendation: implement a logging mode that records both retrieval paths and their downstream assessment outcomes for a sample of sessions.

### 5.2 No A/B Evaluation Framework

> [!risk] No Accuracy Measurement
> There is no mechanism to compare:
> - Chunk-only RAG assessment accuracy vs. chunk+graph assessment accuracy
> - Graph-guided task selection quality vs. random task selection quality
> - Prerequisite drill-down effectiveness vs. standard re-ask behavior
>
> Without A/B evaluation, the graph investment is justified by intuition rather than data. This is acceptable at the current stage but becomes a blocker before investing in Stage 3.

### 5.3 Shadow Mode Flag Redundancy

The `graph.shadow_mode` flag remains `ENABLED` in production despite being functionally superseded by `graph.enhanced_retrieval`. This creates confusion:

- Does shadow mode logging still run alongside enhanced mode? (Likely yes — wasted compute)
- If enhanced is disabled, does shadow mode re-activate? (Unclear without reading the flag evaluation logic)

> [!todo] Clean Up Shadow Mode
> Either (1) set `graph.shadow_mode = DISABLED` since enhanced supersedes it, or (2) repurpose shadow mode as a parallel logging path that records "what would chunk-only have produced" for A/B comparison.

---

## 6. Recommendations Summary

| Priority | Item | Stage | Effort |
|----------|------|-------|--------|
| P1 | Disable or repurpose `graph.shadow_mode` flag | Current | 15 min |
| P1 | Add latency tracking for graph retrieval vs. chunk retrieval separately | Current | 1-2 hours |
| P2 | Implement A/B logging: record both retrieval paths for a % of sessions | Current | 1-2 days |
| P2 | Tag prerequisite edges in existing graph (may require re-run of extraction) | Stage 3 prep | 1 day |
| P3 | Build planner logic for prerequisite drill-down on unsatisfactory assessment | Stage 3 | 2-3 days |
| P3 | Build transition candidate scoring using cross-reference edges | Stage 3 | 2-3 days |
| P4 | Create graph.guided_flow feature flag and Stage 3 rollout plan | Stage 3 | 1 day |
| P4 | Build eval harness comparing chunk-only vs. chunk+graph accuracy on regulatory questions | Eval | 3-5 days |
