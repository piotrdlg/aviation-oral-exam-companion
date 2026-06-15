# Decision D5 — Card-free Trial + Tier-label layer (2026-06-14)

> Status: **DECIDED & SHIPPED**. Owner: Piotr (pd@imagineflying.com).
> Supersedes the "count-only free tier + Stripe-trial" model. No database migration.

## Problem

The pricing page promised a **"7-day free trial — no credit card required,"** but that was false:

- The free tier was **count-only** (3 exams, no time limit).
- The only "7-day trial" ran **through Stripe and required a card** (`trial_period_days`).
- Tier vocabulary was opaque: `ground_school` (dead legacy), `checkride_prep`, `dpe_live` are stored
  strings shown raw in admin; "tester" existed only as an entitlement override.

## The three locked decisions

1. **Card-free trial = 7 days AND 3 exams** (whichever first), clock from **signup**
   (`user_profiles.created_at`), enforced **app-side** in `POST /api/session` (create). No Stripe
   trial. This makes "7-day free trial, no credit card required" literally true and grows
   top-of-funnel test-user accumulation.
2. **Paid bills immediately** — checkout no longer sends `trial_period_days`; the first month/year
   is charged at subscribe time, card required.
3. **Human labels Trial / Paid / Tester** are a **display-only** layer (`src/lib/tier-labels.ts`).
   Stored enum values are unchanged.

### Supporting rules

- **One trial per account** — a user who has genuinely subscribed does **not** get the free trial
  again → `resubscribe_required` ("Resubscribe to continue"). The churned signal is a real
  subscription status (`subscription_status` ∈ {`canceled`,`unpaid`,`past_due`}) or the legacy
  `has_trialed` flag — **never** a bare `stripe_customer_id` (that column is written at checkout
  *initiation*, before payment, so an abandoned checkout must not count). A live subscription
  (`stripe_subscription_id` set) is treated as paying even if the tier cache is briefly stale.
- **Enforced immediately for everyone** on deploy — no feature flag. Existing free users past 7 days
  are paywalled on first create after deploy (intentional).
- **Cancel keeps full access until period end (monthly OR annual)** — a `cancel_at_period_end`
  subscription stays `status:'active'` → `tierForSubscription` → `dpe_live` until Stripe fires
  `customer.subscription.deleted` at `current_period_end`. The trial gate + churned-payer block only
  ever apply once the account is back to `checkride_prep` (post period-end). **Preserved invariant —
  no webhook/tier change.**

## Reason-code contract (create-time 403s → upgrade modal)

| Reason | Trigger | Modal copy heading |
|--------|---------|--------------------|
| `trial_limit_reached` | 3-exam cap (checked **first**) | "Free exams used" |
| `trial_expired` | 7-day window elapsed, never subscribed | "Trial ended" |
| `resubscribe_required` | genuinely churned (`subscription_status` canceled/unpaid/past_due, or `has_trialed`), no live sub | "Subscription ended" |

All three route through the existing upgrade **modal** (`quotaModalCopy` in `practice/page.tsx`), not
the inline banner. Mid-exam expiry keeps emitting `session_expired`. The mid-exam expiry check in
`exam/route.ts` gains a `tier !== 'dpe_live'` bypass so a user who upgrades mid-exam is not cut off by
a stale trial `expires_at`.

## What changed

- `src/app/api/session/route.ts` — lazy profile fetch (`created_at, has_trialed, subscription_status,
  stripe_subscription_id`) **after** the count cap; live-sub read-through (paid bypass past a stale
  cache), real churned-payer gate, window gate; `expires_at = signup + 7d`; `trial_blocked` analytics.
- `src/app/api/exam/route.ts` — paid bypass on the mid-exam `expires_at` check.
- `src/app/api/stripe/checkout/route.ts` — removed `trial_period_days` + `has_trialed` read;
  unconditional "Subscribe to HeyDPE…" submit copy.
- `src/app/api/stripe/status/route.ts` — `invalidateTierCache(user.id)` after the direct `dpe_live`
  write (prevents a fresh upgrade being blocked by the 5-min tier cache).
- `src/lib/tier-labels.ts` (PR-A) — `TIER_LABEL` / `OVERRIDE_LABEL` / `tierBand` / `tierDisplay` /
  `subscriptionStatusLabel`. Wired into admin users (list + detail), analytics, config, and the
  instructor weekly email. Tester badge surfaced via a `paid_equivalent` override fetch.
- Copy (W4): pricing, landing, layout meta, try, OnboardingWizard, subscription emails, and the
  settings billing tile (cancel-grace: "Cancels — full access until [date]").

## What did NOT change (and why)

- **Stored tier enum** (`checkride_prep` / `dpe_live` / `ground_school`) — renaming is a risky data
  migration (see `docs/2026-06-14-tier-trial-terminology-audit.html`). Labels are zero-risk.
- **RLS policies, `getUserTier`, every `tier === 'dpe_live'` gate** — untouched.
- **Stripe webhook + `stripe-tier.ts` `GRACE_STATUSES`** — `trialing` stays mapped (grandfathered
  subs still in a Stripe trial keep access); new subs simply never enter that state.
- **`has_trialed` column** — kept as harmless dead state (no migration).

## Tests (binding proof — CI-gated)

- `src/lib/__tests__/session-policy.test.ts` — trial window, count-before-window precedence,
  `resubscribe_required`, paid/override bypass, fail-open on null `created_at`, onboarding exclusion.
- `src/lib/__tests__/stripe-checkout.test.ts` — no `trial_period_days`, submit copy has no
  "7-day free trial", card required, plan→price, 401.
- `src/app/api/exam/__tests__/exam-flow-regression.test.ts` — trial user 403 on expiry; **paid user
  bypasses** a stale `expires_at`.
- E2E (`e2e/billing/*`, `e2e/admin/users.spec.ts`) updated to the new contract; new
  `e2e/billing/trial-cap.spec.ts`. NOTE: the billing/practice Playwright page-objects predate the
  FLIGHT DECK redesign (#38) that stripped most `data-testid`s; this PR re-instruments the quota modal
  (`upgrade-modal` / `upgrade-dismiss`) but the pricing page still needs testid restoration before the
  full billing e2e project runs green. Playwright is not in CI (CI = typecheck + Vitest).

## Rollback

Revert the W1 (`session/route.ts`, `exam/route.ts`) + W2 (`checkout/route.ts`, `status/route.ts`)
commits to restore the count-only free tier + Stripe trial. The label layer (`tier-labels.ts` and its
wiring) is display-only and safe to keep. No DB/migration rollback needed — stored values never moved.
