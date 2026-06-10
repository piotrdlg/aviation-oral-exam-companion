# Review 01 — Documentation Corpus Synthesis

> Date: 2026-06-09 · Reviewer: AI agent (docs corpus sweep)
> Scope: docs/system-audit (71 docs), docs/plans (17), PROJECT-STATUS-INVENTORY, PROJECT-RESTRUCTURE-PROPOSAL

## Documented open issues

| Issue | Source doc | Severity as documented | Status |
|---|---|---|---|
| Hard tier enforcement at API level missing — `/api/exam` never checks tier/subscription; nothing blocks expired subscriptions server-side | docs/system-audit/40 - Commercial Launch Preparation Pack.md §2.1 | REVIEW ITEM (required before public/marketing launch) | Open |
| Free-tier session limits not enforced — pricing page promises "Limited" free sessions but no code enforces a cap | docs/system-audit/40 §2.1 | REVIEW ITEM (before marketing launch) | Open |
| Usage metering alerts absent (no alerts when users approach limits, no anomaly notification) | docs/system-audit/40 §2.1 | NOT IMPLEMENTED (non-blocking) | Open |
| No in-app upgrade prompts / paywall modal | docs/system-audit/40 §2.1 | NOT IMPLEMENTED (revenue optimization) | Open |
| No subscription admin dashboard (MRR/churn) — use Stripe Dashboard | docs/system-audit/40 §2.1 | NOT IMPLEMENTED | Open/accepted |
| No refund handling UI | docs/system-audit/40 §2.1 | NOT IMPLEMENTED | Open/accepted |
| Cookie consent persisted in localStorage only, no server-side consent record | docs/system-audit/40 §2.2 | REVIEW ITEM (before EU marketing) | Open |
| No GDPR self-service data export/delete (email-only mechanism) | docs/system-audit/40 §2.2 | REVIEW ITEM (before EU marketing) | Open |
| No FAA-disclaimer acknowledgment modal at first exam start (footer text only) | docs/system-audit/40 §2.2 | REVIEW ITEM | Open |
| No accessibility statement / WCAG policy page | docs/system-audit/40 §2.2 | NOT IMPLEMENTED | Open |
| No real-time alerting (PagerDuty/Slack/email) for error spikes, latency, webhook failures, kill-switch activations | docs/system-audit/40 §2.4; docs/system-audit/54 (caution area: "no automated alerting configured") | REVIEW ITEM | Open (doc 63 added offline synthetic checks, not real-time alerts) |
| No public status page, no SLA docs, no SLO/error-budget tracking | docs/system-audit/40 §2.3–2.4 | NOT IMPLEMENTED | Open/accepted |
| AI quality eval scripts run manually only — no scheduled runs, trend graphs, or regression detection | docs/system-audit/40 §2.4 | REVIEW ITEM | Open |
| `off_graph_mentions` pipeline not writing (table has 0 rows) — no real-time accuracy monitoring | docs/system-audit/11 - Production Reality Audit Refresh.md, Stop-the-line risk #3 | Medium | Open |
| Embedding cache shows 0 reuse hits — cache mechanism exists but never hits | docs/system-audit/11, risk #5 | Low | Open |
| Assessment scoring consistency unmonitored; no eval data on `assessAnswer()` false satisfactory/unsatisfactory rates | docs/system-audit/11 risk #2; docs/system-audit/00 - Index.md "Unresolved: Assessment Accuracy" | Medium | Open |
| Citation accuracy has no post-hoc verification — Claude can still hallucinate when synthesizing from context | docs/system-audit/11 (RAG grounding risk callout) | Documented risk | Open (citation-verifier module proposed in doc 07, never reported done) |
| No adaptive difficulty within a session | docs/system-audit/11 (risk callout + P3 task) | Future improvement | Open |
| `graph.shadow_mode` enabled simultaneously with `graph.enhanced_retrieval` — wasteful, should be disabled | docs/system-audit/11 (risk callout, P3 task) | Harmless/wasteful | Open |
| `rag.metadata_filter` flag never enabled — metadata-aware retrieval code ready but inactive | docs/system-audit/11 (P1 task); docs/system-audit/00 Index (action 3 "Code ready, flag not set") | P1 in doc 11 | Open |
| Hybrid search weight split (0.65/0.35) never empirically validated | docs/system-audit/11 P3; docs/system-audit/00 Index open question | P3 | Open |
| Edge type diversification (`requires_knowledge_of`, `contrasts_with` = 0) — LLM edge inference not run | docs/system-audit/11 P1 task #2; docs/system-audit/00 Index action 7 ("Planned") | P1 | Open/unknown |
| TTS route missing `maxDuration` export | docs/system-audit/62 - Load and Resilience Validation Report.md (1 WARN of 14); docs/system-audit/61 Open Items (Medium) | WARN / Medium | Open |
| No Sentry/error-tracking integration (console.error + PostHog only) | docs/system-audit/61 Open Items | Low | Open |
| Email: no dead-letter queue for failed sends; no automated bounce/complaint monitoring; SPF/DKIM/DMARC verification flagged as pre-launch "Now" task | docs/system-audit/57 - Email Gaps and Recommendations.md (Delivery Infrastructure); docs/system-audit/47 item #6 | LOW–MEDIUM | Open |
| Support ticket reply emails are plain text, no branding | docs/system-audit/57 | Improvement | Open |
| Voice STT limited to Chrome/Edge (documented in Help) | docs/system-audit/45 (via 47 summary); docs/system-audit/54 caution area | Documented limitation | Open (but contradicted elsewhere — see Contradictions) |
| No STT accuracy data for aviation terminology; Deepgram vocabulary biasing not configured | docs/system-audit/00 Index open question | Unknown | Open |
| pgvector index type/parameters unknown and unoptimized | docs/system-audit/00 Index open question; docs/system-audit/07 LATER | Unknown | Open |
| No CI/CD pipeline (no `.github`) | docs/PROJECT-STATUS-INVENTORY-2026-03-26.md §17; CLAUDE.md | Known limitation | Open |
| ATP rating schemaed but not populated | docs/PROJECT-STATUS-INVENTORY-2026-03-26.md §17 | Known limitation | Open |
| CLAUDE.md drift — historically 4x out of date; root clutter (36 PNGs, 6 .env backups incl. real secrets), 17 flat scripts, dead doc folders | docs/PROJECT-RESTRUCTURE-PROPOSAL.md (Problems 1–7; .env backups marked "High — Security Risk") | High (env backups), Medium (rest) | Partially addressed (CLAUDE.md updated 2026-03-26; INSTRUCTOR-PROGRAM-MASTER.md and scripts/_dev/ now exist per git status; PNG/env/script moves status unknown — proposal footer says "No files have been moved yet") |
| Settings page tabbed navigation; readiness score tooltip | docs/system-audit/47 items #8–9 | LOW | Open (never reported closed) |
| Coverage matrix: only 24/96 prompt combos have specific overrides; 72 rely on wildcard fallback | docs/system-audit/38 Known REVIEW Items | Non-blocking, by design | Open/accepted |
| Obsidian vault was 9 days stale at inventory time | docs/PROJECT-STATUS-INVENTORY-2026-03-26.md §17–18 | Process gap | Open |

## Launch gate status

- **The most recent "final gate" (doc 64) was never built.** docs/system-audit/64 - Public Launch Final Gate Re-run.md (status: **draft**) records that the planned 16-check comprehensive gate script (`scripts/audit/public-launch-final-gate.ts`, `npm run audit:final-gate`) **was scoped but not created**. The latest operational gate remains the **Phase 17 9-check gate** (`scripts/audit/public-launch-gate.ts`), which passed 9/9 GO (doc 50). Phase 21 coverage is split across `npm run smoke:phase21` (12/12 PASS, doc 63) and `npm run audit:load-check` (13 PASS / 1 WARN, doc 62) — never consolidated into a single pass/fail exit code.
- **Actual launch verdict: "LAUNCH WITH CAUTION"** (docs/system-audit/54 - Public Launch Execution Report.md, Phase 18). Explicit caution areas:
  1. 11 PARTIAL analytics events (DB-tracked but not in PostHog)
  2. **No load testing performed — "first real traffic will be the test"**
  3. Voice STT limited to Chrome/Edge
  4. Single-operator monitoring, no automated alerting
- Earlier gates for context: Phase 14 gate 11/12 → 12/12 GO after deploy (docs 37, 39); Beta verdict GO with 1 blocker fixed (help page) and 10 public-launch review items (doc 47); doc 40's overall rubric: Soft/Beta = GO, Public/Marketing = **REVIEW** pending hard tier enforcement, free-tier limits, automated alerting, incident runbook, GDPR self-service. The incident runbook was subsequently delivered (doc 49); the other four REVIEW conditions have no closure doc.
- Phase 18 also discovered **Phases 15–17 were never committed/deployed** until commit 5cb6725 fixed it (doc 54) — a process red flag for "claimed done" vs "shipped."

## Deferred work backlog

Explicitly deferred across docs (deduplicated):

1. **Real load testing** (k6/Artillery) — "deferred until traffic justifies the investment" (docs 61, 62, 54; PROJECT-STATUS-INVENTORY §17). Doc 62 is static analysis only, despite its title.
2. **11 PostHog analytics events** — deferred post-launch; only 3 MVP funnel events active (docs 54, PROJECT-STATUS-INVENTORY §13/§17).
3. **Unified 16-check final gate script** (docs 61, 64).
4. **Sentry / error tracking** (doc 61).
5. **Email Gap 1**: trial-start notification — deferred (doc 57).
6. **Email Gap 3**: re-engagement email for inactive users — deferred to month 2+ (doc 57). *(Possibly superseded by Phase 20 nudge engine, doc 60 — docs don't reconcile this.)*
7. **Email Gap 4**: bug report confirmation email — deferred (doc 57).
8. **Email Gap 6**: custom Supabase auth email templates (branding) — deferred (doc 57).
9. **Email dead-letter queue / retry infrastructure** (docs 47 item #6, 57).
10. **Hard server-side tier enforcement + free-tier caps** — deferred past beta (doc 40 §2.1, §2.6).
11. **Invite-only beta gating / waitlist code** — recommended, "code change needed," never reported built (doc 40 §2.5).
12. **Automated alerting, revenue dashboard, AI-quality trend tracking, SLO tracking, status page, SLA** (doc 40 §2.3–2.4).
13. **GDPR self-service export/delete; server-side consent persistence; accessibility statement** (doc 40 §2.2).
14. From doc 07 roadmap, never marked done: **citation verification post-processing**, **source currency management** (`deprecated_at`), **stack-based navigation**, **scenario-based multi-element questions**, **spaced repetition**, **"immediate reaction" streaming**, **topic prefetching**, **pgvector index optimization**, **adaptive follow-up on weak answers** (doc 31 delivered transitions/flow coherence, but auto-follow-up-on-weak-answer branch is not claimed anywhere).
15. **Expand regulatory assertion set from 25 to 100–200 with SME review** (doc 07, "Remaining").
16. **Settings tabbed nav, readiness tooltip** (doc 47 items #8–9).
17. Doc 11 P-tasks never closed: enable `rag.metadata_filter`, run LLM edge inference, fix `off_graph_mentions`, investigate embedding cache misses, disable `graph.shadow_mode`, validate hybrid weights, adaptive difficulty hints. *(Item 5 of that list — weak-area study recommendations UI — appears done: `StudyRecommendations` component listed in PROJECT-STATUS-INVENTORY §3.)*
18. Items resolved later, for the record: email preference center/unsubscribe (Gap 5) and weekly digest (Gap 2) were delivered in Phase 20 (docs 58, 59); incident runbook delivered (doc 49); trial-ending reminder, support auto-reply, TTS tier gate, CSP, report ownership, pricing CTA closed in Phase 17 (doc 48). *(Note: review 05 found `sendTrialEndingReminder` has zero callers — the doc 48 claim appears not to match code.)*

## Plans written but not executed

Cross-checked against docs only (docs/plans/, 17 files):

- **Executed (per doc evidence):** three-tier voice (PROJECT-STATUS-INVENTORY §8), image augmentation (doc 36, `source_images`/asset-selector), multi-rating onboarding (3 ratings seeded, doc 33), pre-commercialization (Stripe/tiers, doc 40), email-auth infrastructure (doc 43/55), multi-exam-resume (`resume-current` action documented in SYSTEM-AUDIT-MASTER), session-policy redesign (`session-policy.ts` + tests referenced in doc 54), knowledge-graph visualization (admin/graph explorer in PROJECT-STATUS-INVENTORY), practice-ux-focus-section (commit 94adbfa in git log).
- **Partially executed / unverified:**
  - **docs/plans/2026-02-18-launch-marketing-implementation.md** — 6 technical tasks appear done (landing page, OG tags, UTM, sitemap/robots per PROJECT-STATUS-INVENTORY §3), but the 3 non-technical tasks (**demo video, Google Ads account, CFI outreach list**) are never reported complete in any doc.
  - **docs/plans/2026-02-19-session-policy-redesign-plan.md** — calls for pg_cron + three scheduled DB cron jobs; no doc confirms pg_cron jobs were created (Vercel crons for digest/nudges are separate).
- **Bigger unexecuted designs living in system-audit:**
  - **docs/system-audit/06 - GraphRAG Proposal for Oral Exam Flow.md** — graph-driven exam navigation (stack navigation, drill-down, graph-path bridging) never built; doc 07 keeps it in LATER.
  - **docs/system-audit/64** — final gate script planned, not created.
  - **docs/system-audit/40 §2.5** — soft-launch gating steps requiring code (invite-only beta, free-tier cap) not built.
  - **docs/PROJECT-RESTRUCTURE-PROPOSAL.md** — explicitly "analysis only, no files moved"; only some items (CLAUDE.md update, instructor master file, scripts/_dev) show evidence of later execution.

## Contradictions

1. **Knowledge graph runtime status**: doc 40 (2026-03-12) says KG is "Populated but **not yet used at runtime** for graph-enhanced retrieval," directly contradicting doc 11 (2026-02-25) and doc 00 Index, which state `graph.enhanced_retrieval` is **enabled in production**. CLAUDE.md says "behind feature flag," PROJECT-STATUS-INVENTORY §17 says "partially utilized." Four different claims.
2. **Voice browser support**: doc 45/47 say "voice STT Chrome/Edge only"; doc 54 repeats it; PROJECT-STATUS-INVENTORY §17 says "Voice mode Chrome-only — Web Speech API limitation"; but CLAUDE.md says "Deepgram Nova-3 WebSocket STT works cross-browser. Legacy Web Speech API was Chrome-only." Inventory §17 cites the wrong (legacy) limitation.
3. **DB scale numbers**: source_chunks ~10K+ (CLAUDE.md, PROJECT-STATUS-INVENTORY §4) vs 4,674 (docs 11, 38, 40). source_documents ~50 (CLAUDE.md/inventory) vs 172 (doc 11). acs_elements ~300+ (CLAUDE.md/inventory) vs 2,174 (doc 11). concepts 22,084 (doc 11) vs 24,613 (docs 38/40) vs ~24K (inventory) — the eval-grade docs disagree with the inventory by 2–35x on several tables.
4. **Test counts**: doc 66 (Phase 22) reports **1,103 total tests**, but CLAUDE.md and PROJECT-STATUS-INVENTORY (both dated 2026-03-26, after Phase 22) still say "743+."
5. **Phase dating is incoherent**: doc 54 (Phase 18) is dated 2026-03-04 but its evidence directory is `2026-03-15-phase18`, and Phases 15–17 docs are dated 2026-03-12/13/14 — i.e., Phase 18's date precedes its predecessors. Docs 61–64 (Phase 21) are also dated 2026-03-04, before Phase 19 docs (2026-03-16).
6. **Study mode taxonomy**: doc 40 verifies modes `full_oral, quick_drill, topic_deep_dive, weak_area_review` (12/12 gate), while PROJECT-STATUS-INVENTORY §9 lists `linear, cross_acs, weak_areas, quick_drill` and doc 11 lists `linear/cross_acs/weak_areas`. Two different four-mode vocabularies are both claimed as verified.
7. **PostHog event counts**: doc 40 lists 5 custom events; doc 54 added 3 funnel events with 11 PARTIAL remaining; doc 61 claims "event inventory expansion (20 events)"; inventory says "3 MVP active + 11 deferred." No two docs agree.
8. **Doc 62's title overstates**: "Load and Resilience Validation Report" performed **zero load testing** (static source analysis only, per its own Overview) — yet downstream summaries cite it as load validation.
9. **"LAUNCH WITH CAUTION" vs gate GO verdicts**: docs 39/50 show clean 12/12 and 9/9 GO gates, while the actual execution verdict (doc 54) is LAUNCH WITH CAUTION and the comprehensive final gate (doc 64) was never run — the strongest-sounding gate result (12/12 GO) predates the weakest conclusion.
10. **Phase 18 uncommitted-work discovery** (doc 54): Phases 15–17 docs were marked "Final" with verified evidence while the underlying code was not yet committed or deployed — documentation claimed done states ahead of production reality.
11. **Re-engagement email**: doc 57 defers it to month 2+, but doc 60 (Phase 20) ships a "Motivation Nudge Engine" with day 1/3/7/14/30 cadence — functionally overlapping; no doc reconciles whether Gap 3 is now closed.
12. **CLAUDE.md drift**: PROJECT-STATUS-INVENTORY §17 and PROJECT-RESTRUCTURE-PROPOSAL Problem 7 both document CLAUDE.md as severely outdated (8 tables/5 routes/2 groups); the current checked-in CLAUDE.md (last updated 2026-03-26) now matches the inventory — but still carries the stale "743+ tests" figure (see #4) and the "knowledge graph behind feature flag" framing (see #1).
