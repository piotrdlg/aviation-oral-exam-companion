# Instructor Public Launch Audit

## Context

Phase 9 audit of the Instructor Partnership subsystem against the PRD and implementation docs (Phases 1–8). Goal: determine if the instructor program is publicly launch-ready.

Baseline: branch `instructor-phase9-public-launch-closure` at `7e38d6b`, 50 test files, 1129 tests, 0 type errors.

## PRD Completeness Matrix

### MUST-HAVE Items

| # | PRD Requirement | Phase | Verdict | Evidence |
|---|----------------|-------|---------|----------|
| M1 | Instructor activation (apply via Settings) | P1 | PASS | Settings UI, POST /api/user/instructor, state machine in instructor-access.ts |
| M2 | Admin approval/reject/suspend/reinstate | P1 | PASS | POST /api/admin/instructors/[id], admin page, audit logging |
| M3 | FAA verification (auto + manual paths) | P2 | PASS | instructor-verification.ts, computeVerificationResult(), 4 confidence levels |
| M4 | Instructor-initiated invite (link) | P2 | PASS | instructor-invites.ts, /api/user/instructor/invites, /invite/[token] claim page |
| M5 | Student-initiated connection request | P3 | PASS | /api/user/instructor/search, /api/user/instructor/connections (request_connection), Settings UI search form |
| M6 | Instructor approve/reject student request | P3 | PASS | /api/instructor/connections (approve, reject actions) |
| M7 | Bidirectional disconnect | P3 | PASS | Student: disconnect via /api/user/instructor/connections; Instructor: disconnect via /api/instructor/connections |
| M8 | One-instructor-at-a-time policy | P3/P6 | PASS | Enforced in referral claim (409), connection request guards, instructor-connections.ts |
| M9 | Command Center (student list, KPIs) | P3 | PASS | /instructor page, KPI row, student list, pending tab, invites tab |
| M10 | Student progress summary | P3 | PASS | /instructor/students/[id], readiness score, area breakdown, weak elements, recent sessions |
| M11 | Student milestones | P5 | PASS | student_milestones table, API endpoints, Settings UI, instructor-editable |
| M12 | Instructor insights (deterministic) | P5 | PASS | instructor-insights.ts, readiness/trend/coverage/weak/strong/gaps/recommendations |
| M13 | Weekly instructor summary email | P5 | PASS | instructor-weekly-summary.tsx, send-instructor-weekly.ts, cadence guard, opt-out |
| M14 | Courtesy access (paid student → free tier) | P4 | PASS | instructor-entitlements.ts, resolveInstructorEntitlements(), tier-lookup.ts integration |
| M15 | Courtesy never downgrades tier | P4 | PASS | tier-lookup.ts: MAX(base, courtesy), verified in tests |
| M16 | Trialing excluded from paid by default | P7 | PASS | PAID_ACTIVE_STATUSES = ['active'], system config override available |
| M17 | Admin override for courtesy access | P4 | PASS | instructor_access_overrides table, /api/admin/user-overrides endpoints |
| M18 | Referral codes + landing pages | P6 | PASS | instructor-identity.ts, /ref/[code], /instructor/[slug], auto-connect on claim |
| M19 | QR code generation | P7 | PASS | /api/public/qr/referral/[code], PNG output, amber on transparent |
| M20 | Email invite sending | P7 | PASS | /api/instructor/invites/email, instructor-invite.tsx template, Resend integration |
| M21 | Rate limiting (invites) | P7 | PASS | instructor-rate-limiter.ts, DB-backed sliding window, 20 email/50 token per day |
| M22 | Self-referral blocked | P7 | PASS | /api/referral/claim returns 400 if user === instructor |
| M23 | Privacy: no cert number in public/student APIs | P3/P6 | PASS | Search returns only name+certType; referral lookup excludes cert_number |
| M24 | Privacy: no student email in instructor APIs | P3 | PASS | Student detail returns display_name, progress, sessions only |
| M25 | Privacy: no transcript leakage | P3 | PASS | instructor-student-summary.ts never returns raw transcripts/RAG chunks |
| M26 | Feature flag gating | P1 | PASS | instructor_partnership_v1 checked in Settings, API routes, referral routes |
| M27 | Connection source attribution | P6 | PASS | connection_source column: referral_link, invite_link, student_search, admin |
| M28 | Admin visibility (program metrics) | P3 | PASS | /api/admin/quality/instructor-program, /api/admin/partnership/* endpoints |
| M29 | Abuse monitoring (fraud signals) | P8 | PASS | instructor-fraud-signals.ts, /api/admin/partnership/fraud, 6 weighted signals |
| M30 | KPI contract | P8 | PASS | instructor-kpis.ts, InstructorKpiV1, 6 pure functions |
| M31 | Quota system | P8 | PASS | instructor-quotas.ts, 4-level precedence, adaptive tiers behind flag |
| M32 | FAA data freshness/refreshability | P2 | PARTIAL | Import script exists but no automated freshness check or staleness warning |

### NICE-TO-HAVE / Deferred

| # | Item | Status | Notes |
|---|------|--------|-------|
| N1 | Instructor-authored study plans | Not started | PRD Phase 5+ |
| N2 | Student satisfaction signals | Not started | Phase 9 candidate |
| N3 | Automated entitlement correction | Not started | Self-healing courtesy drift |
| N4 | Instructor analytics deep-dive | Not started | Time-series KPI trends |
| N5 | PostHog dashboard provisioning | Spec only | Doc 15 has spec, not provisioned |
| N6 | Instructor onboarding wizard | Not started | Guided setup flow |

### NOT IN SCOPE

| # | Item | Reason |
|---|------|--------|
| X1 | ATP rating tasks | Different rating, different sprint |
| X2 | External FAA API integration | PRD explicitly deferred |
| X3 | Instructor-authored questions | PRD: "teaching partner, not replacement" |
| X4 | Stripe integration for entitlements | Uses existing subscription_status |

## Audit Results Summary

- **PASS**: 31 of 32 MUST-HAVE items
- **PARTIAL**: 1 item (M32 — FAA data freshness)
- **FAIL**: 0 items

## M32 Gap Analysis: FAA Data Freshness

### Current State
- `scripts/instructor/import-faa-airmen.ts` imports FAA CSV data into `faa_airmen` + `faa_airmen_certs`
- `faa_import_log` table records each import with `source_date`, `completed_at`, status
- `instructor-verification.ts` checks if ANY completed import exists but does NOT check data age
- No admin-visible staleness warning
- No automated freshness check or cron documentation

### Fix Required (This Sprint)
1. Create `scripts/eval/instructor-faa-freshness.ts` — deterministic audit checking import age
2. Document FAA verification operations and freshness in doc 17
3. Add freshness metadata to admin quality endpoint

## Fixes Implemented in This Sprint

| Fix | Description | Files |
|-----|-------------|-------|
| FAA freshness audit script | Deterministic 8-check offline audit for FAA data age | `scripts/eval/instructor-faa-freshness.ts` |
| FAA operations doc | Operational runbook for FAA data management | Doc 17 |
| Launch gate script | 12+ check gate evaluation | `scripts/eval/instructor-public-launch-gate.ts` |

## Evidence

All evidence saved under:
```
docs/instructor-program/evidence/2026-03-06-phase9/
```
