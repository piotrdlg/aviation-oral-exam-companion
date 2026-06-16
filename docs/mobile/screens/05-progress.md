# Screen Spec 05 — Progress

> Native (Expo / React Native) screen specification for the **Progress** tab of the HeyDPE iOS-first mobile app.
> Web source of truth: `src/app/(dashboard)/progress/page.tsx` (533 lines) + components `AcsCoverageTreemap.tsx`, `AcsCoverageBars.tsx`, `WeakAreas.tsx`, `StudyRecommendations.tsx`, `ReadinessGauge.tsx`, `StatCard.tsx`; pure math in `src/lib/progress-metrics.ts`.
> Design language: **Native-adapted FLIGHT DECK** (tokens & rules: `docs/mobile/02-DESIGN-SYSTEM.md`). API contract: `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (referenced as **API §B.2 / §B.4** below).
>
> This is a build document. Every section carries both **Qualitative requirements** ("what good looks like") and **Measurable success criteria** (numbers / pass-fail). Anything genuinely undecided is a marked **OWNER DECISION**, never a silent TBD.

---

## 1. Purpose & role in the product

### 1.1 What this screen is

Progress is the **per-rating checkride-readiness analytics console**. It answers four questions for an applicant preparing for an FAA oral exam:

1. **Am I ready?** — a single 0–100 readiness score + tier (the HSI gauge).
2. **What have I covered?** — ACS element coverage, by area, as breadth × quality.
3. **Where am I weak?** — the specific ACS elements/areas that need work.
4. **What do I study next?** — weakest-first study plan with FAA source hints, and a one-tap path back to a focused drill.

It is **read-only analytics** — Progress performs **zero mutations** (no `POST`/`PATCH`/`DELETE`). Every interactive control either re-queries data (rating/class/exam/view switches) or **navigates** to the Practice tab (weak-area drill CTAs). This mirrors the web page, whose only writes happen on `/practice`.

### 1.2 Where it sits in the IA

- One of the **4 primary bottom-tab destinations**: Home, Practice, **Progress**, Settings (Design System §5.6, §6).
- Tab index 3 (Home · Practice · Progress · Settings).
- Tab bar icon: a small gauge/instrument glyph (Design System iconography); active = `c-amber`, inactive = `c-muted`; label "Progress", **Plex sentence-case 12pt** (a system tab label, NOT caps-mono — Design System §5.6).
- It is the **destination** of cross-screen "View progress" / "Track readiness" CTAs from Home and from the post-exam result sheet on Practice.
- It is a **source** of "Drill weak areas →" CTAs that navigate **to** the Practice tab (deep link `studyMode=weak_areas`).

### 1.3 Qualitative requirements

- A user glancing at this screen for 3 seconds must be able to read their readiness score and tier without scrolling.
- The screen must be honest when uncalibrated: with zero graded attempts it shows "—" / "Not calibrated", never a misleading hollow "0%" that implies failure.
- Numbers shown here must exactly equal the numbers the web app shows for the same account/rating (single source of truth = `progress-metrics.ts`, ported verbatim into `packages/shared`).

### 1.4 Measurable success criteria

- [ ] Progress is reachable in **exactly 1 tap** from any other primary tab (it is a root tab) — pass/fail.
- [ ] Readiness gauge + the 4 stat readouts are **above the fold** on a 390×844pt (iPhone 14/15) screen at default Dynamic Type — visual check.
- [ ] No request originating from this screen uses a method other than `GET` — network-log assertion.
- [ ] Readiness score, ACS-coverage %, satisfactory %, and weak-element count rendered on mobile are **byte-identical** to the web `/progress` values for the same fixture account/rating/class — parity test against `progress-metrics` shared module.

---

## 2. Entry points & navigation

### 2.1 Container / stack

- **Tab:** `app/(tabs)/progress` (expo-router). A thin **native stack** wraps the Progress root so detail pushes (if any) and large-title behavior work (Design System §5.5).
- **iOS header:** large-title nav bar, `headerLargeTitle: true`, title "Progress" (Plex SemiBold sentence-case `c-text`, background `c-panel`, bottom hairline `c-border`); collapses to an inline title on scroll (Design System §5.5).
- **Android header:** Material 3 **top app bar** (small/center-aligned) titled "Progress", `c-panel` surface, bottom hairline.
- The rating subtitle from web (`PPL (ASEL) checkride preparation`) renders as a **subtitle row** directly under the large title in the scroll content (NOT inside the nav bar) so it can update live when the rating/class segmented control changes.

### 2.2 Entry points

| From | Mechanism | Lands on |
|---|---|---|
| Bottom tab bar | Tap "Progress" | Progress root, last-used rating/class/view restored from local state if same session, else from `/api/user/tier` prefs |
| Home tab | "View progress" quick action | Progress root |
| Practice → post-exam result sheet | "See full progress" CTA (OWNER DECISION below) | Progress root, rating/class preset to the just-completed exam's rating/class |
| Universal/deep link | `heydpe://progress` (optional `?rating=&class=&view=`) | Progress root with params applied |
| Push notification (nudge / digest) | Tap | Progress root (deep link) |

> **OWNER DECISION — result-sheet CTA destination:** the web result modal lives inside `/practice`. On mobile, confirm whether "See full progress" from the result sheet **switches the tab to Progress** (recommended; preserves the result sheet's dismissal) or pushes Progress within the Practice stack. Recommendation: switch tab to Progress and preset rating/class to the completed exam.

### 2.3 Deep-link routes

- `heydpe://progress` — open root.
- `heydpe://progress?rating=private|commercial|instrument&class=ASEL|AMEL|ASES|AMES&view=overview|acs-map` — open with selectors applied; unknown/invalid params are ignored and fall back to prefs.
- Web parity: the web page reads no query params (selectors come from prefs); the deep-link params are a **mobile addition** for nudges. They must be validated against the enums in `packages/shared` (`Rating`, `AircraftClass`) and silently ignored if invalid.

### 2.4 Qualitative requirements

- Switching to the Progress tab while data is already loaded must feel instant (cached render), then silently refresh.
- Deep links from notifications must never crash on stale/garbage params; they degrade to the default view.

### 2.5 Measurable success criteria

- [ ] Cold tab open → first meaningful paint (skeleton or cached) **< 100ms** after tab tap (cached state) — instrumented.
- [ ] `heydpe://progress?rating=instrument` opens Progress with IR selected and the **class selector hidden** (instrument has no class) — pass/fail.
- [ ] Invalid deep-link param (`rating=glider`) opens the default (prefs) view with **no crash and no error toast** — pass/fail.

---

## 3. STATE MATRIX

The screen composes from independent data slices; the **screen-level** state below is the union users perceive. Per-component empty states are itemized in §3.7. All user-facing copy is **sentence-case** unless explicitly a mono-caps instrument label (annunciator / micro-label / code / numeric readout), per the THE-ONE-RULE typography discipline (Design System §1, §3.2).

### 3.1 Loading (initial)

- **When:** prefs not yet loaded, OR rating-change fetch in flight (`loading === true`), before any data for the selected rating exists.
- **UI:** the sticky selector header renders immediately (interactive). Below it: a **skeleton** matching web — a 2-col grid of 4 pulsing stat tiles (`bezel`, `c-bezel` placeholder bars) + one large pulsing panel.
- **Center copy (mono micro, in the large skeleton panel):** `// LOADING YOUR PROGRESS` — `font-mono`, `c-dim`, tracking-wide, ≥12pt. (Web shows `LOADING YOUR PROGRESS...`; native uses the `//` micro-label form, no trailing ellipsis dots animation unless reduced-motion-safe.)
- **Tokens:** surface `bezel`; placeholder fill `c-bezel`; text `c-dim`. Pulse uses the reduced-motion-aware shimmer (Design System §7 motion rules — disabled under reduced motion, replaced by a static dim panel).
- **Reduced motion:** no pulse; static `c-bezel` blocks + the `// LOADING YOUR PROGRESS` label.

### 3.2 Loading (selector-scoped, non-blocking)

- **When:** rating already has data on screen and the user switches **exam** in the ACS-map view → `sessionScoresLoading === true`; the treemap/bars keep showing the prior selection and a small inline annunciator appears.
- **Inline annunciator copy (mono):** `// LOADING…` next to the exam picker (web shows `LOADING...`).
- The rest of the screen does NOT re-skeleton (the selectors stay live).

### 3.3 Empty (no progress data)

- **When:** for the selected rating, `sessions.length === 0 && elementScores.length === 0` (web line 317).
- **UI:** a single centered `bezel` card with a hollow-square glyph, a mono caps title, a sentence-case body, and a primary CTA.
- **Title (mono caps annunciator):** `NO PROGRESS DATA YET`
- **Body (sentence-case, `c-muted`):** `Complete your first practice exam to start tracking your {RATING_LABEL} checkride readiness.` — `{RATING_LABEL}` ∈ {`Private Pilot`, `Commercial`, `Instrument`}.
- **Primary CTA (button):** label `Start practicing` — **sentence-case** on mobile. (Web renders it `START PRACTICING` mono-caps; per THE-ONE-RULE buttons are sentence-case Plex semibold — Design System §6. This is an intentional native correction; record as the button-label rule, not a data change.) Tapping it **switches to the Practice tab**.
- **Tokens:** card `bezel rounded-xl border border-c-border`; CTA primary `c-amber` bg / `c-bg` text; glyph `c-muted`.

### 3.4 Error (per failure mode)

The screen fetches **four** endpoints in parallel on rating change (sessions list, element-scores, list-tasks, stats) plus a fifth on exam selection (session-element-scores). The web code `.catch()`-es each independently and degrades to empty arrays — **mobile must do the same, but surface a recoverable banner when the user would otherwise see a misleadingly empty screen.**

| Failure mode | Detection | UI | Copy (sentence-case) | Tokens |
|---|---|---|---|---|
| **All four fail** (network down at load) | every parallel promise rejects / non-2xx | full-screen error card with Retry | Title (mono): `CONNECTION LOST` · Body: `We couldn't load your progress. Check your connection and try again.` · Button `Retry` | card `bezel`; Retry secondary button |
| **Partial fail — scores OK, stats fail** | `stats` rejects, scores resolve | render normally from scores (web falls back to client-derived counts, lines 201-203); show a small inline mono note above the stat row | `// LIFETIME TOTALS UNAVAILABLE — SHOWING RECENT` (`c-dim`) | inline text only |
| **Partial fail — scores fail, sessions OK** | `element-scores` rejects | render Recent Exams list; coverage/weak panels show their own empty/error copy | inline in panels: `Couldn't load element scores. Pull to refresh.` | `c-muted` |
| **Exam-scoped scores fail** (ACS-map exam pick) | `session-element-scores` rejects | revert picker to previous selection is NOT done (web silently sets `[]`); instead show inline | `// SCORES UNAVAILABLE FOR THIS EXAM` next to picker; treemap/bars show "No coverage data for this selection yet." | `c-red` micro-label |
| **429 rate-limited** | any GET returns 429 with `Retry-After` | non-blocking toast; auto-retry after backoff | `Too many requests — retrying shortly.` | toast on `c-bezel` |
| **401 unauthorized** | any GET returns 401 | route to re-auth (token refresh; if refresh fails → Login) | (no inline copy; handled by global auth interceptor) | — |
| **Server 500** | GET returns 500 | treat as that slice's failure (rows above) | as above | — |

- **Retry** re-runs the full parallel load for the current rating (same effect as a rating re-selection).
- The web app's per-slice `.catch(() => ({ scores: [] }))` (lines 135-138) means a single slow/failed slice **never blocks** the others — mobile preserves this resilience exactly.

### 3.5 Offline / degraded

- **When:** device offline (NetInfo) at open or during a refresh.
- **If cached data exists** (last successful load for this rating/class persisted): render it with a **stale banner** (mono micro): `// OFFLINE — SHOWING LAST SYNCED DATA`. Pull-to-refresh shows a "still offline" toast: `You're offline. We'll refresh when you're back online.`
- **If no cache:** show the §3.4 "CONNECTION LOST" card with Retry.
- **OWNER DECISION — offline cache:** confirm whether v1 persists the last successful Progress payload (per rating/class) to disk (recommended: yes — small JSON, big perceived-quality win on flaky cell connections at the airport). If not, offline always shows the error card.

### 3.6 Success

- **When:** at least one of `sessions` / `elementScores` is non-empty for the rating.
- **UI:** full screen — selector header → subtitle → readiness gauge + 4 stats → achievements strip → weak-area CTA (conditional) → Overview **or** ACS Map body. Detailed in §6.

### 3.7 Per-component empty states (within Success)

These appear when the rating has *some* data but a particular panel is empty (verbatim from source):

| Component | Condition | Copy |
|---|---|---|
| ReadinessGauge | `attemptedElements === 0` | gauge parks low; center reads `—` + mono `NOT CALIBRATED`; caption: `Complete an exam to calibrate your readiness score.` |
| WeakAreas (no attempts) | `!anyAttempted` | `Complete a practice session to see where you stand.` |
| WeakAreas (weak tab, none weak) | weak tab empty, has attempts | `No weak elements — nice work. Keep widening your coverage.` |
| WeakAreas (strong tab, none) | strong tab empty | `No mastered elements yet. Strong answers will show up here.` |
| StudyRecommendations (has attempts, none weak) | recs empty, attempted | `No study targets — every area you've practiced is on standard.` |
| StudyRecommendations (no attempts) | recs empty, none attempted | `Complete a practice session to get a study plan.` |
| AcsCoverageBars | no scores for selection | `No coverage data for this selection yet.` |
| AcsCoverageTreemap | `scores.length === 0` | `No element data available yet. Complete a practice session to see your progress.` |
| Recent Exams | `recentSessions.length === 0` | mono: `No {RATING_LABEL} exams yet` |

### 3.8 Permission-denied

- **Not applicable.** This screen requests **no device permissions** (no mic, camera, notifications, location). The only "denied" surface is **401** (handled in §3.4 by the auth interceptor). Record explicitly so QA does not expect a permission prompt here.

### 3.9 Measurable success criteria

- [ ] Each of the 9 per-component empty states in §3.7 renders its exact copy under its exact condition — 9/9 snapshot tests pass.
- [ ] With a forced offline state and a populated cache, the stale banner appears and **no error card** appears — pass/fail.
- [ ] Killing only the `stats` endpoint (500) still renders the 4 stat tiles from client-derived counts + the `LIFETIME TOTALS UNAVAILABLE` note — pass/fail.
- [ ] No text on the screen renders below **12pt** in any state, including skeleton labels and the treemap tooltip — automated font-size audit (the web treemap tooltip uses `text-[9px]` which is **forbidden on native**; see §6.6).

---

## 4. User flows

### 4.1 Happy path (returning user with history)

1. User taps the **Progress** tab.
2. Cached state (if any) paints instantly; a background refresh starts.
3. `prefs` resolve from `GET /api/user/tier` → selectors default to `preferredRating` / `preferredAircraftClass`.
4. Four parallel `GET`s resolve (sessions, element-scores, list-tasks, stats).
5. Screen renders Success: readiness gauge animates its needle to the score (respecting reduced-motion), stat readouts count is shown, achievements strip lists earned badges + next-locked, weak-area CTA appears if `weakCount > 0`.
6. User reads readiness; optionally switches **Overview ↔ ACS Map**.
7. (ACS Map) User picks a specific exam from the picker → `session-element-scores` loads → treemap/bars rescope to that exam.
8. User taps **"Drill weak areas →"** → app switches to **Practice tab** with `studyMode=weak_areas` preselected.

### 4.2 First-time / empty path

1. Tap Progress → §3.1 loading → §3.3 empty card.
2. Tap **Start practicing** → switch to Practice tab (fresh config).
3. (After completing an exam) returning to Progress now shows Success with calibration.

### 4.3 Rating / class switch

1. User taps a different rating segment (PPL→IR).
2. `loading` becomes true, `selectedSessionId` resets to `null` (lifetime), `sessionScores` cleared (web lines 130-132).
3. Four parallel `GET`s re-run for the new rating; class selector **hides** if rating is `instrument`.
4. Screen re-renders for the new rating; subtitle updates to `Instrument — Airplane` (no class).

### 4.4 View toggle (Overview ↔ ACS Map)

- Pure client switch (no fetch). Overview = Recent Exams + WeakAreas + StudyRecommendations (lifetime scores). ACS Map = exam picker + coverage bars + collapsible treemap + WeakAreas + StudyRecommendations (scoped to picked exam, default lifetime).
- Switching is instant; scroll position resets to top of the body region (header stays).

### 4.5 Edge cases

- **Single rating only attempted:** switching to an unattempted rating shows the §3.3 empty card for that rating while other ratings still have data — per-rating isolation is preserved.
- **All recent sessions abandoned/expired:** Recent Exams excludes abandoned+expired (web lines 212-215), so the list may be empty even when sessions exist → shows `No {RATING} exams yet`. The stat tiles still reflect lifetime stats (which also exclude abandoned/expired per API §B.4 `stats`).
- **Latest session is a 0-coverage abandoned one:** ACS-map defaults to **lifetime** (not most-recent) so the user never lands on a misleadingly empty treemap (web lines 156-158).
- **Treemap with hundreds of leaves:** virtualize / cap rendering (§6.6); the collapsible "Show full element treemap" stays **collapsed by default** to keep first paint cheap.

### 4.6 Back / cancel / interruption behavior

- **Back gesture / hardware back (Android):** Progress is a root tab — back does **not** pop within Progress; it follows the platform tab-back convention (Android: back returns to the previously focused tab or exits per OS; iOS: no back on a root). If a detail was pushed (none in v1), back pops it first.
- **Switching tabs mid-load:** in-flight fetches continue; results hydrate state so returning shows fresh data. No torn UI.
- **Backgrounding the app mid-load:** on resume, if data is >5 min stale, trigger a silent refresh; otherwise reuse.
- **Pull-to-refresh during a load:** debounced — a second refresh while one is in flight is ignored (no duplicate parallel storms).

### 4.7 Measurable success criteria

- [ ] Rating switch fully re-renders correct per-rating data and resets ACS-map to lifetime — pass/fail across all 3 ratings.
- [ ] "Drill weak areas →" lands on Practice with `studyMode=weak_areas` armed (verified by Practice receiving the deep-link param) — pass/fail.
- [ ] Switching tabs during a load and returning shows **fully loaded** data (no permanent spinner) — pass/fail.
- [ ] Rapid double pull-to-refresh issues **at most one** new parallel fetch batch — network-log assertion.

---

## 5. API calls

All calls are **`GET`**, **Bearer-authed** (mobile sends `Authorization: Bearer <supabase access token>`; the backend's dual-mode `getAuthedUser()` accepts it — API §A, helper at `src/lib/supabase/auth.ts`). No cookies. Base URL from the app's API config.

### 5.1 On mount / prefs

| Call | Endpoint | Success | Notes |
|---|---|---|---|
| Prefs | `GET /api/user/tier` | 200 `{ preferredRating?, preferredAircraftClass?, … }` | Seeds the selectors. On non-2xx, fall back to defaults `private` / `ASEL` and still proceed (web lines 116-125). |

### 5.2 On rating change (4 parallel) — API §B.4 (and §B.2 for list-tasks)

| # | Call | Endpoint | Success shape | Error handling |
|---|---|---|---|---|
| 1 | Sessions list | `GET /api/session` (no action) | 200 `{ sessions: <last 20 rows> }` (API §B.4 default) | reject → `sessions = []` |
| 2 | Element scores (lifetime) | `GET /api/session?action=element-scores&rating={rating}` | 200 `{ scores: ElementScore[] }` (API §B.4) | reject → `{ scores: [] }` |
| 3 | Task list (for class filter) | `GET /api/exam?action=list-tasks&rating={rating}` | 200 `{ tasks: [{ id, area, task, applicable_classes }] }` (API §B.2) | reject → `{ tasks: [] }` |
| 4 | Lifetime stats | `GET /api/session?action=stats&rating={rating}` | 200 `{ stats: { totalSessions, completedSessions, totalExchanges, uniqueTasksCovered } }` (API §B.4, excludes abandoned+expired) | reject → `{ stats: null }` (falls back to client-derived counts) |

- `ElementScore` shape (from `src/types/database.ts:239-252`): `{ element_code, task_id, area, element_type, difficulty_default, description, total_attempts, satisfactory_count, partial_count, unsatisfactory_count, latest_score, latest_attempt_at }`.

### 5.3 On exam selection (ACS-map view)

| Call | Endpoint | Success | Error |
|---|---|---|---|
| Session-scoped scores | `GET /api/session?action=session-element-scores&sessionId={id}` | 200 `{ scores: [...] }` (owner-checked; API §B.4) | not owned → 404 `{ "error": "Session not found" }`; reject → `scores = []`; show §3.4 inline note |

- The "All Exams (Lifetime)" option uses the sentinel `selectedSessionId === 'lifetime'` → **no fetch**, reuses lifetime `element-scores` (web line 197).

### 5.4 Endpoints NOT called here

- The web `?action=summary` (`GET /api/exam?action=summary&sessionId=` → `WeakAreaReport`, API §B.2) is consumed on **Practice** (the post-exam weak-area report), **not** on Progress. The task brief lists it for completeness; the Progress screen itself derives weak areas **client-side** from `element-scores` via `progress-metrics.ts`. **Do not call `summary` from the Progress screen.** (If a future "per-exam weak-area report" deep-dive is added to Progress, it would call `summary` then — out of scope v1.)

### 5.5 Request / response handling

- **Auth:** every call carries the Bearer token; a 401 triggers the global token-refresh-then-retry interceptor; second 401 → Login (API §A note on JWT-sub identity).
- **Rate-limit identity:** middleware now keys the limiter on the JWT `sub` (API §A `middleware.ts:27-52`), so all five Progress GETs share the per-**user** bucket, not a per-carrier-NAT IP bucket. `/api/session` and `/api/exam` GET reads have **no per-route limit entry** (`rate-limit.ts`) and are unlimited at the middleware layer (API §B.4/§B.2) — but the client must still honor a 429 if one is returned globally.
- **429 handling:** read `Retry-After` header, schedule a single retry after that delay (default 1s if absent), show the non-blocking toast (§3.4). Never hammer-retry.
- **Timeouts:** 10s per request; on timeout treat as that slice's rejection (degrade, not crash).
- **Parallelism:** issue the four §5.2 calls with `Promise.all`-equivalent that resolves even if some reject (the web uses per-call `.catch`, mobile mirrors with `Promise.allSettled` semantics).

### 5.6 Qualitative requirements

- A slow stats endpoint must never delay the readiness gauge — gauge renders as soon as `element-scores` resolves.
- The exam picker must feel responsive: show the inline `// LOADING…` immediately, keep the prior chart visible until the new scores arrive.

### 5.7 Measurable success criteria

- [ ] All Progress requests are `GET` with a Bearer header and **no `Cookie` header** — network-log assertion.
- [ ] With endpoint #4 (stats) artificially delayed 5s, the readiness gauge + coverage panels render in **< 1s** (driven by #2) — instrumented.
- [ ] A 429 on any Progress GET produces exactly **one** retry after `Retry-After` and no UI lockup — pass/fail.
- [ ] The Progress screen issues **zero** calls to `?action=summary` — network-log assertion (guards the §5.4 rule).
- [ ] Two different signed-in users on the same Wi-Fi/NAT do not share a rate-limit counter (JWT-sub identity) — pass/fail.

---

## 6. Layout

### 6.1 Text description (portrait, phone)

Top to bottom inside a single vertically **scrolling** content area (a `ScrollView` / `FlatList` with `RefreshControl`), under the large-title nav bar:

1. **Subtitle row** — `{RATING_LABEL} ({CLASS}) checkride preparation` (IR: `Instrument — Airplane`). Plex `c-muted` body.
2. **Sticky selector header** — pins to the top of the scroll region under the (collapsed) nav title. Three segmented controls on one wrapping row:
   - **Rating** segmented control: `PPL` · `CPL` · `IR` (mono labels; active = `c-amber` bg / `c-bg` text).
   - **Class** segmented control: `ASEL` · `AMEL` · `ASES` · `AMES` (hidden when IR).
   - **View** segmented control (right-aligned): `Overview` · `ACS map` (active = `c-elevated` bg / `c-text`).
3. **Stat cluster** — readiness HSI gauge (left/leading) + a 2×2 grid of stat readouts (Exams, Exchanges, ACS coverage %, Satisfactory %). On a narrow phone the gauge spans full width above the 2×2 grid; on wider (tablet/landscape) gauge sits beside the grid.
4. **Achievements strip** — horizontally scrolling pills (earned ✓ + next-locked ○).
5. **Weak-area CTA** (conditional, `weakCount > 0`) — a full-width tappable banner: `{n} weak element(s) need attention / Practice focused on your gaps →`.
6. **Body region** — Overview OR ACS Map (§6.4 / §6.5).

### 6.2 ASCII wireframe — Overview (portrait)

```
┌──────────────────────────────────────────────┐
│  Progress                          (large title)│  ← native nav bar
│  Private Pilot (ASEL) checkride preparation     │  ← subtitle (c-muted)
├──────────────────────────────────────────────┤
│ ┌ STICKY SELECTOR HEADER (c-bg) ─────────────┐ │
│ │ [PPL][CPL][IR]  [ASEL][AMEL][ASES][AMES]   │ │
│ │                          [Overview][ACS map]│ │
│ └────────────────────────────────────────────┘ │
│                                                 │
│ ┌───────────────┐ ┌──────────┐ ┌────────────┐  │
│ │  READINESS    │ │ EXAMS    │ │ EXCHANGES  │  │
│ │   ╭─────╮     │ │   12     │ │    248     │  │  ← gauge + 2×2 stats
│ │  ( 72 /100 )  │ │ cyan     │ │ default    │  │
│ │   PROGRESSING │ ├──────────┤ ├────────────┤  │
│ │   ╰─────╯     │ │ ACS COV. │ │ SATISFACT. │  │
│ │ coverage×qual │ │   64%    │ │    81%     │  │
│ └───────────────┘ │ amber    │ │ green      │  │
│                   └──────────┘ └────────────┘  │
│                                                 │
│ ‹ ✓ First Exam › ‹ ✓ 50 Exchanges › ‹ ○ 5 Exa… │  ← achievements (h-scroll)
│                                                 │
│ ┌ ⚠ 3 WEAK ELEMENTS NEED ATTENTION ─────────► ┐ │  ← weak CTA (c-red-dim)
│ │   Practice focused on your gaps              │ │
│ └──────────────────────────────────────────────┘ │
│                                                 │
│ // RECENT EXAMS                                 │
│ ┌ Private Pilot ASEL, Medium ──── SATISFACTORY ┐ │
│ │ Jun 12 · 22 exchanges · 64% coverage         │ │
│ └──────────────────────────────────────────────┘ │
│ ┌ Private Pilot ASEL, Hard ──────── INCOMPLETE ┐ │
│ │ Jun 10 · 8 exchanges                         │ │
│ └──────────────────────────────────────────────┘ │
│                                                 │
│ // WEAK AREAS                                   │
│ ┌ [Needs work 3][Strong 9] ───────────────────┐ │
│ │ III · WEATHER                                │ │
│ │  ● PA.III.B  last answer partial   1U/2P/4   │ │
│ │ VI · NAVIGATION                              │ │
│ │  ● PA.VI.A   2 unsat in 3          2U/0P/3    │ │
│ └──────────────────────────────────────────────┘ │
│ // STUDY PLAN                                    │
│ ┌ Focus your study, weakest first: ───────────┐ │
│ │  ● Weather    PHAK 16 · AIM 1       2 weak   │ │
│ │  ● Navigation AFH 18 · POH emerg.   1 weak   │ │
│ │  Drill weak areas ▸                          │ │
│ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│   [Home]   [Practice]  ●[Progress]  [Settings] │  ← bottom tab bar
└──────────────────────────────────────────────┘
```

### 6.3 ASCII wireframe — ACS Map (portrait)

```
│ ┌ STICKY SELECTOR HEADER (Overview/ACS map=ACS) │
│                                                 │
│ (gauge + stats + achievements + weak CTA = same)│
│                                                 │
│ // EXAM:  [ All Exams (Lifetime)         ▼ ]    │  ← exam picker
│                                                 │
│ ┌ COVERAGE BY AREA ───────── 64/142 · 45% ────┐ │
│ │ ■ satisfactory ■ partial ■ unsat ■ untouched │ │  ← legend
│ │  I   Airworthiness   ▰▰▰▱▱▱▱   12/20    ▸    │ │
│ │  II  Wx & Performance ▰▰▱▱▱▱   6/14     ▸    │ │
│ │  III Weather         ▰▰▰▰▱▱    9/15     ▾    │ │  ← expanded row
│ │      ✓ PA.III.A  ~ PA.III.B  ✗ PA.III.C      │ │
│ └──────────────────────────────────────────────┘ │
│ ┌ ▸ Show full element treemap (collapsed) ─────┐ │
│ └──────────────────────────────────────────────┘ │
│ // WEAK AREAS            // STUDY PLAN           │  ← stacked on phone
│ ( WeakAreas panel )                              │
│ ( StudyRecommendations panel )                   │
```

> Expanded treemap (when the disclosure is opened) renders the **native treemap** (§6.6) at a fixed height with the legend counts and tap-to-tooltip.

### 6.4 Overview body

- **Recent Exams** column: section micro-label `// RECENT EXAMS`; up to **10** rows (`recentSessions.slice(0,10)`), each an `iframe`-surface (recessed) row with: line 1 `{Rating} {Class}, {Difficulty}` (mono); line 2 `{date} · {n} exchanges · {coverage}% coverage` (mono `c-dim`); trailing **badge** — grade (`SATISFACTORY`/`UNSATISFACTORY`/`INCOMPLETE`) or status (`IN PROGRESS`/`COMPLETED`/etc.) annunciator pill.
- **WeakAreas** panel + **StudyRecommendations** panel below (stacked on phone; side-by-side ≥ tablet width).

### 6.5 ACS Map body

- **Exam picker** — `// EXAM:` mono micro-label + a **native picker** (iOS menu/wheel, Android exposed-dropdown, Design System §5.x picker). Option 0 = `All Exams (Lifetime)`; then recent (non-abandoned/expired) sessions as `{Mon D, h:mm AM} (N exchanges[· status])`.
- **AcsCoverageBars** — `Coverage by area` header + `{attempted}/{total} · {pct}%`; legend (satisfactory/partial/unsat/untouched); one expandable row per ACS area with a stacked horizontal bar + `attempted/total` count; expanding a row reveals its elements with status glyphs `✓ ~ ✗ ·`.
- **Collapsible treemap** — disclosure `▸ Show full element treemap`, collapsed by default; opens the native treemap (§6.6).
- **WeakAreas** + **StudyRecommendations** scoped to the picked exam (lifetime by default).

### 6.6 ACS Coverage treemap — native charting approach

The web uses **Nivo `ResponsiveTreeMap`** (`@nivo/treemap`, dynamic `ssr:false`) over a 3-level hierarchy **Area > Task > Element**, leaves-only, colored by `latest_score` (green satisfactory / amber partial / red unsatisfactory / dark untouched), 400px tall, with a hover tooltip. Nivo depends on the DOM/SVG and is **not** usable in React Native.

**Recommended native library: `@shopify/react-native-skia`** — render the treemap with a Skia `Canvas` drawing `Rect` + clipped `Text` for each leaf, computing the squarified treemap layout with **`d3-hierarchy`** (`d3.treemap()` + `treemapSquarify`, pure JS, RN-safe). Rationale:

- Skia is GPU-accelerated, New-Architecture-compatible (Fabric), and the de-facto RN charting substrate (used by Victory Native v37+, Reanimated-friendly).
- `d3-hierarchy` is a pure-math layout engine with **no DOM dependency** — it produces `{x0,y0,x1,y1}` rects we draw on the canvas. This is the smallest, most controllable path and matches the web's manual `buildTreeData` hierarchy 1:1.
- Tap handling: a Skia `Canvas` with a `Gesture.Tap()` (react-native-gesture-handler); hit-test the tapped point against the laid-out rects to find the element, then present the tooltip as a **native popover/sheet** (NOT an overlaid 9px web tooltip).

**Fallback library: `victory-native` (XL, Skia-based)** — Victory Native does not ship a first-class Treemap, so if Skia+d3 hand-rolling is deemed too costly, the **fallback is to NOT render a pixel treemap at all** and instead promote **`AcsCoverageBars`** (the per-area stacked bars, already the web's default ACS-map view) as the sole coverage visualization, with the treemap disclosure hidden behind a feature flag. The bars convey the same status distribution with far less rendering risk and are fully native (RN `View`s + flex widths, no canvas). This mirrors the web decision where the bars *replaced* the dense treemap as the default and the treemap is opt-in detail (see `AcsCoverageBars.tsx` header comment).

> **OWNER DECISION — treemap fidelity for v1:** ship (A) the full Skia+d3 native treemap behind the "Show full element treemap" disclosure, OR (B) v1 ships **bars-only** and the treemap lands in v1.1. Recommendation: **B for v1** (bars-only) — the bars are the higher-signal, lower-risk default the web already prefers; the treemap is opt-in detail and can follow. Either way, **AcsCoverageBars is required in v1.**

**Treemap color tokens (native must mirror, NOT the stale web RGBAs):** the web `AcsCoverageTreemap.tsx:31-39` still uses the **retired** neon green `rgba(0,255,65,…)` and an old red/border tone. Native MUST use the **shipped** FLIGHT DECK tokens (Design System §2): satisfactory = `c-green` `#19e66b`, partial = `c-amber` `#f5a623`, unsatisfactory = `c-red` `#ff5a4d`, untouched = `c-border` `#283142` (or `c-border-hi` for the bar track). This is a deliberate correction of web drift, consistent with the design-system reconciliation rule ("trust globals.css").

**Treemap tooltip on native:** present as a small native popover/bottom-card anchored to the tapped leaf, containing: element code (mono, `c-muted`), element type label (`Knowledge`/`Risk Management`/`Skill`), task path, description (Plex body `c-text`), a status annunciator pill (`SATISFACTORY`/`PARTIAL`/`UNSATISFACTORY`/`NOT ATTEMPTED`), and attempt count. **All text ≥ 12pt** (the web tooltip's `text-[9px]` is forbidden — Design System hard floor 12pt).

### 6.7 Native navigation pattern (HIG + Material 3)

- **Container:** expo-router `Tabs` (stable JS Tabs; `NativeTabs` is alpha — Design System §5.6) → Progress is one tab. A native stack wraps it.
- **iOS:** large-title nav bar (`headerLargeTitle`) collapsing to inline on scroll; standard Tab Bar at bottom (`c-panel`, top hairline `c-border`, safe-area honored).
- **Android:** Material 3 top app bar; Material 3 Navigation Bar at bottom.
- **Selectors:** rendered as **segmented controls** (iOS `SegmentedControl`-style / Material 3 segmented buttons) inside a sticky sub-header (NOT system tabs — these are in-content filters). The sticky behavior uses a stuck header on scroll (iOS `stickyHeaderIndices` / Android equivalent).
- **Exam picker:** native picker — iOS menu or wheel in a `formSheet`; Android Material exposed-dropdown / bottom sheet (Design System §5.x).
- **No modal sheets are required for Progress in v1** other than the optional treemap tooltip popover and the native exam picker.

### 6.8 Landscape / tablet

- **Tablet / landscape:** the gauge sits **beside** the 2×2 stat grid (web `md:` breakpoint); WeakAreas and StudyRecommendations move **side-by-side** (web `lg:grid-cols-2`); Recent Exams and the weak panels become a 2-column layout. Treemap/bars stretch to the wider width.
- **Phone landscape:** supported but content remains single-column scroll (no special layout); the sticky header stays pinned.

### 6.9 Measurable success criteria

- [ ] On a 390pt-wide phone, the readiness gauge + 4 stats fit without horizontal scroll and without text truncation at default Dynamic Type — visual check.
- [ ] Sticky selector header remains visible (pinned) while the body scrolls — pass/fail.
- [ ] Treemap (if shipped) or bars render at **≥ 50fps** while scrolling on an iPhone 12-class device — instrumented.
- [ ] Treemap leaf colors equal the shipped tokens (`c-green/c-amber/c-red/c-border`), NOT the legacy neon RGBAs — color-pick assertion.
- [ ] No element of the treemap tooltip/popover renders below 12pt — font audit.
- [ ] On iPad / landscape, gauge-beside-grid and side-by-side weak panels apply at the documented breakpoint — pass/fail.

---

## 7. Native components & interactions

### 7.1 System components used

| UI element | iOS (HIG) | Android (Material 3) | Tokens / notes |
|---|---|---|---|
| Header | Large-title nav bar | Top app bar | `c-panel`, hairline `c-border` |
| Tab bar | Tab Bar | Navigation Bar | active `c-amber`, inactive `c-muted` |
| Rating/Class/View selectors | Segmented control | Segmented buttons | active `c-amber`/`c-elevated`; mono labels |
| Stat cards | Custom `bezel` cards | Custom `bezel` cards (elevation 2) | numeric value mono tabular |
| Readiness gauge | Custom SVG/Skia | same | tier-colored arc + needle |
| Achievements | Horizontal `ScrollView` of pills | same | `c-bezel` pill, `c-border` ring |
| Weak CTA | Pressable banner | Pressable banner (ripple) | `c-red-dim` bg, `c-red/20` border |
| Recent Exams rows | Inset row (`iframe` surface) | List item (ripple) | recessed well |
| Coverage bars | Custom flex `View`s | same | stacked status segments |
| Exam picker | Menu / wheel picker | Exposed dropdown / bottom sheet | mono option text |
| Treemap (opt-in) | Skia Canvas | Skia Canvas | §6.6 |
| Pull-to-refresh | `RefreshControl` | `SwipeRefreshLayout` | tint `c-amber` |

### 7.2 Gestures

- **Vertical scroll** over the whole screen (`ScrollView`/`FlatList`).
- **Pull-to-refresh** at top → re-runs the current-rating parallel load.
- **Tap** segmented controls (rating/class/view) → re-query / re-render.
- **Tap** achievements strip scrolls **horizontally** (independent of vertical scroll); pills are informational (no nav) but `accessible` — optional: tap a pill shows its label as a tooltip/toast.
- **Tap** weak-area CTA → navigate to Practice.
- **Tap** an `AcsCoverageBars` area row → expand/collapse its elements (chevron `▸`/`▾`).
- **Tap** a treemap leaf (if shipped) → tooltip popover.
- **Tap** "Drill weak areas →" / "Start practicing" → navigate to Practice.
- **Tap** exam picker → opens native picker.

### 7.3 Haptics (Design System §7 haptic vocabulary)

- **Selection change** (rating/class/view segment, exam pick): `Haptics.selectionAsync()` (light selection tick).
- **Pull-to-refresh trigger:** light impact when the refresh fires.
- **Weak-CTA / Drill / Start tap:** light impact on press (navigation intent).
- **No** success/heavy haptics on this screen (no destructive or commit actions).
- Respect the OS "system haptics" setting; if disabled, no haptics.

### 7.4 Keyboard handling

- **None.** Progress has **no text inputs**. The native exam picker is a non-keyboard selection control. No keyboard avoidance logic required.

### 7.5 Safe-area / notch / Dynamic Island insets

- Content respects `useSafeAreaInsets()` top (under the nav bar) and bottom (above the tab bar) — Design System §3 (16pt default horizontal inset).
- The **sticky selector header** must pin **below** the nav bar / Dynamic Island region — it never tucks under the status bar or the island.
- Bottom tab bar honors the home-indicator safe area; the scroll content's bottom padding clears it (no content hidden under the tab bar).
- Landscape: respect left/right safe areas on notched devices.

### 7.6 Measurable success criteria

- [ ] Selection of any segment fires exactly one selection haptic (and none when system haptics are off) — pass/fail.
- [ ] No keyboard ever appears on Progress — pass/fail.
- [ ] Sticky header never overlaps the Dynamic Island / status bar in any scroll position — visual check on iPhone 15 Pro.
- [ ] Bottom-most content (Study Plan / Drill link) is fully tappable above the tab bar + home indicator — pass/fail.

---

## 8. Accessibility

### 8.1 VoiceOver / TalkBack

- **Reading order (top→bottom):** nav title "Progress" → subtitle → rating selector (announced as a segmented control with selected value) → class selector → view selector → readiness gauge → Exams → Exchanges → ACS coverage → Satisfactory → achievements → weak CTA → body rows.
- **Readiness gauge** is a single accessible element: label `Readiness {score} out of 100, {tier}`; value `{score}`; the SVG/Canvas internals are `accessibilityElementsHidden` so VoiceOver reads the composed label, not the arc (the gauge's `<svg aria-hidden>` on web confirms the visual is decorative; the number/tier carries the meaning).
- **Stat cards:** each announces `{label}: {value}. {meta}` (e.g. "ACS coverage: 64 percent. 84 of 142 elements").
- **Segmented controls:** each option has `accessibilityRole="button"` (or native segmented-control role), `accessibilityState={{ selected }}`; the group announces the current selection.
- **Weak CTA:** label `{n} weak elements need attention. Practice focused on your gaps. Button.`; role button; hint `Opens a focused weak-areas drill.`
- **Recent Exam rows:** label combines the title line + meta + badge, e.g. `Private Pilot ASEL, Medium. June 12, 22 exchanges, 64 percent coverage. Satisfactory.`
- **Coverage bars rows:** label `{Area name}, {attempted} of {total} elements covered`; expandable state announced; on expand, each element announces `{code}, {status reason}`.
- **WeakAreas tabs:** "Needs work, {n}" / "Strong, {n}" announced with selected state; each element row announces `{code}, {reason}, {U} unsatisfactory, {P} partial, {total} attempts`.
- **Study recommendations:** each row `{area}, {n} weak, source {FAA hint}`; the FAA source hint (`PHAK 16 · AIM 1`) is read but the `·` is replaced by ", " for speech.
- **Treemap (if shipped):** the Skia canvas is **not** individually traversable; provide an accessible **summary** element: `ACS coverage map: {satisfactory} satisfactory, {partial} partial, {unsatisfactory} unsatisfactory, {untouched} untouched of {total} elements. Use Coverage by area above for per-element detail.` Per-leaf detail is delivered by the always-present `AcsCoverageBars` (fully accessible) — this is a strong reason for the **bars-first** OWNER DECISION in §6.6.

### 8.2 Dynamic Type / font scaling

- All text uses the role-clamped Dynamic Type strategy (Design System §3): body/reading scales with the OS setting within clamped bounds; numeric **gauge value and stat values** are clamped so they don't overflow their instrument frames but still grow for low-vision users.
- At the largest accessibility text sizes, stat cards reflow (value may wrap below label) and the 2×2 grid may stack to 1-column — no clipping, no truncated numbers.
- The mono micro-labels (`// RECENT EXAMS`, codes) scale but never below 12pt and never above their clamp.

### 8.3 Contrast (≥ 4.5:1 on dark)

- Body/reading text uses `c-text` `#d7dee6`; secondary `c-muted` `#aab4c0`; faint `c-dim` `#9aa4b2` (the **floor** — never below). Cyan/green **text** uses the `-readable` variants (`c-cyan-readable`, `c-green-readable`) to clear 4.5:1 (Design System §2 the `-readable` rule).
- **Specific fixes vs. web:** the web treemap tooltip uses `c-muted`/`c-dim` at 9px — on native both the **size** (→ ≥12pt) and any cyan/green text (→ `-readable`) must comply.
- Status colors on dark: red `#ff5a4d`, amber `#f5a623`, green text via `c-green-readable` — all from the AA-lifted shipped palette.
- Color is **never the sole signal**: status is always paired with a glyph/label (✓ ~ ✗ ·, or the annunciator word), so red/green color-blind users still parse coverage.

### 8.4 Focus order & reduced motion

- Focus order matches reading order (§8.1); the sticky header keeps a stable focus position when pinned.
- **Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled`): the readiness needle does **not** animate to its value (renders directly at the final angle); skeleton shimmer is replaced by static blocks; no annunciator pulse on the weak CTA. (Design System §7 — `prefers-reduced-motion` parity.)
- The achievements strip auto-scroll (if any) is disabled under reduced motion.

### 8.5 Measurable success criteria

- [ ] VoiceOver swipe-through reads every meaningful element exactly once, in the documented order, with no "image"/empty announcements — manual audit on iOS.
- [ ] TalkBack equivalent passes — manual audit on Android.
- [ ] All text/background pairs on this screen pass **≥ 4.5:1** (normal text) — automated contrast scan against the token pairs.
- [ ] At the largest Dynamic Type setting, no stat value is clipped or truncated; the 2×2 grid reflows gracefully — visual check.
- [ ] With Reduce Motion ON, the needle renders at its final position with no animation and no shimmer — pass/fail.
- [ ] Every coverage/status indication has a non-color cue (glyph or word) — checklist over all status surfaces.

---

## 9. Analytics events

Mirror web PostHog event names where they exist; add mobile-screen-view parity. Events are sent via the shared analytics client (PostHog RN). **No PII** beyond the existing user identity.

| Event | When | Properties | Web parity |
|---|---|---|---|
| `$screen` / `progress_viewed` | Progress tab focused | `{ rating, aircraft_class, view }` | screen-view (web `$pageview` of `/progress`) |
| `progress_rating_changed` | rating segment switched | `{ from, to }` | mobile addition (web has no explicit event; keep but mark) |
| `progress_view_toggled` | Overview ↔ ACS map | `{ to: 'overview'｜'acs_map' }` | mobile addition |
| `progress_exam_selected` | exam picker change | `{ scope: 'lifetime'｜'session', sessionId? }` | mobile addition |
| `weak_area_drill_started` | tap "Drill weak areas" / weak CTA / Study Plan link | `{ source: 'cta_banner'｜'study_plan'｜'weak_panel', rating, weak_count }` | **existing web event** (`weak_area_drill_started`, shipped W6.4) — fire it here, then Practice receives `studyMode=weak_areas` |
| `paywall_shown` | only if an upgrade is surfaced (not expected on Progress; Progress has no gating) | n/a | existing — **not expected here** |

- The actual `weak_area_drill_started` (an existing funnel event) MUST fire from Progress's weak-area navigations so the funnel matches web. The `progress_*` mobile-only events are clearly namespaced and may be confirmed by the owner; they are cheap and additive.
- All events include the standard envelope (user id, app version, platform, rating context).

> **OWNER DECISION — mobile-only event names:** confirm the `progress_rating_changed` / `progress_view_toggled` / `progress_exam_selected` names (the web app does not emit these). Recommendation: keep them — they cost nothing and fill a current web blind spot; the canonical `weak_area_drill_started` is the one that must stay name-stable for the existing funnel.

### 9.1 Measurable success criteria

- [ ] Tapping any of the three weak-area paths fires exactly **one** `weak_area_drill_started` with the correct `source` — event-capture test.
- [ ] A screen-view event fires on every Progress tab focus (and not on background→foreground of an already-focused tab unless re-entered) — event-capture test.
- [ ] No analytics event carries free-text PII (descriptions/notes are not sent) — payload audit.

---

## 10. Store-compliance touchpoints

Progress is **read-only analytics** and is **not** a primary compliance surface, but the following apply:

- **No purchase UI on Progress.** Progress contains **no paywall** and performs no gating (the trial/paywall lives on `POST /api/session create` → surfaced on Practice). Therefore **no IAP / RevenueCat code runs here**, and there are no "restore purchases" / terms / privacy links required on this screen. (If a future "unlock advanced analytics" upsell is added, it must route through **RevenueCat IAP on iOS**, Guideline 3.1.1 — out of scope v1.)
- **No external purchase links.** Progress must not contain any link or button that takes the user to an external Stripe/web checkout (Guideline 3.1.1 anti-steering). The only navigations are in-app (to Practice) — compliant.
- **No account deletion here** — in-app account deletion (Guideline 5.1.1(v)) lives on **Settings**, not Progress.
- **Data shown is the user's own** — Progress reads only the authenticated user's scores/sessions (owner-checked endpoints per API §B.4). No other user's data is reachable.
- **No data collection prompts** — Progress requests no permissions (§3.8) and triggers no ATT / tracking prompt.
- **Apple privacy nutrition label:** Progress's network calls (session/exam reads) are "App Functionality" usage of the existing account data — already covered by the app-level privacy declarations; this screen adds no new data category.

### 10.1 Measurable success criteria

- [ ] Static scan confirms **no** RevenueCat/IAP, no Stripe URL, and no external-purchase link is reachable from any Progress control — code scan + manual.
- [ ] No permission prompt of any kind is triggered by visiting/using Progress — device audit.
- [ ] Every datum rendered belongs to the signed-in user (owner-checked endpoints; a forged `sessionId` for another user returns 404) — security test.

---

## 11. MEASURABLE acceptance criteria (consolidated QA checklist)

A build of the Progress screen is **done** when every box below passes.

### 11.1 Data correctness & parity

- [ ] Readiness score & tier exactly equal `readiness(filteredScores)` from `packages/shared` progress-metrics — parity test vs web for ≥ 3 fixture accounts.
- [ ] ACS coverage % = `round(attemptedElements / totalElements * 100)`; satisfactory % = `satisfactoryRate()` (or "—" when no graded attempts) — unit-verified.
- [ ] Exams / Exchanges tiles use **server `stats`** when present, else client-derived fallback — pass/fail with stats present and absent.
- [ ] Weak-element count and the Weak/Strong/Study panels classify via `elementStatus()` / `weaknessReason()` exactly as web — snapshot parity.
- [ ] ACS-map defaults to **lifetime** (not most-recent session) — pass/fail.
- [ ] Recent Exams excludes `abandoned` and `expired` sessions and caps at 10 — pass/fail.
- [ ] Class filter (`applicable_classes`) correctly scopes scores for PPL/CPL; class selector hidden + no class filtering for IR — pass/fail.

### 11.2 States

- [ ] All §3 states render with exact copy: loading, selector-loading, empty, 4 error modes, offline (cached + no-cache), success, 9 per-component empties — full snapshot suite passes.
- [ ] No permission prompt is ever shown (§3.8) — device audit.

### 11.3 API & resilience

- [ ] All Progress requests are Bearer-authed `GET` with no cookies; **zero** calls to `?action=summary` — network audit.
- [ ] A single failed slice (any of the 4 parallel) never blocks the others — fault-injection test.
- [ ] 429 → one `Retry-After`-respecting retry + toast, no lockup — pass/fail.
- [ ] Stats delayed 5s → gauge/coverage render < 1s — instrumented.

### 11.4 Performance budgets

- [ ] **Time-to-interactive** (selectors tappable) from tab tap **< 300ms** with warm cache, **< 1.5s** cold (network-bound, measured on iPhone 12-class, good network) — instrumented.
- [ ] Readiness gauge + stats visible **< 1s** after `element-scores` resolves — instrumented.
- [ ] Scrolling the full screen (with treemap collapsed) holds **≥ 55fps**; with treemap expanded **≥ 50fps** — instrumented.
- [ ] Memory: opening/closing the treemap disclosure 20× shows no monotonic memory growth (no Skia leak) — profiler check.

### 11.5 Design-system compliance (per-screen self-verify, Design System §)

- [ ] **No text below 12pt** anywhere (kills the web `text-[9px]` tooltip & gauge `text-[10px]` labels) — font audit.
- [ ] Caps-mono + optional glow used ONLY for: micro-labels (`// RECENT EXAMS`, `// EXAM:`), annunciator badges (`SATISFACTORY`, `IN PROGRESS`, `READY`/`PROGRESSING`/etc.), ACS/element codes (`PA.III.B`), and numeric readouts (`64%`, `72/100`, `1U/2P/4`). Everything else sentence-case Plex — grep/visual audit.
- [ ] Buttons/CTAs are **sentence-case** Plex semibold (`Start practicing`, `Retry`, `Drill weak areas`), NOT mono-caps — visual audit (intentional correction of the web `START PRACTICING`).
- [ ] Surfaces use native `bezel` (cards) / `iframe` (recessed Recent-Exam rows) / `station` (none required here) with the iOS `shadow*` vs Android `elevation 2/4` split — code check.
- [ ] Touch targets ≥ **44pt iOS / 48dp Android** for every segment, picker, row chevron, CTA, and pill — measured.
- [ ] Treemap/bar status colors = shipped tokens (`c-green/c-amber/c-red/c-border`), not legacy neon — color-pick.
- [ ] Glow appears only on live status (readiness tier text / annunciators), never on static prose; no decorative continuous animation — visual audit.

### 11.6 Accessibility

- [ ] VoiceOver + TalkBack pass the §8.1 order; gauge/treemap expose composed summaries — manual audit.
- [ ] All token pairs ≥ 4.5:1; cyan/green text uses `-readable` variants — automated scan.
- [ ] Largest Dynamic Type: no clipping, grid reflows — visual check.
- [ ] Reduce Motion: needle static, no shimmer, no pulse — pass/fail.
- [ ] Every status indication carries a non-color cue — checklist.

### 11.7 Navigation & compliance

- [ ] Progress reachable in 1 tap (root tab); weak-area paths land on Practice with `studyMode=weak_areas` — pass/fail.
- [ ] No IAP/Stripe/external-purchase surface, no account-deletion, no permission prompt on Progress — scan + audit.
- [ ] Deep links (`heydpe://progress?...`) apply valid params and ignore invalid ones without crashing — pass/fail.

---

## Appendix A — Source-of-truth file map

| Concern | Web source | Native target |
|---|---|---|
| Page composition, selectors, states | `src/app/(dashboard)/progress/page.tsx` | `app/(tabs)/progress/index.tsx` |
| Readiness gauge | `progress/components/ReadinessGauge.tsx` | `<ReadinessGauge>` (Skia/SVG) |
| Stat readouts | `progress/components/StatCard.tsx` | `<StatCard>` |
| Coverage bars (default ACS-map) | `progress/components/AcsCoverageBars.tsx` | `<AcsCoverageBars>` (RN Views) |
| Treemap (opt-in detail) | `progress/components/AcsCoverageTreemap.tsx` (Nivo) | `<AcsCoverageTreemap>` (Skia + d3-hierarchy) or bars-only (OWNER DECISION §6.6) |
| Weak areas | `progress/components/WeakAreas.tsx` | `<WeakAreas>` |
| Study plan | `progress/components/StudyRecommendations.tsx` | `<StudyRecommendations>` |
| All metrics math | `src/lib/progress-metrics.ts` | `packages/shared/progress-metrics.ts` (ported verbatim, unit-tested) |
| Area name/id helpers | `src/lib/exam-summary.ts` (`areaNameFromTaskId`, `areaIdFromTaskId`) | `packages/shared/exam-summary.ts` |
| `ElementScore` type | `src/types/database.ts:239-252` | `packages/shared` types |
| API shapes | `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` §B.2, §B.4 | — |
| Tokens / typography / surfaces | `docs/mobile/02-DESIGN-SYSTEM.md` | `packages/shared/theme` |

## Appendix B — Open OWNER DECISIONS raised by this screen

1. **§2.2 / §6.6:** result-sheet "See full progress" destination (tab-switch vs stack-push) — *recommend tab-switch*.
2. **§3.5:** persist last-successful Progress payload for offline render — *recommend yes*.
3. **§6.6:** treemap fidelity for v1 — full Skia+d3 treemap (A) vs **bars-only v1, treemap v1.1** (B) — *recommend B*.
4. **§9:** confirm mobile-only `progress_*` analytics event names — *recommend keep*.
