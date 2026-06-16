# Screen 07 — Paywall / Subscription (Upgrade)

> **Native screen specification for the HeyDPE iOS-first / Android-follows Expo app.**
> **Web source of truth:** `src/app/pricing/page.tsx` (marketing + Stripe checkout), `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/status/route.ts`, `src/app/api/stripe/portal/route.ts`, `src/app/api/session/route.ts:16-141` (the trial gate that *triggers* this screen).
> **Native payment authority:** RevenueCat IAP on iOS (Apple Guideline 3.1.1), Stripe on web/Android-link. The full entitlement-merge contract lives in **`docs/mobile/04-PAYMENTS-ENTITLEMENTS.md`** (task M4) — this screen spec references it for every server shape and is the *consumer* of that contract, not its definition.
> **Design system:** `docs/mobile/02-DESIGN-SYSTEM.md` (FLIGHT DECK, native-adapted). **API contract:** `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (Part B route table + per-route shapes).
>
> **Route file:** `apps/mobile/app/upgrade.tsx` (`presentation: 'formSheet'`, per `02-DESIGN-SYSTEM.md §6.1`). The screen is a **sheet presented over the tab bar** — never a tab, never a full page.

---

## 0. The one rule, applied to this screen (typography discipline)

Per `02-DESIGN-SYSTEM.md §0/§3` and the LOCKED FLIGHT DECK rule — **caps-mono + glow ONLY for instrument moments**. On this screen that means:

- **Caps-mono (`<MicroLabel>` / `<Annunciator>` / `<CodeChip>` primitives):** the `// Pricing` micro-label, the `BEST VALUE` badge, the `RESTORE` / `MANAGE ON WEB` annunciator-style affordances, and the **prices themselves** as numeric readouts (`$39`, `$299`, `$24.92/mo` → `<NumericReadout>` JetBrains Mono `tabular-nums`).
- **Glow:** the brand `DPE` wordmark in the header (when shown) and the **primary CTA** ("Start unlimited") only. The price `$39`/`$299` may carry the amber static text-shadow glow (web `glow-a` on `pricing/page.tsx:230`) — it is a brand instrument moment.
- **Everything else is sentence-case IBM Plex:** plan names ("Monthly", "Annual"), descriptions, feature bullets, FAQ, legal links, error copy, button labels other than the CTA word-mark. **Never 10px; hard 12pt floor. Touch targets ≥ 44pt iOS / 48dp Android.**

---

## 1. Purpose & role in the product; IA placement

### Purpose
A single native **purchase + entitlement-recovery surface** that converts a trial/free user into a paid subscriber, or restores an already-entitled user without charging again. It is the iOS-compliant replacement for the web `pricing/page.tsx` checkout flow: on iOS, subscriptions MUST be sold through Apple IAP via RevenueCat (Apple Guideline 3.1.1), not a Stripe web link.

It serves **five distinct user intents**, all on one screen via state:
1. **Buy** — a trialing user purchases monthly or annual via RevenueCat IAP (StoreKit 2 under the hood).
2. **Restore** — a user who already paid (on this Apple ID / another device) recovers entitlement: `Purchases.restorePurchases()`.
3. **Existing web subscriber sign-in** — a user who already pays via Stripe on the web does **not** need to buy IAP; once signed in, the server entitlement merge grants `dpe_live` and the paywall self-dismisses with "You're already subscribed."
4. **Manage** — an already-entitled user sees their plan and a platform-correct management link (Apple Settings for IAP; "Manage on web" billing portal for Stripe-originated subs).
5. **Read the offer** — the marketing/value content (plan comparison, value-vs-CFI, FAQ) for an undecided user.

### Role / where it sits in the IA
- It is **not** one of the 4 bottom tabs (Home · Practice · Progress · Settings, `02-DESIGN-SYSTEM.md §6.3`). It is a **modal sheet route** (`upgrade.tsx`, `presentation: 'formSheet'`, `§6.1`/`§6.2`) presented **over** the tab bar from the root stack, so it can appear from anywhere.
- It is the **terminal destination** of the three trial-block 403s from `POST /api/session` create (`session/route.ts:68-141`): `trial_limit_reached`, `trial_expired`, `resubscribe_required` — the same codes the web routes to its upgrade modal (`practice/page.tsx:732-739`). On mobile they open this sheet.
- It is reachable from **Settings → Plan & usage → "Upgrade plan"** (web `settings/page.tsx:1249-1364` "Upgrade plan"→`/pricing`; native → present `upgrade.tsx`).

#### Qualitative requirements
- One screen handles buy / restore / already-subscribed / manage without the user navigating elsewhere.
- The screen is honest about *which* path applies: an existing web subscriber is never asked to pay twice; an IAP subscriber is never sent to a Stripe portal.
- It never blocks the app's free, value-delivering surfaces (Home/Progress/Settings remain usable when the sheet is dismissed).

#### Measurable success criteria
- [ ] The screen is registered as exactly one route `apps/mobile/app/upgrade.tsx` with `presentation: 'formSheet'` (grep: exactly one paywall route file).
- [ ] All three 403 reason codes (`trial_limit_reached` / `trial_expired` / `resubscribe_required`) present **this** sheet — link-test matrix, 3/3.
- [ ] The sheet is reachable from Settings "Upgrade plan" and presents over the active tab — pass/fail.
- [ ] Dismissing the sheet returns the user to exactly the prior screen with tab bar intact — pass/fail.

---

## 2. Entry points & navigation

| # | Entry point | Trigger / source | Navigation action | Reason context passed |
|---|---|---|---|---|
| E1 | **Trial exam-count cap** | `POST /api/session` create → `403 {error:'trial_limit_reached', upgrade_url:'/pricing', limit:3}` (`session/route.ts:87-89`) | `router.push('/upgrade?reason=trial_limit_reached')` | "You've used all 3 free exams." |
| E2 | **Trial window expired** | `POST /api/session` create → `403 {error:'trial_expired', windowDays:7}` (`session/route.ts:131-133`) **or** mid-exam `POST /api/exam` → `403 {error:'session_expired'}` (`exam/route.ts:413-418`) | `router.push('/upgrade?reason=trial_expired')` | "Your 7-day free trial has ended." |
| E3 | **Churned / once-subscribed** | `POST /api/session` create → `403 {error:'resubscribe_required'}` (`session/route.ts:124-126`) | `router.push('/upgrade?reason=resubscribe_required')` | "Welcome back — resubscribe to continue." |
| E4 | **Settings → Upgrade plan** | User tap in Settings "Plan & usage" card (free/trial user) | `router.push('/upgrade?reason=settings')` | Generic offer (no annunciator banner) |
| E5 | **Home / Progress soft CTA** | A "Go unlimited" promo card or a weak-area gate | `router.push('/upgrade?reason=promo')` | Generic offer |
| E6 | **Deep link / universal link** | `heydpe://upgrade` or `https://heydpe.com/upgrade` | expo-router resolves to `upgrade.tsx` (modal anchored via `unstable_settings`, `§6.2`) | Generic offer |
| E7 | **Post-onboarding** (optional) | Onboarding "Explore first" path never blocks; the *first* count-capped exam later routes via E1. Onboarding exam is **free + uncounted** (`session/route.ts:42-60`) — onboarding never opens this sheet. | n/a | n/a |

**Navigation pattern (LOCKED, per `02-DESIGN-SYSTEM.md §5.7/§6`):**
- iOS: **form sheet** (`presentation: 'formSheet'`) with system detents + a grabber handle; draggable, swipe-down-to-dismiss, system corner radius. HIG Sheet.
- Android: **Material 3 modal bottom sheet** (16dp top corners, drag handle in `c-border-hi`), `elevation: 8` (`§4.4`).
- The sheet presents **over** the tab bar from the root `Stack` (`§6.2`), so the underlying tab context is preserved on dismiss.
- The `reason` query param drives the annunciator banner copy (§3).

#### Qualitative requirements
- Every block path lands here with the *correct* contextual headline; the user always knows why they're seeing it.
- The deep link resolves even on cold start (anchored back stack), landing the user inside the tab IA after dismiss.

#### Measurable success criteria
- [ ] 6 live entry points (E1–E6) all resolve to `upgrade.tsx` with the correct `reason` param — link-test matrix, 6/6.
- [ ] Cold-start deep link `heydpe://upgrade` opens the sheet and dismiss returns to Home (not a dead-end) — pass/fail.
- [ ] Onboarding flow **never** opens this sheet (the onboarding exam is uncounted) — pass/fail E2E.

---

## 3. STATE MATRIX

> All copy below is **final, sentence-case** (except the noted instrument tokens). Tokens cited are FLIGHT DECK semantic tokens from `02-DESIGN-SYSTEM.md §2.1` consumed via `useTheme()` — **no hex literals in the screen file** (`§2.5`).

### 3.0 Reason-banner annunciator (top of sheet, present for E1–E3 only)

A `<Annunciator status="info|active">` style header strip (caps-mono, `c-amber` on `c-bezel`), one line, with a sentence-case sub-line below it.

| `reason` | Annunciator label (caps-mono) | Sub-line (sentence-case Plex) | Token |
|---|---|---|---|
| `trial_limit_reached` | `TRIAL COMPLETE` | "You've used all 3 free practice exams. Go unlimited to keep going." | `c-amber` text on `c-bezel`; glow off (it's a banner, not live status) |
| `trial_expired` | `TRIAL EXPIRED` | "Your 7-day free trial has ended. Subscribe to continue practicing." | `c-amber` |
| `resubscribe_required` | `WELCOME BACK` | "Your previous subscription ended. Resubscribe to pick up where you left off." | `c-cyan-readable` |
| `settings` / `promo` / deep link | *(no banner)* | *(no banner)* | n/a |

### 3.1 Loading

| Sub-state | When | UI | Copy | Tokens |
|---|---|---|---|---|
| **L1 — Offerings fetch** | On sheet mount, `Purchases.getOfferings()` in flight | Two plan-card skeletons (shimmer disabled under reduce-motion → static `c-bezel` blocks), CTA disabled | *(no text; price slots show `— —` placeholder in `c-dim` tabular-nums)* | skeleton on `c-bezel`; price slot `c-dim` |
| **L2 — Entitlement check** | On mount, `Purchases.getCustomerInfo()` + `GET /api/user/tier` in parallel to decide buy-vs-manage | Plan cards render but CTA shows spinner | CTA spinner only | `c-amber` spinner |
| **L3 — Purchase in flight** | After CTA tap, StoreKit/RevenueCat purchase sheet handed to OS, awaiting callback | CTA disabled + inline spinner; **the Apple/Google system purchase sheet is the foreground UI** | "Contacting the App Store…" (below CTA, `c-muted`) | CTA disabled `opacity 0.5`; helper `c-muted` |
| **L4 — Restore in flight** | After "Restore purchases" tap | "Restore" affordance shows spinner | "Checking your purchases…" | `c-muted` |
| **L5 — Web-sub verify** | After sign-in / on resume, polling `GET /api/stripe/status` + `GET /api/user/tier` for entitlement | Full-card spinner overlay | "Confirming your subscription…" | `c-muted` |

### 3.2 Success

| Sub-state | When | UI | Copy | Tokens |
|---|---|---|---|---|
| **S1 — IAP purchase complete** | RevenueCat `customerInfo.entitlements.active['pro']` now active **and** server `/api/user/tier` returns `dpe_live` | Green annunciator, success haptic, auto-dismiss after 1.5s OR explicit "Start practicing" | `SUBSCRIBED` (annunciator) + "You're all set. Unlimited exams unlocked." | `<Annunciator status="active">` `c-green-readable`; haptic `notificationAsync(Success)` (`§7.3`) |
| **S2 — Restore success** | `restorePurchases()` returns an active `pro` entitlement | Same green success path | `RESTORED` + "Your subscription is active again." | `c-green-readable` |
| **S3 — Already entitled (web/Stripe)** | On mount the merged entitlement is already `dpe_live` (existing Stripe subscriber) | Sheet shows a **manage** state, not a buy state (see §4 flow F3) | `SUBSCRIBED` + "You're subscribed on the web. Nothing to buy here." + "Manage on web" affordance | `c-green-readable`; `MANAGE ON WEB` annunciator-link `c-cyan-readable` |
| **S4 — Already entitled (IAP)** | Active `pro` from an App Store purchase | Manage state with Apple-Settings link | `SUBSCRIBED` + "Manage or cancel in your Apple Subscriptions settings." | `c-green-readable` |

### 3.3 Error (per failure mode)

| Code | Failure mode | Copy (sentence-case) | Recovery affordance | Tokens / haptic |
|---|---|---|---|---|
| **ER1** | `getOfferings()` returns no current offering / empty packages | "We couldn't load subscription options right now. Pull to retry." | "Retry" (tertiary button) | `c-red` banner; `notificationAsync(Error)` |
| **ER2** | Purchase **user-cancelled** (RC `userCancelled === true`) | *(silent — no error toast; return to offer state)* | none (CTA re-enabled) | no haptic, no banner |
| **ER3** | Purchase failed — payment/store error (RC error, not cancel) | "That purchase didn't go through. No charge was made — try again." | "Try again" | `c-red`; `notificationAsync(Error)` |
| **ER4** | Purchase succeeded at the store but **server entitlement not yet `dpe_live`** (webhook race; RC→our backend lag) | "Payment received — activating your subscription. This can take a moment." | auto-poll `GET /api/user/tier` every 3s up to 30s, then "Restore purchases" | `c-amber` (pending, not error) |
| **ER5** | `restorePurchases()` finds **no** entitlement on this Apple ID | "No purchases found on this Apple ID. If you subscribed on the web, sign in with that account." | "Sign in" (→ login) + "Contact support" | `c-muted` (informational, not red) |
| **ER6** | Network offline | "You're offline. Connect to the internet to subscribe or restore." | "Retry" once back online (auto-detect) | `c-red`; offline §3.4 |
| **ER7** | `/api/user/tier` or `/api/stripe/status` → `401` (token expired) | "Your session expired. Sign in again to continue." | "Sign in" (→ `(auth)/login`) | `c-amber` |
| **ER8** | `/api/*` → `429 rate_limited` (middleware, `01-API…:279`) | "Too many requests — please wait a moment and try again." | auto-retry after `Retry-After` seconds (read header) | `c-amber`; honors `Retry-After` |
| **ER9** | RevenueCat not configured / SDK in Preview API Mode (Expo Go / sim without StoreKit config) | "In-app purchases aren't available in this build." | dev-only diagnostic; in prod this state must be impossible | `c-dim` (dev banner) |
| **ER10** | Server `/api/iap/*` validate error (see `04-PAYMENTS-ENTITLEMENTS.md`) | "We couldn't verify your purchase. Tap 'Restore purchases' or contact support." | "Restore purchases" + "Contact support" | `c-red`; `notificationAsync(Error)` |

### 3.4 Offline / degraded
- On mount with no connectivity: render the **static marketing content** (plans, prices from a cached last-known offering if available, value table, FAQ) but **disable** the CTA and Restore with an inline "You're offline" note (ER6). Never show a blank sheet.
- Prices: if `getOfferings()` cannot reach the store, fall back to **last-cached package prices** (persisted from the last successful fetch); if none, show the **hardcoded display fallback** matching Stripe (`$39/mo`, `$299/yr`) marked as "approximate — connect to confirm". The store price string is always preferred when online.

### 3.5 Permission-denied / not-applicable
- **No OS permission is required** to render or purchase (no camera/mic/location/notifications on this screen). The only "permission-like" gate is **authentication**: a paywall reached while signed-out (rare — entry points are post-auth) shows ER7's sign-in path. IAP itself requires a signed-in Apple ID, which the OS purchase sheet handles natively (we never see Apple credentials).

#### Qualitative requirements
- Every failure mode has a *distinct*, non-alarming message and a concrete next action; no dead "Something went wrong."
- User-cancel is silent (ER2) — cancelling a purchase is normal, not an error.
- The "payment succeeded but entitlement pending" race (ER4) reads as *progress*, never as a failure or a double-charge risk.

#### Measurable success criteria
- [ ] All 10 error codes (ER1–ER10) have unique copy strings and a defined recovery affordance — table audit, 10/10.
- [ ] User-cancel (ER2) shows **0** error toasts and re-enables the CTA within 300ms — pass/fail.
- [ ] ER4 auto-polls `/api/user/tier` and resolves to S1 within 30s when the webhook lands; otherwise surfaces "Restore" — timed E2E.
- [ ] Offline mount (ER6) renders prices + value content and disabled controls — **0** blank sheets — pass/fail.
- [ ] No state renders any text below 12pt or any caps-mono button label (grep + runtime scan) — pass/fail.

---

## 4. User flows

### F1 — Happy path: trialing user buys (IAP)
1. User taps "Start exam" / answers an exam → `POST /api/session` create returns `403 trial_limit_reached` (E1).
2. App presents `upgrade.tsx` form sheet with the `TRIAL COMPLETE` banner (§3.0). Haptic: `notificationAsync(Error)` on the block (the *block*, fired by the caller), then a neutral sheet entrance.
3. Sheet mounts → L1/L2 loading → plan cards render with **store prices** from `offerings.current.availablePackages` (Annual pre-selected, `BEST VALUE`, mirroring web `popular: true` on annual, `pricing/page.tsx:43`).
4. User selects a plan (selection haptic `selectionAsync()`), taps **"Start unlimited"** (primary CTA, medium-impact haptic `impactAsync(Medium)`, `§7.3`).
5. `Purchases.purchasePackage(pkg)` → the **Apple system purchase sheet** appears (Face ID / password). L3.
6. On success RevenueCat returns `customerInfo`; `entitlements.active['pro']` is active. App calls `GET /api/user/tier` (and the IAP-sync endpoint per `04-PAYMENTS…`) to confirm server `dpe_live`.
7. Server returns `dpe_live` → **S1 success**, success haptic, "You're all set." → auto-dismiss after 1.5s OR "Start practicing" returns the user to the exam they were blocked on, which now succeeds.

### F2 — Restore purchases
1. User (new device / reinstall, already paid on this Apple ID) opens the sheet and taps **"Restore purchases"** (always-visible affordance, Apple-required).
2. `Purchases.restorePurchases()` → L4. RevenueCat aliases the store receipt to the current App User ID (`appUserID` = our Supabase user id — the linchpin, RevenueCat research §6).
3. Active `pro` found → confirm server `dpe_live` → **S2 success "Restored."** If none → **ER5** ("No purchases found… sign in with your web account").

### F3 — Existing web (Stripe) subscriber — no IAP needed
1. The user already pays via Stripe on the web. They sign in to the app (their Supabase user id is the **same App User ID** RevenueCat sees, so the imported Stripe entitlement maps — RevenueCat research §6(a)).
2. On sheet mount, the merged entitlement is already `dpe_live`: `GET /api/user/tier` → `dpe_live`, and/or RevenueCat `customerInfo` shows `pro` active via `store: STRIPE`.
3. The sheet renders the **manage** state **S3**: "You're subscribed on the web. Nothing to buy here." with a **"Manage on web"** affordance that opens the Stripe billing portal: `POST /api/stripe/portal` → `{url}` → open in an in-app browser / external Safari (the portal is a web surface; Apple permits linking out to *manage* an existing web subscription).
4. **No IAP purchase is offered** in this state (prevents double-billing — the server entitlement merge guarantees Stripe and IAP never stack, LOCKED decision + `04-PAYMENTS…`).

### F4 — Manage (IAP-originated sub)
1. Entitlement is `dpe_live` from an **App Store** purchase (`store: APP_STORE`). Sheet renders **S4**: "Manage or cancel in your Apple Subscriptions settings."
2. "Manage subscription" opens the Apple Subscriptions deep link (`itms-apps://apps.apple.com/account/subscriptions` / native API). **Never** a Stripe portal for an IAP sub.

### F5 — Sign-in path from the paywall (account recovery)
1. User on the paywall realizes they have a web account (ER5 or a "Already a subscriber? Sign in" link).
2. Tap → present `(auth)/login` (over the sheet or replacing it). On successful auth, return to `upgrade.tsx`, re-run the entitlement check → if web-subscribed, F3 (S3) self-resolves.

### Edge cases & interruption behavior
- **Back / swipe-down dismiss mid-offer (no purchase started):** sheet dismisses, user returns to the prior screen; the trial block remains in effect (the blocked exam was never created). No state lost.
- **Background during the Apple purchase sheet (L3):** OS owns the purchase; on return RevenueCat's purchase promise resolves/rejects normally. If the app was killed mid-purchase, on next launch `getCustomerInfo()` reflects the true state (StoreKit 2 is the source of truth) and the sheet shows S1/S4 if it completed (RevenueCat research §3).
- **Double-tap CTA:** CTA disables on first tap (L3); a second tap is a no-op (idempotent guard).
- **Purchase succeeds, server lags (ER4):** never show "failed"; poll then offer Restore. The app **already** grants client-side entitlement from RevenueCat `customerInfo` so the user is not locked out while the server catches up (gate read-through, `04-PAYMENTS…`).
- **Pending parental-approval (Ask to Buy):** RevenueCat returns a deferred state; show "Your purchase is awaiting approval." and dismiss; entitlement activates later via webhook → app reflects on next `getCustomerInfo()`.

#### Qualitative requirements
- Buy, restore, web-subscriber, and IAP-manage are four visibly distinct, correct outcomes — the user is never offered a purchase they don't need.
- Interruptions (background, kill, cancel) never leave a charged-but-locked or double-charged state.

#### Measurable success criteria
- [ ] F1 end-to-end (block → buy → server `dpe_live` → blocked exam succeeds) passes in StoreKit sandbox — E2E pass/fail.
- [ ] F3 web-subscriber: with a Stripe-active test account, the sheet shows **0** IAP buy buttons and exactly one "Manage on web" → portal URL opens — pass/fail.
- [ ] F4 IAP-manage routes to Apple Subscriptions, **never** the Stripe portal — pass/fail.
- [ ] Kill-app-mid-purchase: on relaunch the entitlement state is correct within one `getCustomerInfo()` call — sandbox test.
- [ ] **0** scenarios produce a stacked Stripe+IAP charge for one account (server merge audit + sandbox test).

---

## 5. API calls

> Auth: every authenticated call sends `Authorization: Bearer <supabase_jwt>` (per `01-API…` §A.1, helper `getAuthedUser`). The client reads `Retry-After` and backs off on 429 (`01-API…:279`).

### 5.1 RevenueCat SDK calls (client-only, no HTTP to our backend)
| Call | When | Handling |
|---|---|---|
| `Purchases.configure({ apiKey: APPLE_KEY, appUserID: <supabaseUserId> })` | App init (once), **App User ID = our Supabase user id** (RevenueCat research §1/§6 — the coexistence linchpin) | Configure on launch after auth; `Purchases.logIn(userId)` on sign-in, `logOut()` on sign-out |
| `Purchases.getOfferings()` | Sheet mount (L1) | Use `offerings.current.availablePackages`; map `$rc_monthly`/`$rc_annual` packages to the two cards. ER1 on empty. |
| `Purchases.getCustomerInfo()` | Sheet mount (L2), and after background-return | `entitlements.active['pro']` decides buy vs manage state |
| `Purchases.purchasePackage(pkg)` | CTA tap (F1.5) | Success → confirm server; `userCancelled` → ER2 (silent); other error → ER3 |
| `Purchases.restorePurchases()` | "Restore purchases" tap (F2) | Active `pro` → S2; none → ER5 |

### 5.2 Our backend (HTTP) — entitlement confirmation & management
| Endpoint | Method | When | Contract ref | Handling |
|---|---|---|---|---|
| `GET /api/user/tier` | GET (Bearer) | Mount + after purchase/restore + ER4 poll | `01-API…` B.8 (route #8); returns `{ tier, subscriptionStatus, cancelAtPeriodEnd, … }` (`01-API…:485`) | The **authoritative post-merge entitlement read on iOS** — `tier === 'dpe_live'` = paid. After the M4 merge this reflects IAP **and** Stripe (`01-API…` B.17 note). |
| `POST /api/iap/*` (validate / sync) | POST (Bearer) | Immediately after a successful `purchasePackage` (push the receipt / confirm entitlement) | **NEW (M4)** route #24, shapes defined in **`docs/mobile/04-PAYMENTS-ENTITLEMENTS.md`** (forward-referenced, `01-API…:277`) | On success the server has set `dpe_live` + invalidated the tier cache (parallels Stripe webhook). ER10 on failure → Restore. |
| `GET /api/stripe/status` | GET (Bearer) | F3 / F5 — confirming an existing **web** subscriber | `01-API…` B.17 (route #17); returns `{ tier, status, cancelAt, cancelAtPeriodEnd, currentPeriodEnd }` or `{ tier, status:'free' }` (`status/route.ts:28-75`) | Reflects only the Stripe/web path on iOS (`01-API…:540`). Used to render F3's "subscribed on the web" + portal link. |
| `POST /api/stripe/portal` | POST (Bearer) | F3 "Manage on web" tap | `01-API…` B.18 (route #18); `{url}` or `400 {error:'No subscription found'}` (`portal/route.ts:11-37`) | Open the returned URL in an in-app browser. **Only shown for Stripe-originated subs** (`01-API…:544`). |

### 5.3 What we **do NOT** call on iOS
- **`POST /api/stripe/checkout`** (`checkout/route.ts`) is the **web** purchase path and **must not** be invoked from the iOS app to *sell* a subscription (Apple Guideline 3.1.1 — IAP is the iOS purchase path). It remains the Android-link / web path (LOCKED decision). The web `401 → /login?redirect=/pricing&plan=` redirect (`pricing/page.tsx:141-144`) has **no iOS analog** because iOS never calls checkout to buy.

### 5.4 Error / 429 handling (cross-cutting)
- **429** on any backend call: read `Retry-After`, `X-RateLimit-Reset` (`01-API…:279`), show ER8, auto-retry once after the header delay. `/api/stripe/checkout` is rate-limited 5/min·user on web but is not called here; `/api/user/tier` and `/api/stripe/*` have no per-route limit entry (unlimited at middleware) but still respect global breach.
- **401**: token expired → ER7 sign-in.
- **5xx / network**: ER3/ER6/ER10 with retry; the RevenueCat purchase itself is the source of truth, so a transient backend 5xx **after** a successful store purchase becomes ER4 (pending), never a "purchase failed."

#### Qualitative requirements
- The store purchase result and the server entitlement are reconciled deterministically: store success + server lag = pending, never failure.
- iOS never sells via Stripe checkout; web subscribers are recognized without a second charge.

#### Measurable success criteria
- [ ] `POST /api/stripe/checkout` is **never** called from the iOS app to initiate a purchase (network-log audit; grep the mobile app for `stripe/checkout` → 0 buy-path hits) — pass/fail.
- [ ] Every backend call sends `Authorization: Bearer` and **0** rely on cookies — network audit.
- [ ] On a 429, the client waits exactly `Retry-After` seconds before its single auto-retry — timed test.
- [ ] After `purchasePackage` success, the app calls the M4 IAP-sync endpoint and then `GET /api/user/tier`, and renders S1 only when `tier === 'dpe_live'` — sequence assert.

---

## 6. Layout

### Text description
A native form sheet (iOS) / modal bottom sheet (Android), scrollable, presented over the tab bar. Top: a grabber/handle (`c-border-hi`). Then, for E1–E3, the **reason annunciator banner** (caps-mono label + sentence-case sub-line). Then the `// Pricing` micro-label and an H1 ("Go unlimited") in sentence-case Plex (interior-page scale, no glow). Below: **two plan cards** (Annual first / pre-selected with the `BEST VALUE` badge, then Monthly) each showing plan name (Plex), description (Plex `c-muted`), the **price as a numeric readout** (`$299` / `$39` in JetBrains Mono tabular-nums, amber, with optional static glow), the per-period and savings sub-line (`c-green-readable`), and a compact feature list (mirroring `pricing/page.tsx` plan `features`, trimmed to ~4 lines for sheet height). A single **primary CTA** ("Start unlimited") acts on the selected plan. Below the CTA: the **trust row** (✓ 7-day trial already used up-front / ✓ cancel anytime / ✓ secure payment) and, critically, the **store-compliance footer**: "Restore purchases", "Terms", "Privacy", and the auto-renew disclosure. A collapsible "Compare plans" / FAQ section sits at the bottom for the undecided reader (the value-vs-CFI table from `pricing/page.tsx:88-95` and the 6 FAQs `:47-72`, rendered as native disclosure rows).

In the **manage** states (S3/S4) the plan cards are replaced by a single subscribed-status card (green annunciator + plan + renewal date from `GET /api/user/tier` / `stripe/status`) and the platform-correct management affordance.

### ASCII wireframe — portrait (buy state, E1)
```
┌─────────────────────────────────────────────┐
│                 ══════                        │  ← grabber (c-border-hi)
│  ┌─────────────────────────────────────────┐ │
│  │ TRIAL COMPLETE                          ▲│ │  ← reason annunciator (caps-mono, c-amber)
│  └─────────────────────────────────────────┘ │
│  You've used all 3 free practice exams.       │  ← sub-line (Plex, c-muted)
│                                               │
│  // PRICING                                   │  ← MicroLabel (caps-mono, c-cyan)
│  Go unlimited                                 │  ← H1 (Plex SemiBold, c-text, no glow)
│  Unlimited oral-exam practice, all 3 ratings. │  ← lead (Plex, c-muted)
│                                               │
│  ┌──────────────── BEST VALUE ──────────────┐│  ← badge (caps-mono pill, c-amber bg)
│  │ Annual                          ◉ selected││  ← plan name (Plex) + radio
│  │ Save $169/year (36% off)                  ││  ← desc (Plex, c-muted)
│  │ $299 /yr                                  ││  ← NumericReadout (mono tabular, c-amber, glow)
│  │ That's $24.92/mo — billed annually        ││  ← savings (c-green-readable)
│  │ ✓ Unlimited exams  ✓ All 3 ratings        ││
│  │ ✓ Full voice mode  ✓ Priority support     ││  ← features (Plex, c-text)
│  └───────────────────────────────────────────┘│
│  ┌───────────────────────────────────────────┐│
│  │ Monthly                         ○         ││
│  │ Full access, billed monthly               ││
│  │ $39 /mo                                   ││  ← NumericReadout (mono tabular, c-amber)
│  │ ✓ Unlimited exams  ✓ All 3 ratings        ││
│  │ ✓ Full voice mode  ✓ Cancel anytime       ││
│  └───────────────────────────────────────────┘│
│                                               │
│  ┌───────────────────────────────────────────┐│
│  │            Start unlimited                ││  ← PRIMARY CTA (c-amber, c-bg label, glow)
│  └───────────────────────────────────────────┘│
│  ✓ Cancel anytime   ✓ Secure payment          │  ← trust row (Plex, c-muted)
│  Renews automatically. Cancel anytime in       │  ← auto-renew disclosure (Plex, c-dim, ≥12pt)
│  Apple Subscriptions settings.                 │
│                                               │
│  Restore purchases · Terms · Privacy          │  ← compliance footer (tap targets ≥44pt)
│                                               │
│  ▼ Compare plans & FAQ                         │  ← disclosure (native list rows)
└─────────────────────────────────────────────┘
```

### ASCII wireframe — manage state (F3, existing web subscriber)
```
┌─────────────────────────────────────────────┐
│                 ══════                        │
│  ┌─────────────────────────────────────────┐ │
│  │ SUBSCRIBED                               │ │  ← annunciator (caps-mono, c-green-readable)
│  └─────────────────────────────────────────┘ │
│  You're subscribed on the web. Nothing to      │
│  buy here.                                     │
│                                               │
│  Plan        Annual ($299/yr)                  │  ← from stripe/status (Plex + mono price)
│  Renews      Mar 14, 2027                       │  ← currentPeriodEnd
│                                               │
│  ┌───────────────────────────────────────────┐│
│  │            Manage on web                  ││  ← secondary → POST /api/stripe/portal
│  └───────────────────────────────────────────┘│
│  Terms · Privacy                               │
└─────────────────────────────────────────────┘
```

### Landscape / tablet
- **Phone landscape:** the form sheet remains a single scrollable column (no two-up plan layout); the value/FAQ table scrolls horizontally if needed but the two plan cards stay stacked for thumb reach.
- **iPad / large Android tablet:** the sheet renders at form-sheet width (centered, max ~520pt); plan cards **may** sit side-by-side (mirroring web `md:grid-cols-2`, `pricing/page.tsx:206`) when width ≥ 600pt — OWNER DECISION below.

> **OWNER DECISION — tablet two-up plan cards.** Web shows plans side-by-side at `md` (`pricing/page.tsx:206`). Recommendation: ship v1 as a single stacked column on phone (thumb-first) and allow the two-up layout only on iPad/tablet ≥ 600pt. Owner to confirm whether iPad parity is in v1 scope (iPad is not explicitly in the 7-screen parity set; default = phone-first, tablet = stacked unless owner opts in).

### Native navigation pattern
- iOS: `Stack.Screen name="upgrade" options={{ presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: ['large'] }}` (a paywall is content-dense → `large` detent; not a partial-height sheet). Header hidden (the grabber + a top-right "Close" / "✕" suffice); HIG Sheet.
- Android: Material 3 modal bottom sheet, 16dp top corners, drag handle, `elevation: 8` (`02-DESIGN-SYSTEM.md §4.4/§5.7`). System Back dismisses (never traps, `§6.5`).

#### Qualitative requirements
- The buy decision (two plans + one CTA) is fully visible above the fold on a standard phone before any scroll; marketing depth (compare/FAQ) is below.
- The compliance footer (Restore / Terms / Privacy / auto-renew disclosure) is always reachable and never clipped by the safe area.

#### Measurable success criteria
- [ ] On a 390×844pt phone (iPhone 14) at default Dynamic Type, both plan cards + the CTA are visible without scrolling — screenshot check.
- [ ] Plan radii: cards 12, CTA 8, badge pill 6 (`02-DESIGN-SYSTEM.md §4.3`) — measured, 3/3.
- [ ] iOS uses `presentation: 'formSheet'` with a visible grabber; Android uses a Material bottom sheet with a drag handle — platform check.
- [ ] The compliance footer is above the home-indicator safe-area inset on every test device — pass/fail.

---

## 7. Native components & interactions

| Concern | Implementation |
|---|---|
| **System components** | iOS form sheet (`presentation:'formSheet'`) / Android Material bottom sheet (`§5.7`); the **Apple/Google system purchase sheet** is OS-owned (we never render the payment UI); plan cards = `<Surface elevation="card">` (`§4.4`); CTA = `<Button variant="primary">` (`§5.1`); plan select = native radio/segmented row; badge = `<Annunciator>`; price = `<NumericReadout>`; FAQ = native disclosure `<ListRow>` (`§5.5`). |
| **Plan selection** | Tappable plan card toggles selection (radio semantics); `selectionAsync()` haptic on change (`§7.3`). Full-card tap target ≥ 44pt/48dp. |
| **Gestures** | Sheet **swipe-down to dismiss** (iOS detent drag / Android drag handle); CTA is a standard press; FAQ rows expand/collapse on tap. iOS interactive swipe-back N/A (it's a sheet, not a pushed screen) — dismissal is the drag-down + an explicit Close control (both required, `§5.7`). |
| **Haptics** (`expo-haptics`, `§7.3`) | CTA "Start unlimited" → `impactAsync(Medium)`; plan toggle → `selectionAsync()`; purchase/restore success → `notificationAsync(Success)`; purchase store-error → `notificationAsync(Error)`; the *triggering* trial block (caller) → `notificationAsync(Error)`. No haptic on user-cancel (ER2). Respect Settings "Haptics" + OS setting. |
| **Keyboard** | No text inputs on this screen (purchase is OS-native) → no keyboard handling needed. The sign-in path (F5) hands off to the Login screen which owns its own keyboard avoidance. |
| **Safe-area / notch / Dynamic Island** | Sheet content respects top safe-area below the grabber and **bottom safe-area** above the home indicator (the compliance footer must clear it). Default horizontal inset 16pt (`§4.4`). Dynamic Island has no special interaction here (no Live Activity in v1 — that's a v1.1 fast-follow, explicitly out of v1 scope). |
| **Motion** | Glow ONLY on the brand `DPE` (if header shown) and the primary CTA + the live `SUBSCRIBED` annunciator (`§7.1`). The success annunciator may pulse `annun-pulse` (1.6s, not a strobe) and stops under reduce-motion. Sheet uses native present/dismiss transitions — no custom theatrical motion. |

#### Qualitative requirements
- The payment UI is 100% the OS's (we render none of it), maximizing trust and compliance.
- Interactions feel native: drag-to-dismiss, haptic punctuation on the right moments, no web-overlay feel.

#### Measurable success criteria
- [ ] The app renders **0** custom credit-card / payment fields (it delegates entirely to the store sheet) — code audit.
- [ ] Every tappable element (plan cards, CTA, Restore, Terms, Privacy, FAQ rows) ≥ 44pt iOS / 48dp Android — automated layout assert.
- [ ] Haptics fire on exactly the §7.3 events and nowhere else on this screen — event audit.
- [ ] Glow appears only on the CTA + brand + live `SUBSCRIBED` annunciator; **0** glow on plan descriptions/feature bullets — visual audit.

---

## 8. Accessibility

| Concern | Requirement |
|---|---|
| **VoiceOver / TalkBack order** | Reading order top→bottom: (1) reason banner label + sub-line as one grouped announcement ("Trial complete. You've used all 3 free practice exams."), (2) "Go unlimited" heading, (3) Annual plan card as a single element ("Annual plan, $299 per year, that's $24.92 per month, save 36 percent, best value, selected, double-tap to select"), (4) Monthly plan ("Monthly plan, $39 per month, double-tap to select"), (5) "Start unlimited, button", (6) "Restore purchases, button", (7) "Terms, link", (8) "Privacy, link", (9) auto-renew disclosure as static text, (10) "Compare plans and FAQ, expandable". |
| **Labels** | Prices spoken as money ("$299 per year"), not "dollar sign 299 slash y r" — use `accessibilityLabel` overrides on the `<NumericReadout>`. Caps-mono tokens (`BEST VALUE`, `SUBSCRIBED`) get sentence-case `accessibilityLabel` ("Best value", "Subscribed") so the screen reader doesn't spell letters. Plan card has `accessibilityRole="radio"` + `accessibilityState={{ selected }}`. |
| **Dynamic Type / font scaling** | All text respects OS text size; reading roles scale up to 1.6×, instrument tokens (badge, price) up to 1.3× (clamped, `02-DESIGN-SYSTEM.md §3.3`). At 1.3× the CTA label "Start unlimited" must not truncate; the price must not overflow its card. **0** text below 12pt at default scale. |
| **Contrast ≥ 4.5:1** | Use AA-safe variants only: price/CTA amber on `c-bg`/`c-bezel`, green status via `c-green-readable`, cyan via `c-cyan-readable` (never base `c-green`/`c-cyan` for text, `§3.4`/`§8`). Disabled CTA (opacity 0.5) still ≥ 3:1 for the disabled-state exemption but conveys disabled via the inline "Contacting the App Store…" text, not color alone. |
| **Focus order & traps** | When the sheet presents, accessibility focus moves to the reason banner (or "Go unlimited" if no banner). Focus is **trapped within the sheet** while it's modal; dismissing returns focus to the element that opened it. |
| **Reduced motion** | `AccessibilityInfo.isReduceMotionEnabled()` ON → no annunciator pulse, no entrance stagger, no skeleton shimmer (static blocks), no glow *animation* (static glow OK); state changes are instant (`§7.2`). |
| **Reduce Transparency / Increase Contrast** | If iOS "Increase Contrast" is on, drop the subtle bezel gradient to a flat `c-bezel` and thicken the selected-plan ring to a solid `c-border-hi`. |

#### Qualitative requirements
- A screen-reader-only user can read the offer, pick a plan, buy, restore, and reach Terms/Privacy without sighted help.
- Nothing relies on color alone (selection shows a radio + ring + label, not just amber).

#### Measurable success criteria
- [ ] Full VoiceOver pass: every interactive element is focusable, labeled in plain language, and in logical order — manual audit, 0 unlabeled nodes.
- [ ] Full TalkBack pass equivalent on Android — 0 unlabeled nodes.
- [ ] At Dynamic Type 1.3× and Android font scale 1.3×: **0** truncated CTA/price, no overlap — matrix cell pass (`§3.3`).
- [ ] Every text/background token pair on the screen clears **4.5:1** (automated contrast check against the §8 pass-list) — 100%.
- [ ] With Reduce Motion ON, **0** looping/pulsing animations run — runtime assert.

---

## 9. Analytics events

> Mirror existing web PostHog event names where they exist. Web fires `trial_blocked` server-side (`session/route.ts:69`), `paywall_shown` + `upgrade_clicked` client-side (CLAUDE.md "PostHog funnel complete (W6.4)"), and `checkout_completed` server-side on the Stripe webhook. The native paywall reuses these names and adds IAP-specific ones.

| Event | When | Properties |
|---|---|---|
| `trial_blocked` *(server, already exists)* | The `POST /api/session` 403 that triggered the sheet (`session/route.ts:69`) | `{ reason: 'trial_limit_reached' \| 'trial_expired' \| 'resubscribe_required' }` |
| `paywall_shown` *(client, mirror web)* | Sheet mount | `{ reason, platform:'ios', source_screen, plans:['monthly','annual'], state:'buy'\|'manage_web'\|'manage_iap' }` |
| `upgrade_clicked` *(client, mirror web)* | CTA "Start unlimited" tap | `{ plan, reason }` |
| `iap_purchase_started` *(new, iOS)* | `purchasePackage` invoked | `{ plan, package_id, price, currency }` |
| `iap_purchase_completed` *(new, iOS)* | RevenueCat returns active `pro` + server `dpe_live` | `{ plan, package_id, price, currency, store:'APP_STORE' }` |
| `iap_purchase_cancelled` *(new, iOS)* | `userCancelled === true` (ER2) | `{ plan }` |
| `iap_purchase_failed` *(new, iOS)* | Store error (ER3/ER10) | `{ plan, error_code }` |
| `iap_restore_started` / `iap_restore_completed` / `iap_restore_empty` *(new)* | Restore flow F2 / S2 / ER5 | `{ found: boolean }` on completed |
| `web_subscriber_recognized` *(new)* | F3 — merged entitlement already `dpe_live` from `store: STRIPE` | `{ status, plan }` |
| `manage_subscription_clicked` *(new)* | "Manage on web" (→ portal) or "Manage in Apple Subscriptions" | `{ destination:'stripe_portal'\|'apple_settings' }` |
| `paywall_dismissed` *(new)* | Sheet dismissed without purchase | `{ reason, had_purchase_started: boolean }` |
| `checkout_completed` *(server, already exists)* | The server entitlement write (IAP-sync M4 handler, parallel to the Stripe webhook's existing `checkout_completed`) | `{ plan, source:'iap'\|'stripe', price }` |

- All client events go through the shared analytics module (server-side `captureServerEvent` for the trial block already in place). PostHog identify uses the same Supabase user id as the RevenueCat App User ID.

#### Qualitative requirements
- The funnel `trial_blocked → paywall_shown → upgrade_clicked → iap_purchase_started → iap_purchase_completed` is fully traceable, matching the web names where they overlap.
- IAP-specific outcomes (cancel, restore, web-recognized) are distinguishable for conversion analysis.

#### Measurable success criteria
- [ ] Every state transition emits exactly one event from the table (no dup, no miss) — event audit in a sandbox purchase run.
- [ ] `paywall_shown` and `upgrade_clicked` use the **same** event names as web (grep both codebases) — pass/fail.
- [ ] `iap_purchase_completed` fires **only** after server `dpe_live` is confirmed (not on raw store success) — sequence assert.
- [ ] PostHog distinct_id on these events equals the Supabase user id (= RevenueCat App User ID) — id-join check.

---

## 10. Store-compliance touchpoints

This screen is the single most compliance-sensitive surface in the app. It MUST satisfy, on the screen itself:

| Requirement | Source | Implementation on this screen |
|---|---|---|
| **IAP for digital subscriptions on iOS** | Apple Guideline 3.1.1 | The buy CTA invokes RevenueCat/StoreKit IAP — **never** a Stripe web checkout to sell (`§5.3`). |
| **"Restore Purchases" affordance** | Apple requirement (RevenueCat research §5) | Always-visible "Restore purchases" in the compliance footer; user-triggered, never auto-called every launch. |
| **Auto-renew disclosure** | Apple Schedule 2 / App Review | Visible text: subscription length, price per period, that it auto-renews, and that it's managed/cancelled in Apple Subscriptions settings — co-located with the CTA. |
| **Terms of Use (EULA) + Privacy Policy links** | App Review (required on any paywall) | "Terms" → `/terms`, "Privacy" → `/privacy` (open in-app browser / system browser). Both ≥ 44pt tap targets. Apple's standard EULA acceptable; if custom, link the hosted Terms. |
| **No mention of cheaper web pricing / anti-steering** *(US storefront)* | Guideline 3.1.1 / 3.1.3 + 2026 external-link rules (RevenueCat research §7, `VERIFY-AT-SUBMISSION`) | v1 default: **do not** advertise a cheaper web price or link out to *buy* on the web from the iOS paywall (only link out to *manage* an existing web sub, which is permitted). The US external-purchase-link entitlement is litigated/changing — confirm at submission. See OWNER DECISION. |
| **Existing web subscriber not double-charged** | LOCKED decision (server entitlement merge) | F3 shows the manage state with **0** buy buttons for an already-`dpe_live` account. |
| **Price parity / honest pricing** | App Review | The IAP store prices (Apple price tiers nearest $39/mo and $299/yr) are shown from `getOfferings()`; the hardcoded `$39`/`$299` are display fallbacks only and must match the configured store products. |
| **In-app account deletion** | Apple Guideline 5.1.1(v) | **Not** on this screen — account deletion lives in Settings (web `settings/page.tsx` "Your data → Delete account"). Cross-referenced here only to note that cancelling a subscription ≠ deleting an account; the paywall must not imply deletion. |

> **OWNER DECISION — US external-link / "buy on web" CTA.** Post-*Epic v. Apple*, the US storefront now permits external links/CTAs to web purchase (RevenueCat research §7, `VERIFY-AT-SUBMISSION`). v1 recommendation: **ship IAP-only on the iOS paywall** (simplest, unambiguously compliant) and revisit a US external-link variant in a fast-follow once the program terms are confirmed. The owner should confirm whether to pursue the US external-purchase-link entitlement at launch (potentially saving the Apple commission on US web conversions) or defer.

> **Platform-specific link-out variant (Android & web link).** On **Android**, the same RevenueCat SDK sells via Google Play Billing (`store: PLAY_STORE`, RevenueCat research §8) — the paywall is structurally identical, swapping the Google API key and respecting `User Choice Billing` / external-offer programs per market (`VERIFY-AT-SUBMISSION`). The **Stripe web link** remains the path for web and for Android "link to web" where permitted; on iOS it is used **only** to *manage* an existing Stripe sub (portal), never to sell.

#### Qualitative requirements
- A store reviewer opening this sheet sees: a clear price, an IAP buy button, Restore, an auto-renew disclosure, and Terms + Privacy — all present and tappable.
- The app never steers iOS users to a cheaper web price (v1) and never double-charges a web subscriber.

#### Measurable success criteria
- [ ] "Restore purchases", "Terms", "Privacy", and the auto-renew disclosure are all present and ≥ 44pt — checklist 4/4.
- [ ] The iOS buy path uses IAP only; **0** Stripe-checkout buy calls (network audit) — pass/fail.
- [ ] A `dpe_live` (web Stripe) test account sees **0** IAP buy buttons on the sheet (F3) — pass/fail.
- [ ] No copy on the iOS paywall advertises a web price or "buy on the web" (v1) — copy audit.
- [ ] Account deletion is reachable from Settings (not implied/located here) — cross-screen check.

---

## 11. MEASURABLE acceptance criteria (engineer / QA pass-fail checklist)

### Functional
- [ ] All 6 live entry points (E1–E6) present `upgrade.tsx` with the correct `reason` param.
- [ ] F1 (buy): trial block → IAP purchase (sandbox) → server `dpe_live` → the originally blocked exam now creates successfully — E2E pass.
- [ ] F2 (restore): on a reinstall with an active Apple-ID sub, "Restore purchases" yields S2 within 5s; with no sub, ER5.
- [ ] F3 (web subscriber): a Stripe-active test account shows the manage state, **0** buy buttons, and "Manage on web" opens the `POST /api/stripe/portal` URL.
- [ ] F4 (IAP manage): "Manage subscription" opens Apple Subscriptions, never the Stripe portal.
- [ ] F5 (sign-in): from the paywall, sign-in resolves a web subscriber to F3 without a purchase.
- [ ] User-cancel (ER2) is silent and re-enables the CTA ≤ 300ms.
- [ ] ER4 (entitlement lag): store success + server lag shows "activating…" and resolves to S1 within 30s, else offers Restore — **0** false "purchase failed."
- [ ] **0** account can hold both a Stripe and an IAP charge simultaneously (server merge audit).

### Performance budgets
- [ ] **Time-to-interactive** (sheet mount → plan cards tappable with real store prices) ≤ **1500ms** on a mid-tier device with warm network (offerings fetch + entitlement check run in parallel); ≤ **400ms** to first paint (skeletons) — measured.
- [ ] Sheet present animation runs at ≥ **58fps** (no jank) on the target min device.
- [ ] After `purchasePackage` resolves, S1 renders ≤ **2000ms** (incl. the IAP-sync + tier confirm round trips).
- [ ] Offerings + entitlement network calls are **parallel**, not serial (trace check).

### UI invariants
- [ ] **0** text nodes below 12pt at default Dynamic Type; **0** caps-mono button labels; caps-mono only on `// PRICING`, `BEST VALUE`, `SUBSCRIBED`, `RESTORE`/`MANAGE ON WEB` annunciators, and the numeric prices.
- [ ] Glow appears only on the primary CTA, the brand `DPE` (if shown), and the live `SUBSCRIBED` annunciator.
- [ ] Plan-card radius 12, CTA radius 8, badge pill radius 6; default horizontal inset 16pt; compliance footer above the bottom safe-area on all test devices.
- [ ] Every interactive element ≥ 44pt iOS / 48dp Android.
- [ ] No screen file contains a hex literal — all color via `useTheme()` (grep).
- [ ] iOS uses `presentation: 'formSheet'` + grabber; Android uses a Material modal bottom sheet + drag handle; both dismiss via swipe AND an explicit Close control.

### Accessibility
- [ ] Full VoiceOver + TalkBack passes: 0 unlabeled interactive nodes; logical reading order; prices spoken as money; caps-mono tokens given sentence-case labels.
- [ ] All text/background pairs ≥ 4.5:1; selection conveyed by radio + ring + label (not color alone).
- [ ] Reduce Motion ON → 0 looping/pulsing animations; instant state changes.
- [ ] At Dynamic Type / font scale 1.3×: 0 truncated CTA/price, no overlap.

### Analytics & compliance
- [ ] The funnel `trial_blocked → paywall_shown → upgrade_clicked → iap_purchase_started → iap_purchase_completed` emits once each, no dup/miss; `paywall_shown`/`upgrade_clicked` match web names.
- [ ] Restore, Terms, Privacy, and the auto-renew disclosure are all present and tappable (store-review checklist 4/4).
- [ ] iOS buy path = IAP only; **0** Stripe-checkout buy calls; no web-price advertising in copy (v1).

---

## Open questions / OWNER DECISIONS (consolidated)
1. **US external-purchase-link CTA** — ship IAP-only on iOS for v1, or pursue the US external-link entitlement at launch? (§10; recommend defer — `VERIFY-AT-SUBMISSION`).
2. **Tablet/iPad two-up plan layout** — phone-first stacked is the v1 recommendation; iPad parity (and the side-by-side layout) only if iPad is in v1 scope (§6).
3. **`/api/iap/*` exact request/response shapes** — defined in `docs/mobile/04-PAYMENTS-ENTITLEMENTS.md` (M4), which this screen consumes; this spec assumes that doc lands first and that a successful IAP-sync sets `dpe_live` + invalidates the tier cache exactly as the Stripe webhook does.
4. **Display-fallback prices** ($39/$299) — confirm the chosen **Apple price tiers** map closely to the Stripe $39/mo and $299/yr so on-screen prices stay consistent across web and iOS (Apple tiers are fixed steps; exact-match may be impossible).
