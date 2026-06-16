# Screen Spec 06 — Settings (trimmed v1)

> Native screen specification for the **HeyDPE** iOS-first / Android-follows Expo app.
> Web source of truth: `src/app/(dashboard)/settings/page.tsx` (2,279 lines).
> Design system: `docs/mobile/02-DESIGN-SYSTEM.md`. API contract: `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`.
> Locked decisions: RN+Expo / Turborepo monorepo / native-adapted FLIGHT DECK / PARITY v1 / iOS-first / RevenueCat (IAP primary on iOS, Stripe = web/Android link) — see repo prompt header.

This is the **trimmed v1** of Settings. The web Settings page is a single 2,279-line scroll of ~13 `bezel` cards (profile, account, plan & usage, theme, examiner, voice diagnostics, active sessions, your-data, email notifications, feedback, instructor, milestones, instructor-mode). v1 ships only the subset below; everything else is an explicit **DEFERRED** callout so reviewers and engineers know it was a decision, not an omission.

**v1 IN SCOPE (this spec is exhaustive for all of these):**
1. Account info (email, display name, **default avatar picker**, practice defaults)
2. Voice / examiner picker (4 examiner profiles + preview)
3. Theme (4 cockpit themes, live apply)
4. Manage subscription (RevenueCat Customer Center / Restore Purchases on iOS IAP subs; a **neutral, non-actionable status line** for Stripe-originated subs — NO in-app portal button on iOS, per 04-PAYMENTS §4.1 / anti-steering; "Upgrade" for free users)
5. Sign out (lives in the nav/account row, mirrors web layout)
6. **MANDATORY in-app account deletion** (Apple Guideline 5.1.1(v) + Google Play Data deletion) — full deletion UX, server contract, data-removal contract

**v1 DEFERRED (NOT built in v1 — listed so they are not silently dropped):**
- Voice diagnostics (mic/STT/TTS self-test) — `DEFERRED v1.1`
- Active-sessions device list + "Sign out other sessions" — `DEFERRED v1.1`
- Email notification per-category toggles — `DEFERRED v1.1`
- Feedback (bug / content-error) widget — `DEFERRED v1.1`
- Your instructor / Checkride milestones / Instructor mode (flag-gated) — `DEFERRED v1.1`
- **Custom-avatar photo-library upload** (and its Photos permission / `/api/user/avatar` multipart path) — `DEFERRED v1.1` (v1 ships **default avatars only**, SHARED #2; keeps the microphone as the app's only sensitive permission).
- GDPR "Download my data (JSON)" export — see **OWNER DECISION D-SET-5** (recommended IN for parity + Play "data deletion/export" expectations; route is contracted at §B.27).

---

## 1. Purpose & role in the product; IA placement

### Qualitative requirements
Settings is the user's **account control panel**: who they are (email, display name, avatar), how the examiner sounds and behaves (voice/examiner picker), how the app looks (theme), the state of their subscription (plan, renewal, manage), and the two account-lifecycle actions every store requires to be reachable in-app: **sign out** and **delete account**. It is intentionally low-frequency: the user configures once, then lives in Practice/Home/Progress. It must feel like a single calm instrument panel — a vertical stack of `bezel` cards — not a dense web form.

It is the **only** place in v1 where a user can permanently delete their account. Apple Guideline 5.1.1(v) and Google Play's "Account deletion / Data deletion" policy both require an in-app path; this screen is that path. It is therefore a **store-blocking screen**: if deletion is missing or broken, the build is rejected.

### IA placement
- One of **4 bottom tabs** (`expo-router` tab bar — see Design System §IA): Home, Practice, Progress, **Settings**.
- Settings tab → a native **stack** rooted at the Settings root screen (`app/(tabs)/settings/index.tsx`). All sub-flows (Examiner picker detail, Delete-account confirmation, RevenueCat Customer Center) are pushed/presented from this stack.
- Sign out and the account identity row sit at the top of the Settings root (mirroring web, where sign-out is in the dashboard layout nav at `layout.tsx:101-106`, not inside the Settings page body). Native consolidates them into Settings because a tab bar has no persistent "Sign out" affordance.

### Measurable success criteria
- [ ] Settings is reachable in **≤ 1 tap** from any of the other 3 tabs (it is a root tab).
- [ ] The account-deletion entry point is reachable in **≤ 2 taps** from the Settings root (scroll + tap "Delete account") — Apple reviewers must find it without instructions.
- [ ] Sign out is reachable in **≤ 2 taps** from the Settings root.
- [ ] No web-only sections (diagnostics, instructor, email toggles, milestones, feedback) render in the v1 build (grep the screen tree: zero references to those components).

---

## 2. Entry points & navigation

### Qualitative requirements
Settings is reached by tapping the Settings tab. Sub-screens are reached from inside it. Deep links route directly to a sub-screen so a "Manage subscription" push notification or an email "delete your account" link can land the user in the right place.

### Entry points
| From | How | Lands on |
|---|---|---|
| Bottom tab bar | Tap **Settings** tab | Settings root (`/settings`) |
| Paywall/Upgrade modal (any screen) | Tap "Upgrade" | iOS → RevenueCat Paywall (spec 07); not Settings |
| Practice "Change in settings →" link (mirrors web `SessionConfig`) | Tap | Settings root, scrolled/anchored to **Account → Practice defaults** |
| Push notification (subscription) | Tap | `heydpe://settings/subscription` |
| Email "manage / delete account" | Tap | `heydpe://settings` (then user scrolls) |

### Deep-link routes (expo-router + Universal/App Links)
| Route | Target |
|---|---|
| `heydpe://settings` / `https://heydpe.com/settings` | Settings root |
| `heydpe://settings/subscription` | Settings root, auto-scroll to **Plan & subscription** card |
| `heydpe://settings/examiner` | Examiner picker detail screen |
| `heydpe://settings/delete` | **Delete-account confirmation sheet**, presented modally over Settings root |

### Back / interruption behavior
- Native back gesture (iOS edge-swipe / Android system back) pops the current stack screen. On the Settings root, Android back returns to the previously active tab (standard tab behavior); iOS has no back on a root.
- The Delete-account confirmation is a **dismissible modal sheet** — swipe-down / Cancel returns to Settings root with no side effects.

### Measurable success criteria
- [ ] All 4 deep links resolve to the correct screen/scroll position in a cold-start and a warm-start.
- [ ] `heydpe://settings/delete` opens the confirmation sheet but performs **no** destructive action until the user confirms (verified: no network call to `/api/user/delete` on link open).
- [ ] Android system back from Settings root never exits the app unexpectedly (returns to prior tab or shows the Android "press back again to exit" only on the start-destination tab).

---

## 3. STATE MATRIX

All copy is **sentence-case IBM Plex** unless it is a FLIGHT DECK instrument moment (status annunciator, micro-label, numeric readout, ACS/plan code) which is **caps-mono**. Tokens reference `docs/mobile/02-DESIGN-SYSTEM.md`. Never `text-[10px]` / sub-12px. (Web note: the shipped web page uses `text-[11px]` micro-labels in the Plan card at `settings/page.tsx:1267`; mobile clamps the **floor at 12pt** per the design-system Dynamic-Type rule — we do not reproduce 11px.)

### 3.1 Whole-screen states

| State | Trigger | UI + exact copy | Tokens |
|---|---|---|---|
| **Loading** | On mount: parallel GETs `/api/user/tier`, `/api/stripe/status`, plus IAP `getCustomerInfo()` (RevenueCat SDK) in flight | Each card renders a **skeleton** matching its final height (web uses `iframe rounded-lg h-20` placeholders at `:1259`). No spinner-of-death; cards fill in independently as their fetch resolves. | `.iframe` recessed wells; shimmer respects reduced-motion (static dim fill if reduced) |
| **Partial load (degraded)** | One GET fails but others succeed | Render the cards that loaded; the failed card shows its own inline error (below). The screen is **never** fully blocked by one failed card. | per-card |
| **Success** | All loaded | Full stack of `bezel` cards renders. | `.bezel rounded-xl border border-c-border` |
| **Offline** | No connectivity at mount | Top inline banner: "You're offline. Settings will load when you reconnect." Read-only cached `tier`/identity (from secure storage) shown dimmed; all mutating controls disabled. | banner `.iframe` + `text-c-muted`; disabled controls 40% opacity |
| **Unauthorized (401)** | Any GET returns 401 (token expired) | Silent token refresh once; if still 401 → route to Login (`spec 01`), preserving a return deep link to `heydpe://settings`. | n/a (navigates away) |

### 3.2 Per-section states & copy

**Account / identity**
| State | Copy | Token |
|---|---|---|
| Loaded | Email shown read-only; micro-label `// ACCOUNT` | label `font-mono uppercase tracking-[0.3em] text-c-cyan`; email `text-c-text` |
| Display-name save success | toast "Preference saved" (auto-dismiss 2s, mirrors web `setTimeout(…2000)` `:632`) | `text-c-green-readable` |
| Display-name too long | inline "Display name too long (max 50 chars)." (mirrors API 400 `:188`) | `text-c-red` |
| Default-avatar picker open | tap avatar → grid of built-in default avatars (no photo-library access — **v1 ships DEFAULT AVATARS ONLY**, SHARED #2) | grid of `.station` swatches |
| Default-avatar select success | toast "Avatar updated" (auto-dismiss 3s) — persisted via `POST /api/user/tier {avatarUrl}` (a built-in URL, not an upload) | `text-c-green-readable` |
| Default-avatar select failed | toast "Couldn't change avatar. Try again." | `text-c-red` |

**Voice / examiner picker**
| State | Copy | Token |
|---|---|---|
| Loaded | 4 examiner cards; the selected one shows annunciator badge **ACTIVE** | badge `font-mono uppercase` on `.station ring-1 ring-c-amber/20` |
| Preview playing | annunciator **EXAMINER SPEAKING** + the card's mini waveform | `text-c-amber`, `.glow-a` allowed (live status) |
| Preview failed (TTS error) | toast "Couldn't play the preview. Check your connection." | `text-c-red` |
| Select success | toast "Examiner changed to {name}" (web `:602`) | `text-c-green-readable` |
| Select failed (400 invalid / 500) | toast "Couldn't change examiner. Try again." | `text-c-red` |
| Saving | the tapped card shows a spinner; others disabled (`voiceSaving` guard `:585`) | `text-c-muted` |

**Theme**
| State | Copy | Token |
|---|---|---|
| Loaded | 4 theme cards (Cockpit / Glass Cockpit / Sectional / Briefing) with accent swatch + one-line desc; active card ringed | active `ring-1 ring-c-amber/20`; swatch = theme accent hex |
| Applied | theme applies **live** app-wide (web `setTheme` `:1380`); no toast needed — the whole UI re-tints | persisted via `POST /api/user/tier {preferredTheme}` |
| Save failed | theme reverts to prior; toast "Couldn't save theme." | `text-c-red` |

**Plan & subscription**
| State | Copy | Token |
|---|---|---|
| Loading | two `.iframe` skeleton tiles (web `:1258-1261`) | `.iframe` |
| Free user | CURRENT PLAN readout = **FREE**; STATUS = **FREE TIER**; primary button "Upgrade plan" | readout `font-mono uppercase`; CTA primary `bg-c-amber text-c-bg` |
| Trialing | CURRENT PLAN **FREE** + sub-annunciator **TRIAL ACTIVE** (web `:1272`) | annunciator `text-c-amber font-mono uppercase` |
| Paid (IAP, iOS) | CURRENT PLAN = plan name (e.g. **MONTHLY** / **ANNUAL**); RENEWS = date; buttons "Manage subscription" (→ RevenueCat Customer Center) + "Restore purchases" | readout `text-c-green-readable`; buttons secondary `.bezel` |
| Paid (Stripe-originated, iOS) | same readout; **NO in-app portal button** (anti-steering, 04-PAYMENTS §4.1). Optionally a single **neutral, non-actionable status line** — "Your subscription is managed on the web." — gated `VERIFY-AT-SUBMISSION`; default is to **say nothing**. No tap target, no URL, no `/api/stripe/portal` call from iOS. | status line `text-c-muted` (not a button) |
| Cancels at period end | label switches to **ACCESS UNTIL** {date} + sub-line "Cancels — full access until then" (web `:1284-1286`) | sub-line `text-c-amber font-mono` |
| Customer-Center error (IAP) | inline "Couldn't open subscription management. Try again." (web `portalError` `:1332`) — applies to the RevenueCat Customer Center on iOS; the Stripe portal is **not** opened from iOS | `text-c-red` |
| Restore: nothing to restore | toast "No purchases found to restore." | `text-c-muted` |
| Restore: success | toast "Purchases restored." + plan readout refreshes | `text-c-green-readable` |

**Your data → Delete account** (the centerpiece — see §3.3 for the full deletion state machine)

**Sign out**
| State | Copy | Token |
|---|---|---|
| Idle | row "Sign out" | `text-c-muted` (web nav `:103`) |
| Signing out | "Signing out…", disabled | `text-c-muted` |

### 3.3 DELETE-ACCOUNT state machine (exact copy)

This is a presented modal sheet. States are sequential.

| # | State | Trigger | Copy (sentence-case) + controls | Tokens |
|---|---|---|---|---|
| D0 | Closed | — | Entry row in "Your data" card: micro-label `// DELETE ACCOUNT`; body "Permanently deletes your profile, exam history, transcripts, and progress, and cancels any active subscription. This can't be undone." (mirrors web `:1715`) + button "Delete account" | card border `border-c-red/30`; button `bg-c-red/80` |
| D1 | Confirm sheet open | Tap "Delete account" | Title "Delete your account?" Body lists exactly what is removed (see §10 data-removal contract). A **type-to-confirm** field: "Type DELETE to confirm." with monospace input. Primary destructive button "Delete account" is **disabled** until the field equals `DELETE` (web guard `:1727,1744`). Secondary "Cancel". | input `.iframe font-mono`, focus ring `c-red`; destructive button disabled 40% |
| D2 | Subscription warning (conditional) | User has an active sub | Inline note above the field. **Stripe sub** → "Your subscription will be cancelled immediately." **Store (Apple IAP / Google Play) sub** → "Deleting your account will not stop App Store / Google Play billing. The store subscription keeps billing until you cancel it. On iPhone: open **Settings → [your name] → Subscriptions → HeyDPE → Cancel**. On Android: open **Play Store → profile → Payments & subscriptions → Subscriptions → HeyDPE → Cancel**." (Server-side, deletion **detaches/deletes the RevenueCat subscriber** so a later restore can't re-grant entitlement — SHARED #3 / D-SET-2.) | `text-c-amber` |
| D3 | Deleting | Tap enabled "Delete account" | Button → "Deleting…", spinner; sheet locks (no dismiss); haptic = warning. Calls `POST /api/user/delete {confirm:"DELETE"}`. | `text-c-muted`; sheet non-dismissible |
| D4 | Stripe-cancel failure (502) | API returns `stripe_cancel_failed` | "We couldn't cancel your subscription, so we didn't delete your account. Please contact support@heydpe.com." Button re-enables; account NOT deleted. (web shows `data.detail` `:1737`) | `text-c-red` |
| D5 | Deletion failure (500) | API returns `deletion_failed` | "Something went wrong deleting your account. Please try again or contact support." Button re-enables. | `text-c-red` |
| D6 | Confirmation-required (400) | API returns `confirmation_required` (should not happen — client gates it) | Defensive: "Please type DELETE to confirm." | `text-c-red` |
| D7 | Success (200 `{deleted:true}`) | Deletion done | Sheet shows brief "Your account has been deleted." then: clear all local secure storage/session, sign out RevenueCat (`logOut()`), and hard-navigate to the public landing/Login. (web does `window.location.href='/'` `:1738`) | `text-c-green-readable` |

### Measurable success criteria
- [ ] Every state above has on-screen copy; no state shows a bare spinner with no label for >300ms.
- [ ] All error copy is sentence-case; all status annunciators (ACTIVE, TRIAL ACTIVE, EXAMINER SPEAKING, FREE/PAID readouts, plan/date readouts) are caps-mono.
- [ ] Delete button is provably disabled until the field is exactly `DELETE` (case-sensitive) — automated UI test asserts disabled for "delete", "DELETE ", empty.
- [ ] No copy renders below 12pt at default Dynamic Type.

---

## 4. User flows

### 4.1 Happy path — open & review
1. User taps **Settings** tab.
2. Cards render skeletons, then fill: Account, Voice/Examiner, Theme, Plan & subscription, Your data, Sign out.
3. User scrolls; everything is read/edit-in-place. No save button — edits persist on commit (blur / toggle / selection), mirroring web instant-save (`savePracticeDefault` `:610`).

### 4.2 Change examiner
1. Tap an examiner card → optional Preview (▶) plays a TTS sample line ("Good morning. I'm your designated pilot examiner. Let's begin with the oral examination." web `:704`).
2. Tap **Select** → `POST /api/user/tier {examinerProfile}` → toast "Examiner changed to {name}". The selection sets persona + voice + display identity atomically (web `:597-601`).
3. **Barge-in / interruption:** navigating away mid-preview stops audio (RevenueCat-agnostic; uses the shared TTS player from `useSentenceTTS`/`useVoiceProvider` per Practice spec).

### 4.3 Change theme
1. Tap a theme card → theme applies live app-wide immediately (optimistic) and `POST /api/user/tier {preferredTheme}` persists.
2. On save failure, revert to the prior theme and toast the error.

### 4.4 Manage subscription
- **Paid via IAP (iOS):** Tap "Manage subscription" → present **RevenueCat Customer Center** (native sheet). User can cancel/refund-request/change plan there; on dismiss, refresh `getCustomerInfo()` and re-render the plan card. "Restore purchases" runs `Purchases.restorePurchases()`.
- **Paid via Stripe (web-originated), iOS:** the plan card shows entitlement and, at most, the **neutral, non-actionable status line** ("Your subscription is managed on the web.") — **no button, no in-app browser, no `/api/stripe/portal` call** (anti-steering, SHARED #6 / 04-PAYMENTS §4.1). The user manages it from the web on their own. (The Stripe portal path remains web-only; an Android in-app portal flow, if any, is specified in 04-PAYMENTS, not here.)
- **Free:** Tap "Upgrade plan" → present the Paywall (spec 07) which on iOS launches the **RevenueCat IAP** purchase flow (Guideline 3.1.1), never a Stripe web link (contract `:406`).

### 4.5 Sign out
1. Tap **Sign out** → confirm? (single tap is fine; web does no confirm `:53-57`). Sign out Supabase session + RevenueCat `logOut()` + clear secure token storage → navigate to Login.

### 4.6 Delete account (full flow)
1. Scroll to **Your data** card → tap "Delete account" (D0→D1).
2. Read the data-removal list; if subscribed, read the cancellation note (D2).
3. Type `DELETE` → destructive button enables.
4. Tap "Delete account" (D3) → `POST /api/user/delete {confirm:"DELETE"}`.
5. **Server order (verified, `user/delete/route.ts`):** (a) auth check; (b) type-to-confirm guard; (c) cancel active Stripe sub immediately — abort with 502 if cancel fails so a paying sub is never stranded; (d) **detach/delete the RevenueCat subscriber** for this App User ID (SHARED #3 — so a later "Restore purchases" can't re-grant a deleted account's entitlement); (e) explicit deletes of non-FK-cascaded PII (`subscription_events` by `customer_id`, `support_tickets`+`ticket_replies`); (f) `auth.admin.deleteUser(user.id)` → FK cascades wipe all user-keyed rows across the 34-table map (migration `20260611000001`); (g) confirmation email + anonymized telemetry (`account_deleted`, sha256 of user id). (Steps c–d are the SHARED #3 / D-SET-2 additions; the RevenueCat-detach call is a verified M4/M5 server edit.)
6. On 200 (D7): clear local state, RevenueCat `logOut()`, hard-navigate to landing/Login.
7. **Edge — store subscription still active in Apple's / Google's system:** deleting the HeyDPE account cancels the **Stripe** sub server-side and **detaches the RevenueCat subscriber**, but an **Apple IAP / Google Play** auto-renew is owned by the store and **keeps billing until the user cancels it in Apple Settings / Google Play** (exact steps in the D2 note). The detach means no orphaned entitlement can re-grant access on a future restore. (See **OWNER DECISION D-SET-2**.)

### 4.7 Cancel / back / interruption
- Cancel on D1 → dismiss sheet, no network call, no state change.
- App backgrounded during D3 (in-flight delete) → the POST completes server-side regardless; on relaunch the user's token is invalid (account gone) → routed to Login. If the request never reached the server, the account still exists and the user can retry.
- Killing the app on D1 → nothing deleted.

### Measurable success criteria
- [ ] Examiner Select round-trips and the ACTIVE badge moves to the new card within **300ms** of the 200 response.
- [ ] Theme apply is visible **< 100ms** after tap (optimistic, before the network confirm).
- [ ] Cancelling the delete sheet at D1/D2 issues **zero** requests to `/api/user/delete` (network assertion).
- [ ] A 502 `stripe_cancel_failed` leaves the account intact (a follow-up `GET /api/user/tier` still returns the profile).

---

## 5. API calls

All routes are documented in `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (cited by section). All requests are **Bearer-authenticated** (mobile uses the dual-mode `getAuthedUser()` helper from Part A; no cookies). 429s carry `{error:"rate_limited",detail:…}`.

| Action | Endpoint | Method | Contract ref | Request | Success | Errors |
|---|---|---|---|---|---|---|
| Load tier/features/usage/prefs | `/api/user/tier` | GET | §B.8 (`:481`) | Bearer | 200 `{tier, features, usage, preferredVoice, preferredRating, preferredAircraftClass, aircraftType, homeAirport, preferredTheme, voiceEnabled, voiceOptions, displayName, avatarUrl, examinerProfile}` | 401, 500 |
| Save any preference | `/api/user/tier` | POST | §B.9 (`:496`) | Bearer + subset of `{preferredVoice, preferredRating, preferredAircraftClass, aircraftType, homeAirport, preferredTheme, displayName, avatarUrl, voiceEnabled, examinerProfile}` | 200 `{ok:true}` | 400 per-field (e.g. "Display name too long (max 50 chars)", "Invalid examiner profile", "Invalid theme"), 401, 500 |
| Save default avatar | `/api/user/tier` | POST | §B.9 (`:496`) | Bearer + `{avatarUrl}` (a built-in default-avatar URL — **v1 ships no upload**, SHARED #2) | 200 `{ok:true}` | 400 "Avatar URL too long", 401, 500 |
| Voice preview | `/api/tts` | POST | §B.* TTS | Bearer + `{text, voice}` | 200 audio bytes + `X-Audio-Encoding` header | 401, 429, 500 |
| Subscription status (Stripe path) | `/api/stripe/status` | GET | §B.17 (`:538`) | Bearer | 200 `{tier, status, cancelAt, cancelAtPeriodEnd, currentPeriodEnd}` | 401, 500 |
| Billing portal (Stripe-originated subs) — **NOT called from iOS in v1** (anti-steering; iOS shows only a neutral status line, no portal button — 04-PAYMENTS §4.1; retained for Android/web parity) | `/api/stripe/portal` | POST | §B.18 (`:542`) | Bearer | 200 `{url}` | 400 "No subscription found", 401, 500 |
| **Delete account** | `/api/user/delete` | POST | §B.26 / route table row 26; route truth `user/delete/route.ts` | Bearer + `{confirm:"DELETE"}` | 200 `{deleted:true}` | 400 `confirmation_required`, 401, 502 `stripe_cancel_failed`, 500 `deletion_failed` |
| Data export (if shipped) | `/api/user/export` | GET | §B.27 / route table row 27; route truth `user/export/route.ts` | Bearer | 200 JSON file (`Content-Disposition: attachment`) | 401, 429 `rate_limited` (1/hour) |
| Feature flags (read `scenario_mode` etc.) | `/api/flags` | GET | §B.21 (`:558`) | none | 200 `{tts_sentence_stream, instructor_partnership_v1, scenario_mode}` | fails-open |

**RevenueCat (client SDK, not an HTTP route we own):** `Purchases.getCustomerInfo()`, `Purchases.restorePurchases()`, `RevenueCatUI.presentCustomerCenter()` (Customer Center), `Purchases.logOut()`. Entitlement merge with the server is via `POST /api/iap/sync` — **forward-referenced, not yet in repo** (contract §B.24 `:572`; **OWNER DECISION D-SET-3**, deferred to the payments doc).

### Error / 429 handling
- **401:** one silent token refresh; if still 401 → Login (preserve `heydpe://settings` return).
- **429 on `/api/tts` (preview):** toast "Too many previews — wait a moment and try again."
- **429 on `/api/user/export`:** toast "Data export is limited to once per hour." (mirrors web `:1691`).
- **400 field validations on `/api/user/tier`:** surface the server `error` string verbatim inline under the offending control (the strings are user-safe per §B.9).
- **502 / 500 on delete:** see D4/D5 copy; account is **not** deleted.

### Measurable success criteria
- [ ] Every mutating control maps to exactly one of the endpoints above (no undocumented calls — network log audit).
- [ ] A field-validation 400 surfaces the server's `error` string within 200ms, not a generic message.
- [ ] The delete POST body is exactly `{"confirm":"DELETE"}` (byte-verified) — anything else 400s server-side by design.

---

## 6. Layout + ASCII wireframe + native nav pattern

### Native navigation pattern
- **iOS (HIG):** Settings root is a stack screen with a **large-title navigation bar** ("Settings"), collapsing to inline on scroll. Sub-screens (Examiner detail) use a standard back-chevron nav bar. The Delete-account confirmation is a **`presentationStyle: 'formSheet'` modal** (`expo-router` modal route) — dismissible by swipe-down, with explicit Cancel. RevenueCat Customer Center is presented as Apple's native sheet.
- **Android (Material 3):** Settings root uses a **center/left-aligned Material 3 top app bar** ("Settings"), no large-title collapse. Cards are M3 elevated/outlined surfaces (the bezel recipe maps to M3 elevation per Design System §surfaces). Delete confirmation is an M3 **full-screen dialog** or bottom sheet (per M3 destructive-confirmation guidance). System back dismisses.
- Cards are a single vertical `ScrollView`. Tablet/landscape: cap content width at ~640pt and center (mirrors web `max-w-5xl` wrap); cards do not stretch edge-to-edge on iPad.

### Portrait wireframe (Settings root)

```
┌──────────────────────────────────────────┐
│  Settings                          (iOS    │  ← large-title nav bar
│                                  large title)│
├──────────────────────────────────────────┤
│ ╭────────────────────────────────────────╮ │
│ │ // ACCOUNT                              │ │  ← micro-label caps-mono cyan
│ │ pd@imagineflying.com                    │ │  ← email, read-only, c-text
│ │ ┌────┐  Display name                    │ │
│ │ │ AV │  [ Piotr            ]            │ │  ← avatar + name field
│ │ └────┘  Tap to pick a default avatar    │ │
│ │ ── Practice defaults ──────────────     │ │
│ │ Rating   [ Private ▾ ]                  │ │
│ │ Class    [ ASEL ▾ ]                     │ │
│ │ Aircraft [ C172            ]            │ │
│ │ Home apt [ KJAX  ]                      │ │
│ ╰────────────────────────────────────────╯ │  ← .bezel card
│ ╭────────────────────────────────────────╮ │
│ │ Your examiner                           │ │
│ │ ┌──────────┐ ┌──────────┐               │ │
│ │ │ Maria  ◉ │ │ Bob      │  ▶ Preview    │ │  ← ◉ = ACTIVE annunciator
│ │ │ ACTIVE   │ │ Select   │               │ │
│ │ └──────────┘ └──────────┘               │ │
│ │ ┌──────────┐ ┌──────────┐               │ │
│ │ │ Jim      │ │ Karen    │               │ │
│ │ └──────────┘ └──────────┘               │ │
│ ╰────────────────────────────────────────╯ │
│ ╭────────────────────────────────────────╮ │
│ │ Theme                                   │ │
│ │ [▦ Cockpit ◉][▦ Glass ][▦ Sectional ]   │ │  ← live-apply swatches
│ ╰────────────────────────────────────────╯ │
│ ╭────────────────────────────────────────╮ │
│ │ Plan & subscription                     │ │
│ │ ┌───────────┐ ┌───────────┐             │ │
│ │ │CURRENT    │ │ RENEWS     │            │ │  ← caps-mono readouts
│ │ │  PAID     │ │ Jul 14 2026│            │ │
│ │ └───────────┘ └───────────┘             │ │
│ │ [ Manage subscription ] [ Restore ]     │ │
│ ╰────────────────────────────────────────╯ │
│ ╭──────────── border-c-red/30 ───────────╮ │
│ │ Your data                               │ │  ← danger card
│ │ // DELETE ACCOUNT                       │ │
│ │ Permanently deletes your profile, exam  │ │
│ │ history, transcripts, progress, and     │ │
│ │ cancels any active subscription.        │ │
│ │ [ Delete account ]   (red)              │ │
│ ╰────────────────────────────────────────╯ │
│  ─────────────────────────────────────────  │
│  Sign out                                   │  ← muted row
└──────────────────────────────────────────┘
   (safe-area bottom inset honored)
```

### Delete-account confirmation sheet (modal)

```
╭──────────────────────────────────────────╮
│            ▁ (grabber)                     │
│  Delete your account?                      │  ← title, sentence-case
│                                            │
│  This permanently removes:                 │
│   • Your profile & sign-in                 │
│   • All exam sessions & transcripts        │
│   • Per-element progress & scores          │
│   • Support tickets & messages             │
│   • Any active subscription is cancelled   │
│  This can't be undone.                     │
│                                            │
│  ⚠ Deleting won't stop App Store / Google  │  ← D2, conditional (store sub)
│    Play billing — cancel it in Settings →   │
│    Subscriptions (iPhone) / Play Store      │
│    Subscriptions (Android). (Stripe: auto-  │
│    cancelled immediately.)                  │
│                                            │
│  Type DELETE to confirm                    │
│  [ DELETE_____ ]   (mono, c-red focus)     │
│                                            │
│  [   Delete account   ]  (red, disabled    │
│                           until == DELETE) │
│  [        Cancel        ]                  │
╰──────────────────────────────────────────╯
```

### Measurable success criteria
- [ ] iOS large-title collapses on scroll; Android shows an M3 top app bar — verified on a device of each OS.
- [ ] The danger card is visually distinct (red-tinted border `border-c-red/30`) from all other cards.
- [ ] Delete sheet is swipe-to-dismiss at D1/D2 and **non-dismissible** at D3 (in-flight).
- [ ] On iPad/landscape, card content width ≤ 640pt and centered; no edge-to-edge stretch.

---

## 7. Native components & interactions

### Qualitative requirements
- **Lists/cards:** native `ScrollView` of `.bezel` cards; examiner/theme pickers are tap-grids of pressable cards (44pt min). Selected card uses `.station` + `ring-1 ring-c-amber/20`.
- **Pickers:** Rating/Class use native pickers — iOS wheel/menu (`@react-native-picker` or a HIG menu), Android M3 dropdown menu.
- **Text fields:** Display name, aircraft type, home airport, and the DELETE confirm field use native `TextInput`. The DELETE field is `autoCapitalize="characters"`, `autoCorrect={false}`, `keyboardType="default"`, mono font.
- **Subscription:** RevenueCat Customer Center & Paywall are native presentations (RevenueCat UI SDK). On iOS there is **no in-app Stripe portal** — Stripe-originated subs show only a neutral, non-actionable status line (no `expo-web-browser`, no portal button; anti-steering, 04-PAYMENTS §4.1).
- **Avatar:** tap → a **default-avatar grid** (built-in avatars only) presented as a sheet; tapping one saves it via `POST /api/user/tier {avatarUrl}`. **No photo-library access in v1** — no `expo-image-picker`, no Photos permission (SHARED #2; custom-avatar upload deferred to v1.1). This is what keeps "the microphone is the only sensitive permission" TRUE.

### Gestures
- Swipe-down dismiss on the delete sheet (except D3). iOS edge-swipe / Android system back pop the stack. Pull-to-refresh on the Settings root re-fetches `/api/user/tier` + `/api/stripe/status` + `getCustomerInfo()`.

### Haptics (Design System haptic vocabulary)
- Examiner/theme **selection** → `selection` (light) haptic.
- Save **success** toast → `notificationSuccess`.
- Save/network **error** → `notificationError`.
- Opening the Delete confirm (D1) → `impactMedium`.
- Confirming delete (D3) → `notificationWarning`.

### Keyboard handling
- `KeyboardAvoidingView` so the DELETE field and name field aren't covered. "Done"/return dismisses keyboard and commits the field (blur-to-save semantics matching web `onBlur` saves).
- The DELETE field's return key is "Done"; it does not auto-submit deletion (submission requires the explicit destructive button tap).

### Safe-area / insets
- Respect top safe-area under the nav bar and bottom safe-area above the home indicator; the "Sign out" row and bottom CTA sit above the bottom inset.
- Dynamic Island / notch: the large-title bar and modal sheets inset correctly; no content under the island. (No Live Activity here — that is v1.1.)

### Measurable success criteria
- [ ] All tappable controls ≥ **44×44pt (iOS)** / **48×48dp (Android)** — automated measurement.
- [ ] DELETE field never auto-submits; deletion requires the dedicated button.
- [ ] On iOS, the Stripe-originated plan card shows **no** portal button or link — only the neutral status line (no `/api/stripe/portal` call from iOS; anti-steering).
- [ ] Keyboard never covers the focused field (no field obscured when keyboard is up, on smallest supported device).

---

## 8. Accessibility

### Qualitative requirements
Full VoiceOver/TalkBack support; Dynamic Type up to the accessibility XL sizes (clamped per role per Design System); all text ≥ 4.5:1 contrast; reduced-motion honored (no glow pulse, static fills).

### VoiceOver / TalkBack — labels & order
Reading order top→bottom, left→right:
1. Nav title "Settings" (heading).
2. Account: "Account, your email is pd@imagineflying.com" → "Display name, edit, current value Piotr" → "Profile avatar, button, pick a default avatar" → practice defaults (each labeled "Rating, Private, button" etc.).
3. Examiner: each card "Maria Torres examiner, [Active / Select], Calm and systematic…"; preview button "Preview Maria's voice, button". The ACTIVE badge is announced as part of the card's `accessibilityValue` = "selected".
4. Theme: "Cockpit theme, selected" / "Glass Cockpit theme, button".
5. Plan: "Current plan, Paid" (readout exposed as text, not just visual) → "Renews, July 14 2026" → "Manage subscription, button" → "Restore purchases, button".
6. Your data → "Delete account, button. Permanently deletes your account and data." (the destructive role is announced).
7. "Sign out, button."

Delete sheet:
- Title "Delete your account?" announced as a heading; the data list read as a list; the conditional sub note read; the field labeled "Type the word DELETE to confirm, text field"; the button labeled "Delete account, button" with `accessibilityTraits` including **destructive**; while disabled it is announced "dimmed".

### Dynamic Type
- All body copy scales; caps-mono readouts scale but clamp at the role ceiling so the plan/date readouts don't overflow their tiles (wrap to two lines rather than truncate).
- No fixed 11px text reproduced from web; **12pt floor** enforced even at the smallest Dynamic Type.

### Contrast
- Use `-readable` text variants for green/cyan text (`text-c-green-readable`, `text-c-cyan-readable`) to clear 4.5:1 — the plain `c-green`/`c-cyan` are fills/swatches only. Red error text `c-red` (#ff5a4d) is the AA-lifted token. Verified pairs in Design System contrast pass-list.

### Reduced motion
- `prefers-reduced-motion`/"Reduce Motion": disable skeleton shimmer (static dim fill), disable the examiner preview waveform animation (show a static "Speaking" annunciator instead), disable glow pulse. Theme change still applies (instant, not animated).

### Measurable success criteria
- [ ] VoiceOver/TalkBack reads every control with a meaningful label and role; the delete button announces the **destructive** trait and its disabled state.
- [ ] All text/background pairs ≥ **4.5:1** (axe/contrast audit passes; green/cyan text uses `-readable`).
- [ ] At the largest Dynamic Type, no readout truncates with "…"; it wraps. No control overlaps.
- [ ] With Reduce Motion on, zero continuous animations run on this screen.

---

## 9. Analytics events (mirror web PostHog names)

| Event | When | Properties | Web parity |
|---|---|---|---|
| `settings_voice_changed` | Voice/examiner changed (and voiceEnabled toggle) | `{enabled?}` / `{examinerProfile}` | web `captureVoiceEvent('settings_voice_changed', {enabled})` `:641`; one of the 11 shipped funnel events (CLAUDE.md PostHog list) |
| `paywall_shown` | Upgrade tapped → paywall presented | `{source:'settings'}` | shipped funnel event |
| `upgrade_clicked` | "Upgrade plan" tapped | `{source:'settings', plan?}` | shipped funnel event |
| `account_deleted` | Server emits on successful deletion (anonymized: `deleted:{sha256[:16]}`) | `{had_subscription}` | **server-side**, `user/delete/route.ts:84` — do NOT also emit client-side under the real user id |
| `settings_theme_changed` *(new)* | Theme applied | `{theme}` | no exact web event; align name to `settings_*` family (**OWNER DECISION D-SET-4** — confirm name) |
| `manage_subscription_opened` *(new)* | Subscription management opened | `{provider:'revenuecat'\|'stripe'}` — on **iOS** only `'revenuecat'` (Customer Center) fires; `'stripe'` is Android/web only (iOS never opens the Stripe portal, anti-steering) | new for mobile; not in web set |
| `restore_purchases` *(new)* | Restore tapped | `{result:'restored'\|'none'\|'error'}` | new for mobile IAP |

### Measurable success criteria
- [ ] `settings_voice_changed`, `paywall_shown`, `upgrade_clicked` fire with the same names as web (verified in PostHog Live Events).
- [ ] The client never emits `account_deleted` under the real user id (it is server-side, anonymized) — avoids leaking a deletion event tied to PII.
- [ ] New `settings_theme_changed` / `manage_subscription_opened` / `restore_purchases` names are confirmed by the owner before release (D-SET-4).

---

## 10. Store-compliance touchpoints

### Account deletion (Apple Guideline 5.1.1(v) + Google Play Account/Data deletion) — the load-bearing requirement
- **In-app path:** Settings → Your data → Delete account. Reachable in ≤2 taps; no web redirect, no "email us to delete." (Apple rejects email-only deletion.)
- **Confirmation:** explicit type-to-confirm (`DELETE`) + destructive button (D1) so deletion is never accidental.
- **What is deleted (data-removal contract — verified against `user/delete/route.ts`):**
  - **Auth identity** — `auth.admin.deleteUser(user.id)` removes the Supabase auth user (D7).
  - **FK-cascaded (all user-keyed rows across the 34-table map, migration `20260611000001`):** `user_profiles`, `exam_sessions`, `session_transcripts`, `element_attempts`, `transcript_citations`, `latency_logs`, `usage_logs`, `active_sessions`, `email_preferences`, `off_graph_mentions`, instructor/connection rows, milestones, etc.
  - **Explicit deletes (not FK-cascaded):** `subscription_events` (by `stripe customer_id`), `support_tickets` + `ticket_replies` (PII).
  - **Subscription:** any active **Stripe** subscription is **cancelled immediately**; if cancel fails the API returns **502 and does NOT delete** the account (a paying sub is never stranded, `route.ts:43-57`). The server also **detaches/deletes the RevenueCat subscriber** for the App User ID (SHARED #3) so a post-deletion restore can't re-grant entitlement.
  - **Store-sub caveat:** an Apple **IAP** / **Google Play** auto-renew is owned by the store — deleting the HeyDPE account cannot stop store billing. The D2 copy tells the user the store sub **keeps billing until cancelled** and gives the exact cancel steps (iPhone: Settings → [name] → Subscriptions → HeyDPE → Cancel; Android: Play Store → Payments & subscriptions → Subscriptions → HeyDPE → Cancel). Deletion is **still allowed** (v1 does not block deletion on an active store sub) — D-SET-2.
  - **Post-delete side effects:** confirmation email (`sendAccountDeleted`) + anonymized telemetry only (sha256 of user id; no PII retained in analytics).
- **Reviewer-facing copy** lists exactly what is removed (D1 body) so an Apple reviewer can confirm the scope matches the privacy label.

### Subscription compliance
- **iOS purchases use RevenueCat IAP** (Apple Guideline 3.1.1) — never a Stripe web link inside the iOS app for buying. "Manage subscription" on iOS opens RevenueCat **Customer Center**; "Restore purchases" is present (Apple requires a restore path).
- **Existing Stripe-web subscribers** (Apple 3.1.3(b)) sign in and get full access; on iOS the plan card shows entitlement and at most a **neutral, non-actionable status line** — **no in-app Stripe-portal button** and no Stripe purchase link (anti-steering; SHARED #6 / 04-PAYMENTS §4.1). The Stripe Customer Portal stays web-only; the user manages it on the web on their own.
- Terms & Privacy links: present on the Paywall (spec 07) and reachable from Settings (legal links row) — required by both stores.

### Permissions
- **No sensitive permission is requested on Settings.** v1 ships **default avatars only** — no photo-library access, **no `NSPhotoLibraryUsageDescription`/Photos permission** (SHARED #2). Custom-avatar upload (and its Photos permission) is deferred to v1.1. No mic/camera permission is requested on Settings either; the microphone remains the app's only sensitive permission (requested in the voice flow, not here).

### Measurable success criteria
- [ ] Deletion is fully in-app, ≤2 taps, with type-to-confirm — passes an Apple reviewer walkthrough.
- [ ] The D1 deletion-scope list matches the actual `user/delete` removal set (audited row-by-row against `route.ts`).
- [ ] A 502 `stripe_cancel_failed` provably leaves the account intact.
- [ ] iOS shows no Stripe buy link and no in-app Stripe-portal button (Stripe subs get only a neutral status line); Restore Purchases is present and functional.
- [ ] No Photos permission is declared or requested anywhere in v1 (default avatars only); the app's only sensitive permission is the microphone (not requested on Settings).

---

## 11. MEASURABLE acceptance criteria (engineer/QA pass-fail checklist)

### Performance budgets
- [ ] Settings tab **time-to-interactive ≤ 800ms** on a mid-tier device (cards visible as skeletons immediately; identity + theme interactive before subscription resolves).
- [ ] `/api/user/tier` + `/api/stripe/status` + `getCustomerInfo()` issued **in parallel** on mount (single network burst, not sequential).
- [ ] Theme apply visible **< 100ms** after tap (optimistic).
- [ ] Examiner ACTIVE badge moves **< 300ms** after the 200.
- [ ] Delete POST resolves to a navigation **< 3s** under normal network (server cancels Stripe + cascades + emails async).

### UI invariants
- [ ] Caps-mono + glow used ONLY for: `// ` micro-labels, status annunciators (ACTIVE, TRIAL ACTIVE, EXAMINER SPEAKING), plan/date numeric readouts, examiner/ACS codes. Everything else sentence-case IBM Plex. (grep the screen for `uppercase` usage — each instance justified.)
- [ ] Glow appears only on live status (preview speaking) — never on static labels.
- [ ] No text below **12pt**; no `text-[10px]`/`[11px]` reproduced from web.
- [ ] Every touch target ≥ 44pt iOS / 48dp Android.
- [ ] Danger card uses the red-tinted border; all other cards use `border-c-border`.

### Behavioral invariants
- [ ] Free user sees "Upgrade plan"; Paid-IAP sees "Manage subscription" + "Restore purchases"; Paid-Stripe (iOS) sees only a neutral, non-actionable status line (no portal button). (3 distinct states verified.)
- [ ] Cancelling/back-out of the delete sheet issues zero `/api/user/delete` calls.
- [ ] Delete button disabled until field == `DELETE` (case-sensitive); enabled state verified.
- [ ] 502 leaves account intact; 200 logs out **and server-detaches** the RevenueCat subscriber, clears secure storage + navigates to landing/Login.
- [ ] Sign out clears Supabase session + RevenueCat + secure tokens and routes to Login.
- [ ] Pull-to-refresh re-fetches tier + status + customer info.

### Accessibility / compliance gates
- [ ] VoiceOver/TalkBack full pass; delete button announces destructive + disabled state.
- [ ] All contrast pairs ≥ 4.5:1; green/cyan text uses `-readable` variants.
- [ ] Reduce Motion: no continuous animation runs.
- [ ] Account deletion reachable in-app ≤2 taps; scope list matches server removal set.
- [ ] No iOS Stripe buy link; Restore Purchases present.

---

## OWNER DECISIONS (do not silently resolve)

> **D-SET-1 — Mobile API contract entries (RESOLVED in contract).** `/api/user/avatar` is now documented at **§B.14 / route table row 14**; `/api/consent` at **§B.25 / row 25**; `/api/user/delete` at **§B.26 / row 26**; `/api/user/export` at **§B.27 / row 27** — all under the dual-mode `getAuthedUser()` helper (Part A). The earlier claim that avatar/delete/export were "NOT in contract" is **stale** and has been corrected in §5. The one genuinely-open item is the **NEW `ai_data_processing` consent kind** (SHARED #1): the `/api/consent` route's `kind` coercion (`consent/route.ts:23`) must be widened to accept it — owned by `screens/02-onboarding.md`, not this screen. **No remaining contract gap blocks Settings.**

> **D-SET-2 — Account deletion vs. an active store subscription (RESOLVED, SHARED #3).** v1 **allows deletion** even with an active store sub. The server (a) **detaches/deletes the RevenueCat subscriber** during deletion so a later "Restore purchases" cannot falsely re-grant entitlement, and (b) the D2 copy prominently warns that an **Apple App Store / Google Play** subscription **keeps billing until cancelled in Apple Settings / Google Play**, with the exact steps. Stripe is auto-cancelled server-side as today. The RevenueCat-detach call is the one server-side addition required (verified M4/M5 edit). **Open for owner: confirm the RevenueCat detach mechanism (delete subscriber vs. transfer/anonymize) and where it lands in the IAP server work.**

> **D-SET-3 — RevenueCat ↔ server entitlement merge (`/api/iap/sync`) is deferred to the payments doc (M4).** Settings' "Manage subscription"/"Restore" depend on the IAP entitlement being readable from `/api/user/tier` after the merge. The route shapes are placeholders (contract §B.24). **Confirm Settings can ship reading IAP state via RevenueCat SDK in v1 while the server merge lands in M4.**

> **D-SET-4 — Confirm new mobile analytics event names** (`settings_theme_changed`, `manage_subscription_opened`, `restore_purchases`). Web has no exact equivalents; align to the `settings_*` family or rename.

> **D-SET-5 — Include GDPR data export in v1?** The web "Download my data (JSON)" (`/api/user/export`, 1/hr) is listed DEFERRED above. Google Play increasingly expects an in-app **data export/deletion** pairing. **Recommendation: include export in v1** (it's a single button + share-sheet save) to de-risk Play review; the route already exists.
