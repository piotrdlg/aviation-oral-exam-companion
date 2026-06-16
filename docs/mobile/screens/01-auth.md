# Screen Spec 01 — Login / OTP / OAuth (native)

> **Web source of truth:** `src/app/(auth)/login/page.tsx` (the `LoginForm`, lines 56–462) and the legacy `src/app/(auth)/signup/page.tsx` (a `redirect('/login')` stub, lines 8–10). This native spec mirrors the shipped web auth screen exactly — same providers, same OTP behavior, same copy — and adapts the transport to **native Supabase SDK + PKCE deep link**, not the web cookie/`/auth/callback` flow.
>
> **Locked decisions this spec builds on (do NOT re-litigate):** React Native + Expo (New Architecture, dev-client); monorepo `apps/mobile` + `packages/shared`; "Native-adapted FLIGHT DECK" design language; PARITY v1; iOS first; **Sign in with Apple at parity is mandatory** for App Store 4.8 (see §10). Session persistence via `expo-secure-store`; PKCE deep-link `com.heydpe://auth-callback`; **`/auth/callback` is NOT used on mobile.**
>
> **Read-order companions:** Design tokens & IA → `docs/mobile/02-DESIGN-SYSTEM.md`. API shapes → `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` (referenced by section number throughout, e.g. "Contract §B.19").
>
> **Typography rule applied verbatim (THE ONE RULE):** caps-mono + glow ONLY for instrument moments — the `// Authentication` micro-label, status annunciators/badges, and the `HeyDPE` wordmark "DPE" glyphs. The H1 "Sign in to HeyDPE", the subtext, every button label, every error string, the legal line, and the "Why no password?" body are **sentence-case IBM Plex, no glow**. Never render below 12pt. Touch targets ≥ 44pt iOS / 48dp Android.

---

## 1. Purpose & role in the product

### Qualitative requirements
- **Single unified auth gate.** This is the one screen where an unauthenticated user becomes authenticated. It merges sign-in and sign-up: there is no separate signup screen (the web `/signup` is a server redirect to `/login`; the native router has **no** `signup` route — the `(auth)` stack contains only `login.tsx`, per Design System §6 IA, `_layout.tsx:528-530`). Accounts **auto-create on first sign-in** for every method (OTP `shouldCreateUser:true` at web `login/page.tsx:148`; OAuth and Apple native sign-in both upsert a `user_profiles` row server-side via the `on_auth_user_created` trigger, with the `ensureProfile()` safety net at `auth/callback/route.ts:54-76` — on native this profile-ensure happens on the **first authenticated API call**, see §5).
- **Offers four entry methods at parity:** Email 6-digit OTP, Continue with Google, **Continue with Apple (native, required for 4.8)**, Continue with Microsoft (optional). The order and presence mirror the web `oauthProviders` array (`login/page.tsx:246-280`): Google, Apple, Microsoft, then the "or" divider, then email.
- **It is the AI-consent precursor, not the consent gate itself.** Consent for third-party-AI voice processing (Anthropic/Deepgram/OpenAI) lives in the **onboarding modal** that presents *after* auth (Design System §6, `onboarding.tsx`, App Review 5.1.2(i)). This screen only carries the Terms/Privacy agreement line (§3, §10).
- **It owns deferred deep-link routing.** A referral (`ref/<code>`) or invite (`invite/<token>`) link that opens the app while logged-out must be **captured, held across the auth round-trip, and replayed after sign-in** (§4 flow E, §5).

### Role in the IA
- Sits in the **`(auth)` stack, outside the bottom tab bar** (Design System §6.6, "Auth and onboarding-consent gates sit *outside* the tabs so they can present before the tab UI", `:572`; IA tree `:527-530`). The root `_layout.tsx` gates auth: if `getSession()` (from `expo-secure-store`-backed Supabase SDK) returns no session, the router redirects to `/(auth)/login`; if a session exists the user never sees this screen (mirrors web "redirect if already authenticated", `login/page.tsx:91-95`).
- **Not a tab destination.** It has no tab bar, no large-title nav bar — it is a full-screen branded card (the web renders it centered on `bg-c-bg` with its own `<Footer variant="public" />`, `login/page.tsx:283-460`).

### Measurable success criteria
- [ ] Exactly **one** route in the `(auth)` stack reaches auth (`login.tsx`); there is **no** `signup` route (grep: `0` files named `signup*` under `apps/mobile/app`).
- [ ] All **four** methods (Email OTP, Google, Apple-native, Microsoft) are reachable and visible above the fold on a 375×667pt device (iPhone SE) without scrolling to the first provider button — pass/fail screenshot.
- [ ] **Sign in with Apple is present and visually at parity** with Google/Microsoft (same button height, same row, not visually de-emphasized) on iOS — pass/fail (4.8 gate, §10).
- [ ] A logged-in user launching the app **never renders** the login screen (0ms flash) — the splash holds until `getSession()` resolves (Design System §2.4 splash-until-loaded, `:244`).

---

## 2. Entry points & navigation

### Qualitative requirements
- **Reached by:**
  1. **Cold launch while logged-out** — root `_layout.tsx` auth gate redirects here after splash.
  2. **Sign-out** — web parity: sign-out lives in the dashboard nav, calls `supabase.auth.signOut()` then routes to `/login` (web `layout.tsx:53-57`). Native equivalent: the Settings/profile sign-out clears the `expo-secure-store` session and the root gate returns the user here.
  3. **A `401` from any authenticated API call** while the app believed it was logged in (expired/revoked JWT) — the client clears the stored session and routes here, preserving the in-app `redirect` target so the user resumes where they were (web parity: `redirect` query param threads through OAuth + OTP success, `login/page.tsx:112-115,234`).
  4. **A deferred deep link** (`com.heydpe://ref/<code>`, `com.heydpe://invite/<token>`, universal/App Link equivalents) opened while logged-out → routed here with the token held (§4 flow E).
- **Native navigation pattern:** full-screen route inside a **Stack with no tab bar and no header** (`(auth)/_layout.tsx` = `Stack` with `headerShown:false`, Design System §6 IA `:529`). It is **not** a sheet/modal — it is the root presented screen for unauthenticated state. There is no back affordance from login itself (it is the stack root); the OS back gesture on Android is a no-op here (cannot dismiss the auth gate).
- **Deep-link routes that land here (registered in `app.json` `scheme: "com.heydpe"` + Associated Domains / App Links):**
  - `com.heydpe://auth-callback?code=…&state=…` — **the PKCE OAuth/Apple-web return** (handled, then consumed; the user is *already* mid-auth, so this completes sign-in rather than presenting the form — §4 flow B/C).
  - `com.heydpe://ref/<code>` and `com.heydpe://invite/<token>` — deferred to login when logged-out (§4 flow E).

### Measurable success criteria
- [ ] The `auth-callback` deep link is registered and resolves: tapping a `com.heydpe://auth-callback?...` URL while the app is backgrounded mid-OAuth resumes the **same** auth attempt (no new login form shown) — link-test, pass/fail.
- [ ] A `401` on a previously-authenticated session deterministically lands the user on login with the prior destination preserved as `redirect` — verified by integration test (sign in → revoke JWT server-side → next API call → assert login screen + `redirect` retained).
- [ ] On Android, the system back gesture at the login root does **not** exit the app to a blank state nor dismiss the gate (it backgrounds the app like a normal root) — pass/fail.
- [ ] **0** `@react-navigation/*` direct imports in the auth stack (all navigation via expo-router, Design System §6 `:577`).

---

## 3. STATE MATRIX

Web step model (`AuthStep`, `login/page.tsx:13`): `'initial' | 'otp-sent' | 'verifying'`, plus per-provider OAuth loading (`loadingOAuth: Provider | null`), `loadingOtp`, `loadingVerify`. Native mirrors these and adds an Apple-native state and offline/SecureStore states.

All copy below is **exact** (sentence-case where the rule requires; the only caps-mono strings are the `// Authentication` label and the wordmark). FLIGHT DECK tokens cited from Design System §1.

| State | Trigger | User-facing copy (exact) | FLIGHT DECK tokens |
|---|---|---|---|
| **Idle / initial** | Screen mounted, no auth in flight (`step:'initial'`, all loading false) | Micro-label `// Authentication`; H1 **Sign in to HeyDPE**; sub **Practice your checkride oral exam**; three provider buttons **Continue with Google / Continue with Apple / Continue with Microsoft**; divider **or**; field label **Email address**, placeholder **you@example.com**; primary **Send login code** | Card: `.bezel rounded-xl border border-c-border` (`login/page.tsx:292`). Micro-label: `font-mono text-xs text-c-cyan tracking-[0.3em] uppercase` (`:294`). H1: Plex bold `text-c-text` (`:295`). Sub: `text-c-muted` (`:296`). Provider btn: `bg-c-bezel` / hover `bg-c-border`, `border-c-border`, `text-c-text` (`:314`). Primary: `bg-c-amber` → `text-c-bg` (`:354`). Divider word: `text-c-dim` on `bg-c-bezel` (`:328`). |
| **OAuth loading (per provider)** | A provider button tapped (`loadingOAuth === provider`); all provider buttons disabled | Tapped button shows spinner + **Redirecting…**; others dim | Spinner (amber-on-bezel), label **Redirecting…** (`login/page.tsx:317`), disabled buttons `opacity-50` (`:314`). Light-impact haptic on tap (Design System §7.3). |
| **Apple-native sheet presenting** | Continue with Apple tapped on iOS → `AppleAuthentication.signInAsync()` (system sheet) | Button shows spinner; **system Apple sheet** overlays (Face ID / passcode) — no custom copy, Apple owns it | Spinner state as above; the sheet itself is OS-rendered (HIG). |
| **OTP sending** | Send login code tapped (`loadingOtp`) | Primary button: spinner + **Sending code…** | `bg-c-amber`, disabled `bg-c-amber/50` (`login/page.tsx:354,359`). |
| **OTP sent (code entry)** | OTP request succeeded (`step:'otp-sent'`) | Success line ✓ **Code sent to {email}**; label **Enter the 6-digit code**; six digit boxes; helper **Code expires in 60 minutes**; **Verify code**; secondary **Use a different email or resend code** | Success ✓: `text-c-green` glyph + `text-c-green-readable` text (`login/page.tsx:373-374`). Digit boxes: `bg-c-panel border-c-border rounded-lg text-c-amber font-mono`, focus `ring-2 ring-c-amber` (`:394`). Helper: `text-c-dim` (`:401`). Verify: `bg-c-amber` (`:422`). Secondary: `text-c-muted` (`:431`). |
| **Verifying** | All 6 digits entered (auto-submit) or Verify tapped (`step:'verifying'`) | Digit boxes disabled; **Verifying…** with spinner | Boxes `opacity-50` (`:394`); status row `text-c-muted` + spinner (`:412-415`). |
| **Success** | `verifyOtp` / OAuth / Apple-native returns a session | No persistent copy — route transitions. Optional one-shot toast on cold first sign-in is owned by onboarding, not here | Success notification haptic is **not** fired on login (reserved for assessment, §7); transition is silent. |
| **Error — OAuth/provider failed** | `signInWithOAuth` error, or `auth-callback` deep link arrives with `?error=` (web maps to `oauth_error`, `getErrorMessage` `:19-20`) | Top error banner: **Sign-in with your provider failed. Please try again.** (or provider's message if present) | Banner: `bg-c-red-dim/40 border border-c-red/30 rounded-lg`, ⚠ + `text-c-red` (`login/page.tsx:301-304`). Error-notification haptic (§7.3). |
| **Error — code exchange failed** | PKCE `exchangeCodeForSession` fails (web `code_exchange_failed`, `:21-22`) | **Authentication failed. Please try signing in again.** | Red banner as above. |
| **Error — OTP send failed** | `signInWithOtp` returns error (`:152-154`) | The Supabase error message verbatim (e.g. rate-limit / invalid email) in the top banner | Red banner (`:300-305`). |
| **Error — verification failed / expired** | `verifyOtp` error (`:227-231`); digits cleared, return to `otp-sent` | Inline below boxes: the Supabase message (e.g. **Token has expired or is invalid**); plus web's friendly variant for link errors **Verification failed. The code may have expired — please request a new one.** (`:23-24`) | Inline: ⚠ `text-c-red` centered (`:404-408`); boxes reset to empty. |
| **Error — incomplete code** | Verify tapped with <6 digits | **Please enter the full 6-digit code** (`login/page.tsx:213`) | Inline `text-c-red`. |
| **Error — no auth params** | `auth-callback` deep link with neither `code` nor token (web `no_auth_params`, `:25-26`) | **Something went wrong during sign-in. Please try again.** | Red banner. |
| **Offline / no network** | OTP send, verify, or OAuth attempted with no connectivity (RN `NetInfo` reachable=false, or fetch throws) | Banner: **You appear to be offline. Connect to the internet and try again.** | Red banner; Error-notification haptic. Buttons remain enabled to retry. |
| **Degraded — auth service 5xx** | Supabase auth endpoint returns 5xx / timeout | **We couldn't reach sign-in right now. Please try again in a moment.** | Red banner; retriable. |
| **Permission-denied — none on this screen** | n/a | This screen requests **no** device permissions (mic is requested later, at first voice exam — Design System §3, App Review 5.1.1(ii)). No camera/contacts/notifications prompt here. | — |
| **SecureStore unavailable (rare)** | `expo-secure-store` write fails (e.g. no device passcode/keychain locked) — session cannot persist | **We couldn't securely save your session on this device. You can still continue, but you may be asked to sign in again.** | Amber (warning) inline note `text-c-amber`; non-blocking — sign-in proceeds in-memory for the session. |
| **Default-card skeleton (cold pre-fonts)** | Splash already covers cold start; if a brief mount flash occurs the card matches web Suspense skeleton | No copy — pulsing skeleton bars | `.bezel`, pulsing `bg-c-panel` bars (web `login/page.tsx:38-49`). Disabled under reduce-motion (Design System §7). |

### Measurable success criteria
- [ ] Every error path above renders a **dismissable-on-retry** banner with the **exact** copy listed (string-match test against a copy constants file) — pass/fail per row.
- [ ] The error banner clears automatically on the next attempt (`setError(null)` parity, `login/page.tsx:106,143`) — pass/fail.
- [ ] OTP digit boxes are **reset to empty** on a failed verify and focus returns to box 1 (web `:229`) — pass/fail.
- [ ] No screen state renders text below **12pt**; the digit-box glyph is the largest readout (`text-lg`, ~18pt) — static scan.

---

## 4. User flows

### Happy path A — Email 6-digit OTP
1. User types email in the **Email address** field → taps **Send login code**.
2. Light haptic; button → **Sending code…**; client calls `supabase.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } })` (web `:145-150`).
3. On success → `step:'otp-sent'`; success line **Code sent to {email}**; first digit box auto-focuses; numeric keyboard opens (web focuses box 0 on step change, `:98-102`).
4. User enters the 6 digits — **auto-advance** on each entry, **backspace** moves to the previous box, **paste-to-fill** distributes a pasted code, and entry of the 6th digit **auto-submits** (web `handleOtpChange` `:162-179`, `handleOtpPaste` `:187-208`).
5. Auto-submit (or **Verify code**) calls `supabase.auth.verifyOtp({ email, token, type:'email' })` (web `:221-225`); `step:'verifying'`, boxes disabled, **Verifying…**.
6. On success: the native Supabase SDK persists the session to **`expo-secure-store`** (the SDK `storage` adapter, §7); UTM metadata persisted fire-and-forget (web `persistUTMToUser('email_otp')` `:233`; native reads UTM from `expo-secure-store`/MMKV captured at install/first-open); analytics `sign_up` (method `email_otp`) fires (§9); router replays the held `redirect` target or routes to `/practice` if onboarding incomplete else `/(tabs)/home` (web routes `redirect || '/home'` `:234`; native adds the onboarding-incomplete → `/practice` branch that the web callback performs at `auth/callback/route.ts:122-130`).

### Happy path B — Google / Microsoft OAuth (PKCE deep link)
1. User taps **Continue with Google** (or Microsoft). `loadingOAuth` set; button → **Redirecting…**.
2. Client builds a PKCE flow with the native Supabase SDK: `supabase.auth.signInWithOAuth({ provider, options:{ redirectTo: 'com.heydpe://auth-callback', skipBrowserRedirect: true, ...(provider==='azure' ? { scopes:'openid email profile' } : {}) } })`. The **azure email scope override is required** (web `:121-127` — Microsoft returns no email under bare `openid`, which fails the Supabase callback). The returned `data.url` is opened in an **in-app browser** via `expo-web-browser` `openAuthSessionAsync(url, 'com.heydpe://auth-callback')` (ASWebAuthenticationSession on iOS / Custom Tabs on Android — the system-trusted, cookie-isolated auth surface).
3. User authenticates with the provider in the system auth session.
4. Provider redirects to `com.heydpe://auth-callback?code=…&state=…`; `openAuthSessionAsync` resolves with that URL.
5. Client extracts `code`, calls `supabase.auth.exchangeCodeForSession(code)` (the SDK verifies the PKCE `code_verifier` it stored in `expo-secure-store`). **`/auth/callback` is never hit** — this is the native divergence from web (web routes the provider back to `${origin}/auth/callback`, `login/page.tsx:113-115`; mobile uses the custom scheme and exchanges in-process).
6. On success the SDK persists the session to `expo-secure-store`; `sign_up`/login analytics fires with the provider method; profile-ensure runs on first API call (§5); router replays `redirect` / onboarding branch as in A.6.

### Happy path C — Sign in with Apple (NATIVE, required by 4.8)
1. User taps **Continue with Apple** on **iOS**.
2. Client calls **`expo-apple-authentication`** `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })` — the **native** Apple sheet (Face ID / Touch ID / passcode), **not** a web redirect. This is the 4.8 compliance path and the App Store-quality experience (App Review brief: native Apple sign-in, not a WebView).
3. Apple returns an `identityToken` (JWT) and, on **first** sign-in only, the user's name/email (Apple sends these once; the app must persist them — Apple never resends).
4. Client calls `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce })` — the nonce is the SHA-256 of a random raw nonce passed to `signInAsync` and the raw nonce to Supabase (Apple/Supabase nonce contract). This **replaces** the OAuth redirect for Apple specifically.
5. On success the SDK persists to `expo-secure-store`; if Apple returned a name on first sign-in, the client stores it as the display name via `POST /api/user/tier` `{ displayName }` (Contract §B.9) after the session exists; analytics `sign_up` (method `apple`) fires; router replays `redirect`/onboarding branch.
6. **Apple "Hide My Email" relay** is honored as-is — the relay address flows through Supabase; no special handling, and it satisfies the 4.8 "keep email private" requirement.

> **OWNER DECISION — Apple on Android.** `expo-apple-authentication` is iOS-only. On Android, "Continue with Apple" either (a) is **hidden** (Apple sign-in is only required on iOS), or (b) falls back to the **web OAuth/PKCE** path (flow B with `provider:'apple'`). **Default recommendation: hide the Apple button on Android** (Google/Microsoft/Email cover Android; Apple-on-Android is rare and adds a web-redirect surface). Confirm before build.

### Edge cases & interruptions
- **D. User cancels the OAuth / Apple sheet.** `openAuthSessionAsync` resolves `{ type: 'cancel' }` or `signInAsync` throws `ERR_REQUEST_CANCELED` → clear `loadingOAuth`, **no error banner** (cancel is not a failure; web has no banner for a user-aborted redirect). Return to idle.
- **E. Deferred deep link (referral / invite) while logged-out.** App opened via `com.heydpe://ref/<code>` or `com.heydpe://invite/<token>` (or the universal-link equivalents) with no session → the root gate **captures the token to `expo-secure-store`** (key `heydpe_pending_link`), routes to login, and the form is shown normally. After **any** successful sign-in (A/B/C), the post-auth router reads `heydpe_pending_link`, and:
  - referral → calls `POST /api/referral/claim { code }` (Contract §B.20; `referral/claim/route.ts`), then clears the key and routes to `/practice` (or wherever `redirect` pointed);
  - invite → routes into the invite-acceptance flow with the token, then clears the key.
  This is the native equivalent of the web "redirect threads through OAuth + OTP success" — but because mobile has no shared cookie/origin, the token is **persisted across the auth round-trip in SecureStore**, not in a URL query param. (A logged-*in* user opening the same link skips login and goes straight to claim/accept.)
- **F. Resend / different email.** In `otp-sent`, **Use a different email or resend code** resets digits and returns to `step:'initial'` (web `handleResendCode` `:240-244`) — the user re-enters email and requests a fresh code. (There is no in-place "resend same code" button on web; parity preserved.)
- **G. Expired / invalid OTP.** `verifyOtp` error → digits cleared, banner with the message, back to `otp-sent` for a re-key; "Code expires in 60 minutes" sets the expectation (web `:401`).
- **H. App backgrounded mid-OAuth.** If iOS suspends the app during the auth session, `ASWebAuthenticationSession` resumes on foreground; if the deep link arrives while suspended, the registered `auth-callback` handler resolves the pending exchange (§2). No duplicate login form.
- **I. Already authenticated arriving at login.** Should not happen (root gate prevents it), but if the SDK restores a session while login is mounted, the screen redirects out (web parity `getUser().then(... router.replace('/home'))`, `:91-95`).
- **J. Back/cancel.** Login is the auth-stack root — **no back navigation** out of it (Android back backgrounds the app; iOS has no back chevron). From `otp-sent`, the "Use a different email" control is the only "back" (to `initial`).

### Measurable success criteria
- [ ] **Auto-submit** fires within 1 frame of the 6th digit entry (web parity) — pass/fail.
- [ ] **Paste-to-fill** distributes a 6-digit clipboard code across all boxes and auto-submits — pass/fail (and partial paste fills from box 0, focuses next empty, web `:198-207`).
- [ ] OAuth/Apple **cancel** produces **no** error banner and returns cleanly to idle — pass/fail.
- [ ] A referral deep link opened logged-out results in **exactly one** `POST /api/referral/claim` after sign-in (not before, not zero, not twice) — integration test asserting one call with the captured code, then the key cleared.
- [ ] Microsoft sign-in succeeds (email present) — verified end-to-end with a Microsoft test account (the azure email-scope override is what makes this pass).
- [ ] Apple first-sign-in name is captured and written via `POST /api/user/tier { displayName }` exactly once; second sign-in does **not** overwrite it — pass/fail.

---

## 5. API calls

> All shapes below reference **`docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`** (cited as "Contract §…"). Auth on this screen is performed by the **native Supabase SDK directly against the Supabase project** (ref `pvuiwwqsumoqjepukjhz`), **not** through the app's `/api/*` routes — the `/api/*` routes are consumed only **after** a session exists, carrying `Authorization: Bearer <supabase_jwt>` (Contract Part A.1, the `getAuthedUser()` dual-mode helper; Contract Part B header note `:248`).

### Supabase SDK auth calls (not `/api/*`)
| Action | Call | Mirrors web | Native divergence |
|---|---|---|---|
| Send OTP | `supabase.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } })` | `login/page.tsx:145-150` | none |
| Verify OTP | `supabase.auth.verifyOtp({ email, token, type:'email' })` | `:221-225` | none |
| OAuth (Google/MS) | `supabase.auth.signInWithOAuth({ provider, options:{ redirectTo:'com.heydpe://auth-callback', skipBrowserRedirect:true, scopes (azure only) } })` → `expo-web-browser.openAuthSessionAsync` → `supabase.auth.exchangeCodeForSession(code)` | `:117-128` + `auth/callback/route.ts:101-109` | `redirectTo` is the **custom scheme**, not `${origin}/auth/callback`; exchange happens **in-process** (the web `/auth/callback` route is unused) |
| Apple (native) | `AppleAuthentication.signInAsync(...)` → `supabase.auth.signInWithIdToken({ provider:'apple', token, nonce })` | replaces web Apple OAuth redirect | native sheet via `expo-apple-authentication`; 4.8 requirement |
| Session restore | `supabase.auth.getSession()` (SDK reads `expo-secure-store`) | web `getUser()` `:92` | persisted in SecureStore, not cookies |
| Sign out (elsewhere) | `supabase.auth.signOut()` (clears SecureStore) | web `layout.tsx:54` | — |

### `/api/*` calls triggered immediately after a session exists (post-auth, with Bearer)
| When | Call | Contract | Notes |
|---|---|---|---|
| First authenticated load | `GET /api/user/tier` | §B.8 | Returns tier/features/usage/prefs **and** drives the onboarding-incomplete → `/practice` routing decision (mirrors web callback reading `onboarding_completed`, `auth/callback/route.ts:122-130`). Also the first call that triggers server-side `ensureProfile` semantics (the `getAuthedUser` helper authenticates the bearer; the profile trigger/safety-net runs server-side). |
| Display name (Apple first sign-in) | `POST /api/user/tier { displayName }` | §B.9 | Persist Apple-provided name once. |
| Deferred referral | `POST /api/referral/claim { code }` | §B.20 | Only when a `ref` deep link was captured (§4 flow E). |
| Deferred invite | invite-accept route with `<token>` | (invite flow; `src/app/api/invite/[token]`) | Only when an `invite` deep link was captured. |
| UTM lookup (optional) | `GET /api/referral/lookup?code=` (no auth) | §B.19 | Optional pre-claim display of the referring instructor's name; **never** returns certificate_number/email (§B.19). |

### Error / 429 handling
- **429 on `signInWithOtp` (Supabase auth rate limit):** surface the Supabase message verbatim in the banner; do **not** auto-retry (avoid hammering the auth rate limiter). The button re-enables for a manual retry.
- **429 on post-auth `/api/*`:** not expected on this screen's first calls; if `GET /api/user/tier` 429s, fall back to a minimal default tier view and let the user proceed — never block sign-in on a tier read.
- **`POST /api/referral/claim` errors (§B.20):** `404 Invalid referral code` / `400 You cannot use your own referral code` / `409 already connected to a different instructor` → show a **non-blocking toast** (the user is already signed in; the referral simply didn't apply) and proceed to the destination. Clear `heydpe_pending_link` regardless to avoid a retry loop.
- **`401` from any `/api/*`:** clear the SecureStore session and return to login (§2 entry 3).
- **Network/5xx on auth calls:** the offline / degraded banners (§3); retriable.

### Measurable success criteria
- [ ] **No** `/api/*` route is called before a session exists (network trace shows the first `/api/*` request carries `Authorization: Bearer`) — pass/fail.
- [ ] `GET /api/user/tier` is called **exactly once** on first post-auth load and its `onboarding_completed`/`onboarding`-state result deterministically selects `/practice` vs `/(tabs)/home` — pass/fail.
- [ ] The Microsoft path sends `scopes: 'openid email profile'` (Charles/network capture) and the returned session has a non-null email — pass/fail.
- [ ] A `409 already connected` on deferred referral does **not** block the user from reaching the app and clears the pending key — pass/fail.

---

## 6. Layout

### Description
A vertically-centered, single-column **branded card** on a full `c-bg` field, max content width ~440pt (web `max-w-md`), comfortably inset 16pt from safe-area edges (Design System §4.4 default 16pt horizontal inset, `:384`). Top: the **Logo (size lg, glow)** — BrandMark attitude-indicator + "Hey**DPE**" wordmark, the only glow on screen besides annunciators (web `<Logo size="lg" glow />` `:287`; `Brand.tsx:93-120`). Below it, the **`.bezel` card** containing, top-to-bottom: the `// Authentication` micro-label, the **Sign in to HeyDPE** H1, the **Practice your checkride oral exam** sub, an error banner slot, the three provider buttons, the **or** divider, then the email field + **Send login code** (or, in `otp-sent`, the six digit boxes + helper + **Verify code** + resend control). Below the card: the collapsible **Why no password?** explainer and the Terms/Privacy legal line. A `<Footer variant="public" />` analog may be omitted on mobile or reduced to the legal line (the web footer is a marketing footer not essential to auth).

### ASCII wireframe — portrait (idle / `initial`)
```
┌──────────────────────────────────────────┐  ← status bar (safe-area top inset)
│                                            │
│                ◢◣  Hey DPE                 │  Logo lg, glow on "DPE"
│                                            │
│ ┌────────────────────────────────────────┐│  .bezel card, rounded-xl, border-c-border
│ │  // AUTHENTICATION        (cyan, mono)  ││  micro-label
│ │  Sign in to HeyDPE          (H1, Plex)  ││
│ │  Practice your checkride oral exam      ││  sub, c-muted
│ │                                          ││
│ │  ┌──────────────────────────────────┐  ││
│ │  │  [G]  Continue with Google       │  ││  provider btn, bezel, ≥44pt
│ │  └──────────────────────────────────┘  ││
│ │  ┌──────────────────────────────────┐  ││
│ │  │  []  Continue with Apple        │  ││  Apple — native sheet on iOS
│ │  └──────────────────────────────────┘  ││
│ │  ┌──────────────────────────────────┐  ││
│ │  │  [⊞]  Continue with Microsoft    │  ││  (hidden on Android — owner dec.)
│ │  └──────────────────────────────────┘  ││
│ │  ───────────────  or  ───────────────  ││  divider, c-dim word on bezel
│ │  Email address                          ││  label, c-muted
│ │  ┌──────────────────────────────────┐  ││
│ │  │ you@example.com                  │  ││  input, c-panel, focus ring amber
│ │  └──────────────────────────────────┘  ││
│ │  ┌──────────────────────────────────┐  ││
│ │  │        Send login code           │  ││  PRIMARY amber, c-bg text, ≥44pt
│ │  └──────────────────────────────────┘  ││
│ └────────────────────────────────────────┘│
│   ? Why no password?            (collapsed)│  <details> analog
│   By continuing, you agree to our Terms of │  legal, c-dim, links amber
│   Service and Privacy Policy.              │
│                                            │  ← safe-area bottom inset
└──────────────────────────────────────────┘
```

### ASCII wireframe — portrait (`otp-sent`)
```
│ │  ✓ Code sent to you@example.com         ││  c-green-readable
│ │  Enter the 6-digit code                 ││  label centered, c-muted
│ │   ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐              ││  6 boxes, w-11 h-12, mono amber
│ │   │ 4││ 8││ 2││  ││  ││  │              ││  auto-advance / paste / auto-submit
│ │   └──┘└──┘└──┘└──┘└──┘└──┘              ││
│ │  Code expires in 60 minutes             ││  helper, c-dim
│ │  ┌──────────────────────────────────┐  ││
│ │  │           Verify code            │  ││  amber, disabled until 6 digits
│ │  └──────────────────────────────────┘  ││
│ │  Use a different email or resend code   ││  secondary, c-muted, ≥44pt row
```

### Native navigation pattern (HIG + Material 3)
- **Container:** expo-router **Stack** route, `headerShown:false` (no nav bar — this is a full-bleed branded gate, not a titled screen). It is **not** a `formSheet`/`modal` (those are for post-auth flows like onboarding/upgrade, Design System §6.5). Both iOS and Android render the same full-screen card; there is no large-title bar and no Material top app bar here (auth gate exception to §6.4).
- **iOS HIG:** the **Continue with Apple** button visually matches Apple's HIG sign-in button conventions (but uses the brand bezel styling at parity with the others — Apple permits styled buttons provided the Apple mark/wording is present; we keep "Continue with Apple" + Apple glyph). System Apple sheet is OS-presented.
- **Android Material 3:** provider buttons are **Outlined/Tonal buttons** with state-layer ripple; the primary "Send login code" is a **Filled button** (amber). The "or" divider is a Material divider.
- **Keyboard:** the card scrolls within a `KeyboardAvoidingView` so the focused field/digit-boxes and the primary button stay visible above the keyboard.
- **Landscape/tablet:** the card stays max-width ~440pt, centered, with extra side gutters; on iPad the card does not stretch full-width (capped). No layout reflow beyond centering.

### Measurable success criteria
- [ ] Card max content width ≤ **440pt**, centered, on phone and tablet — pass/fail.
- [ ] Default horizontal screen inset is **16pt** and respects safe-area on notch/no-notch/home-indicator devices (Design System §4.4 `:384`) — pass/fail per device.
- [ ] With the keyboard open, the **active field/digit boxes** and the **primary button** are both visible (not occluded) on iPhone SE and a small Android — pass/fail.
- [ ] No content under the status bar or home indicator at any state — pass/fail.

---

## 7. Native components & interactions

### Qualitative requirements
- **System components:** `expo-apple-authentication` (Apple native sheet); `expo-web-browser` `openAuthSessionAsync` (ASWebAuthenticationSession iOS / Custom Tabs Android — the **only** sanctioned OAuth surface, never an embedded WebView, per App Review minimum-functionality and security); `expo-secure-store` as the Supabase SDK `storage` adapter (Keychain on iOS / EncryptedSharedPreferences-backed Keystore on Android); `expo-linking` for deep-link capture (`auth-callback`, `ref`, `invite`); `expo-status-bar` (`light-content` on cockpit/glass themes, Design System §2 `:201`); `expo-haptics`.
- **OTP digit input:** six single-character numeric fields (RN `TextInput`, `keyboardType:'number-pad'`, `maxLength:1`, `textContentType:'oneTimeCode'` on iOS / `autoComplete:'sms-otp'` on Android for **SMS/email autofill** — iOS surfaces email-delivered codes via the QuickType bar where available). Auto-advance, backspace-to-previous, paste-to-fill, auto-submit-on-6th — all mirroring web (`login/page.tsx:162-208`).
- **Gestures:** tap (all buttons); long-press/paste on the first OTP box pastes-to-fill; no swipe/drag on this screen. Android system-back at the auth root backgrounds the app (does not dismiss the gate).
- **Haptics (Design System §7.3 vocabulary):** **Light impact** on provider-button tap and on **Send login code** (action initiated); **Light impact** is also acceptable on each OTP digit commit but **must not** fire per-keystroke beyond the single commit (rule: no per-keystroke haptics, §7.3); **Error notification** on any auth error banner; **no Success haptic** on sign-in (Success is reserved for assessment, §7.3). Primary CTA uses Medium impact only for "start exam," not for auth — keep auth haptics Light.
- **Keyboard handling:** email field uses `keyboardType:'email-address'`, `autoCapitalize:'none'`, `autoComplete:'email'`, `textContentType:'username'`/`'emailAddress'`, `returnKeyType:'go'` (submits OTP send). OTP boxes use the numeric keypad and the OTP autofill content type. `KeyboardAvoidingView` (`behavior: 'padding'` iOS / `'height'` Android).
- **Safe-area / notch / Dynamic Island:** the screen uses `react-native-safe-area-context` insets top and bottom; the centered card never collides with the notch or the home indicator. No content is placed under the Dynamic Island. (Live Activities / Dynamic Island are explicitly v1.1, not used here.)

### Measurable success criteria
- [ ] OAuth uses `ASWebAuthenticationSession`/Custom Tabs — **0** embedded `WebView` instances for auth (grep + runtime check) — pass/fail (security + App Review).
- [ ] Email-delivered OTP autofill works: an iOS device with the code in Mail offers it on the QuickType bar / the field accepts the autofilled 6 digits — manual pass/fail.
- [ ] **0** haptics fire on plain scroll or per-keystroke beyond the single digit-commit (Design System §7.3) — manual check.
- [ ] Session persists across a full app **kill + relaunch** (`expo-secure-store`): a signed-in user is **not** returned to login after force-quit — pass/fail.
- [ ] On a device with no passcode/Keychain unavailable, sign-in still completes for the session (in-memory) and shows the SecureStore-unavailable note (§3) — pass/fail.

---

## 8. Accessibility

### Qualitative requirements
- **VoiceOver / TalkBack order:** Logo (label "HeyDPE") → "Authentication" (the `// Authentication` micro-label exposed as plain text "Authentication", **not** read as slashes) → H1 "Sign in to HeyDPE" (heading trait) → sub → [error banner if present, announced via `accessibilityLiveRegion:'assertive'` / iOS announcement] → "Continue with Google, button" → "Continue with Apple, button" → "Continue with Microsoft, button" → "or" → "Email address, text field" → "Send login code, button". In `otp-sent`: "Code sent to {email}" (live announce) → "Enter the 6-digit code" → digit boxes labeled "Digit 1 of 6" … "Digit 6 of 6" (web uses `aria-label="Digit N"`, `:395`; native uses `accessibilityLabel`) → "Code expires in 60 minutes" → "Verify code, button" → "Use a different email or resend code, button".
- **Labels:** provider buttons announce their full sentence-case label (not just an icon). The Apple button must announce as a sign-in action. Decorative SVG provider icons are `accessibilityElementsHidden`/`importantForAccessibility:'no'` so the label carries the meaning.
- **Dynamic Type / font scaling:** all reading text (H1, sub, labels, button labels, legal, "Why no password?" body) scales up to **1.6×** (Design System §3.3 reading bound, `:293`); the OTP digit glyph (a numeric readout) uses the tighter numeric scaling bound so the six boxes don't shatter the row (Design System §3.3 numeric clamp). **No** text drops below 12pt at default scale (Design System §3.2 `:276`).
- **Contrast ≥ 4.5:1:** all reading pairs clear AA on the dark card — `c-text`/`c-muted`/`c-dim` on `c-bezel`; **green text uses `c-green-readable`** ("Code sent to…") and **never** the base `c-green` (the `-readable` rule, Design System §1). Amber on `c-bg` (primary button text `text-c-bg` on `bg-c-amber`) and the focus outline are covered by the Design System contrast CI gate (§8 `:651,678`).
- **Focus order & focus ring:** keyboard/switch-control focus follows the reading order above; the FLIGHT DECK focus treatment is a **2px amber outline, 2px offset** (Design System §8; web `:focus-visible` amber). After sending the OTP, focus moves to digit box 1 (web `:98-102`); after a failed verify, focus returns to box 1.
- **Reduced motion:** the only motion here is button spinners and (cold) the skeleton pulse. Under `prefers-reduced-motion`/iOS Reduce Motion, the skeleton pulse and any stagger are disabled; spinners may remain (they communicate in-flight state) but should be a calm rotation, not a strobe (Design System §7 reduced-motion).

### Measurable success criteria
- [ ] VoiceOver and TalkBack read the screen in the order above with **no** unlabeled controls and **0** "button" announced without a name — manual screen-reader pass/fail.
- [ ] The `// Authentication` label is **not** read with literal slashes; digit boxes announce position ("Digit N of 6") — pass/fail.
- [ ] Error banners announce automatically on appearance (live region) — pass/fail.
- [ ] All 7 screen states pass at iOS Dynamic Type **xS / L / xxxL** and Android font scale **0.85 / 1.0 / 1.3** with no clipping/overlap and all CTAs reachable (Design System §3.3 matrix, `:306`) — pass/fail per cell.
- [ ] Contrast CI gate: **0** reading-text pairs on this screen < 4.5:1 (Design System §8 `:678`) — artifact.
- [ ] With Reduce Motion ON, **0** pulsing/stagger animations render on auth — pass/fail.

---

## 9. Analytics events

> Mirror the web event names. Web fires GTM `dataLayer` `sign_up` with a `method` on auth success (`analytics.ts:7-9`, called from `trackSignup(...)` at `login/page.tsx:76,136,233`). Native fires the **PostHog** equivalent (PostHog is the mobile analytics per the funnel work) plus the GTM-parity `sign_up` where the web web-funnel expects it. PostHog ATT note: §10.

| Event | When | Properties | Web parity |
|---|---|---|---|
| `auth_screen_viewed` | Login mounts (unauthenticated) | `{ entry: 'cold' \| 'signout' \| '401' \| 'deep_link' }` | implicit (web page view) |
| `auth_method_selected` | A provider/email method tapped | `{ method: 'google'\|'apple'\|'azure'\|'email_otp' }` | implicit (loading state) |
| `otp_sent` | `signInWithOtp` succeeds | `{ }` | step `otp-sent` |
| `otp_verify_attempt` | verify fired (auto-submit or button) | `{ trigger: 'auto'\|'button'\|'paste' }` | `handleVerifyOtp` |
| `sign_up` | **any** auth success (first or returning) | `{ method }` — `email_otp\|google\|apple\|microsoft` | `trackSignup(method)` (`analytics.ts:7`); web maps provider strings, `auth/callback/route.ts:19-27` maps azure→`microsoft` |
| `auth_error` | any auth error banner shown | `{ method, code }` (e.g. `oauth_error`, `code_exchange_failed`, `verification_failed`, `offline`) | web `getErrorMessage` codes (`:16-32`) |
| `auth_cancelled` | OAuth/Apple sheet cancelled | `{ method }` | (no web banner; tracked for funnel) |
| `referral_claim_attempted` | deferred `POST /api/referral/claim` fired post-auth | `{ result: 'ok'\|'conflict'\|'invalid' }` | web claim flow |

- **Method normalization:** the stored auth method maps `azure`→`microsoft` and `email`→`email_otp` (parity with `auth/callback/route.ts:19-27`), so the `sign_up` `method` is one of `google\|apple\|microsoft\|email_otp`.

### Measurable success criteria
- [ ] Exactly **one** `sign_up` event fires per successful sign-in with the correct normalized `method` — pass/fail (no double-fire on auto-submit + button).
- [ ] `auth_error` carries a stable `code` matching the web `getErrorMessage` taxonomy — pass/fail.
- [ ] **No** PII (email, token, identity JWT) is sent as an analytics property — automated scan of the event payloads, pass/fail.
- [ ] Cancelling Apple/OAuth fires `auth_cancelled`, **not** `auth_error` — pass/fail.

---

## 10. Store-compliance touchpoints

> Full rationale in the App Review brief (this repo's grounding) and Design System §6.6. The login screen is the **4.8 anchor** and the **Terms/Privacy point-of-presence**; it is **not** the consent gate (that is onboarding) and **not** a paywall.

### Qualitative requirements
- **4.8 — Sign in with Apple at parity (mandatory).** Because the app offers Google and Microsoft social logins to establish the primary account, it **must** offer Sign in with Apple as an equivalent (limits data to name+email, offers Hide My Email, no ad tracking). Apple sign-in is implemented **natively** (`expo-apple-authentication` + `signInWithIdToken`, §4 flow C). It must be **visible and at parity** with Google/Microsoft on iOS — **never** hidden or de-emphasized while Google/Microsoft are shown (removing it triggers a 4.8 rejection).
- **Terms of Use + Privacy Policy links (point of sale & sign-in).** The legal line — **By continuing, you agree to our Terms of Service and Privacy Policy.** — links to `/terms` and `/privacy` (web `:451-456`). On native these open in `expo-web-browser` (in-app browser). Both links must be functional and present (App Review subscription disclosure also requires these from the paywall — this screen establishes the agreement at account creation).
- **No purchase / no paywall here.** This screen performs **no** IAP and shows **no** prices — purchasing is App Review 3.1.1 territory handled on the Upgrade/Paywall screen via RevenueCat/StoreKit. Do not place any "subscribe"/price CTA on login.
- **No third-party-AI data shared on this screen.** No voice/transcript leaves the device here; the explicit AI-processing consent (Anthropic/Deepgram/OpenAI) is obtained at **onboarding** before the first exam (App Review 5.1.2(i)). Login only collects email/identity for auth.
- **No ATT prompt here.** PostHog is used as first-party product analytics with **no IDFA / no cross-company linking**, so no App Tracking Transparency prompt is presented on login (App Review 5.1.2(i) "tracking" definition). **VERIFY-AT-SUBMISSION:** confirm the shipped PostHog/GTM config does not enable IDFA or ad attribution; if it does, ATT must be presented (but **not** on this auth screen — and never as a gate to functionality).
- **Account deletion is NOT here** — it lives in Settings (App Review 5.1.1(v), in-app deletion). Login only creates/accesses accounts.
- **Demo reviewer account (2.1):** the App Store Connect demo account must reach the **paid** examiner experience. Email-OTP is awkward for a reviewer (they need inbox access); **provision the reviewer with a credential that signs in cleanly** (e.g. a pre-seeded session or an OAuth/test account the reviewer can use) and document the exact steps in Notes for Review. Ensure the reviewer is not blocked at this screen.

### Measurable success criteria
- [ ] **Sign in with Apple is rendered on every iOS build** at the same button size/row treatment as Google/Microsoft — automated UI snapshot diff, pass/fail (4.8).
- [ ] **Terms** and **Privacy** links open the live `/terms` and `/privacy` pages in the in-app browser and return cleanly — pass/fail.
- [ ] **0** price strings, **0** subscribe CTAs, **0** IAP calls on the login screen — grep + runtime, pass/fail (3.1.1 hygiene).
- [ ] **0** ATT prompts and **0** mic/camera/notification permission prompts presented on login — pass/fail.
- [ ] The reviewer demo credential signs in and reaches the examiner without hitting a `trial_limit_reached`/`trial_expired` block — verified against the demo account (2.1).

---

## 11. MEASURABLE acceptance criteria (engineer/QA checklist)

### Functional
- [ ] **Four** methods work end-to-end against the real Supabase project: Email OTP (send → 6-digit → session), Google PKCE, **Apple native** (`signInWithIdToken`), Microsoft PKCE (with email present) — pass/fail each.
- [ ] **`/auth/callback` is never requested** by the mobile client (network trace shows OAuth returns to `com.heydpe://auth-callback` and the exchange is in-process) — pass/fail.
- [ ] PKCE `code_verifier` is stored in `expo-secure-store` (not AsyncStorage/plaintext) and the exchange succeeds — pass/fail.
- [ ] OTP: auto-advance, backspace-to-previous, paste-to-fill, auto-submit-on-6th, and "Code expires in 60 minutes" copy all match web (`login/page.tsx:162-208,401`) — pass/fail each.
- [ ] Microsoft override sends `scopes:'openid email profile'`; resulting session email is non-null (web `:121-127`) — pass/fail.
- [ ] After sign-in, routing is **onboarding-incomplete → `/practice`**, else `/(tabs)/home`, else the held `redirect` target wins — pass/fail (parity with `auth/callback/route.ts:122-130` + `login/page.tsx:234`).
- [ ] **Deferred deep link:** referral/invite opened logged-out is captured in SecureStore and replayed once after sign-in (exactly one claim/accept call), then cleared — pass/fail.
- [ ] Session survives **force-quit + relaunch** via `expo-secure-store`; logged-in users skip login (0ms login flash) — pass/fail.
- [ ] OAuth/Apple **cancel** returns to idle with **no** error banner — pass/fail.

### Performance budgets
- [ ] **Time-to-interactive** of the login form (form tappable, fonts loaded, after splash hide) ≤ **400ms** on a mid-tier device (iPhone 12 / Pixel 6) from splash-hide — measured, pass/fail.
- [ ] **OTP auto-submit latency:** from 6th-digit commit to the `verifyOtp` call dispatched ≤ **100ms** — measured.
- [ ] **OAuth round-trip overhead** (app → `openAuthSessionAsync` open) ≤ **300ms** to present the system auth sheet (excludes provider/network time) — measured.
- [ ] **Session restore** on cold launch (`getSession()` from SecureStore) resolves ≤ **250ms** so the splash→home transition feels instant — measured.

### UI invariants
- [ ] Caps-mono + glow appears **only** on the `// Authentication` micro-label, the wordmark "DPE", and (when shown) status annunciator text — audit; **0** caps-mono on H1/sub/buttons/legal/error strings (THE ONE RULE).
- [ ] All interactive controls (provider buttons, primary CTA, OTP boxes, resend, links) have a hit target ≥ **44pt iOS / 48dp Android** — measured per control.
- [ ] **0** text nodes below **12pt** at default Dynamic Type — static scan.
- [ ] Green "Code sent" text uses `c-green-readable` (not base `c-green`); error text uses `c-red`; primary button is `bg-c-amber` with `text-c-bg` — token audit, pass/fail.
- [ ] Default horizontal inset **16pt**, safe-area honored top & bottom, card max width ≤ **440pt** — pass/fail per device.

### Accessibility & compliance
- [ ] VoiceOver/TalkBack: full reading order, 0 unlabeled controls, error live-region announce — pass/fail.
- [ ] Dynamic Type matrix (xS/L/xxxL, 0.85/1.0/1.3) — all states pass, no clipping — matrix artifact.
- [ ] Contrast CI: 0 reading pairs < 4.5:1 on this screen — artifact.
- [ ] **Sign in with Apple at parity** on every iOS build — snapshot diff (4.8).
- [ ] Terms + Privacy links functional; **0** prices/IAP/ATT/permission prompts on login — pass/fail.

---

## Open questions for the owner (surfaced in-line above)
- **Apple on Android:** hide the Apple button (recommended) or fall back to web OAuth PKCE? (§4 OWNER DECISION.)
- **Footer on the auth screen:** keep the web `<Footer variant="public" />` analog, or reduce to just the Terms/Privacy legal line on mobile? (Recommendation: reduce to the legal line; full marketing footer is web-only.)
- **Reviewer demo credential mechanism (2.1):** confirm whether the App Store reviewer uses an OAuth test account, a pre-seeded session, or a mailbox-backed OTP account — must reach the paid examiner without a trial block.
