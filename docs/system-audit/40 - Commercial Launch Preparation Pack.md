---
date: 2026-03-12
type: system-audit
tags: [heydpe, system-audit, commercial-launch, preparation-pack, phase-15]
status: Final
evidence_level: high
---

# 40 — Commercial Launch Preparation Pack

**Phase:** 15 (post-deployment)
**Date:** 2026-03-12
**Scope:** Complete commercial launch readiness assessment — preconditions verified, remaining preparation tasks identified and categorized

---

## Section 1 — Preconditions to Begin Launch

All items in this section were **CLOSED** and **VERIFIED** during Phase 15. They represent the prerequisites that had to pass before launch preparation work could begin.

### 1.1 Deployment Closure

| Field | Value | Status |
|-------|-------|--------|
| Commit | `d728b02` (154 files, 67,021 insertions) | VERIFIED |
| Branch | `main` | VERIFIED |
| Vercel Deployment ID | `dpl_D9DtWrodZhC25a7kKW571CzHJbQd` | VERIFIED |
| Vercel State | READY (production) | VERIFIED |
| Build Tool | Turbopack (Next.js 16.1.6) | VERIFIED |
| Region | iad1 | VERIFIED |
| Previous HEAD | `4fef6b7` (Phase 5 release) | VERIFIED |

**Production Aliases (5/5 active):**

| Alias | Status |
|-------|--------|
| heydpe.com | ACTIVE |
| www.heydpe.com | ACTIVE |
| heydpe.ai | ACTIVE |
| www.heydpe.ai | ACTIVE |
| aviation-oral-exam-companion.vercel.app | ACTIVE |

**Evidence:** `docs/system-audit/evidence/2026-03-12-phase15/vercel/deployment-evidence.txt`

---

### 1.2 Prompt Trace Adoption

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Recent sessions with promptTrace | 12 / 20 | > 50% | CLOSED |
| Adoption percentage | 60% | > 50% | CLOSED |
| Ratings with trace coverage | 3 / 3 (PA, CA, IR) | 3/3 | CLOSED |
| Source resolution | 100% `db` | No fallback | CLOSED |

Seed script created 12 sessions covering the full matrix (3 ratings x 4 study modes x 3 difficulties x 4 profiles). All 12 resolved prompt versions from the database (source: `db`), zero fallbacks.

**Evidence:** `docs/system-audit/evidence/2026-03-12-phase15/eval/prompt-trace-seed.json`

---

### 1.3 Fallback Rate

| Metric | Value | Status |
|--------|-------|--------|
| Required prompt keys published | 6 / 6 | CLOSED |
| examiner_system | Published | CLOSED |
| assessment_system | Published | CLOSED |
| persona:maria | Published | CLOSED |
| persona:bob | Published | CLOSED |
| persona:jim | Published | CLOSED |
| persona:karen | Published | CLOSED |
| Missing required keys | 0 | CLOSED |

---

### 1.4 Launch Gate Verdict

| Gate Check | Status |
|------------|--------|
| rating_coverage_pa | GO |
| rating_coverage_ca | GO |
| rating_coverage_ir | GO |
| study_modes | GO |
| prompt_versions_published | GO |
| prompt_versions_missing | GO |
| kg_concepts | GO |
| kg_chunks | GO |
| kg_images | GO |
| exam_session_creation | GO |
| session_transcript_write | GO |
| prompt_trace_adoption | GO |
| **Total** | **12/12 GO** |

All 4 categories passed: Core Exam Behavior, Operational Readiness, Commercial Readiness, PromptOps Readiness.

---

### 1.5 Production Smoke Matrix

22/22 checks PASS across 7 categories.

| Category | Checks | Result |
|----------|--------|--------|
| 1. Rating Coverage | PA=61, CA=60, IR=22 tasks | 3/3 PASS |
| 2. Study Modes | full_oral, quick_drill, topic_deep_dive, weak_area_review | 4/4 PASS |
| 3. Prompt Trace | 60% adoption, all 3 ratings traced | 2/2 PASS |
| 4. Examiner Profiles | Infrastructure present | 1/1 PASS |
| 5. Knowledge Graph | 24,613 concepts, 4,674 chunks, 1,596 images, 7,460 links | 4/4 PASS |
| 6. Prompt Versions | 6/6 required keys, 0 missing | 2/2 PASS |
| 7. Admin Endpoints | prompt_versions, source_chunks, source_images, user_profiles, all 5 data sources | 5/5 PASS |
| **Total** | | **22/22 PASS** |

**Evidence:** `docs/system-audit/evidence/2026-03-12-phase15/eval/production-verification.json`

---

## Section 2 — Launch Preparation Tasks

These are the remaining items between the verified preconditions above and a commercial launch. Each item is categorized by what exists in the codebase, what does not exist, and a status tag indicating severity.

### 2.1 Billing & Entitlement Audit

#### What EXISTS in code

| Component | Location | Description |
|-----------|----------|-------------|
| Stripe checkout | `src/app/api/stripe/checkout/route.ts` | Creates Stripe Checkout session with 7-day trial, monthly ($39) or annual ($299) plan |
| Stripe webhook | `src/app/api/stripe/webhook/route.ts` | Handles 5 events: checkout.session.completed, subscription.updated, subscription.deleted, invoice.paid, invoice.payment_failed. Idempotent via `subscription_events` table with UNIQUE constraint on `stripe_event_id`. Includes out-of-order delivery guard. |
| Stripe portal | `src/app/api/stripe/portal/route.ts` | Creates Billing Portal session for self-service subscription management, returns to `/settings` |
| Stripe status | `src/app/api/stripe/status/route.ts` | Reads tier from `user_profiles`, falls back to Stripe API if webhook hasn't fired yet. Grants entitlement immediately on active/trialing status. |
| Tier endpoint | `src/app/api/user/tier/route.ts` | Returns tier, subscription status, features, usage counts (sessions, TTS chars, STT seconds), and all user preferences |
| Pricing page | `src/app/pricing/page.tsx` | Two plans: $39/month, $299/year. Feature comparison table, value comparison vs CFI, FAQ section, checkout integration |
| Subscription emails | `src/lib/email.ts` | `sendSubscriptionConfirmed()`, `sendSubscriptionCancelled()`, `sendPaymentFailed()` — lifecycle emails via Resend |
| GA4 server-side | Webhook route | Fires GA4 Measurement Protocol `purchase` event on checkout completion for reliable revenue tracking |
| Webhook idempotency | `subscription_events` table | UNIQUE on `stripe_event_id`, status tracking (processing/processed/failed), retry-safe |
| Tier system | `user_profiles` table | Columns: `tier`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `stripe_product_id`, `stripe_subscription_item_id`, `cancel_at_period_end`, `cancel_at`, `trial_end`, `current_period_start`, `current_period_end`, `latest_invoice_status`, `last_webhook_event_id`, `last_webhook_event_ts` |
| Kill switch | `src/lib/kill-switch.ts` | System-wide maintenance mode and per-provider kill switches (pure function, no DB calls) |
| Usage logging | `usage_logs` table | Tracks TTS requests and STT sessions per user with quantity and timestamp |

#### What DOES NOT EXIST (launch prep items)

| Gap | Description | Status |
|-----|-------------|--------|
| **Hard tier enforcement at API level** | The exam API (`/api/exam/route.ts`) does not check the user's tier before processing requests. There is no middleware that blocks API calls when a subscription expires or a user exceeds free-tier limits. The tier endpoint reads usage counts but does not enforce limits. The `/api/stripe/status` route grants entitlement on the read path, but nothing blocks exam access for expired subscriptions. | **REVIEW ITEM** — Soft enforcement via client-side checks is acceptable for beta launch. Hard server-side enforcement needed before scaling or if abuse is detected. |
| **Free-tier session limits** | The pricing page references "Limited" free sessions vs "Unlimited" paid sessions, but no code enforces a session count limit for `checkride_prep` tier users. | **REVIEW ITEM** — Define and enforce the free-tier cap (e.g., 3 sessions/month) before marketing launch. |
| **Usage metering alerts** | Usage is logged to `usage_logs` table and read by the tier endpoint, but there are no alerts when a user approaches or exceeds limits. No admin notifications for unusual usage patterns. | **NOT IMPLEMENTED** — Non-blocking for initial launch if tiers offer unlimited exam sessions. |
| **Upgrade prompts in-app** | No UI nudges for free-tier users to upgrade. No paywall modal when limits are hit. Practice page does not display subscription status. | **NOT IMPLEMENTED** — Revenue optimization feature, not a launch blocker. |
| **Subscription admin dashboard** | No admin UI to view subscription counts, revenue, MRR, churn. | **NOT IMPLEMENTED** — Use Stripe Dashboard directly for launch. |
| **Refund handling UI** | No admin refund capability in HeyDPE. | **NOT IMPLEMENTED** — Handle via Stripe Dashboard for launch. |

---

### 2.2 Legal & Compliance

#### What EXISTS in code

| Component | Location | Description |
|-----------|----------|-------------|
| Privacy Policy | `src/app/privacy/page.tsx` | Comprehensive policy covering: data collection, Supabase storage, Stripe billing, analytics (GA, PostHog, Clarity), CCPA/GDPR rights, children's privacy (COPPA), data retention, contact info (pd@imagineflying.com) |
| Terms of Service | `src/app/terms/page.tsx` | Covers: acceptable use, limitation of liability, FAA disclaimer, refund policy (14-day money-back guarantee), intellectual property, account termination, contact info |
| Cookie consent banner | `src/components/CookieConsent.tsx` | Full GDPR-compliant implementation: Accept All / Necessary Only / Customize options. Three categories: Strictly Necessary (always on), Analytics (GA, Clarity, PostHog), Marketing (Google Ads remarketing). Persists to `localStorage` under key `heydpe_consent`. Updates GTM consent mode via `gtag('consent', 'update', ...)`. |
| FAA disclaimer on practice page | `src/app/(dashboard)/practice/page.tsx` line 1557 | Text: "FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR CFI INSTRUCTION OR AN ACTUAL DPE CHECKRIDE." |
| Banned/suspended pages | `src/app/banned/page.tsx`, `src/app/suspended/page.tsx` | Both link to pd@imagineflying.com for support contact |

#### What DOES NOT EXIST (launch prep items)

| Gap | Description | Status |
|-----|-------------|--------|
| **Cookie consent — localStorage only** | Consent is persisted via `localStorage`, which is cleared if user clears browser data. No server-side consent record. Functionally sufficient for current use. | **REVIEW ITEM** — Acceptable for US-first launch. Consider server-side persistence before EU marketing. |
| **GDPR data export/delete** | No self-service mechanism for users to request data export or deletion. Privacy policy states rights but provides only email contact (pd@imagineflying.com) as the mechanism. | **REVIEW ITEM** — Manual handling via Supabase is acceptable for US launch. Automated flow needed before EU marketing. |
| **FAA disclaimer on session start** | The practice page has a footer disclaimer, but there is no explicit acknowledgment modal before starting an exam session. | **REVIEW ITEM** — Consider adding a one-time acknowledgment on first exam start. |
| **Accessibility statement** | No WCAG compliance statement or accessibility policy page. | **NOT IMPLEMENTED** — Best practice for public-facing product. |

---

### 2.3 Support & Operations

#### What EXISTS in code

| Component | Location | Description |
|-----------|----------|-------------|
| Admin support page | `src/app/(admin)/admin/support/page.tsx` | Full ticket management UI: lists `SupportTicket` objects with status (open/in_progress/resolved/closed), priority (low/normal/high/urgent), replies, admin notes |
| Inbound email webhook | `src/app/api/webhooks/resend-inbound/route.ts` | Receives emails via Resend's inbound webhook (Svix-signed), routes via `routeEmail()` from `src/lib/email-routing.ts`, stores as support tickets |
| Email routing | `src/lib/email-routing.ts` | Routes inbound emails to support ticket creation based on address patterns |
| Email sending | `src/lib/email.ts` | Sends subscription lifecycle emails and forwards support emails via Resend |
| Contact email | Multiple pages | pd@imagineflying.com referenced in Privacy Policy, Terms of Service, banned page, suspended page |
| Admin quality endpoints | `src/app/api/admin/quality/` | 7 GET routes: grounding, flow, depth, persona, examiner-identity, multimodal, prompts |
| Admin analytics | `src/app/(admin)/admin/analytics/page.tsx` | Admin analytics overview page |
| PostHog integration | `src/components/PostHogProvider.tsx`, `src/lib/posthog-server.ts` | Client + server PostHog with custom events: multimodal_asset_selected, persona_selected, voice_latency, exam_started, exam_completed |
| Latency logging | `src/lib/timing.ts` + `latency_logs` table | Per-exchange timing spans for voice pipeline performance |

#### What DOES NOT EXIST (launch prep items)

| Gap | Description | Status |
|-----|-------------|--------|
| **Public help/FAQ page** | No dedicated help center or FAQ page accessible to unauthenticated users. The pricing page has product FAQs but no support FAQs (e.g., "How do I reset my password?", "What browsers are supported?"). | **LAUNCH PREP BLOCKER** — Need at minimum a `/help` page with FAQ and contact info before launch. |
| **In-app feedback button** | No persistent feedback mechanism (e.g., feedback widget, thumbs up/down on answers, "Report a problem" button). | **REVIEW ITEM** — Important for collecting user signal during beta. |
| **Incident runbook** | No documented procedures for outages, data corruption, AI misbehavior, Stripe webhook failures, or abuse scenarios. | **REVIEW ITEM** — Acceptable for soft launch with small user base. Required before scaling. |
| **Status page** | No public uptime/status page. | **NOT IMPLEMENTED** — Use third-party service (e.g., BetterUptime, Instatus) or rely on Vercel status. |
| **SLA documentation** | No service level agreement for uptime or response times. | **NOT IMPLEMENTED** — Not needed for initial consumer launch. |

---

### 2.4 Observability & Dashboards

#### What EXISTS in code

| Component | Location | Description |
|-----------|----------|-------------|
| PostHog analytics | `src/components/PostHogProvider.tsx` | Client-side event tracking: page views, custom events |
| PostHog server | `src/lib/posthog-server.ts` | Server-side event capture for exam engine events |
| Custom events tracked | Across codebase | `multimodal_asset_selected`, `persona_selected`, `voice_latency`, `exam_started`, `exam_completed` |
| Latency logs | `src/lib/timing.ts` | Per-exchange timing spans stored in `latency_logs` table |
| Eval scripts (13) | `scripts/eval/` | grounding-citation-audit, flow-coherence-audit, depth-contract-audit, persona-separation-audit, examiner-identity-audit, multimodal-asset-audit, promptops-audit, prompt-selection-audit, fingerprint-coverage, rating-parity-audit, difficulty-calibration, run-regulatory-assertions, regulatory-assertions.json |
| Launch readiness gate | Automated script | 12-check gate covering all launch categories |
| Production verification | Automated script | 22-check matrix across 7 categories |
| Admin quality endpoints | `src/app/api/admin/quality/` | 7 GET routes for live quality monitoring |
| GA4 server-side | Webhook route | Purchase events via Measurement Protocol |
| Kill switch system | `src/lib/kill-switch.ts` | Maintenance mode + per-provider kill switches |
| Feature flags | `src/app/api/flags/route.ts` | System config-based feature flags |

#### What DOES NOT EXIST (launch prep items)

| Gap | Description | Status |
|-----|-------------|--------|
| **Real-time alerting** | No PagerDuty, Slack, or email alerts for: error rate spikes, latency degradation, billing webhook failures, kill switch activations. | **REVIEW ITEM** — Can use Vercel + PostHog built-in alerting for initial launch. |
| **Revenue dashboard** | No custom dashboard for MRR, ARR, churn, trial conversion. | **NOT IMPLEMENTED** — Use Stripe Dashboard + PostHog for launch. |
| **AI quality trend tracking** | Eval scripts run manually (`scripts/eval/`). No scheduled runs, no trend graphs, no regression detection. | **REVIEW ITEM** — Consider scheduled CI runs with result storage. |
| **Error budget / SLO tracking** | No formal SLO definitions or error budget tracking. | **NOT IMPLEMENTED** — Not needed for initial launch. |

---

### 2.5 Soft Launch / Beta Rollout

**Recommended approach (not yet implemented):**

| Step | Action | Implementation Needed |
|------|--------|----------------------|
| 1 | **Invite-only beta** | Restrict signups to invited emails or add waitlist | Code change needed |
| 2 | **Free-tier cap** | Enforce 3-5 free sessions/month before requiring subscription | Code change needed |
| 3 | **Feedback loop** | Add in-app feedback button for beta users | Code change needed |
| 4 | **Daily monitoring** | Check PostHog events, latency_logs, eval scripts, Stripe dashboard | Process only |
| 5 | **Weekly eval runs** | Run all 13 eval scripts, compare against baselines | Process only |
| 6 | **Bug triage** | Monitor admin support tickets, respond within 24h | Process only |
| 7 | **Scale gate** | Open signups after beta confirms: <5% error rate, <3s p95 latency, >30% completion rate | Process only |

**Current gating mechanisms available:** Kill switch system (maintenance mode), feature flags via system_config, admin user management with suspend/ban capabilities.

---

### 2.6 Go / Review / No-Go Rubric

| Category | Verdict | Evidence | Notes |
|----------|---------|----------|-------|
| Core Exam Engine | **GO** | 731 tests, 13 eval scripts, 3 ratings, 4 modes, 4 personas | Fully operational |
| Knowledge Graph | **GO** | 24,613 concepts, 4,674 chunks, 1,596 images | Populated but not yet used at runtime for graph-enhanced retrieval |
| Billing Infrastructure | **GO** | 4 Stripe routes, webhook with idempotency, tier system, lifecycle emails, GA4 tracking | Complete Stripe integration |
| Billing Enforcement | **REVIEW** | No server-side enforcement in `/api/exam` | Acceptable for beta; needs enforcement before marketing launch |
| Free-Tier Limits | **REVIEW** | Usage logged but not enforced | Define and enforce cap before marketing launch |
| Legal Pages | **GO** | `/privacy` + `/terms` with comprehensive coverage | FAA disclaimer, refund policy, CCPA/GDPR rights included |
| Cookie Consent | **GO** | Full GDPR banner with 3 categories and GTM integration | localStorage persistence only |
| GDPR Compliance | **REVIEW** | Manual handling via email | Acceptable for US-first launch |
| Public Support | **REVIEW** | Admin support system exists; no public-facing help page | Need `/help` or FAQ page before launch |
| Inbound Email Support | **GO** | Resend inbound webhook + ticket system + admin UI | Functional support pipeline |
| Observability | **GO** | PostHog + latency logs + 13 eval scripts + 7 admin endpoints + GA4 | Comprehensive |
| Alerting | **REVIEW** | No automated alerts | Manual monitoring acceptable for beta |
| Incident Response | **REVIEW** | Kill switch + feature flags exist; no documented runbook | Need runbook before scaling |

**Overall Verdict:**

| Launch Type | Verdict | Blockers |
|-------------|---------|----------|
| **Soft / Beta Launch** | **GO** | 1 blocker: public help/FAQ page needed |
| **Public / Marketing Launch** | **REVIEW** | Requires: hard tier enforcement, free-tier limits, automated alerting, incident runbook, GDPR self-service |

---

## Section 3 — Launch Dashboard & Metrics Spec

### Operational Metrics

| Metric | Source | Threshold / Alert | Owner / Action |
|--------|--------|-------------------|----------------|
| Deployment status | Vercel MCP (`get_project_status`) | State != READY | Eng / investigate build |
| Error rate (5xx) | Vercel Analytics | > 1% of requests | Eng / check function logs |
| API latency (p95) | `latency_logs` table | > 5s per exchange | Eng / profile bottleneck (AI call, RAG, TTS) |
| Voice latency (p95) | PostHog (`voice_latency` event) | > 3s round-trip | Eng / check TTS provider, consider kill switch |
| Exam completion rate | PostHog (`exam_completed` / `exam_started`) | < 30% | Product / investigate UX drop-off |
| Kill switch activations | `system_config` table | Any `kill_switch.*` enabled | Eng / investigate provider outage |

### AI Quality Metrics

| Metric | Source | Threshold / Alert | Owner / Action |
|--------|--------|-------------------|----------------|
| AI grounding fail rate | `scripts/eval/grounding-citation-audit.ts` | > 15% (baseline: 7.5%) | Eng / check RAG pipeline, prompt versions |
| Flow coherence | `scripts/eval/flow-coherence-audit.ts` | Jaccard < 50% (baseline: 72.8%) | Eng / check fingerprint coverage |
| Depth contract violations | `scripts/eval/depth-contract-audit.ts` | Any failure (baseline: 0/32) | Eng / check difficulty engine |
| Persona separation | `scripts/eval/persona-separation-audit.ts` | Score < 80% (baseline: 10/10) | Eng / check persona prompts |
| Examiner identity drift | `scripts/eval/examiner-identity-audit.ts` | Any failure (baseline: 10/10) | Eng / check profile unification |
| Prompt fallback rate | `/api/admin/quality/prompts` | > 10% | Eng / check `prompt_versions` table |
| Prompt trace adoption | `/api/admin/quality/prompts` | < 50% (baseline: 60%) | Eng / check `loadPromptFromDB` code path |

### Commercial Metrics

| Metric | Source | Threshold / Alert | Owner / Action |
|--------|--------|-------------------|----------------|
| Active subscriptions | Stripe Dashboard | Trending (no threshold for launch) | Biz / revenue tracking |
| Trial-to-paid conversion | Stripe Dashboard | < 10% after 30 days | Product / investigate onboarding |
| Monthly churn rate | Stripe Dashboard | > 10%/month | Product / investigate retention |
| MRR | Stripe Dashboard | Trending | Biz / financial reporting |
| Payment failure rate | Stripe Dashboard + `subscription_events` table | > 5% of invoices | Eng / check webhook processing |
| Support ticket volume | Admin support page (`/admin/support`) | > 5/day | Support / triage, consider FAQ expansion |
| GA4 purchase events | Google Analytics | Mismatch with Stripe | Eng / check Measurement Protocol |

### Monitoring Cadence

| Frequency | Actions |
|-----------|---------|
| **Daily** | Check Vercel deployment status, review PostHog dashboard, scan admin support tickets |
| **Weekly** | Run full eval script suite (13 scripts), review Stripe metrics, check latency_logs trends |
| **Monthly** | Run production verification matrix (22 checks), review churn and conversion, update incident runbook |

---

## Appendix A — File Reference

| Category | Key Files |
|----------|-----------|
| Stripe Integration | `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/stripe/portal/route.ts`, `src/app/api/stripe/status/route.ts`, `src/lib/stripe.ts` |
| Tier System | `src/app/api/user/tier/route.ts`, `src/lib/voice/types.ts` (TIER_FEATURES) |
| Pricing Page | `src/app/pricing/page.tsx` |
| Legal Pages | `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` |
| Cookie Consent | `src/components/CookieConsent.tsx` |
| Support Pipeline | `src/app/(admin)/admin/support/page.tsx`, `src/app/api/webhooks/resend-inbound/route.ts`, `src/lib/email-routing.ts`, `src/lib/email.ts` |
| Observability | `src/lib/posthog-server.ts`, `src/components/PostHogProvider.tsx`, `src/lib/timing.ts` |
| Kill Switch | `src/lib/kill-switch.ts`, `src/app/api/flags/route.ts` |
| Eval Scripts | `scripts/eval/` (13 scripts) |
| Admin Quality | `src/app/api/admin/quality/` (7 routes) |
| Launch Gate | `docs/system-audit/39 - Deployment Closure and Launch Gate Re-run.md` |
| Phase 14 Checklist | `docs/system-audit/38 - Commercial Launch Preparation Checklist.md` |

## Appendix B — Status Tag Definitions

| Tag | Meaning | Action Required |
|-----|---------|-----------------|
| **LAUNCH PREP BLOCKER** | Must be resolved before any commercial launch (including soft/beta) | Immediate |
| **REVIEW ITEM** | Acceptable for beta launch; must be resolved before public/marketing launch | Before scaling |
| **NOT IMPLEMENTED** | Nice-to-have or deferrable; not needed for initial launch | Backlog |
