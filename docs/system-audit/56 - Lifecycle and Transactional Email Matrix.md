---
date: 2026-03-16
type: system-audit
tags: [heydpe, system-audit, email, matrix, lifecycle]
status: final
evidence_level: high
---

# 56 — Lifecycle and Transactional Email Matrix

**Phase:** 19 — Email System Review + Sample Send Pack
**Date:** 2026-03-16
**Scope:** Complete inventory of all email scenarios — implemented, partially implemented, and missing

---

## Email Architecture

- **Provider:** Resend (v6.9.2)
- **Templates:** React Email components in `src/emails/` (6 templates + 1 shared layout)
- **Send functions:** 8 exports in `src/lib/email.ts`
- **Sender addresses:** 4 (hello@, billing@, support@, noreply@heydpe.com)
- **Error handling:** Non-blocking (void dispatch, never throws except sendTicketReply which returns null)
- **Retry:** Resend auto-retry 3x with exponential backoff
- **Tests:** 57 tests across email.test.ts + email-routing.test.ts

---

## Complete Scenario Matrix

| # | Scenario | Trigger | Audience | Implemented | Template File | Sender | Send Function | Required Data | Safe to Sample? | Notes |
|---|----------|---------|----------|-------------|---------------|--------|---------------|---------------|-----------------|-------|
| 1 | Welcome | Auth callback (new user first login) | New users | YES | `src/emails/welcome.tsx` | hello@heydpe.com | `sendWelcomeEmail(to, name?)` | `to: string`, `name?: string` | YES | Void dispatch, never throws. Includes CTA to /practice and pricing mention (3 free sessions, $39/month). |
| 2 | Subscription Confirmed | Stripe `checkout.session.completed` webhook | Paying users | YES | `src/emails/subscription-confirmed.tsx` | billing@heydpe.com | `sendSubscriptionConfirmed(to, plan)` | `to: string`, `plan: 'monthly' \| 'annual'` | YES | Shows plan details (Monthly $39/month or Annual $299/year). CTA to /practice. |
| 3 | Subscription Cancelled | Stripe `customer.subscription.deleted` webhook | Churned users | YES | `src/emails/subscription-cancelled.tsx` | billing@heydpe.com | `sendSubscriptionCancelled(to)` | `to: string` | YES | No props needed. Mentions continued access until billing period end. CTA to /pricing. Asks for cancellation feedback. |
| 4 | Payment Failed | Stripe `invoice.payment_failed` webhook | Users with failed payment | YES | `src/emails/payment-failed.tsx` | billing@heydpe.com | `sendPaymentFailed(to)` | `to: string` | YES | No props needed. Warning box about 7-day window. CTA to /settings for billing update. |
| 5 | Trial Ending Reminder | Cron script `scripts/email/send-trial-ending-reminders.ts` | Users in trial period | YES | `src/emails/trial-ending.tsx` | billing@heydpe.com | `sendTrialEndingReminder(to, daysLeft, plan, name?)` | `to: string`, `daysLeft: number`, `plan: 'monthly' \| 'annual'`, `name?: string` | YES | Dynamic subject line with days remaining. Explains auto-conversion and how to cancel. |
| 6 | Support Ticket Auto-Reply | Inbound email webhook (Resend + Svix) | Users who email support@ | YES | `src/emails/ticket-auto-reply.tsx` | support@heydpe.com | `sendTicketAutoReply(to, subject?)` | `to: string`, `subject?: string` | YES | Confirms receipt, promises 24-hour response, links to /help. Only sent when ticket insert succeeds (no duplicates). |
| 7 | Support Ticket Reply | Admin POST /api/admin/support | Users with open tickets | YES | None (plain text) | support@heydpe.com | `sendTicketReply(to, subject, body, inReplyTo?)` | `to: string`, `subject: string`, `body: string`, `inReplyTo?: string` | YES | Sets In-Reply-To and References headers for threading. Returns Resend email ID or null on error. Only function that returns a value. |
| 8 | Email Forward | Inbound email to catch-all (non-support addresses) | Internal (forwarded to EMAIL_FORWARD_TO) | YES | None (passthrough) | noreply@heydpe.com | `forwardEmail(originalFrom, originalTo, subject, text, html?)` | `originalFrom: string`, `originalTo: string`, `subject: string`, `bodyText: string`, `bodyHtml?: string` | YES | Requires `EMAIL_FORWARD_TO` env var. Sets X-Original-From and X-Original-To headers. Falls back to `<pre>` text if no HTML. |
| 9 | Sign-up Verification | Supabase Auth (user signup) | New signups | YES (Supabase) | Supabase default template | Supabase-managed | N/A (Supabase Auth) | Email address | NO | Handled entirely by Supabase Auth. Template customizable only via Supabase dashboard. Links to /auth/callback?code=... |
| 10 | Password Reset | Supabase Auth (forgot password flow) | Existing users | YES (Supabase) | Supabase default template | Supabase-managed | N/A (Supabase Auth) | Email address | NO | Handled entirely by Supabase Auth. Template customizable only via Supabase dashboard. |
| 11 | Trial Start Notification | Not implemented | New trial users | NO | N/A | N/A | N/A | N/A | NO | Would notify user when trial begins with plan details and expiration date. Severity: LOW. Welcome email partially covers this. |
| 12 | Daily/Periodic Learning Summary | Not implemented | Active subscribers | NO | N/A | N/A | N/A | N/A | NO | Weekly digest with ACS coverage stats, weak areas, session counts. Severity: MEDIUM (post-launch). Requires new cron job + template. |
| 13 | Re-engagement (Inactive User) | Not implemented | Users inactive 30+ days | NO | N/A | N/A | N/A | N/A | NO | Target users who haven't started a session in 30+ days. Severity: LOW (post-launch). Requires user activity tracking query. |
| 14 | Bug Report Confirmation | Not implemented | Users who file bug reports | NO | N/A | N/A | N/A | N/A | NO | In-app /api/report writes to moderation_queue but sends no email confirmation to user. Severity: LOW. |
| 15 | Beta/Launch Invite | Not applicable | N/A | NO | N/A | N/A | N/A | N/A | NO | No invite gate exists. Open registration since launch. Not planned. |

---

## Sender Address Registry

| Address | Display Name | Purpose | Used By Functions |
|---------|-------------|---------|-------------------|
| `hello@heydpe.com` | HeyDPE | Welcome and onboarding emails | `sendWelcomeEmail` |
| `billing@heydpe.com` | HeyDPE Billing | Subscription, payment, and trial emails | `sendSubscriptionConfirmed`, `sendSubscriptionCancelled`, `sendPaymentFailed`, `sendTrialEndingReminder` |
| `support@heydpe.com` | HeyDPE Support | Support ticket auto-replies and agent replies | `sendTicketAutoReply`, `sendTicketReply` |
| `noreply@heydpe.com` | HeyDPE | Email forwarding (catch-all passthrough) | `forwardEmail` |

All sender addresses are defined in the `SENDERS` constant at the top of `src/lib/email.ts`. Domain `heydpe.com` must be verified in the Resend dashboard for all addresses to send.

---

## Template Component Registry

| Template File | Export Name | Props | Layout | Key Elements |
|---------------|------------|-------|--------|-------------|
| `src/emails/layout.tsx` | `EmailLayout` | `children: ReactNode`, `preview?: string` | N/A (IS the layout) | HEYDPE logo header, dark theme (#0a0a0a body, #1a1a1a content), footer with Imagine Flying LLC, Privacy Policy + Terms links |
| `src/emails/welcome.tsx` | `WelcomeEmail` | `name?: string` | EmailLayout | Greeting with name fallback ("pilot"), 3 bullet features, CTA "START YOUR FIRST SESSION", pricing mention |
| `src/emails/subscription-confirmed.tsx` | `SubscriptionConfirmedEmail` | `plan: 'monthly' \| 'annual'` | EmailLayout | Plan details box ($39/month or $299/year), CTA "GO TO PRACTICE", subscription management note |
| `src/emails/subscription-cancelled.tsx` | `SubscriptionCancelledEmail` | (none) | EmailLayout | Access-until-period-end notice, free tier mention, CTA "VIEW PRICING", cancellation feedback link |
| `src/emails/payment-failed.tsx` | `PaymentFailedEmail` | (none) | EmailLayout | Warning box with amber left border, 7-day urgency, CTA "UPDATE BILLING", support contact link |
| `src/emails/trial-ending.tsx` | `TrialEndingEmail` | `name?: string`, `daysLeft: number`, `plan: 'monthly' \| 'annual'` | EmailLayout | Dynamic day count, auto-conversion explanation, cancel instructions, CTA "KEEP PRACTICING" |
| `src/emails/ticket-auto-reply.tsx` | `TicketAutoReplyEmail` | `subject?: string` | EmailLayout | Optional original subject reference, 24-hour promise, link to /help FAQ |

---

## Trigger Source Registry

| # | Scenario | Trigger Source | Code Location | Dispatch Pattern |
|---|----------|---------------|---------------|-----------------|
| 1 | Welcome | Auth callback detects new user | `src/app/auth/callback/route.ts` (lines 119, 160) | `void sendWelcomeEmail(...)` — fire-and-forget |
| 2 | Subscription Confirmed | Stripe webhook: `checkout.session.completed` | `src/app/api/stripe/webhook/route.ts` (line 200) | `void sendSubscriptionConfirmed(...)` — fire-and-forget |
| 3 | Subscription Cancelled | Stripe webhook: `customer.subscription.deleted` | `src/app/api/stripe/webhook/route.ts` (line 268) | `void sendSubscriptionCancelled(...)` — fire-and-forget |
| 4 | Payment Failed | Stripe webhook: `invoice.payment_failed` | `src/app/api/stripe/webhook/route.ts` (line 329) | `void sendPaymentFailed(...)` — fire-and-forget |
| 5 | Trial Ending Reminder | Cron job (external scheduler) | `scripts/email/send-trial-ending-reminders.ts` | Awaited — script tracks success/failure per user |
| 6 | Support Ticket Auto-Reply | Resend inbound webhook (Svix-verified) | `src/app/api/webhooks/resend-inbound/route.ts` (line 156) | `.catch(() => {})` — silent failure |
| 7 | Support Ticket Reply | Admin API endpoint | `src/app/api/admin/support/route.ts` (line 238) | Awaited — returns Resend email ID for ticket_replies record |
| 8 | Email Forward | Resend inbound webhook (catch-all route) | `src/app/api/webhooks/resend-inbound/route.ts` (line 159) | Awaited — part of inbound processing pipeline |
| 9 | Sign-up Verification | Supabase Auth signup | Supabase infrastructure (not in codebase) | Supabase-managed |
| 10 | Password Reset | Supabase Auth forgot password | Supabase infrastructure (not in codebase) | Supabase-managed |
| 11 | Trial Start Notification | Not implemented | N/A | N/A |
| 12 | Daily/Periodic Learning Summary | Not implemented | N/A | N/A |
| 13 | Re-engagement (Inactive User) | Not implemented | N/A | N/A |
| 14 | Bug Report Confirmation | Not implemented | N/A | N/A |
| 15 | Beta/Launch Invite | Not applicable | N/A | N/A |

---

## Implementation Coverage Summary

| Category | Count | Percentage | Scenarios |
|----------|-------|------------|-----------|
| **Implemented (application code)** | 8 | 53% | #1-#8 |
| **Implemented (Supabase-handled)** | 2 | 13% | #9-#10 |
| **Not implemented** | 4 | 27% | #11-#14 |
| **Not applicable** | 1 | 7% | #15 |
| **Total scenarios inventoried** | 15 | 100% | |

### Breakdown by Sender

| Sender | Scenarios | Templates |
|--------|-----------|-----------|
| hello@heydpe.com | 1 | 1 (`welcome.tsx`) |
| billing@heydpe.com | 4 | 4 (`subscription-confirmed.tsx`, `subscription-cancelled.tsx`, `payment-failed.tsx`, `trial-ending.tsx`) |
| support@heydpe.com | 2 | 1 (`ticket-auto-reply.tsx`) + 1 plain text |
| noreply@heydpe.com | 1 | 0 (passthrough HTML/text) |
| Supabase-managed | 2 | Supabase default templates |

### Breakdown by Error Handling Pattern

| Pattern | Functions | Behavior |
|---------|-----------|----------|
| Void dispatch (fire-and-forget) | `sendWelcomeEmail`, `sendSubscriptionConfirmed`, `sendSubscriptionCancelled`, `sendPaymentFailed`, `sendTrialEndingReminder`, `sendTicketAutoReply`, `forwardEmail` | `console.error` on failure, never throws, returns `void` |
| Return value with null fallback | `sendTicketReply` | Returns `string \| null` — Resend email ID on success, `null` on error |

### Gap Priority Assessment

| Scenario | Severity | Rationale |
|----------|----------|-----------|
| #11 Trial Start Notification | LOW | Welcome email (#1) already covers onboarding. Adding a separate trial start email adds marginal value. |
| #12 Daily/Periodic Learning Summary | MEDIUM | High engagement potential for active subscribers. Requires new cron infrastructure + template. Best candidate for post-launch implementation. |
| #13 Re-engagement (Inactive User) | LOW | Meaningful for retention but requires careful cadence to avoid spam perception. Post-launch priority. |
| #14 Bug Report Confirmation | LOW | In-app report flow writes to moderation_queue. Email confirmation would be a polish item. Support ticket auto-reply (#6) partially covers user-initiated contact. |

---

*Evidence: Code inspection of `src/lib/email.ts`, `src/emails/*.tsx`, trigger call sites, and `src/lib/__tests__/email*.test.ts` as of 2026-03-16.*
