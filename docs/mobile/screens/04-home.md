# Screen Spec 04 — Home (Dashboard)

> Native-adapted FLIGHT DECK screen specification for the HeyDPE iOS-first / Android-follows Expo app.
> **Web source of truth:** `src/app/(dashboard)/home/page.tsx` (430 lines, read in full) inside `src/app/(dashboard)/layout.tsx` (the sticky web nav).
> **Design system:** `docs/mobile/02-DESIGN-SYSTEM.md` (tokens, IA, motion, a11y).
> **API contract:** `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (Part B route shapes; cited as **§B.x** below).
> **Typography rule (applied verbatim):** caps-mono + glow ONLY for brand instrument moments — hero, `// micro-labels`, status annunciators/badges, ACS/element codes, numeric readouts. Everything else is sentence-case IBM Plex. Never < 12pt. Touch targets ≥ 44pt iOS / 48dp Android.

---

## 1. Purpose & role in the product; IA placement

### 1.1 Purpose
Home is the **dashboard landing surface** — the first tab a returning user lands on after auth and the first thing they see after onboarding. It does four jobs, in priority order:

1. **Personalized greeting + status readout** — "Welcome back, {name}" with a one-line readout of rating + exams completed + total exchanges (web `home/page.tsx:52-104`).
2. **Primary CTAs (the resume/start funnel)** — Continue exam (only when a resumable session exists), New exam (or "Start your first exam"), View progress (web `:108-135`).
3. **Tier / trial status surface** — a compact trial/paid annunciator and trial-budget readout. *(New on mobile — see §1.3; the web Home does not render this today, but the task requires it and `/api/user/tier` is already fetched on this screen.)*
4. **Educational / marketing content** — a "Preflight checklist" for new users, then static teaching content: 3 pillars (ACS / Adaptive / FAA sources), 3 study-mode strategies, a difficulty table, and a collapsible Pro Tips accordion (web `:137-451`).

Home performs **no mutations**. Every interactive element either navigates (to Practice / Progress / Settings) or expands an in-place accordion. This keeps Home cheap, cacheable, and safe to render optimistically.

### 1.2 Where it sits in the IA
- Home is **tab 1 of 4** in the bottom tab bar (`Home · Practice · Progress · Settings`), per design system §5.6 / §6.3.
- File route (expo-router): `app/(tabs)/home/index.tsx` (design system §6.1 IA tree, line 534).
- It is a **top-level root** → iOS large-title nav bar; Android Material 3 top app bar (design system §5.8, §6.4).
- Settings and the Help/legal content that the web nav exposes are reached from the Settings tab / nav, not Home. The web nav's "Sign out" lives in the dashboard layout (`layout.tsx:101-106`), **not** on Home — on mobile, sign-out moves to Settings (per the Settings spec); Home has no sign-out control.

### 1.3 OWNER DECISION — tier/trial surface on Home
> The web `home/page.tsx` fetches `/api/user/tier` (`:31`) but currently only uses `displayName` + `preferredRating` from it; it renders **no** plan/trial chip. The task for this screen explicitly asks for a "tier/trial status surface." **Recommendation (default in this spec):** add a small, read-only **trial/paid annunciator** under the greeting on mobile, sourced from data already in hand (`/api/user/tier` → `tier`, `subscriptionStatus`, `cancelAtPeriodEnd`, `currentPeriodEnd`; §B.8) plus a **trial-budget readout** ("Trial · 2 of 3 exams · 5 days left") derived from `/api/session` count + signup window. This mirrors the web Settings "Plan & usage" card's truth without duplicating its controls; tapping it deep-links to Settings → Plan. **Owner to confirm** whether the budget readout ships in v1 Home or stays Settings-only. If declined, render only the greeting + CTAs + content (exact web parity) and drop §3 row "TIER/TRIAL".

---

## 2. Entry points & navigation

### 2.1 How Home is reached
| Entry point | Mechanism |
|---|---|
| Cold launch (authed, onboarding complete) | App resolves to `app/(tabs)` → default tab `home`. Splash → Home. |
| Post-auth (Login success) | Auth stack dismisses; router replaces to `/(tabs)/home` (mirrors web `router.push('/home')` after OTP/OAuth). |
| Post-onboarding "Explore first" | Onboarding modal dismisses to Home (mirrors web wizard "Explore first"). |
| Tab bar | Tapping the **Home** tab from any other tab; tapping Home tab while already on Home scrolls-to-top (HIG tab re-tap convention). |
| Deep link | `heydpe://home` and the Universal/App Link `https://aviation-oral-exam-companion.vercel.app/home` resolve to the Home tab. |
| Push notification (nudge/digest) | A "resume your exam" nudge opens Home (or deep-links straight to Practice — see §4.7). |

### 2.2 Outbound navigation from Home
| Control | Target route | Notes |
|---|---|---|
| Continue exam (CTA, conditional) | `/(tabs)/practice` (resume path) | Only rendered when a resumable session exists (§3, §4.2). |
| New exam / Start your first exam (CTA) | `/(tabs)/practice` | New-user copy when `totalSessions === 0`. |
| View progress (CTA) | `/(tabs)/progress` | |
| Bottom CTA (Start practicing / Start your first exam) | `/(tabs)/practice` | Duplicate of the New-exam intent at page bottom. |
| Tier/trial chip (mobile addition, §1.3) | `/(tabs)/settings` (Plan section, anchored) | Read-only; opens Settings. |
| Preflight checklist steps (new user) | Non-interactive text (web) → keep non-interactive on mobile. | |

All cross-tab navigation switches tabs (does not stack a duplicate Home). The Practice CTAs **do not** carry deep-link query params from Home (unlike Progress's weak-area CTA); they open Practice's default pre-session config.

---

## 3. STATE MATRIX

Home composes from three parallel reads (§5). The screen renders progressively; the **static educational content (§3 SUCCESS rows "CONTENT-*") always renders**, even mid-fetch, because it is local and data-independent. Only the greeting, CTAs, new-user strip, and tier chip depend on network.

Legend: copy is **sentence-case** unless explicitly a caps-mono instrument moment. Tokens reference design system §2.1 canonical table.

| State | Trigger | UI + exact user-facing copy | FLIGHT DECK tokens |
|---|---|---|---|
| **LOADING (greeting)** | Mount; `tier`+`session` reads in flight (`loading === true`). | Greeting replaced by a skeleton bar (web `:90-91`: `h-9 w-64 bg-c-panel rounded animate-pulse`). CTAs hidden until `loading === false` (web `:108`). Static content below renders normally. No spinner overlay. | Skeleton fill `c-panel`; shimmer respects reduce-motion (§7.2 — static if reduce-motion ON). |
| **SUCCESS · returning user** | `totalSessions > 0`. | H1 "Welcome back, {displayName}". Subhead: "{Rating label} preparation — {n} exam[s] completed, {m} exchanges" (web `:101`, em-dash). CTAs: [Continue exam?] + New exam + View progress. No checklist. | H1 Plex bold `c-text` 28pt, no glow (§3.2). Subhead `c-muted` 15pt. Numeric `{n}`/`{m}` `tabular-nums`. |
| **SUCCESS · new user** | `totalSessions === 0` (`isNewUser`). | H1 "Welcome to HeyDPE". Subhead: "Your AI examiner is standing by. Let's get you checkride-ready." (web `:100`). CTA primary = "Start your first exam" (amber). Then **Preflight checklist** station card (§3 row below). | H1 `c-text`; subhead `c-muted`. Primary CTA amber bg + `c-bg` label. |
| **SUCCESS · resumable present** | `get-resumable` → `session !== null` (`hasResumable`). | Adds a **Continue exam** CTA *first* in the row, cyan-filled with a ▶ glyph (web `:110-117`). The New-exam CTA then demotes to secondary (bezel/outline) styling. | Continue = `c-cyan` fill, `c-bg` label, `shadow shadow-c-cyan/20` (iOS) / `elevation:2` (Android). |
| **SUCCESS · no resumable** | `get-resumable` → `session === null`. | No Continue CTA. New-exam CTA is the primary amber button. | New-exam = amber fill (§5.6 button). |
| **TIER/TRIAL · trial active** *(mobile §1.3)* | `subscriptionStatus !== 'active'/'trialing'` and within trial window. | Annunciator chip: micro-label `// PLAN` + badge **`TRIAL`** + readout "{used} of 3 exams · {daysLeft} days left". | Badge caps-mono `c-amber` on `c-amber-lo`, radius 6. Readout `tabular-nums` `c-muted`. |
| **TIER/TRIAL · paid** *(mobile §1.3)* | `subscriptionStatus ∈ {active, trialing}`. | Chip: `// PLAN` + badge **`PAID`** + "Renews {date}" (or "Access until {date}" if `cancelAtPeriodEnd`). | Badge caps-mono `c-green-readable` on `c-green-lo`. Date `tabular-nums`. |
| **TIER/TRIAL · trial budget exhausted** *(mobile §1.3)* | 3 exams used or window elapsed (mirrors §B.3 403 reasons, surfaced *informationally* here). | Chip badge **`TRIAL ENDED`** + "Upgrade to keep practicing." Tapping the New-exam CTA still attempts a session; the 403 (`trial_limit_reached` / `trial_expired` / `resubscribe_required`) is handled on **Practice**, which routes to the Upgrade sheet (§B.3). Home itself does **not** hard-block. | Badge `c-red` on `c-red-dim`. |
| **EMPTY (no sessions, has profile)** | = NEW USER state. There is no separate "empty" beyond new-user. | Handled by new-user copy + Preflight checklist (no blank screen ever appears). | — |
| **ERROR · tier fetch failed** | `/api/user/tier` non-OK or rejected. Web's `Promise.all` swallows via `.catch(() => {})` (`:48`) → `stats` may be set with `displayName: null`, `rating: 'private'`. | Graceful degrade: greeting falls back to "Welcome to HeyDPE" (null name) (web `:52-54`); subhead may be absent if `stats` is null. CTAs still render (default New-exam intent). **No error banner** for this read — it's non-blocking. Tier chip hidden if tier unknown. | Neutral `c-text`/`c-muted`. |
| **ERROR · session/resumable fetch failed** | `/api/session` or `?action=get-resumable` non-OK. | `hasResumable` stays `false` → no Continue CTA (safe default: user can still start a New exam, and Practice's own launch read will re-detect a resumable). Stats counts may show as 0. **No blocking error.** | — |
| **ERROR · total auth failure (401 on all)** | All three reads 401 (token expired/revoked). | This should be intercepted **before** Home renders by the auth guard (token refresh → re-auth). If a 401 is observed at the data layer, the app routes to the Login stack with a non-modal toast: "Your session expired. Please sign in again." Home does not show partial data under 401. | Toast `c-bezel` surface, `c-text`. |
| **OFFLINE / degraded** | No connectivity at mount or reads time out. | Static educational content (pillars, strategies, difficulty table, Pro Tips) **renders fully** (local). Greeting falls back to the last-cached `displayName` if available, else "Welcome to HeyDPE". A slim inline banner appears above the CTAs: "You're offline. Showing your last saved status." CTAs remain tappable; tapping a CTA that needs network (start exam) routes to Practice which surfaces its own offline state. | Banner: `iframe` recessed well, `c-muted` text, cyan `// OFFLINE` micro-label. No red (offline is not an error). |
| **PERMISSION-DENIED** | N/A for Home. | Home requests **no** OS permissions (no mic, camera, notifications, location). Permission prompts belong to Practice (mic) and a deliberate notifications opt-in elsewhere. | — |
| **STALE / refresh** | User pulls-to-refresh or returns to Home tab after starting/finishing an exam elsewhere. | Re-runs the three reads; greeting subhead + CTAs + tier chip update; a brief inline skeleton may replace the subhead during refetch. Pull-to-refresh shows the platform spinner (iOS `RefreshControl`, Android Material). | Spinner tint `c-amber`. |

### 3.x Static content rows (always render; data-independent)
These mirror the web exactly and never have a loading/error state of their own:
- **CONTENT-CHECKLIST** (new user only): "// Preflight checklist" station card, 3 numbered steps `01/02/03` (web `:138-157`).
- **CONTENT-PILLARS**: "// System overview" → "How your AI examiner works" → 3 bezel cards: ACS-based questioning, Adaptive assessment, FAA source references (web `:159-214`).
- **CONTENT-STRATEGIES**: "// Study strategies" → "Three paths to checkride readiness" → 3 numbered strategy cards with `LINEAR MODE` / `ACROSS ACS MODE` / `WEAK AREAS MODE` badges + Best-for/Difficulty/Strategy sub-grids (web `:216-347`).
- **CONTENT-DIFFICULTY**: "// Difficulty settings" → "Choose your challenge level" → table Easy/Medium/Hard/Mixed (web `:349-399`).
- **CONTENT-PROTIPS**: "// Best practices" → "Pro tips" → 5-item accordion (web `:401-438`).
- **CONTENT-BOTTOM-CTA**: full-width amber CTA "Start practicing" / "Start your first exam" (web `:440-451`).

---

## 4. User flows

### 4.1 Happy path — returning user resumes
1. User launches app → splash → Home tab renders (greeting skeleton ~instant).
2. Three reads resolve (< 800ms p50 target, §11): greeting fills to "Welcome back, Piotr", subhead shows "Private Pilot preparation — 4 exams completed, 52 exchanges".
3. Because a paused session exists, the **Continue exam** cyan CTA appears first.
4. User taps Continue exam → **Medium-impact haptic** (§7.3, design system 7.3 "Primary CTA / start exam") → Practice tab opens and resumes the live session.

### 4.2 Happy path — new user starts first exam
1. New user lands on Home → "Welcome to HeyDPE" + "Your AI examiner is standing by…".
2. **Preflight checklist** station card shows 01 Configure / 02 Answer / 03 Review.
3. Primary CTA = amber "Start your first exam".
4. Tap → Medium-impact haptic → Practice tab → (first-exam disclaimer gate handled on Practice, not Home).

### 4.3 View progress
1. User taps **View progress** (secondary bezel CTA) → Selection-tick is **not** used here (navigation, not selection); a Light-impact tap is acceptable but optional → Progress tab opens.

### 4.4 Pro Tips accordion
1. User taps a Pro Tip row (e.g. "Use voice mode") → row expands in place, chevron rotates 180° (web `:419-426`); content reveals.
2. Tapping the same row collapses it; tapping a different row collapses the prior and expands the new (single-open accordion — web `expandedTip` is a single index, `:27, :412`).
3. Expand/collapse is a **Selection tick** haptic (design system §7.3 "Toggle / selection change").
4. Reduced-motion ON → chevron rotation and height animation are instant (no eased transition).

### 4.5 Tier/trial chip tap (mobile §1.3)
1. User taps the trial/paid chip → navigates to Settings → Plan section (no modal; tab switch + scroll-to-anchor).

### 4.6 Pull-to-refresh
1. User pulls down at the top of the scroll view → platform refresh spinner → three reads re-run → greeting/CTAs/chip update → spinner dismisses.
2. Min visible spinner time 400ms to avoid flicker; max 8s then auto-dismiss with the offline banner if reads fail.

### 4.7 Push-notification deep link
1. A nudge ("Pick up where you left off") opens the app. If the payload includes `resume=1` and a resumable exists, the app may deep-link **directly to Practice** (resume), bypassing Home; otherwise it opens Home with the Continue CTA already primed.

### 4.8 Back / cancel / interruption behavior
- **System Back (Android) on Home:** Home is a tab root → Back exits to the OS launcher (standard root behavior). It must **not** dead-end or re-enter the auth stack (design system §6.5).
- **iOS:** no back chevron on a tab root; the swipe-back gesture is inert on Home (it's not pushed).
- **App backgrounded mid-render:** on foreground, if > 60s elapsed, silently re-run the three reads (no skeleton flash if cached data exists; update in place).
- **Tab re-tap:** tapping Home while on Home scrolls the content to top (HIG convention) and does not refetch.
- **Token refresh interruption:** if a read 401s due to an expired token, the network layer attempts a silent Supabase token refresh once; on success it retries the read; on failure it routes to Login (§3 ERROR · total auth failure).

---

## 5. API calls

All authenticated calls use `Authorization: Bearer <supabase_jwt>` (contract §A.1, §B.0). Home fires **three GET reads in parallel on mount** (mirrors web `Promise.all`, `home/page.tsx:30-34`) and re-fires them on pull-to-refresh / qualifying foreground.

| # | Call | Method | Contract ref | Use on Home |
|---|---|---|---|---|
| 1 | `/api/user/tier` | GET | **§B.8** (`route table row 8`) | `displayName`, `preferredRating` (greeting); `tier`, `subscriptionStatus`, `cancelAtPeriodEnd`, `currentPeriodEnd` (tier chip §1.3). 401 → §3 auth-failure. 500 → degrade (§3 ERROR · tier). |
| 2 | `/api/session` (no `action`) | GET | **§B.4** default branch → `{"sessions": <last 20 rows>}` (`session/route.ts:537-548`) | Client derives `totalSessions = sessions.length`, `completedSessions = sessions.filter(status==='completed')`, `totalExchanges = Σ exchange_count` (web `:36-45`). Also seeds the trial-budget count *informationally* (authoritative count is server-side in §B.3 create). |
| 3 | `/api/session?action=get-resumable` | GET | **§B.4** `get-resumable` → `{"session": <row>|null}` (`session/route.ts:471-485`) | `hasResumable = !!session`. Row fields available: `id, rating, status, started_at, exchange_count, study_mode, difficulty_preference, aircraft_class, selected_areas, selected_tasks, metadata, acs_tasks_covered`. Home only needs the null-check; Practice re-reads it to actually resume. |

### 5.1 Request/response handling
- Each read uses the shared API client (Bearer-injecting `fetch` wrapper from §A.1). Responses are JSON.
- **Non-OK → null** per web semantics (`r.ok ? r.json() : null`, `:31-33`); the whole `Promise.all` is wrapped so a single failure never throws the screen (`.catch(() => {})`, `:48`). Mobile mirrors this: any read that fails yields `null` and the screen renders the corresponding degraded state (§3).
- Stats are **derived client-side** from the last-20-row window (this is the web's behavior and is acceptable for a lightweight Home readout; the *authoritative* lifetime aggregate lives behind `?action=stats` and is used by Progress, not Home).

### 5.2 Error / 429 handling
- **429 (rate_limited):** none of Home's three reads have a per-route limit in `rate-limit.ts` (only `/api/exam`, `/api/tts`, `/api/stt/token`, `/api/stripe/checkout`, `/api/report` are limited — contract §B.0). If the **global** middleware ever returns `429 {"error":"rate_limited"}` with `Retry-After` (contract §B.0), the API client must read `Retry-After` and back off; Home treats the failed read as `null` (degraded) and silently retries after the header's delay (single retry). No 429 toast on Home (it would be noise for a read-only dashboard).
- **5xx:** treated as `null` → degraded (§3). No blocking dialog.
- **401:** silent token refresh → retry once → else route to Login (§4.8).
- **Offline / timeout (8s):** treated as `null`; offline banner shown (§3 OFFLINE).
- Home issues **zero POST/PUT/DELETE** — there is no mutation, no idempotency concern, no optimistic write to reconcile.

### 5.3 Caching
- Cache the last successful `/api/user/tier` and derived stats in a lightweight store (e.g. React Query / shared cache, `staleTime` ~60s) so a tab revisit paints instantly from cache then revalidates. This is what makes the < 400ms warm time-to-interactive budget (§11) achievable.

---

## 6. Layout

### 6.1 Native navigation pattern
- **iOS (HIG):** large-title nav bar (`headerLargeTitle: true`) on this top-level root; collapses to inline on scroll (design system §5.8, §6.4 line 561). The large title reads "Home" (system title), with the personalized greeting rendered as the **first content row** below it (the greeting is data and belongs in content, not in the system title — keeping the system title stable avoids a layout jump while `displayName` loads). The brand `<Logo size="md" />` may sit as the large-title companion (design system §5.8).
- **Android (Material 3):** small/center-aligned top app bar titled "Home", optional brand mark, no up-affordance (root). Design system §5.8, §6.4 line 562.
- **Tab bar:** 4 bottom tabs always visible on Home; Home tab active (amber icon+label), others `c-muted` (design system §5.6). Bottom safe-area inset honored.
- The body is a single **vertical scroll view** (`ScrollView` / `FlatList`-of-sections) with `RefreshControl`. Default horizontal inset **16pt**, safe-area respected (design system §4, line 384). Content max readable width is naturally satisfied by phone width with 16pt gutters; on tablet/large width, cap the content column at ~620pt and center (parity with web `max-w-4xl mx-auto`, `:87`).

### 6.2 Vertical order (top → bottom)
1. Greeting (H1) + subhead readout.
2. Tier/trial annunciator chip (mobile §1.3).
3. CTA row: [Continue exam?] · New exam · View progress.
4. Preflight checklist station card (new user only).
5. `// System overview` → "How your AI examiner works" → 3 pillar cards.
6. `// Study strategies` → "Three paths…" → 3 strategy cards.
7. `// Difficulty settings` → "Choose your challenge level" → difficulty table.
8. `// Best practices` → "Pro tips" → accordion (5 rows).
9. Bottom full-width amber CTA.

### 6.3 ASCII wireframe — portrait (returning user, resumable present, trial active)

```
┌───────────────────────────────────────────┐  ← status bar (safe-area top)
│  ◹ HeyDPE                            Home   │  iOS large-title nav / Android top app bar
├───────────────────────────────────────────┤
│                                             │
│  Welcome back, Piotr                        │  H1 Plex bold 28 c-text (no glow)
│  Private Pilot preparation — 4 exams        │  subhead c-muted 15
│  completed, 52 exchanges                    │
│                                             │
│  // PLAN  [ TRIAL ]  2 of 3 exams · 5 days  │  micro-label cyan + amber badge + readout (tabular)
│                                             │
│  ┌──────────────┐ ┌──────────────┐          │
│  │ ▶ Continue   │ │  New exam    │          │  Continue=cyan fill / New=bezel outline
│  │   exam       │ │              │          │  (≥44pt height)
│  └──────────────┘ └──────────────┘          │
│  ┌──────────────────────────────┐           │
│  │       View progress          │           │  bezel outline, full-width on narrow
│  └──────────────────────────────┘           │
│                                             │
│  // SYSTEM OVERVIEW                          │  cyan micro-label, tracking 0.3em caps
│  How your AI examiner works                 │  H2 Plex bold 20 c-text
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │  3 bezel cards (stack on narrow)
│  │ [ACS]   │ │  ✓      │ │  ☰      │        │  icon tiles: amber / green / cyan
│  │ ACS-    │ │ Adaptive│ │ FAA     │        │
│  │ based   │ │ assess… │ │ sources │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│                                             │
│  // STUDY STRATEGIES                         │
│  Three paths to checkride readiness         │  H2
│  ┌─────────────────────────────────────┐    │
│  │ (01) First pass: area by area        │    │  numbered ring 01 amber glow
│  │      [ LINEAR MODE ]                  │    │  caps-mono badge
│  │  …copy…                              │    │
│  │  ┌ BEST FOR ┐┌ DIFFICULTY ┐┌ STRAT ┐ │    │  iframe recessed sub-grid (mono labels)
│  └─────────────────────────────────────┘    │
│  ┌── (02) Deep dive … [ ACROSS ACS ] ──┐    │
│  └─────────────────────────────────────┘    │
│  ┌── (03) Final prep … [ WEAK AREAS ] ─┐    │
│  └─────────────────────────────────────┘    │
│                                             │
│  // DIFFICULTY SETTINGS                       │
│  Choose your challenge level                │  H2
│  ┌─────────────────────────────────────┐    │
│  │ LEVEL │ WHAT TO EXPECT      │ BEST   │    │  mono header row
│  │ Easy  │ Recall questions    │ …      │    │  Easy=green Med=cyan Hard=red Mixed=amber
│  │ Medium│ Application/scenario │ …      │    │
│  │ Hard  │ Edge cases          │ …      │    │
│  │ Mixed │ Random mix          │ …      │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  // BEST PRACTICES                            │
│  Pro tips                                   │  H2
│  ┌─────────────────────────────────────┐    │
│  │ 🎤 Use voice mode               ⌄   │    │  accordion row (≥44pt), chevron
│  ├─────────────────────────────────────┤    │
│  │ 📊 Let the exam run deep        ⌄   │    │
│  │ 📈 Review your progress …       ⌄   │    │
│  │ 🎯 Drill specific tasks         ⌄   │    │
│  │ ✈️  Track multiple ratings      ⌄   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │        Start practicing  ▶          │    │  bottom amber CTA full-width
│  └─────────────────────────────────────┘    │
│                                             │
├───────────────────────────────────────────┤
│   ◹Home    🎙Practice   ▤Progress   ⚙Set   │  bottom tab bar (safe-area bottom)
└───────────────────────────────────────────┘
```

### 6.4 Landscape / tablet
- **Phone landscape:** single-column layout is retained; the 3-up card rows (pillars, strategy sub-grids) keep their web responsive behavior (`sm:grid-cols-3`) — on a wide phone landscape they may show 3-up. Content column still padded 16pt; nav/tab bars respect side safe-areas (notch).
- **Tablet (iPad / large Android):** cap the content column at ~620–680pt centered (parity with `max-w-4xl`); 3-up card rows render 3-up; CTAs render in a single row. Tab bar remains bottom (no iPad sidebar in v1 — OWNER may revisit for a v1.1 split view).

---

## 7. Native components & interactions

### 7.1 System components
| Element | Native component | iOS HIG / Material 3 mapping |
|---|---|---|
| Scroll container | `ScrollView` with `RefreshControl` | iOS scroll w/ refresh; Android `SwipeRefreshLayout`-equivalent (Material). |
| Nav bar | expo-router `Stack.Screen` header, `headerLargeTitle` (iOS) | Navigation bar (large title) / Material top app bar (design system §5.8). |
| Tab bar | expo-router JS `Tabs` (design system §5.6, §6.3) | Tab Bar / Navigation Bar. |
| Greeting H1 / H2 | shared `<Text>` primitives (role READING) | — |
| CTA buttons | shared `<Button variant="primary|secondary">` (design system §5.x button) | Filled / Tonal button. ≥44pt/48dp. |
| Tier chip | shared `<Annunciator>` badge (design system §5.4) | Label/badge. |
| Pillar / strategy cards | shared `<Card>` on `bezel` surface (design system §5, §4.5 elevation split) | Elevated/Outlined Card. |
| Difficulty table | a simple grid of `<Text>` rows (not a heavy data table) | List/table rows. |
| Pro Tips accordion | shared `<DisclosureRow>` (chevron, single-open) | iOS inset-grouped disclosure row / Material list item with state-layer ripple (design system §5.5, line 466). |
| Strategy sub-grids | `iframe` recessed-well container | recessed panel. |

### 7.2 Gestures
- Vertical scroll; **pull-to-refresh** at top (§4.6).
- Tap on CTAs, tier chip, and accordion rows. Accordion uses a single-open model.
- iOS: swipe-back inert (tab root). Android: system Back exits to launcher (§4.8).
- No drag, no swipe-to-action, no long-press menus on Home in v1.

### 7.3 Haptics (design system §7.3)
| Trigger | Haptic |
|---|---|
| Continue exam / New exam / bottom Start CTA (primary "start exam") | `impactAsync(Medium)` |
| Pro Tips accordion expand/collapse (selection change) | `selectionAsync()` |
| View progress / tier-chip tap (plain navigation) | optional `impactAsync(Light)` |
| Read failure that forces offline banner | none (offline is not an error; no `Error` notification here) |
Respect the Settings "Haptics" toggle (default on) and OS haptics setting. **Zero** haptics on scroll (design system §7.3 line 613, §7 measurable line 625).

### 7.4 Keyboard handling
- Home has **no text inputs** → no keyboard ever appears. (Search, name entry, answer composer all live on other screens.) No `KeyboardAvoidingView` needed.

### 7.5 Safe-area / notch / Dynamic Island
- Top content respects the nav bar + status bar safe-area (large title sits below the notch/Dynamic Island).
- Bottom tab bar respects the home-indicator safe-area (design system §5.6 line 487).
- No content is ever drawn under the Dynamic Island or home indicator. Horizontal safe-area honored in landscape (notch side).
- Home does **not** use Live Activities / Dynamic Island content (that is the explicitly-deferred v1.1 fast-follow per locked decisions). The greeting and tier chip are ordinary in-app content.

---

## 8. Accessibility

### 8.1 VoiceOver / TalkBack — labels & focus order
Reading/focus order (matches visual top-to-bottom):
1. Nav title "Home".
2. Greeting H1 — exposed as a **header** (`accessibilityRole="header"`): "Welcome back, Piotr" (or "Welcome to HeyDPE").
3. Subhead readout — one label: "Private Pilot preparation, 4 exams completed, 52 exchanges." (Numbers spoken in full, not glyph-by-glyph.)
4. Tier chip — label: "Plan: Trial. 2 of 3 exams used, 5 days left. Opens Settings." `accessibilityRole="button"`, hint "Double-tap to view your plan."
5. Continue exam button — label "Continue exam", hint "Resumes your in-progress exam."
6. New exam button — label "New exam" (or "Start your first exam").
7. View progress button — label "View progress."
8. (New user) Preflight checklist — group label "Preflight checklist", then each step read as "Step 1, Configure your exam. {desc}" etc. The `01/02/03` numeric ornaments are decorative → `accessibilityElementsHidden` / not announced as separate elements.
9. Each pillar card — header + body grouped: "ACS-based questioning. {body}."
10. Each strategy card — "Strategy 1, First pass: area by area. Linear mode. {body}. Best for: …. Difficulty: …. Strategy: …." The mono badge text ("LINEAR MODE") is announced sentence-style ("Linear mode"), not letter-spelled.
11. Difficulty table — announced row-by-row: "Easy. Straightforward recall questions about core concepts. Best for first-time studying a topic." (Header cells announced as table headers where the platform supports it.)
12. Pro Tips rows — `accessibilityRole="button"`, `accessibilityState={{ expanded }}`; label "Use voice mode"; hint "Double-tap to expand." Emoji icons hidden from the a11y tree (decorative).
13. Bottom CTA — "Start practicing" / "Start your first exam."
14. Tab bar — each tab a button with selected state; "Home, tab, 1 of 4, selected."

Decorative glyphs (▶, chevrons, emoji, the `//` in micro-labels, ring numbers) are **not** focusable and are hidden from assistive tech (`aria-hidden` parity → `accessibilityElementsHidden`/`importantForAccessibility="no"`). Micro-labels like "// System overview" are announced as "System overview" (the `//` and tracking are visual only).

### 8.2 Dynamic Type / font scaling
- All reading text uses `allowFontScaling` ON, clamped per role (design system §3.3): reading roles up to **1.6×**; instrument/badge/mono and the tier readout digits scale with **tighter bounds** so badges and the difficulty table don't shatter (`maxFontSizeMultiplier` per role).
- Tested at iOS Dynamic Type xS / L / xxxL and Android font scale 0.85 / 1.0 / 1.3 (design system §3.3 line 306): **no clipping, no overlap, every CTA reachable** on Home.
- The 3-up card rows must reflow to 1-up if a large type size would otherwise truncate a card title.

### 8.3 Contrast (≥ 4.5:1)
Pick every text color from the design system §8.1 passing list:
- Body/headings: `c-text` `#d7dee6` on `c-bg`/`c-bezel` — PASS.
- Secondary (subhead, card body, table secondary): `c-muted` `#aab4c0` — PASS, and `c-dim` is the floor (never fainter).
- Micro-labels rendered as text and any cyan/green **text** use the `-readable` variants (`c-cyan-readable`, `c-green-readable`) — the difficulty table's "Medium" (cyan) and "Easy" (green) labels, the tier "PAID" badge text, and the `// micro-labels` must use `-readable`, never base `c-cyan`/`c-green` (design system §2 "-readable rule", §8.1).
- Amber CTA label = `c-bg` on `c-amber` — PASS ≥ 4.5:1 (design system §5.6 / §8 line 410).
- Cyan Continue CTA label = `c-bg` on `c-cyan` fill — verified ≥ 4.5:1 in the contrast gate.
- All four themes (cockpit/glass/sectional/briefing) pass the same gate (design system §8.1 line 651).

### 8.4 Reduced motion
- Read `AccessibilityInfo.isReduceMotionEnabled()` + subscribe (design system §7.2).
- When ON: the entrance stagger (web `.s1`–`.s6`) is disabled (content appears immediately); accordion expand and chevron rotation are instant; the tier badge does not pulse; any skeleton shimmer is static. No animation longer than ~100ms.
- The tier chip's `annun-pulse` is only ever used when a status is genuinely **live**; on Home the trial badge is static (informational), so it does not pulse regardless.

### 8.5 Touch targets
- Every interactive element ≥ **44pt iOS / 48dp Android**: CTAs, tier chip, accordion rows (full-width tap area, not just the chevron), tab items (design system §5, §5.6).

---

## 9. Analytics events (PostHog)

Web reality: `home/page.tsx` emits **no custom PostHog events**; the dashboard relies on PostHog's automatic page-capture (`PostHogProvider.tsx:44` fires `$pageview` per route, with `capture_pageview:false` for manual control). Mobile mirrors this and adds the minimum useful funnel events, reusing the canonical web event names where they exist (the web funnel ships `upgrade_clicked`, `session_resumed`, `onboarding_completed`, etc. per CLAUDE.md "PostHog funnel complete (W6.4)").

| Event | When | Properties | Source of name |
|---|---|---|---|
| `$screen` (mobile pageview equiv) | Home tab becomes active / focused | `{ screen: 'home', tier, has_resumable, is_new_user }` | mirrors web `$pageview` (`PostHogProvider.tsx:44`) — mobile uses `$screen`. |
| `home_continue_exam_clicked` | Tap Continue exam | `{ resumable_session_id, study_mode, exchange_count }` | new (Home-specific); leads into the existing `session_resumed` fired by Practice on actual resume. |
| `home_new_exam_clicked` | Tap New exam / Start your first exam / bottom CTA | `{ is_new_user, cta_position: 'top'|'bottom' }` | new (Home-specific). |
| `home_view_progress_clicked` | Tap View progress | `{}` | new (Home-specific). |
| `home_protip_expanded` | Expand a Pro Tip | `{ tip_index, tip_title }` | new. |
| `upgrade_clicked` | Tap tier chip when trial/exhausted → routes toward upgrade | `{ source: 'home_tier_chip', tier, subscription_status }` | **reuse canonical web name** `upgrade_clicked` (W6.4 funnel). |

Notes:
- Do **not** emit `session_resumed` from Home — that event is owned by Practice when the resume actually succeeds (avoids double-counting). Home's `home_continue_exam_clicked` is the click; Practice's `session_resumed` is the outcome.
- No PII in properties; `display_name` is never sent as an event prop.
- All events go through the shared analytics wrapper so they are suppressed if the user has not consented (consent gate per store + privacy requirements).

---

## 10. Store-compliance touchpoints

Home is mostly content + navigation, so its direct compliance surface is small but real:

| Touchpoint | Requirement | Where it lives relative to Home |
|---|---|---|
| **No purchase UI on Home** | Home must not present prices or a "Buy" button (the tier chip is informational + a link). The IAP-compliant paywall is a separate Upgrade sheet (Apple Guideline 3.1.1; RevenueCat per locked decisions). | Tier chip routes to Settings → Plan; the actual purchase happens on the Upgrade/Paywall screen (separate spec). Home shows **no** Stripe price. |
| **External-purchase steering rules** | Per Apple 3.1.1, do not steer users to an external (web/Stripe) purchase from inside the iOS app. The tier chip/CTA must lead to the **IAP** path on iOS, not a Stripe web link. | OWNER DECISION cross-ref: the tier chip on iOS opens the in-app IAP paywall; the Stripe/web link is Android/web only (locked decision: RevenueCat IAP primary on iOS). |
| **Account deletion discoverability** | Apple 5.1.1(v) requires in-app account deletion to be reachable; it lives in Settings → Your data (web `settings/page.tsx`). Home does not host it but must not obstruct reaching Settings. | Settings tab always reachable from the tab bar adjacent to Home. |
| **Terms / Privacy links** | Must be reachable; they live in the footer/Settings/legal screens, not Home. | Footer/Settings — Home does not need to duplicate, but the brand mark and content must not imply unmetered/free claims that contradict the trial model. |
| **AI-content disclosure** | The "How your AI examiner works" pillar content already discloses AI-driven assessment and FAA-source grounding (good for App Review's AI-app expectations). The first-exam AI-consent gate is enforced on Practice/Onboarding (design system §6 line 579), not Home. | Home content reinforces; gate is elsewhere. |
| **Truthful trial copy** | The tier chip copy ("Trial · 2 of 3 exams · 5 days left") must match the enforced D5 trial model (7 days AND 3 exams, card-free) so store reviewers and users see consistent claims. | Copy derived from `/api/user/tier` + session count; no hard-coded "free forever" language. |

---

## 11. MEASURABLE acceptance criteria

A QA/engineer can pass/fail each line.

### Rendering & data
- [ ] On a returning user, greeting reads exactly "Welcome back, {displayName}" and the subhead matches "{RATING_LABEL} preparation — {completedSessions} exam[s] completed, {totalExchanges} exchanges" with correct singular/plural "exam"/"exams" (web `:101`).
- [ ] On a user with `totalSessions === 0`, greeting reads "Welcome to HeyDPE" and subhead reads "Your AI examiner is standing by. Let's get you checkride-ready." and the Preflight checklist card renders with steps 01/02/03 (web `:100, :138-157`).
- [ ] Continue exam CTA renders **iff** `/api/session?action=get-resumable` returns a non-null `session`; otherwise it is absent and New exam is the primary amber button (web `:110-127`).
- [ ] Stats are derived from the default `/api/session` last-20-row window (`totalSessions/completedSessions/totalExchanges`) exactly per web `:36-45` (verified against a seeded fixture: 5 sessions, 2 completed, 31 exchanges → "2 exams completed, 31 exchanges").
- [ ] Static content (3 pillars, 3 strategies, difficulty table, 5 Pro Tips, bottom CTA) renders even when **all three** network reads return null (airplane mode at launch) — pass/fail.
- [ ] Pro Tips accordion is single-open: opening tip B while tip A is open collapses A (web `expandedTip` single-index, `:412`).

### Tier/trial surface (if §1.3 confirmed)
- [ ] Trial user sees a `TRIAL` badge + "{used} of 3 exams · {daysLeft} days left"; paid user sees `PAID` + "Renews {date}" (or "Access until {date}" when `cancelAtPeriodEnd`), sourced from `/api/user/tier` fields (`subscriptionStatus`, `cancelAtPeriodEnd`, `currentPeriodEnd`) — §B.8.
- [ ] Tapping the tier chip opens Settings → Plan (no purchase UI shown on Home) and emits `upgrade_clicked` with `source:'home_tier_chip'`.

### Navigation & gestures
- [ ] All CTAs navigate to the correct tab (Continue/New → Practice; View progress → Progress) without stacking a duplicate Home.
- [ ] Android system Back on Home exits to launcher (never re-enters auth, never dead-ends) (design system §6.5).
- [ ] iOS large-title collapses to inline on scroll; Android shows a Material top app bar — platform check (design system §5.8).
- [ ] Tab re-tap on Home scrolls to top; pull-to-refresh re-runs the three reads and updates greeting/CTAs/chip.
- [ ] **0** direct `@react-navigation/*` imports on this route (grep) — all nav via expo-router (design system §6.5 line 577).

### Typography & tokens (FLIGHT DECK discipline)
- [ ] Greeting H1 and section H2s are **sentence-case Plex, no glow** (caps-mono is used ONLY on `// micro-labels`, the mode badges `LINEAR MODE`/`ACROSS ACS MODE`/`WEAK AREAS MODE`, the difficulty header row, and the tier badge) — visual + code review.
- [ ] **0** text nodes render below **12pt** at default Dynamic Type (static scan + dev runtime assert) (design system §3.2 line 276).
- [ ] Numeric readouts (exam count, exchanges, trial budget, dates) use `fontVariant:['tabular-nums']` (design system §3.2 line 278).
- [ ] Cyan/green **text** (difficulty "Medium"/"Easy" labels, micro-labels-as-text, PAID badge) uses the `-readable` variants only (grep: no base `c-cyan`/`c-green` on a `<Text>`).

### Accessibility
- [ ] VoiceOver/TalkBack focus order matches §8.1 (1–14); decorative glyphs (▶, chevrons, emoji, `//`, ring numbers) are not focusable — manual screen-reader pass.
- [ ] Contrast CI gate: **0** reading-text pairs < 4.5:1 on Home across all 4 themes (design system §8.1 line 678).
- [ ] Dynamic Type matrix (xS/L/xxxL · 0.85/1.0/1.3): no clipping/overlap, all CTAs reachable on Home — matrix artifact (design system §3.3 line 306).
- [ ] Reduce-motion ON: entrance stagger, accordion animation, chevron rotation, badge pulse, and skeleton shimmer are all static (no transition > ~100ms) (design system §7.2).
- [ ] Every interactive element ≥ 44pt iOS / 48dp Android (CTAs, tier chip, accordion full-row, tab items) — measured.

### Haptics & analytics
- [ ] Haptics fire 1:1 per §7.3 (Medium on start-exam CTAs, selection tick on accordion); **0** haptics on scroll (design system §7 line 625).
- [ ] `$screen` (home) fires once per focus; `home_continue_exam_clicked` / `home_new_exam_clicked` / `home_view_progress_clicked` / `home_protip_expanded` fire on their actions; **no** PII in props; events suppressed without consent.

### Performance budgets
- [ ] **Cold** time-to-interactive (CTAs tappable) ≤ **1500ms** on a mid-tier device (iPhone SE 2 / Pixel 6a) over a 4G profile; greeting skeleton appears ≤ 200ms.
- [ ] **Warm** (cached tier/stats) time-to-content ≤ **400ms** (paints from cache, then revalidates).
- [ ] The three parallel reads complete p50 ≤ **800ms** / p95 ≤ **2500ms** over 4G; a single read failure never blocks render (degraded state shown).
- [ ] Scroll is **60fps** (no dropped frames) through the full content on the reference devices; no continuous decorative animation runs while idle (design system §7.1).
- [ ] Memory: Home holds no live audio/voice resources (those belong to Practice); returning from Practice to Home releases any exam audio (no leak) — instrument check.

---

## Cross-references
- Tokens, surfaces (`bezel`/`station`/`iframe`), elevation split, IA, motion, haptics, a11y baseline: `docs/mobile/02-DESIGN-SYSTEM.md`.
- Bearer auth (§A.1), rate-limit identity (§A.2), route shapes `/api/user/tier` (§B.8), `/api/session` reads + `get-resumable` (§B.4): `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`.
- Web source: `src/app/(dashboard)/home/page.tsx`, layout `src/app/(dashboard)/layout.tsx`.
- Sibling screens: Practice (start/resume target), Progress (View progress target), Settings (tier-chip target, sign-out, account deletion), Upgrade/Paywall (IAP).
