---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, monitoring, synthetic, alerting, phase-21]
status: final
evidence_level: high
---

# 63 — Alerting and Synthetic Monitoring Spec

**Phase:** 21 — Observability, Alerting, and Load/Resilience Gate
**Date:** 2026-03-04
**Script:** `scripts/smoke/phase21-synthetic.ts`
**Command:** `npm run smoke:phase21`

---

## Overview

The synthetic monitoring script performs 12 offline checks across 5 categories to validate that observability infrastructure is present and correctly configured. All checks are file-content only — no network, database, or deployed environment access required.

---

## Results: 12 Checks

| # | Category | Check | Verdict | Detail |
|---|----------|-------|---------|--------|
| 1 | Health & Monitoring | `health_endpoint_exists` | PASS | `src/app/api/health/route.ts` exists and exports GET handler |
| 2 | Health & Monitoring | `posthog_server_configured` | PASS | `src/lib/posthog-server.ts` exports `captureServerEvent` |
| 3 | Health & Monitoring | `posthog_client_configured` | PASS | PostHogProvider component exists and is used in app layout |
| 4 | Cron Job Reliability | `cron_daily_digest_exists` | PASS | Route exists with GET handler and CRON_SECRET auth |
| 5 | Cron Job Reliability | `cron_nudges_exists` | PASS | Route exists with GET handler and CRON_SECRET auth |
| 6 | Cron Job Reliability | `vercel_cron_config` | PASS | `vercel.json` has both cron entries with valid schedules |
| 7 | Admin Monitoring | `admin_quality_endpoints` | PASS | Multiple quality endpoints under `src/app/api/admin/quality/` |
| 8 | Admin Monitoring | `admin_auth_guard` | PASS | All admin endpoints use `requireAdmin` from `@/lib/admin-guard` |
| 9 | Email Infrastructure | `email_logging_exists` | PASS | `src/lib/email-logging.ts` exports `logEmailSent` |
| 10 | Email Infrastructure | `email_templates_exist` | PASS | Multiple email templates in `src/emails/` |
| 11 | Email Infrastructure | `unsubscribe_system` | PASS | Token generation and verification functions present |
| 12 | Error Handling | `error_boundaries_exist` | PASS | Both `error.tsx` and `not-found.tsx` exist |

**Overall: 12/12 PASS**

---

## Monitoring Categories

### 1. Health & Monitoring Infrastructure
Validates that the application has a health endpoint for uptime monitoring and that PostHog analytics is configured on both server and client sides. These are prerequisites for any dashboard or alerting system.

### 2. Cron Job Reliability
Validates that cron route handlers exist, are protected by `CRON_SECRET` authentication, and are registered in `vercel.json` with valid 5-field cron schedules. Silent cron failures are one of the most common operational blind spots.

### 3. Admin Monitoring Endpoints
Validates that admin quality endpoints exist for operational debugging and that all admin routes are protected by the `requireAdmin` authorization guard. Unguarded admin endpoints are a security risk.

### 4. Email Infrastructure
Validates that the email sending pipeline has logging (`logEmailSent`), sufficient templates, and a compliant unsubscribe system. Email deliverability issues are invisible without logging.

### 5. Error Handling
Validates that the application has global error boundaries (`error.tsx`, `not-found.tsx`) so that unhandled errors produce user-friendly pages rather than raw stack traces.

---

## How to Run

```bash
npm run smoke:phase21
```

Evidence files are written to `docs/system-audit/evidence/2026-03-04-phase21/commands/phase21-synthetic.{json,txt}`.

---

## Related Documents

- [[61 - Observability Alerting and Resilience Gate]] — Phase 21 synthesis document
- [[49 - Support Alerts and Incident Runbook]] — Operational runbook that references these monitoring capabilities
