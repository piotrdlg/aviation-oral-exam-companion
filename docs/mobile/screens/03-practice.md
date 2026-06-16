# Screen Spec 03 — Practice (the core voice + chat oral exam)

> Native-adapted FLIGHT DECK. iOS-first (Expo dev-client, New Architecture), Android follows on the same shared foundation. THE CORE PRODUCT.
> Web source of truth: `src/app/(dashboard)/practice/page.tsx` (2923 lines) + `src/app/(dashboard)/practice/components/SessionConfig.tsx` (475 lines).
> Contract sources cited inline: `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (Part B), `docs/mobile/02-DESIGN-SYSTEM.md`, voice-pipeline + exam-contract + billing/quota grounding briefs.
> Sibling specs: `../00-MOBILE-MASTER-PLAN.md` + `../02-DESIGN-SYSTEM.md` §6 (IA), `02-onboarding.md` (first-run), `07-paywall.md` (IAP). Results are specified in THIS doc (§4.6) — not split out.

This is the longest, most detailed spec in the set because Practice is the whole product: every other screen exists to get the user into, or back out of, this one.

---

## 1. Purpose & role in the product

### Qualitative requirements

Practice is where a checkride applicant runs a simulated FAA DPE oral exam: they pick a rating/study-mode/difficulty, the AI examiner asks ACS-grounded questions, the applicant answers by **voice or text**, each answer is **assessed** (satisfactory / partial / unsatisfactory) against FAA sources, the examiner naturally transitions between elements, and at the end the exam is **graded** (pass ≥ 70%) with a per-area breakdown and weak-element list. It is the single screen that exercises the full stack: exam engine (two Claude calls per exchange), SSE streaming, the planner/scenario state machine, the TTS/STT voice pipeline, RAG citations, the trial/quota gates, and the results grader.

The native screen must be a faithful, **App-Store-quality native interpretation** of the shipped web behavior — not a webview port. It honors iOS HIG / Material 3 for navigation, sheets, gestures, and system audio/mic handling while keeping the cockpit "FLIGHT DECK" identity (dark instrument theme, tri-state annunciator, `// micro-labels`, mono ACS codes, bezel/station/iframe surfaces, attitude-indicator brand mark).

### Measurable success criteria

- [ ] Practice is reachable in **≤ 1 tap** from the primary tab bar (it IS a tab — see §2).
- [ ] All seven core screens parity-checked; Practice covers 100% of these web behaviors: SessionConfig assembly, start, the respond turn loop, SSE render, X-Task-* handling, voice mode (capture + interim + barge-in + TTS), text mode, resume-current, quota/429 → upgrade, end-exam, results display, report-answer, pause.
- [ ] Zero use of a system WebView for the exam UI (native components only). CI/QA assertion: no `react-native-webview` import in `apps/mobile/app/(tabs)/practice/**`.
- [ ] Every API call routes through the shared typed client with `Authorization: Bearer <supabaseAccessToken>` (per `01-API-ENABLEMENT-AND-CONTRACT.md` Part A, `getAuthedUser()` dual-mode helper) — no cookie reliance.

---

## 2. Entry points & navigation, IA placement

### Qualitative requirements

Practice is the **second tab** in a 4-tab bottom tab bar (`Home · Practice · Progress · Settings`), per the expo-router IA in `02-DESIGN-SYSTEM.md`. On iOS it is a native `BottomTabs` (UITabBar); on Android a Material 3 `NavigationBar`. Within the Practice tab is a native **stack** (`expo-router` Stack) whose screens are:

1. `practice/index` — the **config / landing** state (returning user: `SessionConfig` card + resume card + open-exams entry; first-run: launches the Onboarding Wizard as a full-screen route — see `02-onboarding.md`).
2. `practice/exam` — the **active exam** console (the live turn loop). Pushed when an exam starts; this is a focused, immersive screen.
3. `practice/results` — presented as a **native sheet / modal** over the stack on grading completion (large detent), dismissible to return to `practice/index`.

Deep links (mirror web `/practice?mode=…&tasks=…`):
- `heydpe://practice?mode=weak_areas` — preselect study mode (web `practice/page.tsx:135-139`, valid set `linear|cross_acs|weak_areas|quick_drill|scenario`).
- `heydpe://practice?tasks=PA.I.B,PA.II.A` — preselect Focus tasks (`practice/page.tsx:140-144`); these "win" on first load over the per-mode macro (`SessionConfig.tsx:175-178`).
- `heydpe://practice?checkout=success` — post-IAP/Stripe success banner (mirrors web `?checkout=success`; on native the IAP success path uses RevenueCat — see `07-paywall.md`).
- Universal Links / App Links must register `/practice` so web→app handoff lands here.

The exam is **immersive**: while `practice/exam` is focused, the tab bar may remain visible (HIG: do not trap the user), but starting/resuming an exam from another tab routes here. Sign-out lives in the global nav/Settings, never on this screen (web `layout.tsx:53-57`).

### Measurable success criteria

- [ ] Cold-launch deep link `heydpe://practice?mode=weak_areas` opens the Practice tab with "Weak areas" preselected in the config — verified by E2E.
- [ ] Deep link with `tasks=` preselects exactly those task checkboxes (intersected with oral-eligible tasks for the rating, `SessionConfig.tsx:177`); invalid task IDs are dropped, not errored.
- [ ] Switching tabs mid-exam and returning re-shows the live exam at the same scroll/turn state (no remount, no lost audio handle) — see §7 background/foreground.
- [ ] Back-swipe / hardware Back from `practice/exam` does NOT silently discard the exam — it triggers the pause confirmation (§4 edge cases).

---

## 3. Full STATE MATRIX

All copy below is the **exact user-facing string** (sentence-case for prose per THE-ONE-RULE; caps-mono reserved for annunciators/badges/codes). Tokens reference `02-DESIGN-SYSTEM.md` literals from `globals.css`.

### 3.1 Config / landing state (`practice/index`)

| State | Trigger | UI + copy | FLIGHT DECK tokens |
|---|---|---|---|
| **Loading prefs** | `GET /api/user/tier` in flight, `prefsLoaded=false` | Rating/class row shows "Loading preferences…"; examiner row "Loading…" (`SessionConfig.tsx:214,426`) | `.bezel` card; text `c-dim`; skeleton shimmer disabled under reduce-motion |
| **Loading tasks** | `GET /api/exam?action=list-tasks` in flight | ACS area list shows "Loading…" (`SessionConfig.tsx:297`) | `c-dim` |
| **Empty tasks** | tasks query returns `[]` | "No tasks found." (`SessionConfig.tsx:299`) | `c-dim` |
| **First-run** | `onboardingCompleted=false` (from `/api/user/tier`) | Route into Onboarding Wizard (full-screen) — `02-onboarding.md` | n/a |
| **Resume available** | `GET /api/session?action=get-resumable` returns a row WITH `metadata.plannerState` + `metadata.sessionConfig` | Resume card: summary line `{mode} · {scope} · {difficulty}` + `{n} Q&A` + "Resume" / "Discard" actions | `.station` + `ring-1 ring-c-amber/20`; mono `Q&A` readout |
| **Quick-drill locked** | `hasCompletedExams=false` | Quick drill card disabled, sub-label "Complete at least one exam to unlock" (`SessionConfig.tsx:240,261`) | card `opacity-50`, `c-dim` |
| **No weak areas yet** | weak_areas/quick_drill selected, `selectedTasks=[]` after macro | "No weak areas yet — pick tasks below, or the exam will cover everything." (`SessionConfig.tsx:272`) | `c-amber/90` |
| **Ready** | prefs + tasks loaded | Full config card, Start button enabled | Primary button `bg-c-amber text-c-bg` |
| **Trial blocked (on Start)** | `POST /api/session create` → 403 | Upgrade sheet (see 3.3) | — |
| **Checkout success** | `?checkout=success` (verified via `/api/stripe/status` web; RevenueCat entitlement on native) | One-time success banner "You're all set — unlimited practice unlocked." | `c-green-readable`, `.glow-g` on dot only |

### 3.2 Active exam state (`practice/exam`)

| State | Trigger | UI + copy | Tokens |
|---|---|---|---|
| **Starting** | `start` in flight, `loading=true` | Start button "Starting…"; on push, header shows task once `start` returns | `c-dim`; button disabled |
| **Examiner typing (text mode)** | `respond` SSE before first token | 3-dot bounce bubble labeled "DPE EXAMINER" (`practice/page.tsx:2649`) | examiner bubble, amber border-left |
| **Chunk buffering (voice)** | `chunkBuffering=true` between chunks | pulse dots (`practice/page.tsx:2546`) | `annun-pulse` |
| **Examiner speaking** | `voice.isSpeaking || sentenceTTS.isSpeaking` | Annunciator: amber LED + "EXAMINER SPEAKING" (`practice/page.tsx:2686`) | `bg-c-amber`, `text-c-amber`, `annun-pulse`, boxShadow glow |
| **Listening** | `voice.isListening` | Annunciator: cyan LED + "LISTENING…"; composer placeholder "Listening…" (`practice/page.tsx:2687,2731`) | `bg-c-cyan`, `text-c-cyan-readable`, `annun-pulse` |
| **Ready — your turn** | not speaking, not listening | Annunciator: green LED + "READY — YOUR TURN" + "▸ TAP MIC OR TYPE TO ANSWER" (`practice/page.tsx:2688,2696`) | `bg-c-green`, `text-c-green-readable`, no pulse |
| **Assessment shown** | assessment event applied to last student bubble | Annunciator dot + `SATISFACTORY`/`UNSATISFACTORY`/`PARTIAL`/`NOT ASSESSED` badge + feedback (`practice/page.tsx:2564-2582`) | sat=`c-green-readable`, partial=`c-amber`, unsat=`c-red`, ungraded=`c-dim` |
| **Voice retrying** | `voice.isRetrying && voiceEnabled` | Amber banner + spinner "Retrying voice connection…" (`practice/page.tsx:2401-2410`) | `c-amber`, spinner respects reduce-motion (static glyph) |
| **Grading** | `gradingInProgress=true` | "Grade exam" button → "Grading…" (`practice/page.tsx:2395`) | button disabled |

### 3.3 Error states (per failure mode — exact mapping from source)

| Failure | HTTP / signal | User-facing copy (verbatim or required) | Tokens |
|---|---|---|---|
| **Trial: 3 exams used** | `create` 403 `trial_limit_reached` (`session/route.ts:77-89`) | Upgrade sheet — heading "Free exams used", body "You've used all 3 free practice exams. Subscribe for unlimited mock orals." (`practice/page.tsx:112-113`) | sheet `.bezel`; CTA `bg-c-amber` |
| **Trial: 7-day window** | `create` 403 `trial_expired` (`session/route.ts:130-133`) | heading "Trial ended", body "Your free trial has ended. Subscribe to keep practicing for your checkride." (`:116-118`) | — |
| **Churned payer** | `create` 403 `resubscribe_required` (`session/route.ts:115-126`) | heading "Subscription ended", body "Your subscription has ended. Resubscribe to continue practicing for your checkride." (`:114-115`) | — |
| **Per-exam question cap** | `respond` 429 `quota_exceeded`, `limit:'exchanges_per_session'` (`exam/route.ts:423-432`) | heading "Exam question limit", body "You've reached this exam's question limit. Subscribe for longer mock orals and unlimited exams." (`:110-111`) | — |
| **Daily LLM cap** | `respond` 429 `daily_cap_reached`, `limit:'daily_llm_tokens'` (`exam/route.ts:436-447`) | heading "Voice limit reached", body "You've used your free voice allowance. Subscribe for unlimited voice practice." (`:119-123`) | — |
| **Trial expired mid-exam** | `respond` 403 `session_expired` (`exam/route.ts:413-418`) | heading "Trial ended" (maps `session_expired`→trial_expired copy, `:117-118`) | — |
| **Session superseded (other device)** | `respond` 409 `session_superseded` (`exam/route.ts:483-488`) | inline error banner "This exam has been paused on this device. Please end this exam and start a new one." (`practice/page.tsx:870`) | `c-red`, `c-red-dim/40` bg |
| **Session not active** | `respond`/`next-task` 409 `session_not_active` (`exam/route.ts:405-410`) | error banner "This exam can't continue. Start a new one." + "New exam" action | `c-red` |
| **Generic respond failure** | thrown / 5xx | Error-recovery banner + Retry / Text-only / End exam buttons (`practice/page.tsx:2450-2476`); message = `errData.error` or "Failed to get response" | `c-red`; recovery buttons `bg-c-bezel` |
| **Service unavailable (kill switch)** | any 503 `service_unavailable` (`exam/route.ts:341-345`) | "Voice and exam service is briefly unavailable. Please try again in a moment." + Retry | `c-amber` |
| **Voice connection error** | `voice.error` set (STT WS exhausted, `useDeepgramSTT` reconnect → mic released) | banner `voice.error` + "Retry voice" / "Text-only mode" (`practice/page.tsx:2422-2445`); if already off: "Continuing in text-only mode." | `c-red` banner; buttons `bg-c-bezel` |
| **TTS playback failed** | `voice.speak` throws (non-AbortError) | silent fallback: text revealed in full via `flushReveal` (`practice/page.tsx:656-657`); no modal | n/a (graceful) |
| **Report submit failed** | `POST /api/report` !ok | inline "Failed to submit report" (`practice/page.tsx:2896`) | `c-red` |

### 3.4 Offline / degraded

| Condition | Behavior | Copy |
|---|---|---|
| **No network on Start** | `create`/`start` fetch rejects | error banner "You're offline. Reconnect to start an exam." + Retry. Do NOT mark the screen broken. | `c-amber` |
| **Network drop mid-stream** | SSE reader throws / `done` before `examinerMessage` | use accumulated `examinerMsg` fallback (`practice/page.tsx:956`); if empty → error-recovery banner | `c-red` |
| **STT WS drop mid-turn** | reconnect cycles exhausted (`MAX_RECONNECT_CYCLES=2`, voice brief) | mic released (no hot-mic leak), `voice.error` banner; user can type | `c-red` |
| **Slow network** | first SSE > 3 s | keep typing/annunciator indicator; do not time out before server `maxDuration=60` (`exam/route.ts:200`) | — |

### 3.5 Permission-denied (mic)

| Condition | Behavior | Copy |
|---|---|---|
| **Mic permission not yet asked** | first tap of mic OR voice-enabled start | OS permission prompt via `expo-av`/`expo-audio` Audio.requestPermissionsAsync | system dialog; preceded by purpose string (§7) |
| **Mic permission denied** | user denied / Settings-revoked | non-blocking sheet: "Microphone access is off. Turn it on in Settings to answer by voice, or keep typing." + "Open Settings" (deep-link `Linking.openSettings()`) + "Keep typing" | `.bezel` sheet; "Open Settings" `bg-c-bezel`; voice auto-disabled for this session (`voiceEnabled=false`) |
| **Speech-recognition entitlement (iOS)** | n/a — STT is server-side Deepgram, NOT on-device `SFSpeechRecognizer` | No `NSSpeechRecognitionUsageDescription` required; ONLY `NSMicrophoneUsageDescription`. (Confirmed: capture is raw PCM streamed to Deepgram per voice-pipeline brief §4.) | — |

### 3.6 Success state

Live exam runs: examiner asks → applicant answers → assessment badge appears under the student bubble → examiner transitions → … → exam graded → results sheet. See §4.

### Measurable success criteria (state matrix)

- [ ] Every 403/429/409/503 reason code in §3.3 maps to the exact heading/body string shown; QA drives each via a forced server response.
- [ ] No state ever renders a raw error code (e.g. `trial_limit_reached`) to the user — only the mapped copy.
- [ ] Mic-denied path NEVER blocks text answering; the composer stays usable.
- [ ] With the microphone **DENIED** (or never granted), a **full exam is completable by text alone** — start → respond → assess → next-task → grade all succeed via the composer, and a clear affordance ("…or keep typing" sheet + always-visible composer) is shown so the user knows voice is optional (mirrors `../05-APPLE-COMPLIANCE.md` §14: "You can also type your answers instead"). QA drives the denied-permission state end-to-end.
- [ ] Every annunciator state (speaking/listening/ready) is visually distinguishable by **both** color and label text (not color alone) for accessibility.

---

## 4. User flows

### 4.1 Happy path — voice exam (numbered)

> **M2/M3 staging (SHARED #10).** At M2 this screen ships **type-only / voice OFF**: the audio-session priming in step 3, the mic + interim-transcript + barge-in paths, and the entire voice mode below light up **only after the M3 voice-spike GO** (`../08-VOICE-SPIKE-M3.md`). Treat steps 7–8 (TTS + listening) and the `warmUpAudio()` priming as M3-gated; M2 runs the start → respond → assess → next-task loop through the composer alone.

1. User opens Practice tab → config state. Rating/class are read-only (from Settings); "Change in settings →" link.
2. User picks study mode (default **linear**), optionally edits Focus (ACS area tree, tri-state checkboxes), optionally expands "Difficulty & examiner" (default difficulty **mixed**). Summary line updates live: `{mode} · {scope} · {difficulty}` (`SessionConfig.tsx:447-453`).
3. User taps **Start practice exam** (`data-testid=start-exam-button`).
   - **FIRST-EVER exam only**: FAA disclaimer sheet appears (§4 gate below) and must be acknowledged once.
   - On the tap, if voice is enabled, **unlock/prime the audio session synchronously inside the gesture** (native equivalent of `warmUpAudio()` — set `AVAudioSession` category `.playAndRecord`, activate; on Android request audio focus) BEFORE any async work (web `practice/page.tsx:674,810`; critical for iOS autoplay parity).
4. Client `POST /api/session {action:'create', rating, study_mode, difficulty_preference, selected_areas, aircraft_class, selected_tasks, is_onboarding:false}`. On 200 → `session.id` (`session/route.ts:164`). On 403 → upgrade sheet (4.3).
5. Client `POST /api/exam {action:'start', sessionId, sessionConfig}`. Response 200 JSON `{taskId, taskData, examinerMessage, elementCode, plannerState, examPlan, pausedSessionId?}` (`exam/route.ts:726-734`).
   - If `pausedSessionId` present → show "Your exam on another device has been paused. Your progress is saved." toast for 8 s (`practice/page.tsx:762-765`).
6. Push `practice/exam`. Header shows `{area} / {task} [elementCode]` + `0 Q&A` + VOICE pip.
7. Voice ON: examiner bubble starts empty; TTS plays `examinerMessage`; text is revealed progressively as audio starts (`pendingFullTextRef`, paragraph/sentence reveal). Annunciator → speaking → ready.
8. User taps **mic** (or it auto-listens per design) → STT connects (token mint + WS, §5), annunciator → "LISTENING…", interim transcript fills the composer live.
9. User stops (tap mic again, or utterance-end) → composer holds the final transcript. User taps **Send** (or Enter on hardware keyboard).
10. Client `POST /api/exam {action:'respond', taskData, history, studentAnswer, sessionId, sessionConfig, stream:true, chunkedResponse: voice && sentenceStreamEnabled}` (`practice/page.tsx:835-848`).
11. SSE render (§5.3): paragraphs/chunks queue to TTS; assessment event applies a badge to the student bubble; `exchangeCount++`; client fires `POST /api/session {action:'update', exchange_count, acs_tasks_covered, voice_enabled}`.
12. If assessment `advance:true` → after TTS idle, client `POST /api/exam {action:'next-task'}` → transition turn (new task/element) OR `sessionComplete` (`practice/page.tsx:1374-1394`).
13. Loop 8–12 until the user taps **Grade exam** or the plan is exhausted (`sessionComplete`).
14. Grading: `POST /api/session {action:'update', status:'completed', exchange_count, acs_tasks_covered}` → returns `{result, resultV2}` (`session/route.ts:364-368`). Present results sheet (§4.6). Background-fetch `GET /api/exam?action=summary&sessionId=` for the weak-area report (`practice/page.tsx:1458`).

### 4.2 Happy path — text exam

Same as 4.1 minus voice: at step 3 the config's voice toggle is OFF (or auto-disabled by mic-denied). No audio session priming, no mic, no annunciator. At step 11, voice-OFF renders tokens **incrementally into the bubble** as `parsed.token` events arrive, then replaces with the authoritative `parsed.examinerMessage` (`practice/page.tsx:957-970,1039-1052`). The composer is the sole input; Send / Enter submit.

### 4.3 Edge case — quota / trial / churn (the upgrade flow)

- On `create` 403 (`trial_limit_reached` | `trial_expired` | `resubscribe_required`) → `setSessionActive(false)`, present upgrade sheet with reason-aware copy (§3.3), emit `paywall_shown`. CTA "View plans" routes to the **IAP paywall** (`07-paywall.md`) — on iOS this MUST be the RevenueCat purchase sheet (Apple Guideline 3.1.1), NOT a web link.
- On `respond` 429/403 mid-exam → same upgrade sheet but the live exam state is preserved behind it (user can dismiss and still see transcript). Dismiss = `upgrade-dismiss` (`practice/page.tsx:2805`).

### 4.4 Edge case — resume-current (reclaim a paused/active exam)

1. Config state shows a Resume card when `get-resumable` returns a row with planner metadata.
2. Tap "Resume": load transcripts `GET /api/session?action=transcripts&sessionId=` → rebuild `messages` with assessments + sources (`practice/page.tsx:1606-1619`).
3. **If last message is examiner** (question pending): `POST /api/exam {action:'resume-current', sessionId, sessionConfig}` → `{taskId, taskData, elementCode}` (`exam/route.ts:1266-1270`). This call has **claim semantics** — it claims the exam for THIS device (`practice/page.tsx:1627-1628`).
4. **If last message is student** (answer pending): first `resume-current` to reclaim, then `next-task` to generate the next question (`practice/page.tsx:1647-1666`).
5. Push `practice/exam`, scroll to bottom, resume the loop.
6. Open-exams entry: if multiple resumable sessions, an "Open exams" list (native sheet) lets the user pick one or **Discard** (`POST /api/session {action:'discard', sessionId}`, `session/route.ts:170-185`). Discard copy: "Discard this exam? It'll be removed from your open list and marked abandoned — answers you've already given won't count toward Progress or Weak Areas. Want to keep them? Use Grade instead…" (`practice/page.tsx:30-35`).

### 4.5 Back / cancel / interruption

- **Hardware Back / back-swipe on `practice/exam`** with `exchangeCount>0`: intercept and show the Pause confirmation (do NOT discard). Pause = `POST /api/session {action:'update', status:'paused', …}` (`practice/page.tsx:1485-1500`) → returns to config with a Resume card.
- **Grade exam** with `exchangeCount>0`: confirm dialog "Grade and end this exam? Your answers will be scored and you'll see your results." (`practice/page.tsx:2383`) → Grade. With `exchangeCount===0`: grade immediately (no confirm).
- **Tab switch mid-turn**: exam state persists (see §7 background); TTS continues per background-audio policy or pauses and resumes on foreground (OWNER DECISION below).
- **Incoming call / audio interruption**: pause TTS, release mic; on interruption-end, resume "ready" state (do not auto-restart TTS).
- **App backgrounded mid-stream**: SSE may be killed by the OS; on return, if the turn didn't complete, surface the error-recovery banner with Retry (re-send `lastFailedAnswer`).

### 4.6 Results sheet (grading display)

Presented as a native sheet/modal (large detent). Content (mirrors `practice/page.tsx:1714-1810+`):
- **Grade badge**: `SATISFACTORY` (green) / `UNSATISFACTORY` (red) / `INCOMPLETE` (amber) + `{Math.round(score_percentage*100)}%`. Caps-mono badge, mono numeric percent.
- **Element breakdown**: "{elements_asked} of {total_elements_in_set} elements covered" + "{satisfactory} satisfactory · {partial} partial · {unsatisfactory} unsatisfactory · {not_asked} not asked" (`:1748-1756`).
- **Credited by mention** (V2): "{elements_credited} credited by mention" when > 0 (`:1757-1761`).
- **Score by area** (V2 `areas[]`): per-area mini progress bar `{satisfactory}/{asked} ({pct}%)`, red + "FAIL" if `status==='fail'` (`:1765-1793`); fallback to `score_by_area` if no V2.
- **Failed areas note**: "Area(s) {X, Y} below minimum threshold" (`:1795-1798`).
- **Weak elements**: top 10 + "N more" (from `weakAreaReport` background fetch).
- **70% pass threshold** (PARTIAL_CREDIT=0.7, `exam-logic.ts:627`).
- Actions: "Done" (dismiss → config), "View progress" (→ Progress tab), optional "New exam".

### Measurable success criteria (flows)

- [ ] First-ever exam shows the FAA disclaimer sheet exactly once; a **single** "I understand — begin" tap both records consent (`POST /api/consent`) AND starts the exam (the stale-closure `disclaimerOverride=true` fix, `practice/page.tsx:2227-2230`) — verified no "one click does nothing" regression (this was bug fixed in PR #58).
- [ ] Audio session is primed synchronously in the Start/Send gesture; first TTS plays on iOS with the ringer/silent switch handling matching policy (OWNER DECISION below) — no silent-first-utterance.
- [ ] Resume of an examiner-pending session shows the pending question and accepts an answer without generating a duplicate question.
- [ ] Back-swipe mid-exam never abandons the session silently; pause confirmation always fires when `exchangeCount>0`.
- [ ] Results grade, %, counts, and per-area bars exactly match the `result`/`resultV2` returned by `session update` (golden-fixture comparison).

---

## 5. API calls (exact endpoints, methods, contract refs)

All requests carry `Authorization: Bearer <token>` and `Content-Type: application/json`. Endpoints, codes, and shapes per `01-API-ENABLEMENT-AND-CONTRACT.md` Part B and the exam/session route source. Native client uses the **fetch-with-retry** rule: retry ONCE on 405/502/503/504 after 500 ms (web `practice/page.tsx:42-49`).

| Step | Method + endpoint | Body / params | Success | Errors handled |
|---|---|---|---|---|
| List tasks (config) | `GET /api/exam?action=list-tasks&rating=<r>` | — | `200 {tasks:[{id,area,task,applicable_classes}]}` (`exam/route.ts:213-225`) | 500 → empty list (silent) |
| Element scores (config Focus pre-fill) | `GET /api/session?action=element-scores&rating=<r>` | — | `200 {scores:ElementScore[]}` (`session/route.ts:426-438`) | non-ok → `{scores:[]}` |
| Resumable (one) | `GET /api/session?action=get-resumable` | — | `200 {session: row|null}` (`session/route.ts:471-485`) | — |
| Resumable (all) | `GET /api/session?action=get-all-resumable` | — | `200 {sessions:[…]}` (`session/route.ts:488-501`) | — |
| Tier / prefs / onboarding | `GET /api/user/tier` | — | tier, prefs, onboardingCompleted | — |
| Flags | `GET /api/flags` | — | `tts_sentence_stream` (default OFF) etc. | — |
| Create session | `POST /api/session` | `{action:'create', rating, study_mode, difficulty_preference, selected_areas, aircraft_class, selected_tasks, is_onboarding}` | `200 {session: row}` (`session/route.ts:164`) | **403** trial_limit_reached / trial_expired / resubscribe_required → upgrade sheet; 500 → error |
| Start exam | `POST /api/exam` | `{action:'start', sessionId, sessionConfig}` | `200 {taskId, taskData, examinerMessage, elementCode, plannerState, examPlan, pausedSessionId?}` (`exam/route.ts:726-734`) | 500; 409 superseded |
| Respond (turn) | `POST /api/exam` | `{action:'respond', taskData, history, studentAnswer, sessionId, sessionConfig, stream:true, chunkedResponse}` | **SSE** stream (§5.3) + headers `X-Task-Id` (`exam/route.ts:1092-1098`) | 429 quota_exceeded/daily_cap_reached; 403 session_expired; 409 session_superseded/session_not_active; 503 |
| Next task (advance) | `POST /api/exam` | `{action:'next-task', sessionId, sessionConfig}` | `200 {taskId, taskData, examinerMessage, elementCode, plannerState, examPlan}` OR `{examinerMessage, sessionComplete:true}` (`exam/route.ts:1503-1610`) | 5xx → log, stay on current |
| Resume current | `POST /api/exam` | `{action:'resume-current', sessionId, sessionConfig}` | `200 {taskId, taskData, elementCode}` (`exam/route.ts:1266-1270`); or `{sessionComplete:true}` | 400 missing; 404 task not found |
| Load transcripts (resume) | `GET /api/session?action=transcripts&sessionId=<id>` | — | `200 {transcripts:[{role,text,assessment}]}` (`session/route.ts:504-533`) | 404 not owned |
| Update session (per turn) | `POST /api/session` | `{action:'update', sessionId, exchange_count, acs_tasks_covered, voice_enabled}` | `200 {ok:true, result, resultV2}` (`session/route.ts:364-368`) | 400 `use_discard_action` if status=abandoned |
| Grade (complete) | `POST /api/session` | `{action:'update', sessionId, status:'completed', exchange_count, acs_tasks_covered}` | `200 {ok, result, resultV2}` | 500 → still clean up UI |
| Pause | `POST /api/session` | `{action:'update', sessionId, status:'paused', …}` | `200 {ok}` | — |
| Discard | `POST /api/session` | `{action:'discard', sessionId}` | `200 {ok:true}` (`session/route.ts:170-185`) | 400 missing |
| Weak-area summary | `GET /api/exam?action=summary&sessionId=<id>` | — | `200 {report: WeakAreaReport}` (`exam/route.ts:229-310`) | 404 no V2 → render without citations |
| Report answer | `POST /api/report` | `{report_type:'inaccurate_answer', session_id, details:{exchange_number, error_type, comment, examiner_text_snippet}}` | `200` (`practice/page.tsx:2878-2891`) | non-ok → inline error |
| Consent (first exam) | `POST /api/consent` | `{kind:'disclaimer', choices:{faa_disclaimer_v1:true}}` | best-effort (non-blocking) (`practice/page.tsx:2217-2221`) | swallow error |
| TTS | `POST /api/tts` | `{text}` (client never sends `voice`) | raw `audio/mpeg` MP3 bytes, 22050 Hz mono (`tts/route.ts:179-188`) | 429 quota → upgrade; 503 kill-switch; 500 → text fallback |
| STT token | `GET /api/stt/token` | (native PCM) MUST request the linear16 URL — see §5.2 | `200 {token, url, expiresAt, flux}` (`stt/token/route.ts:190-203`) | 429 (4/min); 500 |

### 5.1 Server-state authority (do not fight it)

`taskData`, `plannerState`, `sessionConfig`, `examPlan` are **server-owned** when `sessionId` exists (`exam/route.ts:451-454`). The client sends its copies for backward-compat but MUST treat the server's returned values as authoritative and re-render from them. The native client never persists exam state locally beyond what's needed to render the current turn; the source of truth is `exam_sessions.metadata`.

### 5.2 STT token — native PCM requirement

Native capture is **linear16 PCM @ 16 kHz** (no container), unlike web's Opus/WebM. Per `01-API-ENABLEMENT-AND-CONTRACT.md` Part A item 4 + voice-pipeline brief §4: the mobile client MUST hit the token endpoint such that the returned `wss` URL carries `encoding=linear16&sample_rate=16000` (an allowlisted passthrough; requires the `GET(request)` signature change). Otherwise Deepgram auto-detect mis-decodes raw PCM. WS subprotocol: `['bearer', <jwt>]` (the `auth/grant` JWT starts `eyJ`, voice-pipeline brief §2).

### 5.3 SSE contract (respond) — the critical render loop

Per voice-pipeline + exam-contract briefs and `exam-engine.ts:500-707`. **No named `event:` field**; every line is `data: <json>`; discriminate by which JSON key is present; ignore `: keep-alive` comments; terminate on literal `[DONE]`.

Event variants the native parser MUST handle (web `practice/page.tsx:933-1097`):
1. `{chunk:'feedback_quick'|'feedback_detail'|'question', text, serverTs}` — structured 3-chunk (only when `chunkedResponse:true`); enqueue each to sentence-TTS; accumulate into `examinerMsg` fallback. `safetyNet:true` variant when model ignored JSON.
2. `{token}` — incremental token (non-structured); voice-OFF appends to bubble live; voice-ON accumulates silently.
3. `{paragraph}` — voice-ON only; P1 adds the examiner bubble + hides loading + stops listening; queue each for sequential TTS; **reveal each paragraph's text the moment its audio is about to play** (resolve-on-ready callback), not before — keeps text/voice in sync (`practice/page.tsx:972-1038`).
4. `{examinerMessage}` — authoritative final text (always).
5. `{asset:SelectedAsset}` + legacy `{images}` — images + text cards, gated on `NEXT_PUBLIC_SHOW_EXAM_IMAGES==='true'` (native: a build/remote flag; default OFF in v1 unless owner enables).
6. `{assessment: AssessmentData & {advance?}}` — score + `advance` + `rag_chunks`→sources. UNGRADED fallback shape on assessment failure (score `'ungraded'`, generic feedback). Carries the **advancement decision**.
7. `: keep-alive` comment every 2 s — ignore.
8. `[DONE]` — terminate; then flush decoder and re-scan the trailing buffer for a late assessment event (`practice/page.tsx:1104-1127`).

Native SSE: use `fetch` with `ReadableStream` reader + `TextDecoder` (the web approach) — RN's `fetch` does NOT expose `response.body` reliably, so use `expo/fetch` (streaming fetch) or `react-native-sse` configured for `data:`-only parsing. The line-buffering (`buffer.split('\n')`, keep incomplete tail) must be replicated exactly.

### Measurable success criteria (API)

- [ ] Native SSE parser passes the same fixtures as web: a 3-chunk structured stream, a token+paragraph stream, an assessment-only late-buffer stream, and an UNGRADED-fallback stream — byte-identical render output.
- [ ] `X-Task-Id` header read on respond; `X-Task-Data` base64 header decoded on the legacy streamed-start path (if used) per `exam/route.ts:773-781`.
- [ ] Every 429/403 from `respond` shows the upgrade sheet within 1 frame of the error parse; no silent failure.
- [ ] STT WS connects with `encoding=linear16&sample_rate=16000` present in the URL (assert via the token response `url`); a 4th token request inside 60 s is rate-limited (429) and the client backs off, not crashes.
- [ ] All session writes are fire-and-forget except `create`/grade; a failed per-turn `update` never blocks the turn loop (web parity, `.catch(()=>{})`).

---

## 6. Layout + native navigation pattern

### 6.1 Config state (`practice/index`) — portrait wireframe

```
┌─────────────────────────────────────┐  iOS: large-title nav "Practice"
│  Practice                            │  Android: M3 top app bar "Practice"
├─────────────────────────────────────┤
│ ┌─ Resume card (.station, if any) ─┐ │
│ │ // OPEN EXAM                      │ │  mono micro-label, c-cyan
│ │ Area by area · 3 areas · Mixed    │ │  sentence-case summary
│ │ 12 Q&A           [Resume][Discard]│ │  mono Q&A readout
│ └───────────────────────────────────┘ │
│ ┌─ New exam (.bezel card) ─────────┐  │
│ │ New exam                          │ │  H3 sentence-case
│ │ ┌ Private Pilot · ASEL  Change → ┐│ │  read-only, link c-amber
│ │ // STUDY MODE                     │ │
│ │ [Area by area][Across the ACS]    │ │  2-col grid, .station when active
│ │ [Weak areas ][Quick drill 🔒]     │ │  locked card opacity-50
│ │ // FOCUS                          │ │
│ │ ┌ ACS Areas — Private Pilot ─────┐│ │  iframe well
│ │ │ ☑ I   Preflight prep   3 tasks▾││ │  tri-state checkbox, mono numeral
│ │ │   ☑ Pilot qualifications        ││ │  task rows
│ │ │ – II  Preflight proc.  4 tasks▸││ │
│ │ └─────────────────────────────────┘│ │
│ │ ▼ Difficulty & examiner            │ │  collapsible secondary
│ │ Area by area · All 30 tasks · Mixed│ │  mono summary line, centered
│ │ [        Start practice exam      ]│ │  primary bg-c-amber, full-width
│ └────────────────────────────────────┘ │
├─────────────────────────────────────┤
│  🏠 Home  🎙 Practice  📊 Progress  ⚙︎│  bottom tab bar (Practice active)
└─────────────────────────────────────┘
```

### 6.2 Active exam (`practice/exam`) — portrait wireframe

```
┌─────────────────────────────────────┐  immersive; nav back = pause-confirm
│ PA.I / Pilot Qualifications [PA.I.A.K1]│  sticky frosted header, mono task
│            3 Q&A  ●VOICE [Pause][Grade]│  mono readout, green blink pip
├─────────────────────────────────────┤
│ ┌avatar┐ DPE EXAMINER                 │  examiner bubble, amber border-left
│ │      │ What documents must be       │
│ │      │ aboard for this flight?      │  IBM Plex sentence-case, ≤68ch
│ └──────┘                              │
│                  APPLICANT  ┌avatar┐  │  student bubble right, cyan
│  The required documents are…│      │  │
│   ● SATISFACTORY  Good — you covered…│  annunciator dot + caps-mono badge
│   ▸ FAA References (AIM, FAR 91.203) │  details disclosure, doc chips
│                                       │
│              [ ↓ scroll to bottom ]   │  FAB when not at bottom
├─────────────────────────────────────┤
│ ● READY — YOUR TURN  ▸ TAP MIC OR…    │  tri-state annunciator (above console)
│ ┌─ .station console ────────────────┐ │
│ │ [ Type your answer… (Enter to send)││ │  auto-grow textarea 60–168px
│ │                          ][🎙][➤] │ │  mic (voice only) + send, right-grouped
│ │ I don't know                       │ │  canned-answer shortcut
│ └────────────────────────────────────┘ │
│                 (safe-area inset)       │
└─────────────────────────────────────┘
```

### Qualitative requirements

- Config uses an **iOS large-title nav bar** ("Practice") / **Material 3 top app bar**; it's a scroll view of `.bezel`/`.iframe` cards.
- Active exam is an **immersive stack screen**: sticky frosted task header pinned to the top safe-area; chat list fills the middle (inverted/bottom-aligned, `mt-auto` semantics, max 68ch measure); annunciator + composer pinned to the bottom safe-area as a "unified examiner console" (`.station rounded-xl border-c-border-hi`).
- Results is a **native sheet** (large detent) over the stack, with a grabber and swipe-to-dismiss.
- Upgrade / report / disclaimer / discard-confirm / open-exams are **native sheets or alerts** (not full-screen routes) — HIG `.sheet`, Material `ModalBottomSheet`.
- **Tablet / landscape**: config and chat scale to a centered max-width (68ch chat measure preserved); on iPad the results sheet uses a form-sheet presentation; landscape keeps the composer pinned and the keyboard-avoiding inset correct.

### Measurable success criteria (layout)

- [ ] Composer and annunciator never overlap the home indicator / nav bar — bottom safe-area inset respected on all devices (notch, Dynamic Island, gesture nav).
- [ ] Chat measure ≤ 68ch on phones and tablets (`practice/page.tsx:2490`).
- [ ] Sticky task header stays visible while the chat scrolls (does not scroll away).
- [ ] Keyboard open: composer rises with the keyboard (keyboard-avoiding), the last message stays visible, no content jump > 4px.
- [ ] All sheets present with native physics + grabber; swipe-down dismiss works on the results, upgrade, and report sheets.

---

## 7. Native components & interactions

### Qualitative requirements

- **Audio session**: `expo-av` / `expo-audio`. On voice exam start/send, synchronously set category `playAndRecord` (iOS) and request audio focus (Android) inside the user gesture — the native `warmUpAudio()` equivalent (web `practice/page.tsx:674,810,2214`). TTS plays MP3 via the native player (resolve-on-**END** contract preserved from `useVoiceProvider.speak`, voice-pipeline brief §3). Prefetch the next paragraph/sentence while the current plays (the prefetch-Map contract).
- **Mic capture**: native PCM (linear16/16 kHz) — `expo-audio` recording stream OR a small native module; frames streamed over the Deepgram WS. NOT `MediaRecorder`. Interim transcript from `Results` events fills the composer live; `is_final` appends (dedup vs last final).
- **Barge-in**: typing in the composer OR tapping the mic while TTS is speaking immediately stops TTS (abort in-flight fetch + stop player + clear prefetch) and flushes the full text so nothing is hidden (web `practice/page.tsx:2714-2719,2742-2746`). This is the single most important interaction to get right.
- **Gestures**: swipe-down to dismiss sheets; back-swipe on exam → pause-confirm; long-press a doc chip → copy citation (optional). No custom gesture conflicts with the tab swipe.
- **Haptics** (`expo-haptics`, per `02-DESIGN-SYSTEM.md` haptic vocabulary): light impact on mic start; selection tick on study-mode/difficulty pick; success notification on a satisfactory assessment; warning notification on unsatisfactory; medium impact on Grade. Glow visuals only on instrument moments (annunciator LED, VOICE pip).
- **Keyboard**: hardware Enter sends (Shift+Enter newline); on-screen keyboard "send"/return submits; `KeyboardAvoidingView` keeps the composer above the keyboard; dismiss on scroll.
- **Safe-area / insets**: top inset for the frosted task header; bottom inset for the console; Dynamic Island never overlaps the header content; landscape uses left/right insets.

### Measurable success criteria (native interactions)

- [ ] Barge-in stops audible TTS in **≤ 150 ms** from the first keypress / mic tap (measured), and the full examiner text is then visible (no hidden remainder).
- [ ] Interim transcript latency: words appear in the composer within **≤ 500 ms** of speech (Nova-3 interim).
- [ ] TTS `speak()` resolves on playback **end**, so the sequential paragraph drain never overlaps two audios — assert no concurrent player instances.
- [ ] Audio session correctly ducks/pauses on interruption (call, Siri) and the mic is released; no hot-mic after WS reconnect exhaustion (voice-pipeline brief §5).
- [ ] Haptics fire on exactly the events listed; disabling system haptics suppresses them (no crash).
- [ ] `NSMicrophoneUsageDescription` purpose string present and shown before the first prompt: "HeyDPE uses your microphone so you can answer the examiner's questions by voice." (no speech-recognition entitlement needed — STT is server-side).

> **OWNER DECISION — background audio + silent switch.** v1 default: TTS does NOT play when iOS is backgrounded (no `UIBackgroundModes:[audio]`), and TTS plays through the ringer/silent switch by using `playAndRecord` with default options (so it is audible even on silent). Confirm whether v1 should (a) keep playing TTS in background, and (b) respect or override the silent switch. Recommendation: respect HIG, play audible during foreground only, pause on background.

---

## 8. Accessibility

### Qualitative requirements

- **VoiceOver / TalkBack order** (exam): task header → newest examiner message → its assessment badge (announced as e.g. "Assessment: satisfactory. {feedback}") → annunciator state → composer → mic → send → "I don't know". New examiner turns post an `accessibilityLiveRegion="polite"` / `AccessibilityInfo.announceForAccessibility` so blind users hear the question even in voice-off mode.
- **Labels**: mic button label "Start recording" / "Stop recording" (matches `title` in `practice/page.tsx:2758`); send "Send answer"; pause "Pause exam"; grade "Grade and end exam"; scroll FAB "Scroll to bottom" (`practice/page.tsx:2670`); report flag "Report this answer". Caps-mono codes (`PA.I.A.K1`) get a spelled-out accessibility label ("Element P A one A, knowledge one") OR are read verbatim with `accessibilityLabel` overriding the glyphs.
- **Dynamic Type / font scaling**: per `02-DESIGN-SYSTEM.md` clamped bounds per role — reading text (IBM Plex) scales fully; mono annunciator labels and ACS codes scale within clamp (don't break the LED row). The composer textarea grows with text size. Never render below the 12px floor; never 10px.
- **Contrast**: all text token pairs clear 4.5:1 — use `-readable` cyan/green variants for any colored text (assessment badges, annunciator labels), `c-text`/`c-muted`/`c-dim` for body. UNSAT red `#ff5a4d` on dark clears AA.
- **Focus order**: logical, no traps; sheets move focus to the sheet and restore on dismiss.
- **Reduced motion**: disable annunciator pulse, mic ripple, scanline animation, and any token-stream "typing" motion (show text in larger reveals). Glow becomes a static border. (`prefers-reduced-motion` → `02-DESIGN-SYSTEM.md` motion rules.)
- **Color independence**: assessment + annunciator states conveyed by label text, not color alone.

### Measurable success criteria (a11y)

- [ ] VoiceOver reads a full exchange (question → answer → assessment) in correct order with no skipped/duplicated nodes — audited on a real device.
- [ ] All interactive controls expose a non-empty `accessibilityLabel` and `accessibilityRole`; touch targets ≥ 44pt (iOS) / 48dp (Android) — mic, send, pause, grade, FAB, report all pass.
- [ ] At the largest Dynamic Type / 200% font scale, no text is clipped, the composer remains usable, and the annunciator row wraps gracefully (LED + label legible).
- [ ] Automated contrast check passes ≥ 4.5:1 for every text/background pair on this screen (the token pass-list in `02-DESIGN-SYSTEM.md`).
- [ ] With Reduce Motion ON, no looping animation runs; assessment/annunciator still fully communicated.
- [ ] New examiner turn is announced via a live region in voice-off mode (verified with screen reader on).

---

## 9. Analytics events (mirror web PostHog names)

Emit through the shared analytics client (server- and client-side parity). Names that already exist on web MUST be reused verbatim (per `CLAUDE.md` PostHog funnel list + `voice-telemetry.ts`):

| Event | When | Properties |
|---|---|---|
| `voice_mode_toggled` | voice on/off at config or in-session | `{enabled, at:'session_config'｜'in_session'}` (`practice/page.tsx:696`) |
| `exchange_completed` | after each respond turn finishes | `{session_id, exchange_count, score, advance}` |
| `assessment_scored` | assessment event applied | `{session_id, score, has_misconceptions}` |
| `session_resumed` | resume-current flow completes | `{session_id, pending:'examiner'｜'student'}` |
| `quota_warning_shown` | soft quota warning surfaced | `{reason}` |
| `paywall_shown` | upgrade sheet shown | `{reason, session_id}` (`practice/page.tsx:735,856,864`) |
| `upgrade_clicked` | "View plans" tapped | `{source:'quota_modal'}` (`practice/page.tsx:2798`) |
| `weak_area_drill_started` | quick_drill/weak_areas exam started | `{rating, study_mode}` |
| `settings_voice_changed` | (settings; referenced for parity) | — |
| `voice_retry_clicked` | "Retry voice" tapped | `{session_id}` (`practice/page.tsx:2427`) |
| `voice_auto_disabled` | fell back to text-only | `{reason:'user_chose_text_only'｜…, session_id}` (`practice/page.tsx:2436`) |
| `trial_blocked` | server emits on `create` 403 (server-side) | `{reason}` |

Plus native-only (new, namespaced to avoid funnel pollution): `mobile_exam_started`, `mobile_results_shown`, `mobile_mic_permission_result {granted}`, `mobile_barge_in`.

### Measurable success criteria (analytics)

- [ ] Every event above fires exactly once per trigger (no double-fire on the SSE assessment event); verified in a PostHog debug session.
- [ ] Property shapes match the web schema for the shared names (same keys/types) so the existing funnel stays intact.
- [ ] `paywall_shown` → `upgrade_clicked` → (IAP purchase) funnel is traceable end-to-end on device.

---

## 10. Store-compliance touchpoints (relevant to this screen)

### Qualitative requirements

- **IAP is the purchase path on iOS** (Apple Guideline 3.1.1): the upgrade sheet's "View plans"/CTA on iOS MUST open the **RevenueCat** native paywall and complete via StoreKit IAP. It MUST NOT deep-link to the Stripe web checkout or mention external purchase on iOS. (Android may link to Stripe per the locked payments decision; see `07-paywall.md`.) The trial gate (3 exams / 7 days) is enforced server-side and is provider-agnostic; an IAP entitlement must satisfy the same `isPaying` / `tier==='dpe_live'` gate via the server-side entitlement merge (billing/quota brief: RevenueCat M4).
- **Restore purchases**: the paywall (reached from here) must offer "Restore purchases" (Apple 3.1.1) — out of scope for this screen's body but the upgrade CTA must route to a paywall that has it.
- **Terms / Privacy**: the FAA disclaimer sheet (first exam) and the upgrade sheet must link to Terms and Privacy (Apple 3.1.2 / 5.1.1). The disclaimer's "study aid, not FAA-approved, AI can make mistakes, not a substitute for a CFI/DPE" copy is a safety + truthfulness requirement (`practice/page.tsx:2201-2203`).
- **No external-payment nudges** anywhere in the exam UI on iOS.
- **UGC / report path**: the "Report inaccurate answer" flow (`POST /api/report`) is the user-reporting mechanism (Apple 1.2 for AI-generated content) — must be reachable per examiner message.
- **Account deletion** lives in Settings (in-app, Apple 5.1.1(v)) — not on this screen, but the IA must guarantee it's reachable; cross-reference `06-settings.md`.

### Measurable success criteria (compliance)

- [ ] On iOS, tapping any upgrade CTA on this screen opens a StoreKit/RevenueCat purchase sheet — zero web-checkout or external-price mentions (App Review screenshot evidence).
- [ ] The first-exam disclaimer sheet is shown before any exam and contains the three safety bullets verbatim + Terms/Privacy links.
- [ ] Every examiner message exposes a "Report" affordance reaching the report sheet.
- [ ] Server entitlement merge: an IAP-purchased account hits `tier==='dpe_live'` and the trial gate is bypassed on the very next `create` (no double-charge with Stripe, no stacking) — verified end-to-end.

---

## 11. MEASURABLE acceptance criteria (engineer / QA pass-fail checklist)

### Functional parity

- [ ] Config assembles a valid `SessionConfigData` (rating, studyMode, difficulty default `mixed`, aircraftClass, selectedAreas derived from selectedTasks, selectedTasks, voiceEnabled, examinerProfileKey default `maria_methodical`) — matches `SessionConfig.tsx:456-465`.
- [ ] Oral-only task filter enforced: flight-only areas (IV/V/X) are never offered in the picker (`SessionConfig.tsx:111`, `isOralTaskId`).
- [ ] Quick-drill is locked until `hasCompletedExams`; scenario ("Mock checkride") shows only when `scenarioModeAvailable`.
- [ ] Per-mode Focus pre-fill: weak_areas → struggled tasks; quick_drill → struggled ∪ never-practiced; others → all oral tasks; deep-link tasks win on first load (`SessionConfig.tsx:172-189`).
- [ ] Start → create → start sequence; on success the exam screen shows `examinerMessage` and the header `area / task [element]`.
- [ ] Respond turn: SSE parsed per §5.3; assessment badge applied to the correct (last) student bubble; sources rendered as dedup doc chips linking to faa.gov/ecfr.
- [ ] `advance:true` triggers `next-task` after TTS idle; `sessionComplete` triggers grading.
- [ ] Resume-current claims the exam and shows the pending question/next turn correctly for both examiner-pending and student-pending cases.
- [ ] Grade returns `{result, resultV2}`; results sheet renders grade/%/counts/per-area/failed-areas/weak-elements exactly.
- [ ] "I don't know" sends the canned answer "I don't know the answer to this question." (`practice/page.tsx:2782`).

### Error / quota handling

- [ ] Each of the 9 error rows in §3.3 produces its mapped copy and the correct affordance (upgrade sheet / inline banner / recovery buttons).
- [ ] Error-recovery banner offers Retry / Text-only / End exam; Retry re-sends `lastFailedAnswer`.
- [ ] A failed per-turn `session update` never blocks the next turn.

### Voice pipeline

- [ ] Mic-denied keeps text answering fully functional.
- [ ] Barge-in (type or mic-tap during TTS) stops audio ≤ 150 ms and reveals full text.
- [ ] STT WS uses `linear16/16000` URL + `['bearer', jwt]` subprotocol; reconnects ≤ 2 cycles, refreshes token within 30 s of expiry, releases mic on exhaustion.
- [ ] TTS plays MP3 (`audio/mpeg`), resolves on END, prefetches next segment; reduced-motion still reveals text.

### Performance budgets

- [ ] **Time-to-interactive** of the config screen ≤ **1.5 s** after tab tap on a mid-tier device (tasks/prefs may still be loading but the form is interactive).
- [ ] **Answer-submitted → first SSE event** rendered ≤ **2.5 s** p50 / ≤ **5 s** p90 on good network (server `maxDuration=60` is the ceiling).
- [ ] **First TTS audio audible** ≤ **2 s** after the examiner's first paragraph event (voice mode), p50.
- [ ] Chat list scroll holds **≥ 58 fps** with 40+ messages; no jank on new-turn insert.
- [ ] Memory stable across a 30-exchange exam (no leak from audio buffers / SSE readers); cold start of the tab < 400 ms after first launch.

### UI invariants

- [ ] Caps-mono + glow appear ONLY on: annunciator labels/LED, VOICE pip, assessment badges, ACS/element codes, the `Q&A` numeric readout, and `// FOCUS`/`// STUDY MODE` micro-labels. All prose (questions, feedback, copy) is IBM Plex sentence-case, no glow.
- [ ] No text smaller than 12px anywhere on the screen.
- [ ] Touch targets ≥ 44pt/48dp for mic, send, pause, grade, FAB, report, study-mode cards, difficulty pills, checkboxes.
- [ ] Surfaces: cards `.bezel`, recessed pickers `.iframe`, the live console + active study-mode card `.station` with `ring-1 ring-c-amber/20`.
- [ ] Annunciator tri-state is correct for every (speaking, listening, ready) combination including `sentenceTTS.isSpeaking || voice.isSpeaking`.
- [ ] Focus ring is the global 2px amber outline (cyan on light themes); never glow-only.

### Compliance

- [ ] iOS upgrade CTA → IAP only; first-exam disclaimer + safety bullets + Terms/Privacy shown; report-answer reachable per message.

---

## Open questions for the owner

1. **Background audio + silent switch** (OWNER DECISION in §7): should TTS play in background and/or override the iOS silent switch? Recommendation: foreground-only, respect silent switch.
2. **Auto-listen vs tap-to-talk**: web requires a mic tap to start listening. Should native auto-arm the mic when the annunciator hits "READY — YOUR TURN" (more conversational, but battery/privacy cost), or keep explicit tap-to-talk for v1? Recommendation: explicit tap-to-talk in v1, auto-listen as a settings opt-in in v1.1.
3. **Exam images**: `NEXT_PUBLIC_SHOW_EXAM_IMAGES` is OFF on web today. Ship the image/asset render path in v1 (behind a remote flag) or defer to v1.1? Recommendation: include the parser, default the flag OFF.
4. **Sentence-TTS streaming flag**: `tts_sentence_stream` defaults OFF on web. Mirror OFF on native, or enable for the more responsive voice experience? Recommendation: mirror server flag exactly.
5. **Results as sheet vs full screen**: spec assumes a large-detent sheet. Confirm vs a pushed `practice/results` route for a more "report card" feel on tablets.
