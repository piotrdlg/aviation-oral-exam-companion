# 00 — HeyDPE Mobile Master Plan

> **Entry-point document.** Read this first, then drill into the sub-docs (index in §7). This file owns the *sequencing*, the *cross-doc map*, the *risk register*, and the *go/no-go gate*. The sub-docs own the depth.
>
> **Scope:** Native iOS + Android apps for HeyDPE (FAA DPE oral-exam simulator), built on the shipped web backend. **iOS ships first; Android follows on the same shared foundation.**
>
> **Status:** Planning complete (this corpus). Build not started. Owner sign-off pending (see open questions, §9).
> **Owner:** Piotr (pd@imagineflying.com), Imagine Flying LLC.
> **Last updated:** 2026-06-15.

This plan slots into the web launch-readiness master plan (`docs/plans/2026-06-09-launch-readiness-master-plan.md`, hereafter **LRMP**) as Phase 8 (tasks M1–M4). The mapping is §5. Every fact below is cited to source (`file:line`) or to a sub-doc; nothing is asserted from memory.

---

## 1. Product vision, the award-winning bar, and the Definition of Done

### 1.1 Vision (qualitative)

HeyDPE on mobile is a **voice-first oral-exam cockpit in the pilot's pocket**: a checkride candidate puts in earbuds during a preflight wait, taps once, and is in a live spoken mock oral with an AI DPE that follows the FAA ACS — asking, assessing, transitioning between topics, and grading — exactly as the web app does, but with native-grade voice latency, background audio, and platform delight. It is **not a WebView wrapper**. It is a native interpretation of the shipped **FLIGHT DECK** brand: dark instrument theme, the attitude-indicator brand mark (`src/components/Brand.tsx`), `// cockpit` micro-labels, mono numeric readouts, and bezel/station/iframe surfaces — rendered through native iOS HIG and Android Material 3 navigation, gestures, sheets, and system components.

v1 is **PARITY v1**: the web app's seven core screens mirrored to full store quality, shipped fast. The iOS-native delight tier (Live Activities / Dynamic Island, Home-Screen widgets, Siri Shortcuts, optional Apple Watch) is fully specified in `09-DELIGHT-V1.1.md` and is explicitly a **v1.1 fast-follow — NOT in v1**.

### 1.2 The award-winning bar (what "great", not just "shipped", means)

| Dimension | The bar | Measurable proxy |
|---|---|---|
| **Voice feel** | Conversation feels live, not turn-based-laggy | Capture→first interim transcript < 800 ms; TTS time-to-first-audio < 1.5 s; barge-in cut < 250 ms (per `03-VOICE-PIPELINE.md` T1/T2/T5; proven by `08-VOICE-SPIKE-M3.md`) |
| **Native fidelity** | A reviewer cannot tell it was built cross-platform | 0 WebView screens in v1; every navigation transition uses native stack/sheet/tab primitives (`02-DESIGN-SYSTEM.md` §IA); HIG large-title + Material 3 top-app-bar both implemented |
| **Brand integrity** | The cockpit identity survives the native port verbatim | Theme-token CI parity check vs web `@theme` block passes (`02-DESIGN-SYSTEM.md`); THE-ONE-RULE typography discipline honored on every screen (caps-mono+glow only for instrument moments) |
| **Launch quality** | First-submission acceptance, not a rejection-fix loop | App Store + Play accepted on **first** review attempt (target); 0 P0 store-compliance gaps open at submission |
| **Reliability** | It does not crash under a real exam | Crash-free sessions ≥ 99.5%, crash-free users ≥ 99.8% (`07-TELEMETRY.md`) |

### 1.3 Definition of Done

> **DEFINITION OF DONE = ACCEPTED INTO THE APP STORE.**
>
> v1 is "done" when the iOS build is **accepted into the Apple App Store** (live, not just uploaded to TestFlight) with a real reviewer having completed a voice exam via the 2.1 demo account, and the Android build is **accepted into Google Play Production**. Code-complete, TestFlight-green, and "works on my device" are *milestones toward* done — they are **not** done. The acceptance certificate is the store listing going live. This bar drives §6 (risk register) and §8 (go/no-go gate): every milestone exit criterion rolls up to it.

**Pass/fail for §1:** iOS App Store listing is live AND Android Play Production listing is live AND a reviewer ran a real exam on the demo account (verifiable in the review notes / App Store Connect resolution). Anything short = not done.

---

## 2. Locked decisions (do not re-litigate)

These five are **owner decisions D5 + payments**, already resolved (LRMP D5, `:34`). Every milestone and sub-doc builds on them.

| # | Decision | Locked form | Source |
|---|---|---|---|
| **L1 Framework** | React Native + Expo | Dev-client builds, **New Architecture mandatory** (SDK 55+ cannot disable it). Target SDK 56 (RN 0.85 / React 19.2) at build date; SDK 55 is the conservative fallback. | LRMP D5 `:34`; Expo research §1 |
| **L2 Monorepo** | `apps/mobile` (Expo) + `packages/shared` in **this repo** | Turborepo + workspaces. Pure-TS logic — `src/lib/voice/sentence-boundary.ts` (5,810 bytes, 21 tests), `src/types/database.ts`, tier mapping (`src/lib/tier-labels.ts`) — extracted into `packages/shared` as the **single source of truth** consumed by web + mobile. | LRMP architecture note `:7`; §3 below |
| **L3 Design language** | "Native-adapted FLIGHT DECK" | KEEP the cockpit brand (dark instrument theme, FLIGHT DECK tokens, attitude-indicator mark, `//` micro-labels, mono readouts, bezel/station/iframe surfaces) AND honor iOS HIG / Android Material 3 for nav, gestures, sheets, system components. A native interpretation, not a webview port. | `02-DESIGN-SYSTEM.md`; design guide `docs/design/2026-06-14-flight-deck-application-guide.md:9-22` |
| **L4 v1 ambition** | PARITY v1 (7 core screens, store quality, fast) | iOS-native delight (Live Activities/Dynamic Island, widgets, Siri, Apple Watch) is **v1.1 fast-follow, explicitly NOT v1**. | `09-DELIGHT-V1.1.md` |
| **L5 Sequencing** | **iOS FIRST**, Android FOLLOWS | Same shared foundation; iOS is the most immediate goal. | LRMP `:9`; §4 below |
| **L6 Payments** | RevenueCat | IAP is the **primary** purchase path on iOS (Apple Guideline 3.1.1). Stripe remains the web/Android-link path. Server-side entitlement merge guarantees Stripe and IAP **never stack** on one account. | `04-PAYMENTS-ENTITLEMENTS.md`; `screens/07-paywall.md` |

**Pass/fail for §2:** No milestone, PR, or sub-doc may contradict L1–L6. A proposal to (e.g.) ship a WebView screen, sell via Stripe checkout on iOS, or pull `09`'s widgets into v1 is **rejected by definition**, not debated.

---

## 3. Monorepo architecture

### 3.1 Target layout (qualitative)

The web app stays where it is; the mobile app and the shared package are added alongside it under Turborepo + npm workspaces. This is **L2**, and it is the structural reason a thin mobile client is even possible: LRMP task **W2.1** moved exam state server-side (`exam_sessions.metadata` is authoritative), so the client carries no exam logic — only rendering and the voice pipeline.

```
aviation-oral-exam-companion/            # repo root (unchanged name)
├── apps/
│   ├── web/                             # the current Next.js app, moved under apps/web
│   │   └── (src/, supabase/, e2e/ … exactly as today)
│   └── mobile/                          # NEW — Expo app (expo-router, dev-client, New Arch)
│       ├── app/                         # expo-router routes (see 02-DESIGN-SYSTEM IA)
│       │   ├── _layout.tsx              # root Stack
│       │   ├── (tabs)/_layout.tsx       # 4 bottom tabs: Home / Practice / Progress / Settings
│       │   ├── (auth)/                  # login + OTP gate (screens/01-auth.md)
│       │   ├── onboarding.tsx           # root modal (screens/02-onboarding.md)
│       │   └── upgrade.tsx              # formSheet paywall (screens/07-paywall.md)
│       ├── eas.json                     # dev / preview / production build + submit profiles
│       ├── app.config.ts                # config plugins (audio, apple-auth, deep-link scheme)
│       └── PrivacyInfo.xcprivacy        # required-reason APIs + nutrition label (05-APPLE)
├── packages/
│   └── shared/                          # NEW — single source of truth, platform-neutral TS
│       ├── voice/sentence-boundary.ts   # extracted verbatim WITH its 21 tests
│       ├── voice/SentenceTTSController   # platform-neutral queue/drain (03-VOICE-PIPELINE §)
│       ├── types/database.ts            # the 34-table enums/types
│       ├── tier/tier-labels.ts          # display-only Trial/Paid/Tester mapping
│       └── theme/                       # typed FLIGHT DECK token object (02-DESIGN-SYSTEM)
├── turbo.json                           # pipeline: typecheck, test, lint, build
└── package.json                         # workspaces: ["apps/*", "packages/*"]
```

> **OWNER DECISION D-MM-1 — web relocation timing.** Moving `src/` → `apps/web/` is mechanically large (every import path, Vercel root dir, CI paths). Two options: **(a)** relocate web into `apps/web` up front (cleanest Turborepo shape, recommended); **(b)** leave web at root and add only `apps/mobile` + `packages/shared` as workspaces, deferring the web move. Recommendation: **(a)** during M0 scaffold, in a single dedicated PR with no behavior change, because doing it later collides with active web feature work. Owner to confirm.

### 3.2 What moves into `packages/shared` (and the hard import rule)

| Moved in | Why | Constraint |
|---|---|---|
| `sentence-boundary.ts` (verbatim) + its 21 tests | The TTS chunker must be byte-identical on web and mobile; it is pure TS | Package may **not** import from `src/`/`apps/web` or touch any browser/DOM/React-Native global |
| `database.ts` enums/types | One type definition for `tier`, `study_mode`, assessment scores, the 34 tables | Type-only; no runtime deps |
| `tier-labels.ts` | The **display-only** Trial/Paid/Tester mapping (the stored enum `checkride_prep`/`dpe_live`/`ground_school` is unchanged) | Pure mapping; no I/O |
| `SentenceTTSController` | The queue/drain/prefetch state machine lifted from `useSentenceTTS.ts`, made platform-neutral behind an `AudioSink` seam | No `expo-audio`/no `Audio` element import — the sink is injected (`03-VOICE-PIPELINE.md`) |
| FLIGHT DECK `theme/` token object | Typed tokens consumed via `useTheme()` on mobile; CI parity-checked vs web `@theme` | Tokens only; no platform components |

**Hard rule (CI-enforced):** `packages/shared` imports **nothing** from `apps/web/src` and references **no** browser or React-Native global. A lint/CI check fails the build on violation (`01-API-ENABLEMENT-AND-CONTRACT.md` §A package rule).

**Pass/fail for §3.2:** `packages/shared` builds standalone; the 21 sentence-boundary tests pass inside the package; a CI grep proves 0 forbidden imports; web still imports the same logic from `@heydpe/shared` (or chosen package name — D-MM-2) with no behavior change (the full existing Vitest suite (1,350+ tests) stays green).

> **OWNER DECISION D-MM-2 — package name.** `@heydpe/shared` recommended (matches brand). Flagged also in `01-API-ENABLEMENT-AND-CONTRACT.md`.

### 3.3 CI changes (typecheck + tests across web + mobile)

Today CI runs typecheck + Vitest + (advisory) lint on the single root (`.github/workflows/ci.yml`). Turborepo changes that to a **per-workspace** matrix:

| Step | Web | `packages/shared` | Mobile (`apps/mobile`) |
|---|---|---|---|
| typecheck | `tsc --noEmit` (as today) | `tsc --noEmit` | `tsc --noEmit` (RN/Expo types) |
| unit tests | the full existing Vitest suite (1,350+ tests) | Vitest (incl. the 21 boundary tests) | Vitest/Jest for client logic; **device tests are NOT in PR CI** |
| lint | ESLint (advisory until LRMP W0.6, then blocking) | ESLint | ESLint (expo lint) |
| theme parity | n/a | **token-parity check vs web `@theme`** (`02-DESIGN-SYSTEM.md`) | n/a |
| shared-import guard | n/a | **forbidden-import grep** (§3.2) | n/a |
| E2E | not in CI (LRMP W0.1 `:66`) | n/a | **Maestro/Detox smoke is a separate, non-PR-blocking job** (`07-TELEMETRY.md`) |

Turborepo caches per task so an `apps/mobile`-only change does not re-run the full web suite, and vice versa.

**Pass/fail for §3.3:** PR CI runs typecheck + tests for all three workspaces; a mobile-only change does not break/needlessly re-run web; the theme-parity and forbidden-import checks are wired and fail loudly when violated; the existing web hard gates (typecheck + full Vitest) remain blocking.

### 3.4 EAS Build / EAS Submit

`apps/mobile/eas.json` carries the standard three build profiles plus submit profiles (Expo research §7):

| Profile | Use | Key flags |
|---|---|---|
| `development` | Dev-client on physical devices | `developmentClient: true`, `distribution: internal` |
| `preview` | Internal QA / TestFlight-style | `distribution: internal` |
| `production` | Store-bound release; default for `eas submit` | `autoIncrement: true` |

Submit: iOS → App Store Connect (`ascAppId`, `appleTeamId`); Android → Google Play (`serviceAccountKeyPath`, `track: internal` → `beta` → `production`). Runtime-version policy = **`fingerprint`** (safest; auto-bumps when native runtime changes), so an EAS Update OTA can never reach a binary lacking the native code it needs. OTA carries **JS/assets only**; any native change, permission change, or SDK bump = new build + store submission (Apple 2.5.2 / Google Device-and-Network-Abuse — `05`/`06`).

**Pass/fail for §3.4:** `eas build --profile production` produces a signed iOS `.ipa` and Android `.aab`; `eas submit --profile production` uploads to App Store Connect and Play internal track; `runtimeVersion.policy: "fingerprint"` set; an OTA dry-run targets only matching-runtime builds.

---

## 4. THE SEQUENCING (carefully analyzed)

> This is the section the owner flagged as the one that **must** be carefully analyzed. It defines the milestone breakdown (M0–M6 iOS-first, then the Android track), each with goal / dependencies / entry criteria / **measurable** exit criteria, an ASCII dependency graph, the critical path, the parallel lanes, and the *why* (what each step de-risks).

### 4.0 Sequencing logic (the WHY, in one paragraph)

The order is driven by **de-risking the most uncertain, most expensive-to-rework things first** while never building on an unproven foundation. Auth + scaffold (M0) come first because **nothing renders without a session**, and the New-Architecture/SDK choice and the monorepo split are cheaper to get right on an empty app than a full one. Backend enablement (M1) precedes any feature build because **a native client cannot call ~90% of routes until Bearer auth exists** — it is the literal blocker (`01` §A). The **text-only** exam loop (M2) comes before voice because it proves the hardest *product* surface — the SSE streaming contract, server-owned state, error/quota handling — **without** the hardest *platform* surface (real-time audio) layered on top; a bug found here is a contract bug, not an audio bug. Voice (M3) is gated behind a **throwaway spike** (`08`) precisely because real-time PCM mic → Deepgram WS is the single genuine framework risk (LRMP D5); we refuse to commit the production voice build until a physical-device spike proves the latency thresholds, with Flutter as the named contingency. Payments (M4) follow voice because **the paywall only matters once there is a product worth paying for**, and the IAP/Stripe entitlement-merge backend can be built server-side in parallel anyway. Progress/Settings/polish (M5) is parity cleanup that depends on the read endpoints already proven by M2's auth work. Store submission (M6) is last because **Definition of Done = store acceptance** and every prior milestone's exit criteria roll up into the compliance gate. Android (M7+) is deliberately last and cheap: the shared core, the API contract, the entitlement backend, and the design system are all platform-neutral by construction, so Android is a re-skin + a billing/compliance swap, not a rebuild.

### 4.1 Milestone breakdown — iOS first

Each milestone: **Goal · Dependencies · Entry criteria · Exit criteria (measurable)**. "Doc N" = the sub-doc that owns the detail.

---

#### M0 — Scaffold + Auth
- **Goal:** A signable Expo dev-client app that a user can log into and that persists a session across cold launch. Monorepo + shared package in place.
- **Dependencies:** L1/L2 locked; Apple Developer + App Store Connect app record; Supabase redirect URL `com.heydpe://auth-callback` allow-listed.
- **Entry criteria:** Repo on Turborepo (D-MM-1 resolved); EAS project created.
- **Exit criteria (measurable):**
  - `eas build --profile development` installs on a physical iPhone; app boots to login.
  - All four auth methods work end-to-end on device: Email 6-digit OTP, Google (PKCE deep link), Microsoft (PKCE deep link, `azure` scope override `openid email profile`), **native** Sign in with Apple (`expo-apple-authentication` + `signInWithIdToken`, nonce mandatory) — per `screens/01-auth.md`.
  - Session persists across a full app kill (SecureStore / hybrid AES adapter); `AppState`-driven token refresh wired.
  - `packages/shared` builds; its 21 sentence-boundary tests pass in CI; forbidden-import + theme-parity checks green.
  - 0 WebView screens. `/auth/callback` web route is **not** used on mobile (PKCE in-process).

#### M1 — Backend enablement (LRMP **M1**; doc `01-API-ENABLEMENT-AND-CONTRACT.md`)
- **Goal:** The cookie-based web backend accepts `Authorization: Bearer <jwt>` from native clients **without** changing web behavior, and the authoritative v1 API contract is documented.
- **Dependencies:** LRMP **W2.1** merged (server-owned exam state — the contract the native client builds against, LRMP `:1045`).
- **Entry criteria:** M0 mints a real Supabase JWT on device.
- **Exit criteria (measurable):** (the 5 additive backend changes, all cited in `01` §A)
  - Dual-mode `getAuthedUser(request)` in `src/lib/supabase/auth.ts` (modeled on `bench/route.ts:30-39`); same JWT returns **identical** responses via cookie and Bearer on ≥5 spot-checked routes.
  - Rate-limit identity derives the per-user bucket from the Bearer JWT `sub` (`middleware.ts:27-52`) — mobile users behind one carrier NAT no longer share one bucket (no false-positive 429).
  - One-active-exam guard reads the Bearer `accessToken` instead of cookie `getSession()` (`exam/route.ts:467-470`); the two-device 409 path works for a mobile↔web pair.
  - `stt/token` honors allow-listed `encoding=linear16&sample_rate=16000` (GET signature changed to `GET(request)`).
  - `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` Part B documents every v1 route's request/response/error/429 shape, the SSE discriminator contract, and `X-Task-Id`/`X-Task-Data` headers. **Web E2E suite unaffected.**

#### M2 — Exam loop, text-only (the core product, no audio)
- **Goal:** A user can run a full ACS oral exam end-to-end **in text**: config → SSE-streamed examiner turns → typed answers → assessment badges → natural completion → results sheet. All error/quota/resume paths handled.
- **Voice posture (do not skip):** M2 ships the practice + onboarding screens with **voice OFF / type-only** — the mic-priming, audio-session, and voice-toggle paths in `screens/02-onboarding.md` and `screens/03-practice.md` are present in the UI but **inert**, and light up **only after the M3 spike GO** (`08-VOICE-SPIKE-M3.md` §10). No native capture/playback code lands in M2.
- **Dependencies:** M1 (Bearer + contract); `screens/03-practice.md`, `screens/02-onboarding.md`, `screens/04-home.md`.
- **Entry criteria:** Bearer auth live on staging/prod; SSE contract documented (M1).
- **Exit criteria (measurable):**
  - SSE render loop discriminates by JSON key (`chunk`/`token`/`paragraph`/`examinerMessage`/`asset`/`images`/`assessment`), ignores `:` keep-alives, terminates on literal `[DONE]` (`exam-engine.ts:500-707` per `01`).
  - A scripted full exam visits multiple ACS tasks and ends with `sessionComplete:true`; resume-current restores the pending element.
  - All four trial-block 403s render the upgrade sheet with the correct copy: `trial_limit_reached`, `trial_expired`, `resubscribe_required` (`session/route.ts:60-145`), plus 429/409/503 mapped (`screens/03-practice.md`).
  - Onboarding wizard (6 steps) gates first exam via `GET /api/user/tier onboardingCompleted` (`screens/02-onboarding.md`); consent gate present.
  - **Telemetry (M2 exit — `07-TELEMETRY.md`):** PostHog + Sentry initialized **behind the consent gate** (no event fires before consent — including the separate `ai_data_processing` consent recorded server-side before the first exam per `screens/02-onboarding.md`); the **CLIENT-row parity emitters** for every M2 screen actually fire (verified by hand or the smoke flow). Dashboards, crash-free proof, and the store data-safety forms are **not** M2 — they roll up to M5/M6.
  - Perf: config→first SSE token ≤ 3 s p50; step transitions ≤ 100 ms.

#### M3 — Voice spike + production voice pipeline (LRMP **M3**; docs `08-VOICE-SPIKE-M3.md` → `03-VOICE-PIPELINE.md`)
- **Goal:** Prove real-time native voice on physical devices, then build it into the app: mic → linear16 PCM 16 kHz → Deepgram WS (live interim), `/api/tts` mp3 → gap-free playback, barge-in, background/lock-screen TTS completion.
- **Voice posture (do not skip):** This is where the M2 voice-toggle/mic-priming/audio-session paths (shipped inert in `screens/02-onboarding.md` / `screens/03-practice.md`) finally **light up** — but **only after** the spike GO below is recorded (`08-VOICE-SPIKE-M3.md` §10). A NO-GO keeps voice OFF and escalates to the Flutter contingency before any production capture/playback code is written.
- **Dependencies:** **GATED by the M3 spike** (`08`). M2 (a working exam to speak through). M1 (`encoding=linear16` STT URL).
- **Entry criteria:** Spike app (`mobile-spike/`, outside the workspace) wired to real `/api/tts` + `/api/stt/token`.
- **Exit criteria (measurable):** (spike thresholds, median-of-10, 8/10 tail rule, both primary devices — `08`/`03`)
  - **GATE — spike GO:** T1 capture→interim < 800 ms; T2 TTS TTFA < 1.5 s on Wi-Fi; T3 inter-chunk gap < 120 ms (3 chunks gap-free); T4 examiner voice **not** transcribed (AEC on); T5 barge-in cut < 250 ms; T6 one warm socket reused. **NO-GO → escalate to a head-to-head Flutter spike (D5 contingency).**
  - Production pipeline then ports `SentenceTTSController` + `sentence-boundary.ts` from `packages/shared`; iOS `.voiceChat` / Android `AcousticEchoCanceler` audio session; half-duplex gate; iOS `UIBackgroundModes: audio` / Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK`; full interruption controller (calls/Siri/notifications/route-changes/Bluetooth/CarPlay).
  - Locked-screen TTS completes 10/10.

#### M4 — Payments (LRMP **M4**; doc `04-PAYMENTS-ENTITLEMENTS.md` + `screens/07-paywall.md`)
- **Goal:** Sell a subscription via RevenueCat IAP on iOS, restore purchases, recognize existing Stripe-web subscribers without double-charging, and merge entitlements server-side so Stripe + IAP never stack.
- **Dependencies:** Spike GO (D5). RevenueCat project configured (App User ID = Supabase `user.id`). Stripe billing code (LRMP W3.x) as the precedent.
- **Entry criteria:** A product worth paying for exists (M2+M3). IAP products created in App Store Connect.
- **Exit criteria (measurable):**
  - Paywall is an `expo-router` `formSheet` (`apps/mobile/app/upgrade.tsx`), never a tab/full page; FLIGHT DECK typography on `// PRICING`/`BEST VALUE`/`SUBSCRIBED`/prices/CTA only.
  - iOS **never** calls `/api/stripe/checkout` to sell (Apple 3.1.1). Buy → RevenueCat IAP (StoreKit 2); Restore present; auto-renew Schedule-2 disclosure shown.
  - Server: additive migration adds `entitlement_source CHECK in (stripe,iap,override,none)` + `iap_*` columns + service-role `iap_event_log`; `POST /api/iap/webhook` (constant-time auth, idempotent on `event.id`, event-time out-of-order guard, revoke only on `EXPIRATION`); `GET /api/iap/eligibility`.
  - **Marquee test:** a user shaped like a production Stripe payer who triggers IAP `INITIAL_PURCHASE` → **tier unchanged + owner alert** (never stacks). Replay of any event = no-op. Trial-gate regression suite green.

#### M5 — Progress + Settings + polish (parity cleanup)
- **Goal:** The remaining read-only/account screens at parity, plus the cross-cutting polish that makes it feel award-grade.
- **Dependencies:** M2 (auth + reads proven); M4 (Settings "Manage subscription" routes to RevenueCat Customer Center / Stripe portal).
- **Entry criteria:** Core loop + payments live in TestFlight internal.
- **Exit criteria (measurable):**
  - Progress (`screens/05-progress.md`): 4 parallel GETs on rating change; **never** calls `?action=summary`; ACS map renders via `@shopify/react-native-skia` + `d3-hierarchy` (bars-only fallback acceptable); uses shipped FLIGHT DECK tokens (no stale neon/9 px drift).
  - Settings (`screens/06-settings.md`): v1 six areas; **mandatory in-app account deletion** wired to `/api/user/delete` (type-to-confirm DELETE; Stripe-cancel-or-502; 34-table cascade; `account_deleted` telemetry). Apple 5.1.1(v) + Play satisfied.
  - Home (`screens/04-home.md`): 3 parallel GETs; no purchase UI; truthful trial copy.
  - Accessibility baseline across all screens: VoiceOver/TalkBack order defined; Dynamic Type within clamped bounds; ≥ 4.5:1 contrast pass-list (`02-DESIGN-SYSTEM.md` §8.1); 44 pt iOS / 48 dp Android targets; **no 10 px text**; reduced-motion honored.
  - **Telemetry (M5 exit — `07-TELEMETRY.md`):** CLIENT-row emitters complete across all 7 screens (Progress/Settings/Home added on top of M2's set); PostHog dashboards stood up; crash-free **proof** under way over the TestFlight/internal-track QA window (the ≥ 99.5% sessions / ≥ 99.8% users target is verified at the M6 gate). The Apple Nutrition Label / Play Data Safety **forms** are authored against these tables at the M6/M7 submission gate.

#### M6 — iOS store submission (doc `05-APPLE-COMPLIANCE.md`)
- **Goal:** **Accepted into the App Store** (the Definition of Done for iOS).
- **Dependencies:** M0–M5 complete; `07-TELEMETRY.md` (consent-gated PostHog + Sentry) wired.
- **Entry criteria:** Production EAS build passes internal QA; all 25 `05` sections satisfied.
- **Exit criteria (measurable):**
  - 2.1 demo account runs a **real voice exam** without tripping the app-side trial 403 (`session/route.ts`).
  - `PrivacyInfo.xcprivacy` complete; required-reason APIs declared (no ITMS-91053/91055); `NSMicrophoneUsageDescription` wording set; `UIBackgroundModes: audio`; export compliance + age rating set; App Privacy Nutrition Label matches `07-TELEMETRY.md` tables.
  - 4.8 Sign in with Apple parity present; 5.1.1(v) in-app deletion present; 3.1.1 IAP-only selling on iOS.
  - **BLOCKING FIX:** `src/app/privacy/page.tsx` corrected for iOS (it still describes the browser Web Speech API, omits Deepgram, lists web-only trackers) — required for 5.1.2(i) + Nutrition Label (`05`/`06` shared finding).
  - **Exit = App Store listing live.**

### 4.2 Android track (FOLLOWS; doc `06-GOOGLE-PLAY-COMPLIANCE.md`)

Android is the same shared foundation re-skinned to Material 3, with a billing + compliance swap. It reuses M1 (Bearer contract), M2 (exam loop), M3 (voice pipeline — same native modules, Android session config already specified), M4 (entitlement backend; Android billing via RevenueCat-on-Play is an explicit later phase in `04`), and M5 (screens). Only the platform-specific surfaces are new.

#### M7 — Android parity + Play submission
- **Goal:** **Accepted into Google Play Production** (the Definition of Done for Android).
- **Dependencies:** iOS shipped (M6) OR at least M2–M5 stable on the shared core; `06-GOOGLE-PLAY-COMPLIANCE.md`.
- **Entry criteria:** Material 3 nav/sheets/top-app-bar implemented; Android audio session + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` proven (M3 already covers Android device in the spike matrix).
- **Exit criteria (measurable):**
  - Data Safety form complete and **accurate** (Audio/Voice from raw-PCM mic → Deepgram; Email/Name; PostHog app-activity/diagnostics/device-IDs; encryption-in-transit; deletion answers) — same stale-privacy-policy fix as M6 is a hard prerequisite.
  - `targetSdk 36`; `RECORD_AUDIO` runtime + prominent disclosure; mediaPlayback FGS with **no** background-mic FGS; Play App Signing/AAB; IARC rating.
  - Billing path decided (RevenueCat-via-Play; US Alternative-Billing posture per `06`).
  - Internal → Closed → Production runbook executed. **Exit = Play Production listing live.**

### 4.3 ASCII dependency graph

```
                         (LRMP web track — must precede)
   W0.x → W1.x → W2.1 ─────────────────────────────────────┐
                  │  (server-owned exam state = the mobile contract)
                  ▼
   ┌──────────────────────────── MOBILE TRACK ─────────────────────────────┐
   │                                                                        │
   │   M0 ── scaffold + auth ──┐                                            │
   │   (needs nothing but L1/L2)│                                           │
   │                            ▼                                           │
   │                          M1 ── backend enablement (Bearer + contract)  │
   │                            │   [needs W2.1]                            │
   │                            ▼                                           │
   │                          M2 ── exam loop, TEXT-ONLY (SSE + states)     │
   │                            │                                           │
   │            ┌───────────────┼───────────────┐                          │
   │            ▼               ▼               ▼                          │
   │   spike(08) ⊣GATE→ M3   [M4-server can     M5 reads piggyback         │
   │   (physical devices)  build in parallel]   on M2 auth                 │
   │            │               │                                          │
   │            ▼               ▼                                          │
   │           M3 ── voice ───► M4 ── payments (paywall + IAP merge)        │
   │            └───────┬───────┘                                          │
   │                    ▼                                                  │
   │                   M5 ── progress + settings + polish                  │
   │                    │                                                  │
   │                    ▼                                                  │
   │                   M6 ══ iOS STORE SUBMISSION (= DONE, iOS) ══         │
   │                    │                                                  │
   │                    ▼                                                  │
   │                   M7 ── Android parity ══ PLAY SUBMISSION (= DONE) ══ │
   └────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Critical path

```
W2.1 → M1 → M2 → spike(08)⊣GATE → M3 → M4 → M5 → M6 (iOS live) → M7 (Play live)
```

The single longest chain. The **only hard external gate** on it is the M3 spike: a NO-GO forces a Flutter-comparison detour that re-prices the whole framework decision, which is exactly why it is a throwaway, runs early-as-possible (right after a runnable exam exists in M2), and has binary device-measured thresholds.

### 4.5 What parallelizes (lanes)

| Lane | Can run alongside | Constraint |
|---|---|---|
| `09-DELIGHT-V1.1.md` specs / design polish | Any milestone | Not built in v1 (L4) |
| **M4-server** (`/api/iap/webhook`, migration, eligibility, entitlement merge) | M2/M3 (it is backend, no device dependency) | Cannot be *exercised* end-to-end until the iOS IAP client (M4-client) lands after spike GO |
| M5 read-screens (Progress/Home) wiring | M3 voice build | Both depend only on M2's auth; independent of each other |
| Store-listing assets, copy, screenshots, privacy-policy fix | M2 onward | The privacy-policy correction is a **blocking** prerequisite for M6/M7, so start it early |
| `07-TELEMETRY.md` instrumentation (cross-cutting, **not** milestone M7) | M2 onward | Consent gate must exist before any event fires. This is a **cross-cutting workstream with measurable exits at three milestones**, so it cannot silently slip to the M6 gate undone: **M2 exit** = consent-gated PostHog/Sentry init + CLIENT-row parity emitters firing; **M5 exit** = all-7-screen emitters + dashboards + crash-free proof under way; **M6/M7 gate** = crash-free target met + Apple Nutrition Label / Play Data Safety forms match `07` 1:1 |
| Android Material 3 component work | After M2 stabilizes | Same shared core; only the platform skin differs |

**Pass/fail for §4:** every milestone has a measurable exit; the critical path is single-threaded through the spike gate; the parallel lanes above are the only sanctioned concurrency; no milestone starts before its listed dependency's exit criteria are green.

---

## 5. Milestone → LRMP task mapping (M1–M4)

The LRMP (`docs/plans/2026-06-09-launch-readiness-master-plan.md`) Phase 8 defines four mobile tasks. This corpus **is** the deliverable of LRMP **M2** (the spec). The mapping:

| This plan's milestone | LRMP Phase 8 task | LRMP source | Deliverable doc(s) in this corpus |
|---|---|---|---|
| M1 (backend enablement) | **LRMP M1** — Mobile API enablement (Bearer auth + voice params + contract) | LRMP `:1037-1056` | `01-API-ENABLEMENT-AND-CONTRACT.md` |
| M0, M2, M5, M6 + this master plan | **LRMP M2** — iOS/Android functional & technical specification | LRMP `:1060-1088` | **this doc (00)** + `02-DESIGN-SYSTEM.md`, `screens/01-07`, `05-APPLE-COMPLIANCE.md`, `06-GOOGLE-PLAY-COMPLIANCE.md`, `07-TELEMETRY.md` |
| M3 (voice spike + pipeline) | **LRMP M3** — React Native voice spike (go/no-go for D5) | LRMP `:1092-1109` | `08-VOICE-SPIKE-M3.md` (the gate) → `03-VOICE-PIPELINE.md` (the build) |
| M4 (payments) | **LRMP M4** — IAP entitlement backend (requires D5 GO) | LRMP `:1113-1131` | `04-PAYMENTS-ENTITLEMENTS.md` + `screens/07-paywall.md` |

Notes that keep this coherent with the LRMP:
- LRMP says M1+M2 can start as soon as **W2.1** lands (`:17`, `:1035`); M3+M4 after Phase 7 / web launch gate (`:1147`). This plan's M0 (scaffold/auth) needs nothing but L1/L2 and can start immediately; it is implied-but-unnamed in the LRMP delivery list (LRMP `:1084` "M: project scaffold+auth").
- The LRMP's own §10 delivery milestones (`:1084`) — scaffold+auth / exam-loop-text-only / voice / payments+paywall / progress+settings / store submission — are **exactly** this plan's M0–M6, expanded here with measurable exits and the Android M7 added.
- LRMP `09-DELIGHT-V1.1.md` content is **not** an LRMP task — it is the L4 fast-follow, captured for continuity only.

**Pass/fail for §5:** each of LRMP M1–M4 has at least one owning sub-doc here; no LRMP M-task is unmapped; this master plan satisfies the LRMP M2 success criterion ("an engineer or agent could scaffold milestone 1 from it without clarifying questions").

---

## 6. Risk register

Each: risk · likelihood/impact · mitigation · owner · the measurable trip-wire that says it fired.

| # | Risk | L/I | Mitigation | Owner | Trip-wire |
|---|---|---|---|---|---|
| **R1** | **RN voice latency** — real-time PCM mic → Deepgram WS too slow / glitchy on device | Med / **High** | The M3 spike (`08`) is a *throwaway* that must pass T1–T6 on **two physical devices** before any production voice code; Flutter is the named contingency | Owner + voice lead | Spike NO-GO on either primary device after a bounded remediation window |
| **R2** | **IAP ↔ Stripe entitlement merge** — a user holds both, gets double-charged, or stacks tiers | Med / **High** | App User ID = Supabase `user.id` is the coexistence linchpin; precedence blocks the second provider with an owner alert; `iap_event_log` idempotency + event-time ordering; the marquee "production payer + IAP = tier unchanged" test (`04`) | Owner (billing) | Any test in `04`'s matrix fails; or a live account shows `entitlement_source` conflict |
| **R3** | **Store rejection** — Apple/Google bounce the build | Med / **High** | `05` (25-section Apple checklist) + `06` (Play board) mapped to source; demo account that never trips trial 403; the stale-privacy-policy fix flagged as **blocking**; 4.8/5.1.1(v)/3.1.1 each verified | Owner | First-review rejection; any P0 in `05`/`06` open at submission |
| **R4** | **Audio in background** — TTS dies on lock / OS interruption mishandled | Med / Med | iOS `UIBackgroundModes: audio` + Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (no background **mic**); full interruption controller; spike S4 proves lock-screen completion 10/10 (`03`/`08`) | Voice lead | Locked-screen TTS completes < 10/10 in spike; background-FGS policy rejection on Play |
| **R5** | **Solo-maintainer load** — one person across web + iOS + Android + voice + billing | **High** / Med | Shared core minimizes duplicated logic (L2); Android is a re-skin not a rebuild; v1.1 delight explicitly deferred (L4); milestones are PR-sized; OTA (`fingerprint`) lets JS fixes ship without a full release | Owner | Two consecutive milestones slip their exit criteria; or a hotfix needs a native build it shouldn't |
| **R6** | **SDK/dependency drift** — New-Arch-incompatible native dep, or Xcode/SDK minimum bump at submission | Low / Med | Verify every native dep is New-Arch-ready (no legacy fallback on SDK 55+); `VERIFY-AT-SUBMISSION` register in `05`/`06`/`03` | Owner | An adopted dep has no New-Arch build; App Store Connect rejects the Xcode/SDK version |
| **R7** | **Web regression from the monorepo move** — relocating `src/` breaks web | Low / **High** | D-MM-1 done in one no-behavior-change PR; the full existing Vitest suite (1,350+ tests) + typecheck stay hard-blocking in CI; Turborepo caching isolates lanes | Owner | Web Vitest/typecheck red after the move; Vercel deploy fails |

**Pass/fail for §6:** every risk has a named owner, a concrete mitigation tied to a sub-doc, and a measurable trip-wire; R1–R3 (the High-impact three) each gate a specific milestone exit (M3, M4, M6/M7 respectively).

---

## 7. Document index

| Doc | Owns | Milestone(s) |
|---|---|---|
| **`00-MOBILE-MASTER-PLAN.md`** (this) | Vision, locked decisions, monorepo, sequencing, LRMP mapping, risks, go/no-go | All |
| `01-API-ENABLEMENT-AND-CONTRACT.md` | Bearer-auth enablement (Part A) + authoritative v1 API contract (Part B) | M1 |
| `02-DESIGN-SYSTEM.md` | Native-adapted FLIGHT DECK tokens, typography rule, IA, component library, accessibility | M0–M6 (all UI) |
| `03-VOICE-PIPELINE.md` | Capture/playback/barge-in/session/interruption design + T1–T6 budgets | M3 |
| `04-PAYMENTS-ENTITLEMENTS.md` | RevenueCat client + `/api/iap/*` backend + Stripe/IAP precedence | M4 |
| `05-APPLE-COMPLIANCE.md` | 25-section App Store acceptance checklist + submission runbook | M6 |
| `06-GOOGLE-PLAY-COMPLIANCE.md` | Play Data Safety, billing posture, FGS, submission runbook | M7 |
| `07-TELEMETRY.md` | PostHog/Sentry, event-parity table, consent gating, ATT posture | M2–M7 |
| `08-VOICE-SPIKE-M3.md` | The throwaway spike gate (S1–S4) + GO/NO-GO rule | M3 (gate) |
| `09-DELIGHT-V1.1.md` | Live Activities/widgets/Siri/Watch — **NOT in v1** | v1.1 |
| `screens/01-auth.md` | Login / OTP / OAuth / native Apple Sign-In | M0 |
| `screens/02-onboarding.md` | 6-step wizard + consent + mic priming | M2 |
| `screens/03-practice.md` | The core voice+chat exam screen | M2/M3 |
| `screens/04-home.md` | Dashboard (tab 1) | M2/M5 |
| `screens/05-progress.md` | Progress analytics (tab 3, read-only) | M5 |
| `screens/06-settings.md` | Settings + mandatory account deletion (tab 4) | M5 |
| `screens/07-paywall.md` | Upgrade `formSheet` (RevenueCat IAP) | M4 |

**Pass/fail for §7:** every file listed exists in `docs/mobile/`; every milestone has at least one owning doc; no doc is orphaned.

---

## 8. Consolidated pre-launch go/no-go gate

Submit to a store **only** when every row is GREEN. This is the gate that operationalizes the Definition of Done (§1.3). A single RED = NO-GO.

### 8.1 Product & engine
- [ ] Full text exam runs start→completion on device; `sessionComplete:true` fires; resume-current works (M2).
- [ ] Voice spike (`08`) **GO** recorded; T1–T6 met median-of-10 on both primary devices (M3).
- [ ] Voice pipeline: barge-in < 250 ms; locked-screen TTS 10/10; AEC keeps examiner voice out of transcript (M3).
- [ ] All trial/quota/error states render correct copy: `trial_limit_reached`/`trial_expired`/`resubscribe_required` (`session/route.ts:60-145`) + 429/409/503.

### 8.2 Payments & entitlements
- [ ] IAP buy + Restore work on a real sandbox account; auto-renew disclosure shown (Apple 3.1.2).
- [ ] iOS never calls `/api/stripe/checkout` to sell (Apple 3.1.1).
- [ ] Marquee test green: production-Stripe-payer + IAP `INITIAL_PURCHASE` → tier unchanged + alert (`04`).
- [ ] Event replay = no-op; out-of-order guard verified; trial-gate regression suite green.

### 8.3 Compliance (the Definition-of-Done gate)
- [ ] 2.1 demo account runs a real voice exam without tripping the trial 403.
- [ ] 4.8 native Sign in with Apple present; 5.1.1(v) in-app account deletion wired to `/api/user/delete`.
- [ ] `PrivacyInfo.xcprivacy` + required-reason APIs (no ITMS-91053/91055); `NSMicrophoneUsageDescription` set; `UIBackgroundModes: audio`.
- [ ] **`src/app/privacy/page.tsx` corrected** (Deepgram STT/TTS, no Web Speech API, no web-only trackers) — blocking for 5.1.2(i) + Nutrition Label + Play Data Safety.
- [ ] App Privacy Nutrition Label (iOS) and Data Safety form (Android) match `07-TELEMETRY.md` 1:1.
- [ ] Android: `targetSdk 36`, AAB + Play App Signing, RECORD_AUDIO prominent disclosure, mediaPlayback FGS (no background-mic FGS), IARC.

### 8.4 Quality, telemetry, ops
- [ ] Accessibility baseline met on all 7 screens (VoiceOver/TalkBack order, Dynamic Type bounds, ≥4.5:1 contrast, 44pt/48dp, no 10px text, reduced-motion).
- [ ] Theme-parity CI check + forbidden-import check green; the full existing Vitest suite (1,350+ tests) + typecheck still green after the monorepo move.
- [ ] Crash-free sessions ≥ 99.5%, crash-free users ≥ 99.8% in TestFlight/internal-track over the QA window.
- [ ] PostHog event-parity (`07`): 100% CLIENT-row coverage via the Maestro/Detox smoke flow; 0 duplicated SERVER events; consent gate enforced; account-deletion triggers a PostHog person-delete.
- [ ] `runtimeVersion.policy: "fingerprint"`; EAS production build + submit dry-run succeed.
- [ ] Every `VERIFY-AT-SUBMISSION` item in `03`/`05`/`06` resolved at the actual submission date.

**Final go/no-go:** all of §8.1–§8.4 GREEN → submit. Acceptance into the store (not upload) closes the gate and satisfies the Definition of Done.

---

## 9. Open questions for the owner

Consolidated decision callouts that block or shape the build (sub-doc-local OWNER DECISIONs live in each sub-doc; these are the cross-cutting ones):

- **D-MM-1** — Relocate web into `apps/web/` up front (recommended) or defer the move and add only `apps/mobile` + `packages/shared`? (§3.1)
- **D-MM-2** — Shared package name (`@heydpe/shared` recommended). (§3.2, `01`)
- **D-MM-3** — Tablet/iPad scope for v1: phone-first stacked layouts, no iPad split-view (recommended), or opt iPad into parity? (raised in `screens/04-home.md` and `screens/07-paywall.md`)
- **D-MM-4** — US external-purchase-link posture: ship IAP-only on iOS for v1 (recommended) or pursue the post-Epic US external-link entitlement at launch? (`05`, `06`, `screens/07-paywall.md`)
- **D-MM-5** — Confirm the stale `src/app/privacy/page.tsx` correction is owner-approved and scheduled **before** M6/M7 (it is a blocking compliance prerequisite, flagged independently in `05` and `06`).
