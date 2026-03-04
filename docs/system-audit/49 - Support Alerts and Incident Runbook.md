---
date: 2026-03-14
type: system-audit
tags: [heydpe, system-audit, phase-17, runbook, operations, support]
status: final
evidence_level: high
---

# 49 — Support Alerts and Incident Runbook

**Phase:** 17
**Date:** 2026-03-14
**Scope:** Operational procedures for monitoring, alerting, and incident response during public launch

---

## 1. Monitoring Stack

| System | What It Monitors | Dashboard |
|--------|-----------------|-----------|
| Vercel | Deployment status, build errors, function invocations | vercel.com/dashboard |
| Supabase | Database health, auth events, storage | supabase.com/dashboard |
| PostHog | User analytics, feature usage, funnel conversion | us.posthog.com |
| Resend | Email delivery, bounces, complaints | resend.com/emails |
| Stripe | Payments, subscriptions, webhooks | dashboard.stripe.com |

---

## 2. Support Ticket Workflow

### Inbound Email Flow

```
User sends email to support@heydpe.com
  → Resend receives → webhook fires → /api/webhooks/resend-inbound
    → Svix signature verified
    → Email routed (support@ → create_ticket, feedback@ → create_ticket)
    → Ticket created in support_tickets table
    → Auto-reply sent to user (sendTicketAutoReply)
    → Admin panel: /admin/support shows new ticket
```

### Response SLA

| Priority | Response Time | Examples |
|----------|--------------|---------|
| Critical | < 4 hours | Cannot access account, payment charged incorrectly |
| High | < 24 hours | Feature not working, exam data lost |
| Normal | < 48 hours | General questions, feedback, feature requests |

### Admin Actions

1. View tickets: Navigate to `/admin/support`
2. Reply to ticket: Click ticket → compose reply → sends via `sendTicketReply()`
3. Close ticket: Mark as resolved in admin panel

---

## 3. Email Delivery

### Transactional Emails

| Template | Sender | Trigger | Retry |
|----------|--------|---------|-------|
| Welcome | hello@heydpe.com | User signup | Resend auto-retry (3x) |
| Subscription Confirmed | billing@heydpe.com | Stripe checkout.session.completed | Resend auto-retry (3x) |
| Subscription Cancelled | billing@heydpe.com | Stripe customer.subscription.deleted | Resend auto-retry (3x) |
| Payment Failed | billing@heydpe.com | Stripe invoice.payment_failed | Resend auto-retry (3x) |
| Ticket Auto-Reply | support@heydpe.com | Inbound support email | Best-effort, non-blocking |
| Trial Ending Reminder | billing@heydpe.com | Cron script (2 days before) | Idempotent, re-runnable |
| Ticket Reply | support@heydpe.com | Admin replies to ticket | Resend auto-retry (3x) |

### Email Retry Behavior

Resend automatically retries failed email deliveries up to 3 times with exponential backoff. If all retries fail, the email is marked as failed in the Resend dashboard.

**Manual recovery:**
1. Check Resend dashboard for failed emails
2. Note the recipient and template type
3. Re-trigger manually via Resend dashboard "Resend" button
4. For bulk failures: investigate Resend status page for outages

### Dead Letter Handling

No automated dead-letter queue exists. For launch:
- Monitor Resend dashboard daily for bounce/complaint rates
- If bounce rate exceeds 5%, investigate and remove invalid addresses
- If complaint rate exceeds 0.1%, review email content and frequency

---

## 4. Payment Incidents

### Stripe Webhook Failures

**Symptoms:** Webhook events not processing, users stuck in wrong tier.

**Diagnosis:**
1. Check Stripe Dashboard → Developers → Webhooks → Failed events
2. Check Vercel function logs for `/api/stripe/webhook` errors
3. Verify `STRIPE_WEBHOOK_SECRET` env var is correct

**Recovery:**
1. Fix the root cause (code bug, env var, etc.)
2. In Stripe Dashboard → Webhooks → Failed events → "Resend" each failed event
3. Stripe webhooks are idempotent (subscription_events table prevents duplicate processing)

### Payment Failure Flow

```
Stripe fires invoice.payment_failed
  → Webhook handler: handlePaymentFailed()
    → user_profiles.tier set to 'checkride_prep' (downgraded)
    → user_profiles.subscription_status set to 'past_due'
    → sendPaymentFailed() email sent to user
    → User retries payment via Stripe customer portal (/settings)
```

### Subscription Status Mapping

| Stripe Status | HeyDPE Tier | Access |
|---------------|-------------|--------|
| trialing | dpe_live | Full access |
| active | dpe_live | Full access |
| past_due | checkride_prep | Limited (no TTS, limited sessions) |
| canceled | checkride_prep | Limited |
| unpaid | checkride_prep | Limited |

---

## 5. Common Incidents

### "Voice mode not working"

**Root cause options:**
1. Browser not Chrome/Edge (STT requires Web Speech API)
2. User on ground_school tier (TTS blocked server-side, returns 403)
3. TTS provider outage (kill switch check returns 503)

**Resolution:**
1. Check browser → recommend Chrome
2. Check tier → recommend upgrade
3. Check kill switch config in system_config table

### "Can't log in / not receiving confirmation email"

**Root cause options:**
1. Email in spam folder
2. Resend delivery failure
3. Incorrect Site URL in Supabase auth settings

**Resolution:**
1. Ask user to check spam
2. Check Resend dashboard for delivery status
3. Verify Supabase Auth → URL Configuration → Site URL matches production

### "Charged after cancelling"

**Root cause options:**
1. Cancellation takes effect at billing period end (expected behavior)
2. Webhook for customer.subscription.deleted failed

**Resolution:**
1. Explain billing period behavior
2. Check Stripe subscription status
3. If webhook failed, manually update user_profiles tier

---

## 6. Escalation Path

| Level | Who | When |
|-------|-----|------|
| L1 | Support auto-reply + admin ticket panel | All inbound emails |
| L2 | Piotr (pd@imagineflying.com) | Unresolved after 24h, payment issues, security |
| L3 | Vercel/Supabase/Stripe support | Infrastructure outages |

---

## 7. Launch Day Checklist

- [ ] Verify all env vars are set in Vercel production
- [ ] Test support email flow (send to support@heydpe.com, verify ticket + auto-reply)
- [ ] Test payment flow (Stripe test mode → checkout → webhook)
- [ ] Monitor Vercel function invocations for first 2 hours
- [ ] Monitor Resend dashboard for email delivery
- [ ] Monitor Stripe dashboard for payment events
- [ ] Check PostHog for user signups and exam starts
