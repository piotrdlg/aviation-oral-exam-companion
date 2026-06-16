# Screen Spec — Onboarding wizard (native)

> **Web source of truth:** `src/app/(dashboard)/practice/components/OnboardingWizard.tsx` (the 6-step wizard) + its host gate in `src/app/(dashboard)/practice/page.tsx:486-2030` (`showWizard` state, server-gated by `is_onboarding`/`onboardingCompleted`).
> **Design system:** `docs/mobile/02-DESIGN-SYSTEM.md` (FLIGHT DECK native-adapted tokens, IA, haptics, a11y).
> **API contract:** `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (all `§B.x` and `§A.x` references below resolve there).
> **Locked decisions in scope:** Expo + expo-router; native-adapted FLIGHT DECK; PARITY v1; iOS-first; RevenueCat IAP is the iOS purchase path. There is **no purchase inside onboarding** — the onboarding exam is free and uncounted, so no IAP touchpoint fires here (it fires only if the user later hits a `trial_limit_reached` 403).

This spec mirrors the shipped web wizard exactly, then re-expresses it as a native expo-router modal flow with one **added** native step the web has no equivalent for: **mic-permission priming**. The web obtains mic access lazily inside an already-granted browser tab; a native app must request `RECORD_AUDIO` / `NSMicrophoneUsageDescription` through the OS, so the wizard must prime that request before voice mode can work.

> **M2 vs. M3 — voice-conditional paths.** Per the milestone plan, **M2 ships this screen voice-OFF / type-only**: at M2, onboarding completes and hands off to a **type-only first exam**, so the **mic-permission priming step and the `warmUpAudio()`-equivalent audio-session warm-up do NOT run** — they are **voice-conditional and light up only after the M3 voice-spike GO** (`docs/mobile/08-VOICE-SPIKE-M3.md`). Every mic/audio path below (the priming card in §3, the warm-up in §4 step 11, the `NSMicrophoneUsageDescription` prompt in §10) is gated on `voiceEnabled === true` **and** M3-shipped; until then the Step 6 voice toggle is hidden/forced off and the flow goes straight from prefs → the two consent gates → a type-only exam. The **`ai_data_processing` consent itself is NOT voice-conditional** — it is recorded at M2 as well, before the first exam, so the consent record already exists by the time the M3 mic/audio paths first capture audio.

---

## 1. Purpose & role in the product

### Qualitative requirements
- **Purpose.** First-run wizard that (a) captures the new pilot's rating + first-run preferences, (b) writes them to `user_profiles` via `POST /api/user/tier` with `onboardingCompleted:true`, (c) primes microphone access for voice mode (M3+; voice-conditional — see below), (d) records the **two distinct, separate consents** the first exam requires — the **FAA-examiner disclaimer** (`kind:'disclaimer'`, an AI-simulation/accuracy acknowledgement) **and** a **new, separate `ai_data_processing` consent** (`kind:'ai_data_processing'`, `choices:{ third_party_ai_v1: true }`) that names the third-party AI processors (Anthropic = examiner LLM; Deepgram = STT + TTS; OpenAI = TTS fallback) and states plainly that spoken answers and transcripts leave the device — both recorded **server-side via `POST /api/consent` before the first exam and before any audio leaves the device**, and (e) hands off into a **pre-configured, free, uncounted** onboarding exam on the Practice screen. It is the single highest-leverage activation surface — every paying funnel begins here. **This screen is AUTHORITATIVE for the `ai_data_processing` consent UX + record** (the API contract route is `POST /api/consent` §B.25 in `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`; the store obligation is `docs/mobile/05-APPLE-COMPLIANCE.md` §10). Do **not** reuse `faa_disclaimer_v1` for the AI-data consent — they are two separate obligations and two separate records.
- **Role in IA.** It is **not a tab.** It is a full-screen **modal stack** presented over the tab navigator (`onboarding.tsx`, `presentation: 'modal'` — `02-DESIGN-SYSTEM.md:540,550`), so it appears before the tab UI is usable and cannot be dismissed by a swipe before its required gate (consent) is satisfied (`02-DESIGN-SYSTEM.md:572,579`). On completion it dismisses and pushes/replaces into the Practice tab's active-exam route.
- **Server-gated, never client-guessed.** The wizard shows only when the server says the user has not onboarded. Web mirrors this with `onboardingCompleted === false && practiceStats !== null → setShowWizard(true)` (`practice/page.tsx:486-495`). Native must replicate: read `onboardingCompleted` from `GET /api/user/tier` (§B.8, field `onboardingCompleted: boolean`) — **do not** infer onboarding state locally.

### Measurable success criteria
- [ ] The wizard is reachable **only** when `GET /api/user/tier` returns `onboardingCompleted === false`; for `true` it never renders (unit + integration test, pass/fail).
- [ ] Completing the wizard results in exactly one `POST /api/user/tier` containing `onboardingCompleted:true` **before** the exam `start` call fires (network-order assertion).
- [ ] The onboarding exam created by handoff carries `is_onboarding:true` and does **not** increment the user's 3-exam trial counter (assert exam count unchanged after onboarding exam; §B.3 note "is_onboarding is recomputed server-side, never trusted").
- [ ] **Both** the FAA-examiner disclaimer (`kind:'disclaimer'`) **and** the separate `ai_data_processing` consent (`kind:'ai_data_processing'`, `choices:{ third_party_ai_v1: true }`) are recorded server-side via `POST /api/consent` (§B.25) **before** the first exam `start` fires; neither gate can be bypassed (`02-DESIGN-SYSTEM.md:579`, network-order + pass/fail). The `ai_data_processing` record exists before any audio leaves the device (asserted even at M2 voice-OFF, since the record precedes the M3 mic paths).

---

## 2. Entry points & navigation

### Qualitative requirements
- **Stack & route.** Lives at root-level route `app/onboarding.tsx` (a modal route **outside** `(tabs)` per `02-DESIGN-SYSTEM.md:540,572`), presented with `presentation: 'modal'` (full card, not a partial detent — onboarding is a guided flow, not a quick sheet).
- **How reached (cold-start gating).** On app launch after auth resolves, the root layout fetches `GET /api/user/tier`. If `onboardingCompleted === false`, the router redirects to `/onboarding` before the Practice tab can run a session. This matches the web "sticky gate" that suppresses the config card until onboarding state is known (`practice/page.tsx:486-495, 2026-2029`).
- **How reached (manual re-entry).** The web exposes a "full config →" **skip** affordance (`wizard-skip`, `OnboardingWizard.tsx:184-189`) that marks onboarding complete and drops to the full config screen. Native mirrors this as a skip link on every step (see §4). There is **no** "re-run onboarding" entry in v1 (the web has none); a user who finished onboarding lands on the normal Practice config.
- **Deep links.** Onboarding has **no inbound deep link of its own** and ignores Practice deep-link params (`?mode=`, `?tasks=`) while the gate is active — those are consumed by Practice config *after* onboarding (web `practice/page.tsx:135-144`). A cold deep link into `/practice?mode=weak_areas` for a not-yet-onboarded user must route through `/onboarding` first, then honor the original target on dismissal. **OWNER DECISION (D-ONB-1):** confirm whether a buried deep link should be preserved across the onboarding redirect (recommended: yes, stash and replay after handoff) or dropped (web drops it — onboarding always lands on the onboarding exam).

### Measurable success criteria
- [ ] Cold launch with `onboardingCompleted:false` lands on `/onboarding` 100% of the time across 20 launches (no flash of the tab UI > 1 frame).
- [ ] `/onboarding` is presented as a modal **over** the tab navigator (the route is declared outside `(tabs)`); grep shows it in the root stack, not the tabs group (code check).
- [ ] Hardware/gesture **Back** on Android never dismisses the consent gate before it is satisfied (`02-DESIGN-SYSTEM.md:567,579`, pass/fail).

---

## 3. Full STATE MATRIX

All copy is **sentence-case IBM Plex** unless explicitly tagged as an instrument moment (caps-mono via the shared `<Annunciator>` / `<MicroLabel>` / `<CodeChip>` primitives, `02-DESIGN-SYSTEM.md:61`). Tokens are the cockpit (default) theme literals from `02-DESIGN-SYSTEM.md` §1 (mirrored from `globals.css:9-43`). No text below 12pt. Touch targets ≥ 44pt iOS / 48dp Android.

| State | When | User-facing copy (exact, sentence-case) | FLIGHT DECK tokens |
|---|---|---|---|
| **Loading (gate)** | App launch, `GET /api/user/tier` in flight — onboarding state unknown | Skeleton only; no copy (mirror web pulse blocks `practice/page.tsx:2027-2030`) | `<Surface elevation="card">` placeholders on `c-bezel`/`c-bezel/50`; shimmer respects reduced-motion (no animation when Reduce Motion on) |
| **Loaded — Step 1 Rating** | Gate resolves `onboardingCompleted:false` | H2 "What are you preparing for?" · sub "Select your certificate or rating" (`OnboardingWizard.tsx:195-200`) | H2 = Plex bold `text-2xl` `c-text` `tracking-tight`, no glow; sub = `c-muted` `text-base`; cards = `bezel rounded-lg border c-border`, selected = `station` + `ring-1 ring-c-amber/20`; abbr `PPL/CPL/IR` = `<CodeChip>` caps-mono `c-muted` |
| **Loaded — Step 2 Aircraft** | After Next on 1 | H2 "Tell us about your aircraft" · sub "This helps personalize your exam" (`:236-241`) | `// What class of aircraft?` etc. = `<MicroLabel>` caps-mono `c-muted` `tracking-[0.3em]`; class pills = `station` when selected; inputs on `c-panel`, placeholder `c-dim` (floor) |
| **Loaded — Step 3 Name** | After Next on 2 | H2 "What should we call you?" · sub "Your examiner will address you by name during exams" · helper "Optional — you can always change this in settings" (`:320-336`) | input centered on `c-panel`; helper `c-dim` `text-sm`; primary button label toggles **"Next"** ↔ **"Skip"** on non-empty/empty (`:344`) |
| **Loaded — Step 4 Theme** | After Next on 3 | H2 "Customize your cockpit" · sub "Choose your instrument panel aesthetic" (`:353-358`) | 2×2 theme cards; swatch = accent dot per `THEMES` (`lib/theme.ts:4-7`); selected = `station` + amber ring; theme applies **live** via `useTheme().setTheme(id)` |
| **Loaded — Step 5 Trial explainer** | After Next on 4 | H2 "Your free trial" · sub "You are about to start your free 7-day trial — no credit card required" + three `iframe` info blocks (verbatim copy in §4) (`:402-455`) | three `<Surface elevation="card">` recessed `iframe` wells; `// What's included` / `// What is an exam?` / `// After the trial` = `<MicroLabel>`; "$39/month" = `<NumericReadout>` mono tabular `c-amber` |
| **Loaded — Step 6 First-exam summary** | After "Got it" on 5 | H2 "Your first exam" · sub "We've pre-configured this exam so you can jump right in" + summary rows + free badge + voice toggle (verbatim in §4) | summary in `iframe` well; rating value `c-green-readable`; class chip `c-cyan-readable` mono; free badge on `c-green-lo/50` border `c-green/20`; **Start exam now** = primary `c-amber` CTA with `glow-a` allowed (instrument moment) |
| **AI-data consent gate (`ai_data_processing` — NEW, separate from the FAA disclaimer)** | First exam, before `start`; shown to **every** user (NOT voice-conditional — recorded at M2 too) | H2 "How your exam works" · body "Your spoken answers and transcripts are sent to third-party AI providers — **Anthropic** (your AI examiner), **Deepgram** (speech-to-text and text-to-speech), and **OpenAI** (backup text-to-speech) — to run the exam. We don't store raw audio; only transcripts are kept. Tap to consent and begin." · primary "I consent — continue" · link "Learn more" (→ privacy) | full-card modal `c-bezel`; primary `c-amber`; required, non-skippable; processor names rendered as inline `<CodeChip>`/emphasis, body `c-muted` |
| **Permission-priming (NEW native step, between 6 and handoff, only if voice ON — M3+ only)** | "Start exam now" tapped with `voiceEnabled === true`, OS mic status `undetermined`, **and the M3 voice spike shipped** (skipped entirely at M2 / voice-OFF type-only) | H2 "Let's set up your microphone" · body "Your examiner listens and responds by voice. We'll ask iOS for microphone access next. You can change this anytime in Settings." · primary "Allow microphone" · secondary "Continue without voice" | `<Surface elevation="active">` station card; mic glyph `c-cyan` (Ionicons `mic-outline`); primary `c-amber`; secondary `c-bezel` border `c-border` |
| **Permission — system prompt** | After "Allow microphone" | OS-native permission alert (uses `NSMicrophoneUsageDescription` string, see §10) | OS-owned UI; no app tokens |
| **Permission — granted** | OS returns granted | (no extra screen) proceed to consent gate → exam handoff with voice ON | n/a |
| **Permission — denied** | OS returns denied / blocked | Inline annunciator on the priming card: "Microphone access is off. You can answer by typing, or enable the mic in Settings." + buttons "Open Settings" (→ `Linking.openSettings()`) and "Continue without voice" | `<Annunciator state="warning">` `c-amber`; copy `c-muted`; "Open Settings" secondary button |
| **Consent gate (FAA disclaimer — `kind:'disclaimer'`, separate from `ai_data_processing`)** | First exam, before `respond`/`start` proceeds, **after** the AI-data consent above; mirrors web `showDisclaimerModal` (`practice/page.tsx:2196`) | H2 "Before you begin" · body the FAA-examiner accuracy disclaimer (see §4 / OWNER DECISION D-ONB-3) · primary "I understand — begin" · link "Cancel" | full-card modal `c-bezel`; primary `c-amber`; required, non-skippable per HIG (`02-DESIGN-SYSTEM.md:579`) |
| **Saving / starting** | `POST /api/user/tier` then `POST /api/session create` + `POST /api/exam start` in flight | Start button label → "Starting…" (`:545`), disabled, `opacity-50` | button `disabled:opacity-50`; spinner `c-amber`; haptic deferred until exam first token |
| **Error — prefs save failed** | `POST /api/user/tier` non-2xx or network error | **Non-blocking** — web swallows the error and continues ("Continue anyway — session will still start", `:110-112,144-146`). Native mirrors: log + continue; do **not** block handoff. Optional silent retry once. | none surfaced |
| **Error — session create 403 (trial)** | `POST /api/session create` returns 403 `trial_limit_reached` / `trial_expired` / `resubscribe_required` (§B.3) | **Should not occur for the onboarding exam** (it is `is_onboarding:true`, uncounted). If it ever does (server recomputed onboarding as false), route to the upgrade modal — on iOS launch RevenueCat IAP, not the Stripe web link (§B.3 note) | upgrade modal (separate spec); error haptic `notificationAsync(Error)` |
| **Error — exam start 500** | `POST /api/exam start` 500 ("No elements found…" §B.1.a / "No ACS tasks found…") | Banner "We couldn't start your exam. Please try again." + "Retry" (re-POST start) and "Back" (return to step 6) | `<Annunciator state="error">` `c-red`; `c-red` text clears AA; error haptic |
| **Error — 429 rate limited** | Any onboarding POST hits middleware 429 `rate_limited` | Banner "You're going a little fast. Try again in a moment." Auto-disable the primary button for `Retry-After` seconds, then re-enable | reads `Retry-After` header (§B summary, `middleware.ts:57-68`); button shows countdown; no auto-retry storm |
| **Offline / no network** | No connectivity at start tap | Banner "You're offline. Connect to start your exam." Primary disabled until connectivity returns (subscribe to NetInfo) | `<Annunciator state="warning">` `c-amber`; preference taps (rating/theme) still work locally and persist on reconnect |
| **Success** | All gates passed; exam `start` returns first examiner turn | Modal dismisses; Practice active-exam screen renders the examiner's opening question | handoff to Practice spec; medium-impact haptic on exam start (`02-DESIGN-SYSTEM.md` §7.3) |

### Measurable success criteria
- [ ] Every non-loading state above renders the exact copy string shown (snapshot test against this table).
- [ ] **0** text nodes below 12pt at default Dynamic Type across all states (`02-DESIGN-SYSTEM.md:276`).
- [ ] Prefs-save failure never blocks the exam handoff (inject a 500 on `POST /api/user/tier`; exam still starts — pass/fail).
- [ ] 429 on any onboarding POST disables the primary CTA for exactly `Retry-After` seconds (timed assertion).
- [ ] Permission-denied path leaves the user able to start a **type-only** exam (no dead-end) — pass/fail.
- [ ] The `ai_data_processing` consent card renders the exact processor names (Anthropic, Deepgram, OpenAI) and is acknowledged **before** the FAA-disclaimer gate and before exam `start` (snapshot + network-order assertion).

---

## 4. User flows

### Verbatim copy blocks (mirror web; do not paraphrase)
**Step 5 — "What's included" (`OnboardingWizard.tsx:413-432`):**
- ✓ "1 onboarding exam — pre-configured, starts right away" / "Does not count toward your trial limit"
- ✓ "3 practice exams — full control over settings" / "Choose your study mode, difficulty, and focus areas"
- ✓ "Voice mode, FAA source references, ACS scoring — everything included"

**Step 5 — "What is an exam?" (`:438-444`):** "An exam is one practice session with your AI examiner. You choose the rating, study mode (Area by Area, Random, or Weak Areas), and difficulty level. The examiner asks questions, assesses your answers, and grades your performance. You can pause and resume any exam while your trial is active."

**Step 5 — "After the trial" (`:449-454`):** "Each exam stays available until your trial ends to pause and resume. When your trial ends — after 7 days or once you've used your 3 exams — subscribe to continue with unlimited exams. Plans start at $39/month, billed when you subscribe. No card needed until then." ("$39/month" rendered as a mono tabular numeric readout in `c-amber`.)

**Step 6 — summary rows (`:485-516`):** Rating → `RATING_LABELS[rating]` (+ class chip when ASEL/AMEL/ASES/AMES applies); Study mode → "Area by area (linear)"; Difficulty → "Easy"; Coverage → "All ACS areas (full checkride)"; Aircraft → `{aircraftType} / {homeAirport}` only when at least one is set.

**Step 6 — free badge (`:521-523`):** "Onboarding exam — free, does not count toward your 3 trial exams"

**Step 6 — voice toggle (`:534-535`):** "Enable voice mode" + "(mic + speaker)" — default **checked** (`voiceEnabled` init `true`, `:86`). *(At M2 the toggle is hidden/forced off and the first exam is type-only; it lights up only after the M3 voice-spike GO — see the M2-vs-M3 note in the intro.)*

**AI-data consent gate (`ai_data_processing` — native-authored, no web equivalent; this screen owns the canonical copy):** H2 "How your exam works" · body "Your spoken answers and transcripts are sent to third-party AI providers — **Anthropic** (your AI examiner), **Deepgram** (speech-to-text and text-to-speech), and **OpenAI** (backup text-to-speech) — to run the exam. We don't store raw audio; only transcripts are kept. Tap to consent and begin." · primary "I consent — continue" · link "Learn more" (→ privacy). This is a **separate** consent from the FAA disclaimer and is recorded under `kind:'ai_data_processing'`, `choices:{ third_party_ai_v1: true }` (§B.25). It is shown to **every** user (including M2 type-only) before the first exam. *(Final legal wording is an OWNER/legal sign-off — see OWNER DECISION D-ONB-7; the names Anthropic/Deepgram/OpenAI and the "sent to third-party AI providers" statement are non-negotiable per `05-APPLE-COMPLIANCE.md` §10.)*

### Happy path (numbered)
1. App cold-launches; auth resolves; root layout fetches `GET /api/user/tier` (§B.8). `onboardingCompleted:false` → router presents `/onboarding` modal.
2. **Step 1 (Rating).** User taps a rating card (Private / Commercial / Instrument). Selection tick haptic (`selectionAsync`). State `rating` updates; `showClassPicker = rating ∈ {private,commercial}` (`:91`). Tap **Next**.
3. **Step 2 (Aircraft).** If `showClassPicker`, a 4-pill ASEL/AMEL/ASES/AMES picker shows; else an "Instrument Rating — Airplane" read-only chip (`:265-269`). Optional aircraft type (`maxLength 100`) and home airport (`maxLength 10`, auto-uppercased, `:290`). Tap **Next**.
4. **Step 3 (Name).** Optional display name (`maxLength 50`, autofocus). Primary label is "Next" when non-empty, "Skip" when empty (`:344`). Tap it.
5. **Step 4 (Theme).** Tap a theme card → theme applies **live** app-wide via `setTheme(id)` (`:364-366`). Selection tick haptic. Tap **Next**.
6. **Step 5 (Trial explainer).** Read-only; tap **Got it**.
7. **Step 6 (First exam).** Review pre-configured summary; toggle voice mode (default on). Tap **Start exam now** (medium-impact haptic deferred to actual exam start).
8. **`POST /api/user/tier`** fires with the full prefs payload + `onboardingCompleted:true` (§B.9 / `:96-109`). On success or failure, proceed (non-blocking).
9. **PostHog `onboarding_completed`** fires (`:113`).
10. **AI-data consent gate (`ai_data_processing` — shown to EVERY user, NOT voice-conditional, recorded at M2 too).** Show the AI-data consent card (copy in §3 / §4 verbatim block) naming Anthropic + Deepgram + OpenAI and stating spoken answers/transcripts go to third-party AI providers. On "I consent — continue": `POST /api/consent` with `{kind:'ai_data_processing', choices:{ third_party_ai_v1: true }}` (§B.25; this writes a `consent_records` row and does **not** stamp `disclaimer_acknowledged_at`). This must complete **before** the first exam and **before any audio leaves the device**. Do **not** conflate with the FAA disclaimer below.
11. **Mic-priming (native-only, M3+; only if voice ON & status undetermined).** **Voice-conditional and gated on the M3 voice spike** (`docs/mobile/08-VOICE-SPIKE-M3.md`) — at M2 / voice-OFF this step is **skipped entirely** and the flow goes straight to step 12. When active: show the priming card → "Allow microphone" → OS prompt → granted/denied (see §3). If denied, user may continue type-only.
12. **FAA-disclaimer consent gate (`kind:'disclaimer'` — separate from step 10).** Show the FAA-disclaimer modal (web `showDisclaimerModal`, `practice/page.tsx:2196`). On "I understand — begin": `POST /api/consent` with `{kind:'disclaimer', choices:{acknowledged:true}}` (server stamps `disclaimer_acknowledged_at`, route `api/consent/route.ts:17-50`). **`warmUpAudio()`-equivalent runs synchronously inside this tap ONLY when voice is ON and M3 has shipped** (Safari/iOS autoplay parity, web `practice/page.tsx:2214`; native: pre-create/resume the audio session in the same gesture); at M2 / voice-OFF there is no audio session to warm.
13. **Handoff.** Call `POST /api/session create` with `{action:'create', rating, aircraft_class, study_mode:'linear', difficulty_preference:'easy', selected_areas:[], selected_tasks:[], is_onboarding:true}` (§B.3) → then `POST /api/exam start` with the planner `sessionConfig` → 200 JSON `{taskId, taskData, examinerMessage, elementCode, plannerState, examPlan}` (§B.1.a planner path). Mirrors web `startSession({studyMode:'linear', difficulty:'easy', selectedAreas:[], selectedTasks:[], isOnboarding:true})` (`practice/page.tsx:2005-2016`).
14. Modal dismisses; Practice active-exam screen renders the opening question; medium-impact haptic on first examiner turn.

### Edge cases
- **Skip ("full config →").** Any step's skip link → `POST /api/user/tier` with **only** `{onboardingCompleted:true}` (web `handleSkip`, `:151-159`) → dismiss onboarding → land on the Practice **config** screen (not the auto exam). Mirrors web `onSkip` (`practice/page.tsx:2017-2020`).
- **"Explore first" (Step 6 secondary).** `POST /api/user/tier` with full prefs + `onboardingCompleted:true` (web `handleLearnMore`, `:127-149`) → dismiss → navigate to **Home** tab (web `window.location.href='/home'`, `practice/page.tsx:2021-2025`). No exam starts.
- **Rating switches to Instrument after picking a class.** Class picker hides on Step 2; stored `aircraftClass` is retained but the summary omits the class chip (`showClassPicker` false). Matches web (`:91,492`).
- **Voice toggled OFF at Step 6 (and the default at M2).** Skip mic-priming entirely; handoff with `voiceEnabled:false`; type-only exam. **The `ai_data_processing` consent is still recorded** even in the type-only path (the user may enable voice later, and the consent must precede any future audio capture) — only the mic-priming/warm-up are skipped.
- **Display name empty.** Examiner uses the generic "APPLICANT" label downstream; no name persisted (web sends `null`, `:105`).
- **Consent already acknowledged** (e.g., user re-enters via an edge path). If `disclaimerAcknowledged:true` from `GET /api/user/tier` (§B.8 field), skip the **FAA-disclaimer** gate (web optimistic `disclaimerAcknowledged` default true until profile loads, `practice/page.tsx:170,375`). The `ai_data_processing` consent is tracked by its own `consent_records` row (no profile stamp); if a prior `ai_data_processing` record exists for the user, skip that gate too — otherwise it must be shown and recorded before exam start (see OWNER DECISION D-ONB-8 on how native reads the existing `ai_data_processing` record at launch).

### Back / cancel / interruption
- **Back.** Each step (2–6) has a **← Back** button restoring the prior step's state (all state is local until the final POSTs, `OpiotrWizard` single-component state). iOS interactive swipe-back is **disabled within the wizard's internal steps** (steps are not separate routes; Back is an in-card control); the whole modal is swipe-to-dismiss **only** before the consent gate. Android hardware Back maps to ← Back within steps, and to "skip → config" only from Step 1 (never traps; `02-DESIGN-SYSTEM.md:567`).
- **Cancel from either consent gate.** Cancelling the `ai_data_processing` gate or the FAA-disclaimer gate returns to Step 6 (does not abandon prefs already saved, and does not start the exam). A consent already recorded server-side (e.g., AI-data accepted, then disclaimer cancelled) persists — re-entering need not re-show the already-accepted one. Web "Cancel" closes the disclaimer without starting.
- **App backgrounded mid-wizard.** Local step state is preserved in component/route state for the session; if the OS kills the app, relaunch re-fetches `GET /api/user/tier` — since `onboardingCompleted` was not yet written, the wizard re-presents from Step 1 (acceptable; no partial server state). **OWNER DECISION (D-ONB-2):** whether to persist in-progress wizard state to `AsyncStorage` for resume-after-kill (recommended low priority; web has no such persistence).
- **Phone call / interruption during mic-priming.** Cancel the audio-session warm-up; on return, re-evaluate mic status before proceeding.

### Measurable success criteria
- [ ] Back from any step restores the exact prior selections (no state loss) across all 5 back transitions (pass/fail each).
- [ ] Skip from any step writes **only** `{onboardingCompleted:true}` and lands on Practice config, never the auto exam (network + nav assertion).
- [ ] "Explore first" writes full prefs and lands on Home; **0** session-create calls fire (network assertion).
- [ ] Voice-OFF handoff produces `voiceEnabled:false` and never triggers a mic permission prompt (pass/fail).

---

## 5. API calls

All routes resolve to `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`. The native client sends **Bearer** auth (no cookies) per §A.1 (dual-mode `getAuthedUser()`); every call below honors the §B-summary middleware 429 contract (read `Retry-After`, back off).

| # | Step | Endpoint | Method | Body / params | Success | Errors handled |
|---|---|---|---|---|---|---|
| 1 | Gate (launch) | `/api/user/tier` (§B.8) | GET | Bearer only | 200 `{ onboardingCompleted, disclaimerAcknowledged, preferredRating, preferredAircraftClass, aircraftType, homeAirport, preferredTheme, displayName, voiceEnabled, … }` | 401 → re-auth; 500 → retry; treat missing as **not** onboarded only after a successful 200 (never guess on error) |
| 2 | Complete (Step 6 "Start"/Explore) | `/api/user/tier` (§B.9) | POST | `{ preferredRating, preferredAircraftClass, aircraftType\|null, homeAirport\|null, preferredTheme, displayName\|null, voiceEnabled, onboardingCompleted:true }` (mirror `OnboardingWizard.tsx:96-109`) | 200 `{ok:true}` | 400 (invalid rating/class/theme/len) → log, continue; **all errors non-blocking** (web swallows, `:110-112`) |
| 3 | Skip | `/api/user/tier` (§B.9) | POST | `{ onboardingCompleted:true }` only (`:151-159`) | 200 `{ok:true}` | non-blocking |
| 4a | AI-data consent accept (`ai_data_processing`) | `/api/consent` (§B.25) | POST | `{ kind:'ai_data_processing', choices:{ third_party_ai_v1: true } }` (separate from the disclaimer; `choices` **required** → 400 if absent; route's `kind` coercion must accept `ai_data_processing` — verified M1/M2 edit, §B.25) | 200 `{ok:true}` (writes a `consent_records` row; **no** `disclaimer_acknowledged_at` stamp) | 400 `choices required`, 401, 500 `persist_failed` → per D-ONB-4, block-with-retry (recommended) since this is the store-required AI gate; **must** complete before any audio path |
| 4b | FAA-disclaimer consent accept (`disclaimer`) | `/api/consent` (§B.25) | POST | `{ kind:'disclaimer', choices:{ acknowledged:true } }` (`api/consent/route.ts:21-28`; `choices` is **required** → 400 if absent) | 200 `{ok:true}` (server stamps `disclaimer_acknowledged_at`) | 400 `choices required`, 401, 500 `persist_failed` → allow start anyway only if local ack recorded; **OWNER DECISION D-ONB-4** on whether a failed consent POST should hard-block |
| 5 | Handoff — create | `/api/session` create (§B.3) | POST | `{ action:'create', rating, aircraft_class, study_mode:'linear', difficulty_preference:'easy', selected_areas:[], selected_tasks:[], is_onboarding:true }` | 200 `{session: <row>}` | 403 trial codes → upgrade modal/IAP (should not occur for onboarding); 500 → retry banner |
| 6 | Handoff — start | `/api/exam` start (§B.1.a) | POST | `{ action:'start', sessionConfig:{…linear/easy/all-areas…}, sessionId }` | 200 JSON planner `{ taskId, taskData, examinerMessage, elementCode, plannerState, examPlan, pausedSessionId? }` | 409 `session_superseded` → "resume on this device?" (§B.1); 500 "No elements found…" → retry/back; 429 → backoff |

**Request/response handling.**
- **Order matters:** prefs POST → **`ai_data_processing` consent POST → `disclaimer` consent POST** → session create → exam start. The prefs POST is awaited but **non-fatal**; the two consent POSTs precede the first exam (the `ai_data_processing` one is the store-required AI-data gate — recommended block-with-retry on failure, D-ONB-4); the create/start chain is the only other blocking sequence. At M2 / voice-OFF this order is unchanged except that mic-priming/warm-up between the consents are skipped.
- **Onboarding exam is a planner exam** (sessionConfig present) → expect **JSON** from `start` (§B.1.a planner path), not SSE. Subsequent `respond` calls in the live exam are SSE (Practice spec), not this screen's concern.
- **`pausedSessionId`** may come back if a web exam was active — surface "We paused your other exam on the web" toast (Practice handles; do not block).

**Error / 429 handling (screen-specific).**
- Any 429 (`rate_limited`, middleware): disable the primary CTA, show "You're going a little fast. Try again in a moment.", honor `Retry-After`. Never auto-retry the start chain in a loop.
- `POST /api/user/tier` / `POST /api/consent` failures are logged to PostHog as `onboarding_error` (proposed, §9) but never strand the user.

> **Contract note:** `POST /api/consent` is **now documented** in `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` §B.25 (contract row #25) — both the existing `kind:'disclaimer'` (→ `disclaimer_acknowledged_at` stamp) and the **new, separate `kind:'ai_data_processing'`** (`choices:{ third_party_ai_v1: true }`, writes a `consent_records` row only). The one remaining build dependency (tracked as **OWNER DECISION D-ONB-5**): the route's `kind` coercion (`src/app/api/consent/route.ts:23`) currently maps to `'disclaimer'`/`'cookie'` only and **must be widened to accept `ai_data_processing`** — a verified M1/M2 code edit, called out in §B.25. Do **not** reuse `faa_disclaimer_v1` for the AI-data record.

### Measurable success criteria
- [ ] Network trace on a happy-path onboarding shows exactly: 1× tier GET (launch), 1× tier POST (complete), 1× `ai_data_processing` consent POST, 1× `disclaimer` consent POST, 1× session create, 1× exam start — in that order (HAR assertion). The `ai_data_processing` POST carries `choices:{ third_party_ai_v1: true }` and precedes session create.
- [ ] `is_onboarding:true` is present in the session-create body **and** the resulting exam does not count against the 3-exam cap (count before == count after).
- [ ] A forced 500 on consent POST does not deadlock the flow per the D-ONB-4 decision (pass/fail once decided).
- [ ] All six calls send `Authorization: Bearer <jwt>` and **no** cookie header (§A.1, request-inspection check).

---

## 6. Layout

### Description
Full-screen modal card centered in a dimmed scrim (web `bg-c-bg/95 backdrop-blur-sm`, `OnboardingWizard.tsx:162`). Top: a **6-dot progress indicator** (web `wizard-progress-dots`, `:165-179`) — current dot `c-amber`, completed `c-amber/50`, upcoming `c-border`. Below the dots, a right-aligned **skip link** ("full config →", `c-amber`). The step card itself is a `bezel` panel (`rounded-lg border c-border p-8` → native ≈ 20pt inset) containing: centered H2, centered sub-line, the step's controls, and a button row (Back + primary). Max content width ≈ `max-w-lg` (web `:163`) → on phone this is full-bleed minus 16pt safe-area inset (`02-DESIGN-SYSTEM.md:330,384`); on tablet, cap at ~512pt and center.

**Native navigation pattern.** This is an **expo-router modal route** (`presentation: 'modal'`, full card), **not** a tab and **not** a partial-detent sheet (it is a guided multi-step flow). It has **no large-title nav bar and no Material top app bar** — the progress dots replace the header; an in-card "← Back" replaces the chevron. The consent sub-modal and the mic-priming card are presented in-place within the same modal (state-driven), not as new routes, so the back stack stays shallow. On iOS the modal uses the system form-card corner radius; on Android it is a full-screen Material surface with hardware-Back wired to in-card ← Back.

**Landscape / tablet.** Portrait-first. In landscape on phone, the card scrolls vertically (Step 5's three info wells are tall); never lock orientation. On tablet/iPad, center the ~512pt card with generous side gutters; do not stretch inputs full-width beyond ~512pt.

### ASCII wireframe (portrait — representative Step 6)
```
┌──────────────────────────────────────────┐  ← status bar (safe-area top)
│                                            │
│            ●  ●  ●  ●  ●  ○                 │  // progress dots (4 done, 5 active... here step 6)
│                                            │
│                   I know what I'm doing —  │  ← skip link (c-amber), right-aligned
│                          full config →     │
│  ┌──────────────────────────────────────┐  │
│  │            Your first exam            │  │  ← H2 (Plex bold, c-text, no glow)
│  │  We've pre-configured this exam so    │  │  ← sub (c-muted)
│  │       you can jump right in           │  │
│  │  ┌────────────────────────────────┐   │  │  ← iframe well (recessed)
│  │  │ // RATING        Private Pilot │   │  │     value c-green-readable
│  │  │ // STUDY MODE  Area by area (li…)│  │     // micro-labels = caps-mono
│  │  │ // DIFFICULTY            Easy   │   │  │
│  │  │ // COVERAGE   All ACS areas     │   │  │
│  │  └────────────────────────────────┘   │  │
│  │  ✓ Onboarding exam — free, does not   │  │  ← free badge (c-green-lo bg)
│  │    count toward your 3 trial exams    │  │
│  │  [ ☑ Enable voice mode  (mic+speaker)]│  │  ← toggle (min 44pt row)
│  │  ┌────────────────────────────────┐   │  │
│  │  │        Start exam now          │   │  │  ← primary CTA (c-amber, glow-a)
│  │  └────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────┐   │  │
│  │  │        Explore first           │   │  │  ← secondary (c-bezel)
│  │  └────────────────────────────────┘   │  │
│  │              ← Back                    │  │  ← tertiary link
│  └──────────────────────────────────────┘  │
│                                            │  ← home indicator (safe-area bottom)
└──────────────────────────────────────────┘
```

### Measurable success criteria
- [ ] Modal declared with `presentation:'modal'` and **0** tab bar visible behind it (visual + code check, `02-DESIGN-SYSTEM.md:578`).
- [ ] Content respects 16pt horizontal safe-area inset and bottom home-indicator inset on notched + non-notched devices (`02-DESIGN-SYSTEM.md:384`, pass/fail).
- [ ] Progress dots render 6, with correct done/active/upcoming token states per step (snapshot per step 1–6).
- [ ] Card max width ≤ 512pt on tablet; inputs never exceed it (layout assertion).
- [ ] No control overlaps the status bar or home indicator at any Dynamic Type size (xS, L, xxxL) (`02-DESIGN-SYSTEM.md:306`).

---

## 7. Native components & interactions

### Qualitative requirements
- **System components.** Rating/class/theme selections are **card buttons** (not OS pickers — they are visual cards in the web; keep the bezel/station card pattern, `02-DESIGN-SYSTEM.md` §5). The voice **checkbox** maps to a native row toggle (iOS `Switch`-style or a checkbox row ≥ 44pt). Text inputs are native `TextInput` on `c-panel` wells (aircraft type, home airport, display name). The mic-priming and consent are state-driven cards within the modal, using `<Surface>` (§4.4) and `<Annunciator>`/`<Button>` primitives.
- **Gestures.** No drag-to-dismiss for the consent gate. Steps advance via Next/Back buttons (not swipe-paged) to mirror web exactly and keep the consent gate reliably reachable. Tap targets ≥ 44pt iOS / 48dp Android (web already enforces `min-h-11`).
- **Haptics** (`02-DESIGN-SYSTEM.md` §7.3): rating/class/theme/voice **selection change** → `selectionAsync()`; **Start exam now / consent "I understand"** primary → `impactAsync(Medium)`; an onboarding **error** (start 500, blocked) → `notificationAsync(Error)`. **No** haptic on text entry or Next/Back navigation. Respect the Settings "Haptics" toggle + OS setting.
- **Keyboard handling.** Steps 2 and 3 have inputs: use `KeyboardAvoidingView` so the Next/Back row stays visible; home-airport input forces uppercase + `autoCapitalize="characters"` + `autoCorrect=false` (web uppercases on change, `:290`); display-name input autofocuses (web `autoFocus`, `:334`) and uses `returnKeyType="done"` to advance. Dismiss keyboard on card tap-outside.
- **Safe-area / notch / Dynamic Island.** Honor `useSafeAreaInsets()` top/bottom (`02-DESIGN-SYSTEM.md:330`). The modal content must clear the Dynamic Island (top inset) and home indicator (bottom inset); the progress dots sit below the top inset, the button row above the bottom inset.

### Measurable success criteria
- [ ] Every tappable control measures ≥ 44pt (iOS) / 48dp (Android) hit area (automated measure, pass/fail per control).
- [ ] Home-airport input renders uppercase and rejects lowercase persistence (type "kjax" → stored "KJAX").
- [ ] Keyboard never occludes the active input or the Next button on Steps 2–3 at default and xxxL type (manual + screenshot).
- [ ] Haptics fire **only** on selection changes + primary CTAs + errors; **0** on Next/Back or keystrokes (`02-DESIGN-SYSTEM.md` §7.3 audit).

---

## 8. Accessibility

### Qualitative requirements
- **VoiceOver/TalkBack labels & order.** Reading order per step: progress announcement ("Step N of 6") → H2 → sub-line → controls (in visual order) → primary CTA → secondary/Back. Each rating/theme card exposes `accessibilityRole="button"`, `accessibilityState={{selected}}`, and a combined label (e.g., "Private Pilot, your first certificate, P-P-L"); the `PPL/CPL/IR` code is spelled-out for screen readers (caps-mono is visual only). The voice toggle exposes `accessibilityRole="switch"` + state. Progress dots are a single `accessibilityLabel="Step 6 of 6"` element (decorative dots are not 6 separate announcements).
- **Dynamic Type / font scaling.** All reading text scales to **1.6×**; instrument text (micro-labels, code chips, `$39/month` readout) to **1.3×** (`02-DESIGN-SYSTEM.md:293-294`). Layout must not clip at xxxL — the card scrolls.
- **Contrast ≥ 4.5:1.** All body text uses `c-text`/`c-muted`; faint helper uses `c-dim` (the floor, never below); colored summary values use `c-green-readable`/`c-cyan-readable` (these `-readable` variants exist precisely to clear 4.5:1, `02-DESIGN-SYSTEM.md:643`). No body text on `c-green`/`c-cyan` base.
- **Focus order.** On step change, move accessibility focus to the new H2. The consent gate traps focus until acknowledged or cancelled (required gate).
- **Reduced motion.** With Reduce Motion ON, disable the first-paint stagger and any pulse; theme-swatch and dot transitions become instant (≤ ~100ms, no cross-fade) (`02-DESIGN-SYSTEM.md:598`). Static glow on the primary CTA may remain (it is not motion).

### Measurable success criteria
- [ ] A blind user completes onboarding end-to-end (rating → … → consent → exam) via VoiceOver and TalkBack (scripted screen-reader pass, `02-DESIGN-SYSTEM.md:672`).
- [ ] Every interactive element has a non-empty `accessibilityLabel`; selected state is announced for rating/class/theme/voice (automated a11y scan, 0 violations).
- [ ] All text pairs clear 4.5:1 on the cockpit theme (token-pair audit against `02-DESIGN-SYSTEM.md` §8.1 pass-list).
- [ ] At Dynamic Type xxxL, no step clips or hides a CTA (matrix artifact per step, pass/fail).
- [ ] With Reduce Motion ON, **0** animated transitions exceed ~100ms (measured).

---

## 9. Analytics events

### Qualitative requirements
Mirror web PostHog names where they exist; the only event the web wizard fires is `onboarding_completed` (`OnboardingWizard.tsx:113`, via `captureVoiceEvent`). Add native-only step/permission telemetry as **new** events (clearly namespaced) so the funnel is measurable without renaming the existing event.

| Event | When | Source / status | Properties |
|---|---|---|---|
| `onboarding_completed` | Step 6 "Start exam now" or "Explore first" path completes the prefs POST | **Web parity** (`OnboardingWizard.tsx:113`) | `{ rating, aircraftClass, voiceEnabled, theme, hasDisplayName, path: 'start'\|'explore' }` |
| `onboarding_step_viewed` | Each step render | **New (native)** | `{ step: 1–6 }` |
| `onboarding_skipped` | "full config →" tapped | **New (native)** | `{ fromStep }` |
| `onboarding_mic_prompt_shown` | Mic-priming card shown | **New (native)** | `{ }` |
| `onboarding_mic_permission` | OS returns mic status | **New (native)** | `{ result: 'granted'\|'denied'\|'blocked' }` |
| `onboarding_ai_consent_accepted` | AI-data "I consent — continue" → `ai_data_processing` consent POST 200 | **New (native)** — the separate `ai_data_processing` gate | `{ choices: 'third_party_ai_v1' }` |
| `onboarding_consent_accepted` | FAA disclaimer "I understand" → `disclaimer` consent POST 200 | **New (native)** — mirrors web disclaimer gate | `{ }` |
| `onboarding_error` | Any onboarding POST non-2xx (non-blocking) | **New (native)** | `{ stage: 'tier'\|'ai_consent'\|'consent'\|'create'\|'start', status }` |

Downstream `exam` events (e.g., `session_resumed`, `exchange_completed`, `assessment_scored`) belong to the Practice spec, not this screen.

### Measurable success criteria
- [ ] `onboarding_completed` fires exactly once per finished onboarding with all listed properties populated (event assertion).
- [ ] `onboarding_step_viewed` fires once per step entry (no duplicate on Back→forward re-entry within a debounce) — count check.
- [ ] `onboarding_mic_permission` records the true OS result (granted/denied/blocked) — matches OS state.
- [ ] **0** PII (display name value) is sent in any property (only `hasDisplayName` boolean) — privacy audit.

---

## 10. Store-compliance touchpoints

### Qualitative requirements
- **Two separate gates — AI-data consent (`ai_data_processing`) and the FAA disclaimer (`disclaimer`).** Apple Guideline 5.1.1/5.1.2 (and `05-APPLE-COMPLIANCE.md` §10) require an **explicit, recorded consent to third-party-AI data sharing** before any voice/answer data leaves the device. This is a **new, separate** consent kind `ai_data_processing` (`choices:{ third_party_ai_v1: true }`) — **NOT** the FAA disclaimer — whose copy explicitly names **Anthropic** (examiner LLM), **Deepgram** (STT + TTS), and **OpenAI** (TTS fallback) and states spoken answers/transcripts are sent to third-party AI providers. It is **required, non-skippable**, recorded server-side via `POST /api/consent {kind:'ai_data_processing'}` (§B.25) **before the first exam and before any audio leaves the device** (so it precedes the M3 mic paths even though M2 ships voice-OFF). **This screen is authoritative for that consent's UX + record.** Separately, the **FAA-examiner disclaimer** (HIG 5.1.2(i)) is **also** a required, non-skippable gate before the first exam (`02-DESIGN-SYSTEM.md:579`); it makes clear the examiner is an AI simulation, not an FAA-official assessment, and persists via `POST /api/consent {kind:'disclaimer'}` → `disclaimer_acknowledged_at`. The two are distinct obligations and two distinct records — do not collapse them.
- **Microphone permission (Apple 5.1.1 / Android runtime permission) — M3+, voice-conditional.** The mic prompt and the `NSMicrophoneUsageDescription` Info.plist string / Android `RECORD_AUDIO` rationale apply **only after the M3 voice spike ships** (`docs/mobile/08-VOICE-SPIKE-M3.md`); **M2 onboarding is type-only and triggers no mic permission at all** (which keeps "microphone is the only sensitive permission" true and unprompted at M2). The rationale string must be user-meaningful, e.g. **"HeyDPE uses your microphone so your AI examiner can hear and respond to your spoken answers during practice oral exams."** The priming step explains *why* before the OS prompt (Apple best practice: don't request cold). Denial must not dead-end (type-only fallback) — see §3.
- **No purchase in onboarding (Guideline 3.1.1 boundary).** The onboarding exam is free + uncounted, so **no IAP, no Stripe link, and no price-gated CTA** appears in the wizard. The only money mention is the explanatory "$39/month" copy on Step 5 (informational, not a purchase button). The first actual purchase surface is the separate Upgrade/Paywall screen, reached only on a later `trial_limit_reached`/`trial_expired` 403 — and on iOS that surface uses **RevenueCat IAP** with Restore Purchases + Terms/Privacy links (§B.3 note; payments doc). This screen must **not** introduce a web-checkout link.
- **Account deletion / data controls** are **not** on this screen (they live in Settings per parity) — no requirement here, noted for completeness.

### Measurable success criteria
- [ ] **Both** the `ai_data_processing` consent **and** the FAA-disclaimer gate are encountered before the first exam start on a fresh account 100% of the time, neither dismissable without acknowledging (pass/fail, `02-DESIGN-SYSTEM.md:579`). The `ai_data_processing` copy names Anthropic + Deepgram + OpenAI and is recorded server-side under `kind:'ai_data_processing'` (`third_party_ai_v1`), not `faa_disclaimer_v1`, before any audio leaves the device (`05-APPLE-COMPLIANCE.md` §10).
- [ ] `NSMicrophoneUsageDescription` and Android mic rationale strings are present, non-empty, and describe the examiner use case (Info.plist / manifest check; App Review pre-flight).
- [ ] Mic-denied users can still start and complete a type-only onboarding exam (no dead-end) — pass/fail.
- [ ] **0** purchase CTAs, IAP triggers, or external checkout links render anywhere in the wizard (static + runtime audit; Guideline 3.1.1 / 3.1.3 safe).

---

## 11. MEASURABLE acceptance criteria (engineer / QA checklist)

**Gating & data integrity**
- [ ] Wizard shows iff `GET /api/user/tier` → `onboardingCompleted:false`; never on `true` or on a failed/unknown fetch.
- [ ] Exactly one `POST /api/user/tier` with `onboardingCompleted:true` precedes the exam-start chain.
- [ ] Onboarding exam carries `is_onboarding:true`; the 3-exam trial counter is unchanged before vs. after (`is_onboarding` recomputed server-side, §B.3).
- [ ] Skip writes **only** `{onboardingCompleted:true}` and lands on Practice config; "Explore first" writes full prefs and lands on Home with **0** session creates.

**Flow & state**
- [ ] All 6 steps + (M3) mic-priming + the `ai_data_processing` consent + the FAA-disclaimer consent render the exact copy in §3/§4 (snapshot).
- [ ] Theme selection applies live app-wide on Step 4 (`setTheme` parity).
- [ ] Back restores prior selections across all 5 transitions; consent Cancel returns to Step 6 without losing saved prefs.
- [ ] Prefs-save / consent-save failures are non-blocking per the D-ONB-4 decision; the exam still starts when intended.

**Native quality / HIG-Material**
- [ ] Presented as a modal **over** the tabs; **both** consent gates (`ai_data_processing` + `disclaimer`) non-dismissable until acknowledged; Android Back never traps.
- [ ] All controls ≥ 44pt / 48dp; home-airport forces uppercase; keyboard never occludes inputs/CTAs on Steps 2–3.
- [ ] Safe-area top (Dynamic Island) and bottom (home indicator) insets honored on notched + non-notched devices.
- [ ] Haptics match the §7 table 1:1; **0** on Next/Back or keystrokes.

**Accessibility**
- [ ] Screen-reader (VoiceOver + TalkBack) completes the full flow; 0 unlabeled interactive elements; selected states announced.
- [ ] All text ≥ 12pt; pairs clear 4.5:1; xxxL Dynamic Type clips nothing; Reduce Motion disables stagger/pulse.

**Resilience**
- [ ] 429 on any onboarding POST disables the primary CTA for `Retry-After` seconds; no retry storm.
- [ ] Offline blocks only the start chain (prefs taps still work locally); reconnect resumes.
- [ ] exam-start 500 ("No elements found…") shows the retry banner with working Retry + Back.
- [ ] Mic-denied → type-only exam succeeds (no dead-end).

**Performance budgets**
- [ ] Step transitions render in ≤ **100ms** (no perceptible jank); time-to-interactive for Step 1 after the gate fetch ≤ **400ms** on a mid-tier device (cold prefs cached).
- [ ] "Start exam now" → first examiner token (or opening question render) ≤ **3s** p50 / ≤ **6s** p95 on a good network (covers tier POST + consent POST + create + start); the "Starting…" state must appear within **150ms** of the tap.
- [ ] Onboarding modal mount → first interactive frame ≤ **500ms** (excluding the cold network gate).

---

## OWNER DECISIONS (explicit, not silent TBDs)

- **D-ONB-1 — Deep-link preservation across the onboarding redirect.** Should a cold deep link (`/practice?mode=weak_areas`, `?tasks=…`) for a not-yet-onboarded user be stashed and replayed after onboarding handoff, or dropped (web always lands on the onboarding exam and ignores the params)? *Recommendation: stash + replay after handoff.*
- **D-ONB-2 — Persist in-progress wizard state to AsyncStorage?** Web has no resume-after-kill; relaunch restarts from Step 1. Keep that (cheaper) or persist? *Recommendation: keep web behavior in v1.*
- **D-ONB-3 — Exact FAA-disclaimer copy for the consent gate.** The web modal exists (`practice/page.tsx:2196`, testids `disclaimer-modal`/`disclaimer-begin-button`) but its body text was not read in this pass. The native screen must use the **same approved legal copy**; please confirm the canonical string (and whether it differs by jurisdiction).
- **D-ONB-4 — Should a failed `POST /api/consent` hard-block the first exam?** Web stamps `disclaimer_acknowledged_at` server-side and that field gates exams; if the consent POST fails, do we (a) block with a retry, or (b) allow start on a local ack and reconcile later? *Recommendation: block with retry — the server gate is authoritative.*
- **D-ONB-5 — Widen the `POST /api/consent` `kind` coercion to accept `ai_data_processing`.** The route is live and **now documented** in `01-API-ENABLEMENT-AND-CONTRACT.md` §B.25 (both `disclaimer` and the new `ai_data_processing` kind), but the route's `kind` coercion (`src/app/api/consent/route.ts:23`) currently maps to `'disclaimer'`/`'cookie'` only and **must be widened to accept `ai_data_processing`** (with `choices:{ third_party_ai_v1: true }`) so the AI-data record can be persisted — a verified M1/M2 code edit. Until shipped, the native AI-data consent gate has no server sink.
- **D-ONB-6 — Mic-priming placement.** This spec places mic-priming **after** Step 6 "Start" (just before the FAA disclaimer) so it only prompts users who kept voice ON, **and only at M3+** (M2 is type-only, no prompt). Confirm vs. an alternative (a dedicated Step between Theme and Trial). *Recommendation: keep post-Step-6, voice-conditional + M3-gated, to avoid prompting type-only users.*
- **D-ONB-7 — Exact `ai_data_processing` consent copy (legal sign-off).** This screen owns the canonical AI-data consent copy (H2 "How your exam works" + the Anthropic/Deepgram/OpenAI body in §3/§4). The processor names and the "sent to third-party AI providers" statement are non-negotiable per `05-APPLE-COMPLIANCE.md` §10; the surrounding wording needs OWNER/legal sign-off. Confirm the final string (and any jurisdiction variance) before submission.
- **D-ONB-8 — How does native learn an `ai_data_processing` record already exists?** The FAA disclaimer is reflected back as `disclaimerAcknowledged` on `GET /api/user/tier` (§B.8), but the `ai_data_processing` record is a `consent_records` row with **no** profile field exposed today. Decide whether to add an `aiDataConsented` boolean to `GET /api/user/tier` (recommended — symmetric with `disclaimerAcknowledged`, lets native skip an already-given gate) or to always re-show the AI-data consent on a fresh install until a record is confirmed. *Recommendation: add `aiDataConsented` to §B.8.*
