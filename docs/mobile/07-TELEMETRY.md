# Mobile Telemetry & Observability — Technical Design (M2–M6 instrumentation; gates the M6/M7 store data-safety forms)

> **Read order:** Read `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` first (it defines the Bearer transport and the server's existing **server-side** event surface that mobile must *not* duplicate). Read `docs/mobile/02-DESIGN-SYSTEM.md` for the FLIGHT DECK typography rule applied to the one piece of telemetry that has UI (the in-app diagnostics annunciator, §10). The billing/entitlement grounding for the purchase funnel lives in the **Payments + Entitlements Grounding Brief** (RevenueCat merge, task M4).
>
> **Scope guardrails for this doc:**
> - **Telemetry is a CROSS-CUTTING workstream, not a single milestone.** PostHog/Sentry init + the consent gate + the CLIENT-row parity emitters are **M2 exit criteria** (events must fire from the M2 screens, voice-off/type-only); the IAP events depend on M4; the dashboards, crash-free proof, and the store data-safety forms (§11) are the **M5/M6 gates**. Read the §12 build order against the master plan's milestones — this doc is not "M7 work," it instruments M2→M6 and feeds the M6/M7 submission forms.
> - **Two emitters, one schema.** Telemetry is emitted from exactly two places: (a) the **mobile client** (PostHog React Native SDK + Sentry RN), and (b) the **existing server** (`captureServerEvent` in `src/lib/posthog-server.ts:28`), which already fires on every API route the mobile app calls. The plan's job is to make the *client* half reach **event parity** with the web client and to make the *server* half attribute correctly to the same `distinct_id`. **No server event is renamed, removed, or re-fired by the mobile client** — doing so would double-count the funnel.
> - **No new web behavior.** The web `captureVoiceEvent` (`src/lib/voice-telemetry.ts:35`) and `captureServerEvent` (`src/lib/posthog-server.ts:28`) helpers are the contract. Mobile mirrors their event **names and property shapes verbatim** so a single PostHog project, single set of funnels, and single set of dashboards serve web + iOS + Android.
> - **iOS first, Android second on the same foundation.** Every SDK choice, consent gate, and event call site here is platform-neutral; the only platform-specific code is the **ATT prompt** (iOS-only, §2) and the **data-safety declarations** (§11, one per store).
> - **Every section carries BOTH** (a) a qualitative "done" bar and (b) measurable pass/fail criteria with numbers. A section without numbers is incomplete by the owner's standard.

---

## 0. Observability at a glance

```
  ┌─────────────────────────────── MOBILE CLIENT (apps/mobile) ───────────────────────────────┐
  │                                                                                            │
  │   consent gate (analytics === true) ──► gates BOTH SDKs below                              │
  │   iOS only: ATT status ──► gates IDFA/cross-app only (NOT first-party product analytics)   │
  │                                                                                            │
  │   posthog-react-native           @sentry/react-native            packages/shared           │
  │   ├─ capture(name, props)        ├─ crash (native + JS)          analytics/events.ts       │
  │   ├─ identify(supabase user.id)  ├─ performance (TTID/TTFD)      (event-name constants +    │
  │   ├─ register(super props)       ├─ breadcrumbs (no PII)          prop typing — ONE source  │
  │   └─ reset() on sign-out         └─ release/dist (EAS)            shared web↔mobile)        │
  │                                                                                            │
  └──────────────┬──────────────────────────────────────────────────┬──────────────────────────┘
                 │ client events (parity table §5)                   │ crashes + traces
                 ▼                                                   ▼
        ┌──────────────────────┐                          ┌──────────────────────┐
        │  PostHog (one project │  ◄── server events ──┐   │  Sentry (one project, │
        │  us.i.posthog.com)    │     captureServerEvent│   │  mobile sub-project)  │
        │  funnels + dashboards │     (exam/session/    │   │  crash-free sessions  │
        │  identified_only      │      stripe/webhook)  │   │  release health       │
        └──────────────────────┘  same distinct_id ────┘   └──────────────────────┘
```

**The load-bearing idea:** the server already emits the *outcome* half of the funnel (`exchange_completed`, `assessment_scored`, `session_resumed`, `trial_blocked`, `checkout_completed`, …) keyed on `user.id` (`src/app/api/exam/route.ts:922`, `:1265`; `src/app/api/session/route.ts:69`; `src/app/api/stripe/webhook/route.ts:219`). The **mobile client's only job** is to (a) emit the *intent/UI* half (`voice_mode_toggled`, `paywall_shown`, `upgrade_clicked`, `onboarding_completed`, `settings_voice_changed`, `quota_warning_shown`) with the same names the web client uses (`src/app/(dashboard)/practice/page.tsx:696,735,2255`; `OnboardingWizard.tsx:113`; `settings/page.tsx:641`), and (b) **identify to the same `user.id`** so server and client events land on one person. Parity is therefore "the client fires every web `captureVoiceEvent` call site" — the server half comes for free over the shared API.

---

## 1. SDK selection & versions

### 1.1 PostHog — `posthog-react-native`

**Choice: `posthog-react-native` (the official RN SDK), not `posthog-js`.** The web app uses `posthog-js` (`PostHogProvider.tsx:3`); the RN SDK is the native-correct sibling (it uses `expo-file-system`/`AsyncStorage` for the persisted queue, batches with native lifecycle awareness, and ships an Expo config plugin). It speaks to the **same PostHog project** (`NEXT_PUBLIC_POSTHOG_KEY`, host `https://us.i.posthog.com` — match `posthog-server.ts:17`).

- **Install set:** `posthog-react-native`, `expo-file-system`, `expo-application`, `expo-device`, `expo-localization` (the SDK's documented Expo peer deps), plus the autocapture/session-replay packages **left OFF** for v1 (§4, §11).
- **Init config (mirror web `identified_only`, `posthog-server.ts` host):**
  ```ts
  // packages/shared owns the key + host; apps/mobile owns the gate
  const ph = new PostHog(POSTHOG_KEY, {
    host: 'https://us.i.posthog.com',
    captureAppLifecycleEvents: true,   // Application Opened/Installed/Updated/Backgrounded
    captureMode: 'json',
    flushAt: 20,                        // batch; raise vs web because mobile networks flap
    flushInterval: 30_000,
    defaultOptIn: false,               // CRITICAL: start opted-OUT, opt-in only on consent (§2,§3)
    person_profiles: 'identified_only',// match PostHogProvider.tsx:28
    disabled: !consentGranted,         // hard gate; flipped by the consent listener (§3)
  });
  ```
- **Autocapture (`$autocapture`, `$screen` heatmaps, touch tracking): OFF for v1.** Web sets `capture_pageview:false` and captures manually (`PostHogProvider.tsx:29,44`); mobile mirrors that discipline with **manual `$screen` events on each `expo-router` route focus** (§6) and **no touch autocapture** (it would record button labels/coordinates that are not in our data-safety declaration — §11).
- **Session replay: OFF for v1.** Out of scope and not declared in store privacy forms.

### 1.2 Sentry — `@sentry/react-native`

**Choice: `@sentry/react-native` with the Expo plugin** (`@sentry/react-native/expo` config plugin + Metro/Hermes source-map upload via the EAS build hook). The web app already runs `@sentry/nextjs` (`sentry.server.config.ts:1`, `instrumentation-client.ts:5`) into a Sentry org; mobile gets a **separate Sentry project** under the same org so crash-free metrics are not polluted by web errors.

- **Init config (mirror web's PII posture verbatim — `sendDefaultPii:false`, `tracesSampleRate:0.1`):**
  ```ts
  Sentry.init({
    dsn: SENTRY_DSN_MOBILE,                       // distinct from web NEXT_PUBLIC_SENTRY_DSN
    environment: APP_ENV,                          // local | staging | production (match instrumentation-client.ts:10)
    enabled: consentGranted,                        // gated identically to PostHog (§3)
    sendDefaultPii: false,                          // VERBATIM from sentry.server.config.ts:8 / instrumentation-client.ts:12
    tracesSampleRate: 0.1,                          // 10%, match instrumentation-client.ts:11
    profilesSampleRate: 0.1,                        // RN profiling, same rate
    enableAutoSessionTracking: true,                // REQUIRED for crash-free-sessions metric (§7)
    attachStacktrace: true,
    maxBreadcrumbs: 50,
    beforeSend: scrubPii,                           // strips transcript text, tokens, emails (§8)
    beforeBreadcrumb: scrubBreadcrumb,              // drops console breadcrumbs that may carry answers
    integrations: [Sentry.reactNativeTracingIntegration(), Sentry.mobileReplayIntegration({ maskAllText: true, maskAllImages: true })],
  });
  ```
  > **OWNER DECISION — Sentry Mobile Session Replay on/off.** Sentry RN ships a privacy-masking session replay (`maskAllText:true` redacts every string, including exam answers, before it leaves the device). It is the single best tool for reproducing a crash, but it adds a data category we would have to declare. **Recommend: OFF for v1** (parity with web, which has no replay) and revisit in v1.1 with `maskAllText`/`maskAllImages` forced on. Confirm or override before the M6 submission gate.
- **Native crash capture:** the RN SDK installs native iOS/Android crash handlers automatically; **no extra config** beyond the Expo plugin + dSYM/Proguard mapping upload (§9). This is the only way to catch native New-Architecture (JSI/Fabric) crashes the JS layer can't see.

### 1.3 Version pinning (verify at submission — see doc 01 conventions)

| Package | Target | Note |
|---|---|---|
| `posthog-react-native` | latest stable compatible with Expo SDK 56 / RN 0.85 / New Arch | New-Arch-verify per doc-stack item #4 |
| `@sentry/react-native` | latest stable with Expo SDK 56 config-plugin support + Hermes/New-Arch | **VERIFY-AT-SUBMISSION**: New-Arch native crash capture on RN 0.85 |
| `expo-tracking-transparency` | SDK 56 version | ATT prompt (§2), iOS-only |

**Qualitative "done":** both SDKs are pinned, New-Architecture-verified on a physical iPhone + Android device, share the project's existing PostHog/Sentry orgs, and start **opted-out** until consent flips them on.

**Measurable success criteria:**
- [ ] `posthog-react-native` and `@sentry/react-native` resolve and build a `production` EAS binary on Expo SDK 56 with `newArchEnabled` (cannot be disabled) — build passes, no native link error.
- [ ] With **no consent** and (iOS) **ATT not-determined**, a network capture over a full cold-start + sign-in + one exam shows **0 requests** to `i.posthog.com` and `0` to Sentry ingest (proves opt-out default holds).
- [ ] Sentry `environment` resolves to `production` in a store/TestFlight build and `staging` in a `preview` build (assert by triggering a test crash and reading the tag).
- [ ] PostHog host == `https://us.i.posthog.com` (exact string match to `posthog-server.ts:17`) so client + server events land in one project.

---

## 2. iOS App Tracking Transparency (ATT) — what it does and does NOT gate

**The single most-misunderstood compliance point, stated precisely:**

- **ATT governs the IDFA and *cross-app/cross-website* tracking only** (Apple's definition of "tracking" = linking user/device data collected in *our* app with data from *other companies'* apps/sites for ads or data-broker sharing). **First-party product analytics that never leaves our own systems is NOT "tracking" under ATT** and does not, by itself, require the ATT prompt.
- **HeyDPE's PostHog usage is first-party** (we send `user.id`-keyed product events to our own PostHog project to improve our own app). We do **not** use IDFA, do not share event data with ad networks, and run PostHog with `person_profiles:'identified_only'` keyed on our Supabase user id. **Therefore ATT is not strictly required to run PostHog.**
- **However** — to be conservative and to keep a single, honest privacy story across the marketing/remarketing surface the web app already has (`CookieConsent.tsx` "Marketing" category → Google Ads remarketing, `:269-272`), the plan **shows the ATT prompt iff the user opts into the Marketing category**, and **gates only IDFA-adjacent / cross-app attribution on the ATT result** — never the first-party product funnel.

**Decision matrix (the contract the build follows):**

| Surface | Gated by | iOS behavior |
|---|---|---|
| First-party product analytics (the whole parity table §5) | **Consent `analytics === true`** (§3) | Runs whenever analytics consent granted, regardless of ATT |
| Crash + performance (Sentry) | **Consent `analytics === true`** | Same — Sentry is first-party diagnostics, not cross-app tracking |
| IDFA / cross-app marketing attribution (e.g. install attribution SDKs) | **ATT `authorized`** AND consent `marketing === true` | **Not in v1** — no IDFA SDK ships. ATT prompt shown only if/when one is added |

> **OWNER DECISION — show the ATT prompt in v1 at all?** Because v1 ships **no IDFA/ad-attribution SDK**, ATT is technically unnecessary and Apple discourages prompting when you don't actually track (App Store review can reject an ATT prompt that gates nothing — Guideline 5.1.1(i), VERIFY-AT-SUBMISSION). **Recommend: do NOT show the ATT prompt in v1**; ship `NSUserTrackingUsageDescription` *only if* a marketing-attribution SDK lands in v1.1. The consent gate (§3) is sufficient and honest for v1's first-party-only analytics. Confirm or override.

**If/when ATT is shown (v1.1 path):**
- Use `expo-tracking-transparency`; call `requestTrackingPermissionsAsync()` **after** first meaningful screen, **never** on cold-start before the user understands the app (HIG + review nicety).
- `app.json` plugin sets `NSUserTrackingUsageDescription` (a clear, non-deceptive string).
- Map `granted` ⇄ marketing-category-only; product analytics stays on the consent gate.

**Qualitative "done":** the app never blocks first-party analytics on ATT, never sends IDFA, and (v1) shows no ATT prompt because nothing in v1 meets Apple's "tracking" definition.

**Measurable success criteria:**
- [ ] Static scan of the shipped bundle finds **no reference to `advertisingIdentifier` / IDFA / `ASIdentifierManager`** (grep the prebuilt iOS project + pod manifest) — 0 hits.
- [ ] No `NSUserTrackingUsageDescription` in `Info.plist` for v1 (unless OWNER overrides) — assert in the prebuilt project.
- [ ] With ATT denied (forced via Settings → Privacy → Tracking off) **and analytics consent granted**, the full parity table still fires — event count over the smoke flow == event count with ATT allowed (proves ATT does not gate product analytics).
- [ ] App Privacy "App Tracking Transparency" answer in App Store Connect == **"No, we do not track"** for v1 (matches §11).

---

## 3. Consent gating — one gate, both SDKs, parity with the web banner

The web app stores consent in `localStorage` under `heydpe_consent` as `{ analytics, marketing, timestamp }` and mirrors it server-side via `POST /api/consent` (`CookieConsent.tsx:12,48-58`); PostHog only initializes when `analytics === true` (`PostHogProvider.tsx:8-18,52-59`). **Mobile mirrors this exactly,** swapping `localStorage` for `expo-secure-store`/`AsyncStorage` and the cookie banner for a native consent sheet.

- **Storage:** persist `{ analytics, marketing, timestamp }` under key `heydpe_consent` (same key name — single mental model) using the same hybrid SecureStore/AsyncStorage adapter the auth session uses (doc 01 / Expo-stack §4). Mirror server-side with the same `POST /api/consent { kind:'cookie', choices }` call (`CookieConsent.tsx:53-57`) so the accountability record is unified across platforms.
- **Native consent sheet:** an `expo-router` `presentation:'formSheet'` route shown on first launch **before** any analytics fires (the SDKs start `defaultOptIn:false` / `enabled:false`, §1). Three choices mirror the web banner: **Accept all**, **Necessary only**, **Customize** (Analytics / Marketing toggles, Strictly-Necessary always on) — copy and categories identical to `CookieConsent.tsx:215-291`. FLIGHT DECK typography applies only to the sheet's `// PRIVACY` micro-label; body copy is sentence-case IBM Plex (doc 02).
- **The gate (single function, both SDKs):**
  ```ts
  function applyConsent(c: { analytics: boolean; marketing: boolean }) {
    if (c.analytics) { posthog.optIn(); Sentry.getClient()?.getOptions(); /* enabled */ }
    else            { posthog.optOut(); posthog.reset(); /* and Sentry.close() */ }
    // marketing → only governs the (v1: absent) attribution SDK + GA-equivalent, never product analytics
  }
  ```
  Re-applied on launch (read persisted consent) and whenever the user changes it in Settings → Privacy (a Settings row mirroring the web "Customize" control).
- **Revocation = stop + purge:** toggling analytics off calls `posthog.optOut()` + `posthog.reset()` (drops queued events and the person link) and `Sentry.close()`. Already-sent events are not retro-deletable client-side; the Settings → Your data → **Delete account** path (`settings/page.tsx` → `POST /api/user/delete`, which fires `account_deleted` and flushes — `src/app/api/user/delete/route.ts:84`) is the full erasure path and must also issue a PostHog person delete server-side (§8).

**Qualitative "done":** zero analytics/crash traffic until the user grants analytics consent; revocation immediately stops and purges the client queue; the consent record is the same shape and key as web and is mirrored server-side.

**Measurable success criteria:**
- [ ] Fresh install, consent sheet dismissed with **Necessary only** → network capture over sign-in + one full exam shows **0** PostHog and **0** Sentry ingest requests.
- [ ] **Accept all** → within **≤ 5 s** the first `$screen`/`Application Opened` event appears in PostHog Live Events and a forced test crash appears in Sentry.
- [ ] Toggle analytics **off** in Settings → next 60 s of usage produces **0** new PostHog/Sentry requests; `posthog.reset()` confirmed by the next opt-in generating a **new** anonymous id (no carry-over).
- [ ] Consent payload written to `heydpe_consent` is byte-shape-identical to the web `ConsentPreferences` (`CookieConsent.tsx:6-10`): keys `analytics, marketing, timestamp` only.
- [ ] `POST /api/consent` is called on every choice with `{ kind:'cookie', choices }` (verify server log / `consent` table row).

---

## 4. Identity model — one person across web, iOS, Android, and server

**The funnel only works if a user's web events, mobile events, and server events share one `distinct_id`.** The server already keys every event on the Supabase `user.id` (`captureServerEvent(user.id, …)` everywhere — `exam/route.ts:922`, `session/route.ts:69`, `webhook/route.ts:219`). Therefore:

- **`identify` with the Supabase `user.id`** (the exact same string the server uses) immediately after a successful sign-in (Apple/Google/Email OTP — doc on screens §1) and on every app launch where a session is restored. `person_profiles:'identified_only'` means anonymous pre-login events are not retained as profiles, matching web (`PostHogProvider.tsx:28`).
- **Super properties** (`posthog.register`) set once per session, attached to every event for slice-and-dice without bloating each call site:
  - `platform: 'ios' | 'android'`, `app_version` (`expo-application` nativeApplicationVersion), `build_number`, `runtime_version` (EAS fingerprint), `client: 'mobile'` (distinguish from web `client` absent), `tier_band: 'Trial' | 'Paid' | 'Tester'` (display-only, from `tier-labels.ts:28-39` — **never** the raw enum), `theme`, `rating` (preferred), `device_model`/`os_version` (coarse, from `expo-device`).
  - `client:'mobile'` is the load-bearing super-prop: it lets every dashboard split web vs mobile and lets us prove mobile parity without renaming a single event.
- **`reset()` on sign-out.** Sign-out lives in the layout, not Settings (screens brief §"layout"); the mobile equivalent calls `posthog.reset()` so the next user is a fresh person and events don't bleed across accounts. Also call it on account switch.
- **Do NOT copy server-owned data into the analytics identity.** Tier/subscription truth lives in `user_profiles` (billing brief); the only tier we attach to events is the **display band** for segmentation, never as a gate.

> **OWNER DECISION — anonymous-id stitching across login.** PostHog can alias the pre-login anonymous id to the identified id (`posthog.alias` / automatic on `identify`). For a first-party funnel where signup precedes meaningful events this is usually desirable (it joins "opened app" → "signed up"). **Recommend: rely on the SDK's automatic anonymous→identified stitching on first `identify`, and do not manually `alias`.** Confirm.

**Qualitative "done":** a user who uses web and iOS appears as **one** PostHog person; server-emitted `exchange_completed` and client-emitted `voice_mode_toggled` for the same exam share a `distinct_id` and a `session_id`.

**Measurable success criteria:**
- [ ] After sign-in, `posthog.get_distinct_id()` on device == the Supabase `user.id` (string-exact) — assert in a debug build.
- [ ] A single exam produces a client `paywall_shown`/`voice_mode_toggled` and a server `exchange_completed` that **share both `distinct_id` and `session_id`** in PostHog (query the two events, join on `session_id` — 100% match).
- [ ] Sign-out → next anonymous event has a **different** `distinct_id` than the prior user (0 cross-account leakage).
- [ ] Every client event carries super-props `platform`, `app_version`, `client:'mobile'`, `tier_band` (sample 20 events — 100% coverage).

---

## 5. EVENT PARITY TABLE — the contract

Every event the **web client** emits via `captureVoiceEvent` (`voice-telemetry.ts:35`) MUST be emitted by the **mobile client** at the equivalent native trigger, with the **same event name and the same core property keys**. Server-emitted events (`captureServerEvent`) are listed for completeness with **emitter = SERVER** — the mobile client must **not** re-fire them (the server already does, over the same API the mobile app calls). `getBrowserInfo()`'s `{browser,platform}` (`voice-telemetry.ts:12-30`) is replaced on mobile by the §4 super-props (`platform`, `device_model`, `os_version`).

Legend — **Emitter:** `CLIENT` = mobile must fire it; `SERVER` = already fired by API, mobile must NOT duplicate; `BOTH` = client fires intent, server fires outcome (distinct names).

| # | Event name (verbatim) | Emitter | Web call site (cite) | Mobile trigger point | Core properties |
|---|---|---|---|---|---|
| 1 | `voice_mode_toggled` | CLIENT | `practice/page.tsx:696` | Voice toggle flipped in SessionConfig sheet **and** the in-exam mic enable/disable | `enabled: boolean`, `at: 'session_config' \| 'in_exam'` |
| 2 | `exchange_completed` | SERVER | `exam/route.ts:922,1118` | Fired by `POST /api/exam respond` per Q&A — mobile must NOT emit | `session_id`, `element`, `streaming` |
| 3 | `assessment_scored` | SERVER | `exam/route.ts:923,1119` | Fired by `POST /api/exam respond` after grading — mobile must NOT emit | `session_id`, `score`, `element` |
| 4 | `session_resumed` | SERVER | `exam/route.ts:1265` | Fired by `POST /api/exam resume-current` — mobile must NOT emit | `session_id`, `element` |
| 5 | `quota_warning_shown` | CLIENT | `practice/page.tsx:557` | The "approaching trial limit" warning banner becomes visible in the practice screen | `session_id` |
| 6 | `paywall_shown` | CLIENT | `practice/page.tsx:735,856,864` | Upgrade modal opened from a 403 `trial_limit_reached`/`trial_expired`/`resubscribe_required` on `POST /api/session create`, or a 429 quota/daily-cap, or 403 `session_expired` mid-exam | `reason`, `session_id` |
| 7 | `upgrade_clicked` | CLIENT | `practice/page.tsx:2255,2798` | "Upgrade"/"Upgrade to Paid" tapped in the quota/paywall sheet (and the Settings → Plan upgrade CTA) | `source: 'quota_modal' \| 'settings_plan' \| 'pricing'` |
| 8 | `onboarding_completed` | CLIENT | `OnboardingWizard.tsx:113` | Final step of the 6-step OnboardingWizard completes (`POST /api/user/tier {onboardingCompleted:true}`) | `{}` (web sends empty; mobile MAY add `rating`, `voice_enabled` from wizard state) |
| 9 | `weak_area_drill_started` | SERVER | `exam/route.ts:529` | Fired by `POST /api/exam` when a `weak_areas` study-mode exam starts — mobile must NOT emit | `session_id`, mode props |
| 10 | `settings_voice_changed` | CLIENT | `settings/page.tsx:641` | Default voice-enabled toggle changed in Settings (`saveVoiceEnabled` → `POST /api/user/tier`) | `enabled: boolean` |
| 11 | `trial_blocked` | SERVER | `session/route.ts:69` | Fired by `POST /api/session create` 403 — mobile must NOT emit (it is the server-side mirror of the client's `paywall_shown`) | `reason` |
| 12 | `session_expired` | SERVER | `exam/route.ts:415` (returned), event id in funnel | Mid-exam trial expiry returned by `POST /api/exam respond`; mobile maps the 403 to `paywall_shown{reason:'session_expired'}` (client) — server logs the expiry | (server) reason |
| 13 | `checkout_completed` | SERVER | `webhook/route.ts:219` | Stripe webhook (web/Android-link purchase) — mobile must NOT emit; the **IAP** equivalent is row #16 | `plan`, `amount`, `currency`, `subscription_id`, `is_trial` |
| 14 | `exam_session_started` | SERVER | `exam/route.ts:717` | Fired by `POST /api/exam start` — mobile must NOT emit | session/config props |
| 15 | `account_deleted` | SERVER | `user/delete/route.ts:84` | Fired by `POST /api/user/delete` — mobile must NOT emit; mobile triggers the route from Settings → Your data | `had_subscription` |

### 5a. Mobile-NEW events (no web equivalent — additive, must not collide with web names)

These are emitted by the mobile **client** for surfaces web doesn't have. They extend the funnel without renaming anything.

| # | Event name | Trigger point | Core properties | Why |
|---|---|---|---|---|
| 16 | `iap_purchase_initiated` | RevenueCat `purchasePackage` invoked from the native paywall (Apple Guideline 3.1.1 IAP path) | `package_id`, `plan`, `source` | Client half of the IAP funnel; the entitlement-grant outcome is a SERVER event (§5b) |
| 17 | `iap_purchase_completed` | RevenueCat `purchasePackage` resolves with a non-null entitlement | `product_id`, `plan`, `price`, `currency` | Mirrors `checkout_completed` for the IAP path; lets one funnel count Stripe+IAP conversions |
| 18 | `iap_purchase_cancelled` | RevenueCat throws `userCancelled` | `package_id` | Funnel drop-off diagnosis on iOS |
| 19 | `iap_restore_completed` | "Restore purchases" returns active entitlements (required by Apple Guideline 3.1.1) | `restored: boolean`, `count` | Store-required restore path observability |
| 20 | `signin_started` | An auth method tapped on the Login sheet (`apple`/`google`/`email_otp`) | `method` | Auth funnel top (web has no explicit start event; additive) |
| 21 | `signin_succeeded` | Supabase session established (post-`signInWithIdToken`/`verifyOtp`) — fire `identify` here | `method` | Auth funnel; the point `identify` runs (§4) |
| 22 | `signin_failed` | Auth error surfaced to the user | `method`, `code` (no PII) | Auth reliability |
| 23 | `screen_viewed` | Every `expo-router` route focus (manual `$screen`) | `screen_name` (route group, not params) | Replaces web `$pageview` (`PostHogProvider.tsx:44`) |
| 24 | `permission_prompted` / `permission_result` | OS mic permission requested / answered (voice path) | `permission:'microphone'`, `status` | Voice-funnel + data-safety alignment (§11) |
| 25 | `app_review_prompted` | `StoreReview` requested (if added) | `trigger` | Store-rating UX (optional) |

### 5b. IAP entitlement (SERVER) — the RevenueCat→`user_profiles` merge

Per the billing brief, the IAP merge converges on the same single truth as Stripe (`user_profiles.tier='dpe_live'` + `invalidateTierCache(userId)`). The **RevenueCat webhook handler** (new, task M4) must emit a server event mirroring `checkout_completed`:

| Event name | Emitter | Trigger | Core properties |
|---|---|---|---|
| `iap_entitlement_granted` | SERVER (RevenueCat webhook) | Entitlement activated → `tier='dpe_live'`, idempotent via a `subscription_events`-style row (billing brief "RevenueCat IAP merge notes") | `product_id`, `plan`, `store:'app_store' \| 'play_store'`, `is_trial` |
| `iap_entitlement_revoked` | SERVER (RevenueCat webhook) | Expiry/refund/billing-issue downgrade to `checkride_prep` | `product_id`, `reason` |

> **OWNER DECISION — single conversion funnel vs. per-channel.** To count "free → paid" once across Stripe and IAP, define a PostHog **conversion = `checkout_completed` OR `iap_entitlement_granted`** (server, deduped per user by the entitlement merge). Recommend a single conversion step keyed on either event with a `store` breakdown. Confirm the funnel definition so dashboards (§7) are built once.

**Qualitative "done":** the mobile client fires **every CLIENT-row** event at the cited trigger with the cited property keys; it fires **none** of the SERVER-row events; the additive rows 16–25 are namespaced so they never collide with a future web event.

**Measurable success criteria:**
- [ ] **Event coverage = 100% of the CLIENT rows (1, 5, 6, 7, 8, 10) + 100% of mobile-NEW rows (16–24).** A scripted Maestro/Detox smoke flow (sign in → onboarding → start exam → hit trial limit → open paywall → tap upgrade → toggle voice in settings) produces **every** CLIENT/NEW event exactly once in PostHog Live Events — a parity checklist with one checkbox per row, all green.
- [ ] **0 duplicate SERVER events from the client:** over the same smoke flow, PostHog shows exactly **one** emitter for each of `exchange_completed`, `assessment_scored`, `session_resumed`, `trial_blocked`, `exam_session_started` (the server), and **0** client-originated copies (filter by super-prop `client:'mobile'` → those names return 0).
- [ ] **Property-shape parity:** for each CLIENT row, the property keys captured on mobile == the web keys at the cited line (e.g. `voice_mode_toggled` has `{enabled, at}`; `paywall_shown` has `{reason, session_id}`) — diff is empty.
- [ ] **Name-collision guard:** a CI unit test in `packages/shared` asserts the mobile event-name constant set ∩ web event-name set agrees on the 6 shared names and that rows 16–25 are NOT present in the web set.

---

## 6. Screen / navigation instrumentation

Web captures `$pageview` manually on route change (`PostHogProvider.tsx:37-45`). Mobile mirrors with a manual `$screen`/`screen_viewed` on each `expo-router` route focus.

- **One hook in the root `_layout.tsx`** subscribes to the navigation state and fires `posthog.screen(routeName)` on focus, using the **route group name** (`(tabs)/practice`, `(tabs)/progress`, `settings`, `upgrade`, `login`) — never raw params (no `?tasks=PA.I.B`, no tokens) to avoid leaking content into event names.
- The **7 core screens** (02-DESIGN-SYSTEM.md §6.1/§6.5: Home, Practice, Progress, Settings, Login/Signup, Onboarding, Upgrade/Paywall) map to 7 stable `screen_name`s: `login`, `practice`, `home`, `progress`, `settings`, `upgrade`, `onboarding`. Here `upgrade` is the **in-app paywall sheet** (`upgrade.tsx`, `presentation:'formSheet'`) — NOT the public "pricing" marketing page. The web public `/pricing` page is a separate surface; if it is ever wrapped in a webview or linked in-app, instrument it as its own `screen_viewed{screen_name:'pricing'}`, distinct from the 7-screen set above.

**Qualitative "done":** each of the 7 core screens emits a stable, param-free `$screen` on focus; the `upgrade` paywall sheet and the session-config sheet emit their own `$screen` so funnels can use screen steps.

**Measurable success criteria:**
- [ ] Navigating through all 7 core screens produces 7 distinct `$screen` events with `screen_name ∈ {login,practice,home,progress,settings,upgrade,onboarding}` — exact set match, no param strings present (regex-assert no `?`, no task ids, no tokens in any `screen_name`).
- [ ] Re-focusing a tab fires exactly one `$screen` (no double-fire on the New-Arch focus event) — count == tab switches.

---

## 7. Targets, funnels & dashboards (measurable program)

### 7.1 Crash-free targets (Sentry release health)

- **Crash-free SESSIONS ≥ 99.5%** (rolling 7-day, production) — the headline gate from the task.
- **Crash-free USERS ≥ 99.8%** (rolling 7-day) — a user can survive a session crash; this is the stricter human metric.
- **ANR / app-hang rate < 0.5%** of sessions (Android ANR + iOS watchdog hangs).
- **Cold-start TTID (time-to-initial-display) p90 < 2.0 s**, **TTFD (time-to-full-display, first interactive screen) p90 < 3.5 s** on a mid-tier device (measured via Sentry RN app-start + TTID/TTFD spans).
- These are **release-gated**: an EAS `production` build is not promoted from TestFlight/internal track to public if its crash-free-sessions over the internal cohort is < 99.5% (§9).

### 7.2 Required PostHog funnels (built once, web+mobile, split by `client`)

| Funnel | Steps (events) | Purpose | Pass bar |
|---|---|---|---|
| **Activation** | `screen_viewed{login}` → `signin_succeeded` → `onboarding_completed` → `exam_session_started`(server) → first `exchange_completed`(server) | New-user activation | Track step-conversion; alert if mobile step-1→2 < web by > 10 pts |
| **Conversion (free→paid)** | `paywall_shown` → `upgrade_clicked` → (`checkout_completed` OR `iap_entitlement_granted`)(server) | Monetization, Stripe+IAP unified (§5b OWNER DECISION) | Report mobile vs web conversion; no hard bar v1 (baseline) |
| **IAP purchase** | `iap_purchase_initiated` → `iap_purchase_completed` → `iap_entitlement_granted`(server) | IAP reliability + leakage detection | `initiated`→`granted` ≥ 90% (the rest are cancels/restores) |
| **Exam engagement** | `exam_session_started`(server) → `exchange_completed`(server) ×N → exam graded | Depth of use | Median exchanges/session reported per platform |
| **Voice adoption** | `voice_mode_toggled{enabled:true}` → first TTS playback (voice telemetry, doc 03) | Voice feature uptake | Reported; ties to doc-03 voice KPIs |

### 7.3 Required dashboards

- **Mobile Health** (Sentry): crash-free sessions/users, top issues by `release`, ANR rate, app-start p90 — one tile per §7.1 metric with the threshold drawn as a goal line.
- **Mobile Funnels** (PostHog): the five §7.2 funnels, each split by `client:'mobile' vs web` and by `platform:'ios' vs 'android'`.
- **Parity Monitor** (PostHog): a table of the 6 shared CLIENT events with daily volume on web vs mobile; an event present on web with **0** mobile volume for 24 h is a parity regression alarm.
- **Release adoption** (Sentry/PostHog): % of active users on each `app_version`/`runtime_version` (EAS fingerprint) — confirms OTA vs binary update reach (Expo-stack §8).

**Qualitative "done":** all dashboards exist before the public launch, are populated by the TestFlight/internal cohort, and each headline number has a numeric goal line.

**Measurable success criteria:**
- [ ] Sentry **crash-free sessions ≥ 99.5%** and **crash-free users ≥ 99.8%** over the final 7-day internal-testing window before public release — both green or release is held.
- [ ] All 5 funnels exist in PostHog and return non-zero data for `client:'mobile'` from the internal cohort.
- [ ] Parity Monitor shows all 6 shared CLIENT events with **> 0** mobile volume in the 7-day pre-launch window (0-volume = blocking parity bug).
- [ ] Cold-start TTID p90 **< 2.0 s** and TTFD p90 **< 3.5 s** measured on a mid-tier device over ≥ 50 launches.
- [ ] Release-health alert configured: Slack/email page if crash-free sessions drops below 99.5% on any production release (verify by firing a synthetic crash burst in staging).

---

## 8. PII, scrubbing & data minimization (engineering rules)

The web telemetry is already PII-disciplined: `captureVoiceEvent` "No transcript text, tokens, or sensitive payloads are ever included" (`voice-telemetry.ts:6-7`) and Sentry runs `sendDefaultPii:false` (`sentry.server.config.ts:8`). Mobile inherits these as hard rules.

- **Never in any event property or Sentry payload:** exam answer text, examiner question text, OTP codes, JWTs/tokens, Supabase access/refresh tokens, email addresses, Stripe/RevenueCat raw payloads, home airport / tail number / aircraft type free-text (PII-ish), avatar image bytes.
- **Allowed identifiers:** Supabase `user.id` (as `distinct_id` only), `session_id` (opaque uuid), ACS `element`/task codes (these are reference-data codes, not user content — and they are the FLIGHT DECK caps-mono readouts, doc 02), `score` (enum), `reason` (enum), `tier_band` (display label, not the enum).
- **Sentry `beforeSend`/`beforeBreadcrumb`:** strip any `extra`/breadcrumb whose key or value matches a denylist (`/token|jwt|email|answer|transcript|otp|password|bearer/i`); drop `console` breadcrumbs entirely on production (they can carry answer text logged during dev). Mirror web's "never send request bodies" (`sentry.server.config.ts:7`).
- **PostHog person deletion:** account deletion (`POST /api/user/delete`, `user/delete/route.ts:84`) must also call the PostHog **delete-person** API server-side for that `distinct_id`, so an erasure request purges analytics too (GDPR/CCPA + App Store account-deletion requirement). Add this to the delete route's server-side fan-out alongside the existing `flushPostHog()`.
- **Coarse device data only:** `device_model`/`os_version` from `expo-device` are coarse (e.g. "iPhone15,3", "iOS 18.2"), not a fingerprint; no IDFV is sent as a stable cross-app id.

**Qualitative "done":** a security reviewer reading any 100 sampled events + any 20 Sentry issues finds zero user content, zero credentials, zero emails.

**Measurable success criteria:**
- [ ] **0** events in a 1,000-event sample contain a string matching `/eyJ|@|sk_|otp|answer|transcript/` in any property value (automated scan of a PostHog export).
- [ ] **0** Sentry issues in a 50-issue sample contain a request body, email, or token (manual + regex audit).
- [ ] Account deletion triggers a PostHog person-delete call (assert the server log / PostHog API 200) and the person no longer resolves in PostHog within the platform's deletion SLA.
- [ ] `beforeSend` unit test: a synthetic exception carrying `extra:{token, email, answer}` is scrubbed to empty for those keys (test in `packages/shared` or apps/mobile).

---

## 9. Source maps, releases & EAS integration

Mobile crash reports are useless without symbolication. Wire Sentry into the EAS build.

- **Release & dist:** set Sentry `release` = `${bundleId}@${appVersion}+${buildNumber}` and `dist` = `buildNumber`, derived from `expo-application`, so release health groups correctly.
- **Source-map / symbol upload at build time** via the `@sentry/react-native/expo` plugin + the Sentry EAS build hook: upload Hermes JS source maps, iOS **dSYMs**, and Android **Proguard/R8 mappings** automatically on every `preview`/`production` EAS build. Gate on `SENTRY_AUTH_TOKEN` in EAS secrets.
- **OTA awareness (Expo-stack §8):** because EAS Update can ship JS-only changes under one binary, the Sentry `release` must encode the **update id** (or the EAS fingerprint `runtime_version`) so a crash is attributed to the exact JS bundle running, not just the store binary. Use `Updates.updateId`/`Updates.runtimeVersion` in the release string when an OTA is active.
- **PostHog release context:** register `app_version`, `build_number`, `runtime_version`, and (if OTA) `update_id` as super-props (§4) so funnels can be filtered to a release and a bad OTA can be spotted in product metrics, not just crashes.

**Qualitative "done":** every crash in Sentry is fully symbolicated (readable JS + native frames) and attributed to a specific `release`+`dist`(+`update_id`); no "missing dSYM"/"missing source map" warnings on production issues.

**Measurable success criteria:**
- [ ] A forced production crash shows **fully symbolicated** JS and native stack frames in Sentry (0 raw addresses, 0 minified frames).
- [ ] Sentry "Debug Files" shows dSYMs + Proguard mappings uploaded for the production build (present, not missing).
- [ ] Triggering a crash on an OTA-updated binary attributes it to the OTA `update_id`/`runtime_version`, distinguishable from the base binary's crashes.
- [ ] Release-health "adoption" populates for each shipped `release` within 24 h of distribution.

---

## 10. In-app diagnostics surface (the only telemetry with UI)

The web Settings page has a collapsible Voice Diagnostics panel (settings brief §6, `settings/page.tsx:1498`). Mobile keeps an equivalent **Diagnostics** row under Settings, plus a hidden long-press developer panel.

- **User-facing Diagnostics (Settings):** mic test, STT test, TTS preview (doc 03), and a single status annunciator. FLIGHT DECK typography applies **only** to the annunciator label and readouts: `// DIAGNOSTICS`, `STT OK` / `TTS OK` / `ANALYTICS ON` status annunciators in caps-mono with the appropriate `glow` (green ok / amber warn / red error per doc 02), and numeric readouts (last STT latency ms, TTS first-byte ms) in mono. All explanatory body copy is sentence-case IBM Plex. Touch targets ≥ 44 pt iOS / 48 dp Android.
- **Developer panel (long-press the build number, debug builds only):** shows current `distinct_id`, consent state, last 20 captured event names (NOT properties), Sentry session status, release/runtime ids. Never ships enabled in production.

**Qualitative "done":** a support agent can ask a user to open Diagnostics and read back STT/TTS/analytics status without exposing any PII; the panel obeys the typography rule (caps-mono+glow for annunciators/readouts only).

**Measurable success criteria:**
- [ ] Diagnostics annunciators render in caps-mono with correct glow color for each state (snapshot test: 3 states × {STT,TTS,ANALYTICS}); no text below 11 px; tap targets ≥ 44 pt/48 dp (layout assertion).
- [ ] Developer panel is **absent** from a `production` build (assert the component tree / `__DEV__` gate).
- [ ] The user-facing panel never renders an event property value (only event names) — code review + UI snapshot.

---

## 11. Store data-safety declarations (Apple App Privacy + Google Data safety)

The declarations MUST match exactly what §1–§10 actually collect. Misdeclaration is an App Store/Play rejection and a trust violation.

### 11.1 Apple — App Privacy "Nutrition Label" (App Store Connect)

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| **Identifiers — User ID** (Supabase user.id as `distinct_id`) | Yes | Linked | **No** | App Functionality, Analytics |
| **Usage Data — Product Interaction** (the parity-table events, `$screen`) | Yes | Linked | **No** | Analytics, App Functionality |
| **Diagnostics — Crash Data** (Sentry crashes) | Yes | Linked (to user.id) | **No** | App Functionality (diagnostics) |
| **Diagnostics — Performance Data** (Sentry traces, app-start) | Yes | Linked | **No** | App Functionality |
| **Purchases** (IAP plan/price via RevenueCat) | Yes | Linked | **No** | App Functionality, Analytics |
| **Contact Info — Email** | **Not collected by telemetry** (auth only, not sent to analytics) | — | — | — |
| **Audio data / voice content** | **Not collected by telemetry** (audio is streamed to STT for transcription per doc 03, never stored in analytics) | — | — | — |
| **App Tracking Transparency answer** | **"No, this app does not track you"** (v1, per §2 OWNER DECISION) | — | No | — |

### 11.2 Google Play — Data safety form

- **Data collected:** App activity (product interactions / screen views), App info & performance (crash logs, diagnostics, performance), Device/other IDs (our first-party user id), Purchase history (IAP). **Email NOT shared with analytics.** **Audio NOT collected by analytics.**
- **Data shared with third parties:** declared as **processors only** (PostHog, Sentry, RevenueCat act on our behalf, not as independent controllers selling data) — choose "Data is processed by a service provider," not "Data is shared/sold."
- **Encryption in transit:** Yes (TLS to `i.posthog.com`, Sentry ingest, RevenueCat).
- **User can request deletion:** Yes — Settings → Your data → Delete account (`POST /api/user/delete`) which now also purges the PostHog person (§8). Provide the account-deletion URL Google requires.
- **Collection optional / consent-gated:** mark analytics+diagnostics as **not required** (gated by the consent sheet §3 — users who choose "Necessary only" send nothing).

### 11.3 Cross-store consistency rules (the binding constraint)

- The declarations must enumerate **only** the data §1–§10 actually emit. If a future SDK (session replay, IDFA attribution) is added, the declaration **and** the consent copy **and** the ATT answer all change together — they are one artifact.
- **"Linked to identity = Yes"** is correct because we `identify` to `user.id` (§4). **"Used for tracking = No"** is correct because we send no IDFA and share with no ad network (§2).

> **VERIFY-AT-SUBMISSION:** (1) Apple App Privacy categories and the ATT-required threshold (Guideline 5.1.1 / "tracking" definition) can change — re-read at submission. (2) Google Data safety taxonomy is periodically revised. (3) If the OWNER overrides §2 to ship ATT or §1.2 to ship Sentry replay, every table above must be updated in lockstep. (4) Confirm RevenueCat/PostHog/Sentry are listed as **processors** under the current store definitions.

**Qualitative "done":** the Apple and Google forms are a faithful, minimal, current description of exactly what the app collects; "Necessary only" users are provably excluded from collection; the three knobs (declaration / consent copy / ATT answer) are mutually consistent.

**Measurable success criteria:**
- [ ] A line-by-line audit maps **every** declared data type to a concrete code path in §1–§10, and **every** code path that leaves the device to a declared type — 0 unmatched on either side.
- [ ] A "Necessary only" install produces **0** analytics/diagnostics network egress (re-uses §3 criterion) — proving the "collection optional" declaration is truthful.
- [ ] Apple ATT answer == "Does not track" AND bundle contains no IDFA symbol (§2 criterion) — consistent pair.
- [ ] Account-deletion URL is live and the deletion path purges PostHog + Sentry identity (§8 criterion).
- [ ] Both store forms are submitted and pass review with **0** privacy/data-safety rejections.

---

## 12. Build order & cross-doc dependencies

Steps 1–4 are **M2 exit criteria** (events fire from the M2 screens, voice-off/type-only — SHARED #7); step 6 is **M4**; steps 5, 7, 8 land across **M5/M6** and gate the M6/M7 submission.

1. **[M2] packages/shared/analytics/events.ts** — event-name constants + property TypeScript types, the single source of truth shared web↔mobile (name-collision CI test §5). Refactor web `captureVoiceEvent` call sites to import these constants in the same PR (no behavior change, just centralization).
2. **[M2] Consent sheet + gate (§3)** before either SDK initializes — opt-out default is the safety net.
3. **[M2] PostHog RN init + identify + super-props (§1, §4)** — verify single-person stitching with server events.
4. **[M2] Parity-table client emitters (§5)** at the native trigger points (depends on the M2 screens being built — screens brief; mic-priming/voice rows light up only after the M3 spike GO — SHARED #10).
5. **[M5] Sentry RN + EAS source-map upload (§1, §9)** — needed before any TestFlight/internal build is trusted.
6. **[M4] IAP events (§5a/§5b)** — depends on the RevenueCat merge (task M4) and the billing brief.
7. **[M5/M6] Dashboards + funnels + release-health alerts (§7)** — built against the internal cohort before public launch; crash-free proof is an M6 gate.
8. **[M6] Store declarations (§11)** — finalized at the M6 submission gate, after §1–§10 are frozen.

**Cross-doc dependencies:** doc 01 (Bearer transport, server event surface — do NOT duplicate), doc 02 (FLIGHT DECK typography for §10 annunciators), doc 03 (voice telemetry latency readouts feed the Diagnostics panel + Voice-adoption funnel), billing brief / M4 (IAP entitlement events §5b).

**Open proof gate:** telemetry is "done" only when the **§5 parity smoke flow** (Maestro/Detox) is green on a **physical iOS and a physical Android device**, the §7 dashboards show non-zero mobile data, and crash-free sessions ≥ 99.5% over the final internal-testing week.
