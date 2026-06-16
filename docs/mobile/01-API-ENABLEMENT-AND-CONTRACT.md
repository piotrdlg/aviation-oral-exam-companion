# Mobile API Enablement & v1 Contract (M1)

> **Read order:** This is the foundation doc for the HeyDPE iOS/Android client. Part A is the backend-enablement work plan (launch task **M1**). Part B is the authoritative v1 API contract the native client builds against. Every shape, status code, and header here is pulled from route source with `file:line` citations — never from memory. Where the source disagrees with a brief, the source wins.
>
> **Scope guardrails for this doc:**
> - **No web behavior change.** Every M1 edit is additive (a new branch that only fires when an `Authorization: Bearer` header is present). The cookie path runs byte-for-byte identical code.
> - **No DB migration.** M1 touches code only. The IAP merge (`/api/iap/*`, task M4) introduces schema; that is documented in the payments doc, not here.
> - **iOS first, Android second on the same foundation.** Nothing in M1 is iOS-specific; the Bearer transport, shared package, and STT PCM params serve both platforms.

---

## Part A — Mobile API Enablement (task M1)

### A.0 Why the web backend rejects a native client today

Every authenticated route follows one pattern: `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();`. `createClient()` wires a **cookies-only** adapter (`src/lib/supabase/server.ts:4-28`; `getAll`/`setAll` over `next/headers` at `server.ts:11-25`). There is no `Authorization`-header path. A native client cannot send Supabase's `sb-…-auth-token` cookie (it holds a bearer JWT from the native Supabase SDK), so `getUser()` returns `{ user: null }` and the route 401s.

A working precedent already exists: `src/app/api/bench/route.ts:30-39` reads `request.headers.get('authorization')`, slices `Bearer `, and validates via `supabase.auth.getUser(token)` against a **service-role** client (`bench/route.ts:13-16`). M1 generalizes exactly that shape — but **not** by reusing `bench`, whose file header says "DELETE THIS FILE after benchmarking" (`bench/route.ts:4`).

Five surfaces are touched. Each subsection below gives the exact anchor, the before/after behavior, a qualitative "done" bar, and a measurable pass/fail criterion with the test that proves it.

**Required M1 test deliverables (none exist yet — they must be authored as part of M1; the §A success gates are not met until all three are green):**
- `src/lib/__tests__/supabase-auth.test.ts` — proves the §A.1 dual-mode `getAuthedUser()` helper (valid bearer → `transport:'bearer'`; cookie → `transport:'cookie'` with `accessToken === session.access_token`; bad bearer → `null`).
- `src/lib/__tests__/middleware-rate-identity.test.ts` — proves the §A.2 `deriveRateIdentifier(request)` keys per-user buckets off the JWT `sub` (bearer-A → `'A'`; bearer-B → `'B'`; garbage → `'anon'`; cookie-C → `'C'`; neither → IP).
- `src/app/api/stt/__tests__/stt-token-url.test.ts` — proves the §A.4 `buildListenUrl(...)` (container default omits `encoding`; linear16/16k appends both; disallowed encoding → 400).

> **OWNER DECISION — helper home.** The grounding brief offers two homes for the dual-mode helper: a new `src/lib/supabase/auth.ts`, or extending `src/lib/supabase/server.ts`. **This plan recommends a new file `src/lib/supabase/auth.ts`** so `server.ts` stays a pure cookie-adapter factory (zero risk of regressing the 40+ cookie callers) and the new symbol is greppable. Confirm or override before implementation.

---

### A.1 Bearer support — dual-mode auth helper

**New file:** `src/lib/supabase/auth.ts` (does not exist yet).

**Exported signature:**
```ts
// src/lib/supabase/auth.ts  (NEW)
import 'server-only';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

export interface AuthedUser {
  user: User;
  accessToken: string;   // the bearer JWT, OR the cookie session's access_token
  transport: 'bearer' | 'cookie';
}

/**
 * Dual-mode auth. Prefers Authorization: Bearer <supabase_jwt> (native clients
 * with no cookies); falls back to the existing cookie session. Returns null when
 * neither yields a verified user — caller returns 401 with its own shape.
 */
export async function getAuthedUser(request: NextRequest): Promise<AuthedUser | null>;
```

**Logic (mirrors `bench/route.ts:35-39` for branch 1, `server.ts:4` for branch 2):**
1. `const authHeader = request.headers.get('authorization')`. If it starts with `Bearer `, slice the token, validate via a **service-role** (or anon) Supabase client's `supabase.auth.getUser(token)`. On success → `{ user, accessToken: token, transport: 'bearer' }`. The service-role client is module-scoped, same as `bench/route.ts:13-16`.
2. Otherwise: `const supabase = await createClient(); const { data: { session } } = await supabase.auth.getSession(); const { data: { user } } = await supabase.auth.getUser();`. On success → `{ user, accessToken: session.access_token, transport: 'cookie' }`. Returning `session.access_token` here is what lets §A.3 drop the second `getSession()` call.

**Why the cookie path is byte-identical:** a cookie request carries **no** `Authorization` header → branch 1 is skipped entirely → branch 2 runs the same `createClient()` + `getUser()` the route runs today. `server.ts` is **not edited**.

**Per-route swap (mechanical).** Replace the `createClient()` + `getUser()` pair with `const authed = await getAuthedUser(request); if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });`. The v1 routes that must adopt the helper (every route the mobile client calls — see Part B route table) and their current anchors:

| Route | Current auth anchor | Note |
|---|---|---|
| `POST /api/exam` | `route.ts:328-329` | `request` already in scope (`route.ts:320`). |
| `GET /api/exam` | `route.ts:202-318` (same `getUser()` idiom) | needs `request` param. |
| `POST/GET /api/session` | `session/route.ts:21-22`, `:374-376` | `request` in scope. |
| `POST /api/tts` | `tts/route.ts:38-39` | `request` in scope (`tts/route.ts:34`). |
| `GET /api/stt/token` | `stt/token/route.ts:33-34` | **signature change required**, see §A.4. |
| `POST /api/stt/usage` | `stt/usage/route.ts:27-28` | `request` in scope. |
| `GET/POST /api/user/tier` | `user/tier/route.ts:16-17`, `:108-109` | GET needs `request` param. |
| `GET/DELETE /api/user/sessions` | `user/sessions/route.ts:21-25`, `:84-86` | both need `request`; also see §A.3 (uses `getSessionTokenHash`). **Current code passes the full cookie `session` object; the Bearer swap must pass `{ access_token: authed.accessToken }` because `getSessionTokenHash` (`session-enforcement.ts:19`) reads only `.access_token`.** |
| `GET/POST /api/user/milestones` | `user/milestones/route.ts:17-18`, `:34-35` | GET needs `request`. |
| `POST /api/user/avatar` | `user/avatar/route.ts:6-7` | `request` in scope. |
| `GET/POST /api/user/email-preferences` | `email-preferences/route.ts:21-22`, `:45-46` | GET needs `request`. |
| `GET /api/stripe/status` | `status/route.ts:15-16` | needs `request`. |
| `POST /api/stripe/portal` | `portal/route.ts:14-15` | needs `request`. |
| `POST /api/referral/claim` | `referral/claim/route.ts:27-28` | `request` in scope. |
| `POST /api/report` | `report/route.ts:33-34` | `request` in scope. |
| `POST /api/consent` | `consent/route.ts:18-19` | `request` in scope (`consent/route.ts:17`). |
| `POST /api/user/delete` | `user/delete/route.ts:24-25` | `request` in scope (`user/delete/route.ts:23`). |
| `GET /api/user/export` | `user/export/route.ts:18-19` | **signature change required** — currently `GET()` (`user/export/route.ts:17`); add the `request: NextRequest` param both for the bearer swap and so the existing `checkRateLimit('/api/user/export', user.id)` (`user/export/route.ts:22`) keys off the verified user. |
| `/api/iap/*` (new, M4) | n/a — built Bearer-first | see payments doc. |

`GET /api/referral/lookup`, `GET /api/flags`, `GET /api/health` are unauthenticated (no swap).

**Qualitative "done":** A native client sending only `Authorization: Bearer <jwt>` is authenticated on every route in the table. A browser (cookie, no header) is authenticated identically to before. No route reads cookies AND a header in a way that lets one spoof the other.

**Measurable success criteria:**
- A request with a valid Supabase JWT bearer and **no cookies** to each table route returns the same non-401 status a cookied browser gets. Pass/fail = 0 spurious 401s across the 16 routes.
- A request with a **malformed/expired** bearer returns `401 {"error":"Unauthorized"}` (helper returns null → route's existing 401).
- Cookie regression suite: the existing Vitest suite (1,350+ tests) and Playwright cookie-auth projects pass unchanged — **0 newly failing tests**.

**Test that proves it (new):** `src/lib/__tests__/supabase-auth.test.ts` (new file) with three cases: (a) valid bearer → `{ user, transport: 'bearer' }`; (b) no header, valid cookie → `{ user, transport: 'cookie' }` with `accessToken === session.access_token`; (c) bad bearer → `null`. Mock `auth.getUser(token)` to return a user for a known token and an error otherwise (same mocking style as `exam-advancement.test.ts:62-69`).

---

### A.2 Rate-limit identity from the JWT `sub`

**Anchor:** `src/middleware.ts:27-52` (the per-user `else` branch).

**Before:** identity is derived **only** from the cookie whose name `includes('auth-token')` (`middleware.ts:31`), base64-decoding JWT part `[1]` and reading `payload.sub` (`middleware.ts:37-40`). A bearer-only request has no such cookie → falls through to IP (`middleware.ts:47-52`). Every mobile user behind one carrier NAT then shares **one** per-user bucket: `/api/exam` 20/min, `/api/tts` 30/min, `/api/stt/token` 4/min (`rate-limit.ts:49-51`). At 4 tokens/min shared across a whole carrier, that is a launch-blocking false 429.

**After:** at the **top** of the per-user `else` (before the cookie lookup at `middleware.ts:31`), add:
```ts
const auth = request.headers.get('authorization');
if (auth?.startsWith('Bearer ')) {
  try {
    const token = auth.slice(7);
    const payload = JSON.parse(atob(token.split('.')[1]));   // mirror :37-40
    identifier = payload.sub || 'anon';
  } catch { identifier = 'anon'; }
}
```
Keep the cookie lookup as the fallback for cookie requests. **Decode-only, signature-unverified by design** — consistent with the existing comment "verification happens later in the route handler" (`middleware.ts:35-36`); the route's `getUser(token)` (§A.1) is the trust boundary. This cannot escalate privilege: a forged `sub` only changes which rate-limit bucket a request lands in; the actual user identity is re-derived from the verified token in the handler.

**Qualitative "done":** Two distinct mobile users behind the same IP get **independent** rate-limit buckets keyed by their JWT `sub`. A forged/garbage bearer falls to `'anon'` (shared bucket, not IP — acceptable, it never reaches a handler).

**Measurable success criteria:**
- Two requests with bearers carrying different `sub` values to `/api/stt/token` from the same source IP do **not** share a counter: user A can hit the 4/min limit without affecting user B's first request (B's 5th call within the minute is the first to 429, not B's 1st). Pass/fail boolean.
- A cookie request's identifier is unchanged from today (regression).

**Test that proves it (new):** `src/lib/__tests__/middleware-rate-identity.test.ts` (new). Extract the identifier-derivation into a tiny pure helper `deriveRateIdentifier(request)` so it is unit-testable without booting Next middleware, then assert: bearer-with-sub-A → `'A'`; bearer-with-sub-B → `'B'`; bearer-garbage → `'anon'`; cookie-with-sub-C → `'C'`; neither → IP string.

---

### A.3 Session-enforcement for the Bearer transport

**Anchor:** `src/app/api/exam/route.ts:464-476` (the `enforcementPromise`).

**Before:** the one-active-exam guard fetches the JWT via the **cookie** session: `const { data: { session: authSession } } = await supabase.auth.getSession();` then `getSessionTokenHash(authSession)` (`route.ts:467-469`). With Bearer transport `supabase` is the cookie client with **no cookies**, so `getSession()` returns `null` → `authSession?.access_token` is falsy (`route.ts:468`) → enforcement is **silently skipped** (`route.ts:475` returns `{ rejected: false }`). Result: a mobile device never pauses a competing web device's exam and vice-versa — the multi-device guard breaks for mobile.

The hash is transport-agnostic. `getSessionTokenHash` (`src/lib/session-enforcement.ts:19-24`) needs only `{ access_token }`, from which it decodes the `session_id` claim (`session-enforcement.ts:9-12,21`). A raw Supabase bearer JWT **contains** `session_id`, so feeding the bearer in directly works.

**After:** the §A.1 helper already returns `accessToken` (bearer token, or the cookie session's `access_token`). Replace the `getSession()` call at `route.ts:467` with that known `accessToken`:
```ts
const enforcementPromise = (async () => {
  if (!sessionId) return { rejected: false, pausedSessionId: undefined };
  try {
    if (authed.accessToken) {                                   // from getAuthedUser()
      const tokenHash = getSessionTokenHash({ access_token: authed.accessToken });
      return enforceOneActiveExam(serviceSupabase, user.id, sessionId, tokenHash, action);
    }
  } catch (err) { console.error('Session enforcement error:', err); }
  return { rejected: false, pausedSessionId: undefined };
})();
```
Keep the existing try/catch (`route.ts:466,472-474`) and the `if (accessToken)` guard. **`enforceOneActiveExam` (`session-enforcement.ts:48-149`) and `getSessionTokenHash` need no changes.** The same `authed.accessToken` must also feed `user/sessions/route.ts` (`getSessionTokenHash(session)` at `:35,:96`) so the `this_device` flag and "sign out others" work for mobile devices.

**QA caveat to verify (carried from the brief):** confirm the **mobile-issued** bearer JWT carries the `session_id` claim. `getSessionTokenHash` throws `"JWT missing session_id claim"` (`session-enforcement.ts:22`) if absent; the surrounding try/catch (`route.ts:472-474`) swallows it but enforcement then silently no-ops. Supabase access tokens issued by the native SDK carry `session_id`, but this must be asserted on a real device token before launch.

**Qualitative "done":** Starting an exam on the mobile app pauses any active web exam for the same user (and returns `pausedSessionId`), and a superseded mobile `respond`/`next-task` gets `409 session_superseded` — identical to web's multi-device behavior.

**Measurable success criteria:**
- Decode of a real mobile-issued Supabase access token contains a non-empty `session_id` claim. Pass/fail (one artifact: the decoded payload pasted into the QA log).
- Cross-device matrix (web↔mobile, mobile↔mobile): starting exam B supersedes active exam A → A's session row goes `paused` (`session-enforcement.ts:130-135`) and A's next `respond` returns `409 {"error":"session_superseded"}` (`route.ts:483-488`). 4/4 direction pairs pass.

**Test that proves it (extend existing):** `src/lib/__tests__/exam-advancement.test.ts` already exercises `enforceOneActiveExam` (`:59-118`). Add a case feeding a **bearer-derived** `tokenHash` (computed via `getSessionTokenHash({ access_token: <fixture JWT with session_id> })`) and assert (a) a competing device-hash row yields `{ rejected: true }`, (b) a JWT **without** `session_id` makes `getSessionTokenHash` throw `'JWT missing session_id claim'`.

---

### A.4 `/api/stt/token` — `encoding=linear16&sample_rate=16000` passthrough with an allowlist

**Anchors:** `src/app/api/stt/token/route.ts:29` (signature), `:146-152` (Flux branch), `:158-168` (Nova-3 branch), `:190-203` (response).

**Before:** the server prebuilds the full Deepgram WS URL and returns it (`token/route.ts:190-193`). The Nova-3 branch (`:158-167`) sets `model, language, smart_format, interim_results, utterance_end_ms, vad_events`; the Flux branch (`:146-152`) sets `model, eot_threshold`. **Neither sets `encoding` or `sample_rate`.** On web this is correct: the browser `MediaRecorder` emits a self-describing **Opus/WebM container** (comment at `token/route.ts:140-141`) that Deepgram auto-detects. Native mobile capture is **raw linear PCM** (no container); Deepgram cannot auto-detect raw PCM and returns empty/garbage transcripts unless `encoding` + `sample_rate` are explicit. The URL is built server-side, so the client cannot fix it.

**After:**
1. **Signature change:** `export async function GET(request: NextRequest)` (was `GET()` at `token/route.ts:29`). Required both for this param and for the §A.1 bearer swap.
2. **Read + allowlist the codec hint:**
```ts
const ENCODING_ALLOW = new Set(['linear16']);                 // exact-match allowlist
const RATE_ALLOW = new Set([16000, 48000]);
const reqEncoding = request.nextUrl.searchParams.get('encoding');
const reqRate = Number(request.nextUrl.searchParams.get('sample_rate'));
const useRawPcm = reqEncoding !== null;
const encoding = ENCODING_ALLOW.has(reqEncoding ?? '') ? reqEncoding! : null;
const sampleRate = RATE_ALLOW.has(reqRate) ? reqRate : 16000;  // default when raw PCM requested
```
3. **Append in both branches** before `.toString()` (Nova-3 `URLSearchParams` at `:158-165`, Flux at `:147-150`):
```ts
if (useRawPcm) {
  if (!encoding) return NextResponse.json(
    { error: 'unsupported_encoding', allowed: [...ENCODING_ALLOW] }, { status: 400 });
  params.set('encoding', encoding);          // 'linear16'
  params.set('sample_rate', String(sampleRate)); // 16000 | 48000
}
```
**Web default is untouched:** no `encoding` query param → `useRawPcm` is false → no `encoding`/`sample_rate` appended → container auto-detect, exactly as today.

> **OWNER DECISION — mobile sample rate.** The grounding brief floats both `16000` and `48000`. **This plan recommends the client request `encoding=linear16&sample_rate=16000`**: Nova-3 is tuned for 16 kHz speech, it halves uplink bytes vs 48 kHz (battery/data on cellular), and the native recorder can downsample cheaply. `48000` stays in `RATE_ALLOW` as an escape hatch if field testing shows a quality gap. Confirm 16000 as the shipped default.

**Qualitative "done":** A native client passes `?encoding=linear16&sample_rate=16000`; the returned `url` carries those params; streaming raw 16 kHz PCM yields correct transcripts. A web client (no params) gets the byte-identical container-auto-detect URL it gets today. Any value outside the allowlist is rejected with 400, never forwarded to Deepgram.

**Measurable success criteria:**
- `GET /api/stt/token?encoding=linear16&sample_rate=16000` returns a `url` whose query string contains `encoding=linear16` **and** `sample_rate=16000`. Assertion on the returned string.
- `GET /api/stt/token` (no params) returns a `url` with **no** `encoding=` substring (web regression). Assertion.
- `GET /api/stt/token?encoding=mulaw` (or any non-allowlisted value) returns `400 {"error":"unsupported_encoding","allowed":["linear16"]}`. No request reaches Deepgram.
- Field check: a real device streaming linear16/16k produces a non-empty final transcript for a spoken sentence (one captured transcript artifact).

**Test that proves it (new):** `src/app/api/stt/__tests__/stt-token-url.test.ts` (new). Extract the URL-builder into a pure `buildListenUrl({ flux, keyterms, encoding, sampleRate })` and assert: container default omits `encoding`; linear16/16k appends both; disallowed encoding throws/400. Mock the Deepgram `auth/grant` fetch (`token/route.ts:103-110`) so no network is hit.

---

### A.5 CORS / Origin note for non-browser clients

Native iOS/Android HTTP clients (URLSession, OkHttp, React Native `fetch`) are **not** subject to the browser same-origin policy and send **no** `Origin` header by default, so **no CORS preflight occurs** and no `Access-Control-Allow-Origin` is required for them. The current API sets no permissive CORS headers and relies on same-origin web + cookies; mobile bypasses that model entirely by using Bearer auth over plain HTTPS to the production origin.

**Requirements:**
- **Do not** add a wildcard `Access-Control-Allow-Origin: *`. It would weaken the web app's CSRF posture for no mobile benefit (mobile needs none).
- The native client calls the **production origin** (`https://aviation-oral-exam-companion.vercel.app`, per CLAUDE.md Live URL) directly with `Authorization: Bearer`. No `withCredentials`, no cookie jar.
- Confirm the Next.js middleware does not 403 a missing/foreign `Origin` on `/api/*`. Current `src/middleware.ts:18-71` does **not** check `Origin` — it only rate-limits then `updateSession`. So no change is needed today; this is a **verification**, not an edit.
- **Pin a versioned User-Agent** on the client (e.g. `HeyDPE-iOS/1.0 (build 123)`) so server logs and any future WAF rule can distinguish app traffic from scrapers. (No server code depends on it at v1.)

> **OWNER DECISION — App Transport Security / domain.** iOS ATS requires HTTPS with TLS 1.2+; the Vercel origin already satisfies this, so no ATS exception is needed. If the app later targets a custom API domain (e.g. `api.heydpe.com`) the same applies. Note the separate auth domain `auth.heydpe.com` (memory: Supabase custom auth domain) only affects the OAuth provider callback, **not** these API calls. Confirm the app talks to the Vercel origin (or a chosen API domain) and that the Supabase native SDK is pointed at the same project ref `pvuiwwqsumoqjepukjhz`.

**Measurable success criteria:**
- A native HTTP client (no `Origin`, no cookies, Bearer set) gets a 2xx from `GET /api/health` and `GET /api/user/tier`. Pass/fail.
- No `Access-Control-Allow-Origin: *` appears in any production response header (grep the deployed headers). Pass/fail.
- The web app's existing same-origin requests are unaffected (Playwright suite green).

---

### A.6 Enablement deliverable: the `packages/shared` extraction

The monorepo decision (D5) makes `packages/shared` the single source of truth for pure-TS logic consumed by both web and mobile. **There is no `packages/` directory yet** (verified) — it must be created. The extraction is part of M1 because the mobile voice pipeline and tier display cannot be built correctly twice.

**What moves into `packages/shared` (lift-and-shift, zero logic change):**

| Source (web) | Target | Port type | Proof |
|---|---|---|---|
| `src/lib/voice/sentence-boundary.ts` (146 LOC) | `packages/shared/src/voice/sentence-boundary.ts` | **Verbatim** — pure function `detectSentenceBoundary(buffer)`, no DOM/React/fetch. | Move its 21 tests (`src/lib/__tests__/sentence-boundary.test.ts`) alongside; all 21 pass from the package. |
| `src/types/database.ts` (relevant types) | `packages/shared/src/types/database.ts` | **Verbatim** — `Rating`, `Difficulty`, `StudyMode`, `AircraftClass`, `PlannerState`, `SessionConfig`, `ExamResult`, `AssessmentData`-adjacent enums (see Part B §5). | Web imports re-export from the package; `npm run typecheck` stays green with zero changes to consuming code. |
| Tier mapping — the **display-only** layer `src/lib/tier-labels.ts` (`TIER_LABEL` `:15-19`, `OVERRIDE_LABEL` `:23`, `tierBand()`/`tierDisplay()` `:28-39`, `subscriptionStatusLabel()` `src/lib/tier-labels.ts:55` over its `STATUS_LABEL` map `:43-54`) + the `VoiceTier` enum (`src/lib/voice/types.ts:1`) and `TIER_ORDER` (`tier-lookup.ts:18-22`). | `packages/shared/src/tier/labels.ts` | **Verbatim** — pure mapping, no I/O. | Existing tier-label tests pass from the package; the mobile settings/paywall screens import `tierDisplay()`. |

**What does NOT move (server-only or browser-bound — stays in `src/`):**
- `getUserTier` (`tier-lookup.ts:33-82`) — reads Supabase, server-only.
- The TtlCache, quota, kill-switch, RAG, exam-engine LLM modules — server-only.
- `useVoiceProvider.ts`, `useDeepgramSTT.ts` — browser-DOM-bound; the native client reimplements them (the **algorithm** from `useSentenceTTS.ts` queue/drain/prefetch is ~80% portable but its React shell is rewritten — that port is detailed in the voice-pipeline doc, not here).

**Qualitative "done":** Web imports the three pure modules from `@heydpe/shared` (or chosen package name) instead of `src/`; mobile imports the identical symbols. There is exactly one definition of `detectSentenceBoundary`, the database enums, and `tierDisplay()` in the repo.

**Measurable success criteria:**
- `packages/shared` builds standalone (`tsc -p packages/shared`) with **0 errors** and **0 imports** from `src/` or any browser/Node-only global (DOM, `fetch`, `window`, `next/*`). Enforce with an ESLint `no-restricted-imports`/`env` rule scoped to the package — CI fails if violated.
- The 21 sentence-boundary tests run **from the package** and pass (`vitest run packages/shared`).
- After web rewires its imports, full web `npm run typecheck` + Vitest suite is green (**0 newly failing tests**) — proves the extraction is behavior-preserving.
- The mobile app imports `@heydpe/shared` and resolves `detectSentenceBoundary`, `tierDisplay`, and `PlannerState` (compile-time check in the Expo build).

> **OWNER DECISION — package name + tooling.** D5 names Turborepo + workspaces with `apps/mobile` + `packages/shared`. This doc assumes the package is importable as `@heydpe/shared`. Confirm the npm scope/name and whether web (`apps/web` or repo root) is also moved under `apps/` now or in a later step. The extraction itself is independent of that choice.

---

## Part B — v1 Mobile API Contract

Authoritative. Every shape below is read from route source. **Auth header for all authenticated routes:** `Authorization: Bearer <supabase_jwt>` once §A.1 ships (cookie also works but mobile uses Bearer). Unauthenticated routes are marked. All request/response bodies are JSON unless noted (TTS returns audio bytes; avatar takes multipart).

### B.0 Summary route table

| # | Route | Method | Auth | Purpose | Success | Key error codes |
|---|---|---|---|---|---|---|
| 1 | `/api/exam` | POST | Bearer | Exam engine: `start`/`respond`/`next-task`/`resume-current` | 200 JSON or SSE | 400, 401, 403, 404, 409, 429, 503, 500 |
| 2 | `/api/exam` | GET | Bearer | `list-tasks` / `summary` reads | 200 JSON | 400, 401, 404, 500 |
| 3 | `/api/session` | POST | Bearer | `create`/`discard`/`update` | 200 JSON | 400, 401, 403, 500 |
| 4 | `/api/session` | GET | Bearer | stats/scores/resumable/transcripts/list | 200 JSON | 400, 401, 404, 500 |
| 5 | `/api/tts` | POST | Bearer | Text → MP3 audio bytes | 200 audio/mpeg | 400, 401, 429, 503, 500 |
| 6 | `/api/stt/token` | GET | Bearer | Mint Deepgram WS JWT + prebuilt URL | 200 JSON | 401, 429, 502, 503, 500 |
| 7 | `/api/stt/usage` | POST | Bearer | Report STT session start/end | 200 JSON | 400, 401, 403, 429, 500 |
| 8 | `/api/user/tier` | GET | Bearer | Tier, features, usage, prefs | 200 JSON | 401, 500 |
| 9 | `/api/user/tier` | POST | Bearer | Update prefs (voice/rating/theme/…) | 200 `{ok:true}` | 400, 401, 500 |
| 10 | `/api/user/sessions` | GET | Bearer | List active devices | 200 JSON | 401, 500 |
| 11 | `/api/user/sessions` | DELETE | Bearer | Sign out other devices | 200 `{ok:true}` | 401, 500 |
| 12 | `/api/user/milestones` | GET | Bearer | Current milestones | 200 JSON | 401, 500 |
| 13 | `/api/user/milestones` | POST | Bearer | Declare a milestone | 200 JSON | 400, 401, 500 |
| 14 | `/api/user/avatar` | POST | Bearer | Upload avatar (multipart) | 200 JSON | 400, 401, 500 |
| 15 | `/api/user/email-preferences` | GET | Bearer | Read email opt-ins | 200 JSON | 401, 500 |
| 16 | `/api/user/email-preferences` | POST | Bearer | Toggle one opt-in | 200 `{ok:true}` | 400, 401, 500 |
| 17 | `/api/stripe/status` | GET | Bearer | Subscription status (web/Android path) | 200 JSON | 401, 500 |
| 18 | `/api/stripe/portal` | POST | Bearer | Billing-portal URL | 200 `{url}` | 400, 401, 500 |
| 19 | `/api/referral/lookup` | GET | **none** | Public instructor lookup | 200 JSON | 400, 404, 500 |
| 20 | `/api/referral/claim` | POST | Bearer | Claim referral code | 200 JSON | 400, 401, 404, 409, 500 |
| 21 | `/api/flags` | GET | **none** | Client feature flags | 200 JSON | (fails open 200) |
| 22 | `/api/report` | POST | Bearer | Submit moderation report | 200 JSON | 400, 401, 403, 500 |
| 23 | `/api/health` | GET | **none** | Health probe | 200/503 JSON | 503 |
| 24 | `/api/iap/*` | POST | Bearer | **NEW (M4)** RevenueCat receipt validate / entitlement sync / webhook | 200 JSON | TBD — see payments doc |
| 25 | `/api/consent` | POST | Bearer | Record a consent (`faa_disclaimer` **and** the new `ai_data_processing` kind) | 200 `{ok:true}` | 400, 401, 500 |
| 26 | `/api/user/delete` | POST | Bearer | Account deletion (store-BLOCKING, Apple 5.1.1(v)) | 200 `{deleted:true}` | 400, 401, 500, 502 |
| 27 | `/api/user/export` | GET | Bearer | GDPR data export (downloadable JSON, 1/hour) | 200 attachment | 401, 429 |

**Global middleware (applies to all `/api/*`):** rate limiting runs **before** the handler (`middleware.ts:18-71`). On limit breach the response is `429 {"error":"rate_limited","message":"Too many requests. Please try again shortly."}` with headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset` (`middleware.ts:57-68`). Per-route limits (`rate-limit.ts:48-57`): `/api/exam` 20/min·user, `/api/tts` 30/min·user, `/api/stt/token` 4/min·user, `/api/stripe/checkout` 5/min·user, `/api/report` 10/min·user; routes with no entry are unlimited at the middleware layer. **The native client MUST read `Retry-After` and back off** (esp. `/api/stt/token` at 4/min).

---

### B.1 `POST /api/exam` — exam engine

`maxDuration = 60` (`route.ts:200`). One JSON body discriminated by `action`.

**Request body** (`route.ts:355-367`):
```ts
{
  action: 'start' | 'respond' | 'next-task' | 'resume-current';  // required
  history?: ExamMessage[];          // [{ role:'examiner'|'student', text:string }]
  taskData?: AcsTaskRow;            // client copy — IGNORED when server metadata exists (W2.1)
  studentAnswer?: string;           // respond
  coveredTaskIds?: string[];
  sessionId?: string;               // REQUIRED for respond/next-task
  stream?: boolean;                 // true ⇒ SSE response
  sessionConfig?: SessionConfig;    // start; IGNORED when server metadata exists
  plannerState?: PlannerState;      // client copy — IGNORED when server metadata exists
  chunkedResponse?: boolean;        // true ⇒ structured 3-chunk SSE (respond + stream only)
  examPlan?: ExamPlanV1;            // client copy — IGNORED when server metadata exists
}
```
**Server-state authority (W2.1):** when `sessionId` is present the route loads `exam_sessions.metadata` (RLS-scoped, ownership `eq('user_id', user.id)`, `route.ts:378-396`). Server values override every client copy: `srvPlannerState`, `srvExamPlan`, `srvSessionConfig`, `srvTaskData` (`route.ts:451-454`). **Mobile should still send its local copies for backward-compat, but must treat the server response as truth** and persist nothing client-authoritative across app launches.

**Global pre-checks (every action):**
- 401 `{"error":"Unauthorized"}` — no user (`route.ts:331`).
- 503 `{"error":"service_unavailable","reason":<string>}` — Anthropic kill switch (`route.ts:341-345`).
- 500 `{"error":"Internal server error"}` — outer catch (`route.ts:1657-1662`).
- Ownership fail (sessionId not owned) → 404 `{"error":"Session not found"}` (`route.ts:386-388`).

**Per-session gates (respond & next-task), in order** (`route.ts:401-450`):
1. Missing `sessionId`/row → 400 `{"error":"sessionId required"}` (`route.ts:402-404`).
2. `status !== 'active'` → 409 `{"error":"session_not_active","status":<status>}` (`route.ts:405-410`).
3. Trial window expired (free only, `tier !== 'dpe_live'`, `expires_at` past) → 403 `{"error":"session_expired","upgrade_url":"/pricing"}` (`route.ts:413-418`).
4. (`respond` only) exchange cap reached → 429 `{"error":"quota_exceeded","limit":"exchanges_per_session","cap":<n>,"upgrade_url":"/pricing"}` (`route.ts:423-432`).
5. (`respond` only) daily LLM-token cap → 429 `{"error":"daily_cap_reached","limit":"daily_llm_tokens","upgrade_url":"/pricing"}` (`route.ts:436-447`).

**Single-active-exam (any action with sessionId):** superseded → 409 `{"error":"session_superseded","message":"This exam session has been superseded by another device. Please end this session."}` (`route.ts:483-488`). Success may yield `pausedSessionId` (surfaced in `start` responses). **Mobile must surface the 409 as a "resume on this device?" prompt, not a silent failure.**

#### B.1.a `action: 'start'`

**Planner path (sessionConfig present)** — 200 JSON (`route.ts:726-734`):
```ts
{ taskId: string, taskData: AcsTaskRow, examinerMessage: string,
  elementCode: string, plannerState: PlannerState, examPlan: ExamPlanV1,
  pausedSessionId?: string }
```
No elements found → 500 `{"error":"No elements found for your session configuration."}` (`route.ts:518-523`).

**Legacy/random path (no sessionConfig):**
- `stream:true` → SSE `Response`. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Task-Id: <task.id>`, **`X-Task-Data: <base64(JSON.stringify(task))>`** (`route.ts:773-781`). The base64 `X-Task-Data` header is how the client recovers full task JSON for a streamed start; **no assessment event on start** (opening question has no answer). Mobile must base64-decode `X-Task-Data` to obtain `taskData`.
- non-stream → 200 JSON (`route.ts:800-804`): `{ taskId, taskData, examinerMessage, pausedSessionId? }`.
- No tasks → 500 `{"error":"No ACS tasks found. Check database seed."}` (`route.ts:741-744`).

#### B.1.b `action: 'respond'` (the SSE-critical path)

Requires `srvTaskData` + `history` + `studentAnswer`, else 400 `{"error":"Missing taskData, history, or studentAnswer"}` (`route.ts:813-817`).

**Non-streaming** → 200 JSON (`route.ts:1223-1230`):
```ts
{ taskId: string, taskData: AcsTaskRow, examinerMessage: string,
  assessment: AssessmentData & { advance: boolean },   // the advancement payload
  advance: boolean,                                     // top-level duplicate of assessment.advance
  examPlan?: ExamPlanV1 }
```
`advance:true` ⇒ client should next call `action:'next-task'`.

**Streaming (`stream:true`)** → SSE `Response`. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, **`X-Task-Id: <respondTask.id>`** — **no `X-Task-Data` on respond** (client already holds the task) (`route.ts:1092-1098`).

**SSE wire format (CRITICAL for the native parser).** Implemented in `src/lib/exam-engine.ts:500-707`. **There is NO named SSE `event:` field.** Every line is `data: <json>\n\n`; the client discriminates by which **JSON key** is present. Keep-alives are SSE comment lines, and the stream ends with a literal sentinel. Events in emission order:

| Order | Wire line | Discriminator key | Notes / source |
|---|---|---|---|
| 1 | `data: {"chunk":"feedback_quick"\|"feedback_detail"\|"question","text":string,"serverTs":number}` | `chunk` | **Only when `chunkedResponse:true`.** Structured 3-chunk progressive delivery (`exam-engine.ts:547,602`). Safety-net variants add `"safetyNet":true` when the model ignored JSON (`exam-engine.ts:614-628`). |
| 2 | `data: {"token":string}` | `token` | **Non-structured mode** raw token stream (`exam-engine.ts:551`). |
| 3 | `data: {"paragraph":string}` | `paragraph` | Non-structured, only when responding to a student. P1=first sentence, P2=first `\n\n`, P3=remainder at end (`exam-engine.ts:560,573,589`). Use these to drive sentence-level TTS. |
| 4 | `data: {"examinerMessage":string}` | `examinerMessage` | **Always**, after generation — the full plain-text message for persistence/display (`exam-engine.ts:637`). |
| 5 | `data: {"asset":SelectedAsset}` then `data: {"images":ImageResult[]}` | `asset` / `images` | Only when RAG assets + assetContext. `images` is the backward-compat companion (`exam-engine.ts:645,649,658`). |
| 6 | `data: {"assessment":AssessmentData & {advance?:boolean}}` | `assessment` | Carries the advancement decision. On assessment failure an **UNGRADED fallback** is emitted (`exam-engine.ts:686,693-702`): `{score:'ungraded', feedback:'This answer could not be assessed due to a technical issue.', misconceptions:[], follow_up_needed:false, primary_element:null, mentioned_elements:[], source_summary:'Insufficient FAA sources to verify this answer.'}`. |
| 7 | `: keep-alive\n\n` | (none — SSE comment) | Every 2 s while awaiting assessment (`exam-engine.ts:681`). **Parser must ignore lines starting with `:`.** |
| 8 | `data: [DONE]\n\n` | (sentinel) | Terminator (`exam-engine.ts:706`). Not JSON — match the literal string. |

**Native parser contract (pass/fail rules):**
- Split on `\n\n`; for each frame, strip the leading `data: `.
- If the payload `=== '[DONE]'` → close.
- If the line starts with `:` (no `data:`) → it is a keep-alive comment; **ignore**.
- Else `JSON.parse` and branch on the first present key in: `chunk`, `token`, `paragraph`, `examinerMessage`, `asset`, `images`, `assessment`.
- The `assessment` event's `advance` (boolean) is the **advancement signal**; if `true`, after `[DONE]`, call `action:'next-task'`.
- **Do not assume order beyond "examinerMessage precedes assessment".** The keep-alive can interleave; assessment may arrive seconds after `examinerMessage`.

> **OWNER DECISION — chunked vs token mode on mobile.** The web app uses `chunkedResponse:true` for progressive 3-chunk TTS. The native client may pick `chunkedResponse:true` (structured `chunk` events) **or** the token/paragraph mode. **This plan recommends `chunkedResponse:true`** so the native sentence-TTS queue is fed clean `feedback_quick`/`feedback_detail`/`question` boundaries (matching the voice-pipeline port) rather than re-deriving paragraphs from a token stream. Confirm before building the parser.

#### B.1.c `action: 'resume-current'`

No LLM, no advance (`route.ts:1233-1271`). Requires `srvPlannerState` + `srvSessionConfig`, else 400 `{"error":"Missing plannerState or sessionConfig"}`. No current element → 200 `{"examinerMessage":"Session complete","sessionComplete":true}`. Task miss → 404 `{"error":"Task not found"}`. Success → 200 `{ taskId, taskData, elementCode }` (`route.ts:1266-1270`). **Mobile calls this on app-resume to re-render the pending question without spending an LLM call.**

#### B.1.d `action: 'next-task'`

Three internal sub-paths (`route.ts:1273-1654`); the native client treats them uniformly by response shape:
- **Advance to next element** → 200 `{ taskId, taskData, examinerMessage, elementCode, plannerState, examPlan }` (linear `route.ts:1603-1610`; scenario `route.ts:1414-1421` — same keys).
- **Exam complete** → 200 `{"examinerMessage":"We have covered all the elements in your study plan. Great job today!","sessionComplete":true}` (`route.ts:1503-1506`) — or the legacy variant `{"examinerMessage":"We have covered all the areas. Great job today!","sessionComplete":true}`. **Branch on `sessionComplete:true` regardless of message text.**
- Invalid action → 400 `{"error":"Invalid action"}` (`route.ts:1656`).

---

### B.2 `GET /api/exam` — reads

`route.ts:202-318`. 401 same shape. Query `?action=`:
- `list-tasks` (+`rating`) → 200 `{"tasks":[{id,area,task,applicable_classes}]}` (`route.ts:213-225`); query error → 500 `{"error":<msg>}`.
- `summary` (+`sessionId`) → no sessionId 400 `{"error":"sessionId required"}`; not owned 404 `{"error":"Session not found"}`; no V2 result 404 `{"error":"No ExamResultV2 available for this session. Was the exam completed?"}`; else 200 `{"report":WeakAreaReport}` (`route.ts:229-310`).
- else → 400 `{"error":"Invalid action"}` (`route.ts:313`).

---

### B.3 `POST /api/session` — session CRUD

`session/route.ts:20`. 401 `{"error":"Unauthorized"}` (`:24-26`). Constants `FREE_TRIAL_EXAM_LIMIT=3`, `FREE_TRIAL_WINDOW_DAYS=7` (`:16-18`).

**`action:'create'`** (`:31-165`). Body `{ action:'create', study_mode?, difficulty_preference?, selected_areas?, aircraft_class?, selected_tasks?, rating?, is_onboarding? }` (`:32,46`). `is_onboarding` is recomputed server-side, never trusted (`:42-60`). Trial gating (free + non-onboarding), in order:
1. exam count ≥ 3 (all non-onboarding, incl. abandoned) → 403 `{"error":"trial_limit_reached","upgrade_url":"/pricing","limit":3}` (`:87-89`).
2. churned/once-subscribed (real `subscription_status ∈ {canceled,unpaid,past_due}` OR legacy `has_trialed`, with no live `stripe_subscription_id`) → 403 `{"error":"resubscribe_required","upgrade_url":"/pricing"}` (`:124-126`).
3. signup + 7 d elapsed → 403 `{"error":"trial_expired","upgrade_url":"/pricing","windowDays":7}` (`:131-133`).

Success → 200 `{"session": <full exam_sessions row>}` (`:164`). Count query error → 500 `{"error":<msg>}` (`:84`).

**The three 403 reason codes all route the mobile client to the paywall/upgrade modal.** A live `stripe_subscription_id` (read-through `hasLiveSubscription`, `:113`) bypasses the trial cap even past a stale tier cache — so a just-paid user is never blocked. **On iOS, the upgrade modal must launch the RevenueCat IAP flow (Guideline 3.1.1), not the Stripe web link** (see payments doc).

**`action:'discard'`** (`:170-185`). Body `{action:'discard', sessionId}`; missing → 400 `{"error":"sessionId required"}`. Marks active/paused → `abandoned`. Success → 200 `{"ok":true}`; error → 500.

**`action:'update'`** (`:187-369`). Body `{ action:'update', sessionId, status?, acs_tasks_covered?, exchange_count?, planner_state?, session_config?, task_data?, voice_enabled? }` (`:188`). Missing sessionId → 400 `{"error":"sessionId required"}`. `status:'abandoned'` rejected → 400 `{"error":"use_discard_action"}` (`:195-197`). `acs_tasks_covered` is **merged**, never replaced (W2.4, `:201-218`). On `status:'completed'` the server grades the exam and writes V1 `result` + `examResultV2`. Success → 200 `{"ok":true, "result": ExamResult|null, "resultV2": ExamResultV2|null}` (`:364-368`); final error → 500.

Invalid action → 400 `{"error":"Invalid action"}` (`:371`).

---

### B.4 `GET /api/session` — reads

`session/route.ts:374-549`. 401 same shape. `?action=`:
- `stats` (+`rating`) → 200 `{"stats":{totalSessions,completedSessions,totalExchanges,uniqueTasksCovered}}` (excludes abandoned+expired) (`:389-422`).
- `element-scores` (+`rating`) → 200 `{"scores":ElementScore[]}` (`:426-438`).
- `session-element-scores` (+`sessionId`, owner-checked) → 200 `{"scores":[...]}` (`:441-468`).
- `get-resumable` → 200 `{"session": <row>|null}` (most recent active/paused) (`:471-485`). **Mobile calls this on launch to offer "resume exam".**
- `get-all-resumable` → 200 `{"sessions":[...]}` (`:488-501`).
- `transcripts` (+`sessionId`, owner-checked) → 200 `{"transcripts":[{role,text,assessment}]}` (`:504-533`).
- default (no action) → 200 `{"sessions": <last 20 rows>}` (`:537-548`).

All reads: query error → 500 `{"error":<msg>}`; missing sessionId → 400 `{"error":"sessionId required"}`; not owned → 404 `{"error":"Session not found"}`.

---

### B.5 `POST /api/tts` — text → audio bytes

`tts/route.ts:34`. `maxDuration = 30` (`:23`).

**Request:** `{ text: string, voice?: string }` (`:44`). The web client sends only `{ text }`; `voice` is an admin/preview override validated against the curated list (`:131-147`). Server truncates `text.slice(0, 2000)` (`:50`).

**Success (`:179-188`):** raw audio body (a `ReadableStream<Uint8Array>`), **not JSON**. Headers:
- `Content-Type: audio/mpeg` (MP3) (`:181`)
- `X-Audio-Encoding: mp3` (`:182`)
- `X-Audio-Sample-Rate: 22050` (MP3 hard-pinned to 22050 Hz by Deepgram, `:183` / `deepgram-tts.ts:108-109`)
- `X-Audio-Channels: 1` (`:184`)
- `X-TTS-Provider: deepgram` (`:185`)
- `Cache-Control: no-cache` (`:186`)

**Native player contract:** the web client ignores the `X-Audio-*` headers and treats the body as `audio/mpeg` (per voice brief). **The mobile native player should do the same: read the raw bytes as MP3.** An empty (0-byte) body is an error.

**Errors:** 401 (`:41`), 400 `{"error":"Missing text"}` (`:46`), 503 `{"error":"service_unavailable","reason":<string>}` (`:65-70`), 429 `{"error":"quota_exceeded","limit":<n>,"upgrade_url":"/pricing"}` (`:101-104`) or `{"error":"daily_cap_reached","limit":"daily_tts_chars","upgrade_url":"/pricing"}` (`:117-120`), 500 `{"error":"TTS generation failed","detail":<msg>}` (`:192-195`). Middleware rate limit: 30/min·user.

---

### B.6 `GET /api/stt/token` — Deepgram WS JWT

`stt/token/route.ts:29` (→ `GET(request)` after §A.4).

**Request (mobile):** `GET /api/stt/token?encoding=linear16&sample_rate=16000` (params added by §A.4; web sends none).

**Success (`:190-203`):**
```ts
{ token: string,        // Deepgram JWT, always starts "eyJ"
  url: string,          // prebuilt wss URL (with encoding/sample_rate for mobile)
  expiresAt: number,    // Date.now() + expires_in*1000 (TTL 600 s)
  flux: boolean,        // true ⇒ /v2/listen TurnInfo schema; false ⇒ Nova-3 Results schema
  _debug: { method, tokenLen, tokenPrefix, expiresIn, ttlSeconds, keytermCount } }
```

**WS connection contract (native must replicate):** the JWT starts `eyJ`, so connect with subprotocol pair **`['bearer', <jwt>]`** → `Sec-WebSocket-Protocol: bearer, <jwt>` (per voice brief `useDeepgramSTT.ts:143-145`). Send raw linear16/16k PCM binary frames; graceful close sends `{"type":"CloseStream"}` then closes. Nova-3 inbound = `Results` (`channel.alternatives[0].transcript`, `is_final` finalizes); Flux inbound = `TurnInfo` (`EndOfTurn` finalizes).

**Errors:** 401 (`:35-37`), 503 `{"error":"service_unavailable","reason":<string>}` (`:48-51`), 429 token-rate `{"error":"Token rate limit exceeded. Max 4 tokens per minute."}` (`:66-69`) or quota `{"error":"quota_exceeded","limit":<n>,"upgrade_url":"/pricing"}` (`:85-88`), 500 missing key `{"error":"Deepgram API key not configured"}` (`:95-98`), 502 grant failed `{"error":"Failed to obtain STT token"}` / `{"error":"Invalid token response from STT provider"}` (`:118-121,131-134`), 500 catch (`:206-209`). Middleware limit: **4/min·user** — the native client must reuse a token for the full 10-minute TTL and not re-mint per utterance.

---

### B.7 `POST /api/stt/usage` — STT session accounting

`stt/usage/route.ts:25`. Body `{ sessionId?, action:'start'|'end', durationSeconds? }`. Invalid action → 400 `{"error":"Invalid action. Must be \"start\" or \"end\"."}` (`:37-40`).
- `start`: tier-0 cap → 403 `{"error":"STT is not available for your tier."}` (`:49-52`); concurrent cap reached → 429 `{"error":"Concurrent STT session limit reached.","limit":<cap>}` (`:67-72`); else 200 `{"ok":true}`. Concurrent caps: ground_school 1, checkride_prep 1, dpe_live 2 (`:12-16`).
- `end`: updates the most-recent open session with `durationSeconds` → 200 `{"ok":true}`.
- Insert/update failure → 500. **Mobile must call `start` before opening the WS and `end` (with measured seconds) on close** — otherwise sessions look "stale-open" for 30 min and eat the concurrent cap.

---

### B.8 `GET /api/user/tier` — tier + features + usage + prefs

`user/tier/route.ts:14`. 401 `{"error":"Unauthorized"}` (`:18-20`). Success (`:68-92`):
```ts
{ tier: VoiceTier, subscriptionStatus: string, cancelAtPeriodEnd: boolean,
  currentPeriodEnd: string|null, features: TierFeatures,
  usage: { sessionsThisMonth, ttsCharsThisMonth, sttSecondsThisMonth },
  preferredVoice: string|null, preferredRating: Rating, preferredAircraftClass: AircraftClass,
  aircraftType: string|null, homeAirport: string|null, onboardingCompleted: boolean,
  disclaimerAcknowledged: boolean, preferredTheme: 'cockpit'|'glass'|'sectional'|'briefing',
  displayName: string|null, avatarUrl: string|null, voiceEnabled: boolean,
  examinerProfile: string|null, voiceOptions: {model:string,...}[] }
```
Error → 500 `{"error":"Internal server error"}` (`:95`). **`tier` is the stored enum (`checkride_prep`/`dpe_live`/`ground_school`); the human label (Trial/Paid/Tester) is derived client-side via the shared `tierDisplay()` (§A.6).**

### B.9 `POST /api/user/tier` — update preferences

`user/tier/route.ts:106`. Body any subset of `{ preferredVoice, preferredRating, preferredAircraftClass, aircraftType, homeAirport, onboardingCompleted, preferredTheme, displayName, avatarUrl, voiceEnabled, examinerProfile }` (`:115`). Validation 400s: `{"error":"Invalid voice option"}` (`:132-137`), `{"error":"Invalid rating"}` (`:143-145`), `{"error":"Invalid aircraft class"}` (`:150-153`), `{"error":"Aircraft type too long"}` (`:158-161`), `{"error":"Home airport too long"}` (`:166-169`), `{"error":"Invalid theme"}` (`:180-183`), `{"error":"Display name too long (max 50 chars)"}` (`:188-191`), `{"error":"Avatar URL too long"}` (`:196-199`), `{"error":"Invalid examiner profile"}` (`:210-213`). Update fail → 500 `{"error":"Failed to update preferences"}` (`:230-233`). Success → 200 `{"ok":true}` (`:241`). Valid ratings `private|commercial|instrument|atp`; classes `ASEL|AMEL|ASES|AMES`; themes `cockpit|glass|sectional|briefing`.

---

### B.10 `GET /api/user/sessions` — active devices

`user/sessions/route.ts:18`. 401 (`:27-29`). Success → 200 `{"sessions":[{ id, device_label, approximate_location, is_exam_active, last_activity_at, created_at, this_device }]}` (`:54-64`). Fetch error → 500 `{"error":"Failed to fetch sessions"}` (`:48-51`); catch → 500. `this_device` is computed from `getSessionTokenHash` — **needs §A.3's `accessToken` wiring to be true for the mobile device**.

### B.11 `DELETE /api/user/sessions` — sign out other devices

`user/sessions/route.ts:82`. 401. Success → 200 `{"ok":true,"message":"All other sessions signed out."}` (`:121`). Catch → 500.

---

### B.12 `GET /api/user/milestones`

`user/milestones/route.ts:15`. 401. Success → 200 `{"milestones": <current milestones>}` (`:25`). Catch → 500.

### B.13 `POST /api/user/milestones`

`user/milestones/route.ts:32`. Body `{ milestoneKey, status, notes? }`. Bad key → 400 `{"error":"milestoneKey must be one of: <list>"}` (`:44-49`); bad status → 400 `{"error":"status must be one of: not_set, in_progress, completed"}` (`:52-57`); notes non-string → 400 `{"error":"notes must be a string"}`; notes > 500 → 400 `{"error":"notes must be 500 characters or less"}` (`:60-70`). Insert fail → 500 `{"error":"Failed to save milestone"}`. Success → 200 `{"success":true,"milestone": <row>}` (`:90`).

---

### B.14 `POST /api/user/avatar` — multipart upload

`user/avatar/route.ts:5`. **`multipart/form-data`**, field name `avatar` (a File). 401 `{"error":"Unauthorized"}` (`:8-10`). No file → 400 `{"error":"No file provided"}` (`:14`). > 2 MB → 400 `{"error":"File too large (max 2MB)"}` (`:19-21`). Bad type (allowed `image/jpeg|image/png|image/webp`) → 400 `{"error":"Invalid file type. Use JPG, PNG, or WebP."}` (`:24-27`). Upload/profile fail → 500 `{"error":"Storage upload failed: <msg>"}` / `{"error":"Profile update failed: <msg>"}`. Success → 200 `{"avatarUrl": <public URL with cache-bust ?t=>}` (`:68`). **Native must send a real multipart body** (not JSON) — RN `FormData` with a file part.

---

### B.15 `GET /api/user/email-preferences`

`email-preferences/route.ts:19`. 401. Success → 200 `{"preferences": <category→enabled map>}` (`:29`). Catch → 500.

### B.16 `POST /api/user/email-preferences`

`email-preferences/route.ts:41`. Body `{ category: EmailCategory, enabled: boolean }`. Missing/invalid category → 400 `{"error":"Missing or invalid category"}` (`:55-59`); non-boolean → 400 `{"error":"Missing or invalid enabled flag"}` (`:63-67`); required (non-optional) category → 400 `{"error":"Cannot modify required email category"}` (`:71-75`); update fail → 400 `{"error": <result.error|'Failed to update preference'>}`. Success → 200 `{"ok":true}` (`:95`).

---

### B.17 `GET /api/stripe/status` — subscription status

`status/route.ts:12`. 401. Returns stored state when `subscription_status ∈ {active, trialing}` → 200 `{ tier, status, cancelAt, cancelAtPeriodEnd, currentPeriodEnd }` (`:28-36`). Else if a `stripe_customer_id` exists it queries Stripe; an active/trialing sub triggers an immediate `dpe_live` write + `invalidateTierCache` → 200 `{ tier:'dpe_live', status }` (`:46-70`). Default → 200 `{ tier: <stored|'checkride_prep'>, status:'free' }` (`:75`). Catch → 500 `{"error":<msg>}`. **On iOS this reflects only the Stripe/web purchase path; IAP entitlement is read from `/api/user/tier` after the merge (M4).**

### B.18 `POST /api/stripe/portal` — billing portal URL

`portal/route.ts:11`. 401. No customer → 400 `{"error":"No subscription found"}` (`:26-28`). Success → 200 `{"url": <billing portal URL>}` (`:37`) returning to `/settings`. Catch → 500. **iOS: subscriptions purchased via IAP are managed in Apple's Settings, not this portal — only show "Manage on web" for Stripe-originated subs.**

---

### B.19 `GET /api/referral/lookup` — public instructor lookup (NO AUTH)

`referral/lookup/route.ts:18`. Query `?code=` or `?slug=`. Feature off → 404 `{"error":"Not found"}` (`:21-23`). Code miss → 404 `{"error":"Referral code not found"}`; slug miss → 404 `{"error":"Instructor not found"}`; neither param → 400 `{"error":"Either code or slug query parameter is required"}` (`:45-48`). Success → 200 `{"instructor": <display-safe info>}` — **never** certificate_number or email (`:34,42`). Catch → 500.

### B.20 `POST /api/referral/claim`

`referral/claim/route.ts:25`. Body `{ code: string }`. 401 `{"error":"Please sign in to use this referral code"}` (`:30-33`). Feature off → 404 `{"error":"Not found"}`. Empty code → 400 `{"error":"Referral code is required"}`. Invalid code → 404 `{"error":"Invalid referral code"}`. Own code → 400 `{"error":"You cannot use your own referral code"}`. Already connected to a *different* instructor → 409 `{"error":"You are already connected to an instructor. Disconnect first to connect with a different one."}` (`:79-82`); same instructor → idempotent 200 `{ ok:true, connectionId, alreadyConnected:true }`. Upsert fail → 500 `{"error":"Failed to connect"}`. Success → 200 `{ ok:true, connectionId, instructorName }` (`:123-127`).

---

### B.21 `GET /api/flags` — client feature flags (NO AUTH)

`flags/route.ts:11`. Always 200 (fails open): `{ tts_sentence_stream: boolean, instructor_partnership_v1: boolean, scenario_mode: 'on'|'ab'|'off' }` (`:19-24`), `Cache-Control: public, max-age=60, stale-while-revalidate=300` (`:26`). On error returns the same shape with all-false/`'off'` (`:30-34`). **Mobile reads `scenario_mode` to decide whether to show the Mock Checkride study card.**

### B.22 `POST /api/report`

`report/route.ts:31`. Body `{ report_type, session_id?, transcript_id?, details }`. 401. Invalid type (allowed `inaccurate_answer|safety_incident|bug_report|content_error`) → 400 `{"error":"Invalid report_type. Must be one of: <list>"}` (`:48-53`). Missing details → 400 `{"error":"Missing or invalid details object"}` (`:56-61`). Session not owned → 403 `{"error":"Session not found or not owned by you"}` (`:71-76`). Insert fail → 500 `{"error":"Failed to submit report"}`. Success → 200 `{"ok":true,"reportId": <id>}` (`:98`). Middleware limit: 10/min·user.

### B.23 `GET /api/health` (NO AUTH)

`health/route.ts:10`. 200 (healthy) or **503** (degraded): `{ status:'ok'|'degraded', checks:{ db, anthropic_key, deepgram_key, supabase_env }, timestamp, version }` (`:36-44`), `Cache-Control: no-store`. **Mobile may use this as a pre-flight before showing an exam, but should not block UI on it.**

---

### B.25 `POST /api/consent` — record a consent

`consent/route.ts:17`. 401 `{"error":"Unauthorized"}` when no user (`:20`). **Adopts the dual-mode `getAuthedUser()` helper (§A.1)** — it is authenticated and currently cookie-only.

**Request:** `{ kind: string, choices: Record<string, unknown> }` (`:22`). `kind` is currently coerced to either `'disclaimer'` or `'cookie'` (`:23`); **v1 mobile needs BOTH the existing `faa_disclaimer`/`disclaimer` kind AND a NEW, separate `ai_data_processing` kind** (SHARED resolution #1 — third-party-AI consent recorded server-side before the first exam / before any audio leaves the device; copy names Anthropic = examiner LLM, Deepgram = STT + TTS, OpenAI = TTS fallback). The route's `kind` coercion at `consent/route.ts:23` must be widened to accept `ai_data_processing` (it does not today — a verified M1/M2 edit; do not reuse `faa_disclaimer_v1`, which stays the FAA-accuracy disclaimer). `choices` for the AI kind is `{ third_party_ai_v1: true }`. **Owner of the UX + record: `screens/02-onboarding.md`.**

**Errors:** `choices` missing or not an object → 400 `{"error":"choices required"}` (`:25`). Insert failure → 500 `{"error":"persist_failed"}` (`:33`).

**Success → 200 `{"ok":true}`** (`:41`). **Side-effect:** when `kind === 'disclaimer'` the route also stamps `user_profiles.disclaimer_acknowledged_at = now()` (`:35-40`) — the column that gates exam start (reflected back as `disclaimerAcknowledged` in `GET /api/user/tier`, §B.8). The new `ai_data_processing` record writes only a `consent_records` row (no profile stamp); the onboarding/exam-start gate for the AI-consent record is defined in `screens/02-onboarding.md`.

---

### B.26 `POST /api/user/delete` — account deletion (store-BLOCKING)

`user/delete/route.ts:23`. 401 `{"error":"Unauthorized"}` when no user (`:26`). **Adopts the dual-mode `getAuthedUser()` helper (§A.1).** **Apple Guideline 5.1.1(v) requires an in-app account-deletion path, so this route is a STORE-SUBMISSION BLOCKER** — the native Settings screen must call it (see SHARED resolution #3 for the store-subscription copy + RevenueCat-detach requirement, owned by the screens/Apple docs).

**Request:** type-to-confirm guard — `{ confirm: "DELETE" }` (`:28-29`).

**Errors:**
- Missing/wrong confirm → 400 `{"error":"confirmation_required","detail":"Send {\"confirm\":\"DELETE\"}"}` (`:29-31`).
- Stripe subscription cancel failed (anything other than already-canceled) → **502** `{"error":"stripe_cancel_failed","detail":"Subscription could not be cancelled. Contact support."}` (`:50-54`) — deletion is aborted so a paying sub is never stranded.
- `auth.admin.deleteUser` failure → 500 `{"error":"deletion_failed","detail":<msg>}` (`:72-75`).

**Success → 200 `{"deleted":true}`** (`:88`). Server-side order (`:36-86`): cancels any Stripe subscription immediately → explicit deletes of non-FK rows (`subscription_events`, `support_tickets`/`ticket_replies`) → `auth.admin.deleteUser` (FK cascades wipe the 34-table user-keyed map) → confirmation email + anonymized telemetry (fire-and-forget). **Note for the native UI (SHARED #3):** an Apple App Store / Google Play subscription keeps billing until cancelled in Apple Settings / Google Play even after deletion — the client must show that copy with exact steps; Stripe is auto-cancelled here. RevenueCat subscriber detach during deletion is a separate M4/payments-doc requirement.

---

### B.27 `GET /api/user/export` — GDPR data export

`user/export/route.ts:17` (→ `GET(request: NextRequest)` after the §A.1 swap; currently `GET()`). 401 `{"error":"Unauthorized"}` when no user (`:20`). **Adopts the dual-mode `getAuthedUser()` helper (§A.1).**

**Rate limit:** **1/hour per user** (`checkRateLimit('/api/user/export', user.id)`, `:22`) — over limit → **429** `{"error":"rate_limited","detail":"Data export is limited to once per hour."}` (`:23-28`). (This is a route-level limiter, distinct from the middleware per-route table.)

**Success → 200, a downloadable JSON attachment** (NOT an inline JSON API body) (`:68-74`). Headers: `Content-Type: application/json`, `Content-Disposition: attachment; filename="heydpe-export-<YYYY-MM-DD>.json"`, `Cache-Control: no-store`. Body shape (`:57-66`): `{ export_version:1, generated_at, account:{id,email}, profile, email_preferences, exam_sessions:[...], session_transcripts:[...], element_attempts:[...] }` (transcripts = Q/A + assessment only; internal RAG chunks are excluded as non-user data). **Native must treat the response as a file download (save/share sheet), not parse-and-render.**

---

### B.24 `/api/iap/*` — RevenueCat IAP (NEW, task M4 — NOT YET IN REPO)

> **Status: does not exist yet** (verified — `src/app/api/iap/` is absent). The full contract is owned by the payments doc; this section is a forward-reference so the mobile client's networking layer reserves it. The IAP routes must converge on the **same single truth** as Stripe: set `user_profiles.tier='dpe_live'` and call `invalidateTierCache(userId)` so the `isPaying` gate (`session/route.ts:40`) and the read-through `hasLiveSubscription` (`session/route.ts:113`) both see the entitlement. RevenueCat product IDs need a parallel mapping to the Stripe-price-specific `mapStripePriceToTier`; `subscription_events` (service-role, keyed on provider event id) is the idempotency template.

**Expected v1 surface (to be finalized in the payments doc):**
- `POST /api/iap/sync` (Bearer) — client posts the RevenueCat App User ID / customer info after a purchase or on launch; server merges entitlement, writes `dpe_live`, invalidates cache. Success 200 `{ tier, entitlementActive: boolean }`.
- `POST /api/iap/webhook` (RevenueCat-signed, no user Bearer) — RevenueCat → server entitlement events, idempotent like the Stripe webhook.

> **OWNER DECISION — IAP route shapes are deferred to the payments doc (M4).** This contract MUST be filled in there before the mobile purchase flow is implemented; the request/response/error shapes above are placeholders, not authoritative.

---

## Appendix — canonical shared types (Part B references)

From `src/lib/exam-engine.ts`: `ExamMessage = { role:'examiner'|'student', text:string }` (`:31`); `AssessmentData = { score:'satisfactory'|'unsatisfactory'|'partial'|'ungraded', feedback, misconceptions:string[], follow_up_needed:boolean, primary_element:string|null, mentioned_elements:string[], source_summary:string, rag_chunks?:ChunkSearchResult[], usage?:LlmUsage }` (`:36`).

From `src/lib/exam-logic.ts`: `AcsElement = { code:string, description:string }` (`:10`); `AcsTaskRow = { id, area, task, knowledge_elements:AcsElement[], risk_management_elements:AcsElement[], skill_elements:AcsElement[], applicable_classes:AircraftClass[] }` (`:15`).

From `src/types/database.ts`: `Rating='private'|'instrument'|'commercial'|'atp'` (`:12`); `Difficulty='easy'|'medium'|'hard'|'mixed'` (`:14`); `StudyMode='linear'|'cross_acs'|'weak_areas'|'quick_drill'|'scenario'` (`:15`); `AircraftClass='ASEL'|'AMEL'|'ASES'|'AMES'` (`:20`); `ExamResult` (`:168`); `PlannerState = { version:number, queue:string[], cursor:number, recent:string[], attempts:Record<string,number> }` (`:254`); `SessionConfig = { rating, aircraftClass, studyMode, difficulty, selectedAreas:string[], selectedTasks:string[], persona?, examinerProfileKey? }` (`:262`).

From `src/lib/voice/types.ts`: `VoiceTier = 'ground_school'|'checkride_prep'|'dpe_live'` (`:1`).

These types are the ones extracted into `packages/shared` (§A.6) and consumed by the native client verbatim.

---

## FLIGHT DECK typography note (applies wherever this contract drives UI)

Where these endpoints render into the native UI: caps-mono + glow is reserved for **brand instrument moments only** — the attitude-indicator hero, `// cockpit micro-labels`, status annunciators/badges (e.g. a `SUPERSEDED` or `TRIAL` chip derived from a 409/403), ACS task/element codes (`PA.I.A.K1`), and numeric readouts (exchange counts, score percentages, `expiresAt` countdowns). Everything else — examiner message body, feedback prose, settings labels, error toasts — is sentence-case IBM Plex. Never 10px text. Touch targets ≥ 44pt iOS / 48dp Android. (Full design tokens live in the design-system doc, not here.)
