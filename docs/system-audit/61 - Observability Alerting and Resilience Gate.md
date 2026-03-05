---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, observability, alerting, resilience, phase-21]
status: final
evidence_level: high
---

# 61 — Observability, Alerting, and Resilience Gate

**Phase:** 21 — Observability, Alerting, and Load/Resilience Gate
**Date:** 2026-03-04
**Scope:** Operational readiness sprint adding health monitoring, event inventory expansion, synthetic monitoring, load/resilience validation, cron hardening, and launch gate evolution

---

## Overview

Phase 21 is an operational readiness sprint that establishes the observability and resilience foundations required for confident production operation. Rather than adding user-facing features, this phase instruments the system for monitoring, validates resilience patterns via static analysis, and expands the analytics funnel to cover critical operational events.

The work spans seven deliverables: a health endpoint, expanded event inventory, synthetic monitoring script, load/resilience validation script, cron reliability hardening, a final launch gate script, and npm script registration.

---

## What Was Built

### 1. Health Endpoint

**File:** `src/app/api/health/route.ts`

A lightweight `GET /api/health` endpoint returning JSON with four fields:

| Field | Value | Purpose |
|-------|-------|---------|
| `status` | `"ok"` | Binary alive check |
| `timestamp` | ISO 8601 | Clock sync verification |
| `version` | `process.env.npm_package_version` | Deployed version identification |
| `uptime` | `process.uptime()` | Cold start detection |

The endpoint is intentionally not DB-backed. A health check that depends on the database conflates "is the app running" with "is the database reachable" — two distinct failure modes. External synthetic monitors (Vercel Cron, UptimeRobot, etc.) can poll this endpoint independently and alert separately on application vs. database issues.

### 2. Event Inventory Expansion

**File:** `scripts/audit/launch-funnel-audit.ts`

Four new required funnel events added to the instrumentation audit:

| Event | Description | Tracking Mechanism |
|-------|-------------|-------------------|
| `landing_page_viewed` | Landing page view with UTM attribution | PostHog client |
| `tts_denied_by_tier` | TTS denied due to tier restriction | PostHog server |
| `prompt_fallback` | Examiner prompt fallback to default | PostHog server |
| `health_check` | Health endpoint availability | API route |

Two of these events were also added to the source code as PostHog server-side events:

- `tts_denied_by_tier` in `src/app/api/tts/route.ts` — fires when a user's tier does not grant TTS access or quota is exceeded
- `prompt_fallback` in `src/lib/exam-engine.ts` — fires when `loadPromptFromDB()` falls back to the hardcoded default prompt

The total required funnel event count rose from 16 to 20.

### 3. Synthetic Monitoring Script

**File:** `scripts/smoke/phase21-synthetic.ts`
**Command:** `npm run smoke:phase21`

A 12-check offline validation script across 5 categories:

| Category | Checks | What It Validates |
|----------|--------|-------------------|
| Health & Monitoring Infrastructure | 3 | Health endpoint exists, PostHog server configured, PostHog client provider in layout |
| Cron Job Reliability | 3 | Daily digest cron exists with CRON_SECRET, nudges cron exists with CRON_SECRET, vercel.json has both cron entries |
| Admin Monitoring Endpoints | 2 | >= 3 quality endpoints exist, all admin endpoints use `requireAdmin` guard |
| Email Infrastructure | 3 | Email logging module exists, >= 5 email templates, unsubscribe token system present |
| Error Handling | 1 | Global error boundary and 404 page exist |

All checks are file-content only — no network or database access required. The script writes evidence to `docs/system-audit/evidence/2026-03-04-phase21/commands/phase21-synthetic.{json,txt}`.

**Result:** 12/12 PASS

### 4. Load and Resilience Validation Script

**File:** `scripts/load/phase21-load-check.ts`
**Command:** `npm run audit:load-check`

A 14-check static analysis script across 6 categories:

| Category | Checks | What It Validates |
|----------|--------|-------------------|
| API Route Timeouts | 3 | Exam route has `maxDuration`, TTS route has `maxDuration`, cron routes have `maxDuration` |
| Rate Limiting | 2 | Middleware uses rate limiting, critical API routes are covered |
| Connection Handling | 3 | Supabase service client is singleton, PostHog client is singleton, Anthropic client is singleton |
| Error Resilience | 3 | Global error boundary exists, API routes have try/catch, cron routes have try/catch + stats |
| Caching | 2 | TTL cache in exam-engine, DB-backed embedding cache in RAG pipeline |
| Deployment | 1 | vercel.json is valid JSON with correct cron entries |

This script performs static analysis only — it does not send actual requests or simulate load. True load testing requires a dedicated tool (k6, Artillery, etc.) and is deferred to a future phase.

**Result:** 13/14 PASS, 1 WARN (TTS route missing `maxDuration`)

### 5. Cron Reliability Hardening

**Files modified:**
- `src/app/api/cron/daily-digest/route.ts`
- `src/app/api/cron/nudges/route.ts`

Both cron routes now include:
- **Start log:** `console.log('[cron:digest] Starting...')` / `console.log('[cron:nudges] Starting...')`
- **Elapsed time tracking:** `const startTime = Date.now()` at entry, with elapsed milliseconds reported in the response

These additions enable log-based monitoring of cron execution in Vercel's function logs. Previously, cron failures were silent — the only signal was the absence of email sends.

### 6. Event Inventory Script Update

**File:** `scripts/audit/launch-funnel-audit.ts`

Beyond the 4 new events, the evidence directory was updated to `2026-03-04-phase21` to keep evidence organized by sprint.

### 7. NPM Scripts

**File:** `package.json`

Three new npm scripts registered (the fourth, `audit:final-gate`, was planned but not yet added):

| Script | Command | Purpose |
|--------|---------|---------|
| `smoke:phase21` | `tsx scripts/smoke/phase21-synthetic.ts` | Run synthetic monitoring checks |
| `audit:load-check` | `tsx scripts/load/phase21-load-check.ts` | Run load/resilience validation |
| `audit:event-inventory` | `tsx scripts/audit/launch-funnel-audit.ts` | Run launch funnel instrumentation audit |

---

## Evidence Summary

| Metric | Result |
|--------|--------|
| TypeScript typecheck | 0 errors |
| Unit tests | 756/756 pass |
| Synthetic monitoring | 12/12 PASS |
| Load/resilience validation | 13/14 PASS, 1 WARN |
| Required funnel events | 20 tracked |

---

## File Inventory

### Files Created

| File | Purpose |
|------|---------|
| `src/app/api/health/route.ts` | Health check endpoint |
| `scripts/smoke/phase21-synthetic.ts` | Synthetic monitoring script (12 checks) |
| `scripts/load/phase21-load-check.ts` | Load/resilience validation script (14 checks) |

### Files Modified

| File | Change |
|------|--------|
| `src/app/api/cron/daily-digest/route.ts` | Added start log + elapsed time tracking |
| `src/app/api/cron/nudges/route.ts` | Added start log + elapsed time tracking |
| `src/app/api/tts/route.ts` | Added `tts_denied_by_tier` PostHog server event |
| `src/lib/exam-engine.ts` | Added `prompt_fallback` PostHog server event |
| `scripts/audit/launch-funnel-audit.ts` | Updated evidence directory, added 4 new funnel events |
| `package.json` | Added 3 npm scripts |

---

## Architecture Decisions

### Why the Health Endpoint Is Not DB-Backed

A health check that queries the database conflates application availability with database availability. These are distinct failure modes with different remediation paths. The health endpoint returns process-level data only (`uptime`, `version`). Database health should be monitored separately via Supabase's built-in health dashboard or a dedicated DB probe.

### Why Offline / File-Based Validation

Both the synthetic monitoring and load/resilience scripts operate on file contents only — no network, no database, no deployed environment required. This design choice has three advantages:

1. **CI-safe** — Scripts can run in GitHub Actions without environment secrets
2. **Fast** — No network latency, completes in under 1 second
3. **Deterministic** — Results depend only on source code, not on transient infrastructure state

The trade-off is that these scripts validate *patterns* (e.g., "does the file export `maxDuration`?") rather than *behavior* (e.g., "does the route actually timeout after N seconds?"). Behavioral validation requires integration tests or real load testing.

### Why Static Analysis Instead of Real Load Testing

True load testing (concurrent request simulation, latency percentile measurement, circuit breaker validation) requires infrastructure that is disproportionate to HeyDPE's current scale. The static analysis approach validates that resilience patterns are present in the codebase — a necessary precondition for resilience. Actual load testing with k6 or Artillery is deferred until traffic justifies the investment.

---

## Open Items

| Item | Priority | Notes |
|------|----------|-------|
| TTS route `maxDuration` | Medium | The TTS route lacks an explicit `maxDuration` export. While TTS calls are typically fast, an explicit timeout prevents runaway requests from consuming function execution time |
| Sentry integration | Low | Error tracking is currently limited to `console.error` and PostHog events. Sentry would provide stack traces, breadcrumbs, and alerting for unhandled exceptions |
| Real load testing | Low | Deferred until traffic volume justifies the tooling investment. Consider k6 with Vercel's edge function concurrency model |
| Final gate script | Medium | `scripts/audit/public-launch-final-gate.ts` was planned as a 16-check comprehensive gate but not yet created. The existing `scripts/audit/public-launch-gate.ts` (Phase 17, 9 checks) remains the latest gate script |

---

## Related Documents

- [[50 - Public Launch Gate Re-run]] — Phase 17 launch gate (9 checks), predecessor to the planned final gate
- [[52 - Launch Dashboard and Alert Thresholds]] — Dashboard metrics spec that these monitoring scripts support
- [[37 - PromptOps Hardening and Launch Readiness Gate]] — Phase 14 launch readiness gate (12 checks), the original gate concept
- [[60 - Motivation Nudge Engine]] — Phase 20, immediately prior phase
