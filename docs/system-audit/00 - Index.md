---
date: 2026-02-20
type: system-audit
tags: [heydpe, system-audit, index, architecture, optimization]
status: living
evidence_level: high
---

# HeyDPE System Audit — Index

**Conducted:** 2026-02-19
**Scope:** Complete technical inventory, architecture mapping, and optimization planning for HeyDPE (FAA Oral Exam Simulator)
**Models consulted:** Gemini 3.0 Pro Preview, GPT-5.2 (via PAL MCP)

---

## Quick Reference

| # | Document | Status |
|---|----------|--------|
| 02 | [[02 - Current Architecture Map]] | Final |
| 03 | [[03 - Knowledge Base and Retrieval Pipeline]] | Final |
| 05 | [[05 - Latency Audit and Instrumentation Plan]] | Final |
| 07 | [[07 - Optimization Roadmap]] | Living |
| 09 | [[09 - Staging Verification]] | Draft |
| 10 | [[10 - Staging Environment and Safe Deployment]] | Final |
| 11 | [[11 - Production Reality Audit Refresh]] | Final |
| 12 | [[12 - Knowledge Graph Quality Audit and Refactor Plan]] | Living |
| 13 | [[13 - Unified Topic Taxonomy v0]] | Draft |
| 14 | [[14 - ACS Source Coverage Gaps]] | Final |
| 15 | [[15 - Chunk Taxonomy Classification Pilot]] | Draft |
| 16 | [[16 - Taxonomy Scaffold Audit and Edge Quality Report]] | Final |
| 17 | [[17 - Multi-Hub KG Architecture]] | Draft |
| 18 | [[18 - Multi-Hub KG Phase 2 — Taxonomy Attachment]] | Draft |
| 19 | [[19 - Multi-Hub KG Phase 3 — Regulatory Anchoring]] | Draft |
| 20 | [[20 - ExamPlan and Planner v1]] | Draft |
| 22 | [[22 - System State Inventory]] | Final |
| 23 | [[23 - Feature Matrix vs Oral Exam Problem Statement]] | Final |
| 24 | [[24 - Test Matrix and Evidence Pack]] | Final |
| 25 | [[25 - Docs Restructure Plan and Moves]] | Final |
| 26 | [[26 - Deployment and PR Status]] | Final |

---

## Executive Summary

HeyDPE is a production-quality FAA oral exam simulator built on Next.js 16 + Supabase + Claude Sonnet, deployed on Vercel. The system is significantly more advanced than its CLAUDE.md documentation suggests — it includes a complete PDF ingestion pipeline, hybrid vector+FTS search with image linking, a multi-provider voice pipeline, Stripe billing, and PostHog analytics.

### Key Findings

1. ~~**The knowledge graph is the biggest untapped asset.**~~ **UPDATE (2026-02-25):** The knowledge graph is now **populated and active in production** — 22,084 concepts, 49,351 relations, 30,689 evidence links. `graph.enhanced_retrieval` is enabled. See [[11 - Production Reality Audit Refresh]] and [[12 - Knowledge Graph Quality Audit and Refactor Plan]].

2. ~~**Zero observability.**~~ **UPDATE (2026-02-19):** Latency instrumentation added via `src/lib/timing.ts` → `latency_logs` table. DB-backed embedding cache added.

3. ~~**Caching is completely absent.**~~ **UPDATE (2026-02-19):** Module-level TTL caches added for system config, prompts, and embeddings.

4. ~~**The exam flow is quiz-like, not DPE-like.**~~ **UPDATE (2026-02-26):** Phase 4 adds `ExamPlanV1` — predetermined exam shape with scope-sensitive question count, bounded bonus questions, follow-up limits, mention credit, and cross-ACS connected walk using taxonomy fingerprints. Grounding Contract enforced code-side. See [[20 - ExamPlan and Planner v1]].

5. **Hallucination of FAA regulations is the highest-risk failure mode.** **MITIGATED (2026-02-25):** Graph bundle injects verified `regulatory_claim` nodes with exact CFR references into the system prompt. No post-hoc verification yet, but context quality greatly improved.

### Recommended Immediate Actions (This Sprint)

| Priority | Action | Effort | Expected Impact | Status |
|----------|--------|--------|----------------|--------|
| 1 | Add latency instrumentation to `latency_logs` | S | Enables all measurement | **DONE** (2026-02-19) |
| 2 | Add module-level caches (system config, prompts, profiles) | S | -100-300ms/request | **DONE** (2026-02-19) |
| 2b | Add DB-backed embedding cache | S | -150-300ms on cache hit | **DONE** (2026-02-19) |
| 2c | Fix ingestion page_start/page_end population | S | Enables image linking | **DONE** (2026-02-19) |
| 3 | Enable metadata filtering in hybrid search | S | Better regulatory retrieval | Code ready, flag not set |
| 4 | Populate ACS skeleton in knowledge graph | S | Enables all graph features | **DONE** (2026-02-20) |
| 5 | Start building regulatory assertion test set | M | Validates accuracy improvements | Planned |
| 6 | Backbone repair — reduce orphan rate | S | Graph connectivity + bundle quality | **DONE** (2026-02-25) |
| 7 | Edge type diversification (LLM inference) | M | 3/6 → 5/6+ relation types | Planned |

---

## Staging Test Status

| Date | Report | Result |
|------|--------|--------|
| 2026-02-20 | [[2026-02-20-staging-e2e-smoke]] | REVIEW — 4/5 automated checks pass, awaiting human smoke test |

---

## Notes

| # | Title | Description |
|---|-------|-------------|
| [[01 - Tech Stack Inventory]] | **Tech Stack** | Complete dependency map, infrastructure, build tools, source corpus, architecture + data flow diagrams |
| [[02 - Current Architecture Map]] | **Architecture** | Runtime components, major flows (auth, exam lifecycle, voice), database schema, RPC functions, evidence pointers |
| [[03 - Knowledge Base and Retrieval Pipeline]] | **RAG Pipeline** | Ingestion (text + images), retrieval (embedding + hybrid search + image linking), accuracy risks, code touchpoints |
| [[04 - Exam Flow Engine]] | **Exam Flow** | Planner architecture, queue building, element selection, grading, state machine, gaps (follow-ups, transitions, adaptation) |
| [[05 - Latency Audit and Instrumentation Plan]] | **Latency** | Estimated budget breakdown, all contributors, instrumentation plan with spans, quick wins, deeper refactors |
| [[06 - GraphRAG Proposal for Oral Exam Flow]] | **GraphRAG** | Schema design, population strategy (4 phases), traversal algorithms, planner integration, migration plan |
| [[07 - Optimization Roadmap]] | **Roadmap** | Prioritized NOW/NEXT/LATER plan across 3 tracks (correctness, flow, latency), impact/effort matrix, rollout strategy |
| [[08 - PAL MCP Research Log]] | **Research** | Verbatim model responses (Gemini 3.0 Pro + GPT-5.2), synthesis, cross-model consensus |
| [[09 - Staging Verification]] | **Staging** | E2E smoke test results for staging environment |
| [[10 - Staging Environment and Safe Deployment]] | **Deployment** | Staging setup, safe deployment procedures |
| [[11 - Production Reality Audit Refresh]] | **Prod Audit** | RAG grounding path, exam flow, grading pipeline, prompting architecture, stop-the-line risks |
| [[12 - Knowledge Graph Quality Audit and Refactor Plan]] | **Graph Quality** | Before/after metrics, root cause analysis, backbone repair, edge gap taxonomy, next steps |
| [[13 - Unified Topic Taxonomy v0]] | **Taxonomy v0** | 3-level taxonomy from FAA PDF TOCs: 9 L1 + 701 L2 + 990 L3 nodes |
| [[14 - ACS Source Coverage Gaps]] | **Source Gaps** | 90% ACS source coverage, 3 critical gaps (AC 61-107, AC 90-107, AC 91.21-1) |
| [[15 - Chunk Taxonomy Classification Pilot]] | **Classification** | 200-chunk pilot with Anthropic prompt caching, 99.5% rate |
| [[16 - Taxonomy Scaffold Audit and Edge Quality Report]] | **Edge Quality** | Claims→airspace 0%→45.8%, largest component 60%→74.2%, 1,060 new edges |
| [[17 - Multi-Hub KG Architecture]] | **Multi-Hub** | 4-hub scaffold (knowledge/acs/regulations/aircraft), 100% chunk assignment, Phase 1 structural only |
| [[18 - Multi-Hub KG Phase 2 — Taxonomy Attachment]] | **Phase 2** | Chunk classification + taxonomy promotion + evidence-based concept attachment |
| [[19 - Multi-Hub KG Phase 3 — Regulatory Anchoring]] | **Phase 3** | Regulations taxonomy expansion + regulatory_claim CFR-parsed attachment + artifact anchoring |
| [[20 - ExamPlan and Planner v1]] | **ExamPlan** | Predetermined exam shape, scope-sensitive question count, mention credit, connected walk, grounding contract |
| [[22 - System State Inventory]] | **Inventory** | Full codebase + DB inventory: 33 API routes, 29+ lib modules, 49 scripts, 48 migrations, 24K concepts, 74K relations |
| [[23 - Feature Matrix vs Oral Exam Problem Statement]] | **Requirements** | R1–R10 evidence-based matrix mapping requirements against implementation evidence |
| [[24 - Test Matrix and Evidence Pack]] | **Tests** | 495 tests across 25 files mapped to features, 9 known test gaps identified |
| [[25 - Docs Restructure Plan and Moves]] | **Docs** | 22 doc files git-mv'd to canonical structure (system-audit, build-reports, runbooks, plans, archive) |
| [[26 - Deployment and PR Status]] | **Deployment** | Branch status, 3 PRs, DB migration readiness, pre-merge checklist for PR #3 |

---

## Open Questions / Unknowns

> [!todo] Unresolved: Actual Latency Numbers
> All latency estimates are based on code analysis and typical API timings. **No real measurements exist.** Priority 1 is adding instrumentation to get real data.

> [!todo] Unresolved: Corpus Size Metrics
> Exact chunk count, total embedding count, and average query latency for hybrid search are unknown without DB access. Need to run: `SELECT count(*) FROM source_chunks WHERE embedding IS NOT NULL;`

> [!todo] Unresolved: pgvector Index Type
> Which index type (HNSW vs IVFFLAT) and parameters are currently deployed? Check: `SELECT * FROM pg_indexes WHERE tablename = 'source_chunks';`

> [!todo] Unresolved: Hybrid Search Weight Validation
> The 0.65/0.35 vector/FTS split has not been empirically validated. An A/B test with different weights against the regulatory assertion test set would provide evidence.

> [!todo] Unresolved: Assessment Accuracy
> No evaluation data exists for the `assessAnswer()` function. False satisfactory/unsatisfactory rates are unknown.

> [!todo] Unresolved: Voice Error Rate
> No data on STT transcription accuracy for aviation terminology. Deepgram's aviation-specific vocabulary biasing has not been configured.

> [!todo] Unresolved: Obsidian Vault Location
> The Obsidian vault path documented in CLAUDE.md (`~/Library/Mobile Documents/iCloud~md~obsidian/...`) was not found on this machine. These notes are stored in `docs/system-audit/` instead and should be synced to Obsidian when the vault is available.

---

## Methodology

1. **Repository recon:** Exhaustive read of all config files, manifests, migrations (35), source code modules (20+), scripts, and type definitions.
2. **Code-level tracing:** Every claim about architecture is backed by specific file paths and line numbers.
3. **External consultation:** 6 targeted questions sent to Gemini 3.0 Pro Preview and GPT-5.2 via PAL MCP. Responses captured verbatim and synthesized.
4. **Cross-validation:** External model suggestions were reconciled with actual codebase evidence. Discrepancies noted where CLAUDE.md diverges from code.
