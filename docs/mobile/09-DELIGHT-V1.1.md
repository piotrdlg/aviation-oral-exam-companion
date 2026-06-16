# 09 — DELIGHT (v1.1 fast-follow backlog)

> **Scope of this document.** This is the fully-specified backlog of the four
> iOS-native "delight" surfaces that lift HeyDPE from a competent parity app
> toward Apple Design Award caliber. **Every feature here is explicitly NOT in
> v1.** v1 is PARITY v1 (the web app's 7 core screens at full App Store quality,
> per locked decision D5). These features are specified *now* so the v1
> foundation (App Group, deep-link routes, shared-state module) is laid down
> correctly the first time and the fast-follow is incremental, not a rewrite.
>
> **Locked-decision alignment (do not re-litigate):**
> - Stack: React Native + Expo, dev-client builds, New Architecture, CNG (no eject).
> - Brand: "Native-adapted FLIGHT DECK" — cockpit identity kept, HIG/Material 3 honored.
> - Plugin backbone for ALL four surfaces: **`@bacons/apple-targets`** (one plugin
>   covers widgets, Live Activities, App Intents/Siri, and Watch apps; stable;
>   real Swift/SwiftUI). `expo-widgets` is optional sugar only (still alpha as of
>   SDK 55/56; no App Intents, no Watch) and is an OWNER DECISION below.
> - Payments unaffected: none of these surfaces sell anything. A widget/Live
>   Activity/Watch CTA that lands on a paywall obeys the v1 rule — **iOS paywall =
>   RevenueCat IAP, never the Stripe web link** (Guideline 3.1.1; see payments doc
>   and `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md:406`).
>
> **Typography rule (verbatim, applied to every UI sketch below).** From
> `docs/design/2026-06-14-flight-deck-application-guide.md:9-22`: caps-mono +
> glow is reserved ONLY for brand instrument moments — the hero, `//` cockpit
> micro-labels, status annunciators/badges, ACS/element codes (`PA.I.B`,
> `FAA-S-ACS-6C`), and numeric instrument readouts (`tabular-nums`). Everything
> a user *reads to comprehend* is sentence-case IBM Plex. **Never 10px text.**
> Cyan/green text uses the `-readable` variants (`globals.css:31,26`). On the tiny
> Live Activity / widget / watch canvases this rule is *harder*, not softer:
> codes and counters are mono readouts; the one human label is sentence-case Plex.
>
> **Touch targets:** any tappable affordance ≥ 44pt (iOS) / 48dp (Android),
> including widget deep-link tap zones and Watch buttons.

---

## 0. Why this is a separate phase (and the shared prerequisite)

### 0.1 Qualitative requirements

- v1 must **ship first and stand alone**. None of section 1–4 may block, gate, or
  destabilize the v1 7-screen parity build. If a delight surface slips, v1 is
  unaffected.
- The v1 build must, however, lay **three cheap foundation stones** so the
  fast-follow is additive, not a refactor. Laying them in v1 costs <1 day total
  and is the difference between "incremental fast-follow" and "rewrite":
  1. **App Group container** `group.com.imagineflying.heydpe` registered on the
     main app target (and later inherited by every extension/target).
  2. **A thin `SharedState` Expo module** — a typed JS API
     (`setSharedState(partial)`, `getSharedState()`, `clearSharedState()`) that
     writes a single small JSON blob into the App Group `UserDefaults`
     (`suiteName: group.com.imagineflying.heydpe`). All of widgets, Live
     Activities, and parameterized App Intents read from this one store. On
     Android the same module writes to a shared `DataStore`/`SharedPreferences`.
  3. **Deep-link routes** `heydpe://practice?mode=quick_drill` and
     `heydpe://practice?action=resume` registered in the Expo Router linking
     config. These power the widget CTA, the Siri intent, and the Watch hand-off,
     and they cost nothing extra because `studyMode: 'quick_drill'` already exists
     in the exam engine (`src/lib/exam-logic.ts:454`) and `resume-current` is a
     real exam action (`01-API-ENABLEMENT-AND-CONTRACT.md:373`).

### 0.2 The canonical shared-state schema (single source of truth for 1–3)

```ts
// packages/shared/native-bridge/shared-state.ts  (the ONE blob)
export interface HeyDpeSharedState {
  schemaVersion: 1;                         // bump on breaking change
  updatedAt: string;                        // ISO 8601, for staleness UI
  // — widget #2 —
  streakDays: number;                       // derived client-side (see §2.3)
  resume: {                                 // null when no active/paused session
    available: boolean;
    sessionId: string | null;
    rating: 'private' | 'commercial' | 'instrument' | null;
    exchangeCount: number;                  // mono readout
    lastAreaCode: string | null;            // e.g. "PA.I.B" — ACS code, mono
  } | null;
  tipOfDay: { id: string; text: string };   // ≤ 90 chars, sentence-case
  // — Live Activity #1 mirror (also pushed via ActivityKit, see §1) —
  // — App Intent #3 reads nothing here for the parameterless drill —
}
```

> **Why `streakDays` is *derived*, not read from a field.** There is **no
> server-side streak field today** — the web home screen computes its stats
> purely client-side from `/api/session` (`home/page.tsx:31-33`; no `streak` key
> exists in `/api/user/sessions` or the session reads). The mobile client must
> compute `streakDays` the same way (consecutive calendar days with ≥1 session
> from the session list) and write the *number* into shared state. **Do not
> invent a `current_streak` API field** — that would be fabricating a route shape.
> If the owner wants a server-authoritative streak later, that is a separate
> backend task (OWNER DECISION §5).

### 0.3 Measurable success criteria (foundation, verifiable in v1)

| Check | Pass threshold |
|---|---|
| App Group entitlement present | `group.com.imagineflying.heydpe` appears in the generated `*.entitlements` of the main target after `expo prebuild`; verified in CI by grepping the prebuilt entitlements. |
| `SharedState` round-trip | Unit + device test: `setSharedState({tipOfDay})` then native read of the App Group `UserDefaults` returns byte-identical JSON. 100% pass. |
| Deep links resolve | `xcrun simctl openurl booted heydpe://practice?mode=quick_drill` lands on `/practice` with `studyMode==='quick_drill'`; `?action=resume` triggers `resume-current`. Both verified by an E2E linking test. |
| Blob size | Serialized `HeyDpeSharedState` ≤ 8 KB (App Group writes are cheap but widgets read it on every timeline reload). |
| Zero v1 coupling | Removing the `apple-targets` plugin from `app.config` still produces a green v1 build (delight is purely additive). |

---

## 1. Live Activities + Dynamic Island — in-exam status

```
┌──────────────────────────────────────────────────────┐
│  NOT IN V1.  This is a v1.1 fast-follow.             │
│  Effort: MEDIUM (local updates) — LARGE if server-   │
│  driven APNs push (deferred, see §1.7).              │
└──────────────────────────────────────────────────────┘
```

### 1.1 User value

During a 30–90 minute voice oral exam the phone is in-hand or on the desk. A
Live Activity on the Lock Screen — and the Dynamic Island when the app is
backgrounded mid-exam (e.g. the user glances at ForeFlight or a chart) — keeps
the **live cockpit telemetry one glance away**: current ACS area, an elapsed
clock, and the running satisfactory count. It makes the exam feel like a real
instrument session and removes the "did my exam pause / am I still in it?"
anxiety. This is the single highest brand-resonance surface of the four — a live
gauge on the Lock Screen *is* the FLIGHT DECK promise.

### 1.2 UX description + ASCII sketches

**Lock Screen / banner (full layout):**
```
┌──────────────────────────────────────────────┐
│ ◐ HeyDPE   // ON EXAM            ◉ LIVE        │  ← micro-label caps-mono cyan; LIVE annunciator green
│                                                │
│  PA.I.B  Airworthiness Reqs.        12:04      │  ← code mono-readout; area name sentence-case; clock mono tabular-nums (OS-ticked)
│  ▸ Satisfactory  7 / 9                         │  ← "Satisfactory" annunciator caps; "7 / 9" mono readout
└──────────────────────────────────────────────┘
```

**Dynamic Island — compact (left + right):**
```
 (◐ PA.I.B)                              (12:04 · 7✓)
  └ leading: brand mark + ACS code        └ trailing: clock + sat count
```

**Dynamic Island — minimal (when sharing the Island):**
```
 (◐7)   ← brand mark + sat count only
```

**Dynamic Island — expanded (long-press):**
```
┌─────────────────────────────────────┐
│ ◐ HeyDPE            // ON EXAM       │
│ PA.I.B Airworthiness                │
│ ────────────────────────────────── │
│  ELAPSED 12:04      SAT 7 / 9        │  ← two mono readouts, caps micro-labels
│  [ Open exam ]                       │  ← tap → deep link to /practice (≥44pt)
└─────────────────────────────────────┘
```

- The **elapsed clock is rendered by the OS**, not by us, using
  `Text(timerInterval:countsDown:false)` so iOS ticks it every second with zero
  battery cost and zero updates from the app. We never push a per-second update.
- **ACS area** and **satisfactory count** are *discrete-event* updates: push an
  `update()` only when the Scenario/exam engine transitions to a new ACS area, or
  when an assessment is scored `satisfactory` (assessment state already exists —
  `practice/page.tsx:59`, score union; `examResult.elements_satisfactory` exists).
- Visual budget is deliberately minimal: brand mark (SF Symbol-style vector or a
  ≤4 KB asset), one ACS code, one area name, one clock, one counter. No images,
  no charts — the archived ActivityKit examples cap images ~4 KB.
- **Graceful degradation:** on iPhone < 14 Pro the Dynamic Island doesn't exist —
  the activity renders on the Lock Screen only (handled by the OS). If the user
  has disabled Live Activities for HeyDPE in Settings, `startActivity` is a no-op
  and the exam proceeds normally — **no error surfaced, no UI gap.**
- **Lifecycle:** start on exam `start`; update on area-change / satisfactory;
  **explicitly `end()` on session complete or discard** (do not rely on the
  8h-active + ~4h-stale auto-dismiss). End state shows a brief "Exam complete —
  7/9 satisfactory" final frame for ~10s, then dismisses.

### 1.3 Apple framework

- **ActivityKit + WidgetKit (SwiftUI).** `ActivityAttributes` for the static
  config (rating, session id), `ContentState` for the dynamic blob (area code,
  area name, satisfactory count; the start-date drives the OS timer).
- **Version gates:** Live Activities iOS **16.1+**; Dynamic Island UI iPhone 14
  Pro+; push-to-start iOS **17.2+** (only relevant to §1.7, which is deferred).
- Minimum-deployment note for the v1 app: targeting iOS 16.1+ for the Live
  Activity is fine; the main app's floor is set in the design/IA doc — this
  feature simply no-ops below 16.1.

### 1.4 Expo/RN bridge approach

- **Plugin:** `@bacons/apple-targets`. Author the Live Activity as a target under
  `/targets/exam-activity/` containing the `ActivityAttributes`, the Lock Screen
  view, and the three Dynamic Island presentations (compact/minimal/expanded) in
  SwiftUI.
- **Native module shim (Swift → JS):** a tiny Expo module exposing
  `startExamActivity(attrs)`, `updateExamActivity(state)`, `endExamActivity(final)`.
  Called from the RN practice screen at the three lifecycle points above.
- **Why local updates, not the server:** for the standard "phone-in-hand during a
  voice exam" flow, calling `update()` locally from the foreground/recently-back-
  grounded app is sufficient and needs **zero backend work** — this is the v1.1
  scope. Server-driven APNs push is §1.7 (deferred).
- Requires a dev/EAS build (never Expo Go). Toolchain: Xcode 16+, macOS 15,
  CocoaPods 1.16.2, Expo SDK 53+.

### 1.5 Data source (which API)

- **No new API.** Every field already lives in the running practice session
  client state: current ACS area code/name (exam planner / Scenario Engine
  transition state), elapsed time (start timestamp held client-side), and
  satisfactory count (assessment scores, `practice/page.tsx:59`;
  `examResult.elements_satisfactory`). The Live Activity is fed from RN state, not
  a fetch. The `update()` cadence is driven by `/api/exam` `respond` results that
  the app already receives each exchange (`01-API-ENABLEMENT-AND-CONTRACT.md:254`).

### 1.6 Measurable acceptance criteria

| Criterion | Pass threshold |
|---|---|
| Start latency | Live Activity visible on Lock Screen ≤ 1.0 s after exam `start` returns. |
| Update correctness | On every ACS-area transition and every `satisfactory` score, the Island/Lock Screen reflects the new value within ≤ 1.5 s. 0 missed transitions across a 20-exchange test exam. |
| Update budget | App issues **0 per-second updates** (clock is OS-ticked); total `update()` calls per exam ≤ (area transitions + satisfactory scores) + 2 (start/end). |
| Clean teardown | After `end()`, no orphaned activity remains; verified by `Activity.activities` empty within 11 s of session complete. |
| Graceful no-op | With Live Activities disabled in iOS Settings, exam runs to completion with **0 errors logged** and no UI placeholder. |
| Dynamic Island fidelity | Compact/minimal/expanded all render without truncation on iPhone 15 Pro and 16 Pro; ACS code never wraps; area name ellipsizes gracefully. |
| Typography compliance | ACS code + clock + count render in mono `tabular-nums`; `// ON EXAM` and `LIVE`/`Satisfactory` are caps-mono annunciators; the area *name* is sentence-case Plex. Reviewer checklist: 0 violations. |
| Battery | Measured battery delta of a 60-min exam *with* vs *without* the Live Activity ≤ 1.5 percentage points (because no chatty updates). |

### 1.7 Cost / feasibility verdict

**Feasible, MEDIUM effort, ship in v1.1 with LOCAL updates.** The whole surface is
glanceable text + one SF Symbol — straightforward SwiftUI. The only thing that
turns it LARGE is server-driven APNs `liveactivity` push (to keep it ticking
while the app is fully backgrounded for long stretches), which is **throttled by
ActivityKit's per-hour notification budget** — use `apns-priority: 5` for routine,
reserve `10` for time-sensitive — and argues *against* a per-exchange server push.
**Verdict: build local-update Live Activity in v1.1; defer server push to v1.2+
and only if telemetry shows users routinely background the app mid-exam.**

---

## 2. Home Screen widgets — streak, resume CTA, daily tip

```
┌──────────────────────────────────────────────────────┐
│  NOT IN V1.  This is a v1.1 fast-follow.             │
│  Effort: SMALL / MEDIUM.                              │
└──────────────────────────────────────────────────────┘
```

### 2.1 User value

A glanceable home-screen presence keeps HeyDPE in the daily checkride-prep habit
loop: see the **streak** (loss-aversion / commitment), tap **resume** to drop
straight back into an in-progress exam, and absorb a **daily tip** without opening
the app. It is the cheapest retention surface Apple gives us and a constant brand
billboard (the attitude-indicator mark on the user's home screen).

### 2.2 UX description + ASCII sketches

**Small (2×2) — streak gauge:**
```
┌──────────────┐
│ ◐  // STREAK │  ← micro-label caps-mono cyan
│              │
│     14       │  ← big mono readout, tabular-nums
│   DAYS       │  ← caps-mono unit label
│  Tap to fly  │  ← sentence-case CTA, deep-links to /home
└──────────────┘
```

**Medium (4×2) — resume + streak:**
```
┌───────────────────────────────────────┐
│ ◐ HeyDPE                  // RESUME    │
│ Instrument · PA.I.B · 12 exchanges     │  ← rating sentence-case; ACS code mono; count mono
│ ───────────────────────────────────── │
│  [ ▸ Resume exam ]      STREAK  14     │  ← button ≥44pt, deep-link resume; streak mono
└───────────────────────────────────────┘
```

**Medium (4×2) — tip (when no resumable session):**
```
┌───────────────────────────────────────┐
│ ◐ HeyDPE                  // TIP        │
│ Brief the runway environment before    │  ← sentence-case Plex, ≤90 chars
│ you taxi — DPEs probe it early.         │
│ ───────────────────────────────────── │
│  [ Start a quick drill ]    STREAK 14  │  ← deep-link quick_drill
└───────────────────────────────────────┘
```

**Lock Screen accessory (inline / rectangular):**
```
 ◐ 14-day streak · Resume PA.I.B      ← rectangular
 ◐ 14d                                 ← circular (mono number, gauge ring)
```

- The medium widget chooses its body by state: **resume** if a resumable session
  exists, else **tip**. Streak always shown as a small trailing readout.
- **Resume CTA** deep-links `heydpe://practice?action=resume` (opens the app on
  the in-progress exam). **Quick-drill CTA** deep-links
  `heydpe://practice?mode=quick_drill`. Both are tap-to-open-app links (≥44pt tap
  zone), not in-widget interactions.
- Widget shows **last-synced** state with a quiet staleness affordance only if
  `updatedAt` > 24h old (a faint `// synced 2d ago` mono micro-label) — never a
  spinner, never an error.

### 2.3 Apple framework

- **WidgetKit (SwiftUI)** with a `TimelineProvider`. Sizes: small / medium /
  large (we ship small + medium for v1.1; large optional) plus Lock Screen
  accessory family (circular / rectangular / inline).
- Version-gated polish: `widgetContentMargins` (iOS 17+), accented/tinted
  rendering (iOS 18+) — applied progressively, no hard floor beyond WidgetKit's
  iOS 14 base; Lock Screen accessories need iOS 16+.

### 2.4 Expo/RN bridge approach

- **Plugin:** `@bacons/apple-targets` — SwiftUI widget + `TimelineProvider` under
  `/targets/widgets/`, linked automatically by CNG at prebuild. Use its
  `ExtensionStorage` API (`set()`/`get()`/`remove()`) — but standardize on our
  `SharedState` module (§0.2) writing the one blob, and have the widget read that
  blob's keys.
- **Optional sugar (OWNER DECISION §5):** `expo-widgets` lets the team build the
  timeline + layout in `@expo/ui/swift-ui` (no raw Swift) with App-Group wiring
  automatic — but it is **alpha** (SDK 55/56, "subject to breaking changes") and
  doesn't cover §3/§4, so it would fragment the toolchain. Default = stay on
  `@bacons/apple-targets`.
- Dev/EAS build required; not available in Expo Go.

### 2.5 Data source (which API)

- **Widgets cannot make authenticated network calls cheaply** and run on a
  budgeted refresh timeline — so the app **pushes** the small JSON blob (§0.2)
  into the App Group on the relevant app events (session end, app background,
  daily tip rotation). The widget reads only that blob.
- `resume` mirrors `/api/session?action=get-resumable`
  (`01-API-ENABLEMENT-AND-CONTRACT.md:422`) — the app already calls this on
  launch; it writes the result into shared state.
- `streakDays` is **client-derived** from the session list (§0.2) — there is no
  streak API field; do not invent one.
- `tipOfDay` is a small rotating set. v1.1 ships a **baked-in array of ~30 tips +
  a daily index** (date-seeded) written into shared state on app open — no backend.
  A server-driven tip feed is an explicit non-goal for v1.1.

### 2.6 Measurable acceptance criteria

| Criterion | Pass threshold |
|---|---|
| Freshness | After ending an exam, the widget reflects new streak/resume state within one WidgetKit reload (≤ the OS budget; verified by `reloadAllTimelines()` call + on-device observation ≤ 60 s). |
| Resume correctness | Tapping Resume opens `/practice` on the exact `sessionId` from the blob 100% of the time when a resumable session exists; opens `/home` (not an error) when none. |
| Quick-drill correctness | Tip-widget CTA opens `/practice` with `studyMode==='quick_drill'`. |
| Streak accuracy | Derived `streakDays` matches the web home screen's computed streak for the same account on the same day, ±0. |
| Staleness UI | With `updatedAt` forced > 24h, the `// synced Nd ago` label appears; ≤ 24h it is absent. No spinner ever shown. |
| Typography compliance | Streak number + exchange count + ACS code are mono `tabular-nums`; `// STREAK`/`// RESUME`/`// TIP` are caps-mono cyan; tip text + rating + CTA are sentence-case Plex. 0 violations. 0 instances of 10px text. |
| Tap target | Every CTA tap zone ≥ 44×44 pt on small and medium. |
| Rendering | No clipped text on small/medium/large across iPhone SE → 16 Pro Max; dark theme tokens (`globals.css:9-43`) used verbatim, AA contrast on every token pair. |

### 2.7 Cost / feasibility verdict

**Feasible, SMALL/MEDIUM, strong v1.1 pick.** Shares the App-Group infra with §1
and §3, needs **zero backend** (push-to-UserDefaults + baked tips + client-derived
streak). The only nuance is accepting that WidgetKit controls refresh cadence — so
the widget shows last-synced, not live, state, which the staleness affordance
handles honestly. **Verdict: ship small + medium (+ Lock Screen accessory if time)
in v1.1.**

---

## 3. App Intents / Siri Shortcuts — "start a quick drill"

```
┌──────────────────────────────────────────────────────┐
│  NOT IN V1.  This is a v1.1 fast-follow.             │
│  Effort: SMALL — highest polish-per-hour. First pick.│
└──────────────────────────────────────────────────────┘
```

### 3.1 User value

"Hey Siri, start a quick drill" (or a one-tap Shortcut / Action Button / Spotlight
suggestion) drops the user straight into a weak-area quick drill with no taps and
no navigation. It turns dead time (walking to the plane, in the run-up) into
practice and makes HeyDPE feel deeply woven into iOS. It is the **lowest-effort,
highest-brand-polish** of the four.

### 3.2 UX description + ASCII sketch

**Donation / Shortcuts app entry:**
```
┌─────────────────────────────────────┐
│ ◐ HeyDPE                            │
│ ───────────────────────────────────│
│  ▸ Start a quick drill              │  ← AppShortcut, phrase: "start a quick drill"
│    Jumps into a weak-area drill     │  ← sentence-case subtitle
│  ▸ Resume my exam                   │  ← second intent (opens resume deep link)
└─────────────────────────────────────┘
```

**Siri invocation:**
```
 User: "Hey Siri, start a quick drill with HeyDPE"
 Siri: (opens app) → /practice, studyMode = quick_drill
```

- v1.1 ships **two parameterless intents**: `StartQuickDrillIntent` and
  `ResumeExamIntent`, each `openAppWhenRun = true`, each opening the matching deep
  link (`?mode=quick_drill` / `?action=resume`). React Navigation handles the
  route; no data sync needed.
- Spoken phrases registered via `AppShortcutsProvider` (e.g. "start a quick
  drill", "quick drill", "resume my checkride"). The app name is appended by the
  OS.
- **Future (not v1.1):** parameterized "quick drill on weather" — needs the ACS
  area list synced to shared `UserDefaults` so the Shortcuts picker offers choices
  without launching the app. Flagged as OWNER DECISION §5.

### 3.3 Apple framework

- **App Intents framework (iOS 16+)** — the modern replacement for SiriKit. **Do
  not use legacy SiriKit Intents.** `AppIntent` structs + an `AppShortcutsProvider`
  with `AppShortcut` phrase sets.

### 3.4 Expo/RN bridge approach

- App Intents are **pure Swift structs that must compile into the main app
  target** (not a pod, not reachable from RN at runtime). Bridge by injecting the
  Swift files at prebuild via a config plugin:
  - **Default:** `@bacons/apple-targets` (Siri Intents are a supported target type)
    — keeps one plugin for all four surfaces; OR
  - `@config-plugins/react-native-siri-shortcut` if the team prefers a
    Siri-specific plugin.
- Cleanest pattern for the parameterless drill: `openAppWhenRun = true` + the
  intent opens `heydpe://practice?mode=quick_drill`; React Navigation (Expo Router
  linking, §0.1) takes it from there. **No data sync required** for the
  parameterless action.

### 3.5 Data source (which API)

- **None for v1.1.** The intent only needs the deep-link route, which maps to the
  already-existing `studyMode: 'quick_drill'` (`src/lib/exam-logic.ts:454`) and
  `resume-current` (`01-API-ENABLEMENT-AND-CONTRACT.md:373`). The drill itself,
  once the app opens, runs the normal `/api/session` create →
  `/api/exam` start path (which enforces the trial cap and, on iOS, routes any
  403 to the RevenueCat paywall — `01-API-ENABLEMENT-AND-CONTRACT.md:406`).
- A parameterized future intent would sync the ACS-area/topic list to shared
  `UserDefaults` (§5).

### 3.6 Measurable acceptance criteria

| Criterion | Pass threshold |
|---|---|
| Discovery | Both shortcuts appear in the Shortcuts app and Spotlight within seconds of first app launch (donated on launch). |
| Voice trigger | "Hey Siri, start a quick drill" opens `/practice` with `studyMode==='quick_drill'` in ≥ 9/10 trials on a quiet device. |
| Cold-start path | From a fully-killed app, the intent cold-launches and lands on the correct route ≤ 3.0 s. |
| Resume intent | "Resume my exam" opens the in-progress exam when one exists; lands on `/home` (graceful) when none, with no crash. |
| Entitlement honesty | If the user is over the trial cap, the opened drill surfaces the **RevenueCat IAP paywall** (never the Stripe web link) — verified against the 403 reason codes. |
| Action Button | Assignable to the iPhone 15/16 Pro Action Button and runs end-to-end. |
| No data leak | Parameterless intents store/transmit nothing; verified by static review (no shared-state write on this path). |

### 3.7 Cost / feasibility verdict

**Feasible, SMALL, ship first in v1.1.** A handful of Swift structs + phrase
registration + a deep link that already exists. Highest polish-per-hour of the
four and a strong A-day-one win for the fast-follow. **Verdict: build first.**

---

## 4. Apple Watch quick-drill companion (optional, minimal)

```
┌──────────────────────────────────────────────────────┐
│  NOT IN V1.  Optional v1.1 — RECOMMEND DEFER to      │
│  v1.2+. Effort: LARGE (parallel native codebase).    │
└──────────────────────────────────────────────────────┘
```

### 4.1 User value

A wrist companion for a **tap-through flashcard quick drill** — glance, read a
prompt, tap "I knew it / I didn't," repeat. It is a delightful, low-stakes way to
keep ACS recall warm away from the phone. It is **not** the voice oral exam (that
pipeline on-watch is a much larger, ill-advised lift).

### 4.2 UX description + ASCII sketch

```
┌────────────────────┐        ┌────────────────────┐
│ ◐  // QUICK DRILL  │        │   PA.I.B            │  ← ACS code mono readout
│                    │        │ What documents must │  ← sentence-case prompt
│  [  ▸ Start  ]     │  ───▶  │ be aboard & current?│
│                    │        │ ─────────────────── │
│  STREAK  14        │        │ [ Knew it ] [ Nope ]│  ← two buttons, ≥44pt
└────────────────────┘        └────────────────────┘
        glance                     drill card
```

- Phone runs the Claude exam/drill engine; the watch sends "start drill" and
  displays the next prompt + captures a binary tap, relaying via
  WatchConnectivity. Deliberately **text/voice-light** — no Deepgram STT/TTS on
  the watch.
- Brand-faithful but radically reduced: brand mark, one ACS code (mono), one
  prompt (Plex), two buttons. Honors watchOS HIG for crowns/buttons.

### 4.3 Apple framework

- **WatchKit / SwiftUI on watchOS** for the UI + **WatchConnectivity** for
  phone↔watch messaging (real-time only while the iOS app is active), with **App
  Groups** for async/persisted state.

### 4.4 Expo/RN bridge approach

- **There is no React Native on watchOS** — the entire watch app is **hand-written
  SwiftUI**, no RN reuse. Supported Expo path: `@bacons/apple-targets`
  (`npx create-target watch`, then `expo prebuild`) generates the native watch
  target inside CNG. RN-side WatchConnectivity bridge via
  `react-native-watch-connectivity` / `expo-watch-connectivity`.
- A paired iOS app is required (no standalone). Live messaging needs the iOS app
  active; otherwise fall back to slower App-Group sync.

### 4.5 Data source (which API)

- The watch needs the drill question/answer flow only. The **phone** owns the
  engine and calls `/api/session` create + `/api/exam` (`studyMode: 'quick_drill'`)
  and relays the next prompt to the watch over WatchConnectivity. The watch makes
  **no direct authenticated network calls**. Full on-watch voice is out of scope.

### 4.6 Measurable acceptance criteria

| Criterion | Pass threshold |
|---|---|
| Round-trip latency | "Start" → first card on the wrist ≤ 2.0 s with the iOS app active. |
| Connectivity fallback | With the iOS app backgrounded, the watch shows a clear "open HeyDPE on iPhone" state (not a hang) and resumes when the app returns. |
| Card correctness | Each tap advances to the next quick-drill element; binary response recorded back into the phone session 100% of the time. |
| Brand fidelity | ACS code mono, prompt sentence-case, buttons ≥ 44pt, dark tokens; reviewer checklist 0 violations. |
| Battery | A 5-min watch drill costs ≤ 3% watch battery on a Series 9-class device. |
| Pairing robustness | Survives watch lock/unlock and app backgrounding without orphaning the drill. |

### 4.7 Cost / feasibility verdict

**Feasible but LARGE — RECOMMEND DEFER to v1.2+.** It is a *parallel native UI
codebase* with no RN reuse, requires a paired iOS app, has fragile
app-must-be-active live messaging, and a multi-minute Xcode build/install/debug
loop. If the owner insists on a v1.1 watch presence, scope it to the **deliberately
minimal tap-through flashcard drill above — never the voice exam.** **Verdict:
defer; revisit after §1–§3 ship and validate retention lift.**

---

## 5. OWNER DECISIONS (call these out, do not silently TBD)

> [!important] OWNER DECISION — these are genuinely undecided and need a call.

1. **Plugin standardization.** Confirm `@bacons/apple-targets` as the single
   backbone for all four surfaces (recommended). Approve/deny using `expo-widgets`
   as *optional sugar* for widget #2 only (accepts alpha "subject to breaking
   changes" risk; would fragment the toolchain since it can't do §3/§4).
   **Recommendation: `@bacons/apple-targets` only.**
2. **Server-authoritative streak.** Today the streak is *client-derived* (no API
   field exists; web computes it client-side, `home/page.tsx:31-33`). Decide
   whether to keep it client-derived (zero backend, may differ across devices that
   haven't synced) or add a real `streak` to a session/user endpoint (a separate
   backend task). **Recommendation: client-derived for v1.1.**
3. **Daily tip source.** Baked-in ~30-tip array + date index (recommended, zero
   backend) vs a server-driven tip feed (non-goal for v1.1).
4. **Live Activity update model.** Local `update()` only for v1.1 (recommended) vs
   server-driven APNs push (budget-throttled, only justified if telemetry shows
   users background the app mid-exam). **Recommendation: local for v1.1, revisit
   with data.**
5. **Apple Watch in v1.1 at all?** Recommend **defer to v1.2+**; if approved for
   v1.1, lock scope to the minimal flashcard drill (no voice).
6. **Parameterized Siri intents** ("quick drill on weather"). v1.1 ships
   parameterless only; parameterized needs the ACS-area list synced to shared
   `UserDefaults`. Defer? **Recommendation: defer.**
7. **App Group identifier.** Confirm `group.com.imagineflying.heydpe` (must match
   the final bundle-id prefix and be registered on every target). If the bundle id
   differs, this string changes everywhere.
8. **v1.1 ship order.** Recommended effort-ranked order: **§3 Siri intent →
   §2 widgets → §1 Live Activity (local) → (defer §4 Watch).** Approve or reorder.

---

## 6. Android delight (parity later — short note)

```
┌──────────────────────────────────────────────────────┐
│  NOT IN V1, and Android FOLLOWS iOS (decision D5).   │
│  This is a parity note for the same shared foundation.│
└──────────────────────────────────────────────────────┘
```

The §0 shared-state module is designed to be cross-platform: on Android the same
`SharedState` JS API writes to a Jetpack `DataStore` / `SharedPreferences`, and the
same deep links (`heydpe://practice?...`) drive every CTA. The Android delight
surfaces, when their turn comes:

- **Material You / Glance home-screen widgets** — streak / resume / daily tip,
  built with **Jetpack Glance** (Compose-style widget API), reading the shared
  `DataStore`. Dynamic-color (Material You) is allowed *as system chrome* but the
  HeyDPE card content stays FLIGHT-DECK dark with the canonical tokens — the brand
  does not become a tinted system widget.
- **Quick Settings tile** — a "Start a quick drill" tile via
  `TileService`, deep-linking `?mode=quick_drill` (the Android analog of the Siri
  intent).
- **App Actions / Assistant shortcuts** (`shortcuts.xml` + capability) — the
  Android analog of App Intents for "start a quick drill" voice/Assistant entry.
- **Live-status surface** — Android has no Dynamic Island; the closest analog is a
  **persistent foreground-service notification** (or an Android 16
  Live-Updates/Progress-style notification where available) showing ACS area /
  elapsed / satisfactory. Treated as a *separate* parity item, not a port of the
  ActivityKit code.
- **No Wear OS companion** is planned for parity v1.1; revisit only if the Apple
  Watch companion (§4) ships and proves its retention value.

**Measurable parity gate (for the later Android delight phase):** every shared
deep link resolves identically on Android; the `SharedState` blob is byte-portable
across platforms (same `schemaVersion`, same keys); and each Android surface meets
the same per-feature acceptance table above with the Material-3 48dp touch-target
floor substituted for iOS's 44pt. No Android delight surface ships before iOS
parity (v1) is live, per decision D5.

---

## 7. Cross-cutting prerequisites checklist (lay in v1, build on in v1.1)

| # | Prerequisite | Done-when (measurable) |
|---|---|---|
| 1 | App Group `group.com.imagineflying.heydpe` on main target | Present in prebuilt `*.entitlements`; CI grep passes. |
| 2 | `SharedState` Expo module (set/get/clear one JSON blob) | Round-trips byte-identical on device; ≤ 8 KB; unit-tested. |
| 3 | Deep-link routes `?mode=quick_drill`, `?action=resume` | `simctl openurl` lands on correct route + study mode; E2E linking test green. |
| 4 | Dev/EAS build pipeline (no Expo Go) | Xcode 16 / macOS 15 / CocoaPods 1.16.2 builder green; `@bacons/apple-targets` prebuilds without manual Xcode edits. |
| 5 | Toolchain pinned | SDK 53+, CocoaPods 1.16.2, Xcode 16+ recorded in the build doc; deprecated `software-mansion-labs/expo-live-activity` explicitly **not** used (archived June 2026). |

**Definition of done for this whole document's program:** §3 + §2 + §1 (local)
shipped in v1.1 behind the shared App-Group infra with zero regressions to v1's
7-screen parity; every per-feature acceptance table green; §4 Watch and the
server-push / parameterized-intent / Android items explicitly deferred with owner
sign-off recorded against §5.
