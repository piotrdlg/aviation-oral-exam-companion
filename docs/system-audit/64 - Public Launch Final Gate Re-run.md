---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, launch-gate, phase-21]
status: draft
evidence_level: medium
---

# 64 — Public Launch Final Gate Re-run

**Phase:** 21 — Observability, Alerting, and Load/Resilience Gate
**Date:** 2026-03-04
**Planned script:** `scripts/audit/public-launch-final-gate.ts`
**Planned command:** `npm run audit:final-gate`

---

## Overview

Phase 21 planned a 16-check comprehensive final launch gate script that would consolidate and extend the earlier gate scripts. This script was scoped but not yet created. This document records the planned scope and the relationship to earlier gate scripts.

---

## Gate Script Evolution

| Phase | Script | Checks | Focus |
|-------|--------|--------|-------|
| Phase 14 | `scripts/audit/launch-readiness.ts` | 12 | PromptOps governance, test coverage, deployment |
| Phase 17 | `scripts/audit/public-launch-gate.ts` | 9 | Support, security, UX, billing, verification |
| Phase 21 | `scripts/audit/public-launch-final-gate.ts` | 16 (planned) | Comprehensive: all prior categories + observability + resilience |

The Phase 17 gate script (`public-launch-gate.ts`) remains the latest operational gate. It checks 4 categories:

1. **Support & Communications** — Auto-reply, help page, support email
2. **Security & Access Control** — CSP headers, rate limiting, admin guard
3. **UX & Billing** — Pricing CTA, trial reminder, TTS tier gate
4. **Verification** — TypeScript typecheck, unit tests

---

## Planned Final Gate Categories (16 Checks)

The final gate was designed to expand the Phase 17 gate with observability and resilience checks:

| Category | Planned Checks |
|----------|---------------|
| Support & Communications | Auto-reply, help page, support email |
| Security & Access Control | CSP, rate limiting, admin guard |
| UX & Billing | Pricing CTA, trial reminder, TTS tier gate |
| Verification | Typecheck, unit tests |
| Observability | Health endpoint, PostHog server, PostHog client, event inventory |
| Resilience | API timeouts, error boundaries, cron hardening |

---

## Current Status

The final gate script has not been created. The existing observability and resilience checks are available via:

- `npm run smoke:phase21` — 12 synthetic monitoring checks (see [[63 - Alerting and Synthetic Monitoring Spec]])
- `npm run audit:load-check` — 14 load/resilience checks (see [[62 - Load and Resilience Validation Report]])

These two scripts together cover the planned scope of the final gate. A unified script would consolidate them into a single pass/fail gate with a single exit code.

---

## How to Run Existing Gates

```bash
# Phase 17 gate (9 checks, 4 categories)
npx tsx scripts/audit/public-launch-gate.ts

# Phase 21 synthetic monitoring (12 checks, 5 categories)
npm run smoke:phase21

# Phase 21 load/resilience (14 checks, 6 categories)
npm run audit:load-check
```

---

## Related Documents

- [[61 - Observability Alerting and Resilience Gate]] — Phase 21 synthesis document
- [[50 - Public Launch Gate Re-run]] — Phase 17 gate results (9/9 GO)
- [[37 - PromptOps Hardening and Launch Readiness Gate]] — Phase 14 launch readiness gate (12 checks)
