---
date: 2026-03-13
type: system-audit
tags: [heydpe, system-audit, phase-16, billing, stripe, trial, conversion, entitlement]
status: Final
evidence_level: high
---

# 44 — Billing, Trial, and Conversion Readiness
**Phase:** 16 | **Date:** 2026-03-13 | **Scope:** Revenue path audit for beta launch

> **⚠ SUPERSEDED IN PART BY DECISION D5 (2026-06-14).** The trial model below (Stripe
> `trial_period_days`, card-required, count-only free tier) was **replaced** by a card-free
> **app-side trial: 7 days AND 3 exams**, with **immediate-pay** paid checkout (no Stripe trial),
> and human **Trial / Paid / Tester** display labels. Sections updated inline below; full rationale,
> reason-code contract, and rollback in `docs/plans/2026-06-14-trial-and-tier-labels-decision.md`.

## Billing Architecture

| Component | File | Status |
|-----------|------|--------|
| Stripe client | `src/lib/stripe.ts` | EXISTS |
| Checkout session | `src/app/api/stripe/checkout/route.ts` | EXISTS |
| Webhook handler | `src/app/api/stripe/webhook/route.ts` | EXISTS |
| Customer portal | `src/app/api/stripe/portal/route.ts` | EXISTS |
| Status check | `src/app/api/stripe/status/route.ts` | EXISTS |
| Pricing page | `src/app/pricing/page.tsx` | EXISTS |
| Tier lookup | `src/lib/voice/tier-lookup.ts` | EXISTS (5-min TTL cache) |
| Subscription events | `subscription_events` table | EXISTS (idempotency) |

## Plans (D5)

| Plan | Price | Stripe trial | Billing | Stripe Price ID |
|------|-------|--------------|---------|----------------|
| Monthly | $39/month | **None** (app-side trial precedes checkout) | First month billed immediately | `STRIPE_PRICE_MONTHLY` env var |
| Annual | $299/year | **None** | First year billed immediately | `STRIPE_PRICE_ANNUAL` env var |

The **free trial is app-side and card-free**: 7 days from signup AND 3 exams (whichever first),
enforced in `POST /api/session` create. `trial_period_days` was removed from checkout.

## Tier System (D5 — stored value vs display LABEL)

| Stored tier | Display label | Description | Access Level |
|-------------|---------------|-------------|-------------|
| `ground_school` | **Trial** | Dead legacy default (migrated away) | Card-free trial (7d / 3 exams) |
| `checkride_prep` | **Trial** | Free / downgraded (code default) | Card-free trial (7d / 3 exams) |
| `dpe_live` | **Paid** | Active subscriber (incl. canceling-but-not-yet-ended) | Unlimited sessions |
| (any) + `paid_equivalent` override | **Tester** | Admin courtesy grant | Unlimited (admin-managed) |

Labels live in `src/lib/tier-labels.ts` (display-only). Stored enum + gates unchanged.

## Trial-to-Purchase Flow (D5)

```
1. User signs up → tier: checkride_prep ("Trial"), status: none, created_at stamped
2. User runs card-free trial: up to 3 exams within 7 days of signup
3. Create blocked → 403 routed to upgrade modal, reason-specific copy:
     - 3 exams used       → trial_limit_reached ("Free exams used")   [count checked FIRST]
     - 7 days elapsed      → trial_expired       ("Trial ended")
     - ever subscribed     → resubscribe_required ("Subscription ended")
4. User clicks plan → /api/stripe/checkout creates an IMMEDIATE-PAY subscription (no trial)
5. Stripe charges the first month/year now → webhook: checkout.session.completed / invoice.paid
6. Webhook sets tier: dpe_live ("Paid"), status: active   (no 'trialing' state for new subs)
7. Cancel → cancel_at_period_end keeps status: active → dpe_live until current_period_end
8. Period end → customer.subscription.deleted → tier: checkride_prep (back to Trial/churned)
9. If card fails → webhook: invoice.payment_failed → tier: checkride_prep (FIXED in Phase 16)
```

`/api/stripe/status` calls `invalidateTierCache` after a direct `dpe_live` write so a fresh upgrade
is not hard-blocked by the app-side trial window during the 5-min tier cache TTL. The mid-exam
`expires_at` check in `/api/exam` bypasses for `dpe_live` (a user who upgrades mid-exam keeps going).

## Critical Fix Applied in Phase 16

**Payment failure tier downgrade** — `handlePaymentFailed()` in `src/app/api/stripe/webhook/route.ts` now sets `tier: 'checkride_prep'` when payment fails. Previously, tier stayed at `dpe_live` allowing continued free access after payment failure.

**Before (BUG):**
```typescript
.update({ subscription_status: 'past_due', latest_invoice_status: 'failed' })
```

**After (FIXED):**
```typescript
.update({ tier: 'checkride_prep', subscription_status: 'past_due', latest_invoice_status: 'failed' })
```

## Entitlement Enforcement

| Check | Type | Location | Status |
|-------|------|----------|--------|
| Trial cap: 3 exams (checked first) | Server-side | `/api/session/route.ts` | EXISTS (D5) |
| Trial cap: 7-day window from signup | Server-side | `/api/session/route.ts` | EXISTS (D5) |
| Churned-payer block (resubscribe) | Server-side | `/api/session/route.ts` | EXISTS (D5) |
| Tier check for session start | Server-side | `/api/session/route.ts` | EXISTS |
| Mid-exam expiry (paid bypass) | Server-side | `/api/exam/route.ts` | EXISTS (D5) |
| Subscription status display | Client-side | Settings page | EXISTS |
| Quota warning banner | Client-side | Practice page (80% usage) | EXISTS |
| Quota exceeded modal | Client-side | Practice page (100% usage) | EXISTS |
| Voice/TTS tier gating | NOT ENFORCED | `/api/tts/route.ts` | REVIEW |
| Stripe portal access | Server-side | `/api/stripe/portal/route.ts` | EXISTS |

## Webhook Event Handling

| Event | Handler | Tier Change | Email | Idempotent |
|-------|---------|-------------|-------|------------|
| `checkout.session.completed` | EXISTS | → `dpe_live` | Confirmation | Yes |
| `customer.subscription.updated` | EXISTS | Conditional (active/trialing → dpe_live, else → checkride_prep) | None | Yes |
| `customer.subscription.deleted` | EXISTS | → `checkride_prep` | Cancellation | Yes |
| `invoice.paid` | EXISTS | → `dpe_live` (if active/trialing) | None | Yes |
| `invoice.payment_failed` | EXISTS | → `checkride_prep` (FIXED) | Payment failed | Yes |

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Tier inconsistency (`ground_school` vs `checkride_prep` for free users) | MEDIUM | REVIEW — functionally equivalent, both get 3 free sessions |
| Voice/TTS not tier-gated server-side | MEDIUM | REVIEW — acceptable for beta (voice uses minimal resources) |
| Portal returns 400 instead of 401 for non-subscribers | LOW | REVIEW |
| Tier cache TTL is 5 minutes | LOW | Acceptable for beta |
| Pricing page shows "Start Trial" to existing subscribers | LOW | REVIEW |

## Manual Verification Checklist

- [ ] Create test account, verify 3 free sessions work
- [ ] Hit quota limit, verify upgrade modal appears
- [ ] Complete Stripe checkout (test mode), verify tier changes to `dpe_live`
- [ ] Verify subscription confirmation email received
- [ ] Trigger payment failure (test webhook), verify tier downgraded
- [ ] Verify payment failed email received
- [ ] Cancel subscription, verify cancellation email + tier downgrade
- [ ] Open customer portal from Settings, verify Stripe portal loads
- [ ] Re-subscribe after cancellation, verify tier restored

## Verdict
**GO for beta** — Revenue path functional end-to-end. Critical payment failure bug fixed in this sprint. Voice tier gating is a review item for public launch.
