# TestFlight Internal Test Script

Status: prepared; not yet executed on a TestFlight build.

## Before Testing

Record the build number, iPhone model, iOS version, network, and audio route. Use a recent iPhone and one 3-4 years old. Install the same store-signed `preview` build on both. Internal testers must have App Store Connect access to HeyDPE.

Sign in once, then have the administrator grant your real account a `paid_equivalent` override with an expiry for the testing window. Keep separate ordinary accounts for trial/quota checks. Never put passwords, tokens, transcripts, or personal information in a bug report.

## Thirty-Minute Core Test

1. **Install and sign in (5 minutes).** Clean install; use native Apple sign-in. Repeat sign-in and force-quit/reopen. Confirm that the account persists. Repeat Google, Microsoft, and email OTP on the second pass. Cancel each external sign-in once and verify the screen recovers.
2. **Onboard (3 minutes).** Confirm rating and aircraft class, then accept AI processing and FAA disclaimer separately. Try both Skip/full configuration and Explore with a fresh test account. Neither path may bypass the consent gates. Usage analytics must remain off until explicitly enabled in Settings.
3. **Practice (10 minutes).** Run at least five exchanges. Verify feedback finishes before the next question. Type a prefix, add speech, stop the mic, edit the answer, and send. Repeat Send while speaking, especially with words at the end. Say the same phrase twice; both occurrences must survive. Test a response longer than 2,000 characters.
4. **Interrupt (5 minutes).** Background, open Control Center, switch tabs, lock/unlock, disconnect headphones, and take a phone call. Audio must stop, the microphone indicator must clear, and recognized draft text must remain. Return to Practice and resume by explicit action. Tap the mic during examiner speech and check for examiner words in the transcript.
5. **Complete and resume (4 minutes).** End an exam and inspect its result, counts, and weak areas. Visit Progress and Home; both must refresh. Start another exam, force-quit, reopen, and confirm the pending element and assessment badges survive.
6. **Settings and failures (3 minutes).** Sign out/in; toggle analytics; deny microphone permission and reopen Settings. Toggle airplane mode with a draft, then reconnect and retry. With an ordinary account, verify trial and quota screens. With a second device on the same account, verify the reclaim action.

Account deletion is a separate destructive test using a disposable account only. Verify the typed DELETE confirmation, failure handling, and subsequent sign-in behavior.

## Voice Gate

Follow the measurement definitions in `10-TEST-READINESS-PLAN.md` Phase 5. Enable `EXPO_PUBLIC_VOICE_METRICS=true` for preview builds and opt in to diagnostics only on test accounts that agree to it.

| Metric | Threshold | Required Evidence |
| --- | --- | --- |
| T1: PCM RMS speech onset to first transcript | <800 ms | 10 samples/device; median and at least 8/10 pass |
| T2: first utterance enqueue to actual playing status | <1,500 ms | 10 samples/device, including long turns |
| T3 feedback/question and split boundaries | <120 ms | Separate tables for both boundary types |
| T4: examiner speech in student transcript | Zero | Speaker and barge-in tests |
| Lifecycle | Mic closed, playback stopped, recoverable | Every interruption on both devices |

E2E is recorded separately with Send-to-finalize, finalize-to-response, and response-to-playing attribution. It does not replace T2. SSE is considered only for generation-dominated E2E delay. Do not call the voice gate GO until actual device evidence exists.

## Reporting

Use TestFlight's screenshot feedback for the tested build. Include steps, expected/actual behavior, device, iOS, build, network, and audio route. Record findings in `docs/mobile/testing/`; omit credentials and exam content. Match any Sentry crash to its release/build and verify that consent-off accounts emit no diagnostics.

## Release Gate

All device checks and voice thresholds must pass on both devices before inviting the broader internal group. IAP, production App Store review, and Android release remain separate gates in the master plan.
