# Mobile Implementation — Progress Tracker & Functional-Sim Plan

> Living tracker for the autonomous build. **Immediate goal:** a *fully functional
> HeyDPE app running in the iOS Simulator* — every screen working against the real
> API, the full text exam loop, real auth, progress/settings on live data. Store
> submission + the device-only / Apple-account work comes after.
>
> Derived from the master plan (`00-MOBILE-MASTER-PLAN.md` §4) and the sub-docs.
> Branch: `feat/mobile-m1-api-enablement` (one PR). Updated 2026-06-16.

---

## A. Audit — master-plan milestones vs. actual state

| Milestone | Status | Detail |
|---|---|---|
| **M1 — Backend enablement** | ✅ **DONE** | All 17 v1 routes accept `Authorization: Bearer` via `getAuthedUser()`; rate-limit identity, exam enforcement, STT `encoding` param all shipped; 1458 web tests green. (3 commits) |
| **M0 — Scaffold** | ✅ **DONE** | Expo SDK 56 app `apps/mobile`, identity `HeyDPE`/`heydpe://`/`com.imagineflying.heydpe`, iPhone-only, boots in sim. |
| **M0 — Monorepo (Turborepo + `apps/web` + `packages/shared`)** | ⏸️ **DEFERRED (skipped)** | Web still at repo root; no `packages/`, no `turbo.json`. Organizational, **not** required for a functional sim app. Shared TS (sentence-boundary) will be **vendored** into `apps/mobile` for now; full extraction is a later cleanup. |
| **M0 — Auth** | 🔜 **NOT STARTED** | No login screen, no session gate. `src/lib/supabase.ts` client exists + `.env` wired with the real anon key, but nothing signs in yet. **NEXT.** |
| **Design system + nav (spans M0/M2/M5)** | ✅ **DONE** | FLIGHT DECK tokens + `cockpit.tsx` primitives; 4-tab nav (Home/Practice/Progress/Settings); IBM Plex Sans + JetBrains Mono. All 4 tabs verified rendering in sim. |
| **Data layer** | ✅ **DONE** | Native Supabase client (Keychain/SecureStore chunked session), `apiFetch`/`apiRequest` Bearer wrappers, config/env. |
| **M2 — Exam loop (text-only)** | 🔜 **NOT STARTED** | The core product. Screens are placeholder stubs (no `apiFetch` calls). Fully **sim-achievable**. |
| **M2 — Onboarding wizard + consent** | 🔜 **NOT STARTED** | Incl. the separate `ai_data_processing` consent. Sim-achievable. |
| **M2 — Telemetry (PostHog/Sentry behind consent)** | 🔜 **NOT STARTED** | Sim-achievable. |
| **M3 — Voice pipeline** | 🔒 **WALL (partial)** | Code is buildable; the spike's hard latency/echo thresholds need **physical devices**. Sim can do TTS playback + basic mic. |
| **M4 — Payments (RevenueCat IAP)** | 🔒 **WALL (partial)** | Paywall UI + server IAP backend buildable; actual purchase/restore needs **App Store Connect products + Apple account + sandbox device**. |
| **M5 — Progress / Settings / Home (real data) + polish** | 🔜 **NOT STARTED** | Fully **sim-achievable** once auth lands. Settings → in-app account deletion wired to `/api/user/delete`. |
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
