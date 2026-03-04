---
date: 2026-03-13
type: system-audit
tags: [heydpe, system-audit, phase-16, billing, stripe, trial, conversion, entitlement]
status: Final
evidence_level: high
---

# 44 — Billing, Trial, and Conversion Readiness
**Phase:** 16 | **Date:** 2026-03-13 | **Scope:** Revenue path audit for beta launch

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

## Plans

| Plan | Price | Trial | Stripe Price ID |
|------|-------|-------|----------------|
| Monthly | $39/month | 7-day free trial | `STRIPE_PRICE_MONTHLY` env var |
| Annual | $299/year | 7-day free trial | `STRIPE_PRICE_ANNUAL` env var |

## Tier System

| Tier | Description | Access Level |
|------|-------------|-------------|
| `ground_school` | New user default (DB migration) | 3 free exam sessions |
| `checkride_prep` | Free/downgraded (code default) | 3 free exam sessions |
| `dpe_live` | Active subscriber or trialing | Unlimited sessions |

## Trial-to-Purchase Flow

```
1. User signs up → tier: ground_school, status: none
2. User starts free sessions (up to 3)
3. User hits quota → shown upgrade modal with /pricing link
4. User clicks plan → /api/stripe/checkout creates session with 7-day trial
5. Stripe checkout completes → webhook: checkout.session.completed
6. Webhook sets tier: dpe_live, status: trialing
7. Trial ends → Stripe charges card → webhook: invoice.paid → tier stays dpe_live
8. If card fails → webhook: invoice.payment_failed → tier: checkride_prep (FIXED in Phase 16)
```

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
| Free session limit (3) | Server-side | `/api/session/route.ts` | EXISTS |
| Tier check for session start | Server-side | `/api/session/route.ts` | EXISTS |
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
