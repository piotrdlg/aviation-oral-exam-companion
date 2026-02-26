---
date: 2026-02-24
type: audit-report
tags: [aviation-oral-exam, system-audit, drift-analysis]
status: completed
scope: docs/system-audit/01 through 10 vs production state
---

# 10 — Drift vs Existing Documentation

> [!summary]
> Structured comparison of each existing audit document (01 through 10) against the verified production state as of 2026-02-24. Each section identifies stale claims, code drift, and what needs updating.

---

## Methodology

Each existing document was compared against:
- Production database queries (Supabase `pvuiwwqsumoqjepukjhz`)
- Deployed code on `main` branch
- Vercel deployment configuration
- Runtime behavior (latency logs, session data)

Verdict categories:
- **Stale** — Document describes a state that no longer exists
- **Partially stale** — Some claims accurate, others outdated
- **Current** — Document still reflects production reality
- **Superseded** — Document's proposal has been implemented; doc should be marked as historical

---

## 01 — Tech Stack Inventory

| Claim | Doc Value | Actual Value | Verdict |
|-------|-----------|--------------|---------|
| Framework | Next.js 15 | Next.js 16.1.6 | Stale |
| AI Model | Claude Sonnet 3.5 | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Stale |
| Tailwind | v4 | v4 | Current |
| Database | Supabase (PostgreSQL + pgvector) | Same | Current |
| Auth | Supabase Auth (email/password) | Same | Current |
| TTS | OpenAI TTS | Multi-provider (OpenAI/Deepgram/Cartesia) with tiered voice selection | Stale |
| STT | Web Speech API | Same (Chrome-only) | Current |
| Testing | Vitest | Vitest, 235+ tests across 12 files | Partially stale (count outdated) |
| Deployment | Vercel auto-deploy from `main` | Same | Current |

**Action required**: Update framework version, AI model, TTS provider architecture, and test count. Add entries for Deepgram and Cartesia TTS providers. Document the tiered voice selection system.

---

## 02 — Current Architecture Map

| Claim | Actual | Verdict |
|-------|--------|---------|
| Two-file exam engine split (`exam-logic.ts` / `exam-engine.ts`) | Still accurate | Current |
| Two Claude calls per exchange (assess + generate) | Still accurate | Current |
| RAG pipeline: embed query, hybrid search, return top-k chunks | Now includes graph-enhanced retrieval (`enhanced_retrieval=true`) | Partially stale |
| Session management: client-side history only | Still accurate (transcripts table exists but unused) | Current |
| Single rating (Private Pilot) | Three ratings: Private (61), Commercial (60), Instrument (22) | Stale |
| No persona system mentioned | 4 DPE personas with personality prompts now exist | Stale |
| No structured response chunking | 3-chunk JSON for latency-optimized TTS now exists | Stale |

**Action required**: Add GraphRAG retrieval path to architecture diagram. Add multi-rating support. Document persona system and structured response chunking. Update RAG pipeline to show metadata filtering path (code exists, flag not enabled in prod).

---

## 03 — Knowledge Base and Retrieval Pipeline

| Claim | Actual | Verdict |
|-------|--------|---------|
| ~7,000 chunks ingested | 4,674 chunks | Stale (overcounted) |
| RPC function `chunk_hybrid_search` | `hybrid_search` (renamed or doc was wrong) | Stale |
| Risk 6: "Empty Knowledge Graph" | Graph populated: 22K concepts, 45K relations, 30K evidence links | Stale (risk resolved) |
| Embedding model: OpenAI `text-embedding-3-small` | Same | Current |
| Vector dimensions: 1536 | Same | Current |
| `page_start` tracking for citations | `page_start=0` for all 4,674 chunks (not populated) | Partially stale |
| Embedding cache for query reuse | Cache exists but `cache_reused=0` (broken writes) | Stale |
| Metadata filtering not mentioned | Code exists in `rag-filters.ts` and `rag-search-with-fallback.ts`, flag not set in prod | Missing from doc |

**Action required**: Correct chunk count to 4,674. Remove or resolve Risk 6 (graph is populated). Document the metadata filtering pipeline. Note embedding cache bug. Correct RPC function name. Flag `page_start` data gap.

---

## 04 — Exam Flow Engine

| Claim | Actual | Verdict |
|-------|--------|---------|
| Task-level scheduling (pick random task from uncovered list) | Element-level scheduling via planner system | Stale |
| ACS areas: 9 of 12 (exclude IV, V, X) | Same filtering logic | Current |
| Single rating (Private Pilot, 61 tasks) | Three ratings: PA (61), CA (60), IR (22) | Stale |
| No question budget | Still no question budget | Current (but noted as gap) |
| No follow-up probe limit | Still no probe limit | Current (but noted as gap) |
| Session enforcement not mentioned | One-active-exam policy now exists (`session-policy.ts`) | Missing from doc |

**Action required**: Rewrite scheduling section to reflect element-level planner. Add multi-rating support documentation. Document session enforcement policy. Note question budget and probe limit as design gaps.

---

## 05 — Latency Audit and Instrumentation Plan

| Claim | Actual | Verdict |
|-------|--------|---------|
| Status: "plan" (instrumentation not yet active) | Active in production, 83 logs recorded | Stale |
| Target latencies proposed but unmeasured | `latency_logs` table populated via `src/lib/timing.ts` | Stale |
| No streaming mentioned | Structured response chunking (3-chunk JSON) for TTS latency optimization | Stale |
| `exchange.total` span proposed | Exists but always `null` (timing.end never called for streaming path) | Partially stale |

**Action required**: Mark instrumentation as deployed. Update with actual measured latencies from the 83 production logs. Document the `exchange.total` bug. Add structured chunking to the latency pipeline description.

---

## 06 — GraphRAG Proposal for Oral Exam Flow

| Claim | Actual | Verdict |
|-------|--------|---------|
| Status: "proposed" | Implemented and enabled in production | Superseded |
| Knowledge graph: empty, needs population | 22K concepts, 45K relations, 30K evidence links | Superseded |
| Graph traversal via `get_related_concepts()` RPC | RPC exists and is called at runtime | Superseded (now fact) |
| `enhanced_retrieval` flag proposed | Set to `true` in production `system_config` | Superseded (now fact) |
| Admin visualization: not mentioned | 4-tab admin graph visualization interface exists | Missing from doc |

**Action required**: Mark this document as **historical/implemented**. Add a header noting that the proposal was executed. Reference the admin visualization. Cross-link to updated architecture in [[02 - Current Architecture Map]].

---

## 07 — Optimization Roadmap

| Item | Claimed Status | Actual Status | Verdict |
|------|---------------|---------------|---------|
| Embedding cache | Planned | Implemented but broken (`cache_reused=0`) | Partially stale |
| Metadata filtering | Planned | Code complete, flag not set in prod | Partially stale |
| Graph-enhanced retrieval | Planned | Deployed, enabled | Stale (completed) |
| Structured TTS chunking | Not mentioned | Implemented (3-chunk JSON) | Missing |
| Multi-provider TTS | Not mentioned | Implemented (OpenAI/Deepgram/Cartesia) | Missing |
| Persona system | Not mentioned | Implemented (4 DPE personas) | Missing |
| Element-level planner | Not mentioned | Implemented | Missing |

**Action required**: Update completion status for each item. Add newly implemented optimizations that were not on the original roadmap. Mark completed items. Add new items for the remaining gaps (embedding cache fix, metadata filter enablement, exchange.total timing fix).

---

## 08 — PAL MCP Research Log

| Claim | Actual | Verdict |
|-------|--------|---------|
| Research notes on PAL MCP integration | Reference material, no production impact | Current |

**Action required**: None. This is reference material and does not drift with production changes.

---

## 09 — Staging Verification

| Claim | Actual | Verdict |
|-------|--------|---------|
| Staging verification procedures | Staging environment exists | Current |

**Action required**: Minor updates if staging URLs or procedures have changed. Low priority.

---

## 10 — Staging Environment and Safe Deployment

| Claim | Actual | Verdict |
|-------|--------|---------|
| Staging deployment procedures | Staging environment operational | Current |

**Action required**: Verify deployment procedures still match current Vercel configuration. Low priority.

---

## Summary: Drift Severity

| Doc | Drift Level | Priority to Update |
|-----|------------|-------------------|
| [[01 - Tech Stack Inventory]] | High | P1 — version numbers wrong |
| [[02 - Current Architecture Map]] | High | P1 — missing GraphRAG, multi-rating, personas |
| [[03 - Knowledge Base and Retrieval Pipeline]] | High | P1 — chunk count wrong, risks resolved |
| [[04 - Exam Flow Engine]] | High | P1 — scheduling model changed entirely |
| [[05 - Latency Audit and Instrumentation Plan]] | Medium | P2 — status changed from plan to active |
| [[06 - GraphRAG Proposal for Oral Exam Flow]] | Superseded | P2 — mark as historical |
| [[07 - Optimization Roadmap]] | Medium | P2 — many items completed |
| [[08 - PAL MCP Research Log]] | None | No action |
| [[09 - Staging Verification]] | Low | P3 |
| [[10 - Staging Environment and Safe Deployment]] | Low | P3 |

> [!warning] Documentation Debt
> Four of the ten documents (01, 02, 03, 04) have high drift and should be updated before onboarding any new contributor or conducting external review. The system has evolved significantly since these documents were written.
