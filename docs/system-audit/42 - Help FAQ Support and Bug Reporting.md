---
date: 2026-03-13
type: system-audit
tags: [heydpe, system-audit, phase-16, help, faq, support, bug-reporting]
status: Final
evidence_level: high
---

# 42 — Help, FAQ, Support, and Bug Reporting
**Phase:** 16 | **Date:** 2026-03-13 | **Scope:** Public support infrastructure for beta launch

## Current Support Paths

| Path | Type | Location | Status |
|------|------|----------|--------|
| Help/FAQ page | Public self-service | `/help` | NEW — created in Phase 16 |
| In-session report button | In-app | Practice page examiner messages | EXISTS |
| Settings feedback form | In-app | `/settings` → Feedback section | EXISTS |
| Email support | External | `support@heydpe.com` | EXISTS (Resend inbound webhook) |
| Email feedback | External | `feedback@heydpe.com` | EXISTS (Resend inbound webhook) |
| Admin ticket panel | Admin | `/admin/support` | EXISTS |

## Help/FAQ Page Content (`/help`)

Created in Phase 16 with 12 FAQ entries covering:

| # | Topic | Category |
|---|-------|----------|
| 1 | What is HeyDPE? | About |
| 2 | Who is HeyDPE for? | About |
| 3 | What ratings are supported? | Features |
| 4 | What study modes are available? | Features |
| 5 | How do examiner profiles work? | Features |
| 6 | How are my answers assessed? | Features |
| 7 | How do results and weak areas work? | Features |
| 8 | Is this a substitute for CFI instruction? | Disclaimer |
| 9 | What does the free trial include? | Billing |
| 10 | How much does HeyDPE cost? | Billing |
| 11 | How do I manage my subscription? | Billing |
| 12 | Does voice mode work in all browsers? | Technical |

Plus:
- "Something Not Working?" section with report button, feedback form, and email paths
- Educational Use & Limitations disclaimer
- Quick links to Privacy, Terms, Pricing, Contact

## Bug Reporting Flow

1. **During exam** — Report button on each examiner message → Report modal (FACTUAL ERROR, SCORING ERROR, SAFETY CONCERN, CONTENT ERROR) → Submitted to `/api/report` → Stored in `moderation_queue` table
2. **Outside exam** — Settings → Feedback section → Bug report/content error form → Submitted to support system
3. **Email** — User emails `support@heydpe.com` → Resend inbound webhook → `support_tickets` table → Admin panel

## Support Ticket System

| Component | Status | Evidence |
|-----------|--------|----------|
| `support_tickets` table | EXISTS | Inbound emails create tickets with from_email, subject, body, status, priority |
| `ticket_replies` table | EXISTS | Admin replies threaded with In-Reply-To headers |
| Admin panel (`/admin/support`) | EXISTS | Ticket list with status filters, reply form, priority management |
| Inbound email webhook | EXISTS | `/api/webhooks/resend-inbound` with Svix signature verification |
| Email routing | EXISTS | `support@` → ticket, `feedback@` → feedback ticket, other → forward |
| Ticket auto-reply | MISSING | No auto-acknowledgment email to user when ticket created |

## Remaining Items

| Item | Severity | Status |
|------|----------|--------|
| Auto-reply to support emails | REVIEW | User gets no acknowledgment that ticket was received |
| Ticket number in response | REVIEW | No way for users to reference their ticket |
| SLA/response time expectation | REVIEW | Help page says "24 hours" — needs operational commitment |
| Live chat | NOT IMPLEMENTED | Email-based support only; acceptable for beta |

## Verdict
**GO for beta** — Public help page exists, multiple support paths available, admin ticket system functional. Auto-reply recommended before public launch.
