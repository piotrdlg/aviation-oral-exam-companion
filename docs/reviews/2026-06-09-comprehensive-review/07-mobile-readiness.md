# Review 07 — iOS/Android Mobile Readiness Assessment

> Date: 2026-06-09 · Reviewer: AI agent (code audit + platform policy research)
> Scope: API surface mobile-readiness, client logic inventory, store policies, framework recommendation

## API readiness table

**Core finding:** Every route authenticates the same way — `createClient()` from `src/lib/supabase/server.ts:4-28` (`@supabase/ssr` `createServerClient` reading **Next.js cookies only**), then `supabase.auth.getUser()`. **No route accepts `Authorization: Bearer`.** The fix is centralized: teach `server.ts` `createClient()` to detect a Bearer header and call `auth.getUser(jwt)` / attach the token as a global header — one file change unblocks ~90% of the surface. Secondary cookie assumptions: the rate-limiter parses the auth **cookie** for per-user identity (`src/middleware.ts:28-49`, IP fallback — mobile users share NAT IPs), and exam session enforcement calls `supabase.auth.getSession()` (`src/app/api/exam/route.ts:340-343`, hashes JWT `session_id` claim in `src/lib/session-enforcement.ts:19-24`).

| Route | Mobile needs it? | Cookie-coupled? | Required change |
|---|---|---|---|
| `POST/GET /api/exam` (start/respond/next-task/resume-current, SSE) | Yes — core | Yes (`route.ts:164,288`) + `getSession()` :340 | Bearer support in server.ts; SSE fine over native fetch |
| `POST/GET /api/session` | Yes — core | Yes (`route.ts:19,257`) | Bearer support only |
| `POST /api/tts` (mp3 bytes + `X-Audio-*` headers, `route.ts:136-145`) | Yes — core | Yes (`route.ts:24-27`) | Bearer; response trivially consumable natively |
| `GET /api/stt/token` (Deepgram ephemeral JWT + prebuilt `wss://` URL, `route.ts:117-158`) | Yes — core | Yes (`route.ts:29-32`) | Bearer **+** prebuilt WS URL omits `encoding`/`sample_rate` (browser Opus/WebM assumption); mobile raw PCM needs `encoding=linear16&sample_rate=16000` — add `?format=` param |
| `POST /api/stt/usage` | Yes | Yes | Bearer |
| `GET /api/user/tier` | Yes — core | Yes (`route.ts:15-18`) | Bearer |
| `/api/user/sessions`, `/milestones`, `/avatar`, `/email-preferences`, `/user/instructor/*` | Yes (v1/v2 mix) | Yes | Bearer |
| `POST /api/stripe/checkout` (hosted Checkout URL, `route.ts:50-72`) | Policy-dependent | Yes | Cannot be iOS purchase path as-is; needs IAP sibling + server entitlement merge |
| `GET /api/stripe/status`, `POST /api/stripe/portal` | Yes | Yes | Bearer; portal opens in external browser |
| `POST /api/stripe/webhook` | N/A | No | Must be extended to coexist with IAP entitlements |
| `/api/referral/lookup`, `/claim`, `/api/invite/[token]` | Yes (growth) | claim: yes | Bearer; deep-link handling client-side |
| `/api/flags`, `/api/report`, `/api/health` | Yes | flags/report: yes | Bearer |
| `/api/admin/*`, `/api/instructor/*`, `/api/cron/*`, webhooks | No (defer; admin stays web) | — | None |

Good news: the server already does the heavy lifting — grading, planner advancement, transcript/element persistence, quota checks, kill switches, free-trial limits all server-side; planner state/exam plan persisted to `exam_sessions.metadata` for resume (`exam/route.ts:429-450, 1098-1110`), so a mobile client can recover state from the server. *(Caveat from review 02: the client↔server state shuttle has critical bugs; server-side state ownership (plan task W2.1) makes the mobile contract dramatically simpler — mobile work should follow that refactor.)*

## Client-side logic inventory

1. **Exam turn orchestration loop** — `practice/page.tsx` (2,626 lines, ~50 useState hooks at :93-177). Client holds `history`, `taskData`, `plannerState`, `examPlan`, `coveredTaskIds` and posts them back on every `/api/exam` call (`exam/route.ts:315-327`). Manual SSE parsing (`page.tsx:756-804`), `X-Task-Id`/`X-Task-Data` base64 headers (`exam/route.ts:557`), chunked-response markers, error recovery, resume, quota modals, grading display. **Port: 1,500-2,000 lines of logic.** The state-shuttle design demands strict contract fidelity — biggest porting risk (mitigated by W2.1 server-state refactor).
2. **Voice output pipeline** — `useSentenceTTS.ts` (205 ln: token buffering → boundary detection → queue → sequential drain with prefetch) + `useVoiceProvider.ts` (297 ln: /api/tts fetch, prefetch cache, abortable `new Audio()` mp3 playback :173). `sentence-boundary.ts` (139 ln) pure TS — directly reusable in RN. `useStreamingPlayer.ts` (297 ln AudioWorklet PCM) already deprecated — skip. **Port: ~500 lines.**
3. **Voice input** — `useDeepgramSTT.ts` (359 ln): token fetch → `wss://api.deepgram.com/v1/listen` with `Sec-WebSocket-Protocol: ['bearer', jwt]` (:130) → MediaRecorder Opus/WebM 250ms chunks (:143-160) → dedup/retry/usage. Mobile replaces capture with native mic streaming **linear16 PCM** over the same WebSocket. **Port: ~350 lines + native audio session code.**
4. **Session setup + onboarding** — `SessionConfig.tsx` (414), `OnboardingWizard.tsx` (562): pure UI + config assembly; rebuild as native screens.
5. **Progress visualizations** — `progress/page.tsx` (543) + AcsCoverageTreemap, WeakAreas, StudyRecommendations. Data from `/api/session?action=element-scores` + `/api/exam?action=summary`; needs native charting for treemap.
6. **Settings** — `settings/page.tsx` (2,279 ln) — v1 ships trimmed subset.
7. **Auth screens** — `login/page.tsx` (469): 6-digit email OTP (`signInWithOtp`/`verifyOtp`) + OAuth google/apple/azure (:241-262). Native uses supabase-js directly with AsyncStorage/Keychain persistence — simpler than web SSR; `/auth/callback` not needed on mobile.
8. **Not portable / skip:** PostHog web provider (use native SDK), voice-telemetry, cookie consent, GTM, JsonLd, admin + instructor dashboards (stay web).

Reusable as-is if React Native: `exam-logic.ts` types (740 ln, zero deps), `sentence-boundary.ts`, `types/database.ts` (813 ln) — these define the client contract.

## Platform constraints

- **Apple IAP (Guideline 3.1.1):** subscription is a digital good → iOS app must offer In-App Purchase. Since Apr 30 2025 (Epic v. Apple contempt ruling) US-storefront apps may also link to web checkout commission-free — but **Dec 2025 Ninth Circuit partially reversed**: Apple may charge a "reasonable" fee on external links, rate TBD. June 2026 guidance: ship IAP as primary iOS purchase path (RevenueCat or StoreKit 2 → server webhook → `user_profiles.tier`); keep Stripe checkout for web/Android-link; treat US link-out as a bonus. Sources: https://9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links/ · https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy/ · https://www.revenuecat.com/blog/engineering/app-to-web-purchase-guidelines/
- **Google Play:** post-Epic v. Google (appeal lost Jul 31 2025), US policies effective ~Jan 28 2026 allow Alternative Billing + External Content Links, proposed 9-20% fees, collection start unannounced. Linking to Stripe checkout from Android plausibly compliant in US; verify at submission. Sources: https://support.google.com/googleplay/android-developer/answer/15582165 · https://www.coda.co/blog/epic-v-google-policy-update-2026/
- **Sign in with Apple (4.8):** required because Google/Microsoft login offered — existing Apple OAuth satisfies it but must use native `AuthenticationServices`/`expo-apple-authentication` + `supabase.auth.signInWithIdToken`, not web redirect. https://supabase.com/docs/guides/auth/social-login/auth-apple?platform=react-native
- **Deep links:** custom scheme/universal link (e.g. `com.heydpe://auth-callback`) in Supabase redirect URLs; PKCE in-app. https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- **Privacy manifests/labels:** `PrivacyInfo.xcprivacy` + required-reason APIs (enforced since May 2024); Play Data Safety form; `NSMicrophoneUsageDescription` / `RECORD_AUDIO`. https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- **Background audio:** TTS with screen locked needs iOS `audio` background mode / Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK`; background mic capture heavily restricted — scope voice exams foreground-only, let examiner audio finish in background. https://docs.expo.dev/versions/latest/sdk/audio/
- **Account deletion in-app** — App Store requirement; must be in mobile Settings v1.

## Framework recommendation

**React Native with Expo (dev-client builds, New Architecture).**

1. **Code/contract reuse is decisive for a one-person TypeScript team.** `exam-logic.ts`, `sentence-boundary.ts`, `types/database.ts`, and the request/response shape of the practice orchestration lift nearly verbatim. Flutter/native would re-derive ~3,000 lines of contract logic in Dart/Swift/Kotlin with no shared tests.
2. **Supabase is first-class on RN/Expo** (official quickstarts, AsyncStorage sessions, `signInWithIdToken` for native Apple/Google). https://docs.expo.dev/guides/using-supabase/
3. **Voice feasible:** Deepgram WS is plain WebSocket; community modules (`@siteed/expo-audio-stream`, `react-native-deepgram`) handle PCM mic streaming; Expo documents real-time audio with native modules; `expo-audio` covers mp3 TTS playback with background mode. Caveat: this is where Flutter is *more* polished — budget a custom native module/config-plugin for mic PCM capture; **plan a 1-week spike before committing.**
4. **Payments:** RevenueCat RN SDK is the mature IAP + Stripe coexistence path, explicitly supports 2025-26 app-to-web rules.
5. Alternatives: **Flutter** wins slightly on audio smoothness + Deepgram Dart SDK but loses all TS reuse; **native ×2** doubles the codebase for a solo maintainer — only if voice latency proves unacceptable in the RN spike.

## Spec inputs — screen inventory

**v1 (must mirror):**
| Screen | Web source | Notes |
|---|---|---|
| Login / OTP / OAuth | `(auth)/login/page.tsx` (469) | Email OTP + Google + native Apple (+ Microsoft optional) |
| Onboarding wizard | `practice/components/OnboardingWizard.tsx` (562) | server-gated via `is_onboarding` |
| Practice (exam) | `practice/page.tsx` (2,626) + `SessionConfig.tsx` (414) | Chat + voice, SSE streaming, resume, results — the core product |
| Home dashboard | `home/page.tsx` (430) | Stats, tips, resume CTA |
| Progress | `progress/page.tsx` (543) + 3 components | Session history, ACS coverage, weak areas |
| Settings (trimmed) | `settings/page.tsx` (2,279) | v1: account, voice/examiner picker, theme, sign-out, **account deletion (required)** |
| Paywall / subscription | `pricing/page.tsx` + `/api/stripe/*` | Native IAP paywall on iOS; link-out variant per platform |

**Defer to v2:** instructor program screens, referral/invite deep-link landing (handle as deep links into signup), full settings parity, `try/` guest mode, help/legal (web views). **Never mobile:** all 13 admin pages.

**Readiness verdict:** backend ~85% reusable; blocking work: (1) bearer-token auth in `src/lib/supabase/server.ts` + rate-limit identifier + session-enforcement plumbing, (2) `encoding` param on `/api/stt/token` WS URL, (3) IAP entitlement path merging with Stripe webhook into `user_profiles.tier`. Big client effort: practice orchestration (~2k lines) + voice pipeline (~850 lines).
