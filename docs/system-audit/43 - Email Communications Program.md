---
date: 2026-03-13
type: system-audit
tags: [heydpe, system-audit, phase-16, email, communications, resend, transactional]
status: Final
evidence_level: high
---

# 43 — Email Communications Program
**Phase:** 16 | **Date:** 2026-03-13 | **Scope:** Email infrastructure audit and launch-ready program plan

## Email Infrastructure

| Component | Provider | Status |
|-----------|----------|--------|
| Transactional email | Resend (v6.9.2) | EXISTS |
| Email templates | React Email (`src/emails/`) | EXISTS (4 templates) |
| Inbound email webhook | Resend + Svix | EXISTS |
| Email routing | `src/lib/email-routing.ts` | EXISTS |
| Test coverage | `src/lib/__tests__/email.test.ts` | EXISTS (40+ tests) |

## Sender Addresses

| Address | Purpose | Status |
|---------|---------|--------|
| `hello@heydpe.com` | Welcome emails | Configured |
| `billing@heydpe.com` | Subscription/payment emails | Configured |
| `support@heydpe.com` | Support replies + inbound | Configured |
| `noreply@heydpe.com` | Email forwarding | Configured |

## Email Scenario Matrix

| # | Scenario | Trigger | Status | Template | Priority |
|---|----------|---------|--------|----------|----------|
| 1 | Sign-up verification | Supabase Auth | EXISTS | Supabase default | N/A |
| 2 | Welcome email | Auth callback (first login) | EXISTS | `welcome.tsx` | Beta |
| 3 | Trial start notification | After signup | MISSING | — | Post-beta |
| 4 | Trial ending soon | 3 days before trial_end | MISSING | — | Public launch |
| 5 | Subscription confirmed | `checkout.session.completed` webhook | EXISTS | `subscription-confirmed.tsx` | Beta |
| 6 | Payment failed | `invoice.payment_failed` webhook | EXISTS | `payment-failed.tsx` | Beta |
| 7 | Subscription cancelled | `customer.subscription.deleted` webhook | EXISTS | `subscription-cancelled.tsx` | Beta |
| 8 | Password reset | Supabase Auth | EXISTS | Supabase default | N/A |
| 9 | Daily/periodic learning summary | Scheduled job | MISSING | — | Post-beta |
| 10 | Re-engagement after inactivity | Scheduled job (30+ days) | MISSING | — | Post-beta |
| 11 | Support ticket auto-reply | Inbound email webhook | MISSING | — | Public launch |
| 12 | Support ticket reply | Admin sends reply | EXISTS | Plain text | Beta |

**Coverage: 7/12 scenarios implemented (58%)**
**Beta-critical scenarios: 7/7 implemented (100%)**

## Email Content Strategy

### Copy Guidelines
- Tone: Professional, warm, aviation-focused (not corporate)
- Personalization: Use display name or "pilot" as fallback
- Branding: Dark theme (gray-950 + amber #f59e0b), consistent header/footer
- Disclaimer: Include "study purposes only" in educational emails
- CTA: Single clear action per email
- Footer: Privacy + Terms links, company info (Imagine Flying LLC, Jacksonville, FL)

### Learning Summary Email (Future — Requires Feature Flag)
- **When**: Weekly (Sunday evening), opt-in only
- **Who**: Users with ≥1 session in past 7 days
- **Content**: Sessions completed, ACS areas covered, weak elements identified, suggested next study focus
- **Data source**: Aggregated from `exam_sessions` + `session_transcripts` with grounded weak-area analysis
- **Guardrails**: Max 1 per week, unsubscribe link required (CAN-SPAM), no AI-generated content in email body (only statistics)

## Error Handling
- All send functions are non-blocking (`void` dispatch)
- Failures logged but never crash the triggering operation
- No retry mechanism for failed sends (emails are lost on Resend API failure)
- No dead letter queue

## Recommended Priority Order

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Verify Resend domain (SPF/DKIM/DMARC) | 15 min | Deliverability |
| 2 | Add support ticket auto-reply | 1-2 hr | User confidence |
| 3 | Add unsubscribe link infrastructure | 2 hr | CAN-SPAM compliance |
| 4 | Implement trial ending soon email | 4 hr | Conversion |
| 5 | Build email preference center | 8-16 hr | User control |
| 6 | Implement weekly learning digest | 8-12 hr | Engagement |
| 7 | Add email monitoring/alerting | 4 hr | Reliability |

## Verdict
**GO for beta** — All beta-critical email scenarios implemented. Missing scenarios (trial reminders, digest, re-engagement) are post-beta priorities.
