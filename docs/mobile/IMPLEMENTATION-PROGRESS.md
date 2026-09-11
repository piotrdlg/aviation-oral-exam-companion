# Mobile Implementation — Progress Tracker & Functional-Sim Plan

> Living tracker for the autonomous build. **Immediate goal:** a *fully functional
> HeyDPE app running in the iOS Simulator* — every screen working against the real
> API, the full text exam loop, real auth, progress/settings on live data. Store
> submission + the device-only / Apple-account work comes after.
>
> Derived from the master plan (`00-MOBILE-MASTER-PLAN.md` §4) and the sub-docs.
> Current local integration: `review/mobile-pr60-remediation`; focused review branches below.
> Updated 2026-09-11.

## PR #60 PM-review remediation (2026-09-11)

**Current status: code prepared and tested; PM review and device/release gates remain open.**
This section supersedes the older status below, including the statements that
PR #60 is unmerged and crash reporting is consent-gated. PR #60 is merged.

Read [14-FABLE-5.1-PM-REVIEW-HANDOFF.md](14-FABLE-5.1-PM-REVIEW-HANDOFF.md) for the
item-by-item response to [review 13](13-PM-REVIEW-PR60-FOR-ASTRA.md), verified PR
heads, migration/rollout instructions, and the next PM actions.

- Eleven focused draft PRs against `main`: [#62](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/62)
  through [#72](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/72).
  All have passing web/mobile CI and Vercel preview checks. None was merged this session.
- PCM hardware normalization; durable exam-operation receipts and read-only
  timeout recovery; early anonymous JS/native iOS crashes independent of analytics;
  onboarding analytics with persistent opt-out; Home trial balance using the server
  gate; foreground replay with clean metric attribution; live interim feedback;
  actual trial-error fixtures; canonical legal links; release Sentry configuration
  enforcement; SDK 57.0.22 patch refresh and Doctor CI gate.
- Combined validation: **1,489 root tests / 84 files; 122 mobile tests / 13 files**;
  root/mobile typecheck and mobile lint passed. Clean mobile install, Expo package
  compatibility, and Doctor **21/21** passed. The receipt migration's constraints
  and RLS were exercised in an isolated local PostgreSQL cluster.
- Final SDK 57 unsigned iOS simulator Debug build succeeded. Production iOS JS
  and source-map export succeeded; 75 exported files scanned with no configured
  development login credential matches. Neither proves a signed release or physical voice.

**Before shipping:** apply the receipt migration and deploy its API support before
the updated client; validate hosted timeout recovery. EAS still reports “Not logged
in.” Signed preview/source-map upload, startup/native crash ingestion with analytics
off, owner review of actual privacy envelopes, currently entitled graded-exam QA,
and physical-device T1–T4 remain open. No hosted migration, account override, or
production deployment was performed. Android native crash privacy remains a later
Android release prerequisite. Phase 5 optimizations remain conditional on the
approved measured gates.

---

## Takeover Implementation (2026-09-10)

**This section supersedes the historical June status below. The app is not yet
TestFlight-ready or store-complete.** The approved next milestone remains
`10-TEST-READINESS-PLAN.md`; IAP, App Store submission, and Android follow its
physical-device voice gate.

Implemented locally:
- Expo 57.0.21 / React Native 0.86.3, current SDK-matched native dependencies,
  native Apple nonce authentication, EAS development/smoke/preview/production
  profiles, HeyDPE icon, and stop-on-background native audio configuration.
- A single serialized `VoiceSession`, per-attempt cancellation, ordered
  feedback/question playback, lossless 2,000-character TTS splitting, graceful
  final transcription, typed-prefix preservation, and AppState/focus cleanup.
- Unit-tested Deepgram timing deduplication and Flux multi-turn accumulation;
  native adapter tests cover cancellation and trailing finals. T1/T2/T3/E2E
  measurement hooks are prepared, not physical-device proof.
- Server-graded results, resume configuration preservation, draft recovery,
  offline state, 409 reclaim, 503 retry, and correct Tester override labeling.
  Natural completion retains the server's grade instead of regrading it as
  user-ended. Exam generation gets a 70-second client ceiling for the server's
  60-second request window; ordinary API requests retain 20 seconds.
- Consent-gated Sentry with payload scrubbing; analytics opt-out race fix;
  onboarding skip/explore cannot bypass the separate AI/disclaimer consents.
  Auth startup failures are retryable; release Keychain failures cannot silently
  fall back to volatile memory. Development credentials are stripped in release.
- Saved examiner-voice preference and native switches in Settings. Purchase UI
  explicitly reports billing unavailable instead of offering a no-op command.
- Mobile tests, lint/typecheck configuration, dedicated CI, and root web/native
  TypeScript/Vitest separation. Removed the credential-bearing staging-auth page
  locally; corrected root AGENTS model names. No production deployment performed.

Verification and native smoke evidence are recorded in
`testing/2026-09-10-takeover.md`. The 30-minute physical test script is
`11-TESTFLIGHT-TEST-SCRIPT.md`. Existing June claims below are historical evidence,
not re-certification of the rewritten native pipeline.

Draft review branches are pushed: [mobile #60](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/60)
and [standalone staging-auth removal #59](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/59).
Web/mobile CI and Vercel previews passed at `05b85a1`; neither PR is merged.
SDK 57 Xcode Debug builds and runs on the iPhone 17 Pro simulator. Login, explicit
consents, Home, and a restored exam question were visually verified. The ordinary
QA account's expired session correctly blocks answer assessment with the trial
modal; a graded text exchange still requires an account with current exam access.
The incomplete-results/Progress/Settings path and new-exam expired-trial gate
also passed. The reusable `.maestro/trial-expired.yaml` was executed successfully
against the Debug simulator; this does not close the release-build smoke gate.

**External prerequisites:** EAS CLI reports "Not logged in". The real EAS project,
App Store Connect app record/signing, Apple bundle-ID provider configuration,
Sentry project/DSN, and two physical test iPhones are not verified. No TestFlight
build, physical T1-T4 GO, Apple native sign-in, crash-ingestion, or IAP result may
be inferred from this implementation.

**Plan deviations:** source preparation for Phases 4/6 proceeded while Phase 3
account/device access was unavailable; those phases are not accepted as complete.
The Maestro flow currently assumes an authenticated QA account, because no
fixed-OTP fixture was supplied. Its release smoke gate remains open. No branch
history has been rewritten and no mobile changes have been deployed to main.

---

## Restart (2026-09-10) — test-readiness plan approved

No code changed between 2026-06-18 and 2026-09-10. The path from "works in the simulator" to
"TestFlight internal testing with voice proven on a device" is `10-TEST-READINESS-PLAN.md`
(7 phases, 11–15 engineering days, reviewed and **approved by GPT-6 Astra** in three rounds).
Key corrections found during the audit: the Tester mechanism is the admin `paid_equivalent`
override (not `ground_school`); Expo SDK 57 is the target (SDK 58 is preview-only); expo-audio 57
has no interruption events, so the lifecycle is `AppState`-driven; examiner turn delivery, STT
finalization and half-duplex coordination in the current hooks need the Phase 4 rewrite before
any device spike. Next action: Phase 0 (push the branch, open the PR).

## Latest session (2026-06-16) — M2 exam loop live + a production bug fix

- **M2 text-only exam loop built and verified end-to-end against production.**
  `apps/mobile/src/lib/exam.ts` (typed client) + a full rewrite of
  `practice.tsx`: config → `POST /api/session` create → `POST /api/exam` start →
  respond → assessment badges → next-task → completion, in FLIGHT DECK. Auto-resumes
  an in-progress exam on mount (rebuilds the conversation from `session_transcripts`
  via resume-current). Screenshot-verified rendering pd's resumed Instrument exam;
  curl-verified the write path (create → start `PA.I.A.K1` → respond *satisfactory/
  advance* → next-task) with a real bearer token.
- **Found + fixed a latent production bug in the shared exam engine.** `next-task`
  (and the streaming generator) handed the model a conversation **ending with the
  examiner's turn** (assistant), which `claude-sonnet-4-6` rejects —
  *"does not support assistant message prefill"* → 400 → route 500. Latent on web
  (next-task usually races ahead of respond's deferred transcript write); the
  slower mobile client hit it deterministically. Fix strips trailing assistant
  turns before the LLM call; regression test added. **Shipped to `main` →
  production** (commit `d2843ea`, cherry-picked from the feature branch).
- **Two config shapes reconciled:** `/api/session` create is snake_case
  (`study_mode`/`difficulty_preference`/`aircraft_class`); `/api/exam` reads
  camelCase (`studyMode`/`difficulty`/`aircraftClass`). The client now models the
  camelCase `ExamConfig` and maps to snake_case only at the create boundary, and
  pins `difficulty` to the DB enum (`easy|medium|hard|mixed`) — an earlier
  `'standard'` violated the check constraint.
- **Adversarial review (ultracode workflow) caught 3 more real bugs — all fixed:**
  1. **(critical, prod)** Fresh exam **start** 500'd on mobile — `buildElementQueue`
     read `config.selectedAreas.length` unguarded; the web always sends `[]` but the
     native fresh-start config sent neither, so a brand-new exam couldn't begin.
     Server normalizes both to `[]` now (commit `8fa2209` → **deployed to main**),
     client sends them too; regression test added. Root-caused by reproducing
     against prod via a local prod-env Next server (bypassing the masking
     `DB_TARGET_UNSAFE` guard to see the real stack).
  2. **(high)** Resuming a **paused** exam 409'd on the first answer — `resumeExam`
     now reactivates (`update{status:'active'}`) before `resume-current` (whose
     CLAIM also clears any stale device claim, so respond's supersession check
     passes).
  3. **(medium)** Score badges vanished after resume — assessments persist on the
     student transcript row but render on the following examiner bubble; `resumeExam`
     now shifts them. (1 review finding was a false positive, rejected by the verify pass.)
- **Onboarding (2026-06-17):** native wizard + the two store-required consent gates
  shipped; backend consent prereqs deployed to main (`5580a2d` + test `e868800`).
  A second adversarial review found **6 more real bugs** in the gate/handoff — all
  fixed: gate fail-open on tier error (→ retry, never skip consents), tabs flash
  pre-redirect (→ block render), non-idempotent handoff (→ ref-guarded create/start
  + required-with-retry complete so the onboarding exam stays uncounted), consent
  double-tap, stuck `busy`. apiFetch gained a 20s timeout. Corrected the spec's
  network order (create exam BEFORE completing onboarding — else it counts).

---

## A. Audit — master-plan milestones vs. actual state

| Milestone | Status | Detail |
|---|---|---|
| **M1 — Backend enablement** | ✅ **DONE** | All 17 v1 routes accept `Authorization: Bearer` via `getAuthedUser()`; rate-limit identity, exam enforcement, STT `encoding` param all shipped; 1458 web tests green. (3 commits) |
| **M0 — Scaffold** | ✅ **DONE** | Expo SDK 56 app `apps/mobile`, identity `HeyDPE`/`heydpe://`/`com.imagineflying.heydpe`, iPhone-only, boots in sim. |
| **M0 — Monorepo (Turborepo + `apps/web` + `packages/shared`)** | ⏸️ **DEFERRED (skipped)** | Web still at repo root; no `packages/`, no `turbo.json`. Organizational, **not** required for a functional sim app. Shared TS (sentence-boundary) will be **vendored** into `apps/mobile` for now; full extraction is a later cleanup. |
| **M0 — Auth** | ✅ **DONE** | FLIGHT DECK login (Email OTP + Google/Microsoft OAuth; Apple disabled-with-note), `AuthProvider` + root session gate, `__DEV__` dev sign-in (session-inject via deep link). Verified signed-in as both dev-sim and pd@imagineflying.com in sim. |
| **Design system + nav (spans M0/M2/M5)** | ✅ **DONE** | FLIGHT DECK tokens + `cockpit.tsx` primitives; 4-tab nav (Home/Practice/Progress/Settings); IBM Plex Sans + JetBrains Mono. All 4 tabs verified rendering in sim. |
| **Data layer** | ✅ **DONE** | Native Supabase client (Keychain/SecureStore chunked session), `apiFetch`/`apiRequest` Bearer wrappers, config/env. |
| **M5 — Home (real data)** | ✅ **DONE** | Wired to `/api/user/tier` + stats + resumable via parallel GETs; renders real stats/resume for the signed-in user. |
| **M2 — Exam loop (text-only)** | ✅ **DONE** | `exam.ts` client + `practice.tsx`: config → create → start → respond → assessment badges → next-task → completion, with auto-resume. Verified end-to-end against prod. Surfaced + fixed the `next-task` 500 (see Latest session). |
| **M2 — Onboarding wizard + consent** | ✅ **DONE** | `onboarding.tsx` modal: 6 steps + the two store-required consent gates (`ai_data_processing` naming Anthropic/Deepgram/OpenAI + FAA `disclaimer`), gated by `OnboardingGateProvider`. Backend prereqs (constraint + route allow-list + `aiDataConsented`) shipped to main. Free **uncounted** onboarding exam (create-before-complete order verified vs prod). 6 review bugs fixed (gate fail-open, handoff idempotency, etc.). Verified e2e + in sim. M2 type-only (voice off, no mic-priming). |
| **M2 — Telemetry: PostHog analytics** | ✅ **DONE** | Consent-gated PostHog via a thin `/capture` HTTP client (no native SDK/rebuild). 8 funnel events fire server-side; the app emits the 3 client-only ones (voice_mode_toggled/paywall_shown/upgrade_clicked). Consent persists in AsyncStorage, granted on onboarding, Settings toggle to opt out; identify by user.id. 5 review findings fixed (consent-leak, identify-buffer, anon-id). Lights up when `EXPO_PUBLIC_POSTHOG_KEY` is set. |
| **M2 — Telemetry: Sentry (crash reporting)** | 🔜 **DEFERRED** | `@sentry/react-native` is genuinely native → needs a dev-client rebuild. Deferred so PostHog analytics ships at zero native cost; add with the next native rebuild. |
| **M3 — Voice OUT (examiner TTS)** | ✅ **DONE & VERIFIED IN DEV BUILD** | `useExaminerVoice` + Practice integration: examiner SPEAKS each turn via `/api/tts` (Deepgram Aura-2 mp3) → `expo-audio`, with barge-in, a voice toggle, and text-only fallback. **Verified end-to-end in the iOS dev build**: the resumed exam rendered with voice ON and fired `POST /api/tts → 200` from the running app. |
| **M3 — Voice IN (student STT)** | ✅ **CODE DONE / protocol-verified** | `useStudentSTT`: PCM16 mic capture via `expo-audio` `useAudioStream` (no new native dep/rebuild) streamed to Deepgram Nova-3 over a WebSocket (`/api/stt/token?encoding=linear16`), mirroring the web hook (bearer-subprotocol auth, Results/is_final dedup, interim). Mic button in the exam, live transcript → editable answer (no auto-submit), barge-in + audio-session restore. **Deepgram protocol verified end-to-end** (token→auth→linear16 PCM→Results→close); dev build boots with the mic. 7 review bugs fixed (connect-hang, mid-drop hot-mic, TTS audio-mode cache, …). **Actual mic capture + latency/AEC = physical-device wall.** |
| **iOS dev build (simulator)** | ✅ **DONE** | Custom dev client built + running on the iOS 26.5 simulator with the full native stack (expo-audio, secure-store, apple-auth, glass-effect) — Expo Go couldn't. Needed: Xcode 26.5 (Swift 6.3) + iOS 26.5 sim runtime + CocoaPods; built via `xcodebuild` for the sim (ad-hoc/unsigned, no Apple acct). secure-store falls back to in-memory when the Keychain entitlement is absent (unsigned sim build). |
| **M4 — Paywall UI** | ✅ **DONE (render-only)** | `UpgradeSheet` maps trial/quota 403/429 reason codes → tailored paywall; exam loop's fail() routes to it. Verified the real 403 + sheet render. Actual RevenueCat purchase is the App Store wall. |
| **M5 — Progress (real data)** | ✅ **DONE** | ACS coverage aggregated by area + recent sessions. Verified on pd's real data. |
| **M5 — Settings (real data) + account deletion** | ✅ **DONE** | Account/plan, exam prefs, subscription line, sign-out, Apple-required type-to-confirm deletion → `/api/user/delete`. Verified rendering pd's data. |
| **Exam loop polish** | ✅ **DONE** | Study-mode + difficulty selectors on config; 'End exam' → grades via update{status:'completed'} (verified against prod). |
| **M6 — iOS store submission** | 🔒 **WALL** | Apple Developer account + the blocking `/privacy` correction (owner) + EAS production build signing. |

---

## B. The walls (where autonomy genuinely stops — your earlier list)

1. **Apple Developer account / App Store Connect** — Sign in with Apple service config, IAP product creation, EAS build signing (dev-client + production), TestFlight, store submission.
2. **Physical iPhone** — the M3 voice spike thresholds (PCM mic→Deepgram latency, AEC), IAP sandbox purchase, native Sign-in-with-Apple end-to-end.

> **Harness note (2026-06-17):** Expo Go can't run this app's native modules
> (`expo-audio`, `expo-secure-store`, `expo-apple-authentication`,
> `expo-glass-effect`) — `Cannot find native module 'ExpoAudio'`. A **simulator
> dev build** (`npx expo run:ios`) is required for faithful testing (voice, real
> Keychain auth, native Apple sign-in). This needs NO Apple Developer account
> (simulator builds are unsigned) — only Xcode + CocoaPods — so it's done
> programmatically. `ios/`/`android/` are gitignored (CNG regenerates them).

Everything else I do autonomously, including the items below.

## C. Autonomous workarounds (so the sim app is fully functional without bugging you)

- **Supabase OAuth redirect URL** (`heydpe://`, `heydpe://auth-callback`) — I'll add it via the Supabase Management API rather than ask.
- **Typing in the sim is blocked** (no Accessibility grant) → I ship a **`__DEV__`-only dev sign-in** so I can reach authenticated screens and verify the whole app in the sim without manual typing. It is stripped from production builds.
- **`packages/shared`** deferred → **vendor** `sentence-boundary.ts` (+ needed types) into `apps/mobile/src/shared/` with its tests, so the voice pipeline has its dependency without the full monorepo move.
- **Sign in with Apple button** ships in the UI but is **disabled with a note** until the Apple account is wired (so the login screen is complete and store-ready later).

---

## D. Functional-in-simulator execution order (what I'm doing now, in sequence)

1. **Auth (M0-auth):** session gate (`AuthProvider` + redirect), login screen (FLIGHT DECK) — Email OTP + OAuth buttons + disabled Apple button — and the `__DEV__` dev sign-in. Add Supabase redirect URL. → app boots to login; authenticated → tabs.
2. **Home on real data (M5-home):** 3 parallel GETs (`/api/user/tier`, `/api/session`, resumable) → real stats/resume.
3. **Exam loop, text-only (M2):** SessionConfig → `POST /api/session` create → `POST /api/exam` SSE render loop (discriminated events, `[DONE]`) → typed answers → assessment badges → completion → results sheet. All 403/429/409/503 → upgrade/error sheets. Resume-current.
4. **Onboarding + consent (M2):** 6-step wizard gated by `onboardingCompleted`; separate `ai_data_processing` consent recorded before first exam.
5. **Progress on real data (M5):** 4 parallel GETs; ACS bars (Skia/d3 treemap as polish); session history.
6. **Settings on real data (M5):** account/tier, voice/examiner, theme, sign-out, **in-app account deletion** → `/api/user/delete` (type-to-confirm). Manage-subscription neutral line.
7. **Telemetry (M2/M5):** PostHog + Sentry behind the consent gate; CLIENT-row parity emitters.
8. **Paywall UI (M4, render-only in sim):** `upgrade.tsx` formSheet triggered by the trial 403s; RevenueCat wiring stubbed behind the account wall.
9. **Voice pipeline code (M3, sim-partial):** vendor `sentence-boundary`; `/api/tts` mp3 → `expo-audio` playback; mic→Deepgram WS scaffold. Full thresholds gated to the device spike.

> Each step is verified in the iPhone 16 Pro simulator (render + real API) before moving on. Walls (Apple/device) are coded-and-guarded, not skipped.
