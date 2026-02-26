---
title: "Production Audit Index"
date: 2026-02-24
tags: [audit, index, heydpe, system-audit]
status: active
audit_ref: prod-reality-audit-20260224
---

# Production Audit — Index

> [!info] How to Use This Audit Pack
> Start here. This index links every document in the production audit series. Read [[01 - Requirements and Non-Negotiables]] and [[02 - Deployed Reality Snapshot]] first to understand what the product must do and what it actually does. Then read [[10 - Drift vs Existing Docs]] to see where earlier documentation has gone stale. Finally, read [[11 - Recommendations and Next Tasks]] for the prioritized action plan.

---

## Key Findings

1. **The system works end-to-end** — three exam ratings (Private, Commercial, Instrument) are live with 143 ACS tasks, AI-driven assessment, and multi-provider TTS.
2. **Knowledge graph is real** — 22K concepts, 45K relations, 30K evidence links. GraphRAG is enabled in production (`enhanced_retrieval=true`). The earlier "empty graph" risk (doc 03/06) is resolved.
3. **RAG quality has gaps** — embedding cache writes are broken (`cache_reused=0`), all 4,674 chunks lack page numbers (`page_start=0`), and metadata filtering is coded but not enabled in prod.
4. **Earlier documentation has significant drift** — four of ten original audit docs (01, 02, 03, 04) contain materially incorrect claims about versions, chunk counts, scheduling model, and graph status.
5. **Latency instrumentation is active but incomplete** — 83 production logs exist, but `exchange.total` is always null due to a streaming path bug.
6. **Exam realism features are missing** — no question budget, no follow-up probe limit, no graph-ordered topic transitions. These are the next product-quality improvements.
7. **Two stop-the-line items** — embedding cache bug (cost + latency waste) and missing page tracking (broken citation grounding) should be fixed before new feature work.

---

## Document Map

### Production Audit Series (this directory)

| # | Document | Purpose | Status |
|---|----------|---------|--------|
| 00 | [[00 - Index]] | This file. Links and summarizes all audit documents. | Active |
| 01 | [[01 - Requirements and Non-Negotiables]] | Core product requirements with implementation status. What the product *must* do. | Current |
| 02 | [[02 - Deployed Reality Snapshot]] | What is actually running in production as of 2026-02-24. Database counts, feature flags, config state. | Current |
| 10 | [[10 - Drift vs Existing Docs]] | Line-by-line comparison of each original audit doc (01-10) against production reality. Identifies stale claims. | Current |
| 11 | [[11 - Recommendations and Next Tasks]] | Prioritized action plan: P1 knowledge correctness, P2 exam realism, P3 latency. Includes code touchpoints, rollback strategies, and implementation sequence. | Active |

### Artifacts

| Artifact | Location | Contents |
|----------|----------|----------|
| artifacts/ | `production-audit/artifacts/` | Supporting data, query results, and evidence files referenced by audit documents |

### Original Audit Series (parent directory)

These documents were written earlier in development. See [[10 - Drift vs Existing Docs]] for a detailed assessment of which claims remain accurate.

| # | Document | Purpose | Drift Level |
|---|----------|---------|-------------|
| 01 | [[../01 - Tech Stack Inventory]] | Technology choices and versions | High — versions outdated |
| 02 | [[../02 - Current Architecture Map]] | System architecture diagram and component descriptions | High — missing GraphRAG, multi-rating, personas |
| 03 | [[../03 - Knowledge Base and Retrieval Pipeline]] | RAG pipeline design and knowledge base statistics | High — chunk count wrong, risks resolved |
| 04 | [[../04 - Exam Flow Engine]] | Exam scheduling and session management | High — scheduling model changed to element-level |
| 05 | [[../05 - Latency Audit and Instrumentation Plan]] | Latency targets and instrumentation design | Medium — now active in prod |
| 06 | [[../06 - GraphRAG Proposal for Oral Exam Flow]] | Proposal for knowledge graph integration | Superseded — implemented and live |
| 07 | [[../07 - Optimization Roadmap]] | Planned optimizations and their status | Medium — many items completed |
| 08 | [[../08 - PAL MCP Research Log]] | Research notes on PAL MCP integration | None — reference material |
| 09 | [[../09 - Staging Verification]] | Staging environment verification | Low |
| 10 | [[../10 - Staging Environment and Safe Deployment]] | Staging deployment procedures | Low |

---

## Quick Reference: Current Production State

| Metric | Value |
|--------|-------|
| Framework | Next.js 16.1.6 |
| AI Model | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| ACS Tasks | 143 (PA: 61, CA: 60, IR: 22) |
| Source Chunks | 4,674 |
| Concepts | 22,151 |
| Relations | 45,233 |
| Evidence Links | 30,419 |
| DPE Personas | 4 |
| TTS Providers | 3 (OpenAI, Deepgram, Cartesia) |
| Latency Logs | 83 |
| Embedding Cache Reuse | 0 (broken) |
| Metadata Filter | Code ready, flag not set |
| GraphRAG | Enabled (`enhanced_retrieval=true`) |

---

## Reading Order

For a full understanding of the system state and next steps:

1. [[01 - Requirements and Non-Negotiables]] — what must be true
2. [[02 - Deployed Reality Snapshot]] — what is true
3. [[10 - Drift vs Existing Docs]] — where docs diverged from reality
4. [[11 - Recommendations and Next Tasks]] — what to do next

For a quick status check, read this index and [[11 - Recommendations and Next Tasks]] only.
