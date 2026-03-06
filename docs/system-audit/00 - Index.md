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
| 21 | [[21 - Grading and Quick Drill v1]] | Draft |
| 22 | [[22 - System State Inventory]] | Final |
| 23 | [[23 - Feature Matrix vs Oral Exam Problem Statement]] | Final |
| 24 | [[24 - Test Matrix and Evidence Pack]] | Final |
| 25 | [[25 - Docs Restructure Plan and Moves]] | Final |
| 26 | [[26 - Deployment and PR Status]] | Final |
| 27 | [[27 - Release Verification — Phase 5]] | Final |
| 28 | [[28 - Results UI and Quick Drill Entry]] | Final |
| 29 | [[29 - Exam Quality Harness and Calibration]] | Final |
| 30 | [[30 - Grounding Repair and Monitoring]] | Final |
| 31 | [[31 - Flow Coherence Activation]] | Final |
| 32 | [[32 - Certificate Depth and Difficulty Engine]] | Final |
| 33 | [[33 - Rating Parity Audit (Private, Commercial, Instrument)]] | Final |
| 34 | [[34 - Examiner Personality Engine]] | Final |
| 35 | [[35 - Examiner Identity Unification]] | Final |
| 36 | [[36 - Multimodal Semantic Asset Engine]] | Final |
| 37 | [[37 - PromptOps Hardening and Launch Readiness Gate]] | Final |
| 38 | [[38 - Commercial Launch Preparation Checklist]] | Final |
| 39 | [[39 - Deployment Closure and Launch Gate Re-run]] | Final |
| 40 | [[40 - Commercial Launch Preparation Pack]] | Final |
| 41 | [[41 - Beta Readiness UX and User Flow Audit]] | Final |
| 42 | [[42 - Help FAQ Support and Bug Reporting]] | Final |
| 43 | [[43 - Email Communications Program]] | Final |
| 44 | [[44 - Billing Trial and Conversion Readiness]] | Final |
| 45 | [[45 - Browser Device and Responsive QA]] | Final |
| 46 | [[46 - Security Hardening Review]] | Final |
| 47 | [[47 - Beta Readiness Decision Pack]] | Final |
| 48 | [[48 - Public Launch Hardening Sprint]] | Final |
| 49 | [[49 - Support Alerts and Incident Runbook]] | Final |
| 50 | [[50 - Public Launch Gate Re-run]] | Final |
| 51 | [[51 - Public Launch Execution Plan]] | Final |
| 52 | [[52 - Launch Dashboard and Alert Thresholds]] | Final |
| 53 | [[53 - First 72 Hours Launch Operations]] | Final |
| 54 | [[54 - Public Launch Execution Report]] | Final |
| 55 | [[55 - Email System Review and Sample Pack]] | Final |
| 56 | [[56 - Lifecycle and Transactional Email Matrix]] | Final |
| 57 | [[57 - Email Gaps and Recommendations]] | Final |
| 58 | [[58 - Email Preference System Architecture]] | Final |
| 59 | [[59 - Learning Digest Engine]] | Final |
| 60 | [[60 - Motivation Nudge Engine]] | Final |
| 61 | [[61 - Observability Alerting and Resilience Gate]] | Final |
| 62 | [[62 - Load and Resilience Validation Report]] | Final |
| 63 | [[63 - Alerting and Synthetic Monitoring Spec]] | Final |
| 64 | [[64 - Public Launch Final Gate Re-run]] | Draft |
| 65 | [[65 - Voice Stack Regression Analysis]] | Final |
| 66 | [[66 - Voice Stack Phase 2 Implementation Report]] | Final |

---

## Executive Summary

HeyDPE is a production-quality FAA oral exam simulator built on Next.js 16 + Supabase + Claude Sonnet, deployed on Vercel. The system is significantly more advanced than its CLAUDE.md documentation suggests — it includes a complete PDF ingestion pipeline, hybrid vector+FTS search with image linking, a multi-provider voice pipeline, Stripe billing, and PostHog analytics.

### Key Findings

1. ~~**The knowledge graph is the biggest untapped asset.**~~ **UPDATE (2026-02-25):** The knowledge graph is now **populated and active in production** — 22,084 concepts, 49,351 relations, 30,689 evidence links. `graph.enhanced_retrieval` is enabled. See [[11 - Production Reality Audit Refresh]] and [[12 - Knowledge Graph Quality Audit and Refactor Plan]].

2. ~~**Zero observability.**~~ **UPDATE (2026-02-19):** Latency instrumentation added via `src/lib/timing.ts` → `latency_logs` table. DB-backed embedding cache added.

3. ~~**Caching is completely absent.**~~ **UPDATE (2026-02-19):** Module-level TTL caches added for system config, prompts, and embeddings.

4. ~~**The exam flow is quiz-like, not DPE-like.**~~ **UPDATE (2026-02-26):** Phase 4 adds `ExamPlanV1` — predetermined exam shape with scope-sensitive question count, bounded bonus questions, follow-up limits, mention credit, and cross-ACS connected walk using taxonomy fingerprints. Grounding Contract enforced code-side. **Phase 5** adds `ExamResultV2` — plan-based grading denominator, per-area gating, weak-area synthesis with grounded citations, and Quick Drill mode. See [[20 - ExamPlan and Planner v1]] and [[21 - Grading and Quick Drill v1]].

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
| [[21 - Grading and Quick Drill v1]] | **Grading V2** | ExamResultV2 with plan-based denominator, per-area gating, weak-area synthesis with citations, Quick Drill mode |
| [[22 - System State Inventory]] | **Inventory** | Full codebase + DB inventory: 33 API routes, 29+ lib modules, 49 scripts, 48 migrations, 24K concepts, 74K relations |
| [[23 - Feature Matrix vs Oral Exam Problem Statement]] | **Requirements** | R1–R10 evidence-based matrix mapping requirements against implementation evidence |
| [[24 - Test Matrix and Evidence Pack]] | **Tests** | 495 tests across 25 files mapped to features, 9 known test gaps identified |
| [[25 - Docs Restructure Plan and Moves]] | **Docs** | 22 doc files git-mv'd to canonical structure (system-audit, build-reports, runbooks, plans, archive) |
| [[26 - Deployment and PR Status]] | **Deployment** | Branch status, 3 PRs, DB migration readiness, pre-merge checklist for PR #3 |
| [[27 - Release Verification — Phase 5]] | **Release** | PR #3+#4 merge evidence, DB migration proof, 522 tests, rollback steps |
| [[28 - Results UI and Quick Drill Entry]] | **Phase 6** | Results display modal (V2 per-area gating, weak elements, FAA citations), Quick Drill selector, smoke proof, 525 tests |
| [[29 - Exam Quality Harness and Calibration]] | **Phase 7** | Reusable eval harness: 6 scripts covering R1 (grounding FAIL 35.9%), R4 (instruction PASS), R5 (flow PASS/SKIP), R8 (prompts PASS 96/96), R9/R10 smoke |
| [[30 - Grounding Repair and Monitoring]] | **Phase 8** | Citation relevance scorer, runtime filtering, rating-aware keywords, admin endpoint, PostHog events. R1 grounding: 35.9% → **7.5%** PASS |
| [[31 - Flow Coherence Activation]] | **Phase 9** | Structural fingerprints, connectedWalk activation, transition explanations, flow monitoring. R5 flow: 0% → **72.8%** Jaccard, **812.5%** improvement over random |
| [[32 - Certificate Depth and Difficulty Engine]] | **Phase 10** | Deterministic DepthDifficultyContract (32 combos), per-rating depth profiles, examiner+grading prompt injection, 34 new tests, 8/8 audit PASS |
| [[33 - Rating Parity Audit (Private, Commercial, Instrument)]] | **Parity** | All 3 ratings verified across 15+ subsystems. 1 gap fixed (Commercial area keywords). 21 new tests. Phase 11 safe. |
| [[34 - Examiner Personality Engine]] | **Phase 11** | PersonaContractV1 with 4 personas × 8 style dimensions. UI selector, PostHog events, admin endpoint. 26 new tests, 10/10 audit PASS |
| [[35 - Examiner Identity Unification]] | **Phase 12** | ExaminerProfileV1 unifies persona+voice+display identity. Settings as source of truth, deterministic 4-level resolution, backward compat. 31 new tests, 10/10 audit PASS |
| [[36 - Multimodal Semantic Asset Engine]] | **Phase 13** | 4-signal semantic image scoring (category+caption+linkType+relevance), 0.4 confidence threshold, text cards for METAR/TAF/regs, dual-emit SSE, no migration. 37 new tests, 10/10 audit PASS |
| [[37 - PromptOps Hardening and Launch Readiness Gate]] | **Phase 14** | PromptOps governance audit (5 checks), prompt trace logging, admin quality endpoint, 12-check launch readiness gate (GO/REVIEW/NO-GO), E2E smoke matrix (9 scripts). 11/12 GO |
| [[38 - Commercial Launch Preparation Checklist]] | **Phase 14** | 32-item pre-launch checklist across core engine, test coverage, operational readiness, monitoring. 731 tests, 9 eval scripts, cumulative phase history |
| [[39 - Deployment Closure and Launch Gate Re-run]] | **Phase 15** | Deployment closure: commit d728b02 pushed, Vercel READY, launch gate 12/12 GO, prompt trace 60% adoption, production verification 22/22 PASS |
| [[40 - Commercial Launch Preparation Pack]] | **Phase 15** | Commercial launch preparation: billing audit (Stripe GO), legal (GO), support (REVIEW — need public help page), observability (GO). Launch dashboard metrics spec. GO for soft/beta launch |
| [[41 - Beta Readiness UX and User Flow Audit]] | **Phase 16** | User journey map (10 routes), 4 UX fixes applied (help page, nav link, footer link, disclaimer contrast), all pages GO |
| [[42 - Help FAQ Support and Bug Reporting]] | **Phase 16** | Public help page created (12 FAQs), 3 support paths (in-app report, settings feedback, email), admin ticket system, auto-reply recommended |
| [[43 - Email Communications Program]] | **Phase 16** | Resend integration with 4 templates, 7/12 scenarios implemented, 100% beta-critical coverage, learning digest and trial reminder planned post-beta |
| [[44 - Billing Trial and Conversion Readiness]] | **Phase 16** | Stripe end-to-end audit, CRITICAL payment failure tier downgrade bug FIXED, trial-to-purchase flow verified, 5 webhook events handled with idempotency |
| [[45 - Browser Device and Responsive QA]] | **Phase 16** | Chrome/Safari/Firefox/Edge tested, all pages responsive, voice STT Chrome/Edge-only (documented in Help), zero responsive blockers |
| [[46 - Security Hardening Review]] | **Phase 16** | 12 security areas audited, zero beta blockers, zero public launch blockers, RLS enforced, rate limiting active, Stripe webhook verified |
| [[47 - Beta Readiness Decision Pack]] | **Phase 16** | Synthesis: 7 workstreams all GO for beta. 4 blockers fixed. 10 public-launch review items. Recommended: deploy and begin invite-only beta |
| [[48 - Public Launch Hardening Sprint]] | **Phase 17** | 7 Phase 16 review items closed: support auto-reply, trial reminder, TTS tier gate, CSP, report ownership, pricing CTA. 6 code fixes + 2 scripts + 2 templates + 12 tests. 743/743 pass |
| [[49 - Support Alerts and Incident Runbook]] | **Phase 17** | Operational runbook: monitoring stack, ticket workflow, email delivery/retry, payment incidents, common incidents, escalation path, launch day checklist |
| [[50 - Public Launch Gate Re-run]] | **Phase 17** | 9-check deterministic public launch gate: 9/9 GO. All Phase 16 review items resolved. System meets public launch readiness criteria |
| [[51 - Public Launch Execution Plan]] | **Phase 18** | Evidence-backed launch plan: Phases 15-17 commit fix, 19/19 production verification, 3 critical funnel events added, go/no-go criteria all GO |
| [[52 - Launch Dashboard and Alert Thresholds]] | **Phase 18** | 6 monitoring dashboards (Acquisition, Conversion, Engagement, System Health, Revenue, Support), per-metric alert thresholds, P1-P4 escalation path |
| [[53 - First 72 Hours Launch Operations]] | **Phase 18** | Hour-by-hour operational playbook: pre-launch checklist, active monitoring schedule, known issues watchlist, P1-P3 incident response, rollback plan |
| [[54 - Public Launch Execution Report]] | **Phase 18** | Final execution report: 19/19 prod verification, 743/743 tests, LAUNCH WITH CAUTION verdict, evidence pack, cumulative phase history |
| [[55 - Email System Review and Sample Pack]] | **Phase 19** | Complete email system audit: 10 scenarios inventoried, 10 sample emails sent to review inbox, all rendered HTML saved. 8 send functions, 6 templates, 0 failures |
| [[56 - Lifecycle and Transactional Email Matrix]] | **Phase 19** | Full email scenario matrix: 15 scenarios (8 implemented, 2 Supabase-handled, 5 not implemented), trigger sources, template registry, sender addresses |
| [[57 - Email Gaps and Recommendations]] | **Phase 19** | 6 email gaps classified: 1 compliance prerequisite (unsubscribe), 1 medium priority (learning summary), 4 deferred. Priority matrix with effort estimates |
| [[58 - Email Preference System Architecture]] | **Phase 20** | Selective email opt-out with HMAC-SHA256 unsubscribe tokens, `email_preferences` + `email_logs` tables, per-category controls, public preference page, 2 RPC functions |
| [[59 - Learning Digest Engine]] | **Phase 20** | Daily grounded digest: element scores, 7-day session window, weak/strong areas with progress bars, idempotent cron script with 200ms rate limiting |
| [[60 - Motivation Nudge Engine]] | **Phase 20** | Decaying cadence nudge system (day 1/3/7/14/30), tolerance-window milestone matching, variant-specific templates, deduplication via `email_logs` |
| [[61 - Observability Alerting and Resilience Gate]] | **Phase 21** | Health endpoint, event inventory expansion (20 events), synthetic monitoring (12/12 PASS), load/resilience validation (13/14 PASS), cron hardening, 756 tests |
| [[62 - Load and Resilience Validation Report]] | **Phase 21** | 14-check static analysis: timeouts, rate limiting, singletons, error handling, caching, deployment. 13 PASS, 1 WARN (TTS maxDuration) |
| [[63 - Alerting and Synthetic Monitoring Spec]] | **Phase 21** | 12-check offline monitoring: health endpoint, PostHog, cron reliability, admin endpoints, email infrastructure, error boundaries. 12/12 PASS |
| [[64 - Public Launch Final Gate Re-run]] | **Phase 21** | Planned 16-check comprehensive gate (not yet created). Documents gate evolution from Phase 14 (12 checks) to Phase 17 (9 checks) to Phase 21 |
| [[65 - Voice Stack Regression Analysis]] | **Phase 22** | Voice regression root cause analysis: 6 candidates, 7 contradictions, ADR-001 decision, trust-boundary + data-flow diagrams |
| [[66 - Voice Stack Phase 2 Implementation Report]] | **Phase 22** | MODERATE fix implementation: CSP wss://, STT retry, fallback UX, telemetry, dead code removal. 34 new tests, 1103 total, typecheck clean |

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
