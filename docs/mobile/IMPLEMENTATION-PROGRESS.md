# Mobile Implementation — Progress Tracker & Functional-Sim Plan

> Living tracker for the autonomous build. **Immediate goal:** a *fully functional
> HeyDPE app running in the iOS Simulator* — every screen working against the real
> API, the full text exam loop, real auth, progress/settings on live data. Store
> submission + the device-only / Apple-account work comes after.
>
> Derived from the master plan (`00-MOBILE-MASTER-PLAN.md` §4) and the sub-docs.
> Branch: `feat/mobile-m1-api-enablement` (one PR). Updated 2026-06-16.

---

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
| **M2 — Onboarding wizard + consent** | 🔜 **NOT STARTED** | Incl. the separate `ai_data_processing` consent. Sim-achievable. **NEXT.** |
| **M2 — Telemetry (PostHog/Sentry behind consent)** | 🔜 **NOT STARTED** | Sim-achievable. |
| **M3 — Voice pipeline** | 🔒 **WALL (partial)** | Code is buildable; the spike's hard latency/echo thresholds need **physical devices**. Sim can do TTS playback + basic mic. |
| **M4 — Paywall UI** | ✅ **DONE (render-only)** | `UpgradeSheet` maps trial/quota 403/429 reason codes → tailored paywall; exam loop's fail() routes to it. Verified the real 403 + sheet render. Actual RevenueCat purchase is the App Store wall. |
| **M5 — Progress (real data)** | ✅ **DONE** | ACS coverage aggregated by area + recent sessions. Verified on pd's real data. |
| **M5 — Settings (real data) + account deletion** | ✅ **DONE** | Account/plan, exam prefs, subscription line, sign-out, Apple-required type-to-confirm deletion → `/api/user/delete`. Verified rendering pd's data. |
| **Exam loop polish** | ✅ **DONE** | Study-mode + difficulty selectors on config; 'End exam' → grades via update{status:'completed'} (verified against prod). |
| **M6 — iOS store submission** | 🔒 **WALL** | Apple Developer account + the blocking `/privacy` correction (owner) + EAS production build signing. |

---

## B. The walls (where autonomy genuinely stops — your earlier list)

1. **Apple Developer account / App Store Connect** — Sign in with Apple service config, IAP product creation, EAS build signing (dev-client + production), TestFlight, store submission.
2. **Physical iPhone** — the M3 voice spike thresholds (PCM mic→Deepgram latency, AEC), IAP sandbox purchase, native Sign-in-with-Apple end-to-end.

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
