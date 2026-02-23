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

---

## Executive Summary

HeyDPE is a production-quality FAA oral exam simulator built on Next.js 16 + Supabase + Claude Sonnet, deployed on Vercel. The system is significantly more advanced than its CLAUDE.md documentation suggests — it includes a complete PDF ingestion pipeline, hybrid vector+FTS search with image linking, a multi-provider voice pipeline, Stripe billing, and PostHog analytics.

### Key Findings

1. **The knowledge graph is the biggest untapped asset.** The `concepts` and `concept_relations` tables + RPC functions are fully schemaed but contain zero rows. Populating them — especially with structured `regulatory_claim` nodes — would be the single highest-impact change for accuracy.

2. **Zero observability.** The `latency_logs` table exists but is never populated. There is no APM, no distributed tracing, and no way to measure performance. This must be fixed before any optimization work can be validated.

3. **Caching is completely absent.** Embeddings, system config, prompts, and user profiles are fetched fresh on every request. Simple module-level caches with short TTLs would save 100-300ms per exchange with minimal risk.

4. **The exam flow is quiz-like, not DPE-like.** The cursor-based planner moves linearly through elements without adaptive follow-ups, prerequisite probing, or natural topic transitions. Graph-enhanced navigation could transform this into a realistic oral exam.

5. **Hallucination of FAA regulations is the highest-risk failure mode.** Both external models agreed: structured regulatory claim nodes + citation verification are the primary mitigations.

### Recommended Immediate Actions (This Sprint)

| Priority | Action | Effort | Expected Impact | Status |
|----------|--------|--------|----------------|--------|
| 1 | Add latency instrumentation to `latency_logs` | S | Enables all measurement | **DONE** (2026-02-19) |
| 2 | Add module-level caches (system config, prompts, profiles) | S | -100-300ms/request | **DONE** (2026-02-19) |
| 2b | Add DB-backed embedding cache | S | -150-300ms on cache hit | **DONE** (2026-02-19) |
| 2c | Fix ingestion page_start/page_end population | S | Enables image linking | **DONE** (2026-02-19) |
| 3 | Enable metadata filtering in hybrid search | S | Better regulatory retrieval | Planned |
| 4 | Populate ACS skeleton in knowledge graph | S | Enables all graph features | Planned |
| 5 | Start building regulatory assertion test set | M | Validates accuracy improvements | Planned |

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
