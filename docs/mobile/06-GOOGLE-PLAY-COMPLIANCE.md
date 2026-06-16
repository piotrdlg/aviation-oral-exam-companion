# Google Play Compliance & Submission — HeyDPE (Android)

> **Read order:** This doc is the **Android** sibling of the App Store compliance plan. It is written **now**, in full, even though the locked sequencing is **iOS first, Android second on the same shared foundation** (decision D5). Build the iOS app against `docs/mobile/05-APPLE-COMPLIANCE.md` and the screen specs; this doc is the gate every Android release must pass before it can leave `production` review. **Nothing here is "done" until it is checked against a freshly cache-busted load of the cited Google policy page at submission** — several Google help pages were serving an **API-35-era cached copy** at research time and are flagged **VERIFY-AT-SUBMISSION** throughout.
>
> **Scope guardrails:**
> - **No server contract change for Android.** The Play build is a *client* of the same fixed API the web and iOS apps consume. The account-deletion contract, tier gate, quota logic, and entitlement merge are unchanged. Where this doc cites a route, the route is truth (`src/app/...`), never a re-spec.
> - **Native payment authority on Android is RevenueCat → Google Play Billing** (later Android phase). Stripe stays the web path. The same server-side entitlement merge that prevents Stripe+IAP stacking on iOS (`docs/mobile/04-PAYMENTS-ENTITLEMENTS.md`, `docs/mobile/screens/07-paywall.md`) applies verbatim to `store: PLAY_STORE`.
> - **Every section carries BOTH** (a) a qualitative "done" bar and (b) measurable pass/fail criteria with numbers/thresholds/verifiable artifacts. A section without measurable criteria is incomplete by the owner's standard.
> - **FLIGHT DECK typography rule** (Design System §typography): caps-mono + glow ONLY for brand instrument moments — hero, `//` micro-labels, status annunciators/badges, ACS/element codes, numeric readouts. Everything else is sentence-case IBM Plex. Never 10 px text. Touch targets **≥ 48 dp** (Android) / 44 pt (iOS). This doc is policy, not UI, but the few in-app surfaces it touches (the prominent-disclosure mic sheet, the in-app delete entry) inherit the rule.

**As-of date for every Google policy claim below: 2026-06-15.** Re-confirm at submission.

---

## 0. Compliance status board (at a glance)

| # | Requirement | HeyDPE posture | Blocking? | Status |
|---|---|---|---|---|
| 1 | Data safety form | Audio/voice recordings + Personal info (email) + App activity/diagnostics/Device IDs (analytics); encryption-in-transit; data-deletion answers | **Yes** | Drafted §1 — VERIFY vendor mapping |
| 2 | Play Billing vs US Alternative/External-link | Keep Google Play Billing via RevenueCat for v1; rate cards reserved but **$0 assessed today** | **Yes** (must pick a billing path) | Decided §2 — VERIFY fee posture |
| 3 | In-app account deletion + web URL | In-app `POST /api/user/delete`; public web URL `…/delete-account` (**OWNER DECISION D-GP-1**) | **Yes** | Route verified §3; web URL pending |
| 4 | Target API level | Target **API 36 (Android 16)**, min API 26 (recommend) | **Yes** | Planned §4 — VERIFY exact date/level |
| 5 | Foreground service (mediaPlayback) | **COMMITTED:** background examiner TTS → declare `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + Console FGS declaration + demo video (bundletool-proven in M3); **no** background mic FGS | **Yes** | Committed §5 (matches voice doc §5.2) |
| 6 | `RECORD_AUDIO` + prominent disclosure + permissions declaration | Runtime prompt tied to listed core function (voice answers); prominent-disclosure sheet before first capture | **Yes** | Decided §6 |
| 7 | IARC content rating | Education/reference, no ads, no objectionable content → broad rating | **Yes** | §7 — complete questionnaire at submission |
| 8 | Play App Signing + AAB | `.aab`, enroll in Play App Signing, EAS-managed upload key | **Yes** | §8 |
| 9 | Listing assets | Icon, feature graphic, phone+tablet screenshots, short/full description, privacy URL | **Yes** | §10 |
| 10 | Testing-track gate | Internal → Closed (12×14d if personal account) → Open/Production | **Yes** | §11 RUNBOOK — VERIFY account type |

A "Yes" in **Blocking** means the release cannot reach production review (or will be rejected) until the row is green.

---

## 1. Data Safety form (App content → Data safety)

### Rule
A complete and accurate Data Safety declaration is **required for every app** on Google Play (only Internal-testing tracks and system services are exempt). The developer alone is responsible for completeness/accuracy; misrepresentation is an enforcement/removal offense. **Collection** ("transmitting data off the device, including via SDKs/libraries") and **Sharing** ("transferring to a third party") are declared **separately**; on-device-only or end-to-end-encrypted data is excluded from Collection, and **service-provider** transfers are excluded from Sharing. The form's data-deletion section is mandatory and surfaces on the public listing (§3). *(as of 2026-06-15)*

### How HeyDPE satisfies it
The Android binary's behavior is fixed by the shared voice pipeline and the web/API contracts. The honest declaration:

| Data type (Google category) | Collected? | Shared? | Why / source of truth | Optional? | Purpose |
|---|---|---|---|---|---|
| **Audio → Voice or sound recordings** | **Yes** (leaves device) | **Conditional** (see note) | The Android app captures the student's mic as **linear16 PCM** and streams it over a Deepgram WebSocket for STT (`docs/mobile/03-VOICE-PIPELINE.md §1`). Audio leaves the device → **collected**. | No (core to voice mode; user may type instead, so feature is optional but when used, capture is required) | App functionality (voice answers) |
| **Personal info → Email address** | **Yes** | **Yes** (to Supabase auth, a processor) | Email-OTP / OAuth signup (`CLAUDE.md` Auth Flow; Supabase auth). | No | Account management, auth |
| **Personal info → Name** | Yes (optional) | Yes (processor) | Display name + avatar editable in Settings (`docs/mobile/screens/06-settings.md`). | **Yes** (user can leave blank) | App functionality, personalization |
| **App activity → App interactions** | **Yes** | **Conditional** | PostHog product analytics (`src/components/PostHogProvider.tsx`, `src/lib/posthog-server.ts`). 11-event funnel (`CLAUDE.md`). | **Yes** (consent-gated; see note) | Analytics |
| **App info and performance → Crash logs / Diagnostics** | **Yes** | Conditional | PostHog `$exception`/diagnostic + Expo/EAS crash reporting. | Yes | Analytics, app stability |
| **Device or other IDs → Device or other IDs** | **Build-time gate (declare iff yes)** | **Build-time gate** | **GATE:** before submission, inspect whether the PostHog mobile SDK (`posthog-react-native`) or any bundled SDK reads `Settings.Secure.ANDROID_ID` — by SDK-config/source review **and** an `aapt2`/decompiled-manifest + a runtime network/log inspection on a physical device. **If any SDK reads `ANDROID_ID` (or any persistent device ID), declare "Device or other IDs" = Yes** (Google's **2025-04-10** clarification: `ANDROID_ID` is a device identifier that **must** be declared if any SDK reads it). PostHog RN typically uses a generated/anonymous distinct-id; confirm whether it falls back to `ANDROID_ID`. This is a **pass/fail build-time gate**, not an open question. | declare iff yes | Analytics |
| **Financial info → Purchase history** | Yes (Play/RevenueCat) | Yes (Google Play, RevenueCat — processors) | Subscription state via Play Billing + RevenueCat (`docs/mobile/screens/07-paywall.md`). | No | Account management, payments |
| **Exam content (conversation text)** | Yes | Yes (Anthropic — processor) | Transcripts → Claude for examiner + assessment (`src/lib/exam-engine.ts`; privacy policy §4). Stored in `session_transcripts`. | No | App functionality |

**Security practices to declare:**
- [x] **Data is encrypted in transit** — TLS/HTTPS everywhere (privacy policy `src/app/privacy/page.tsx:397`; STT over `wss://`, API over `https://`).
- [x] **Users can request data deletion** — in-app + web URL (§3).
- [x] **Data is encrypted at rest** — Supabase infra (privacy policy `:398`); declare if the form offers it as a sub-question.
- [ ] Independent security review — declare honestly (likely "no" for v1).

> **Collection vs Sharing — the Deepgram/Anthropic/RevenueCat/Play/PostHog judgment call (rests on signed DPAs).** Whether **Deepgram** (STT/TTS), **Anthropic** (LLM), **RevenueCat** + **Google Play** (billing), and **PostHog** (analytics) count as **"Sharing"** turns on whether each qualifies as a **service provider / processor** under Google's definition: they process the data on HeyDPE's behalf and do not use it for their own purposes → processors → these transfers are **excluded from "Sharing"** and declared only as **Collection**. **This exclusion is only valid with a signed DPA on file for each of the five vendors. The owner must either (a) file/confirm a signed DPA for Deepgram, Anthropic, RevenueCat, Google Play, and PostHog before submission, or (b) declare the corresponding transfer as "Sharing" in the Data Safety form.** Do not claim Sharing-excluded without the DPA artifact. **PostHog specifically:** the exclusion *also* requires analytics not be sent without consent — HeyDPE's web client is **consent-gated, opt-out-default** (`PostHogProvider.tsx:53-60`); **the mobile app MUST replicate the same consent gate (opt-out by default, fires only after the in-app consent kind is granted)** or declare analytics collection as non-optional/Shared. This is part of the M2 telemetry exit criteria (SHARED #7).

> **🚫 BLOCKING — CRITICAL ACCURACY GAP: the live public privacy policy is stale vs. the real voice stack (SHARED #8).** `src/app/privacy/page.tsx:261-293` still describes voice as the **browser Web Speech API** sending audio to **Google**, lists **OpenAI TTS** as the TTS provider (`:224`), and claims **client-side processing** — all false for the shipping product. The real stack is **Deepgram Nova-3 STT + Deepgram Aura-2 TTS** with **raw-PCM audio transmitted off-device** (`CLAUDE.md` Tech Stack; OpenAI is a runtime *fallback* only). The Data Safety form **must match the privacy policy**, so the policy must be corrected to name **Deepgram Nova-3 STT + Aura-2 TTS** and describe **raw-PCM off-device transmission** **before ANY store submission** (iOS or Android) — an internally inconsistent listing is a documented rejection/enforcement risk. **This is an OWNER prerequisite; `src/app/privacy/page.tsx` is NOT edited in this doc pass. This row blocks submission until the live policy is fixed.**

### Qualitative "done"
Every data type the Android build actually transmits is declared; categories match the (corrected) privacy policy and the App Store privacy nutrition labels; no data type is over- or under-declared; the deletion answers point at the §3 mechanisms.

### Measurable success criteria
- [ ] Data Safety form saved with **exactly** these categories: Audio/Voice recordings; Personal info (Email + optional Name); App activity (App interactions); App info & performance (Crash/Diagnostics); Financial info (Purchase history); plus Device IDs **iff** the §1 ANDROID_ID build-time gate says yes — pass/fail line-by-line against this table.
- [ ] **ANDROID_ID build-time gate run:** source/config review of `posthog-react-native` (and every bundled SDK) **plus** a physical-device network/log inspection determines whether any SDK reads `Settings.Secure.ANDROID_ID`; the result (`reads ANDROID_ID = yes/no`) is recorded as an artifact and the **Device IDs** category is declared **iff** yes — pass/fail.
- [ ] **Encryption-in-transit = Yes** and **Deletion-available = Yes** toggles set — screenshot artifact in the submission folder.
- [ ] Privacy-policy URL field = the corrected privacy page; a reviewer can open it and find Deepgram named and the deletion path described — manual check, pass/fail.
- [ ] A 3-row diff table (Data Safety vs privacy policy vs App Store labels) shows **0** contradictions — artifact attached to the release ticket.
- [ ] **DPA-on-file check:** a signed DPA exists for **each** of Deepgram, Anthropic, RevenueCat, Google Play, PostHog — links/artifacts in the release ticket; **any vendor without a DPA is declared as "Sharing"** in the form instead of Collection-only — pass/fail.
- [ ] **PostHog mobile consent gate:** on a fresh install with consent **not** granted, a network capture shows **0** PostHog events leave the device (opt-out-default, mirrors web `PostHogProvider.tsx:53-60`); after the in-app consent kind is granted, events fire — pass/fail.
- [ ] **VERIFY-AT-SUBMISSION:** run a network capture of one full exam on a physical Android device; confirm the only off-device data egress endpoints are Deepgram (STT/TTS), Anthropic (via our API), Supabase, RevenueCat/Google Play, PostHog, Vercel — **0** undeclared endpoints. Capture saved as an artifact.

---

## 2. Play Billing vs 2026 US Alternative Billing / External Content Links

### Rule
Two distinct **US-only** opt-in programs stem from the *Epic v. Google* injunction, both with a developer **enrollment deadline referenced around 2026-01-28** for developers already running such flows:

- **(A) Alternative Billing System (US)** — offer your own billing alongside/instead of Google Play Billing. Reserved future commission: **10% for auto-renewing subscriptions** (HeyDPE's case), 25% for other digital purchases; first **$1M USD** of annual earnings at **10%**. Requires integrating alternative-billing APIs, parental controls, your own support + payment processing, PCI-DSS compliance.
- **(B) External Content Links (US)** — link users out to external purchase/content. Reserved future structure: **10% subscriptions / 20% other** (first $1M at 10%), **plus a per-install "app download event" fee** (~$2.85 apps / $3.65 games) within 24 h of the click.
- **Standard Google Play Billing** remains available at the normal service fee (15% / 30% tiering) with no enrollment.

**CURRENT FEE POSTURE (critical):** For **both** US programs, Google's help docs state it **"is not assessing these fees… and is not requiring developers in this program to report these transactions/downloads."** So the **effective alternative-billing commission today is $0** — but the rate cards above are what Google has reserved the right to charge. *(as of 2026-06-15)*

### How HeyDPE satisfies it
**Decision for v1: keep standard Google Play Billing, transacted through RevenueCat** (`react-native-purchases`, `store: PLAY_STORE`; RevenueCat research §8). Rationale:
- The iOS-first foundation already wires RevenueCat with one `pro` entitlement; the Android phase reuses the **same SDK + Offerings/Entitlements model + single webhook endpoint** (branch on `store`), only adding the Google API key and Play Console service-account grants.
- Standard Play Billing means **no** alternative-billing API integration, **no** own-payment-processing/PCI burden, and **no** per-install download fee — the simplest compliant path.
- The 15%/30% Play fee is the v1 planning number. **Plan the 10%-subscription alternative rate as the *future* number** to switch to if/when Google flips fees on for the US Alternative Billing program (currently $0) — re-evaluate per release.
- **Web subscribers are never routed through Play.** An existing Stripe web subscriber who signs in on Android is recognized by RevenueCat via the shared App User ID (= Supabase user id) and granted `dpe_live` with **0** IAP buy buttons shown (mirrors the iOS F3 path, `docs/mobile/screens/07-paywall.md:167-171`). This is *not* an external-link sale inside the app — it is entitlement recognition of a pre-existing web purchase.

**No external-link CTA to Stripe checkout ships inside the Android app in v1.** (If the owner later wants an in-app "subscribe cheaper on the web" link, that triggers the External Content Links program in §2(B) and its per-install fee — a separate decision.)

### Play Console service-account grants for RevenueCat (Android phase)
Grant RevenueCat's service account: **View app information**, **View financial data**, **Manage orders and subscriptions** (RevenueCat research §8). `AndroidManifest` main Activity `launchMode` = `standard` or `singleTop` (other modes can cancel a purchase when the app backgrounds during checkout). **Pin `react-native-purchases` to a build whose bundled Google Play Billing Library is ≥ Google's current enforced minimum** (Purchases SDK v9.0.0 added Billing Library 8 support; Google retires older Billing Library versions on a rolling schedule and rejects/at-risk uploads below the floor). The pin is a committed build-time gate: record the `react-native-purchases` version + its Billing Library version in the release ticket and re-confirm the floor against Google's current Play Billing Library deprecation page at submission. Bump the pin if Google has raised the minimum.

### Qualitative "done"
The billing path is a single, documented decision (Play Billing via RevenueCat); no in-app flow can produce a stacked Play+Stripe charge on one account; web subscribers are never asked to pay twice; the fee-posture risk (future 10%) is written down with a re-evaluation trigger.

### Measurable success criteria
- [ ] A signed test purchase on a **License-tester** Google account completes via Play Billing and RevenueCat reports `store: PLAY_STORE`, `entitlement: pro` active — pass/fail.
- [ ] **0** scenarios in a sandbox matrix (new Android buyer; existing Stripe web buyer signs in on Android; IAP buyer also has Stripe) produce a double charge — server entitlement-merge audit, pass/fail.
- [ ] RevenueCat service account has **exactly** the three Play Console permissions above, no more — screenshot artifact.
- [ ] **Play Billing Library pin:** the pinned `react-native-purchases` version + its bundled Google Play Billing Library version are recorded, and the Billing Library is **≥ Google's current enforced minimum** at submission — version artifact, pass/fail.
- [ ] Billing-decision memo committed to the release ticket stating: "v1 = standard Play Billing via RevenueCat; alternative-billing 10% sub rate is the planning number if Google begins assessing US fees" — artifact exists.
- [ ] **VERIFY-AT-SUBMISSION:** confirm against a fresh load of the Google Play alternative-billing/external-offers help pages whether (a) Google has begun **assessing/reporting** fees, (b) the rate card changed, (c) any **enrollment is required** for our chosen Play-Billing path, (d) program geography (US-only). Record the as-of-date and a screenshot.

---

## 3. In-app account deletion + public web deletion URL

### Rule
Because HeyDPE allows account creation, Google Play requires **BOTH**: (1) an **in-app path** to delete the account and associated data; and (2) a **publicly accessible web URL** where a user can request account + data deletion **without reinstalling the app**. The web URL must load without errors, clearly connect to the app/developer name on the listing, make the deletion path prominent/discoverable, accept requests (link/email/form), and explain prerequisites (e.g., cancel subscription first); if some data is retained for security/fraud/legal reasons, that retention must be disclosed. The URL is entered in the **Data Safety** form's data-deletion section. This is a standing requirement (original deadline 2023-12-07, extension to 2024-05-31); non-compliance risks removal. *(as of 2026-06-15)*

### How HeyDPE satisfies it

**(1) In-app deletion — built and verified.** Settings → *Your data* → *Delete account* (reachable in **≤ 2 taps** from the Settings root, `docs/mobile/screens/06-settings.md:42`). A type-to-confirm sheet (must type `DELETE`, case-sensitive) calls `POST /api/user/delete` with body exactly `{"confirm":"DELETE"}`. The server order is verified (`src/app/api/user/delete/route.ts`):
1. Auth check (401 if unauthenticated) — `:25-26`.
2. Type-to-confirm guard (400 `confirmation_required` if body ≠ `{"confirm":"DELETE"}`) — `:29-31`.
3. **Cancel any active Stripe subscription immediately**; abort with **502 `stripe_cancel_failed`** if the cancel fails so a paying sub is never stranded — `:43-57`.
4. Explicit deletes of non-FK-cascaded PII: `subscription_events` by `customer_id`, then `ticket_replies` + `support_tickets` — `:60-68`.
5. `auth.admin.deleteUser(user.id)` → FK cascades wipe **all user-keyed rows across the 34-table map** (migration `20260611000001`) — `:71-75`.
6. Confirmation email + anonymized telemetry (`account_deleted`, **sha256 of the user id**, never raw PII) — `:77-86`.
7. Returns `200 {deleted:true}` — `:88`. On success the app clears local secure storage, **signs out of RevenueCat (`logOut()`)**, and hard-navigates to Login (`docs/mobile/screens/06-settings.md:158`). **The server also detaches/deletes the RevenueCat subscriber** (SHARED #3) so a later store restore cannot re-grant entitlement to the deleted account — this is the Android analog of the Apple-doc deletion behavior, branching on `store`.

**Subscription-prerequisite handling on Android (RESOLVED — SHARED #3):** deletion is **allowed** even when a live Play (IAP) subscription exists — it is **never blocked**. Two things happen on delete:
- **Server-side, the RevenueCat subscriber is detached/deleted** as part of the deletion flow (the same `logOut()` + a server-side RevenueCat subscriber-delete call) so that a later store **restore cannot falsely re-grant entitlement** to a deleted account. Stripe-billed subs **are** auto-canceled server-side by step 3 above.
- **A Play (Google Play Billing) subscription cannot be canceled by our backend** — it lives in Google Play and keeps billing until the user cancels it in Google Play. So the in-app delete sheet and the web deletion URL show **prominent copy**: "Deleting your HeyDPE account does **not** cancel a Google Play subscription. To stop billing, cancel it in **Google Play → Payments & subscriptions → Subscriptions**." with a **deep link** to `https://play.google.com/store/account/subscriptions` (and the exact steps). The same warning names Apple Settings for any cross-platform store sub, mirroring the Apple doc.

**OWNER DECISION D-GP-2 — RESOLVED:** allow deletion with the prominent Google-Play-subscription warning + deep link above; delete the RevenueCat subscriber server-side so a later restore can't re-grant access; never block deletion on a live store sub.

**(2) Public web deletion URL — OWNER DECISION D-GP-1 (must exist before submission).** Today the privacy policy points data-subject requests to `mailto:pd@imagineflying.com` (`src/app/privacy/page.tsx:366,381`). Google strongly prefers a **dedicated, prominent, self-serve page**, not only an email buried in a policy. **Recommended:** publish a public page at **`https://aviation-oral-exam-companion.vercel.app/delete-account`** (and/or `https://heydpe.com/delete-account`) that:
- States the HeyDPE / Imagine Flying LLC name (matches the listing).
- Explains: signed-in users can delete in-app (Settings → Delete account) in ≤ 2 taps; or request deletion here.
- Provides a form **or** a clearly labeled `mailto:` to a deletion inbox, AND states that deletion does **not** cancel a store subscription — with a **deep link to `https://play.google.com/store/account/subscriptions`** (and the Apple Settings path for cross-platform store subs) and exact steps to "cancel your Google Play / Stripe subscription to stop billing."
- Lists **what is deleted** (profile, exam sessions, transcripts, element scores, progress, instructor connections, support tickets) and **what is retained and why** — per the privacy policy, **account data is kept 30 days post-deletion for recovery** (`src/app/privacy/page.tsx:304-305`) and **analytics is retained 26 months** (`:312`). This retention **must be disclosed** on the deletion page to satisfy Google's "disclose retention" clause.

### Qualitative "done"
A signed-out person can find and use the web deletion URL; a signed-in user deletes in-app in ≤ 2 taps; both clearly connect to HeyDPE; retention is disclosed; the Data Safety form's deletion section points at both.

### Measurable success criteria
- [ ] In-app: from a fresh launch, **count taps** to reach the Delete-account confirmation = **≤ 2** (Settings tab is already counted as arrival) — UI test, pass/fail.
- [ ] In-app: confirm button is **provably disabled** until the field is exactly `DELETE` (asserts disabled for `delete`, `DELETE ` with trailing space, empty) — automated UI test (`06-settings.md:163`).
- [ ] In-app: cancelling the sheet issues **0** requests to `/api/user/delete` (network assertion, `06-settings.md:209`).
- [ ] In-app: a successful delete returns `200 {deleted:true}`, signs out RevenueCat, **and server-side detaches/deletes the RevenueCat subscriber** (a later `getCustomerInfo`/restore on the same App User ID returns **no active entitlement**), and lands on Login; the deleted user's JWT is invalid on next call (401) — end-to-end test on a throwaway account.
- [ ] In-app + web: when a **live Play subscription** exists, the delete flow shows the prominent "Google Play keeps billing until you cancel" warning with a working **`play.google.com/store/account/subscriptions`** deep link, and deletion still **succeeds (is not blocked)** — UI test, pass/fail.
- [ ] Web URL: loads with HTTP **200**, no console errors, contains the strings "HeyDPE"/"Imagine Flying", a deletion request mechanism, the **Google Play subscriptions deep link** + cancel steps, and the 30-day + 26-month retention disclosure — automated content check, pass/fail.
- [ ] Web URL is entered in the Data Safety data-deletion section — screenshot artifact.
- [ ] **VERIFY-AT-SUBMISSION:** open the web deletion URL in an **incognito/logged-out** browser on mobile and desktop; confirm it is reachable without an app install and the path is "prominent and easily discoverable" — manual check.

---

## 4. Target API level

### Rule
For **new apps and updates** submitted to Google Play: **target Android 16 (API level 36) or higher, effective 2026-08-31** (Wear OS / Android TV: at least Android 15 / API 35). Existing apps must target at least **Android 14 (API 34)** to remain available to new users on newer-OS devices; below that they are hidden from new users. *(as of 2026-06-15)*

> **NOTE / VERIFY-AT-SUBMISSION:** At research time, Google's own `developer.android.com/google/play/requirements/target-sdk` and Play Console help answer `11926878` were serving a **cached API-35 / 2025-08-31** version, while the live Play Console help index and multiple 2026 sources state **API 36 / 2026-08-31**. **Confirm the exact required level against a cache-busted load right before submission.**

### How HeyDPE satisfies it
HeyDPE Android is a **new** app submitted in 2026 → **target API 36 (Android 16)** to be safe regardless of which date is live. Set in `app.json` / EAS config:
- `android.compileSdkVersion` and `android.targetSdkVersion` = **36** (or the Expo SDK's highest supported — pin to the Expo SDK that supports API 36; **VERIFY** the Expo SDK ↔ API-36 support matrix at build time, since this drives the EAS image).
- `android.minSdkVersion` = **26 (Android 8.0)** recommended (covers the runtime-permission model the mic flow assumes and the foreground-service-type rules; lower min only if analytics shows a real device tail — **OWNER DECISION D-GP-3**).

### Qualitative "done"
The shipped AAB targets the API level Google requires for a *new* 2026 app, builds clean on the matching EAS image, and runs on the min-SDK floor without crashing.

### Measurable success criteria
- [ ] `aapt2 dump badging app-release.aab` (or `bundletool`) reports `targetSdkVersion='36'` — exact-match assertion, artifact attached.
- [ ] `minSdkVersion` ≥ 26 (or the documented D-GP-3 floor) — exact-match.
- [ ] The app **launches and completes one full exam** on (a) a min-SDK emulator and (b) an API-36 physical/emulator device — pass/fail on both.
- [ ] **VERIFY-AT-SUBMISSION:** cache-busted load of the official target-SDK requirements page confirms the required API level + effective date; record as-of-date + screenshot. If Google still requires only API 34 at submission, API 36 still satisfies it (forward-compatible).

---

## 5. Foreground service — background examiner TTS (mediaPlayback)

### Rule
Apps targeting **Android 14+** that run a foreground service must (a) declare the **FGS type** in the manifest and (b) **declare it in Play Console** (App content → Foreground service permissions). Background audio/TTS requires permission **`FOREGROUND_SERVICE_MEDIA_PLAYBACK`** + manifest `foregroundServiceType="mediaPlayback"` + base **`FOREGROUND_SERVICE`**. Calling `startForeground` with an undeclared/wrong type throws `SecurityException`. A foreground service that captures the **mic** is the separate **`microphone`** type (`FOREGROUND_SERVICE_MICROPHONE`). The Play Console FGS declaration requires, **per type**: a description of the functionality, the user impact if deferred/interrupted, and a **link to a demo video** of the user-initiated, perceptible action that triggers it. Skipping it gets the release rejected. *(as of 2026-06-15)*

### How HeyDPE satisfies it (matches voice pipeline §5)
The product's background policy is decided and matches `docs/mobile/03-VOICE-PIPELINE.md §5`:
- **Background PLAYBACK = yes.** When the phone is locked/backgrounded mid-examiner-turn, **the examiner's current sentence/turn finishes playing** (`03-VOICE-PIPELINE.md:249`). On Android this requires `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + `foregroundServiceType="mediaPlayback"`, plus **lock-screen media controls** (`player.setActiveForLockScreen(true,{title,artist})`) — without the media-session, Android **stops background audio after ~3 minutes** (`03-VOICE-PIPELINE.md:259`). The audio played is **genuinely audible TTS**, never a silent keep-alive (the abuse Google/Apple reject).
- **Background MIC = no.** Mic capture is **foreground-only by product policy**; the OS also blocks starting a recording session from the background (`03-VOICE-PIPELINE.md:254,260`). Therefore HeyDPE ships **no** `FOREGROUND_SERVICE_MICROPHONE` and **no** background `RECORD_AUDIO` in v1. Capture starts only in the foreground (`03-VOICE-PIPELINE.md:74`).

**Manifest (via Expo config plugin):** the `expo-audio` plugin with `enableBackgroundPlayback: true` yields `UIBackgroundModes:[audio]` on iOS (`03-VOICE-PIPELINE.md:253`); on Android the build must additionally declare the FGS. Required `AndroidManifest` entries:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
<service android:name="...MediaPlaybackService"
         android:foregroundServiceType="mediaPlayback"
         android:exported="false"/>
```
**COMMITTED POSTURE (fix 7):** v1 background examiner TTS **uses a foreground service**, so HeyDPE **will declare `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + `foregroundServiceType="mediaPlayback"` (+ base `FOREGROUND_SERVICE`) in the manifest AND the matching Play Console FGS declaration with a demo video** — this is not conditional. The only open mechanical question (D-GP-4) is *how* the type is emitted: confirm whether the pinned `expo-audio` background-playback path auto-emits the `mediaPlayback` FGS + permissions, or whether a small **Expo config-plugin / `expo-build-properties`-style manifest injection** is needed. The M3 spike (`docs/mobile/08-VOICE-SPIKE-M3.md`) must **prove with `bundletool` that the AAB declares the `mediaPlayback` FGS** and that background audio survives > 3 min on a physical Android device with lock-screen controls — that bundletool proof is the gate, not a "maybe we drop it" branch.

**Play Console FGS declaration (mediaPlayback) — the three required answers:**
1. **Functionality:** "Plays the AI examiner's spoken response (text-to-speech audio) so the student can keep listening to an answer/explanation while the screen is locked or the app is backgrounded during a practice oral exam."
2. **User impact if deferred:** "The examiner's spoken answer would cut off the moment the screen locks, interrupting a continuous spoken Q&A — the core experience of an oral-exam simulator — and forcing the student to keep the screen on."
3. **Demo video link (COMMITTED):** a short screen recording showing the user starting an exam, the examiner speaking, the user locking the phone, and the audio continuing with lock-screen controls. This video **is required** for the mediaPlayback FGS declaration — record and host it, link it in the declaration (not optional in v1).

### Qualitative "done"
Background examiner audio survives a locked screen with lock-screen controls; the app never records in the background; the manifest declares exactly `mediaPlayback` (and base FGS) and **no** `microphone` FGS; the Play Console declaration is complete with a real demo video.

### Measurable success criteria
- [ ] `bundletool`/`aapt2` shows the AAB declares `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and a service with `foregroundServiceType="mediaPlayback"`, and declares **no** `FOREGROUND_SERVICE_MICROPHONE` — exact-match, artifact.
- [ ] On a physical Android device, a long synthetic examiner turn **keeps playing past 3:30** with the screen locked and lock-screen controls visible (`03-VOICE-PIPELINE.md:267`) — pass/fail.
- [ ] While backgrounded, **no transcript text is produced** and the OS mic indicator does not appear (`03-VOICE-PIPELINE.md:266`) — pass/fail (proves no background capture).
- [ ] `startForeground` with the declared type **never throws `SecurityException`** across 20 lock/unlock cycles — logcat assertion, 0 exceptions.
- [ ] Play Console FGS declaration saved with the three answers + a working demo-video URL — screenshot artifact.
- [ ] **`bundletool` FGS proof (M3 gate):** `bundletool dump manifest` on the M3 spike AAB shows `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + a `mediaPlayback` service — committed for v1, not optional — artifact attached.

---

## 6. `RECORD_AUDIO` + prominent disclosure + Permissions Declaration

### Rule
`RECORD_AUDIO` is a **dangerous/runtime** permission: request it only when needed, only after a runtime prompt, and only tied to **core functionality** described in the store listing. Separate from the OS prompt, the app must provide **prominent disclosure & consent** before it collects/transmits mic data. Google surfaces a **Permissions Declaration Form** during release for high-risk/sensitive permissions that need justification (historically SMS/Call Log-class); `RECORD_AUDIO` is governed primarily by the runtime-permission + prominent-disclosure + core-functionality rules rather than a dedicated SMS-style form, but complete whatever the Console prompts for at upload. Do not request unused/broad permissions. *(as of 2026-06-15)* (Policy context: an 2026-04-15 announcement tightens Contacts + precise-location scoping effective 2026-10-28 — not the mic, but evidence of tightening; review before submission.)

### How HeyDPE satisfies it
- **Core-functionality fit is clean:** the mic is used to capture the student's **spoken answers to the AI examiner** — exactly the listed core feature. No mic use is hidden or off-label.
- **Runtime prompt:** `RECORD_AUDIO` is requested only when the user first taps the mic to answer, via the native runtime prompt — never at install, never preemptively. Capture starts only in the foreground (`03-VOICE-PIPELINE.md:74`).
- **Prominent disclosure sheet BEFORE the OS prompt:** a HeyDPE-owned sheet shown before the first capture, in plain language: "HeyDPE uses your microphone so you can speak your answers to the examiner. Your speech is sent to our speech-to-text provider to transcribe it; we don't store raw audio. You can type instead." This sheet inherits the FLIGHT DECK rule — sentence-case IBM Plex body, a `//` micro-label header (caps-mono) like `// MICROPHONE ACCESS`, and a primary button ≥ 48 dp. It offers a **type-instead** path so consent is genuine (voice is optional).
- **No unused sensitive permissions:** the manifest declares **only** `RECORD_AUDIO`, `INTERNET`, `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, plus benign defaults (e.g. `ACCESS_NETWORK_STATE`, `com.android.vending.BILLING` via Play Billing). **No** camera, location, contacts, SMS, call-log, body-sensors, or background-location.
- **No push notifications in v1 (RESOLVED — fix 4):** v1 ships **no** push, so the manifest carries **no `POST_NOTIFICATIONS`** and **no FCM/`firebase-messaging`** SDK. This also drops the "Manage subscription" push deep-link dependency in `docs/mobile/screens/06-settings.md:59` (`heydpe://settings/subscription`) — that row is **v1.1**, reachable in-app only for v1. **If push is ever added**, it requires the **API 33+ runtime `POST_NOTIFICATIONS` request** (declare it, prompt at runtime, never at install) **and** FCM must be added to the §1 Data Safety egress **and** the **Device IDs** declaration (FCM registration tokens / Firebase IID) — none of which v1 incurs.

> **Privacy-policy alignment (ties to §1):** the prominent-disclosure copy must match the (corrected) privacy policy. Today the policy says audio goes to **Google via Web Speech** and is "transient … processed entirely client-side" (`src/app/privacy/page.tsx:280-282`) — **false for the native app**, which streams raw PCM to **Deepgram**. Fix the policy and the disclosure copy together (OWNER action item).

### Qualitative "done"
The mic is requested only in-context, justified by the listed core feature; a clear prominent-disclosure sheet precedes the OS prompt and offers a no-mic alternative; the manifest is minimal; any Console permission declaration is completed truthfully.

### Measurable success criteria
- [ ] `aapt2 dump permissions app-release.aab` lists **exactly** the allow-list above and **0** of {CAMERA, ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION, READ_CONTACTS, READ_SMS, READ_CALL_LOG, BODY_SENSORS, **POST_NOTIFICATIONS**} — exact-match, artifact. (v1 has **no push**, so `POST_NOTIFICATIONS` must be absent; if a future release adds push, this list and the §1 Data Safety/Device-IDs declarations change.)
- [ ] `grep` of the dependency tree shows **0** FCM / `firebase-messaging` SDKs (no push in v1) — artifact.
- [ ] On first mic tap, the **prominent-disclosure sheet appears before** the OS `RECORD_AUDIO` dialog, every time, on a fresh install — UI test across 5 fresh installs, pass/fail.
- [ ] Denying the OS prompt does **not** crash and routes the user to text input with a clear message — pass/fail (`03-VOICE-PIPELINE.md:74`).
- [ ] Disclosure-sheet copy and privacy-policy voice section name the **same** STT provider (Deepgram) — string-diff, 0 mismatches (gated on the policy correction).
- [ ] **VERIFY-AT-SUBMISSION:** upload the AAB to a Closed track and record whether the Console presents any Permissions Declaration Form for this manifest; complete it if shown; screenshot the result (or "none presented").

---

## 7. IARC content rating

### Rule
Google Play does not allow apps without a content rating. Complete the **IARC rating questionnaire** in Play Console (App content). Redo it for new apps and for any update changing content/features that affect the answers. *(as of 2026-06-15)*

### How HeyDPE satisfies it
HeyDPE is an **education / reference** app (FAA checkride oral-exam practice): no violence, no sexual/suggestive content, no profanity, no gambling, no drugs/alcohol promotion, **no ads**, no user-generated public content (the exam is a private 1:1 AI conversation — declare whether free-text the user types is "user interaction/shared content"; it is **not shared publicly**), and no in-app purchases of physical goods (only a digital subscription). Expected outcome: the broadest age category (Everyone / PEGI 3 / ESRB Everyone equivalent across IARC boards). Answer the **ads = No** and **shares user location = No** questions accordingly; the digital-subscription purchase is declared honestly.

### Qualitative "done"
The questionnaire is completed truthfully, yields a rating consistent with an education app, and matches the **13+** posture used everywhere else (Terms + Apple age rating, SHARED #5) — IARC may return a lower board minimum (e.g. Everyone/PEGI 3) from the content answers, but the **target-audience age band is set to 13+** so the two are consistent.

### Measurable success criteria
- [ ] IARC questionnaire completed and a rating certificate issued for **all** boards before publishing — screenshot artifact.
- [ ] "Contains ads" answered **No**; verified by `grep` showing **0** ad SDKs in the dependency tree (no AdMob/`play-services-ads`) — artifact.
- [ ] Rating is **Everyone / 3+ equivalent** (no Teen/Mature) — pass/fail; if any board returns higher, investigate which answer drove it.
- [ ] **VERIFY-AT-SUBMISSION:** re-run the questionnaire if any content/feature changed since the last submission (e.g., added social/UGC sharing).

---

## 8. Play App Signing + Android App Bundle (AAB)

### Rule
New apps must publish as an **Android App Bundle (.aab)** and **enroll in Play App Signing** (mandatory). The developer generates and safeguards the **upload key** and signs the AAB with it; Google holds/manages the **app signing key** that signs the APKs delivered to users. The upload key must be kept secure and registered for reset/upgrade. *(as of 2026-06-15)*

### How HeyDPE satisfies it
- Build with **EAS Build** producing an **`.aab`** (`eas build --platform android --profile production`). Let **EAS manage the Android keystore** (the upload key), or supply our own — either way the keystore is the **upload key**, and **Google holds the app signing key** via Play App Signing.
- **Back up the upload keystore** (and its passwords) in the team password manager + an offline copy; losing it requires a Google upload-key reset.
- Enroll in Play App Signing on first upload (default for new apps).

### Qualitative "done"
The artifact is an AAB, Play App Signing is enrolled, the upload key is backed up in ≥ 2 secure locations, and a documented key-reset path exists.

### Measurable success criteria
- [ ] Uploaded artifact is **`.aab`** (not `.apk`) and the Console confirms **Play App Signing: enrolled** — screenshot artifact.
- [ ] Upload keystore + credentials stored in **≥ 2** secure locations (password manager + offline) — checklist signed off.
- [ ] `eas credentials` (Android) shows a stable upload key fingerprint matching the Console's registered upload certificate — fingerprint match, artifact.
- [ ] **VERIFY-AT-SUBMISSION:** confirm the EAS-managed vs self-managed keystore decision and that the backup is recoverable (test-restore the keystore into a scratch EAS profile).

---

## 9. Additional store policies that apply to HeyDPE

These are not separate Play Console forms but are policy areas a reviewer checks; declare/comply now.

- **Subscriptions & cancellation transparency (Play policy):** the paywall must clearly state price, billing period, auto-renewal, and how to cancel; an IAP-billed user is sent to **Google Play Subscriptions** to manage/cancel (the Android analog of the iOS "Apple Subscriptions" deep link, `docs/mobile/screens/07-paywall.md:175`). **Measurable:** the paywall shows price + period + "auto-renews, cancel anytime in Google Play" before purchase — pass/fail.
- **No deceptive behavior / functional app:** the app must be fully functional for a reviewer. **Provide a working test account** (and a note that voice requires a physical device with a mic; emulator falls back to text) in the Play Console "App access" / review-notes field. **Measurable:** reviewer can sign in with the supplied credentials and complete one exam — pass/fail.
- **Health/medical & "sensitive" content:** HeyDPE is aviation *education*, not medical/financial advice; no special declaration, but the listing must not imply FAA endorsement. **Measurable:** listing copy contains no "FAA-approved/endorsed" claim — string check, 0 hits.
- **Families policy:** the app is **not** directed at children; do not opt into the Designed-for-Families program. **Measurable:** target-audience age set to **13+** (matching the Terms + the Apple 13+ age rating, SHARED #5), **not** a child band — consistent with the COPPA / under-13 stance in the privacy policy (`src/app/privacy/page.tsx:380-384`) — pass/fail. No child-directed bands, no child-data handling.
- **Account-required disclosure:** because login is required, App access notes must explain it and supply credentials (above).

---

## 10. Play Console store listing assets

### Rule
A complete Store listing is required to publish: app name, short + full description, app icon, feature graphic, screenshots (phone required; tablet recommended for tablet support), category, contact email, and a **privacy-policy URL**. Assets must meet Google's pixel/format specs. *(as of 2026-06-15)*

### How HeyDPE satisfies it — asset spec table

| Asset | Spec (VERIFY exact current spec at submission) | HeyDPE content | Done bar |
|---|---|---|---|
| **App name** | ≤ 30 chars | "HeyDPE — Checkride Oral Prep" (≤ 30; trim if needed) | Brand spelled "HeyDPE" exactly |
| **Short description** | ≤ 80 chars | "Practice your FAA checkride oral exam with a voice AI examiner." | ≤ 80 chars, no FAA-endorsement claim |
| **Full description** | ≤ 4000 chars | Value prop, 3 ratings (PA/CA/IR), voice mode, subscription terms, support email | ≤ 4000; mentions subscription + cancel path |
| **App icon** | 512×512 PNG, 32-bit | FLIGHT DECK attitude-indicator brand mark on dark instrument ground | Matches iOS icon; no transparency issues |
| **Feature graphic** | 1024×500 PNG/JPG | Brand mark + "Your AI checkride examiner" — caps-mono brand moment OK on the graphic, body sentence-case | Required to publish; legible at small size |
| **Phone screenshots** | 2–8, 16:9 or 9:16, min 320 px side (VERIFY) | Practice (voice), Home, Progress (ACS coverage), Paywall, Settings — captured on a real device | ≥ 4 screenshots; real UI, no 10px text |
| **7" + 10" tablet screenshots** | Recommended if tablet-supported | Same 5 screens on tablet layout | Only if we claim tablet support |
| **Category** | Single | **Education** | Consistent with IARC §7 |
| **Tags** | Google-curated | Education, Test prep | n/a |
| **Contact email** | Required | `pd@imagineflying.com` (matches privacy policy `:366`) | Monitored inbox |
| **Privacy policy URL** | Required | Corrected privacy page (see §1 gap) | Loads 200; names Deepgram |
| **Website** | Optional | `https://aviation-oral-exam-companion.vercel.app` (or `https://heydpe.com`) | Loads 200 |

> **FLIGHT DECK note for assets:** screenshots are real product UI, so the typography rule already holds inside them (caps-mono only for `//` labels / annunciators / ACS codes / numeric readouts; everything else sentence-case IBM Plex; never 10px). Marketing graphic text may use the brand caps-mono treatment since the graphic *is* a brand instrument moment.

### Qualitative "done"
Every required field is filled, assets meet spec, screenshots are real (not mockups) and free of 10px text, copy makes no FAA-endorsement claim, and the privacy URL is the corrected one.

### Measurable success criteria
- [ ] All **required** listing fields filled; Console shows **0** "incomplete" warnings — screenshot artifact.
- [ ] Icon is **512×512** PNG; feature graphic **1024×500** — exact-match on export.
- [ ] **≥ 4** phone screenshots from a physical device; manual scan finds **0** instances of < 11px rendered text — pass/fail.
- [ ] App name ≤ 30, short desc ≤ 80, full desc ≤ 4000 chars — exact counts.
- [ ] Privacy URL + website both return **200** in incognito — automated check.
- [ ] **VERIFY-AT-SUBMISSION:** re-confirm Google's current asset pixel/format specs (they change); validate each asset against the live spec.

---

## 11. Submission RUNBOOK — Internal → Closed → Open/Production

### Rule
Three pre-production tracks exist: **Internal** (fast, no review, ≤ 100 testers), **Closed** (review, invited testers), **Open** (public opt-in). **New *personal* developer accounts created after 2023-11-13** must satisfy a **closed-testing gate before production access**: recruit **at least 12 testers** who opt in and stay **active for 14 consecutive days** (overlapping window; the 14-day clock starts per tester when they join). **Internal testing does NOT count** toward the 14 days — the **Closed** track is required. **Organization (company) accounts are exempt** from the 12×14d gate. Every release still passes app review. *(as of 2026-06-15)*

> **VERIFY-AT-SUBMISSION (two account facts):** (1) Is HeyDPE's developer account **personal** (subject to 12×14d) or **organization** (exempt)? (2) Google moved the tester threshold from 20 → 12 — re-confirm it is still **12** at submission.

### Runbook

**Phase 0 — Account & one-time setup (before any upload)**
1. Confirm Google Play Developer account is active (one-time $25 fee paid) and determine **personal vs organization** (drives Phase 3).
2. Create the app in Play Console; set default language, app/game = **app**, free/paid = **free** (subscription is in-app).
3. Complete **all App content** declarations: Privacy policy URL; **Data Safety** (§1); **Account deletion** URL + in-app (§3); **Ads = No** (§7); **Content rating / IARC** (§7); **Target audience** (not children, §9); **Foreground service** declaration (mediaPlayback) + demo video — committed for v1 (§5); **News/Health/COVID/Financial = No/N-A**; **Government apps = No**; **Data privacy & security** review.
4. Enroll **Play App Signing**; set up EAS keystore + back it up (§8).
5. Set up RevenueCat ↔ Play: create the subscription product in Play Console, grant the RevenueCat service account the three permissions (§2), wire it in RevenueCat, add **License testers** (Google accounts) for sandbox purchases.

**Phase 1 — Internal testing (fast smoke, no review)**
1. `eas build --platform android --profile production` → `.aab`.
2. Upload to the **Internal** track; add the dev team + a few testers (≤ 100) via email/opt-in link.
3. Smoke the **store-blocking** flows on physical devices: full voice exam (mic prompt + prominent disclosure + background-playback survival), paywall sandbox purchase + restore, **account deletion** (in-app → 200 → RevenueCat logout → Login), web deletion URL reachable.
4. **Exit criterion:** all §1–§10 measurable checklists pass on Internal. **Note: Internal time does NOT count toward the 12×14d gate.**

**Phase 2 — Closed testing (review + the 12×14d clock)**
1. Promote the build (or upload a new one) to a **Closed** track; create a tester list and opt-in URL.
2. **If personal account:** recruit **≥ 12** real testers; each must **opt in and stay active 14 consecutive days**. Track per-tester join dates (clock is per-tester, overlapping). Keep the build installed/used for the window.
3. This track **passes app review** — allow review time; fix any policy flags (Data Safety mismatch, FGS declaration, permissions) before re-submitting.
4. **Exit criterion (personal):** ≥ 12 testers active ≥ 14 days each (Console shows eligibility); review passed. **Exit criterion (organization):** review passed (gate not applicable).

**Phase 3 — Open testing (optional public beta) and/or Production**
1. Optionally run an **Open** track for a wider public beta (public opt-in) to gather pre-launch feedback.
2. Request **Production access** (the Console unlocks it once the 12×14d gate is satisfied for personal accounts).
3. Submit to **Production**; choose **staged rollout** (e.g., 10% → 50% → 100%) to catch crashes early.
4. **Exit criterion:** Production review passed; crash-free sessions ≥ 99% on the staged cohort before advancing rollout.

### Qualitative "done"
The app moves Internal → Closed → Production with every gate satisfied, the personal-account 12×14d closed-testing requirement met (or proven exempt), and a staged rollout protecting users from a bad build.

### Measurable success criteria
- [ ] Internal track: **100%** of the §1–§10 measurable checklists pass — checklist artifact.
- [ ] Closed track: app review **passed** (no open policy violations) — Console status.
- [ ] Personal account: Console shows **≥ 12** testers with **≥ 14** consecutive active days (or organization-exempt confirmation) — screenshot artifact.
- [ ] Production staged rollout: **crash-free sessions ≥ 99%** and **0** new policy strikes at the 10% stage before advancing — Vitals + Console.
- [ ] **VERIFY-AT-SUBMISSION:** account type (personal/org) and the current tester threshold (12 vs other) re-confirmed; record as-of-date.

---

## 12. Pre-submission checklist (single source of truth)

Copy this into the release ticket; every box must be checked (or explicitly N/A with a reason) before hitting **Submit for review**.

**Policy / App content**
- [ ] **Data Safety** form saved with the §1 category table (Audio/Voice recordings; Email + optional Name; App activity; App info & performance; Financial; Device IDs iff ANDROID_ID verified); encryption-in-transit = Yes; deletion-available = Yes.
- [ ] **Privacy policy corrected** to name **Deepgram** (STT + TTS) and describe **raw-PCM mic transmission**, replacing the stale Web-Speech/Google + OpenAI-TTS text (`src/app/privacy/page.tsx:224,261-293`). **(OWNER action — blocking for accuracy.)**
- [ ] **Account deletion:** in-app path ≤ 2 taps (verified) **and** public web URL `…/delete-account` live, with 30-day + 26-month retention disclosure, entered in Data Safety. **(D-GP-1)**
- [ ] **IARC** questionnaire complete; rating = Everyone/3+; **Ads = No**.
- [ ] **Target audience** = not children; Families program not opted in.
- [ ] **Foreground service** declaration (mediaPlayback) + demo video — **committed for v1** (background examiner TTS), bundletool-proven in M3 (§5); **no** microphone FGS.
- [ ] **App access** notes: working test account + "voice needs a physical device" note.

**Build / signing**
- [ ] Artifact is **`.aab`**; **Play App Signing** enrolled; upload key backed up in ≥ 2 places.
- [ ] `targetSdkVersion = 36` (or current required level); `minSdkVersion ≥ 26`.
- [ ] Manifest declares **only** the §6 permission allow-list; **0** of {camera, location, contacts, SMS, call-log, background-location}.
- [ ] FGS permissions/type present (committed — background examiner TTS ships in v1); `startForeground` throws **0** SecurityExceptions over 20 cycles.

**Runtime / UX**
- [ ] `RECORD_AUDIO` requested only on first mic tap, **after** the prominent-disclosure sheet; deny-path falls back to text without crashing.
- [ ] Background examiner audio survives **> 3:30** locked with lock-screen controls; **no** background capture (no mic indicator, no transcript).
- [ ] Paywall states price + period + auto-renew + "cancel in Google Play"; IAP-manage routes to **Google Play Subscriptions**, never Stripe.
- [ ] Existing Stripe web subscriber signing in on Android sees **0** IAP buy buttons (entitlement merge); **0** double-charge scenarios in sandbox.

**Billing / RevenueCat**
- [ ] Decision memo: **v1 = standard Play Billing via RevenueCat**; 10% alternative-sub rate is the planning number if Google flips US fees on.
- [ ] RevenueCat service account has exactly the 3 Play permissions; License-tester sandbox purchase → `store: PLAY_STORE`, `pro` active.
- [ ] `react-native-purchases` pinned so its Google Play **Billing Library ≥ Google's current enforced minimum**; version recorded.

**Listing**
- [ ] All required listing fields + assets (icon 512×512, feature graphic 1024×500, ≥ 4 phone screenshots, descriptions within char limits); **0** Console incompleteness warnings; **0** sub-11px text in screenshots; **no** FAA-endorsement claim.

**Tracks**
- [ ] Internal smoke passed → Closed review passed → (personal) 12×14d gate met → Production staged rollout with crash-free ≥ 99%.

**VERIFY-AT-SUBMISSION rollup** (re-confirm each against a cache-busted official page on submission day; record as-of-date + screenshot):
- [ ] Target API level + effective date (API 36 / 2026-08-31 vs cached API 35).
- [ ] Alternative-billing/external-offers fee posture (still $0 assessed? rate card? enrollment required? US-only?).
- [ ] Whether the Console presents a Permissions Declaration Form for our manifest.
- [ ] Developer account type (personal vs org) + tester threshold (12).
- [ ] **Build-time gate:** whether `posthog-react-native` or any bundled SDK reads `Settings.Secure.ANDROID_ID` (source/config review + on-device capture) → declare **Device IDs** iff yes.
- [ ] Whether STT/TTS/LLM/billing/analytics vendors (Deepgram, Anthropic, RevenueCat, Google Play, PostHog) are "service providers" with a **signed DPA on file** (affects Sharing vs Collection — no DPA ⇒ declare Sharing).
- [ ] Current listing asset pixel/format specs.

---

## 13. OWNER DECISIONS (resolve before Android build/submit)

| ID | Decision needed | Recommendation |
|---|---|---|
| **D-GP-1** | Public web account-deletion URL — dedicated page vs only the existing `mailto:` in the privacy policy. | **Build `…/delete-account`** (self-serve, prominent, retention disclosed). Google prefers a page over a buried email. |
| **D-GP-2** | When a user with a **live Google Play subscription** deletes their account: block until they cancel in Play, or allow deletion with a "your Play sub keeps billing until you cancel it in Google Play" warning. | **RESOLVED (SHARED #3):** **allow** deletion (never block) **with a prominent warning + a deep link to `play.google.com/store/account/subscriptions`** and exact cancel steps; **server-side detach/delete the RevenueCat subscriber** so a later restore can't re-grant entitlement. Stripe is auto-canceled server-side; Play cannot be. |
| **D-GP-3** | `minSdkVersion` floor (26 vs lower). | **26 (Android 8.0)** unless analytics shows a real device tail below it. |
| **D-GP-4** | (Mechanism only — the **declaration itself is committed**, fix 7.) Whether `expo-audio` background playback auto-emits the `mediaPlayback` FGS or needs a manifest-injection config plugin. | Prove with `bundletool` in the M3 spike; add a config plugin if `bundletool` doesn't show the `mediaPlayback` FGS type. The Console FGS declaration + demo video ship regardless. |
| **(cross-doc)** | **Privacy policy correction** (Deepgram, raw-PCM). | **Blocking** for Data Safety accuracy — fix before the next iOS *or* Android submission. |

---

*This doc is the Android compliance gate. iOS ships first on the same shared foundation (decision D5); the Android phase reuses the RevenueCat SDK, the shared voice pipeline, and the account-deletion contract unchanged, adding only the Play-specific forms, FGS declaration, AAB/signing, and the closed-testing track gate above.*
