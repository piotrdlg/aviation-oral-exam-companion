# Mobile Payments + Entitlements — Technical Design (M4)

> **Read order:** Read `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` first (it defines the Bearer transport every new route below rides on, and the dual-mode auth helper). Read `docs/mobile/02-DESIGN-SYSTEM.md` for the FLIGHT DECK typography rule applied to the paywall UI in §1.6. This doc is the **single authority for how money becomes access on mobile**. It adds an **IAP payment path** (Apple In-App Purchase via RevenueCat) that converges on the **exact same single source of truth the web app already uses**: a `user_profiles` row with `tier='dpe_live'` and a live subscription id, with `invalidateTierCache(userId)` called on every write.
>
> **Scope guardrails for this doc:**
> - **The access gate is provider-agnostic and UNCHANGED.** `isPaying = tier === 'dpe_live'` (`src/app/api/session/route.ts:40`) and the read-through `hasLiveSubscription` bypass (`session/route.ts:113`) are the two points an IAP entitlement must satisfy. We do **not** touch `getUserTier`, the `TIER_ORDER` math, the trial gate's reason codes, or any `tier === 'dpe_live'` comparison. We add a **second writer** of `tier='dpe_live'` (RevenueCat → `/api/iap/webhook`) alongside the existing Stripe writer.
> - **Stripe and IAP NEVER stack on one account.** A live Stripe sub blocks IAP application and vice-versa, enforced server-side with an alert (§3). Instructor/admin `paid_equivalent` overrides still `max()` on top of both (`tier-lookup.ts:70-78`), unchanged.
> - **iOS first, Android later.** Apple IAP is the v1 purchase path (Apple Guideline 3.1.1). Google Play Billing through the same RevenueCat SDK is an explicit **later-phase decision** (§9), not v1.
> - **Web Stripe is untouched.** `checkout/route.ts`, `status/route.ts`, `portal/route.ts`, `webhook/route.ts` keep working byte-for-byte. Existing web subscribers sign in on iOS and inherit access with **no IAP purchase** (§4, Apple 3.1.3(b)).
> - **Every section carries BOTH** (a) a qualitative "done" bar and (b) measurable pass/fail criteria. A section without numbers is incomplete by the owner's standard.

---

## 0. Architecture at a glance

```
            ┌─────────────────────────── ACCESS SOURCE OF TRUTH (unchanged) ───────────────────────────┐
            │  user_profiles.tier === 'dpe_live'  →  isPaying  →  full access                            │
            │  getUserTier() = max(base tier, instructor courtesy, paid_equivalent override)  [5-min TTL]│
            └───────────────────────────────────────────────────────────────────────────────────────────┘
                          ▲                                                          ▲
            WRITER A (existing)                                          WRITER B (NEW, this doc)
        Stripe → /api/stripe/webhook                              RevenueCat → /api/iap/webhook
        sets tier, stripe_subscription_id                        sets tier, iap_customer_id,
        entitlement_source='stripe'                              entitlement_source='iap'
                          │                                                          │
                          └────────────── PRECEDENCE GUARD (§3): never stack ────────┘
                                  active stripe sub blocks iap write (+alert)
                                  active iap sub blocks stripe write (+alert)
                                  paid_equivalent override max()'s on top of either

  iOS CLIENT (react-native-purchases / RevenueCat SDK)
     Purchases.configure({ apiKey: APPLE_KEY, appUserID: <supabase user.id> })
        getOfferings() → present default offering (monthly + annual packages)
        purchasePackage(pkg) → StoreKit 2 → Apple charges → receipt
        getCustomerInfo() / restorePurchases() → entitlements.active["pro"]
                          │ (entitlement state is ADVISORY on-client; server webhook is authoritative)
                          ▼
        client calls GET /api/iap/eligibility before showing paywall
        (returns {eligible:false, reason:'has_web_subscription'} → hide IAP, show "already subscribed")
```

**The one rule that makes this safe:** the **client never grants access**. A successful `purchasePackage` unblocks the UI optimistically, but the durable entitlement is written **only** by the server webhook (`/api/iap/webhook`) after RevenueCat validates the receipt with Apple's App Store Server API. This mirrors the existing Stripe discipline where the webhook — not the checkout success redirect — is authoritative (`webhook/route.ts:154-181`). The `status`-route-style read-through (Stripe `status/route.ts:38-70`) has an IAP analog in §2.4 for the webhook-lag window.

---

## 1. RevenueCat React Native / Expo client

### 1.1 Package + dev-client install

**Qualitative "done":** the RevenueCat SDK is installed via Expo's installer (so native versions are pinned), runs in a **custom dev-client** (not Expo Go — Expo Go gives Preview API Mode with JS mocks and **no real purchases**), and configures with platform-specific public API keys keyed on the Supabase user id.

- Install: `npx expo install react-native-purchases react-native-purchases-ui expo-dev-client` (the `-ui` package supplies RevenueCatUI prebuilt paywalls; we use a **custom native paywall** for FLIGHT DECK fidelity — §1.6 — but keep `-ui` available for the future remote-config paywall path).
- Build with EAS: `eas build --platform ios --profile development` (device) / `--profile ios-simulator` (StoreKit-config-file testing). Real Apple sandbox purchases require a **physical device** signed into a **Sandbox Apple ID**.
- **No manual Podfile/Gradle edits and no standalone Expo config-plugin entry are required** in current docs — the native IAP module is pulled in by the dev build. `VERIFY-AT-SUBMISSION`: confirm the exact Expo SDK / `react-native-purchases` version at build time still requires no `app.json` plugin entry. Research baseline: `react-native-purchases` **v10.3.0** (2026-06-11), min RN 0.73.0.

**Measurable success criteria:**
- [ ] `npx expo install` pins `react-native-purchases` and `react-native-purchases-ui` to the same major; `npm ls react-native-purchases` shows a single resolved version (no duplicate).
- [ ] A dev-client build installs on a physical iPhone and logs `Purchases.configure` success (no Preview API Mode warning) — assert the absence of the `"Purchases is running in Preview API Mode"` console line.
- [ ] In Expo Go (negative test) the app **loads without crashing** and `getOfferings()` returns mock data (proves the SDK degrades gracefully, but is never a shippable purchase path).

### 1.2 Configure + identity (the linchpin)

**Qualitative "done":** RevenueCat's **App User ID is always the Supabase `user.id`** — the same id used as Stripe `client_reference_id` (`checkout/route.ts:53`) and `metadata.supabase_user_id` (`checkout/route.ts:54`). This shared identity is what lets RevenueCat recognize an imported Stripe subscription as belonging to the mobile user (§4) and is what the webhook keys on (`app_user_id`).

```ts
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

async function configureRevenueCat(supabaseUserId: string) {
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({
    apiKey: Platform.OS === 'ios' ? REVENUECAT_APPLE_PUBLIC_KEY : REVENUECAT_GOOGLE_PUBLIC_KEY,
    appUserID: supabaseUserId,          // NEVER omit — anonymous IDs break Stripe coexistence
  });
}
// On auth state change:
//   sign in:  await Purchases.logIn(supabaseUserId)
//   sign out: await Purchases.logOut()
```

- The RevenueCat **public** SDK key is client-safe (one per store). It is NOT the webhook Authorization secret and NOT the App Store Server API key — keep those server-only.
- Configure **once**, as early as possible after the Supabase session is known. If the app launches logged-out, configure with the user id the moment the session resolves (call `logIn` if it was configured anonymously first).

**Measurable success criteria:**
- [ ] After login, RevenueCat dashboard → Customer shows App User ID **exactly equal** to the Supabase `user.id` (UUID), with **zero** `$RCAnonymousID` aliases for a user who logged in before purchasing (assert in a 5-account manual pass).
- [ ] `Purchases.logOut()` on sign-out, then `logIn(otherUser)` on the next sign-in, never cross-contaminates entitlements between two accounts on one device (2-account device-swap test passes).

### 1.3 Offerings / Packages / Products / Entitlements model

**Qualitative "done":** exactly **one entitlement** (`"pro"`) unlocks the paid experience; it is attached to the two iOS auto-renewable products (monthly + annual) that **mirror the Stripe catalog 1:1**; the default Offering presents both as `$rc_monthly` and `$rc_annual` packages so paywall code is store-agnostic.

| RevenueCat object | Value | Mirrors / source |
|---|---|---|
| Entitlement | `pro` | Maps to `tier='dpe_live'`. The only gate. |
| Product (App Store) | `dpe_live_monthly` (auto-renewable, 1 month) | Stripe `STRIPE_PRICES.monthly` (env `STRIPE_PRICE_MONTHLY`) (`stripe.ts:32`) |
| Product (App Store) | `dpe_live_annual` (auto-renewable, 1 year) | Stripe `STRIPE_PRICES.annual` (env `STRIPE_PRICE_ANNUAL`) (`stripe.ts:33`) |
| Package | `$rc_monthly` → `dpe_live_monthly` | Web "monthly" plan (`checkout/route.ts:21`) |
| Package | `$rc_annual` → `dpe_live_annual` | Web "annual" plan |
| Offering | `default` (current) | The only paywall offering for v1 |

- Both iOS products are in **one Subscription Group** (so the user can upgrade/downgrade monthly↔annual; PRODUCT_CHANGE handled in §2). The "free period" v1 ships is a **free tier (no card) before you subscribe** — the app-side 7-day/3-exam trial granted by the free tier and consumed **before** the paywall is shown (§4 of doc 01 / D5) — **not** a StoreKit free-trial (Introductory Offer) on the paid product. The two IAP products are therefore **full-price** auto-renewables with **no** StoreKit Introductory Offer in v1. This matches how the trial is framed to Apple in the store listing (`05-APPLE-COMPLIANCE.md §2` metadata + `§18` listing fields: "7-day / 3-exam free trial" = the app-side trial). `OWNER DECISION` below.

> **OWNER DECISION — StoreKit Introductory Offer (free trial) on the IAP products.** The web trial is app-side (free tier, no card; D5). Two choices for iOS:
> 1. **(Recommended for v1) No StoreKit intro offer.** The user lives the same app-side 7-day/3-exam trial on the free tier, then buys a full-price IAP. Simplest; one trial per account already enforced by `has_trialed` + count cap. Apple 3.1.2 still satisfied (subscription period ≥ 7 days; the *paid* sub is what's auto-renewing).
> 2. Add a **7-day StoreKit Introductory Offer (free trial)** to each IAP product (configured in App Store Connect). This is the "Apple-native trial" but **double-counts** with the app-side trial unless suppressed, and introduces `period_type=TRIAL` + `trial_will_end`-style RevenueCat events. Requires reconciling "already trialed app-side" → suppress the StoreKit intro eligibility. More moving parts.
> **This plan recommends option 1 for v1**, revisit in v1.1. Confirm or override before configuring App Store Connect products.

**Measurable success criteria:**
- [ ] `Purchases.getOfferings()` returns `current` with **exactly 2** `availablePackages` (`$rc_monthly`, `$rc_annual`); each `package.product.priceString` renders the **App-Store-localized** price (not a hardcoded "$X").
- [ ] Both products map to the **single** `pro` entitlement (verified in RevenueCat dashboard: purchasing either flips `entitlements.active["pro"]` true).
- [ ] The two product display prices **match the live Stripe monthly/annual prices** within the same currency at launch (manual cross-check; any intentional platform price delta is an `OWNER DECISION` line item, not a silent drift).

### 1.4 Purchase flow

**Qualitative "done":** the paywall calls `purchasePackage`, handles the full result space (success, user-cancel, pending/deferred, already-owned, store error), and treats the on-device `entitlements.active["pro"]` as **optimistic UI only** — the server webhook is the durable grant.

```ts
import Purchases, { PurchasesError, PURCHASES_ERROR_CODE } from 'react-native-purchases';

async function buy(pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = customerInfo.entitlements.active['pro'] != null;
    if (active) {
      // Optimistic: unblock UI now. Then poll GET /api/iap/eligibility / tier
      // until the server reflects dpe_live (webhook lag window, §2.4).
      await refreshServerTier();
    }
  } catch (e) {
    const err = e as PurchasesError;
    if (err.userCancelled) return;                 // silent, no error toast
    if (err.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      showPendingNotice();                          // Ask-to-Buy / SCA deferred
      return;
    }
    showStoreError(err);                            // network / store-down
  }
}
```

- **Never** write entitlement from the client to our backend. The client has no privileged path to `user_profiles` (RLS denies tier self-promotion — `voice_tiers.sql:34` "No INSERT/UPDATE policies = prevents tier self-promotion"). The server learns of the purchase **only** via the RevenueCat webhook.
- After a successful purchase, the client polls `GET /api/iap/eligibility` (or the existing tier read) until the server reports paid, then dismisses the paywall. Mirrors the Stripe `status` read-through that handles webhook lag (`status/route.ts:38-70`).

**Measurable success criteria:**
- [ ] A sandbox purchase flips the paywall to "subscribed" within **≤ 2 s** on-device (optimistic), and the **server** reflects `dpe_live` within **≤ 60 s** (webhook) or immediately via the §2.4 read-through (whichever first).
- [ ] User-cancel produces **no** error toast (assert: `userCancelled` branch shows nothing).
- [ ] A pending/Ask-to-Buy purchase shows a "waiting for approval" notice and **does not** grant access until the approving RENEWAL/INITIAL_PURCHASE webhook lands (deferred-purchase test).

### 1.5 Restore purchases (Apple-required)

**Qualitative "done":** a **user-triggered** "Restore Purchases" button exists in Settings; it calls `Purchases.restorePurchases()` and gates on the returned `customerInfo.entitlements.active`. It is **never** called automatically on every launch.

- Restore re-attaches the App Store receipt to the current (identified) App User ID. With identified ids, RevenueCat applies the project **Restore Behavior** setting on conflict (§5 owner checklist).
- On restore success, the client refreshes server tier the same way as a purchase (§1.4).

**Measurable success criteria:**
- [ ] A "Restore Purchases" control is present and reachable in Settings (≥ 44pt touch target) and is **distinct** from "Sign in" (Apple 3.1.1 restore-mechanism requirement).
- [ ] On a second device signed into the same Apple ID + same Supabase account, Restore re-grants `pro` and the server shows `dpe_live` within **≤ 60 s** (cross-device test, Apple 3.1.2(a) "works on all devices").
- [ ] Restore on an account that never purchased returns **no** active entitlement and shows a friendly "nothing to restore" message (no crash, no false grant).

### 1.6 Paywall UI — FLIGHT DECK typography rule (verbatim)

**Qualitative "done":** the paywall is a **native** screen (not a WebView — Apple 4.x minimum functionality) honoring the FLIGHT DECK identity AND iOS HIG sheet conventions. Apply the typography rule exactly:

- **Caps-mono + glow ONLY** for brand instrument moments: the hero annunciator (e.g. `// UNLOCK DPE LIVE`), the price **numeric readouts** (`$XX` / `$XXX` in mono), status badges ("ANNUAL — BEST VALUE"), and any ACS/element micro-labels. These are the *only* glow/caps-mono elements.
- **Everything else is sentence-case IBM Plex**: the value-prop bullets, the plan descriptions, the legal disclosure block, the buttons' bodies.
- **Never 10px text.** Minimum legible body. Touch targets **≥ 44pt** for both plan-select cards and the purchase/restore buttons.
- **Required Apple 3.1.2 point-of-sale disclosure block** (sentence-case IBM Plex, fully legible, above the purchase button): subscription title, length of period (monthly / annual), price and price-per-period, auto-renewal mechanics ("Payment is charged to your Apple ID. Renews automatically unless turned off at least 24 hours before the period ends. Manage or cancel in your Apple ID Account Settings."), and **functional links to Privacy Policy (`/privacy`) and Terms of Use (`/terms`)**.
- **No off-platform pricing or "subscribe on the web" CTA** inside the iOS app (Apple 3.1.1 / 3.1.3(b) — see §4). The US-storefront external-link allowance is under active SCOTUS review (conference 2026-06-25) and is **not** relied upon in v1.

**Measurable success criteria:**
- [ ] Paywall renders **native** (no `WebView` component in the screen tree — assert in component test).
- [ ] Glow/caps-mono appears on **only** the hero annunciator, price readouts, and badges (visual-regression snapshot diff: count of `glow` style usages == the spec'd set; 0 on body copy).
- [ ] The disclosure block contains all 5 required elements and **two tappable links** that open `/privacy` and `/terms` (automated check: both links resolve 200).
- [ ] No string in the paywall mentions a non-Apple price, "web", "Stripe", or "cheaper on our site" (lint/grep gate over the screen's strings = 0 hits).
- [ ] Largest Dynamic Type setting does not clip the disclosure block (accessibility snapshot at XXXL passes).

---

## 2. Server backend — schema, webhook, eligibility

### 2.1 Migration — `entitlement_source`, `iap_customer_id`, `iap_event_log`

**Qualitative "done":** an **additive, backfill-safe** migration that (a) records *which provider* currently owns a user's paid access, (b) stores the RevenueCat/Apple customer linkage, and (c) creates a service-role-only idempotent IAP event log mirroring the proven `subscription_events` pattern (`20260216100001_pre_commercialization.sql:191-199`). **No destructive change**; the three existing Stripe payers are backfilled to `entitlement_source='stripe'`.

Proposed migration `supabase/migrations/20260615000001_iap_entitlements.sql` (follows the repo's `YYYYMMDDHHMMSS_name.sql` convention; final timestamp set at author time):

```sql
-- ============================================================
-- Migration: IAP (RevenueCat) entitlements — M4
-- Additive + safe for the existing Stripe payers.
--   1. entitlement_source: which provider owns paid access right now.
--   2. iap_customer_id: RevenueCat / Apple original_app_user_id linkage.
--   3. iap_event_log: idempotent RevenueCat webhook log (service-role only),
--      modeled on subscription_events (UNIQUE event id, status state machine,
--      payload JSONB).
-- ============================================================

-- 1. entitlement_source — provider that currently owns the paid tier.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS entitlement_source TEXT NOT NULL DEFAULT 'none'
    CHECK (entitlement_source IN ('stripe', 'iap', 'override', 'none'));

COMMENT ON COLUMN user_profiles.entitlement_source IS
  'Which payment provider currently owns paid access. Enforces the no-stack '
  'rule: an active Stripe sub blocks IAP application and vice versa (admin '
  'override max()es on top and may set ''override''). Written by both the Stripe '
  'and IAP webhooks; read by the precedence guard in tier-lookup.';

-- Backfill: any user with a live Stripe subscription is stripe-owned.
UPDATE user_profiles
SET entitlement_source = 'stripe'
WHERE stripe_subscription_id IS NOT NULL;

-- 2. iap_customer_id — RevenueCat original App User ID (== Supabase user id,
--    but stored explicitly for lookup parity with stripe_customer_id and to
--    survive any future RC alias).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS iap_customer_id TEXT;

COMMENT ON COLUMN user_profiles.iap_customer_id IS
  'RevenueCat original_app_user_id for this user (normally == user_id). The IAP '
  'analog of stripe_customer_id. Null until the first IAP webhook lands.';

-- iap_subscription token: the store transaction that currently grants access,
--   the IAP analog of stripe_subscription_id (the authoritative live-paying
--   signal the trial gate reads). NULL when no live IAP sub.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS iap_subscription_id TEXT;

COMMENT ON COLUMN user_profiles.iap_subscription_id IS
  'original_transaction_id of the live App Store subscription (analog of '
  'stripe_subscription_id). Non-null == live IAP payer. Cleared on EXPIRATION.';

-- Out-of-order guard column (event-time, not processing-time) — IAP analog of
-- last_stripe_event_created (20260610000004).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_iap_event_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.last_iap_event_at IS
  'RevenueCat event_timestamp_ms of the most recently APPLIED IAP webhook. '
  'A webhook is applied only when its event time is newer (out-of-order guard).';

-- 3. iap_event_log — idempotent RevenueCat webhook log (service role only).
CREATE TABLE IF NOT EXISTS iap_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_event_id TEXT NOT NULL UNIQUE,            -- RevenueCat event.id (idempotency key)
  event_type TEXT NOT NULL,                    -- INITIAL_PURCHASE / RENEWAL / ...
  store TEXT,                                  -- APP_STORE / STRIPE / PLAY_STORE / ...
  environment TEXT,                            -- SANDBOX | PRODUCTION
  app_user_id TEXT,                            -- == Supabase user id
  product_id TEXT,
  event_timestamp_ms BIGINT,                   -- RC event time (out-of-order guard)
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iap_event_log_user ON iap_event_log(app_user_id);
CREATE INDEX IF NOT EXISTS idx_iap_event_log_created ON iap_event_log(created_at);

ALTER TABLE iap_event_log ENABLE ROW LEVEL SECURITY;
-- No policies = service role only (mirrors subscription_events). 18-month
-- retention to match subscription_events (add to the existing retention job).
```

**`status='ignored'`** is added (vs. `subscription_events`' 3 states) to record an event we deliberately **did not apply** (e.g. a `store=STRIPE` event that belongs to the Stripe writer, or a cross-provider blocked write) — keeping a full audit trail without marking it `failed` (which would make RevenueCat retry).

**Measurable success criteria:**
- [ ] Migration applies cleanly on a branch DB with **0 errors**; `entitlement_source` backfilled to `'stripe'` for **exactly** the rows where `stripe_subscription_id IS NOT NULL` (assert count equals the count of live Stripe payers).
- [ ] `iap_event_log` rejects a duplicate `rc_event_id` (UNIQUE violation) — proven by a direct double-insert test.
- [ ] `iap_event_log` is **unreadable** by an authenticated (non-service) client (RLS default-deny) — proven by an anon/auth client `SELECT` returning 0 rows / permission denied.
- [ ] `generate_typescript_types` regenerates `src/types/database.ts` to include the new columns + table with the exact CHECK union (no manual type drift).

### 2.2 `POST /api/iap/webhook` — RevenueCat ingestion

**Qualitative "done":** a Next.js route that (1) **verifies the RevenueCat Authorization header** (constant-time, not HMAC — RevenueCat does not sign), (2) **acks within 60 s** (RevenueCat disconnects after 60 s; do heavy work but return fast), (3) is **idempotent on RevenueCat `event.id`** via `iap_event_log` (same claim-row pattern as `subscription_events`), (4) applies an **out-of-order guard on `event_timestamp_ms`** (not processing time), (5) maps `product_id → tier` with the same discipline as `mapStripePriceToTier` (unknown product never silently grants `dpe_live`), (6) **revokes only on EXPIRATION** (never on CANCELLATION), and (7) routes through the **precedence guard** (§3) so it can never stack on a live Stripe sub.

**Auth verification (differs from Stripe — important):**
```ts
// RevenueCat sends the EXACT Authorization header value configured in the
// dashboard on every POST. There is NO x-revenuecat-signature / HMAC.
const auth = request.headers.get('authorization') ?? '';
const expected = process.env.REVENUECAT_WEBHOOK_AUTH ?? '';
if (expected.length === 0 || !timingSafeEqual(auth, expected)) {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
```
- `REVENUECAT_WEBHOOK_AUTH` is a long random secret set **identically** in the RevenueCat dashboard webhook config and in Vercel env. Use a constant-time compare (`crypto.timingSafeEqual` over equal-length buffers; if lengths differ, fail without leaking via early return timing — hash both sides to fixed length first).
- Transport is HTTPS to our URL. A missing/mismatched header → `401`, **no body processing**.

**Idempotency + out-of-order (claim-row pattern, ported from `webhook/route.ts:49-81`):**
1. INSERT a `'processing'` claim row into `iap_event_log` keyed on `rc_event_id`.
2. On UNIQUE conflict, inspect the existing row: `'processed'`/`'ignored'` → return `{ deduplicated: true }`; `'processing'` younger than **60 s** → `{ in_flight: true }` (concurrent duplicate, don't double-process); `'failed'` or stale `'processing'` → fall through and re-process.
3. The `user_profiles` UPDATE filters `.or(last_iap_event_at.is.null, last_iap_event_at.lt.<eventIso>)` so **only newer events apply** (event-time guard; mirrors `webhook/route.ts:266`).
4. On success mark `'processed'`; on a deliberate non-apply mark `'ignored'`; on throw mark `'failed'` + return **500** so RevenueCat retries (up to 5 times: 5/10/20/40/80 min).

**Event handlers** (RevenueCat event `type`):

| RC event | Action on `user_profiles` | Notes |
|---|---|---|
| `INITIAL_PURCHASE` | Through precedence guard → set `tier=productToTier(product_id)`, `iap_subscription_id=original_transaction_id`, `iap_customer_id=app_user_id`, `entitlement_source='iap'`, `last_iap_event_at`; `invalidateTierCache`. | New sub. Blocked + `'ignored'` + alert if a live Stripe sub exists (§3). Sets `has_trialed=true` (one trial per account, provider-agnostic). |
| `RENEWAL` | Re-assert `tier=productToTier(...)`, refresh period/`iap_subscription_id`; `invalidateTierCache`. | Also fires when a **lapsed** user resubscribes — treat like INITIAL_PURCHASE for grant. |
| `PRODUCT_CHANGE` | Re-map `tier=productToTier(new product_id)` (monthly↔annual stays `dpe_live`); update `iap_subscription_id`/price. | Change may apply at next renewal depending on store — trust `product_id` on the event. |
| `UNCANCELLATION` | Clear any pending-cancel marker; ensure `tier=dpe_live` if currently iap-owned. | User turned auto-renew back on. |
| `BILLING_ISSUE` | **Do NOT downgrade.** Mark a dunning/grace state (in-app messaging hook); keep `dpe_live`. | Apple grace/billing-retry; analog of Stripe `past_due` dunning grace (`stripe-tier.ts:9`). |
| `CANCELLATION` | **Do NOT revoke.** Record cancel-at intent only; access persists until `expiration_at_ms`. | Mirrors Stripe `cancel_at_period_end` keep-access (D5:36-40). |
| `EXPIRATION` | **Revoke:** if `entitlement_source='iap'`, set `tier='checkride_prep'`, `iap_subscription_id=null`, `entitlement_source='none'`; `invalidateTierCache`. | **The only revoke point.** Preserve `has_trialed` + `iap_customer_id` (parity with Stripe `subscription.deleted` `webhook/route.ts:286`). |
| `TRANSFER` | Re-resolve which `app_user_id` owns the entitlement now; revoke from the loser, grant to the winner (both through precedence guard). | Receipt moved between accounts. |
| `SUBSCRIPTION_PAUSED` | Treat as no active entitlement at pause start (revoke if iap-owned), restore on resume event. | Android-relevant; harmless on iOS. |
| `REFUND_REVERSED` / `SUBSCRIPTION_EXTENDED` | Re-assert grant per current `product_id`/expiry. | Edge restores. |
| `store !== APP_STORE` (e.g. `STRIPE`, `RC_BILLING`) | **`'ignored'`** — the Stripe writer owns those. Log only. | A single RC endpoint sees Stripe imports too (§4); we do not double-write. |
| `environment = SANDBOX` in production | **`'ignored'`** + log (never grant prod access from a sandbox receipt). | `OWNER DECISION` below on staging. |

**Product → tier map (mirrors Stripe discipline):**
```ts
// IAP analog of mapStripePriceToTier (stripe-tier.ts:21-28): a known product
// grants dpe_live; an UNKNOWN product never silently does — it logs + falls
// back to checkride_prep. Same safety valve shape (no env => no false grant).
const IAP_PRODUCT_TO_TIER: Record<string, 'dpe_live'> = {
  [process.env.IAP_PRODUCT_MONTHLY ?? 'dpe_live_monthly']: 'dpe_live',
  [process.env.IAP_PRODUCT_ANNUAL  ?? 'dpe_live_annual']:  'dpe_live',
};
function productToTier(productId: string | null | undefined): VoiceTier {
  if (productId && IAP_PRODUCT_TO_TIER[productId]) return 'dpe_live';
  console.error(`[iap] Unknown product "${productId ?? '(none)'}" — not granting dpe_live`);
  return 'checkride_prep';
}
```

> **OWNER DECISION — sandbox vs. production environment policy.** RevenueCat tags every event `environment: SANDBOX | PRODUCTION`. Recommended: the **production** webhook **ignores** `SANDBOX` events (never grants prod `dpe_live` from a sandbox/TestFlight receipt), and a **separate RevenueCat project (or a separate Authorization secret + a staging URL)** handles sandbox. Confirm whether staging shares the prod Supabase DB (it must NOT grant prod access) — see doc 01's DB-target guard `requireSafeDbTarget`.

**Measurable success criteria:**
- [ ] Endpoint returns **2xx in < 60 s** for every event type under a 200-event replay (p95 ack latency measured; 0 RevenueCat-side disconnects).
- [ ] A replayed event (same `rc_event_id`) is `deduplicated` and applies the user update **exactly once** (DB diff after 5x replay == 1 application).
- [ ] An out-of-order pair (EXPIRATION delivered before the RENEWAL that supersedes it, by event time) leaves the user **paid** (newer RENEWAL wins) — assert final `tier='dpe_live'`.
- [ ] A `CANCELLATION` event does **not** change `tier` (still `dpe_live`); the subsequent `EXPIRATION` is the only event that downgrades (ordered-pair test).
- [ ] An unknown `product_id` never yields `dpe_live` (logs + stays `checkride_prep`) — negative test asserts the log line and the tier.
- [ ] A missing/wrong Authorization header → **401**, **no** `iap_event_log` row written, **no** `user_profiles` change.
- [ ] A thrown handler marks the row `'failed'` and returns **500** (RevenueCat will retry) — fault-injection test.

### 2.3 `GET /api/iap/eligibility` — should we show the IAP paywall?

**Qualitative "done":** a lightweight, authenticated (Bearer, doc 01) endpoint the mobile client calls **before rendering the paywall**, returning `{ eligible: boolean, reason: string }` so the client can: (a) show the IAP purchase UI, or (b) hide it and show "You're already subscribed — manage on the web" for an existing **Stripe** subscriber (Apple 3.1.3(b), §4), or (c) show "already active" for an existing IAP subscriber.

```jsonc
// Examples
{ "eligible": true,  "reason": "trial_or_free" }        // free/trial user → show IAP paywall
{ "eligible": false, "reason": "has_web_subscription" } // live Stripe sub → §4: full access, NO IAP, no "go to web" CTA
{ "eligible": false, "reason": "already_subscribed_iap" }// live IAP sub → show "Subscribed", offer Restore/Manage
{ "eligible": false, "reason": "override_access" }      // paid_equivalent override → full access, hide paywall
```

Resolution logic (server, service-role read):
1. Load `tier` (via `getUserTier` — already applies override max()), `entitlement_source`, `stripe_subscription_id`, `iap_subscription_id`.
2. If `stripe_subscription_id` non-null (live web payer) → `{ eligible:false, reason:'has_web_subscription' }`. **Critical:** the client must NOT show any "buy" CTA, and must NOT show web pricing or a link to Stripe (anti-steering 3.1.1) — just "you're subscribed, full access."
3. Else if `iap_subscription_id` non-null → `{ eligible:false, reason:'already_subscribed_iap' }`.
4. Else if effective tier is `dpe_live` (e.g. override) → `{ eligible:false, reason:'override_access' }`.
5. Else → `{ eligible:true, reason:'trial_or_free' }`.

**Measurable success criteria:**
- [ ] A live Stripe payer hits the endpoint → `eligible:false, reason:'has_web_subscription'` in **100%** of trials; the iOS client renders **no** purchase button for them (UI test).
- [ ] A free/trial user → `eligible:true`; an IAP payer → `already_subscribed_iap`; an override user → `override_access` (4-persona table test, all pass).
- [ ] Endpoint p95 latency **< 200 ms** (single profile read; no Stripe/Apple round-trip in the common path).

### 2.4 Webhook-lag read-through (post-purchase grant before the webhook lands)

**Qualitative "done":** an IAP analog of the Stripe `status` read-through (`status/route.ts:38-70`). If the client just purchased and the webhook hasn't yet written `dpe_live`, the eligibility/tier read can consult RevenueCat's REST API (or accept the client's signed `customerInfo` is **insufficient** — never trust the client) to grant immediately, then `invalidateTierCache`.

> **OWNER DECISION — read-through source.** Two options: (1) call the **RevenueCat REST `GET /subscribers/{app_user_id}`** server-side to confirm an active `pro` entitlement and write `dpe_live` immediately (authoritative, one extra API call, like the Stripe `subscriptions.list` read-through). (2) Rely solely on the webhook + client polling (simpler, but a ~5–60 s "purchased but not yet unlocked" window). **Recommended: option 1** for symmetry with the Stripe path and to avoid a visible lag after payment. Confirm.

**Measurable success criteria:**
- [ ] After a sandbox purchase with the webhook artificially delayed 120 s, the read-through grants `dpe_live` within **≤ 3 s** of the client's first eligibility poll (option 1), or the lag window is explicitly accepted and ≤ 60 s (option 2).
- [ ] The read-through **never** grants from an unverified client claim (it re-queries RevenueCat/Apple server-side) — security assertion.

---

## 3. Precedence — Stripe and IAP never stack

**Qualitative "done":** a single, well-tested precedence guard ensures one account is owned by **at most one** payment provider at a time. An **active Stripe sub blocks an IAP write** (log + owner alert), an **active IAP sub blocks a Stripe write** (log + alert), an admin/instructor `paid_equivalent` **override still `max()`es on top** of either (unchanged `tier-lookup.ts:70-78`), and **every** entitlement write calls `invalidateTierCache(userId)`.

### 3.1 Where the guard lives

The guard is a small pure-ish helper consulted by **both** writers:

```ts
// Returns the action a writer should take given who already owns access.
type Provider = 'stripe' | 'iap';
function resolveWrite(opts: {
  writer: Provider;
  hasLiveStripe: boolean;   // stripe_subscription_id != null
  hasLiveIap: boolean;      // iap_subscription_id != null
}): 'apply' | 'block' {
  if (opts.writer === 'iap'    && opts.hasLiveStripe) return 'block'; // Stripe wins; IAP blocked
  if (opts.writer === 'stripe' && opts.hasLiveIap)    return 'block'; // IAP wins; Stripe blocked
  return 'apply';
}
```

- **Tie-break rule:** whoever is **already live** keeps ownership; the newcomer is blocked + alerted. This is intentional — it prevents an accidental double-charge from also producing a double-write, and it makes the human-resolvable case loud (alert) rather than silent.
- On `'block'`, the writer records the event as `'ignored'` (IAP side) / logs + `sendInternalAlert` (both sides) with the conflicting ids, and makes **no** `tier` change. It does **not** refund — refund/cancel is a deliberate human action in the owning provider's dashboard (the alert says exactly which).
- `entitlement_source` records the current owner; it is set to `'stripe'`/`'iap'` on apply, `'override'` only by the admin override path, `'none'` on revoke.

### 3.2 Wiring into the existing Stripe writer

The Stripe webhook (`webhook/route.ts`) gains a guard at the top of each **grant** handler (`checkout.session.completed`, `subscription.updated` when it would set `dpe_live`, `invoice.paid`): before applying, read `iap_subscription_id`; if non-null → **block + alert + return** (record nothing that grants access). Revoke handlers (`subscription.deleted`) are **unconditional** (they only ever downgrade and only ever touch Stripe-owned rows via `stripe_customer_id`). This is an **additive guard**; the existing Stripe behavior for non-conflicting accounts is byte-for-byte unchanged.

### 3.3 Override always on top

`getUserTier` already `max()`es a `paid_equivalent` override to `dpe_live` regardless of base tier (`tier-lookup.ts:70-78`). The precedence guard operates on the **paid-provider** layer only; an admin override is a **third, higher** layer that neither blocks nor is blocked by Stripe/IAP — it simply wins the *effective* tier via the existing max(). `entitlement_source='override'` is a display/audit signal; it does not change the `getUserTier` math.

### 3.4 Cache invalidation on every write

Every path that changes `tier`, `entitlement_source`, `stripe_subscription_id`, or `iap_subscription_id` MUST call `invalidateTierCache(userId)` (the 5-min `TtlCache`, `tier-lookup.ts:14,116-119`). The IAP webhook calls it on grant, revoke, product-change, and block-resolution; this matches the Stripe webhook's discipline (`webhook/route.ts:183,298,378`).

### 3.5 Account deletion vs. an active store subscription

**Qualitative "done":** v1 **allows** account deletion even while a store (Apple IAP) subscription is active, and closes the two gaps that an IAP auto-renew would otherwise leave open:

- **(a) Server detaches/deletes the RevenueCat subscriber on deletion.** The account-deletion path (`/api/user/delete`, the existing Stripe auto-cancel) must, in the same transaction, **detach or delete the RevenueCat subscriber** for that App User ID (RevenueCat REST subscriber-delete, server-only with `REVENUECAT_REST_API_KEY`). This guarantees a later `restorePurchases()` on a fresh account **cannot** re-attach the orphaned receipt and **falsely grant** `dpe_live` — the entitlement has no subscriber to map onto. (Without this, the App User ID is merely logged out and the receipt remains restorable.)
- **(b) The UI warns that the Apple sub keeps billing until cancelled in Apple Settings.** Apple owns the IAP auto-renew; deleting the HeyDPE account **cannot** stop Apple from billing. The deletion confirmation must show prominent copy: *"Deleting your account does not cancel an Apple App Store subscription — it will keep billing until you cancel it in Apple Settings,"* with the exact steps (Settings → Apple ID → Subscriptions → HeyDPE → Cancel). Stripe is auto-cancelled server-side as today; only the store auto-renew needs the user action.

Owned by the Settings screen — cross-reference `screens/06-settings.md` **D-SET-2** (the IAP-auto-renew-on-deletion owner decision + the D2 deletion-confirmation copy). The §2.4 / §5 `REVENUECAT_REST_API_KEY` is the same secret used here for the subscriber-delete call.

**Measurable success criteria:**
- [ ] After account deletion, the RevenueCat subscriber for that App User ID is **gone** (REST `GET /subscribers/{id}` 404 / no active `pro`), and a subsequent `restorePurchases()` on a new account grants **no** `dpe_live` (false-restore negative test).
- [ ] The deletion confirmation renders the Apple-Settings cancellation warning + steps (string assert; `screens/06-settings.md` D-SET-2 copy present) before the destructive action.

### 3.6 Refunds — who issues them

**Qualitative "done":** the refund pathway is **provider-correct** and never implies the developer refunds store purchases:

- **App Store (and, later, Google Play) IAP purchases are refunded by Apple / Google**, not by HeyDPE — the user files a refund via Apple **report-a-problem** (`reportaproblem.apple.com`) / Google Play. The app and support copy direct store buyers there and do **not** promise a developer refund for store charges.
- The **7-day email-refund promise in Terms applies to web / Stripe purchases only** — that is the only billing relationship HeyDPE can refund directly.
- A **store-conditional Terms clause** (web/Stripe = 7-day email refund; App Store / Google Play = refund via Apple/Google) is an **owner/legal action item**, NOT edited in this pass (do not touch `src/app/terms/page.tsx`). Tracked in §8.

**Measurable success criteria:**
- [ ] No iOS string promises a developer refund for a store purchase; refund copy points to Apple report-a-problem (grep over iOS strings: 0 "we'll refund"-style promises tied to IAP).
- [ ] The web/Stripe 7-day refund language remains reachable only on web (no regression to the existing Terms/web flow).

**Measurable success criteria:**
- [ ] **The headline cross-provider test:** a user with a **live production Stripe subscription** triggers an `INITIAL_PURCHASE` IAP event → `tier` stays exactly as Stripe set it (no double-write), `entitlement_source` stays `'stripe'`, the IAP event is logged `'ignored'`, and **one** owner alert fires naming both ids. (This is the marquee acceptance gate.)
- [ ] The reverse: a live IAP subscriber's Stripe `checkout.session.completed` is blocked, Stripe state not granted, alert fired.
- [ ] An override user who also has a live Stripe **or** IAP sub still resolves `getUserTier === 'dpe_live'` (override max() unaffected) — assert effective tier.
- [ ] After **every** apply/revoke/block, `invalidateTierCache` was called (spy/assert in unit tests; 0 paths miss it).
- [ ] No account ever shows **both** `stripe_subscription_id` and `iap_subscription_id` non-null after a guarded run (DB invariant check over the test corpus = 0 violations).

---

## 4. Existing web (Stripe) subscriber on iOS — Apple 3.1.3(b)

**Qualitative "done":** a user who already subscribed on the web via Stripe **signs in on iOS, gets full access, and is never shown an IAP purchase** for the same entitlement — and is **never told to go subscribe/manage on the web from inside the app** (anti-steering 3.1.1). This is the Apple 3.1.3(b) multiplatform allowance: they may **access** what they bought elsewhere because the same offering **is** available as an iOS IAP.

### 4.1 The mechanism (no new purchase)

- On login, RevenueCat is configured with the Supabase `user.id` (§1.2). Because Stripe is connected to RevenueCat via the **Stripe App Marketplace + External Purchase Tracking** with the **same App User ID** (§5 checklist), RevenueCat already shows the `pro` entitlement active for that user (store `STRIPE`), and our server already has `stripe_subscription_id` non-null → `getUserTier` returns `dpe_live`. **No IAP, no Stripe `STRIPE`-store webhook double-write** (the IAP webhook `'ignore'`s `store=STRIPE`, §2.2).
- The client calls `GET /api/iap/eligibility` → `{ eligible:false, reason:'has_web_subscription' }` → it renders "You're subscribed — full access" with **no** purchase button and **no** web link/price.
- Subscription **management** for a Stripe-billed user stays in the **Stripe Customer Portal**, but the iOS app must **not** link to or mention it (anti-steering). The user manages it from the web on their own; iOS just honors the entitlement. (We may show a neutral "Manage your subscription from the website where you purchased it" only if Apple's current guidance allows a non-actionable informational line — `VERIFY-AT-SUBMISSION`; default to **saying nothing**.)

### 4.2 Reviewer + demo-account implication (Apple 2.1)

The App Store reviewer needs an account that reaches the **real examiner** (not a paywall/trial-403). Provision a demo account that is **paid** — recommended: a `paid_equivalent` **override** (`entitlement_source='override'`, `tier-lookup.ts:70-78`) so it needs **no** real Stripe/IAP charge and never hits `trial_limit_reached`/`trial_expired` (`session/route.ts:74-141`). Put the credentials + an exam walkthrough in App Store Connect "App Review Information." (Detailed in the App Store submission doc; cross-referenced here because it's a payments-adjacent gate.)

**Measurable success criteria:**
- [ ] A test account with a **live Stripe sub** signs into a fresh iOS install and reaches the **examiner** (passes the trial gate) with **0** IAP prompts and **0** web links/prices shown (end-to-end UI test).
- [ ] `eligibility` returns `has_web_subscription` for that account 100% of the time.
- [ ] The reviewer demo account (override) starts an exam and completes ≥ 3 exchanges **without** any 403 (`trial_*`) — scripted check before every submission.
- [ ] grep over all iOS strings: **0** occurrences of a non-Apple price, "stripe", "subscribe on the web", or a checkout URL.

---

## 5. RevenueCat project setup checklist (owner)

**Qualitative "done":** every dashboard/store prerequisite is configured before the first sandbox purchase, with secrets in Vercel matching the dashboard.

- [ ] **Create the RevenueCat project**; add the **iOS app** (bundle id matching the EAS build). (Android app added in the later phase, §9.)
- [ ] **App Store Connect → In-App Purchase Key (`.p8`)** uploaded to RevenueCat (StoreKit 2 backend validation needs it; the legacy App-Specific Shared Secret is **not** used for SK2). `VERIFY-AT-SUBMISSION`: also confirm the App Store Connect **App Store Server Notifications v2** URL points at RevenueCat.
- [ ] **Create the two auto-renewable products** in App Store Connect (`dpe_live_monthly`, `dpe_live_annual`) in **one Subscription Group**; submit them for review with the app. Prices set to mirror Stripe monthly/annual.
- [ ] **RevenueCat: Entitlement `pro`**; attach both products to it.
- [ ] **RevenueCat: Offering `default`** with packages `$rc_monthly`, `$rc_annual`.
- [ ] **Copy the platform public SDK keys** (Apple key) into the app config (`REVENUECAT_APPLE_PUBLIC_KEY`).
- [ ] **Connect Stripe** via the Stripe App Marketplace; enable **External Purchase Tracking**; confirm imported Stripe subs appear with `store=STRIPE` and the **same App User ID** as the mobile user (this is what makes §4 work). `VERIFY-AT-SUBMISSION`: confirm whether your case uses the Stripe-app import, the REST `POST /receipts`, or both.
- [ ] **Configure the webhook**: URL = `https://<app>/api/iap/webhook`; set the **Authorization header** to a long random secret; store that **same** secret in Vercel as `REVENUECAT_WEBHOOK_AUTH`.
- [ ] **Set Restore Behavior** (transfer-vs-keep on conflicting identified users) deliberately (§1.5).
- [ ] **Env vars in Vercel**: `REVENUECAT_WEBHOOK_AUTH`, `IAP_PRODUCT_MONTHLY`, `IAP_PRODUCT_ANNUAL`, and (if §2.4 option 1) `REVENUECAT_REST_API_KEY` (secret, server-only). Add them to `.env.example` with comments mirroring the Stripe block.
- [ ] **Sandbox test accounts** created in App Store Connect; a physical device signed into a Sandbox Apple ID for the M4 purchase pass.
- [ ] **Environment policy** decided (§2.2 OWNER DECISION): separate sandbox project/secret, or env-field filtering on one endpoint.

**Measurable success criteria:**
- [ ] A sandbox purchase on a physical device produces a RevenueCat dashboard event **and** a delivered webhook to `/api/iap/webhook` with a valid Authorization header (end-to-end plumbing proven before any UI work is called "done").
- [ ] An existing Stripe customer appears in RevenueCat with `store=STRIPE` and App User ID == their Supabase id (import proven).
- [ ] All required secrets exist in Vercel and **none** are committed (grep over the repo for the secret value = 0 hits; `.env.example` has placeholders only).

---

## 6. End-to-end test matrix (acceptance gate)

Every row is **pass/fail**. The suite must be green before M4 is "done." Tests run against a branch DB; webhook tests replay canned RevenueCat JSON (one fixture per `type`, with `store`, `environment`, `event_timestamp_ms`, `app_user_id`, `product_id`).

### 6.1 Per-event-type

| # | Scenario | Expected result |
|---|---|---|
| E1 | `INITIAL_PURCHASE` (monthly), free user, no Stripe | `tier=dpe_live`, `entitlement_source='iap'`, `iap_subscription_id` set, `has_trialed=true`, cache invalidated; `iap_event_log='processed'` |
| E2 | `INITIAL_PURCHASE` (annual) | same as E1, `tier=dpe_live` (annual product maps to `dpe_live`) |
| E3 | `RENEWAL` for an active iap sub | tier unchanged (`dpe_live`), period refreshed |
| E4 | `RENEWAL` for a lapsed (expired) user | re-grants `dpe_live` (treated like INITIAL_PURCHASE) |
| E5 | `PRODUCT_CHANGE` monthly→annual | stays `dpe_live`, `iap_subscription_id`/price updated |
| E6 | `BILLING_ISSUE` | **tier UNCHANGED** (`dpe_live`), dunning state recorded; no downgrade |
| E7 | `CANCELLATION` | **tier UNCHANGED** (`dpe_live`); cancel intent recorded; access persists |
| E8 | `EXPIRATION` (iap-owned) | `tier=checkride_prep`, `iap_subscription_id=null`, `entitlement_source='none'`, `has_trialed` **preserved**, cache invalidated |
| E9 | `UNCANCELLATION` | stays/returns `dpe_live` |
| E10 | `TRANSFER` (receipt moves to another account) | loser revoked, winner granted (both through precedence guard) |
| E11 | `store=STRIPE` event on the IAP endpoint | `iap_event_log='ignored'`, **no** `user_profiles` write |
| E12 | `environment=SANDBOX` event on the production endpoint | `'ignored'` + logged, no prod grant |
| E13 | Unknown `product_id` | logs, tier falls back to `checkride_prep` (never silent `dpe_live`) |

### 6.2 Ordering + idempotency

| # | Scenario | Expected result |
|---|---|---|
| O1 | Same `rc_event_id` delivered 5× | applied **once** (`deduplicated` on 2..5); DB diff == 1 application |
| O2 | Two concurrent deliveries of the same event | second sees `'processing'` < 60 s → `{in_flight:true}`, no double-process |
| O3 | EXPIRATION (older event time) delivered **after** RENEWAL (newer) | final state `dpe_live` (newer RENEWAL wins; out-of-order guard) |
| O4 | RENEWAL (newer) delivered before EXPIRATION (older) | final state `dpe_live` (older EXPIRATION ignored by event-time guard) |
| O5 | Handler throws mid-process | row `'failed'`, route returns 500 → RevenueCat retries; next delivery succeeds |
| O6 | Stale `'processing'` row (> 60 s) re-delivered | falls through and re-processes (recovers from a crashed prior attempt) |

### 6.3 Auth + transport

| # | Scenario | Expected result |
|---|---|---|
| A1 | Missing Authorization header | **401**, no log row, no write |
| A2 | Wrong Authorization value | **401**, constant-time compare (no timing leak), no write |
| A3 | Correct header, malformed body | 400, no `user_profiles` write |
| A4 | Ack latency under 200-event replay | p95 < 60 s, 0 RevenueCat disconnects |

### 6.4 Cross-provider blocking (marquee)

| # | Scenario | Expected result |
|---|---|---|
| X1 | **Production Stripe payer receives an IAP `INITIAL_PURCHASE`** | **tier UNCHANGED** (stays Stripe's `dpe_live`), `entitlement_source` stays `'stripe'`, IAP event `'ignored'`, **one owner alert** names both subscription ids. (Headline acceptance gate.) |
| X2 | Live IAP payer's Stripe `checkout.session.completed` arrives | Stripe grant **blocked**, no Stripe state written, alert fired |
| X3 | Override user + live Stripe sub + IAP purchase attempt | `getUserTier==='dpe_live'` (override max() intact); IAP still blocked by Stripe |
| X4 | DB invariant after the full suite | **0** accounts with both `stripe_subscription_id` and `iap_subscription_id` non-null |

### 6.5 Eligibility + client

| # | Scenario | Expected result |
|---|---|---|
| C1 | Free/trial user → `/api/iap/eligibility` | `{eligible:true, reason:'trial_or_free'}` → paywall shown |
| C2 | Live Stripe payer → eligibility | `{eligible:false, reason:'has_web_subscription'}` → **no** IAP UI, no web link/price |
| C3 | Live IAP payer → eligibility | `{eligible:false, reason:'already_subscribed_iap'}` |
| C4 | Override user → eligibility | `{eligible:false, reason:'override_access'}` |
| C5 | Restore on a paid Apple ID (2nd device) | re-grants `dpe_live` within ≤ 60 s; cross-device access (3.1.2(a)) |
| C6 | Reviewer demo (override) runs an exam | ≥ 3 exchanges, **0** `trial_*` 403s (2.1 gate) |

### 6.6 Trial-gate interaction (regression — web unchanged)

| # | Scenario | Expected result |
|---|---|---|
| T1 | New iOS user, no purchase | gets the same app-side 7-day/3-exam trial; `trial_limit_reached` after 3 (`session/route.ts:87-89`) |
| T2 | iOS user buys IAP mid-trial | `dpe_live` → trial gate bypassed (`isPaying`); `hasLiveSubscription` read-through honors `iap_subscription_id` (extend §2 of `session/route.ts:113` to also read `iap_subscription_id`) |
| T3 | IAP sub expires (E8) → user back to free | trial gate keys on `has_trialed=true` → `resubscribe_required` (no second free trial; `session/route.ts:124`) |

> **NOTE — `hasLiveSubscription` must also read IAP.** The session route's read-through paid bypass currently keys on `stripe_subscription_id` only (`session/route.ts:113`). M4 must extend it to `!!stripe_subscription_id || !!iap_subscription_id` so a just-purchased IAP payer isn't trial-blocked by a stale tier cache — the exact symmetric reason the Stripe read-through exists. This is the **one** existing-line change M4 makes to the trial path; everything else is additive.

**Overall measurable gate:** **100%** of the rows above pass in CI (Vitest for server logic + canned-fixture webhook replays; the device-dependent rows C5/C6/T1–T3 run in the M4 manual pass). The marquee gate **X1** is a hard release blocker.

---

## 7. Android billing — explicit later-phase decision

**Qualitative "done":** Android is **out of scope for v1** and documented as a deliberate deferral, with the foundation already Android-ready (same `react-native-purchases` SDK, same single `/api/iap/webhook` branching on `store`, same `pro` entitlement).

- The same SDK takes a **Google public key** in `Purchases.configure` (§1.2 already branches on `Platform.OS`).
- The same webhook endpoint handles `store=PLAY_STORE` events with **no new code path** beyond a product-id map for the Play SKUs (and the env-policy reuse). `SUBSCRIPTION_PAUSED` (§2.2) is primarily an Android concern and is already specified.
- Play Console prerequisites (service-account permissions: View app information, View financial data, Manage orders and subscriptions; Activity `launchMode` `standard`/`singleTop`) and the Play Billing Library minimum are an **Android-phase** checklist item, not v1.
- **External-purchase / Play "User Choice Billing" / EEA External Offers fee programs** are explicitly NOT relied upon in v1 (iOS-only) and are revisited in the Android phase (`VERIFY-AT-SUBMISSION` fees at that time).

> **OWNER DECISION — Android purchase path.** When Android ships, decide between (a) Google Play Billing IAP (symmetric to iOS, RevenueCat), or (b) directing Android users to the existing **Stripe web checkout** (allowed on Android, no Apple 3.1.1 constraint) and importing via RevenueCat External Purchase Tracking. The architecture supports both; this is a business/fees decision, deferred.

**Measurable success criteria (deferral is correct, not a gap):**
- [ ] No Android product, Play key, or Play webhook branch is required for the v1 iOS release (the iOS suite in §6 is green without any of them).
- [ ] The webhook code path for `store=PLAY_STORE` exists and is **inert** in v1 (a `PLAY_STORE` fixture is `'ignored'` until the Android phase enables the product map) — proven by a single fixture test.

---

## 8. Open items / OWNER DECISIONS summary

1. **StoreKit Introductory Offer** on the IAP products — recommend **none** in v1 (app-side trial only). (§1.3)
2. **Sandbox vs. production environment** policy — recommend separate RevenueCat project/secret; production ignores `SANDBOX`. (§2.2)
3. **Webhook-lag read-through source** — recommend RevenueCat REST `GET /subscribers/{id}` server-side (symmetric to the Stripe `status` read-through). (§2.4)
4. **Android purchase path** — Play IAP vs. Stripe-web-link, deferred to the Android phase. (§7)
5. **Stripe import mechanism** — Stripe-app External Purchase Tracking vs. REST `POST /receipts` vs. both — `VERIFY-AT-SUBMISSION`. (§4 / §5)
6. **Whether the iOS app may show a non-actionable "manage on the website" informational line** for Stripe subscribers, or must say nothing — default **say nothing** pending Apple guidance. (§4.1)
7. **Account-deletion-vs-store-subscription** — v1 allows deletion: server detaches/deletes the RevenueCat subscriber (no false later restore) AND the UI warns the Apple sub keeps billing until cancelled in Apple Settings. Owner confirms the RevenueCat REST subscriber-delete call on the deletion path. (§3.5 / `screens/06-settings.md` D-SET-2)
8. **Store-conditional Terms clause (owner/legal action)** — IAP purchases are refunded by Apple/Google (report-a-problem), not the developer; the 7-day email-refund promise in Terms is reserved to web/Stripe. Add the store-conditional clause to Terms — NOT edited in this pass. (§3.6)

All other behavior is fully specified above against the verified web code (`tier-lookup.ts`, `stripe-tier.ts`, `session/route.ts`, `stripe/webhook/route.ts`, `stripe/checkout/route.ts`, `stripe/status/route.ts`, and the `subscription_events` / `user_entitlement_overrides` migrations).
