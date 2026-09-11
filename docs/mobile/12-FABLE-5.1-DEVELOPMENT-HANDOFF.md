---
date: 2026-09-11
type: development-handoff
author: Codex
recipient: Fable 5.1
tags: [heydpe, mobile, handoff]
status: awaiting-account-and-device-validation
---

# HeyDPE Mobile Development Handoff to Fable 5.1

## Executive Summary

Piotr requested that Codex take over the existing mobile implementation and
complete development, using `10-TEST-READINESS-PLAN.md` and
`IMPLEMENTATION-PROGRESS.md` as the handoff. Work performed September 10-11 moved
the app to Expo SDK 57, replaced the native voice coordination layer, hardened
authentication and exam recovery, added automated checks, and verified several
real simulator workflows.

**The app is not complete, TestFlight-ready, or approved for store submission.**
The source implementation and unsigned Debug simulator build are substantially
improved. Signed builds, successful graded native exam smoke, physical voice
validation, native Apple authentication proof, and crash ingestion remain open.
Payments, store submission, and Android follow the approved physical voice gate.

This report is a factual handoff, not a new scope approval. Read the repository
`AGENTS.md`, `apps/mobile/AGENTS.md`, and the approved readiness plan before edits.

## Repository and Review State

| Item | State at this handoff |
|---|---|
| Working branch | `feat/mobile-test-readiness` |
| Latest implementation commit | `761023d423bfc5d05a225e83fce4a8df89b14399` |
| Mobile PR | [#60](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/60), OPEN and DRAFT |
| Latest PR checks | Web CI, mobile CI, and Vercel preview all SUCCESS; rechecked for this report |
| Independent security PR | [#59](https://github.com/piotrdlg/aviation-oral-exam-companion/pull/59), prepared separately for credential-route removal |
| Production | No merge to main or production deployment performed by Codex |
| Local worktree | Clean before creating this report; this document is a new, uncommitted file |

The original `feat/mobile-m1-api-enablement` history was preserved. Current
`origin/main` was merged into the takeover branch, not rebased or force-pushed.
Pre-existing untracked/modified handoff, root AGENTS, and ops material was retained
and committed with the takeover documentation. Vercel previews did deploy as PR
checks; those are distinct from production main.

Key commits:

| Commit | Purpose |
|---|---|
| `2a3660a` | Remove staging credential login route |
| `bec0e88` | SDK 57 mobile implementation, voice rewrite, hardening, tests |
| `6b466d2` | Preserve handoff/ops documents and explicit release gates |
| `de215e1` | Merge current origin/main |
| `2213302` | Repair optional WASM peer entries for clean npm CI installs |
| `05b85a1` | Track Expo ambient types needed in clean checkouts |
| `761023d` | Native test selectors, login spacing, trial smoke, verification ledger |

## Changes Implemented

### Toolchain, Builds, and CI

- Upgraded mobile to Expo 57.0.21, React Native 0.86.3, React 19.2.3, with
  SDK-matched dependencies and rebuilt native iOS dependencies.
- Added native development-client, updates, asset, crypto, network-state, and
  Sentry integration. Replaced the stock app icon with an export of the existing
  HeyDPE brand asset; no unrelated visual redesign was attempted.
- Added mobile Vitest, TypeScript/lint scripts, and `.github/workflows/mobile.yml`.
  Root TypeScript and Vitest now exclude the independent mobile package.
- Fixed two real clean-CI failures: missing optional WASM peers in the npm 11
  lockfile output, and Expo types previously available only through ignored
  generated files. Lock repair used npm 10; `src/env.d.ts` is tracked.
- Added EAS `development`, `smoke`, `preview`, and `production` profiles.
  Preview is store distribution for TestFlight; smoke is release JS for simulator
  testing. Neither profile is proof that a signed build exists.
- Release configuration rejects nonempty `EXPO_PUBLIC_DEV_*` values and requires
  public Supabase settings. No EAS project ID, App Store Connect app ID, signing
  credential, or monitoring project was invented.

### Native Voice Pipeline

The old independent STT/TTS hooks were replaced with one coordinated pipeline:

| File under `apps/mobile/src/` | Responsibility |
|---|---|
| `lib/voice-session.ts` | Serialized playback/capture controller, cancellation epochs, state transitions |
| `lib/stt-capture.ts` | Per-attempt permission/token/socket/PCM lifecycle and graceful finalization |
| `lib/stt-parser.ts` | Deepgram Nova timing deduplication and Flux multi-turn accumulation |
| `lib/voice-text.ts` | Bounded, lossless TTS utterance splitting |
| `lib/voice-metrics.ts` | T1/T2/T3/E2E instrumentation |
| `hooks/use-voice-session.ts` | Native audio adapter and AppState/focus cleanup |

- Feedback and subsequent questions are queued in order instead of cutting one
  another off. Student actions cancel queued speech; capture and playback are
  coordinated to support half-duplex behavior.
- Late permission, token, socket, playback, and finalization callbacks cannot
  invalidate a newer attempt. Tests cover several cancellation/cleanup races.
- Graceful STT stop waits up to 1.5 seconds for trailing finals; background/blur
  aborts immediately. Typed prefixes and recognized interim text are retained.
- Long text is split into utterances capped at 2,000 characters rather than
  truncated. TTS has a 30-second fetch/body deadline and playback watchdog.
- Recording mode is restored after cleanup; background audio is not enabled.
- Timing hooks exist, but no physical-device latency or echo criterion is passed.
  Conditional sentence streaming/prefetch and generation streaming remain driven
  by measurements, not assumptions.

### Authentication, Consent, and Telemetry

- Implemented native Apple nonce authentication: hashed nonce to Apple, raw nonce
  to Supabase, cancellation handling, and first-name persistence when supplied.
  Native Apple sign-in itself was not exercised successfully on a device.
- Hardened OTP/OAuth error handling and auth-startup retry/race behavior.
- Strengthened secure storage with UTF-8-aware chunking. Release Keychain failure
  fails closed; only development builds may use the volatile memory fallback.
- Onboarding skip/explore cannot bypass the separate AI-processing and disclaimer
  consents. Onboarding no longer implicitly enables analytics.
- Added consent-gated Sentry initialization and restrictive event scrubbing.
  Fixed telemetry opt-out/initialization races. Real source-map upload, crash
  ingestion, and production analytics delivery remain unverified.
- Added actual Terms/Privacy links and visually verified their corrected spacing.

### Exam Workflow and Supporting Screens

- Integrated the new voice controller into Practice, with submission guards,
  trailing-transcript finalization, retained drafts, and bounded API requests.
- Preserved stored exam configuration and server-owned state during resume.
  Restored assessment placement from transcript rows and guarded against blindly
  resubmitting an answer that may already have committed after a network failure.
- Added offline display, 409 reclaim messaging, 503 retry behavior, and appropriate
  microphone permission recovery. The complete physical recovery matrix is open.
- Exam generation requests allow 70 seconds for the server's 60-second window;
  ordinary API requests retain a 20-second timeout.
- Added session-scoped results and Progress navigation. Natural completion no
  longer overwrites the server grade by re-completing as a user-ended exam.
- Added focus refresh for live Home/Progress data and a saved examiner-voice switch
  in Settings. Examiner style/theme remain display-only settings in this build.
- Corrected Tester display to use the actual paid-equivalent entitlement override,
  not the legacy `ground_school` enum. Stored billing tiers were not migrated.
- Purchase controls honestly report that purchases/subscription changes are
  unavailable. RevenueCat/IAP is not implemented or tested by this takeover.
- Added stable native IDs for answer, send, busy, and end controls, and Maestro
  flows for graded-exam smoke preparation and expired-trial navigation.

### Security and Documentation

- Removed the credential-bearing staging-auth route. The independent security
  branch lives at `/private/tmp/heydpe-staging-auth-fix`; PR #59 can be reviewed
  independently of the larger mobile PR. The removal is also included in #60.
- Removing a route does not remove old credentials from Git history. Owner review
  and rotation of the old helper credential remain advisable; no rotation occurred.
- Compatible dependency patches reduced the recorded mobile audit from 20
  findings, including 4 high, to 15 moderate and zero high/critical. Remaining
  chains include xcode/uuid and expo-router/query-string decoding. Do not force an
  SDK downgrade simply to silence the audit.
- Updated the implementation tracker, readiness execution notes, API contract,
  mobile README, evidence ledger, and physical TestFlight test script.

## Verification and Its Limits

| Check | Executed result |
|---|---|
| Root tests | 1,467 passed across 81 files |
| Mobile tests | 71 passed across 8 files |
| TypeScript | Root and mobile passed |
| Mobile lint | Passed |
| Expo compatibility / Doctor | Passed / 21 of 21 checks passed |
| Preview-profile iOS JS export | Passed, 1,762 modules |
| Export credential inspection | 74 files checked against both configured development credential values; zero matches |
| iOS prebuild / CocoaPods | Passed |
| Xcode Debug simulator build | Passed and installed; local Sentry upload disabled |
| PR #60 at `761023d` | Web CI, mobile CI, Vercel preview passed |
| Repository `trial-expired.yaml` | Passed on the Debug simulator |

These are results from the takeover session, not tests rerun while writing this
document. Git branch/status and PR #60 state/checks were rechecked for this report.

### What the Simulator Actually Proved

1. Login rendered correctly; the dedicated QA account authenticated through the
   existing development-only login path. No real-user OTP email was sent.
2. Separate AI/disclaimer consents were accepted and remained saved after a fresh
   QA sign-in. Home loaded live account data.
3. The QA account's old June exam restored its pending question.
4. An attempted text answer was blocked by `session_expired`: the modal showed
   **Trial window closed**. Dismissing it preserved the exact input draft.
5. Ending that empty QA session showed **Incomplete coverage**, zero scores, and
   refreshed Progress to show one completed session. Settings loaded live data.
6. A new exam attempt showed **Your free trial ended**. The reusable negative-path
   flow also passed independently and returned to Home.

**There was no successful graded native text exchange in this run.** The ordinary
QA account is expired. Do not present a correctly displayed paywall or zero-score
completion screen as proof of the full exam loop. No tester override was granted.

An uncontrolled host network interruption displayed the offline banner. Restart
and reauthentication restored connectivity; controlled reconnect without restart
still needs testing. Debug simulator playback observations are not T1-T4 evidence.

## Local Environment and Artifacts

- Simulator: iPhone 17 Pro, iOS 26.5, UDID
  `B18E97E6-B7EA-48D2-B094-9ED1875C1D81`; Xcode 26.5.
- Installed Debug app build:
  `/private/tmp/heydpe-sdk57-build/Build/Products/Debug-iphonesimulator/HeyDPE.app`.
- Native build log: `/private/tmp/heydpe-sdk57-build.log`.
- Screenshots: `apps/mobile/.screenshots/takeover-2026-09-10/` (gitignored).
- Navigation/trial artifacts:
  `/private/tmp/heydpe-maestro-resume-output/2026-09-11_010548`.
- Reusable trial-flow artifacts: `/private/tmp/heydpe-maestro-trial-output`.
- Maestro: `/private/tmp/heydpe-maestro/maestro/bin/maestro`, version 2.10.0.
  Homebrew failed its CLT check; the downloaded release ZIP was checksum-verified
  and extracted using the existing Java runtime. No CLT replacement was made.
- Production JS export: `apps/mobile/dist/ios-preview-final` (gitignored).
- Metro was left running on port 8085 at the end of implementation; verify that
  process before reuse. From `apps/mobile`, its working startup command is:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --port 8085
```

Default localhost resolved to an IPv6-only listener while native bundle URLs used
IPv4. Expo's floating developer button also intercepted onboarding taps; launching
the simulator app with `-EXDevMenuShowFloatingActionButton NO` resolved that issue.
iOS accessibility labels combine tab roles and input placeholders, so use the
verified selectors/IDs instead of assuming labels equal visible text.

The unsigned Debug client uses the development memory fallback when Keychain
entitlements are absent. Cold-launch persistence must be tested in a properly
signed build. Temporary paths and running processes are not durable release assets.

## Remaining Blockers and Next Actions

1. **Review the two draft PRs.** Keep security removal independently reviewable.
   Neither PR should be treated as permission to deploy production automatically.
2. **Obtain real build-account configuration.** EAS last reported Not logged in.
   Authenticate locally, link the intended EAS project, confirm App Store Connect
   app ID and signing, and register physical devices. Never put secrets in chat,
   Git, or `EXPO_PUBLIC_*` variables.
3. **Confirm native Apple/Supabase configuration.** Verify the App ID capability,
   bundle client ID, provider settings, and redirect allowlists. Existing team ID
   is `45K5W4N8DG`; bundle ID is `com.imagineflying.heydpe`.
4. **Identify an authorized current-access QA account.** Use the established
   admin-managed paid-equivalent Tester mechanism only with owner authorization.
   Keep the expired ordinary account for negative-path tests.
5. **Run signed-device and graded text smoke.** Verify real authentication,
   Keychain cold launch, fresh/resumed exam, assessment, next task, completion,
   results, and account isolation. Run the prepared release Maestro flow with its
   documented prerequisites; it is not yet accepted.
6. **Execute the mandatory voice gate on two physical iPhones.** Follow
   `11-TESTFLIGHT-TEST-SCRIPT.md` and the readiness plan for T1/T2/T3/T4, including
   split utterances, feedback-to-question transitions, echo, and lifecycle cases.
   No physical voice GO has been earned.
7. **Make latency changes from measurements.** Conditional prefetch/sentence
   streaming and generation streaming are not automatically required. The plan's
   corrected generation-streaming condition concerns generation-dominated E2E,
   not T2 alone. Preserve the approved decision gates.
8. **Configure and prove telemetry.** Sentry DSN/project/upload settings were not
   available. Verify source maps, real crash ingestion, consent/opt-out, and
   privacy-safe analytics with actual project configuration.
9. **Finish acceptance and downstream milestones.** Complete controlled offline,
   409/503, VoiceOver/Dynamic Type, and physical auth/device tests; actual
   TestFlight installation; then RevenueCat/IAP, store submission, and Android.

Source preparation beyond Phase 3 proceeded while account/device access was
unavailable. This was explicitly recorded as preparatory work, not acceptance of
later phases. Historical June completion claims do not certify the rewritten
September voice pipeline.

## Continuity References

- `docs/mobile/10-TEST-READINESS-PLAN.md`: approved scope, ordering, and gates.
- `docs/mobile/IMPLEMENTATION-PROGRESS.md`: current takeover section supersedes
  historical June status.
- `docs/mobile/testing/2026-09-10-takeover.md`: detailed evidence and exclusions;
  its CI table cites the earlier `05b85a1`, while this report records final green
  checks at `761023d`.
- `docs/mobile/11-TESTFLIGHT-TEST-SCRIPT.md`: physical acceptance procedure.
- `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md`: corrected API contract.
- Obsidian: [[HeyDPE]] and [[2026-09-10 - Mobile Development Takeover]]. The vault
  remains the mandatory continuity record; sync before deployment and session end.

No production deployment, purchase, account deletion, Apple key rotation, or
paid-equivalent entitlement grant was performed during this takeover.
