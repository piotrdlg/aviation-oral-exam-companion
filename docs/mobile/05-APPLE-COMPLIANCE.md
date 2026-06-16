# 05 — Apple App Store Acceptance Checklist (HeyDPE iOS)

> **Exhaustive, item-by-item App Store acceptance checklist for the HeyDPE iOS app**, mapped to the actual codebase and the sibling mobile-build docs. Following this document end-to-end **warrants acceptance**: every relevant guideline gets (a) the guideline number + current requirement, (b) exactly how HeyDPE satisfies it with a screen/doc citation, and (c) a **measurable** verification step.
>
> **Verified against** the live Apple App Review Guidelines (latest revision **2026-06-08**; third-party-AI clause 5.1.2(i) dated **2025-11-13**) and Apple technical docs **as of 2026-06-15**.
>
> **Scope of this doc:** App Store *acceptance* — review guidelines + the App Store Connect listing + the technical Info.plist / privacy-manifest gates + the submission runbook. It does **not** redefine the payment entitlement contract (that is `docs/mobile/04-PAYMENTS-ENTITLEMENTS.md`, task M4) or the voice plumbing (that is `docs/mobile/03-VOICE-PIPELINE.md`); it is the *consumer and reviewer-facing checklist* that those build on.
>
> **Cross-references (single source of truth — never re-derive a shape here):**
> - Payments / RevenueCat / entitlement merge → `docs/mobile/04-PAYMENTS-ENTITLEMENTS.md`
> - Paywall screen (buy / restore / manage) → `docs/mobile/screens/07-paywall.md`
> - Voice pipeline / audio session / background policy → `docs/mobile/03-VOICE-PIPELINE.md`
> - API contract / origin / auth → `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`
> - Design system (FLIGHT DECK typography rule applied to every UI item below) → `docs/mobile/02-DESIGN-SYSTEM.md`
> - Auth / Sign in with Apple screen → `docs/mobile/screens/01-auth.md`
> - Onboarding / consent gate → `docs/mobile/screens/02-onboarding.md`
> - Settings / account deletion → `docs/mobile/screens/06-settings.md`
>
> **Identity:** App = **HeyDPE**, operated by **Imagine Flying LLC** (`src/app/terms/page.tsx:9,72`). Live web origin the native client calls: `https://aviation-oral-exam-companion.vercel.app` (`docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md:204`). Supabase project ref `pvuiwwqsumoqjepukjhz` (CLAUDE.md).

---

## 0. The one rule, applied to this doc (typography discipline for every UI item below)

Per `02-DESIGN-SYSTEM.md §0/§3` and the LOCKED FLIGHT DECK rule, anywhere this doc prescribes a *screen* or *control* (Restore button, Delete Account row, consent gate, paywall disclosure, ATT prompt copy):

- **Caps-mono + glow ONLY for instrument moments:** the `DPE` wordmark, `//` micro-labels, status annunciators/badges, ACS/element codes, and numeric readouts (prices `$39` / `$299`, exam counts, timers). These use the `<MicroLabel>` / `<Annunciator>` / `<CodeChip>` / `<NumericReadout>` primitives.
- **Everything else is sentence-case IBM Plex:** every legal string, disclosure paragraph, consent body, button label (other than the CTA wordmark), error copy, permission-string text.
- **Hard floors:** never 10px; **12pt minimum**. Touch targets **≥ 44pt iOS / ≥ 48dp Android**. (The native ATT prompt, StoreKit sheet, and SIWA button are system-rendered and already satisfy these.)

#### Measurable
- [ ] Every custom control this doc adds (Restore, Delete Account, consent checkbox, "Manage on web", paywall disclosure links) renders ≥ 12pt text and ≥ 44pt hit target — measured in the accessibility inspector. Pass/fail per control.

---

## 1. Guideline 2.1 — App Completeness + demo account (reviewer must run a real voice exam)

**Requirement (2.1(a)):** "...include demo account info (and turn on your back-end service!) if your app includes a login... you may include a built-in demo mode... Ensure the demo mode exhibits your app's full features and functionality."
**Requirement (2.1(b)):** "If you offer in-app purchases... make sure they are complete, up-to-date, visible to the reviewer and functional. If any configured in-app purchase items cannot be found or reviewed in your app, explain the reason in your review notes."

**How HeyDPE satisfies it.** HeyDPE *requires* login (Supabase Auth) and gates exams behind a subscription, so a demo account is **mandatory**, not optional. The trap is the app-side trial gate: `POST /api/session` create returns `403` with reason codes `trial_limit_reached` / `trial_expired` / `resubscribe_required` (`src/app/api/session/route.ts:68,88,125,132`) — a plain trial account will hit one mid-review and produce a near-certain 2.1 rejection. The fix is to provision the reviewer account with a **standing paid-equivalent entitlement** so it never trips the gate:

- Provision a reviewer account whose effective tier is paid: either set the stored tier to `dpe_live`, or grant a **`user_entitlement_overrides.paid_equivalent`** override (the "Tester" path, `src/lib/tier-labels.ts:23` `OVERRIDE_LABEL = 'Tester'`; `tierBand(..., hasPaidOverride=true)` → `'tester'`). The override route is the cleanest because it never touches Stripe/IAP and never expires from a trial window.
- Confirm the back-ends are live for the review window: **Anthropic (Claude examiner + assessment), Deepgram (Nova-3 STT + Aura-2 TTS), OpenAI (embeddings + TTS fallback)** — all four must answer. The reviewer's exam will make real calls to each (`docs/mobile/03-VOICE-PIPELINE.md` capture→TTS path).
- Put a **step-by-step exam walkthrough** in App Review Information → Notes for Review (see §22 runbook): "Sign in with the demo credentials → tap Practice → pick Private Pilot → tap Start → grant the microphone prompt → speak an answer to the examiner's first question → the AI examiner replies in voice. Text input is also available via the keyboard icon."
- IAP visibility (2.1(b)): the two auto-renewable products (monthly, annual) must be **submitted in the same version** and reachable on the paywall sheet (`docs/mobile/screens/07-paywall.md §1`). Because the demo account is already entitled, the paywall would show "manage" not "buy" — so the Notes for Review MUST tell the reviewer how to *see* the purchase options (e.g., "to view the purchase options, the paywall is reachable from Settings → Plan & usage → Upgrade plan; the demo account is pre-entitled so it shows the manage state — the StoreKit products are attached and in Ready to Submit").

**OWNER DECISION — reviewer account provisioning mechanism.** Choose between (a) a dedicated `dpe_live` demo row, or (b) a `paid_equivalent` override row (recommended — never expires, never bills). Whichever is chosen, the credentials and the back-end "on" confirmation must be in Notes for Review at submission. Also decide whether to expose a no-login built-in **demo mode** as a belt-and-suspenders alternative (Apple permits it "with prior approval").

#### Qualitative requirements
- The reviewer can reach the *real examiner experience* (voice in, voice out, assessment), not just the paywall.
- The account never hits a `403` trial gate during the review window.
- The IAP products are visible/explained even though the demo account is pre-entitled.

#### Measurable success criteria
- [ ] **Scripted release gate (HARD):** an automated script signs in **as the demo account against PRODUCTION**, **creates 4+ sessions** back-to-back, and asserts **ZERO `403`s** from `POST /api/session` (no `trial_limit_reached` / `trial_expired` / `resubscribe_required` ever fires) — script exits green (§22-E step 12). A red run is a NO-GO. Pass/fail.
- [ ] The same scripted run drives a **live exchange against all four back-ends** — `exam` (one `assessAnswer` + one `generateExaminerTurn` = 200), `tts` (valid audio), `stt` (transcript), `tier` (`GET /api/user/tier` returns a paid/tester effective tier) — all four return 200/valid, asserted in-script. Pass/fail.
- [ ] Both auto-renewable IAP products show status **Ready to Submit / In Review** in App Store Connect at submission — screenshot. Pass/fail.
- [ ] Notes for Review contains: demo credentials, the 7-step exam walkthrough, the "how to view IAP" note, and the "back-ends are live" confirmation — checklist 4/4.

---

## 2. Guideline 2.3 — Accurate Metadata (no misleading "FAA examiner"; no hidden features)

**Requirement (2.3):** metadata "including privacy information, your app description, screenshots, and previews [must] accurately reflect the app's core experience."
**Requirement (2.3.1(a)):** "Don't include any hidden, dormant, or undocumented features... All new features... must be described with specificity in the Notes for Review section."
**Requirement (2.3.2):** "If your app includes in-app purchases, make sure your app description, screenshots, and previews clearly indicate whether any featured items, levels, subscriptions, etc. require additional purchases."

**How HeyDPE satisfies it.**
- **Framing (the #1 2.3 risk for this app):** "DPE" and "FAA examiner" must read as **practice / simulation / prep**, never as an official FAA product or a substitute for a real checkride. The web copy already does this — Terms describe it as "an AI-powered practice tool that simulates FAA Designated Pilot Examiner (DPE)" (`src/app/terms/page.tsx:89`) and the metadata title is "the AI checkride oral exam simulator by Imagine Flying LLC" (`src/app/privacy/page.tsx:9`). Mirror that exact framing in the App Store name/subtitle/description.
- **Subscription disclosure (2.3.2):** the description and at least one screenshot must state that unlimited exams require a subscription, and that the free tier is a **7-day / 3-exam card-free trial** (the app-side trial in `src/app/api/session/route.ts`, `FREE_TRIAL_WINDOW_DAYS` / `FREE_TRIAL_EXAM_LIMIT`).
- **No hidden features (2.3.1(a)):** disclose in Notes for Review anything the reviewer could reach or that is flag-gated: the **admin pages** (`(admin)/*`, gated by `checkAdminAccess()` — the demo account must NOT be admin), the **instructor program**, and the flag-gated **Scenario Engine** (`exam.scenario_engine`, CLAUDE.md). State plainly that admin/instructor surfaces are role-gated and not reachable by the demo account.

#### Qualitative requirements
- A customer reading the listing understands: it's voice-first AI *practice*, not the FAA, not a guaranteed pass, and unlimited use is paid.
- Nothing the reviewer can reach is undisclosed; nothing in the screenshots overstates what's free.

#### Measurable success criteria
- [ ] App name + subtitle + description contain the words "practice"/"simulation"/"prep" and do **not** claim to be official/FAA-endorsed or a checkride replacement — reviewer reads the final listing, checklist pass/fail.
- [ ] At least 1 screenshot and the description explicitly flag "subscription required for unlimited exams" and state the "7-day / 3-exam free trial" — pass/fail.
- [ ] Notes for Review discloses admin + instructor + Scenario-Engine surfaces and confirms the demo account cannot reach admin — checklist 3/3.
- [ ] A disclaimer ("not affiliated with or endorsed by the FAA; not a substitute for an FAA checkride") appears in the description — pass/fail.

---

## 3. Guideline 3.1.1 — In-App Purchase is mandatory for the iOS subscription

**Requirement (3.1.1):** "If you want to unlock features or functionality within your app... you must use in-app purchase. Apps may not use their own mechanisms to unlock content or functionality, such as license keys... etc."

**The #1 rejection risk.** HeyDPE today sells subscriptions via **Stripe Checkout** (`src/app/api/stripe/checkout/route.ts:55` `mode:'subscription'`). On iOS, unlocking exam access (a digital service consumed in-app) **must** go through Apple IAP / StoreKit, not Stripe. You cannot route iOS users to a Stripe web checkout to unlock in-app functionality.

**How HeyDPE satisfies it.** iOS *new* purchases go through **RevenueCat → StoreKit 2 auto-renewable subscriptions**; the full contract is `docs/mobile/04-PAYMENTS-ENTITLEMENTS.md` and the screen is `docs/mobile/screens/07-paywall.md`. The card-free 7-day/3-exam trial is the **app-side free tier** (`src/app/api/session/route.ts`, `FREE_TRIAL_WINDOW_DAYS` / `FREE_TRIAL_EXAM_LIMIT`) consumed **before** the paywall is ever shown; the two StoreKit products are **full-price auto-renewables with NO Introductory Offer in v1** (per `04-PAYMENTS-ENTITLEMENTS.md §1.3`), so the app-side trial is never double-counted with a second StoreKit free trial at the point of sale. A single RevenueCat "pro" entitlement is unlocked by either an App Store SK2 purchase (mobile) or a Stripe purchase (web), keyed on a shared App User ID (`07-paywall.md §1`). The web `checkout/route.ts` is **untouched** and is never invoked from iOS.

#### Qualitative requirements
- Every *new* iOS subscription is acquired through StoreKit IAP, never a Stripe web link.
- The paywall presents full-price auto-renewable products; the "free trial" is the app-side card-free tier (7 days / 3 exams), disclosed accurately in metadata, **not** a StoreKit introductory offer on the paid product. Description and product configuration must agree (no advertised StoreKit free trial the product does not carry).

#### Measurable success criteria
- [ ] Static check: the iOS bundle contains **no** call to `/api/stripe/checkout` and no Stripe Checkout/portal URL is opened to *acquire* a subscription — grep the app source, 0 hits. Pass/fail.
- [ ] A sandbox purchase of monthly and of annual completes via StoreKit and unlocks `dpe_live` on the server — 2/2 sandbox buys verified end-to-end (`04-PAYMENTS-ENTITLEMENTS.md` test matrix).
- [ ] The two StoreKit products carry **no** introductory offer in v1 (full price); App Store Connect shows two full-price auto-renewables, and the description frames the trial as the app-side card-free free tier — App Store Connect screenshot, pass/fail.

---

## 4. Guideline 3.1.2 — Auto-renewable subscription disclosures, value, period, restore

**Requirement (3.1.2(a)):** "...you must provide ongoing value... the subscription period must last at least seven days and be available across all of the user's devices... Subscriptions must work on all of the user's devices where the app is available."
**Requirement (3.1.2(c)):** "Before asking a customer to subscribe, you should clearly describe what the user will get for the price... communicate the requirements described in Schedule 2 of the Apple Developer Program License Agreement."
**Requirement (restore, 3.1.1):** provide "a restore mechanism for any restorable in-app purchases."

**Required at the point of sale (Schedule 2 / standard rejection checklist).** Before purchase the paywall MUST display: (1) subscription **title**, (2) **length** of the period, (3) **price** (and price-per-unit if relevant), (4) functional links to **Privacy Policy** and **Terms of Use (EULA)**, and (5) **auto-renewal mechanics** copy.

**How HeyDPE satisfies it.** All five live on the paywall sheet (`docs/mobile/screens/07-paywall.md §0/§1`):
- Monthly ($39) and Annual ($299, ≥ 7 days) titles + periods + prices rendered as `<NumericReadout>` (`07-paywall.md §0`).
- Privacy + Terms links: HeyDPE already ships `/privacy` (`src/app/privacy/page.tsx`) and `/terms` (`src/app/terms/page.tsx`). Link both from the paywall AND populate the App Store Connect EULA/Privacy fields (§18).
- Auto-renewal disclosure copy (verbatim pattern to render in sentence-case IBM Plex on the paywall, below the CTA):

  > "Payment is charged to your Apple ID at confirmation of purchase. Your subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions in your Apple ID Account Settings after purchase."

- Cross-device (3.1.2(a)): the same Apple ID restores/syncs the IAP entitlement; the shared RevenueCat App User ID also surfaces a web-purchased entitlement on the device (`07-paywall.md §1`, intent 3).
- **Restore Purchases:** a user-triggered **Restore** button calling `Purchases.restorePurchases()` lives on the paywall sheet (`07-paywall.md §1`, intent 2) and is also surfaced in Settings. Never called programmatically on every launch.
- Cancellation on iOS is managed through Apple's subscription settings (not the Stripe portal); the annual/monthly "cancel keeps access until period end" behavior is fine and is handled by RevenueCat (revoke on **EXPIRATION**, not CANCELLATION — `04-PAYMENTS-ENTITLEMENTS.md`).
- **Refunds (store-conditional).** App Store IAP purchases are **refunded by Apple, not by the developer** — direct iOS users to Apple's *Report a Problem* (`reportaproblem.apple.com`) / Settings → Apple ID → Media & Purchases → Purchase History; HeyDPE cannot and must not promise to issue refunds for App Store purchases. The 7-day email-refund promise in Terms applies to **web / Stripe purchases only**. Do **not** present an in-app "request a refund from us" path for IAP. **OWNER / legal action:** add a store-conditional refund clause to `src/app/terms/page.tsx` (refunds for store purchases go through Apple/Google; the email-refund window is web-only) — this is a Terms edit owned by the owner, **not** made in this checklist pass.

#### Qualitative requirements
- A user sees title + period + price + Privacy + Terms + renewal terms **before** tapping buy.
- A Restore button is always present and recovers entitlement without re-charging.
- iOS cancellation routes to Apple Settings, never to a Stripe portal.

#### Measurable success criteria
- [ ] Paywall pre-purchase screen contains all 5 Schedule-2 elements (title, length, price, Privacy link, Terms link) + the renewal-mechanics paragraph — checklist 6/6, screenshot.
- [ ] Privacy and Terms links open the live `/privacy` and `/terms` pages (HTTP 200) — pass/fail.
- [ ] Restore button: a second device / reinstall with the same Apple ID restores `dpe_live` with no new charge — sandbox verified. Pass/fail.
- [ ] App Store Connect subscription period ≥ 7 days for both products — screenshot. Pass/fail.

---

## 5. Guideline 3.1.3(b) — Multiplatform: existing web (Stripe) subscribers may sign in

**Requirement (3.1.3(b)):** "Apps that operate across multiple platforms may allow users to access content, subscriptions, or features they have acquired in your app on other platforms or your web site... provided those items are also available as in-app purchases within the app."

**How HeyDPE satisfies it.** A user who already subscribed on the web via Stripe may sign in on iOS and inherit access — because the same monthly/annual offering is **also** an iOS IAP (§3). The RevenueCat entitlement merge keys on a **shared App User ID** so the existing Stripe sub unlocks the mobile entitlement silently (`docs/mobile/04-PAYMENTS-ENTITLEMENTS.md`; `07-paywall.md §1` intent 3 — "You're already subscribed"). Hard constraints, enforced by the build:
- The iOS app must **not** tell users to subscribe on the web, show web prices, or link to Stripe checkout to *acquire* a subscription (outside the narrow US-storefront allowance, §6). The reader/multiplatform allowance lets users **access** an existing entitlement; it does not let you **sell** off-platform inside the app.
- New iOS purchases go through StoreKit IAP; already-paying web users authenticate and inherit entitlement.

#### Qualitative requirements
- An existing Stripe web subscriber is never asked to pay twice on iOS.
- The app never *advertises* or *links to* web purchasing as the way to subscribe (subject to §6).

#### Measurable success criteria
- [ ] A test account with a live Stripe sub signs in on iOS and lands on `dpe_live` with **no** IAP purchase — verified end-to-end (`04-PAYMENTS-ENTITLEMENTS.md` test matrix). Pass/fail.
- [ ] Static check: no "subscribe on our website", no web price string, no Stripe checkout link in the iOS purchase path — grep, 0 hits (US external-link exception handled separately in §6). Pass/fail.

---

## 6. External-link / anti-steering posture (US storefront) — VERIFY-AT-SUBMISSION

**Live status (verified 2026-06-15).** Post–*Epic v. Apple*, guideline 3.1.1 / 3.1.1(a) carve out the **US storefront**: US apps MAY include buttons / external links / calls-to-action to non-IAP (web) purchasing with **no required Apple entitlement**. Current procedural posture: the **Ninth Circuit affirmed** the civil-contempt finding (2025-12-11) but partially reversed the remedy; Apple **may not charge any commission until the district court approves a rate** (no rate set), so the status quo (no commission on off-app purchases) holds. Rehearing denied **March 2026**; Apple's cert petition is set for a **Supreme Court conference vote on 2026-06-25** — outcome unknown.

**HeyDPE posture (LOCKED):** ship **StoreKit IAP as the durable iOS purchase path** (§3). Do **not** build a flow that depends on the external-link freedom surviving SCOTUS review. If — and only if — the owner later adds a US-storefront external link to Stripe checkout, then: (a) it is US-storefront-only, (b) the in-app IAP option must be **at least as prominent**, and (c) the external link may not be made larger / more prominent than the IAP path.

**OWNER DECISION:** For v1, do we ship **IAP-only** (recommended, zero anti-steering risk) or also add a US-only external Stripe link? Default to IAP-only.

#### Measurable success criteria
- [ ] **VERIFY-AT-SUBMISSION:** confirm no SCOTUS stay/order after the 2026-06-25 conference vote has changed the US-storefront posture before submitting — record the check date + source. Pass/fail.
- [ ] v1 ships IAP-only (default) OR, if an external link is added, an A/B prominence audit shows IAP ≥ external link in size/placement — screenshot pass/fail.

---

## 7. Guideline 4.0 — Design quality (native, not a thin WebView)

**Requirement (4.0):** apps must be "simple, refined, innovative, and easy to use"; degraded apps may be removed. Plus the **2026-06-08 "low-value app" crackdown**: apps in oversaturated categories must be "meaningfully different."

**How HeyDPE satisfies it.** The app is a **native interpretation** of the FLIGHT DECK brand (LOCKED decision), not a WebView port: native mic capture (`docs/mobile/03-VOICE-PIPELINE.md §1`, `expo-audio-studio`/`expo-audio`), native StoreKit purchases (§3), native audio session + background policy (`03-VOICE-PIPELINE.md §4/§5`), and the native-adapted design system (`docs/mobile/02-DESIGN-SYSTEM.md` — HIG/Material 3 navigation, sheets, gestures). The differentiation (voice-first, ACS-driven AI examiner) is defensible; lean into it in metadata (§2).

#### Qualitative requirements
- The app uses genuine native capabilities (mic, StoreKit, audio session, system sheets/tabs), not a wrapped Next.js site.
- The experience is refined enough to clear the "should be a website" / minimum-functionality bar.

#### Measurable success criteria
- [ ] Static check: no full-screen `WebView`/`react-native-webview` rendering the Next.js app as the primary UI — grep, 0 hits for a primary-surface webview. Pass/fail.
- [ ] Native primitives in use: StoreKit purchase sheet, native mic permission prompt, native tab bar + form-sheet paywall — checklist 3/3 (`02/03/07` docs).
- [ ] Metadata names the voice-first ACS differentiation (§2) — pass/fail.

---

## 8. Guideline 4.8 — Sign in with Apple at parity

**Requirement (4.8):** apps using a third-party/social login (Google, Microsoft, etc.) to set up the primary account "must also offer as an equivalent option another login service" that limits data to name+email, allows a private email, and does not collect interactions for ads without consent.

**How HeyDPE satisfies it.** HeyDPE offers **Google, Apple, and Microsoft (azure) OAuth** plus Email OTP (`src/app/(auth)/login/page.tsx:248,260,269`). Because consumer Google and Microsoft social logins are offered, a qualifying equivalent is required — and **Sign in with Apple already satisfies 4.8** (name+email only, Hide My Email, no ad tracking) and is already shipped (`login/page.tsx:260-261` "Continue with Apple"). The native auth screen (`docs/mobile/screens/01-auth.md`) MUST keep **Sign in with Apple visible and at visual parity** with Google/Microsoft. Do **not** rely on the generic "education app" exception — HeyDPE uses *consumer* Google/Microsoft OAuth, not institutional accounts, so SIWA is the safe satisfier. Use the native `expo-apple-authentication` SIWA button so it renders the system-standard Apple button.

#### Qualitative requirements
- SIWA is present, native-rendered, and visually at parity with the other providers on the iOS login screen.
- SIWA is never dropped while Google/Microsoft remain.

#### Measurable success criteria
- [ ] The iOS login screen renders the system SIWA button alongside Google + Microsoft + Email OTP — screenshot, 4 methods present. Pass/fail.
- [ ] SIWA button is not visually de-emphasized vs. Google/Microsoft (same size class / order parity) — `02-DESIGN-SYSTEM.md` visual check. Pass/fail.
- [ ] A full SIWA sign-up + Hide-My-Email flow creates a `user_profiles` row and lands on Home — end-to-end test. Pass/fail.

---

## 9. Guideline 5.1.1(v) — In-app account deletion

**Requirement (5.1.1(v)):** "If your app supports account creation, you must also offer account deletion within the app."

**How HeyDPE satisfies it.** Account creation writes `user_profiles`, so in-app deletion is mandatory. The web already ships a complete deletion flow: a type-"DELETE"-to-confirm Settings control (`src/app/(dashboard)/settings/page.tsx:1713-1751`) → `POST /api/user/delete` with `{confirm:'DELETE'}` → cancels any active Stripe subscription, explicit-deletes non-cascading rows, then `auth.admin.deleteUser` cascades the 34-table map (`src/app/api/user/delete/route.ts:23-89`; the route comment at lines 12-16 explicitly notes "the Apple in-app requirement the mobile app will inherit"). The native **Settings** screen (`docs/mobile/screens/06-settings.md`) MUST surface a **Delete account** action that calls the same endpoint from inside the app — not an email-support or web-only link (a web-only path is a frequent 5.1.1(v) rejection). If a paid IAP subscription is active, inform the user that App Store subscriptions are managed/cancelled in Apple Settings, but still provide the in-app deletion path. Deletion must remove the app's account; reconcile any RevenueCat alias per `04-PAYMENTS-ENTITLEMENTS.md`.

#### Qualitative requirements
- Deletion is initiated and completed (or fully kicked off) from inside the iOS app, with a clear confirm step.
- The user is told how IAP cancellation works but is not blocked from deleting.

#### Measurable success criteria
- [ ] Native Settings has a **Delete account** action that calls `POST /api/user/delete` (`{confirm:'DELETE'}`) and signs the user out on success — end-to-end test against a throwaway account. Pass/fail.
- [ ] After deletion, signing in with the same credentials fails (account gone) — verified. Pass/fail.
- [ ] No "email us to delete" / web-only deletion is the *only* path — grep + UX review, pass/fail.

---

## 10. Guideline 5.1.1 / 5.1.2 — Privacy, data use, and the third-party-AI consent rule

**Requirement (5.1.1(i)):** the privacy policy must identify what data the app collects and all uses, confirm third parties provide equal protection, and explain retention/deletion + how to revoke consent / request deletion. Link it in App Store Connect AND in-app.
**Requirement (5.1.1(ii)/(iii)):** clear purpose strings; consent for collection; data minimization (only request what's core).
**Requirement (5.1.2(i), added 2025-11-13 — directly on point):** "You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so."

**The AI clause applies squarely.** HeyDPE transmits student **voice/transcripts to Anthropic (Claude), Deepgram (STT/TTS), and OpenAI (embeddings/TTS fallback)** — third-party (incl. third-party-AI) recipients of personal data. Three obligations:

1. **Disclose each vendor** in the privacy policy with what is sent and why. **GAP TO FIX — BLOCKING for ANY store submission (load-bearing):** the **live public** `src/app/privacy/page.tsx` is STALE and web-era — it still describes the browser **Web Speech API** sending voice to Google + OpenAI TTS + web-only trackers and claims **client-side** processing. It is **inaccurate and blocking**: it must be corrected to name **Deepgram Nova-3 STT + Aura-2 TTS** and **raw-PCM off-device transmission** before submission. This is an **OWNER prerequisite** — **do NOT edit `src/app/privacy/page.tsx` in this checklist pass**; this callout merely records the blocker. Specifics still wrong in the live page:
   - Line 125 still says voice is "Processed client-side via Web Speech API" — **false for native**; native voice goes to **Deepgram** over a WebSocket (`03-VOICE-PIPELINE.md`). Section 5 (lines 258-296) repeats the Web Speech API / Google-servers narrative.
   - **Deepgram is entirely absent** from the third-party table (`privacy/page.tsx:212-253` lists Supabase, Anthropic, OpenAI, Stripe, Vercel, GA4, Google Ads, Clarity) — yet it is the primary STT+TTS vendor.
   - The table lists **Google Analytics (GA4), Google Ads, Microsoft Clarity** — web-only tracking SDKs that the native app does **not** ship (the iOS analytics surface is PostHog first-party, §11). The native privacy disclosure must reflect the *native* SDK set, not the web one.
   - **OWNER DECISION — privacy policy update:** before iOS submission, publish a corrected privacy disclosure (either a revised `/privacy` or an iOS-specific section) that (i) names **Deepgram** as STT+TTS, (ii) replaces the Web Speech API language with the native Deepgram-WebSocket reality, (iii) lists the *native* third parties only (Supabase, Anthropic, Deepgram, OpenAI, RevenueCat/Apple, PostHog), and (iv) explicitly states voice/transcripts are processed by third-party **AI** vendors. This is required for both 5.1.2(i) and an accurate Privacy Nutrition Label (§19).

2. **Obtain explicit permission before sharing** voice/answer data with these AI/voice vendors, recorded **server-side as a NEW, SEPARATE consent kind** `ai_data_processing` (choices `third_party_ai_v1`) **before the first exam and before any audio leaves the device**. Do **NOT** reuse the FAA-accuracy disclaimer (`faa_disclaimer_v1` / the existing `kind:'disclaimer'` gate) — that stays the FAA-accuracy acknowledgement and is a different obligation. The AI-consent copy must **explicitly name the AI processors** — **Anthropic** (examiner LLM), **Deepgram** (STT + TTS), **OpenAI** (TTS fallback) — and state plainly that spoken answers and transcripts are sent to third-party AI providers to run the exam (e.g., "Your spoken answers and transcripts are sent to third-party AI providers — Anthropic, Deepgram, and OpenAI — to run the exam. Tap to consent and begin."). **`docs/mobile/screens/02-onboarding.md` is authoritative for the consent UX + record**; this checklist asserts the gate must exist. The record must be persisted server-side (a `POST /api/consent` with `{kind:'ai_data_processing', choices:{accepted:'third_party_ai_v1'}}`-style body, route documented in `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`) and must precede the first audio capture; M2 ships the screens voice-OFF, so the consent record exists before the M3 mic/audio paths light up.

3. **Reflect all of it in the App Store Connect Privacy Nutrition Label** (§19) — audio + usage + identifiers, declared honestly. A label/behavior mismatch is a routine rejection.

#### Qualitative requirements
- The privacy policy is accurate for the *native* app: names Deepgram, drops web-only trackers, states third-party-AI processing of voice.
- The user gives explicit, recorded consent (the **separate `ai_data_processing` kind**, not the FAA disclaimer) to AI/voice data sharing before any voice leaves the device.
- The policy is linked both in App Store Connect and in-app (Settings + onboarding).

#### Measurable success criteria
- [ ] Updated privacy policy names **Deepgram** as STT+TTS and removes the Web Speech API language — diff/screenshot of the corrected page. Pass/fail.
- [ ] Privacy policy third-party list matches the *shipped* iOS SDK set (no GA4/Ads/Clarity unless actually bundled) — cross-checked against the iOS dependency manifest. Pass/fail.
- [ ] Onboarding consent copy explicitly names Anthropic + Deepgram + OpenAI and "AI" processing of voice; consent is recorded server-side under the **separate `ai_data_processing` kind** (`third_party_ai_v1`), **not** `faa_disclaimer_v1`, **before** the first exam and before any audio leaves the device — end-to-end test + stored record (authoritative spec: `screens/02-onboarding.md`). Pass/fail.
- [ ] Privacy policy URL is present and live in App Store Connect AND reachable in-app (Settings + onboarding) — 3/3. Pass/fail.
- [ ] **Microphone is the ONLY sensitive permission** requested (data minimization) — Info.plist audit shows `NSMicrophoneUsageDescription` and **no** `NSPhotoLibraryUsageDescription` / `NSCameraUsageDescription` / Photos access, because v1 ships **default avatars only** (no photo-library upload; custom-avatar upload deferred to v1.1, per the avatar resolution). Exactly 1 sensitive permission. Pass/fail.

---

## 11. App Tracking Transparency (ATT) for PostHog — VERIFY-AT-SUBMISSION

**Requirement (5.1.2(i) + ATT framework):** ATT is required only if the app **tracks** — links the app's user/device data with data collected from *other companies'* apps/websites for targeted advertising or ad measurement, OR shares data with **data brokers**. First-party product analytics with no IDFA, no cross-company linking, and no data-broker sharing is **not** "tracking" and does **not** require the ATT prompt. You may **not** gate functionality on the ATT answer.

**How HeyDPE satisfies it.** The product analytics is **PostHog**, configured as first-party (`src/components/PostHogProvider.tsx:26-34`, `person_profiles:'identified_only'`, manual pageviews, no IDFA, consent-gated init at `:53-59`). Used purely as first-party product analytics with no IDFA and no cross-company data linking, PostHog typically does **not** trigger ATT — so HeyDPE can legitimately answer "no tracking," show **no ATT prompt**, and set the privacy-manifest tracking keys to false. The web also carries GA4 / Google Ads / Clarity (`privacy/page.tsx:239-251`) — these **must not** be bundled in the iOS app, because Google Ads/attribution *would* be "tracking" and would force the ATT prompt + a tracking declaration.

**OWNER DECISION — iOS analytics SDK set:** confirm the iOS build ships **PostHog only** (no GA4 / Google Ads / Clarity / attribution SDK). If any ad/attribution SDK is added, you MUST: add `NSUserTrackingUsageDescription`, call `ATTrackingManager.requestTrackingAuthorization`, set `NSPrivacyTracking=true` + populate `NSPrivacyTrackingDomains`, and declare tracking in the Nutrition Label.

#### Qualitative requirements
- The iOS analytics posture is first-party-only; the "tracking" answer is honest and consistent across the manifest, the ATT decision, and the Nutrition Label.

#### Measurable success criteria
- [ ] **HARD BUILD GATE — automated dependency scan (not a manual check):** a CI/build step scans the resolved iOS dependency tree + bundle and asserts **0** GA4 / Google Analytics, **0** Google Ads / gtag, **0** Microsoft Clarity, and **0** attribution/MMP SDKs (AppsFlyer, Adjust, Branch, Firebase Analytics, Facebook SDK, etc.); it also asserts the shipped **PostHog config has IDFA collection OFF and session replay OFF** (`disable_session_recording` / no replay autocapture). The build **fails** on any hit. `NSPrivacyTracking=false` is **tied to this scan passing** — the manifest may only declare no-tracking when the scan is green. Pass/fail (0 hits required).
- [ ] **VERIFY-AT-SUBMISSION:** confirm the shipped iOS PostHog config (and any carried-over pixel/SDK) does **not** enable IDFA collection or cross-company linking — dependency + config audit, recorded. Pass/fail.
- [ ] If "no tracking": `PrivacyInfo.xcprivacy` has `NSPrivacyTracking=false` (gated on the dependency scan above), `NSPrivacyTrackingDomains` empty, no `NSUserTrackingUsageDescription`, no ATT prompt at runtime, and the Nutrition Label declares no tracking — consistency check 5/5. Pass/fail.
- [ ] If any tracking SDK is present: ATT prompt shown, `NSUserTrackingUsageDescription` set, manifest tracking keys + domains populated, label declares tracking — 4/4 consistency. Pass/fail.

---

## 12. `PrivacyInfo.xcprivacy` — the app's privacy manifest

**Requirement.** A `PrivacyInfo.xcprivacy` XML plist at the target root declares the app's privacy practices via four keys: `NSPrivacyTracking` (Bool), `NSPrivacyTrackingDomains` (Array), `NSPrivacyCollectedDataTypes` (Array of dicts → drives the public Nutrition Label), and `NSPrivacyAccessedAPITypes` (required-reason APIs, §13). Third-party SDKs each ship their own manifest inside their bundle.

**How HeyDPE satisfies it.** Ship a `PrivacyInfo.xcprivacy` declaring:
- `NSPrivacyTracking` = **false** (per §11, PostHog-only first-party) — **gated on the §11 HARD build-gate dependency scan passing** (0 GA4/Ads/Clarity/attribution SDKs, PostHog with no IDFA + no session replay); the false value is not asserted manually. `NSPrivacyTrackingDomains` = empty.
- `NSPrivacyCollectedDataTypes` covering at least: **Audio Data** (mic → Deepgram; `…PurposeAppFunctionality`), **Email Address** (auth; linked to identity), **User ID** (account id; linked), **Customer Support / Other Usage Data** (transcripts, progress; app functionality + analytics), **Purchase History** (IAP/subscription; app functionality), **Product Interaction / Usage Data** (PostHog analytics; `…PurposeAnalytics`). Each entry sets `NSPrivacyCollectedDataTypeLinked` and `NSPrivacyCollectedDataTypeTracking` honestly (tracking=false for all, per §11).
- `NSPrivacyAccessedAPITypes` per §13.
- **No photo-access data type.** v1 ships **default avatars only** — there is **no** photo-library upload (custom-avatar upload is deferred to v1.1). So the manifest declares **no Photos/Camera data type**, ships **no** `NSPhotoLibraryUsageDescription` / `NSCameraUsageDescription`, and the §14 "microphone is the only sensitive permission" claim stays **true** end-to-end (reconciles with §10's data-minimization measurable and the §19 Nutrition Label, which likewise declares no photo/camera data).
- Confirm bundled SDKs (RevenueCat `react-native-purchases`, PostHog, Supabase, the Expo audio module, Deepgram client) each include their own manifest + valid signature (Apple requires this for the common-SDK list since 2024-05-01 / 2025-02-12).

#### Qualitative requirements
- The app manifest exists, is internally consistent with the ATT decision (§11) and the Nutrition Label (§19), and every privacy-impacting third-party SDK carries its own signed manifest.

#### Measurable success criteria
- [ ] `PrivacyInfo.xcprivacy` present at the iOS target root with all four top-level keys — file exists + xmllint valid. Pass/fail.
- [ ] `NSPrivacyCollectedDataTypes` includes Audio Data + Email + User ID + Purchase History + Usage Data, each with Linked/Tracking flags — checklist ≥ 5 types. Pass/fail.
- [ ] Manifest `NSPrivacyTracking` value equals the Nutrition Label tracking answer equals the ATT behavior — 3-way consistency. Pass/fail.
- [ ] Each bundled privacy-impacting SDK ships a signed `PrivacyInfo.xcprivacy` — dependency audit, 0 missing. Pass/fail.

---

## 13. Required-reason APIs in `NSPrivacyAccessedAPITypes` — VERIFY-AT-SUBMISSION codes

**Requirement (enforced since 2024-05-01).** If your code or a linked SDK calls a "required-reason" API, you MUST declare an Apple-approved reason in `NSPrivacyAccessedAPITypes`. Upload validation rejects with **`ITMS-91053`** (missing declaration) / **`ITMS-91055`** (invalid reason).

**Likely HeyDPE triggers** (declare the precise code from Apple's TN3183 at build time):

| Category identifier | Likely HeyDPE trigger | Candidate reason codes |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | Settings / voice prefs / consent flags in `UserDefaults` — almost certain | `CA92.1` / `1C8F.1` / `C56D.1` / `AC6B.1` |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | Audio-buffer / cache file metadata | `DDA9.1` / `C617.1` / `3B52.1` / `0A2A.1` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | Timing/latency instrumentation, analytics SDK | `35F9.1` / `8FFB.1` / `3D61.1` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | Free-space check before writing TTS mp3 cache | `85F4.1` / `E174.1` / `7D9E.1` / `B728.1` |

**How HeyDPE satisfies it.** Declare each triggered category with the exact matching reason code; `UserDefaults` is effectively guaranteed (settings + consent). The audio cache / temp-file player (`03-VOICE-PIPELINE.md §2`) likely touches FileTimestamp + DiskSpace. **VERIFY-AT-SUBMISSION:** the human-readable meaning of each code (e.g., whether `CA92.1` vs `1C8F.1` fits your specific use) — pick the precise code from TN3183 at build; a mismatched code is itself a rejection.

#### Measurable success criteria
- [ ] `NSPrivacyAccessedAPITypes` declares at least `UserDefaults` with a correct reason code — manifest inspection. Pass/fail.
- [ ] An Xcode/Transporter validation upload returns **no** `ITMS-91053` / `ITMS-91055` — validation log clean. Pass/fail.
- [ ] **VERIFY-AT-SUBMISSION:** each declared code matches the app's actual use per TN3183 — recorded mapping per code. Pass/fail.

---

## 14. `NSMicrophoneUsageDescription` — feature-specific wording

**Requirement.** Any app accessing the microphone MUST set `NSMicrophoneUsageDescription` in Info.plist with a clear, user-facing purpose string. Missing → upload rejection `ITMS-90683`; calling a mic API at runtime without the key crashes the app immediately. Generic strings are a common rejection.

**How HeyDPE satisfies it.** STT captures the mic (`03-VOICE-PIPELINE.md §1`). Set a feature-specific string (sentence-case IBM Plex when surfaced by the OS prompt). Recommended wording:

> "HeyDPE uses the microphone to hear your spoken answers during practice oral exams, so the AI examiner can transcribe and assess them. You can also type your answers instead."

#### Measurable success criteria
- [ ] `NSMicrophoneUsageDescription` present and names the feature (exam answers) + what happens (transcribe/assess) — Info.plist check. Pass/fail.
- [ ] Validation upload returns no `ITMS-90683`; first mic use on device shows the string and does not crash — device test. Pass/fail.
- [ ] **Mic-DENIED graceful degradation (5.1.1(ii) — non-blocking permission):** with microphone permission **denied**, a **full exam is completable by TEXT only** — a clear in-UI affordance (the keyboard/type-answer control) is present, every examiner turn can be answered by typing, and the exam reaches a normal end with **no crash, no dead-end, and no nag-loop** re-prompting for the mic. Capture this in **Notes for Review** so the reviewer can run the app with the mic denied. Device test, pass/fail.

---

## 15. `UIBackgroundModes: [audio]` — locked-screen examiner playback

**Requirement.** To keep examiner TTS audible while the screen is locked, add `UIBackgroundModes=[audio]` to Info.plist and configure `AVAudioSession` category `.playback` + `setActive(true)`. **Constraints:** background **mic capture cannot be activated from the background** (must start in foreground); the `audio` mode must play **genuinely audible content** — silent keep-alive is a rejection cause.

**How HeyDPE satisfies it.** `03-VOICE-PIPELINE.md §5` already specifies `UIBackgroundModes:[audio]` via the `expo-audio` config plugin (`enableBackgroundPlayback:true`) + `.playback` semantics (`03-VOICE-PIPELINE.md:253`), designs the locked-screen flow as **playback-only** (examiner finishes the current turn; mic is foreground-only, `03-VOICE-PIPELINE.md:254`), and explicitly forbids using the mode as a between-utterances keep-alive (`:255`). HeyDPE is compliant because it plays real TTS.

**Reviewer-facing note (put in Notes for Review, §22-E).** State plainly that the `UIBackgroundModes:[audio]` entitlement exists **solely to finish the in-flight examiner turn audibly when the screen locks** — it is **not** used to capture audio in the background and **not** used for a silent keep-alive. **Audio capture is intentionally foreground-only:** the microphone never starts from the background; on return to foreground the app shows a "Tap to answer" affordance. Give the reviewer a **multi-sentence locked-screen demonstration** to run: start an exam, prompt the examiner into a **multi-sentence** turn, then **lock the device mid-turn** — the full multi-sentence examiner answer continues to play audibly to completion on the lock screen, after which audio stops (no silent keep-alive) and the mic does not engage until the app is foregrounded again.

#### Qualitative requirements
- Examiner audio finishes audibly with the screen locked; the mic never tries to start in the background; the mode is never used for silent keep-alive.

#### Measurable success criteria
- [ ] `UIBackgroundModes` contains `audio`; `AVAudioSession` is `.playback` for the background window — Info.plist + runtime check. Pass/fail.
- [ ] On a real **locked** device: TTS for the in-flight turn completes audibly; attempting to start STT while backgrounded does not activate capture (graceful "Tap to answer" on return) — TestFlight screen-recording. Pass/fail.
- [ ] No silent audio is played to stay alive between utterances — audio-trace inspection. Pass/fail.

---

## 16. Export compliance — `ITSAppUsesNonExemptEncryption` — VERIFY-AT-SUBMISSION

**Requirement.** Set `ITSAppUsesNonExemptEncryption` in Info.plist to skip the per-upload questionnaire. HTTPS/TLS via `URLSession` and OS-provided crypto is **exempt**. Set `YES` only if the app/a linked lib implements **proprietary/non-standard** crypto (may require BIS documentation).

**How HeyDPE satisfies it.** The app uses only standard HTTPS/TLS to the Vercel origin, Supabase, Anthropic, Deepgram, OpenAI, RevenueCat/Apple (`01-API-ENABLEMENT-AND-CONTRACT.md:204,208` — TLS 1.2+, no ATS exception). Set **`ITSAppUsesNonExemptEncryption = NO`**.

#### Measurable success criteria
- [ ] `ITSAppUsesNonExemptEncryption = NO` in Info.plist — check. Pass/fail.
- [ ] **VERIFY-AT-SUBMISSION:** confirm no bundled SDK ships non-exempt proprietary crypto (RevenueCat/PostHog/Supabase/Expo audio/Deepgram all use OS TLS) — dependency audit, 0 proprietary-crypto deps. Pass/fail.

---

## 17. Age rating questionnaire (new system, mandatory since 2026-01-31) — VERIFY-AT-SUBMISSION

**Requirement.** Apple expanded bands to **4+, 9+, 13+, 16+, 18+** and added a required questionnaire (In-app controls, Capabilities, Medical/wellness topics, Violent themes). All apps had to answer the updated questions by **2026-01-31** to keep submitting. You may set a **higher** rating manually.

**How HeyDPE satisfies it.** Complete the new questionnaire honestly. HeyDPE is exam *prep* — not medical, not violent, no user-generated content shown to others, no gambling. Terms already set a **13+ minimum age** (`src/app/terms/page.tsx:78` "You must be at least 13 years of age"), so **pin the App Store minimum age at 13+** and never let the computed rating fall below that policy floor (set a manual 13+ floor if Apple computes lower).

**Concrete answers to the 2026 generative-AI / chatbot capability questions:**
- **"Does the app include AI-generated or chatbot content?"** → **Yes** — an AI examiner generates the questions/feedback.
- **"Is the AI/chatbot output unrestricted / open-ended?"** → **No.** The examiner is **system-prompt-constrained** to the FAA ACS aviation oral-exam domain (`buildSystemPrompt()` in `exam-logic.ts`); it is a scoped aviation tutor, **not** an open-ended general-purpose chatbot.
- **"Can the app browse / access the open web?"** → **No open-web access** from the AI runtime (the knowledge graph was archived; retrieval is RAG over a fixed FAA corpus, not live web).
- **"Is AI output shared user-to-user / is there user-generated content shown to others?"** → **No** — output is private to the single user's own practice session; there is no social/UGC surface visible to others.
- Net effect: these answers keep the rating at the aviation-scoped, constrained-AI level and support a **13+** result.

**OWNER DECISION:** confirm pinning the App Store rating at **13+** to match the Terms (recommended default per the cross-doc resolution: 13+ everywhere, no under-13 / no Designed-for-Families duties), rather than accepting a lower Apple-computed value.

#### Measurable success criteria
- [ ] The updated age-rating questionnaire is fully answered in App Store Connect — submission shows a computed rating. Pass/fail.
- [ ] Final rating ≥ 13+ (matching Terms `terms/page.tsx:78`) — screenshot. Pass/fail.
- [ ] **VERIFY-AT-SUBMISSION:** "Medical or wellness topics" answered carefully so the rating isn't inflated; if distributing to AU/Vietnam, re-check the 2026-06-18 regional update. Recorded. Pass/fail.

---

## 18. App Store Connect listing — required metadata fields

**Requirement.** Provide: app name, subtitle, promotional text, description, keywords, support URL, marketing URL (optional), **privacy policy URL (required)**, EULA/Terms link, the Nutrition-Label answers (§19), age-rating answers (§17), export-compliance answer (§16), pricing/availability, and the build.

**How HeyDPE satisfies it.**
- **Name:** `HeyDPE` (brand, CLAUDE.md / `terms/page.tsx`).
- **Subtitle (≤ 30 chars):** practice-framed, e.g. "AI checkride oral exam prep" (mirrors `privacy/page.tsx:9`).
- **Description:** voice-first AI DPE *simulation* for Private / Commercial / Instrument oral prep; ACS-driven; subscription required for unlimited exams; 7-day/3-exam free trial; FAA-disclaimer (§2).
- **Keywords (100 chars, comma-separated, no spaces wasted):** candidate set — `checkride,oral exam,DPE,FAA,private pilot,instrument,commercial,ACS,aviation,pilot,flight,study`. Do not repeat the app name; do not use competitor names.
- **Privacy Policy URL:** `https://aviation-oral-exam-companion.vercel.app/privacy` (or the heydpe.com equivalent) — must be the **corrected** policy from §10.
- **Terms/EULA:** link `/terms`; if using the standard Apple EULA, still link `/terms` in the description and in the paywall (§4). The linked Terms must carry the **store-conditional refund clause** (§4): App Store / Google Play purchases are refunded **by Apple / Google** via report-a-problem, **not** by the developer; the 7-day email-refund promise is web/Stripe-only. (Terms edit is an OWNER/legal action — not made here.)
- **Support URL / Marketing URL:** owner-provided (e.g. help page `src/app/help/`).

#### Qualitative requirements
- All required fields populated; framing consistent with §2; privacy URL points at the corrected policy.

#### Measurable success criteria
- [ ] All required ASC fields non-empty (name, subtitle, description, keywords, support URL, privacy URL) — ASC completeness check, 0 missing. Pass/fail.
- [ ] Keywords ≤ 100 chars, no app-name repetition, no competitor names — count + review. Pass/fail.
- [ ] Privacy URL resolves to the §10-corrected policy (names Deepgram, no Web Speech API) — open + verify. Pass/fail.

---

## 19. Privacy Nutrition Label answers (App Store Connect)

**Requirement.** Declare, per data type: collected? linked to identity? used for tracking? for which purposes? The label must match the manifest (§12) and actual SDK behavior; mismatch is a routine rejection.

**How HeyDPE satisfies it (proposed declarations — confirm against the shipped SDK set):**

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| **Audio Data** (mic → Deepgram STT; transient) | Yes | Yes (tied to account/session) | No | App Functionality |
| **Email Address** | Yes | Yes | No | App Functionality (auth) |
| **User ID** | Yes | Yes | No | App Functionality, Analytics |
| **Purchase History** (IAP / subscription state) | Yes | Yes | No | App Functionality |
| **Other Usage Data** (transcripts, progress, exam content) | Yes | Yes | No | App Functionality |
| **Product Interaction** (PostHog events) | Yes | Yes | No | Analytics |
| **Crash/Performance** (if any) | per SDK | per SDK | No | App Functionality |

- **Tracking column is "No" for every row** *iff* §11 holds (PostHog-only, no IDFA, no ad SDK). If any ad/attribution SDK is added, flip the relevant rows + the manifest + show ATT.
- Voice is **transient** (not stored as raw audio; only transcripts persist via `session_transcripts`) — declare Audio Data as collected-for-app-functionality, consistent with the privacy policy's transient-voice description (corrected per §10).

#### Measurable success criteria
- [ ] Every Nutrition-Label row matches a `NSPrivacyCollectedDataTypes` entry in `PrivacyInfo.xcprivacy` (§12) — 1:1 reconciliation, 0 mismatches. Pass/fail.
- [ ] Tracking answers in the label == manifest `NSPrivacyTracking` == ATT behavior (§11) — 3-way consistency. Pass/fail.
- [ ] No data type the app doesn't actually collect is declared, and none it does collect is omitted — SDK-behavior audit. Pass/fail.

---

## 20. Screenshots & app preview specs — VERIFY-AT-SUBMISSION sizes

**Requirement (current spec).** 1–10 screenshots per device family (`.png`/`.jpg`); Apple auto-scales down from the largest provided size. Required sizes if the app runs on that device:
- **iPhone 6.9″:** **1320 × 2868** portrait (2868 × 1320 landscape). 6.5″ (1284 × 2778) accepted as alternative.
- **iPad 13″:** **2064 × 2752** portrait (2752 × 2064 landscape). 12.9″ (2048 × 2732) accepted as alternative.
- App previews (video) optional.

**How HeyDPE satisfies it.** Capture native FLIGHT DECK screenshots that honestly show the gated paid experience (§2/2.3.2): the Practice exam (voice UI), Home dashboard, Progress (ACS coverage), and the paywall sheet with a "subscription required" flag. Apply the typography rule (§0) — caps-mono only for instrument moments. **OWNER DECISION:** iPad support in v1? If iPad is enabled, 13″ screenshots are required; if iPhone-only, set device family to iPhone and skip iPad assets.

#### Measurable success criteria
- [ ] iPhone 6.9″ (1320×2868) screenshots uploaded (1–10); if iPad-enabled, 13″ (2064×2752) too — ASC upload check. Pass/fail.
- [ ] At least one screenshot flags subscription-required content (§2) — review. Pass/fail.
- [ ] **VERIFY-AT-SUBMISSION:** re-check the live Screenshot Specifications page for any pixel-size change before export. Recorded. Pass/fail.

---

## 21. TestFlight gates (internal → external)

**Requirement.** Internal testers: up to **100** (App Store Connect team members), immediate, **no Beta App Review**. External testers: up to **10,000** via email/public link; the **first build** of an external group goes to **Beta App Review** before distribution. Builds expire after 90 days.

**How HeyDPE satisfies it.** Use internal TestFlight for the staging/QA loop (including the locked-screen voice test, §15) since it skips review; promote to an external group (gated by Beta App Review) for wider beta. Exercise the mic/background-audio behavior on a **real locked device** in TestFlight before App Review (§15 measurable).

#### Measurable success criteria
- [ ] An internal TestFlight build installs and runs a full voice exam on a physical device — pass/fail.
- [ ] The first external build clears Beta App Review — ASC status "Approved". Pass/fail.
- [ ] Locked-screen playback + foreground-only mic verified on a physical device in TestFlight (§15) — screen-recording artifact. Pass/fail.

---

## 22. SUBMISSION RUNBOOK (build → TestFlight → review → release)

> Execute top-to-bottom. Each step has a measurable gate; do not proceed past a failed gate.

**A. Pre-build configuration**
1. Set Info.plist keys: `NSMicrophoneUsageDescription` (§14), `UIBackgroundModes=[audio]` (§15), `ITSAppUsesNonExemptEncryption=NO` (§16); and `NSUserTrackingUsageDescription` **only if** §11 determines tracking.
   - Gate: all keys present (or ATT key intentionally absent) — Info.plist diff. Pass/fail.
2. Add `PrivacyInfo.xcprivacy` (§12) with `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes` (§13).
   - Gate: xmllint-valid; required-reason codes present. Pass/fail.
3. Configure RevenueCat: upload the **In-App Purchase Key (.p8)**, create the two **full-price** auto-renewable products (**no StoreKit introductory offer in v1** — the trial is the app-side card-free tier, `04-PAYMENTS-ENTITLEMENTS.md §1.3`), map both to the single "pro" entitlement, connect Stripe via the Stripe App Marketplace with shared App User ID (`04-PAYMENTS-ENTITLEMENTS.md`).
   - Gate: a sandbox buy unlocks `dpe_live`; a Stripe-web sub inherits on iOS — 2/2. Pass/fail.
4. Set Sign in with Apple capability + entitlement; verify SIWA button renders (§8).
   - Gate: SIWA sign-up creates a profile — pass/fail.

**B. Build (EAS) → upload**
5. `eas build --platform ios --profile production` (dev-client/New-Architecture per LOCKED decision D5).
6. Upload via EAS Submit / Transporter; clear validation (no `ITMS-90683` / `ITMS-91053` / `ITMS-91055`).
   - Gate: validation log clean (§13/§14). Pass/fail.

**C. TestFlight**
7. Internal TestFlight: run the full Notes-for-Review exam flow + the locked-screen voice test on a physical device (§21/§15).
   - Gate: voice exam works end-to-end; locked-screen playback + foreground mic verified — recording. Pass/fail.
8. (Optional) External group → Beta App Review.
   - Gate: external build Approved. Pass/fail.

**D. App Store Connect listing**
9. Fill all metadata (§18), keywords, support/privacy URLs (corrected policy §10), EULA link.
10. Upload screenshots (§20). Complete the Nutrition Label (§19), age-rating questionnaire (§17), export-compliance answer (§16).
11. Set pricing/availability; attach the build; attach the two IAP products to the version (§3).
   - Gate: ASC completeness — 0 missing required fields; IAP products attached to the version. Pass/fail.

**E. App Review Information (the 2.1 make-or-break)**
12. **SCRIPTED demo-account release gate (HARD — not a manual one-off recording).** Run an automated pre-submission script that signs in **AS the pre-entitled demo account** (§1) against **PRODUCTION**, **creates 4+ exam sessions back-to-back**, and **asserts ZERO `403`s** from `POST /api/session` (the trial gate never trips), plus a **live exchange against all four back-ends** for at least one session — `exam` (one `assessAnswer` + one `generateExaminerTurn` returns 200), `tts` (valid audio), `stt` (transcript), and `tier` (`GET /api/user/tier` returns a paid/tester effective tier). The script must run **green** before submission; a red run is a **NO-GO**. Then enter the demo credentials, the 7-step exam walkthrough, the "how to view IAP" note, the back-ends-are-live confirmation, the **mic-denied / type-only** note (the reviewer can complete a full exam by typing if the mic is denied, §14), the **background-audio note** (the `UIBackgroundModes:[audio]` entitlement only finishes the in-flight examiner turn audibly on lock; capture is foreground-only — with the multi-sentence locked-screen demonstration steps, §15), and the hidden-feature disclosures (admin/instructor/Scenario Engine, §2) into Notes for Review.
   - Gate: scripted run is green — **0×** `403` across **4+** created sessions + live 200/valid response from **all four** back-ends (exam/tts/stt/tier) — and the Notes-for-Review checklist (§1 + §2 + mic-denied note) is complete. Pass/fail.
13. Submit for review.

**F. Release**
14. Choose manual or automatic release. On approval, release; monitor RevenueCat + crash reports for the first cohort.
   - Gate: first production purchase unlocks entitlement; no spike in deletion/crash. Pass/fail.

---

## 23. PRE-SUBMISSION GO / NO-GO CHECKLIST

Submit **only** when every line is checked. A single unchecked line = NO-GO.

**Payments & entitlements**
- [ ] iOS new purchases go through StoreKit IAP only; no Stripe checkout in the iOS purchase path (§3).
- [ ] Both auto-renewable products configured (full price, **no StoreKit intro offer** in v1), attached to the version, Ready to Submit (§3/§4).
- [ ] Restore Purchases button present and works on reinstall/second device (§4).
- [ ] Existing Stripe web subscriber inherits `dpe_live` on iOS without re-paying (§5).
- [ ] Paywall shows all 5 Schedule-2 disclosures + renewal-mechanics copy + Privacy/Terms links (§4).

**Review reachability**
- [ ] **Scripted prod gate green:** demo account creates 4+ sessions with **0×** `/api/session` 403 and a live exchange to all 4 back-ends (exam/tts/stt/tier) (§1/§22-E step 12).
- [ ] Notes for Review: demo creds + 7-step exam walkthrough + IAP-visibility note + back-ends-live + hidden-feature disclosure (§1/§2).

**Auth & deletion**
- [ ] Sign in with Apple present + at parity with Google/Microsoft (§8).
- [ ] In-app Delete account works end-to-end via `/api/user/delete` (§9).

**Privacy & consent**
- [ ] Corrected privacy policy published: names Deepgram, drops Web Speech API + web-only trackers, states third-party-AI voice processing (§10).
- [ ] Onboarding consent explicitly names Anthropic + Deepgram + OpenAI AI processing and is recorded server-side under the **separate `ai_data_processing` kind** (`third_party_ai_v1`, not the FAA disclaimer) before the first exam / before any audio leaves the device (§10).
- [ ] ATT decision finalized and consistent across manifest + label + runtime (§11). **VERIFY-AT-SUBMISSION.**
- [ ] `PrivacyInfo.xcprivacy` present, valid, consistent with the Nutrition Label (§12/§19).
- [ ] Required-reason API codes declared; validation upload clean of `ITMS-91053/91055` (§13). **VERIFY-AT-SUBMISSION on exact codes.**

**Technical Info.plist**
- [ ] `NSMicrophoneUsageDescription` feature-specific; no `ITMS-90683` (§14).
- [ ] `UIBackgroundModes=[audio]`; locked-screen playback + foreground-only mic verified on device (§15).
- [ ] `ITSAppUsesNonExemptEncryption=NO`; no proprietary-crypto SDK (§16). **VERIFY-AT-SUBMISSION.**

**Listing**
- [ ] Metadata practice-framed, FAA-disclaimer present, no "official FAA" claim (§2/§18).
- [ ] Subscription-required flagged in description + ≥ 1 screenshot (§2/§20).
- [ ] Age-rating questionnaire complete; rating ≥ 13+ (§17). **VERIFY-AT-SUBMISSION on medical-topics answer.**
- [ ] iPhone 6.9″ (and iPad 13″ if enabled) screenshots uploaded (§20). **VERIFY-AT-SUBMISSION on sizes.**

**Design**
- [ ] No primary-surface WebView; native mic/StoreKit/audio in use (§7).
- [ ] FLIGHT DECK typography rule honored on every added control; ≥ 12pt, ≥ 44pt targets (§0).

**External-link posture**
- [ ] v1 IAP-only (default) confirmed; if a US external link is added, IAP ≥ link prominence (§6). **VERIFY-AT-SUBMISSION on SCOTUS 2026-06-25.**

---

## 24. Consolidated VERIFY-AT-SUBMISSION register

These cannot be fully verified now; re-check immediately before submitting and record the check date + source:

1. **External-link / anti-steering (US storefront)** — pending the **2026-06-25 SCOTUS conference vote** + any stay (§6).
2. **StoreKit subscription disclosure / Schedule 2 wording** — confirm against the *current* Apple Developer Program License Agreement at submission (§4).
3. **ATT/tracking determination** — confirm the shipped iOS PostHog (and any carried pixel/SDK) config does not enable IDFA / cross-company linking; drives ATT + manifest + label (§11).
4. **Required-reason API codes** — pick the exact TN3183 code matching each actual use; a mismatched code is a rejection (§13).
5. **Export-compliance** — confirm no bundled SDK ships non-exempt proprietary crypto so `NO` is truthful (§16).
6. **Age-rating "medical/wellness" answer** + AU/Vietnam 2026-06-18 regional update if distributing there (§17).
7. **Screenshot pixel sizes** — re-check the live Screenshot Specifications page (§20).
8. **Guidelines revision** — confirm the live guidelines page has not been revised after 2026-06-08 before submitting.

---

## 25. Owner-decision summary (every callout above, in one place)

1. **Demo-account provisioning** (§1) — `dpe_live` row vs. `paid_equivalent` override (recommended); also whether to add a no-login demo mode.
2. **External-link posture** (§6) — v1 IAP-only (recommended) vs. add a US-only Stripe external link.
3. **iOS analytics SDK set** (§11) — confirm PostHog-only (no GA4 / Ads / Clarity / attribution).
4. **Privacy policy update** (§10) — publish a corrected `/privacy` (or iOS section) naming Deepgram, dropping Web Speech API + web-only trackers, stating third-party-AI voice processing — **blocking for submission**.
5. **Age rating** (§17) — pin at 13+ to match Terms vs. accept Apple's computed value if ≥ 13+.
6. **iPad support in v1** (§20) — drives whether 13″ iPad screenshots are required.

> **Bottom line:** the highest-leverage, build-blocking items are (a) StoreKit IAP replacing Stripe on iOS (§3), (b) the pre-entitled demo account that never trips the trial 403 (§1), (c) the corrected privacy policy + explicit AI-consent gate (§10), and (d) the in-app account-deletion surface wired to the existing `/api/user/delete` (§9). Account deletion and data export already exist server-side; SIWA already ships; the work is wiring them into the native shell and getting the privacy disclosures + IAP exactly right.
