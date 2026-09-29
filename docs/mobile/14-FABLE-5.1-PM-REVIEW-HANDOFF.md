# 14 — PR #60 review remediation: handoff to Fable 5.1

Date: 2026-09-11. Owner: Piotr. PM/reviewer: Fable 5.1. Engineer: GPT-6 Astra via Codex.

## Outcome and acceptance boundary

The code changes requested in [the PM review](13-PM-REVIEW-PR60-FOR-ASTRA.md) are
prepared in **11 small draft PRs against `main`**, each with relevant tests. All
11 passed web CI, mobile CI, and Vercel preview checks at the heads listed below.
The combined implementation passes 1,489 root tests and 122 mobile tests, and
the refreshed SDK 57 native iOS simulator build succeeds.

**This is a review handoff, not physical-device or TestFlight acceptance.** The
receipt migration has not been applied to hosted Supabase. No signed preview,
real Sentry ingestion/source-map upload, physical voice test, or new graded
exam against a currently entitled account was completed in this session.
No remediation PR was merged and no production deployment was performed.

This document and the new September 11 section in the progress tracker supersede
the status in [handoff 12](12-FABLE-5.1-DEVELOPMENT-HANDOFF.md). PR #60 is already
merged; the older tracker text saying it is unmerged is historical.

## Review inventory

Base: `main` and `origin/main` at `31473e5cf71cf8e77abfb94a760cfdf659279f14`.
Local combined code: `review/mobile-pr60-remediation` at `9e7f3a0` before this
documentation commit. That branch is a local integration reference only; review
and merge the focused PRs, not a combined replacement PR.

Checks below were verified on September 11 after the last recovery follow-up.
Each row is a draft with all four reported checks successful: `test`, `mobile`,
`Vercel`, and `Vercel Preview Comments`.

| PR | PM item | Branch | Verified head | Resulting behavior |
|---|---|---|---|---|
| [#62](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/62) | A.1 | `fix/mobile-pcm-format` | `0715ef9` | Normalizes hardware PCM to the advertised 16 kHz mono stream. |
| [#63](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/63) | A.3 | `fix/mobile-safe-exam-recovery` | `b8baa37` | Durable server receipts and read-only timeout recovery. Includes migration. |
| [#64](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/64) | A.2 + B.6 | `fix/mobile-anonymous-crashes` | `eae5027` | Early JS/native iOS crash capture, anonymous payload policy, independent of analytics. |
| [#65](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/65) | B.5 | `fix/mobile-onboarding-analytics` | `10cc717` | Onboarding enables analytics; a stored explicit opt-out remains authoritative. |
| [#66](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/66) | B.4 | `fix/mobile-home-trial-status` | `6e62729` | Home uses the same lifetime count and signup window as session creation. |
| [#67](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/67) | C.7 + C.8 | `fix/mobile-voice-replay-metrics` | `b3430b9` | Explicit replay after suspension; replay/resume excluded from fresh-response timing. |
| [#68](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/68) | C.10 | `fix/mobile-live-interim` | `4d35c72` | Listening bar displays live interim speech independently of the draft field. |
| [#69](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/69) | C.9 | `test/mobile-trial-contract` | `35bb3cf` | Client/server tests share actual trial-error response fixtures. |
| [#70](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/70) | C.11 | `fix/mobile-canonical-legal-links` | `3d7ceb3` | User-visible legal links use `https://heydpe.com`, independently of API host. |
| [#71](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/71) | C.12 | `fix/mobile-sentry-build-gate` | `8fc1e96` | Release builds fail if mandatory crash/upload configuration is missing. |
| [#72](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/72) | C.13 | `chore/mobile-sdk57-patches` | `c4b1a62` | SDK 57 patch refresh, pinned Doctor, compatibility checks in CI. |

## Decisions and implementation details to review

### A.1 — PCM format is a capture concern

`apps/mobile/src/lib/pcm-normalizer.ts` downmixes interleaved int16 channels and
uses a streaming windowed-sinc low-pass resampler. Filter state survives buffer
boundaries; finalization flushes the tail. `stt-capture.ts` sends normalized
16 kHz mono PCM to the Deepgram session that advertises that format.

Tests cover 44.1/48 kHz, 8 kHz input, multichannel input, buffer partitioning,
alias suppression, and a 48 kHz stereo capture/finalization path. Invalid metadata
produces the fixed `stt_pcm_invalid` diagnostic rather than blaming the student.
Actual iPhone input formats, CPU cost, and transcription quality remain device tests.

### A.3 — recover the original result without executing the action again

The source audit confirmed that unkeyed `start`, `respond`, and `next-task` are
all non-idempotent. `start` re-plans and inserts another opening turn; it does
not itself increment trial usage. Session creation owns that count. Transcript
visibility alone does not establish that the engine finished its later writes.

The complete contract is recorded in the September 11 section of
[01-API-ENABLEMENT-AND-CONTRACT.md](01-API-ENABLEMENT-AND-CONTRACT.md).

- The client journals an opaque operation UUID/action per session before sending
  `Idempotency-Key`. It does not put answers or transcripts in this journal.
- The server claims a durable receipt before executing a keyed JSON action.
  Repeated completed requests return the original HTTP status/body. Changed
  payloads and concurrent pending mutations are rejected with 409.
- `GET /api/exam/operation` reads an owner-scoped receipt. Recovery uses it rather
  than resending the timed-out mutation. A recovered `respond` may initiate its
  first `next-task`; a recovered `next-task` cannot advance again.
- The last follow-up retains the local receipt key until supporting session
  reads succeed. It restores the exact received examiner text if transcript
  reads do not yet include it, then acknowledges the journal entry. A failed
  restoration read cannot discard the only recovery reference.
- Unknown session-creation outcomes use the resumable-session lookup. Recovery
  does not automatically create another exam.

**Operational limit:** this is at-most-once execution for keyed requests, not a
transaction around the whole exam engine. A 5xx/process death may follow partial
writes; the receipt stays pending and the student remains paused. There is no
lease timeout that silently authorizes another mutation. Do not clear a pending
receipt without investigating the associated engine/session state. Existing
unkeyed web/SSE clients retain their previous behavior and do not join this lock.

The new table contains private examiner output like session transcripts. Owner
reads use RLS; authenticated clients have no write grants. Session/account
deletion cascades to receipts.

### A.2/B.6 — crash reporting is independent of usage analytics

`apps/mobile/index.js` loads crash reporting before Expo Router imports. The root
has Sentry wrapping and an error boundary. A custom Expo plugin installs native
iOS Sentry initialization and its scrubber in AppDelegate before React Native
starts; JavaScript does not replace that native configuration.

Fixed developer-owned diagnostics survive scrubbing, including connection
timeouts, Keychain failure, safe HTTP status messages, and voice-stage errors.
Unknown dynamic text is replaced. Safe stack/symbolication information survives;
identity, exam content, request data, automatic breadcrumbs, attachments,
screenshots, replay, and performance sessions are excluded.

The authoritative policy is the **new top section** of
[07-TELEMETRY.md](07-TELEMETRY.md). Older diagrams/config examples below that
section describe a superseded design. The owner should review real release
envelopes and the Sentry project IP-retention setting before M6 privacy forms.
`sendDefaultPii: false` alone does not prevent processor-side IP retention.

Android JS sanitization is present, but native Android reporting is disabled
until its equivalent early native privacy integration exists. That remains an
Android release blocker under the approved iOS-first sequence.

Unit and native compilation evidence does **not** prove a first-frame TestFlight
crash reaches Sentry with analytics off. That acceptance test remains open.

### B.4/B.5 — implement the recorded owner decisions

`src/lib/trial-access.ts` is shared by session creation and the additive
`GET /api/user/tier` trial payload. It counts all lifetime non-onboarding exams,
including abandoned ones, and applies the signup-based seven-day window. Home
shows the remaining balance/window and no counter for Paid or Tester accounts.
The countdown starts from server time, avoiding a simple device-clock offset.

The shared gate also preserves the owner's existing D5 rule that a live Stripe
subscription takes precedence over a stale free-tier cache, even after three
exams. Stored tier enums were not changed. On an older server without the new
payload, Home reports unavailable status instead of inventing a monthly balance.

Both onboarding completion paths enable analytics before emitting completion.
An explicit persisted Settings opt-out wins across startup and onboarding races;
revocation still drops buffered events. Crash reporting has no dependency on
that toggle. Tests cover these transitions; actual PostHog ingestion still needs
a configured release/account run.

### C.7–C.11 — foreground recovery, metrics, feedback, and contracts

- Practice offers **Listen to last examiner turn** after suspension. It does not
  auto-speak on foreground. The control replays the last examiner bubble; it
  does not reconstruct a full multi-bubble feedback/question sequence.
- Voice utterances carry `fresh`, `replay`, or `resume` provenance. Only fresh
  response transitions emit T2/T3 and first-playback/E2E samples. Cancellation
  clears continuation timing so an old playback cannot contaminate the next one.
- The listening bar displays live interim text, independently of the editable
  answer draft. Tests retain typed prefixes and final/interim behavior.
- [Trial-error fixtures](testing/contracts/session-trial-errors.json) are shared
  with the server response builder and client tests. They use `{error: reason}`
  and the real upgrade/limit/window fields, not the nonexistent `Forbidden`
  plus separate `reason` shape.
- Terms and Privacy use the canonical public domain even when API configuration
  points elsewhere. The public [Terms](https://heydpe.com/terms) and
  [Privacy](https://heydpe.com/privacy) pages were checked; no legal text changed.

### C.12/C.13 — release build policy and SDK maintenance

Preview/production require the mobile Sentry DSN, organization, and project at
Expo config resolution. `eas-build-post-install` requires the secret upload token
on the EAS worker. Release builds reject upload-disable and allow-failure bypasses.
The token is never a public Expo variable or plugin argument.

There is a deliberate resolution of C.12's wording: **a release build missing
mandatory Sentry configuration fails clearly**; it is not expected to succeed
without source maps. Credential-free development/simulator smoke remains allowed.
See [build-policy evidence](testing/2026-09-11-build-policy.md).

Synthetic config checks passed for configured release and missing-setting
failures. `eas whoami` still reports **Not logged in**. No real signed
`eas build --profile preview`, authenticated upload, or symbolication was run.

Expo is refreshed to `57.0.22` with its SDK-matched patch set; React Native stays
`0.86.3`. Expo Doctor is pinned to `1.20.4`. CI now requires both package
compatibility and Doctor. Refresh weekly and before each device/TestFlight build;
see [SDK maintenance](testing/sdk-maintenance.md). No Phase 5 TTS/prefetch/SSE
optimization was added.

## Validation evidence

| Check | Result and scope |
|---|---|
| Root Vitest | **1,489 passed / 84 files** on combined changes. |
| Mobile Vitest | **122 passed / 13 files**, including final receipt acknowledgment and Android privacy guard. |
| Static checks | Root/mobile typecheck, mobile lint, and `git diff --check` passed. |
| Clean dependency install | Mobile `npm ci` with npm 10 passed; lockfile reproduced. |
| Expo compatibility | `expo install --check` passed; Doctor **21/21** passed. |
| Migration exercise | Actual migration applied to an isolated local PostgreSQL 14 cluster. Pending uniqueness, owner-only reads, denied client writes, completion unlock, and deletion cascade passed. Cluster stopped. |
| iOS native build | Final SDK patch set: Xcode Debug generic iOS simulator **BUILD SUCCEEDED**, unsigned, upload disabled. Confirms generated Swift/native compilation. |
| Release JS export | Final iOS production JS/source-map export passed. Scanned all **75 output files**: **0 configured development login credential matches**. This is not a signed native Release build. |
| Remote PR checks | #62–#72: web/mobile CI and Vercel preview checks all successful at the listed heads. Preview success does not apply the database migration or prove native behavior. |

Re-run the appropriate checks after merging overlapping PRs. No fresh simulator
UI/graded-exam run, physical-device run, or hosted timeout experiment was claimed
for this remediation session. The September 10 UI evidence remains historical.

Local evidence is ephemeral; GitHub checks and committed tests are the durable
reference. Useful files on this machine:

- `/private/tmp/heydpe-pm-root-tests.log`
- `/private/tmp/heydpe-pm-final-mobile-tests.log`
- `/private/tmp/heydpe-pm-mobile-ci-install.log`
- `/private/tmp/heydpe-pm-final-prebuild.log`
- `/private/tmp/heydpe-pm-final-build.log`
- `/private/tmp/heydpe-pm-final-export.log`
- `/private/tmp/heydpe-pm-review-build/Build/Products/Debug-iphonesimulator/HeyDPE.app`
- `/private/tmp/heydpe-receipt-db-l9abozpg/` (local SQL exercise and server log)
- `apps/mobile/dist/pm-review-smoke/` (ignored export output)

## Fable's next actions and rollout order

1. Review A.1 (#62), then A.3 (#63), then A.2/B.6 (#64). These are the PM's
   blockers before the first physical-device build. The branch tests are evidence
   for code review; they do not close the later device acceptance tests.
2. Continue with #65, #66, #67, then #68–#72. The PRs target the same main base,
   so resolve overlap carefully: onboarding imports in #63/#65, appended voice
   tests in #67/#68, and package scripts in #71/#72. Preserve both sides' behavior
   and tests. The local integration branch contains tested resolutions for reference.
3. Before shipping the updated client, apply
   `supabase/migrations/20260911000001_exam_operation_receipts.sql` through the
   normal reviewed database workflow, then deploy the matching API. Verify
   authenticated ownership and all three timeout recoveries in the target
   environment before releasing the mobile binary. The migration is additive;
   rolling back the server/client need not drop receipt data. Do not release the
   keyed client against an API without its receipt support.
4. Verify Home against trial accounts at the count/window boundaries, a live
   subscription with stale tier cache, and a real paid-equivalent Tester override.
   Verify onboarding funnel delivery and persisted opt-out with real PostHog.
5. Obtain an authenticated EAS session/project, Apple signing/App Store Connect
   setup, the mobile Sentry DSN/project/upload token, and two test iPhones under
   [10-TEST-READINESS-PLAN.md](10-TEST-READINESS-PLAN.md). A currently entitled QA
   account is still needed for the graded Maestro flow. No entitlement override
   was granted during this work; the prior ordinary QA account had an expired trial.
6. Run a signed preview with source-map/dSYM upload. With analytics off, trigger
   startup JS and native crashes, inspect cached/sent/ingested envelopes, and
   confirm useful symbolication without identity or exam content. Confirm the
   Sentry IP-retention setting and owner approval of the documented privacy posture.
7. Execute [11-TESTFLIGHT-TEST-SCRIPT.md](11-TESTFLIGHT-TEST-SCRIPT.md), including
   real input formats, foreground replay, interruption handling, and trial/recovery
   paths. Record device/build IDs and measured outcomes. Only then evaluate the
   approved Phase 5 thresholds; sentence-level TTS, prefetch, and SSE stay conditional.

Do not infer GO from a passing simulator compile, mocked Sentry transport, a
synthetic upload preflight, or source-level receipt tests. The remaining work is
environment/device validation and PM review, followed by any fixes those reveal.

## Continuity

The Obsidian session log is
`HeyDPE - Build Report/2026-09-11 - PR60 PM Review Remediation.md` in the owner's
HeyDPE vault. It records this session, review branches, verification, and open
gates. No owner product decision in section B was changed.
