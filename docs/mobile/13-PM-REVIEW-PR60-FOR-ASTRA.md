# 13 — Project-manager review of PR #60, for the development engineer (GPT-6 Astra)

> **Read this before the next coding session.** It records what the project manager (Fable 5.1,
> responsible for code integrity) found while reviewing PR #60 module by module on 2026-09-11.
> It states **problems and goals**, not solutions. You own the design of each fix. Where a
> "done means" line is given, that is the acceptance bar, not an implementation hint.
>
> Owner: Piotr. PM: Fable 5.1. Engineer: GPT-6 Astra (via Codex).

## Verdict on PR #60

Merged as the integration base. Quality is high and the handoff was honest. Every verifiable
claim checked out: mobile tests (71), root tests (1,467), typecheck, lint, CI green, no secrets
in history, June history preserved, staging-auth removal identical to PR #59. The voice
controller implements the approved Phase 4.3 design (serialized transitions, cancellation
epochs, awaited recording-mode restore, ordered utterances, lossless 2,000-char splitting,
1.5 s finalize, AppState/focus lifecycle, draft model). The contract checks were done against the
server code and recorded.

Merging does not mean the items below are accepted. Nothing in this PR is device-proven, and the
first three items are blocking before the first physical-device build.

## Working rules from here

1. **Small PRs against `main`.** One concern per PR, each with its own tests. No more 100-file PRs.
2. **Owner decisions are not yours or mine to change in code.** Two product behaviours changed in
   this PR without a recorded owner decision; Piotr has now decided them (section B). Implement
   exactly as decided.
3. **The approved plan's gates stand.** Sentence-level TTS, prefetch and SSE remain conditional on
   attributed device measurements (`10-TEST-READINESS-PLAN.md` Phase 5). Do not pre-build them.
4. **Report honestly, as you did.** "Prepared, not proven" wording in the ledger was exactly right.

---

## Status after the remediation round (PM, 2026-09-11 evening)

PRs #62 to #72 were reviewed individually and merged to `main` (squash, in the order
A.1 → A.2/B.6 → A.3 → B.5 → B.4 → C.7/C.8 → C.10 → C.9 → C.11 → C.12 → C.13; three rebases
resolved by the PM). The receipt migration is applied to production and verified (RLS on,
owner-only select, partial unique index). Main passes 1,489 root tests, 122 mobile tests,
typecheck, lint, `expo install --check` and Expo Doctor 21/21. Production deployed.

Every item below is therefore **resolved in code, pending device proof**, except the new
items in section A2 which came out of the review of your PRs. The owner's device checklist is
`15-OWNER-DEVICE-TEST-CHECKLIST.md`; nothing in the code blocks it.

## A2. New problems found while reviewing the remediation PRs

### 14. A pending receipt has no operator path and no in-app escape (from #63)
**Problem:** `executeOnce` deliberately leaves a receipt `pending` after any 5xx or process
death. The exam route returns 5xx for transient upstream failures too (model overload, a
Deepgram/Anthropic hiccup), not only for partial writes. From then on that exam answers every
mutation with 409 `exam_operation_pending`, the client shows "Check saved progress" forever,
and nobody is told. The student's only way out is to abandon the exam and start another,
which costs a trial slot. There is no admin view, no way to inspect what the engine actually
wrote, and no way to release the lock once an operator has checked.
**Done means:** an operator can see pending receipts (age, session, action), inspect the
engine state that matters (transcript rows written after the receipt's `created_at`, planner
metadata), and resolve the receipt with a recorded decision (completed-with-original-outcome,
or released) without touching the database by hand; the student is told, in the app, what
happened and what they can do; and a pending receipt older than a defined age is surfaced to
the owner rather than waiting to be discovered. Choose the safety trade-off explicitly and
write it in `01-API-ENABLEMENT-AND-CONTRACT.md`.

### 15. There is no way to prove crash capture on a device (from #64 / owner decision B.6)
**Problem:** the telemetry doc's "proof still required" needs a first-frame JavaScript crash
and a native crash from the TestFlight build with analytics off. The app has no way to trigger
either. The owner cannot run that proof, and neither can I.
**Done means:** a preview/development-only, deliberately hard-to-hit trigger (never in a
production profile) for both a JavaScript exception at first render and a native crash, so the
test in `07-TELEMETRY.md` can be executed by the owner from the checklist; plus the exact
expected shape of the resulting Sentry issue written down so the proof can be judged.

### 16. The JavaScript resampler's cost is unmeasured on the older iPhone (from #62)
**Problem:** the windowed-sinc filter runs on the JS thread for every buffer (about a hundred
multiplications per output sample at 48 kHz). Correct and well-tested, but if it costs a
meaningful share of the JS thread on a 3 to 4 year old device, UI jank during listening will
show up in the voice gate as a lifecycle failure rather than as its real cause.
**Done means:** a measured CPU share for the normalizer on the older test iPhone at 48 kHz
input, recorded next to the T1 samples, and a decision (keep / move off the JS thread / ask
the platform for 16 kHz where it can deliver it) based on that number.

---

## A. Blocking before the first physical-device build

### 1. The capture path assumes the hardware delivers exactly 16 kHz mono
**Where:** `apps/mobile/src/lib/stt-capture.ts`, the PCM buffer handler.
**Problem:** every buffer whose `sampleRate` is not 16000 or `channels` not 1 is rejected with a
user-facing "unsupported audio format" error and the attempt is closed. expo-audio's own type
(`AudioStream.types.d.ts`) says the actual rate "may differ from the requested rate". Real iPhones
commonly run the input at 44.1 or 48 kHz. If that happens, voice input fails deterministically on
every device and never in the simulator.
**Done means:** voice input works whatever rate and channel count the hardware actually delivers,
the Deepgram session receives audio at the rate it was told to expect, and a format the pipeline
genuinely cannot handle is reported as a diagnostic, not as something the student did wrong.
Include a unit test for a non-16 kHz buffer stream.

### 2. Crash reporting is initialised late, coupled to the analytics toggle, and scrubbed to the point of being hard to act on
**Where:** `apps/mobile/src/lib/crash-reporting.ts`, `analytics.ts`, `app/_layout.tsx`.
**Problems:**
- Sentry is only initialised after the stored analytics consent has been read, from inside the
  analytics module. Nothing wraps the root component. Crashes during startup, before consent
  resolves, and native crashes whose handlers must be installed at launch are outside its reach.
- One switch ("Usage analytics") governs both product analytics and crash reporting. The owner has
  decided (B.6) that crash reporting is anonymous and always on, independent of that switch.
- `beforeSend` replaces every exception message with a fixed string and `beforeBreadcrumb`
  drops everything. A report will contain a type and stack frames only. For a voice pipeline
  whose failures are mostly messages ("connect_timeout", "Keychain unavailable", HTTP status),
  that removes the signal engineers need.
**Done means:** a crash on the first frame after launch is captured in the TestFlight build;
reports carry enough to identify the failing path without carrying student answers, transcripts,
emails or tokens; the privacy posture is written down in one place so the owner can approve it.

### 3. Recovery may repeat a non-idempotent server action
**Where:** `apps/mobile/src/app/(tabs)/practice.tsx` `recover()`, and the exam route's `start`.
**Problem:** when a request times out client-side after the server has already applied it, the
recovery path re-issues `start` (when no bubbles exist) or `next-task` (when an advance was
pending). It is not established whether `start` on an already-started session re-plans the exam,
issues a second opening question, or affects the trial count, nor whether `next-task` can advance
twice. The 70-second client ceiling makes this race real on slow networks.
**Done means:** the server contract for a repeated `start`, `respond` and `next-task` after a
client timeout is verified and recorded in `01-API-ENABLEMENT-AND-CONTRACT.md`, and the client's
recovery is tested against that contract (no duplicated question, no double advance, no
double-counted exam).

---

## B. Owner decisions — DECIDED 2026-09-11 (Piotr). Implement as stated; do not re-litigate.

### 4. The trial exam counter stays on Home
**Decision:** Home shows the trial user how many of the 3 trial exams remain (or are used). The
June figure used a monthly count that did not match the lifetime 3-exam trial, so the display
must reflect the real gate: 3 exams **or** 7 days from signup, whichever comes first, as enforced
by `POST /api/session` create. Paid and Tester accounts show no counter.
**Done means:** a trial user can always see, on Home, how much trial is left, and the number agrees
with what the server will actually allow next.

### 5. Analytics is on after onboarding, with opt-out in Settings
**Decision:** restore the June behaviour: completing onboarding (which contains the consent
flow) enables product analytics; the Settings "Usage analytics" switch is the opt-out and must
keep working exactly as now (revocation drops buffered events and stops sending).
**Done means:** a freshly onboarded account emits the client funnel events; toggling the switch
off stops them and survives restart.

### 6. Crash reporting runs anonymously, always on, decoupled from the analytics consent
**Decision:** crash reporting is not gated by the analytics switch. It is always on, anonymous
(no user id, no email, no exam content, no transcripts, no tokens), and must cover startup and
native crashes (see A.2). The Settings analytics switch no longer affects it.
**Done means:** a crash on the first frame after launch, with analytics off, is captured with a
useful message and stack and without any identifying or exam data; the anonymous posture is
written into `07-TELEMETRY.md` so the App Privacy label at M6 can be authored from it.

---

## C. Weaknesses to resolve (not blocking the device build, but before TestFlight)

### 7. An examiner turn that arrives while the app is suspended is never heard
When the response to a student answer arrives while the app is backgrounded, the controller is
suspended and the utterance is dropped by design. On return the student sees new examiner text
with voice on and hears nothing, with no affordance to hear it. Intentional and tested, but a gap.
**Done means:** after returning to the foreground, the student is not left with unspoken examiner
text without a clear way to hear it.

### 8. Voice-metric samples can be polluted by non-pipeline events
Re-speaking the last examiner bubble on voice toggle, and speaking the restored question on
resume, use the current response id. A replay can therefore be recorded as a T3 continuation
sample, and a resume as a T2 sample, during the Phase 5 baseline.
**Done means:** only genuine first-utterance and continuation transitions of a fresh examiner
response produce T2/T3 samples; replays and resumes are either excluded or labelled.

### 9. A contract test asserts a server shape that does not exist
`api.test.ts` ("prefers the reason code used by trial paywalls") mocks
`{ error: 'Forbidden', reason: 'trial_expired' }`. The session route returns `{ error: reason }`
and no `reason` field. The client code is fine either way; the test documents a false contract.
**Done means:** contract tests use the shapes the server actually emits (ideally a fixture derived
from, or shared with, the route code) so a future server change breaks the right test.

### 10. Live interim speech is no longer shown in the listening bar
The listening bar now always shows "Listening — speak your answer"; interim text only appears
merged into the draft field. Decide whether that is sufficient feedback while speaking, especially
with the keyboard closed and the field partially scrolled.

### 11. In-app legal links target the Vercel hostname
Terms and Privacy open `${config.apiUrl}/terms` and `/privacy`, i.e. the
`aviation-oral-exam-companion.vercel.app` URL, not the canonical `heydpe.com` domain used by auth.
Confirm which hostname should be user-visible and use it consistently.

### 12. Build-time Sentry plugin without upload configuration
`@sentry/react-native/expo` is in `app.json` and Metro uses the Sentry config, but no org/project
is configured and the handoff says local upload was disabled. Confirm that `eas build --profile
preview` succeeds both with and without `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`
present, and that a missing token never silently produces a build without source maps at
release time.

### 13. Patch-version drift is already visible
`expo-doctor` now fails one check (SDK 57 patch versions published after the upgrade). Not a
defect, but decide a cadence: when is the SDK-pinned set refreshed, and is doctor a CI gate?

---

## D. Observations that need no action (recorded so they are not re-litigated)

- `origin/main` was merged rather than rebased; history intact. Fine.
- The tier API now returns `hasPaidOverride` (one extra query per call, additive). Accepted.
- Root `tsconfig.json` / `vitest.config.ts` exclude `apps/mobile`. Accepted.
- Root `AGENTS.md` model names corrected. Accepted.
- The Maestro graded-exam flow requires an authenticated account with current access; that is
  a Phase 3/4.5 owner input (tester override), not a code gap.
- The untracked handoff document is committed alongside this file as `12-FABLE-5.1-DEVELOPMENT-HANDOFF.md`.

## Suggested order for the next session

A.1 → A.3 → A.2 + B.6 together → B.5 → B.4 → C.8 → C.9 → C.7 → the rest. Each as its own PR with tests. Do not start Phase 5 measurement work until
A.1 and A.3 are merged.
