# 10 — Test-Readiness Plan (resume after the June→September pause)

> **Goal.** Bring the HeyDPE iOS app from "fully functional in the iOS Simulator" (state on
> 2026-06-18) to **"installable on physical iPhones via TestFlight internal testing, with the
> voice loop proven on a device"** — the point at which the owner and a handful of testers can
> start structured testing. Store submission (M6), RevenueCat IAP (M4) and Android (M7) are
> explicitly *after* this plan.
>
> Written 2026-09-10, revised the same day through three GPT-6 Astra review rounds (§7) —
> **final verdict APPROVED.** Branch `feat/mobile-m1-api-enablement` (38 commits ahead of `main`,
> 27 not yet pushed).

---

## Execution Update (2026-09-11)

The audit below describes the pre-takeover baseline. SDK 57, test scaffolding,
audio lifecycle rewrite, native Apple/Sentry source integration, EAS profiles,
and several hardening fixes are now implemented locally. See the current
`IMPLEMENTATION-PROGRESS.md` takeover section and
`testing/2026-09-10-takeover.md` for measured evidence and open gates.

The inherited history and readiness work are pushed as draft PR #60; the
credential-route removal is independently reviewable in draft PR #59. CI is
passing. Neither PR is merged, and production main is unchanged. The SDK 57
Debug client builds and runs in the simulator. Native ordinary-account testing
confirmed the expired-session paywall; it did not bypass the trial gate to claim
a successful graded exchange.

**No exit criterion is checked merely because its code exists.** EAS is not
authenticated, Apple signing/configuration is unverified, and no physical-device
or TestFlight proof has been collected. Source preparation proceeded beyond the
Phase 3 dependency; device acceptance has not. RevenueCat, store submission, and
Android remain outside this immediate readiness milestone.

## 1. Where the code actually is (audit, 2026-09-10)

Evidence classes used below: **[run]** = command executed in this repo on 2026-09-10
(`tsc --noEmit`, `npx expo-doctor`, `npm outdated`, `git log/diff`); **[code]** = read from the
source; **[hist]** = recorded in `IMPLEMENTATION-PROGRESS.md` / the June session logs, not
re-verified on a device; **[web]** = Expo changelog / npm registry fetched 2026-09-10.

### 1.1 What exists and works

| Area | State | Evidence |
|---|---|---|
| Backend enablement (M1) | ✅ on `main` + prod | [code] `getAuthedUser()` on the v1 routes; rate-limit identity by JWT `sub`; STT `encoding=linear16` — commits `59bf4bd`, `f2eb95f`, `c0f539d` on `main` |
| Scaffold (M0) | ✅ | [run] Expo `~56.0.12` (installed 56.0.12), RN 0.85.3, React 19.2.3, New Architecture, typed routes, React Compiler on |
| Auth | ✅ (3 of 4) | [code] `login.tsx`: Email OTP, Google + Microsoft PKCE via `openAuthSessionAsync`; **Sign in with Apple button disabled** (`login.tsx:148`) |
| Session persistence | ✅ | [code] chunked `expo-secure-store` adapter; in-memory fallback when the Keychain entitlement is absent (unsigned sim builds) |
| Design system | ✅ | [code] FLIGHT DECK tokens + `cockpit.tsx` primitives, IBM Plex Sans + JetBrains Mono, 4 tabs |
| Home / Progress / Settings | ✅ on live data | [hist] verified in the sim against prod in June |
| Exam loop (M2) | ✅ non-streaming | [code] `exam.ts`: `stream:false` JSON for start/respond/next-task/resume-current; assessment badges; paused-session reactivation; opaque server state passed back |
| Onboarding + consent | ✅ | [hist]+[code] 6-step wizard; `ai_data_processing` + FAA `disclaimer` consents; uncounted onboarding exam |
| Paywall (M4 UI) | ✅ render-only | [code] `upgrade-sheet.tsx`: 6 reason codes → copy; no purchase path |
| Telemetry | ✅ PostHog only | [code] consent-gated thin `/capture` client; **Sentry not installed** (`package.json`) |
| Examiner voice (M3 out) | ✅ whole-turn mp3 | [code] `use-examiner-voice.ts`: `/api/tts` → cache file → `expo-audio` player; text cut at 2,000 chars client-side (the server also caps at 2,000, `api/tts/route.ts:50`) |
| Student voice (M3 in) | ✅ protocol-verified | [code]+[hist] `useAudioStream` PCM16@16k → Deepgram WS; interim + finals; editable transcript; **never exercised with a real mic** |
| iOS dev build | ✅ sim only | [hist] Xcode 26.5 / iOS 26.5 runtime, ad-hoc unsigned `xcodebuild`; `ios/` gitignored (CNG) |

[run] `tsc --noEmit` clean. [run] `expo-doctor`: 12 packages behind their SDK 56 "expected" ranges
(e.g. expo 56.0.12 vs ~56.0.21). [run] No test files under `apps/mobile`, no `eas.json`, no CI
job touches `apps/mobile`.

### 1.2 Gaps that block *testing on a device* (not store submission)

1. **No physical-device build path.** No `eas.json`, no EAS project, no registered devices, no signing credentials. Every voice claim (T1–T4) is unproven until this exists.
2. **Sign in with Apple is disabled.** The Apple Developer account **already exists** (Team `45K5W4N8DG`; Services ID `com.heydpe.auth` serves the web) — the wall is smaller than the June tracker assumed. Missing: App ID for `com.heydpe.app` with the Sign in with Apple capability, the bundle ID added to Supabase's Apple provider *Client IDs*, the native `expo-apple-authentication` flow, and the `ios.usesAppleSignIn` entitlement in `app.json`.
3. **Examiner TTS is whole-turn and unmeasured.** One mp3 per examiner turn means time-to-first-audio grows with turn length, so T2 (< 1.5 s TTFA) is *at risk* on long turns; whether it fails is a measurement, not a fact. T3 (inter-sentence gap) is trivially met inside a single file and only becomes meaningful once turns are split. Text over 2,000 characters is silently dropped by both client and server.
4. **Examiner turn delivery cuts itself off.** After a student answer, `submit()` appends the feedback bubble, then (when `advance` is set) a second examiner bubble from `nextTask()`. The speak-effect fires on each new examiner bubble and `speak()` tears down the current player, so the next question can cut off the feedback mid-sentence (`practice.tsx` speak-effect + `use-examiner-voice.ts` `speak()`).
5. **Half-duplex is intended but not guaranteed by the code.** The speak-effect has no "is the mic open" guard (turning voice on while listening speaks over an open mic); STT `teardown(true)` restores playback without `allowsRecording:false` and without awaiting it; STT attempts share one `userStoppedRef`, so callbacks from an older attempt (permission → token → socket) can act on a newer one; `endExam()` stops neither hook.
6. **Student speech is not finalized before submit.** `submit()` reads `answer` *before* `stt.stop()`, and `stop()` sends `CloseStream` then closes the socket immediately, so Deepgram's last final is lost. Finals are de-duplicated by text equality, which drops a legitimately repeated phrase; in Flux mode `EndOfTurn` replaces rather than appends earlier turns.
7. **No crash reporting.** Sentry was deferred to "the next native rebuild" — that rebuild is now.
8. **Trial gates will stop testers.** `POST /api/session` create bypasses the 7-day / 3-exam trial only when `getUserTier()` resolves to `dpe_live`. The existing *Tester* mechanism is an admin-granted `user_entitlement_overrides.paid_equivalent` row (`/api/admin/user-overrides`, optional `expiresAt`), which `getUserTier()` (`src/lib/voice/tier-lookup.ts`) promotes to `dpe_live`; the same lookup gates `/api/tts` and `/api/stt/token`, so one override covers exam + voice. `ground_school` is a dead legacy enum (`src/lib/tier-labels.ts`), **not** a tester tier — the mobile `planLabel()` in `endpoints.ts` mislabels it *Tester* and must be aligned. Voice availability on the client (`voiceEnabled`) is a user preference, not tier-gated.
9. **No results sheet.** Completion shows a plain "Exam complete" card; `screens/03-practice.md` §4.6 specifies the grading display.
10. **No lifecycle handling.** Backgrounding, a phone call, or leaving the screen while the mic is open or TTS is playing is unhandled.
11. **`resumeExam()` ignores the pending question returned by `resume-current`** and rebuilds only from `session_transcripts`. Whether the pending examiner question is always present in the transcript rows must be verified against the exam route before relying on it.
12. **No automated tests / CI** for the mobile package. The June review cycles found 20+ real bugs; nothing guards the SDK upgrade below.

### 1.3 Ecosystem changes since June (what to adopt, what to skip)

| Change | Date | Source | Decision |
|---|---|---|---|
| **Expo SDK 57**: RN 0.86, React 19.2 unchanged, "no breaking changes from 0.85"; reanimated 4.3→4.5, worklets 0.8→0.10 | 2026-06-30 | [web] expo.dev/changelog/sdk-57 | **Adopt now.** Non-breaking by design; carries the expo-audio fixes below. Third-party native deps (`expo-glass-effect`, `@expo/ui`) are the residual risk. |
| `expo-audio` 57.0.0–57.0.4: iOS audio-session deactivation moved off the main thread (hang fix); mic permission reports *denied* instead of crashing when the usage string is missing | Jun–Aug | [web] expo-audio CHANGELOG (sdk-57) | Relevant to the STT/TTS session switching. No API changes to `useAudioStream` / `setAudioModeAsync` listed. |
| expo-audio 57 documents **no** interruption / route-change events; `AudioMode` = `allowsRecording`, `interruptionMode`, `shouldPlayInBackground`, `shouldRouteThroughEarpiece`, `playsInSilentMode` | — | [web] docs.expo.dev v57 audio | Lifecycle must be `AppState`-driven (Phase 4.3). |
| **Expo SDK 58** `58.0.0-preview.0` + daily canaries on npm | Sep 2026 | [web] npm | **Skip.** Preview only; no public changelog. Re-evaluate after TestFlight is live. |
| Expo Go now requires login; Expo Agent sunset | Sep / Jul | [web] expo.dev/changelog | Irrelevant — this app cannot run in Expo Go (native modules). |
| EAS Workflows: automated iOS device registration for internal builds | 2026-06-15 | [web] expo.dev/changelog | Use for registering tester devices for the dev client (Phase 3). |
| EAS Observe GA; Expo↔PostHog integration | Aug / Sep | [web] expo.dev/changelog | Optional. Sentry remains the crash tool per `07-TELEMETRY.md`. |
| `react-native-gesture-handler` 3.x, `async-storage` 3.x, `url-polyfill` 4.x, TypeScript 7, `@supabase/supabase-js` 2.116 | summer | [run] `npm outdated` | **Skip during the SDK move**; stay on what `expo install --fix` selects. Bump supabase-js in its own later commit. |
| `@sentry/react-native` 8.26, `react-native-purchases` 10.9 | current | [run] npm | Sentry in Phase 4; RevenueCat deferred (M4). |

---

## 2. Definition of "ready to start testing" (exit criteria for this plan)

- [ ] A **TestFlight internal build** (App Store-signed, release configuration) installs on ≥ 2 physical iPhones (one recent, one 3–4 years old) from a clean install.
- [ ] All four sign-in methods work on device, including **native Sign in with Apple** (first sign-in captures the name; a repeat sign-in and a cold kill both restore the session).
- [ ] A **full voice exam** (examiner speaks feedback *and* the next question in order, student answers by mic, ≥ 5 exchanges, natural completion) runs on device, with T1–T4 measured per §3 Phase 5 definitions and a **GO / NO-GO** written to `08-VOICE-SPIKE-M3.md` §10. A lifecycle failure (background, call, leave screen) that leaves the mic hot or audio playing blocks GO.
- [ ] Trial, quota, 409 (other device), 503 and offline states render the specified copy on device, exercised with **ordinary (non-override) accounts**.
- [ ] Sentry receives a test crash from the TestFlight build; PostHog receives the client events with the same `distinct_id` the server uses.
- [ ] Each tester's real account (the one created by their sign-in method) holds a `paid_equivalent` override; a one-page test script and a feedback channel exist.
- [ ] `apps/mobile` has a CI job (typecheck + lint + unit tests incl. lifecycle tests) and the mobile PR is merged to `main`.

---

## 3. Step-by-step plan

Effort is engineering time; "owner" marks steps only Piotr can do. Phases 0–2 need no Apple
account action. **Phase 3 is a hard dependency for Phases 4–7** (a registered device and a
signed dev client are inputs, not parallel work), so the owner items in Phase 3 should be
requested on day 1.

### Phase 0 — Land what exists (½ day)

1. Push the 27 unpushed commits; open the PR `feat/mobile-m1-api-enablement → main`. Rebase onto `main` first: the 7 backend commits on `main` are cherry-picks of commits on this branch and should drop out as already-applied.
2. ~~Commit the untracked ops material~~ **Corrected 2026-09-11:** `docs/ops/` and `scripts/ops/` stay LOCAL and gitignored — the repo is public and the owner decided on 2026-06-14 to keep the rotation runbook, key ID and local `.p8` path out of it. They were committed in PR #60 on the PM's mistaken advice and removed again in the follow-up PR. Fix `AGENTS.md` at repo root (bad find-and-replace) or generate it from `CLAUDE.md`.
3. Separate PR on `main`: delete `src/app/staging-auth/page.tsx` (hardcoded-credential backdoor marked DELETE).
4. Update `IMPLEMENTATION-PROGRESS.md` with the September restart and link this plan.

**Verify:** PR open, web CI green, branch tip == origin.

### Phase 1 — Platform refresh to Expo SDK 57 (1 day)

1. In `apps/mobile`: `npx expo install expo@^57.0.0 --fix`, then `npx expo install --check` until clean; `npx expo-doctor` clean. Let `expo install` choose reanimated / worklets / screens / safe-area. **No unrelated bumps in this commit.**
2. Regenerate native projects: `rm -rf ios && npx expo prebuild --platform ios --clean`; rebuild the simulator dev client per the `mobile-ios-dev-build` notes (ad-hoc `xcodebuild`, Xcode 26.5). If Phase 3 native config (Apple sign-in, Sentry plugin) is already known, batch it into this prebuild to save a rebuild.
3. Smoke every screen in the simulator against production with the dev sign-in: login → onboarding → text exam (start, respond, next-task, complete) → resume → Progress → Settings.
4. Re-run the Deepgram protocol script (`token → WS → linear16 → Results`) and confirm `useAudioStream` still compiles with `{ sampleRate:16000, channels:1, encoding:'int16', onBuffer }`; confirm `POST /api/tts → 200` from the app.
5. Diff the expo-audio 57 API for `setAudioModeAsync` / `AudioPlayer` against the hooks; adjust if anything moved.

**Verify:** `tsc` clean, `expo-doctor` clean, screens screenshot-verified. One `chore(mobile): Expo SDK 57` commit, revertable alone.

**Risk:** `expo-glass-effect` / `@expo/ui` are the least mature deps; if either breaks the build, put it behind a flag rather than block. Fallback: stay on SDK 56 with `expo install --fix` if a demonstrated regression blocks progress.

### Phase 2 — Test scaffolding + CI (1 day)

1. Add Vitest to `apps/mobile` for **pure** modules: `analytics.ts` (consent gating, queue discard/replay, identify buffering), `secure-storage.ts` chunk/unchunk round-trip with a fake SecureStore, `exam.ts` camelCase→snake_case mapping and `selectedAreas` defaulting.
2. Extract the Deepgram message handling from `use-student-stt.ts` into `stt-parser.ts` (pure): Results/is_final accumulation keyed on Deepgram's `start`/`duration` (not text equality), Flux `TurnInfo` accumulation across turns, empty-transcript handling. Tests for: duplicate final with identical timing → dropped; repeated phrase with new timing → kept; Flux two turns → concatenated.
3. Extract the voice **lifecycle state machine** (Phase 4.3) as a pure module so cancellation, stale-attempt callbacks, finalize-timeout and turn-ordering are unit-tested without native code.
4. **Exam-route contract checks** (moved here from Phase 6 so the Phase 4 loop rewrite builds on facts): (a) does `resume-current` return a pending `examinerMessage` that is *not* yet in `session_transcripts`? If so `resumeExam()` must append it. (b) can `respond` itself return `sessionComplete` (not only `next-task`)? If so the loop must handle it. Record both answers in `01-API-ENABLEMENT-AND-CONTRACT.md`.
5. GitHub Actions job `mobile`: `npm ci`, `tsc --noEmit`, `expo lint`, `vitest run` — triggered on `apps/mobile/**`, `apps/mobile/package-lock.json`, and any shared file the app vendors (`apps/mobile/src/shared/**`).

**Verify:** CI green on the PR; ≥ 30 unit tests including the lifecycle cases in Phase 4.3.

### Phase 3 — Apple/EAS enablement (owner ~2 h; engineer ½ day) — **hard dependency for 4–7**

Owner (Apple Developer, team `45K5W4N8DG`):
1. Register App ID `com.heydpe.app` with the **Sign in with Apple** capability. Create the App Store Connect app record (name HeyDPE, SKU, primary language, bundle ID).
2. Supabase → Auth → Providers → Apple: add `com.heydpe.app` to **Client IDs** alongside `com.heydpe.auth` (the native identity token's audience is the bundle ID; the existing Services-ID secret keeps serving the web). The browser redirect allow-list is unrelated to native Apple tokens — but confirm `heydpe://auth-callback` is present for the Google/Microsoft PKCE return.
3. Register test iPhones for the **development** build (`eas device:create` or the EAS Workflows device-registration flow). UDID registration is for dev/ad-hoc installs only; TestFlight needs none.
4. Add the internal testers as **App Store Connect users** (role with TestFlight access, e.g. App Manager/Developer/Marketing, and access to the HeyDPE app) — an Apple ID alone is not eligible for the Internal Testing group.

Engineer:
5. `eas init` (Imagine Flying account); `apps/mobile/eas.json`:
   - `development`: `developmentClient: true`, `distribution: "internal"` (UDID-scoped).
   - `preview`: **`distribution: "store"`**, release configuration, `autoIncrement: true` (unique build numbers), `env` with prod API URL / Supabase anon key / PostHog key / Sentry DSN — this is the profile uploaded to TestFlight. (An `internal`-distribution build cannot be submitted.)
   - `production`: same as preview; reserved for the store submission later.
   - `submit.preview.ios`: `ascAppId`, `appleTeamId`, `appleId`.
   - `runtimeVersion: { policy: "fingerprint" }`.
6. `eas credentials` → EAS-managed **App Store distribution** certificate + provisioning profile (in addition to the development profile).
7. `app.json`: `ios.usesAppleSignIn: true`, `expo-apple-authentication` plugin, `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`. **Do not add `UIBackgroundModes: audio`** — the lifecycle design is stop-on-background (Phase 4.3); locked-screen TTS is an M3-production item, not a test-readiness one.

**Verify:** `eas build --profile development --platform ios` installs on a registered iPhone and boots to login using the real Keychain (no in-memory fallback warning); `eas build --profile preview` produces a store-signed `.ipa` (upload deferred to Phase 7).

### Phase 4 — Native features + the audio lifecycle rewrite (3 days)

1. **Native Sign in with Apple** (`login.tsx`): generate a cryptographically random **raw nonce** (`expo-crypto` `randomUUID()` or `getRandomBytesAsync`), compute `hashedNonce = SHA-256(rawNonce)` (`expo-crypto` `digestStringAsync`), call `AppleAuthentication.signInAsync({ requestedScopes:[FULL_NAME, EMAIL], nonce: hashedNonce })`, then `supabase.auth.signInWithIdToken({ provider:'apple', token: credential.identityToken, nonce: rawNonce })`. Handle `ERR_REQUEST_CANCELED` silently and a missing `identityToken` as an error. Post `fullName` to the profile on the first authorization only (Apple never sends it again). Enable the button at visual parity with Google/Microsoft.
2. **Sentry** (`@sentry/react-native` + `@sentry/react-native/expo` plugin, separate Sentry project under the existing org): init **behind the analytics consent gate**; source-map upload via the EAS build hook; `beforeSend` scrubbing of email and transcript text; `EXPO_PUBLIC_SENTRY_DSN` per profile.
3. **One coordinated audio lifecycle** — replaces the ad-hoc coordination between `use-examiner-voice.ts`, `use-student-stt.ts` and `practice.tsx` (fixes gaps 4, 5, 6, 10):
   - A single `VoiceSession` controller (pure state machine + thin native adapters) owning the shared iOS session with states `idle | speaking | listening | finalizing`. Transitions are **serialized** (a queue/mutex), so a `speak()` can never start while `listening`, and `startListening()` first awaits `stopSpeaking()` and the `allowsRecording:true` mode switch; leaving `listening` awaits `stream.stop()` **and** `setAudioModeAsync({ allowsRecording:false, … })` before any playback. Transition failures surface as `error` state, not silent catches.
   - Every STT attempt gets an **attempt id**; permission, token and socket callbacks are ignored unless they belong to the current attempt (removes the shared `userStoppedRef` races).
   - **Examiner turn delivery policy:** examiner text is enqueued as *utterances*, played **sequentially** — feedback, then the next question — never replaced. A student action (mic tap, Send) barges in and clears the queue. Utterances longer than 2,000 chars are split at sentence boundaries into ≤ 2,000-char `/api/tts` calls (server cap) so nothing is silently dropped. The speak-effect in `practice.tsx` is replaced by explicit `voice.enqueue()` calls at the points where examiner text is produced.
   - **`finalize()`** (fixes gap 6): stops capture, sends `CloseStream`, keeps the socket open up to **1.5 s** for the trailing final, resolves with the complete spoken segment (accumulated across finals / Flux turns), then closes; on timeout it resolves with what it has and logs `stt_finalize_timeout`.
   - **Draft model (submission + mic-stop semantics):** the answer field is a *draft*. When the mic is tapped, the text already in the field is frozen as `prefix`; while listening the field shows `prefix + spokenSegment (+ interim)`. The draft — never the raw transcript — is what gets submitted, so typed or edited text is preserved. Three exits from `listening`:
     1. **Graceful mic-toggle stop:** `await finalize()` → the trailing final is merged into `spokenSegment` → field = `prefix + spokenSegment`, mic closed, field editable again. Nothing is submitted.
     2. **Send while listening:** `await finalize()` (same merge) → submit the merged draft. `Send` is disabled while `finalizing` so it cannot double-fire.
     3. **Lifecycle abort** (background, call, leave screen): no finalize wait; the socket is closed immediately; the draft keeps whatever was recognized so far and stays editable on return.
     Send with **no active STT attempt** submits the draft as-is with no finalize wait. Late Deepgram messages arriving after an attempt has ended are dropped by the attempt-id check.
   - **Lifecycle:** `AppState` → `inactive`/`background` (covers phone calls, Siri, Control Center) ⇒ abort listening (mic released, socket closed), stop playback, clear the queue, and re-assert playback mode on return to `active`; the same teardown runs on `endExam()`, natural completion, and when the Practice screen loses focus (`useFocusEffect`). expo-audio 57 exposes no interruption events, so the residual gap is "audio interrupted while the app stays `active`"; it is recorded and tested manually in Phase 5, and a failure there blocks GO.
   - Verify the native contracts rather than assume them: `stream.stop()` resolves only after capture stops (probe on device); `playbackStatusUpdate` `playing:true` is the first-audio signal, not `player.play()`.
4. **Echo posture:** expo-audio 57 offers no voice-processing / AEC switch; the serialized half-duplex above is the T4 defense. Also test residual speaker audio at barge-in (tap the mic while the examiner speaks — the first ~200 ms of tail audio must not be transcribed).
5. **Tester entitlement:** after each tester signs in once (so their real `auth.users` row exists), grant a `paid_equivalent` override through the admin UI (`/api/admin/user-overrides`, reason "TestFlight tester", `expiresAt` = end of the QA window). No new script or tier value. Fix mobile `planLabel()` to match `tier-labels.ts` (`ground_school`/`checkride_prep` → Trial, `dpe_live` → Paid). Because the resolved tier alone cannot distinguish an override from a real subscription, add a `hasPaidOverride` boolean to the `GET /api/user/tier` response (small backend change; the route already loads the profile and `getUserTier` already runs the override check) and have `planLabel(tier, hasPaidOverride)` return *Tester* when set. Keep two **ordinary** accounts without the override for trial/quota testing.
6. **Voice-metrics instrumentation** (`src/lib/voice-metrics.ts`, dev/preview builds only): timestamps for T1–T3 with the origins defined in Phase 5, emitted to console + PostHog `voice_spike_sample`.

**Verify:** unit tests for the state machine (cancel mid-connect, stale attempt callbacks, finalize timeout, queue order, barge-in clears queue); all four sign-in methods on device; a forced test crash in Sentry tagged with the EAS build; a phone call mid-exam leaves the app with the mic closed and recoverable.

### Phase 5 — Voice on a physical device: baseline, decision gate, then port if needed (2–4 days)

**Measurement definitions** (both devices, quiet room, Wi-Fi; median of 10, ≥ 8/10 within threshold):
- **T1** = **speech onset** → first Deepgram `Results` message with non-empty transcript; < 800 ms. Speech onset is the first PCM buffer whose RMS exceeds a fixed threshold (computed in `onBuffer`), so tester hesitation after tapping the mic is excluded. `stream.start()` → first buffer is logged separately as capture start-up.
- **T2 (TTFA)** = for the **first utterance of an examiner response only** (queue idle at enqueue time): `voice.enqueue()` call → `playbackStatusUpdate.playing === true`; < 1.5 s. Queued continuations are never scored as T2, so a correctly queued question does not fail T2 because feedback is still playing.
- **T3** = for **queued continuations** within one examiner response: `didJustFinish` of utterance *n* → `playing:true` of utterance *n+1*; < 120 ms. Two classes are reported separately: (a) the feedback→next-question boundary (present with whole-turn TTS), (b) split boundaries — the mandatory 2,000-char splits from Phase 4.3 (present even when 5.3 is skipped) and the sentence splits added by Phase 5.3. Intended pauses inside a single mp3 are not gaps.
- **E2E** = Send tap → first audible examiner audio; includes examiner generation. Not a voice-pipeline threshold, but it is the **only** metric that can justify SSE streaming (Phase 5.4): delivering text earlier shortens E2E, not T2. Provisional trigger: E2E median > 4 s on Wi-Fi **and** attribution shows the delay is generation-dominated — E2E also contains `finalize()` (≤ 1.5 s) and the `respond` round trip, so log `Send → finalize resolved`, `finalize → respond response`, `response → playing` and pick SSE only when the middle segment dominates.
- **T4** = examiner words appearing in the student transcript with the gate on; must be 0. Include the barge-in tail case.
- **Lifecycle** = background / call / leave screen / Bluetooth route change / mic permission revoked mid-session; each must end with mic closed, no playback, recoverable UI.

1. **Baseline run** with whole-turn TTS as-is (after Phase 4): T1, T2, T3, T4 + lifecycle, using representative *long* examiner turns (≥ 3 sentences, ≥ 600 chars). Record raw trial tables in `08-VOICE-SPIKE-M3.md` §9 "September baseline".
2. **Decision gate** (written, not implied). **GO requires all of T1, T2, T3(a), T4 and every lifecycle check to pass on both devices.** Dispositions for each failure:
   - **T1 fails:** attribute across `mic tap → token fetched`, `token → socket open`, `speech onset → first Results`. Remediations in order: prefetch the STT token at exam start; open the socket on mic tap before `stream.start()` resolves; keep one warm socket per exam (the production T6 idea, pulled forward). Retest.
   - **T2 fails (first utterance):** attribute `enqueue → /api/tts response` (synthesis) vs `response → playing` (file write + decode). Decode-dominated → fix the player path (play from memory/stream instead of a cache file). Synthesis-dominated → Phase 5.3 (sentence split so the first utterance is short). Retest.
   - **T3(a) fails while T2 passes:** prefetch utterance *n+1*'s mp3 while *n* plays (the queue already knows the next text); this is required regardless of the sentence port. Retest.
   - **T4 or lifecycle fails:** defect in Phase 4.3; fix and re-run the full set. No GO until clean.
   - **E2E > 4 s, generation-dominated per the attribution above:** consider Phase 5.4 (SSE); not a GO blocker by itself. Finalize-dominated → shorten the finalize wait; network-dominated → not a client fix.
   If everything passes on the first baseline → record GO, skip 5.3/5.4, proceed to Phase 6.
3. **Sentence-level TTS (conditional):** vendor `sentence-boundary.ts` + its 21 tests into `apps/mobile/src/shared/` unchanged; the `VoiceSession` queue already plays utterances sequentially, so the port is "split each examiner turn into sentence utterances and prefetch utterance *n+1* while *n* plays". Re-measure T2/T3.
4. **SSE streaming (conditional, flag-gated):** only when E2E median exceeds 4 seconds on Wi-Fi and the attribution in Phase 5.2 shows generation dominates, consider switching `respond`/`start` to `stream:true` so tokens feed the splitter as they arrive; the non-streaming path stays as fallback. T2 failure alone does not justify SSE (the approved round-2/3 decision).
5. Write the **GO / NO-GO** in `08-VOICE-SPIKE-M3.md` §10 with per-device tables for T1, T2, T3(a)/(b), T4, E2E and the lifecycle matrix. GO only when every threshold and lifecycle check passes on both devices after remediation. A NO-GO on T4 or lifecycle blocks and loops back to Phase 4.3; a NO-GO on T1/T2 after the remediations above escalates per `08` §10.

**Verify:** the GO record; `voice_spike_sample` events in PostHog for both devices.

### Phase 6 — Test-readiness hardening (2 days)

1. **Results sheet** on completion (`screens/03-practice.md` §4.6): `GET /api/session?action=session-element-scores&sessionId=…` (session-scoped RPC `get_session_element_scores`); show grade, satisfactory/partial/unsatisfactory counts, weakest areas, "Review in Progress" CTA.
2. Apply the Phase 2.4 contract answers in the loop: append the pending `resume-current` question when it is not in the transcript; handle `sessionComplete` from `respond` if the route can return it.
3. **Error-state matrix** on ordinary accounts: 403 trial codes, 429, 409 (exam claimed by another device → "Continue here" → reactivate/reclaim), 503 (retry with backoff), offline banner (`@react-native-community/netinfo` via `expo install`), mic permission denied → `Linking.openSettings()`.
4. **Accessibility pass** on the 5 core screens: labels on every `Pressable`, Dynamic Type clamp, 44 pt targets, reduced-motion respected.
5. **Maestro smoke flow** (`apps/mobile/.maestro/exam-smoke.yaml`): OTP login with a seeded fixed-OTP tester account, start a text exam, answer once, end exam. **Target:** a dedicated `smoke` EAS profile — `ios.simulator: true`, release JS (`--no-dev --minify` equivalent), same env as `preview` — producing an installable simulator `.app` that Maestro drives locally or in CI. The store-signed `preview` build cannot be installed outside TestFlight, so it is *not* the smoke target; the upload gate is "smoke green on the same commit", and the real `preview` build is validated after processing (Phase 7.1).
6. Confirm `EXPO_PUBLIC_DEV_*` are absent from `preview`/`production` env; `dev-login` stays `__DEV__`-only.

**Verify:** screenshot per error state in the PR; Maestro flow green on the release simulator **smoke** build at the same commit as preview. The store-signed preview cannot be installed in a simulator.

### Phase 7 — TestFlight internal (1 day + Apple processing)

1. Gate: Maestro smoke green on the release commit (Phase 6.5). Then `eas build --profile preview --platform ios` (store-signed, release) → `eas submit --profile preview --platform ios` → App Store Connect processes the build → TestFlight → **Internal Testing** group (App Store Connect users from Phase 3.4; no Beta App Review). Export compliance is answered by the Info.plist key. **Post-processing validation:** install the actual TestFlight build on both test iPhones and run the 30-minute script (7.3) once before inviting the other testers.
2. Testers sign in once → grant the `paid_equivalent` override to each real account (Phase 4.5).
3. `docs/mobile/11-TESTFLIGHT-TEST-SCRIPT.md`: 30-minute script (install → Apple sign-in → onboarding → voice exam → resume after kill → Progress → Settings) + what to report (device, iOS version, build number, TestFlight screenshot feedback).
4. Feedback loop: TestFlight feedback → Sentry (crashes) → PostHog dashboard filtered by build → `docs/mobile/testing/` findings log.
5. Tag the build in git; open follow-on tickets for M4 (RevenueCat), M6 (submission checklist, privacy manifest, nutrition label, locked-screen TTS) and M7 (Android).

**Verify:** every §2 exit criterion checked.

---

## 4. Sequencing and estimate

```
day 1   P0 land ─► P1 SDK 57 ─► P2 tests/CI            P3 owner items requested day 1;
                                     │                  engineer half-day once App ID + testers exist
                                     ▼
        P3 (dev client on a real iPhone)  ◄── hard dependency
                                     │
                                     ▼
        P4 native + audio lifecycle ─► P5 baseline ─► decision gate ─► (port?) ─► P6 hardening ─► P7 TestFlight
```

| Phase | Engineering days |
|---|---|
| P0 | 0.5 |
| P1 | 1 |
| P2 | 1 |
| P3 (engineer) | 0.5 |
| P4 | 3 |
| P5 | 2 (baseline + gate) + 2 if the port/SSE is needed |
| P6 | 2 |
| P7 | 1 |
| Contingency (native audio fixes, first release pipeline, review rounds) | 2 |
| **Total** | **11 before contingency; 13 with contingency; 15 with the conditional port** |

Calendar time adds owner turnaround on Phase 3 and Apple processing on Phase 7.

## 5. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| SDK 57 breaks `useAudioStream`, `expo-glass-effect` or `@expo/ui` | low–medium | Single-commit upgrade; flag the UI libs; SDK 56 fallback |
| Device echo leaks examiner audio into the transcript | medium | Serialized half-duplex in one controller (P4.3); barge-in tail test; T4 blocks GO |
| Whole-turn TTS misses T2 on long turns | medium | Measured first (P5.1); conditional sentence port / SSE with attribution before committing |
| Native contracts differ from assumptions (`stream.stop()` timing, first-audio signal) | medium | Probed on device in P4.3 before the baseline |
| Supabase Apple audience or nonce mismatch | medium | Bundle ID in *Client IDs*; raw-nonce-to-Supabase / hashed-nonce-to-Apple spelled out in P4.1 |
| TestFlight upload rejected (wrong distribution, duplicate build number, missing tester roles) | medium | `preview` = store distribution + `autoIncrement`; testers as ASC users (P3.4/3.5) |
| Testers blocked by the trial gate | certain without action | `paid_equivalent` override per real account (P4.5) |
| SDK 58 lands mid-plan | medium | Ignore until TestFlight is live; fingerprint runtime policy isolates OTA from native drift |

## 6. Explicitly out of scope for "start testing"

RevenueCat / IAP purchase (M4), App Store submission checklist and privacy manifest audit (M6), locked-screen / background TTS (M3-production), Android (M7), the monorepo / `packages/shared` extraction (vendoring stays), the Delight backlog (`09`), and the Scenario Engine study mode in the mobile config (the web A/B decision comes first).

---

## 7. Review — GPT-6 Astra via iq-boost

### Round 1 (2026-09-10, gpt-6-astra @ xhigh) — APPROVED WITH REQUIRED CHANGES

Required changes and how this revision addresses them:

| # | Finding | Addressed in |
|---|---|---|
| 1 | TestFlight profile must be store-distributed, release, unique build numbers; testers must be ASC users | P3.4, P3.5, P7.1 |
| 2 | Apple nonce: hashed to Apple, raw to Supabase; handle cancel / missing token | P4.1 |
| 3 | One coordinated audio lifecycle before the spike (serialized transitions, `allowsRecording:false` restored + awaited, attempt ids, stop on end/leave/background, verify native stop contract; lifecycle failure blocks GO) | P4.3, §2 |
| 4 | Finalize student speech before submit; timing-based dedup; Flux accumulation | P4.3 `finalize()`, P2.2 |
| 5 | Examiner turn delivery: sequential feedback → question, no silent 2,000-char truncation | P4.3 utterance queue + splitting |
| 6 | Measured decision gate after the baseline (incl. T3, timestamp origins, real playback onset) before any sentence port | P5 definitions, P5.1–5.2 |
| 7 | Verify the Tester entitlement against backend behaviour | §1.2 item 8 (verified in `tier-lookup.ts`: `paid_equivalent` → `dpe_live`, also gates TTS/STT), P4.5 |

Recommended changes adopted: Phase 3 restated as a hard dependency; supabase-js bump removed from the SDK commit; lifecycle tests + lockfile/shared CI triggers; `UIBackgroundModes: audio` dropped; `resume-current` / `respond` contract checks added (P6.2); estimate raised to 13–15 days with explicit contingency.

Factual corrections adopted: T3 claim softened (§1.2 item 3); evidence classes added to §1 so run-verified facts are distinguishable from recorded history; ecosystem rows carry their source.

### Round 2 (2026-09-10, gpt-6-astra @ xhigh) — APPROVED WITH REQUIRED CHANGES

Round-1 items 1, 2, 3, 5, 7 resolved; 4 and 6 partially. New required changes and where this revision addresses them:

| # | Finding | Addressed in |
|---|---|---|
| 1 | Submission / mic-stop semantics: `finalize()` must not discard typed or edited text; define graceful stop vs lifecycle abort vs Send without an attempt | P4.3 "Draft model" |
| 2 | T2 must apply to the first utterance only; T3 to queued continuations; SSE gated on an end-to-end metric, not T2 | P5 definitions (T2, T3(a)/(b), E2E), P5.4 |
| 3 | GO requires all T1–T4 + lifecycle on both devices; dispositions for T1 failure and for T3-fails-while-T2-passes | P5.2 decision tree, P5.5 |
| 4 | A store-signed `preview` build cannot be the pre-upload smoke target | P6.5 `smoke` simulator profile; P7.1 post-processing validation |

Recommended adopted: contract checks moved to Phase 2.4 (before the loop rewrite); `hasPaidOverride` added to the tier API so *Tester* can be displayed; T1 origin = speech onset by RMS threshold; estimate wording corrected (11 / 13 / 15).

### Round 3 (2026-09-10, gpt-6-astra @ xhigh) — **APPROVED**

All four round-2 required items resolved; recommended items adopted. No new required changes. Two non-blocking notes, both folded into Phase 5: T3(b) explicitly covers the mandatory 2,000-char splits even when the sentence port is skipped; SSE selection requires E2E attribution (finalize vs generation vs playback), since passing T2 alone does not prove generation dominance.

**Status: plan approved for execution. Next action: Phase 0.**

### Owner decisions (2026-09-11, after PR #60 review)
- Home keeps a trial exam counter that reflects the real gate (3 exams or 7 days).
- Product analytics is on after onboarding; Settings "Usage analytics" is the opt-out.
- Crash reporting is anonymous and always on, decoupled from the analytics consent.
Details and acceptance bars: `13-PM-REVIEW-PR60-FOR-ASTRA.md` §B.
