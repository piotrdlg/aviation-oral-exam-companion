# Mobile Test Evidence

No physical-device or TestFlight evidence has been recorded for the September SDK 57 build yet.

For each finding record: build/commit, device/OS, network/audio route, steps, expected result, actual result, severity, and retest outcome. Keep authentication tokens, private transcripts, and personal details out of committed artifacts.

The scripted flow in `apps/mobile/.maestro/exam-smoke.yaml` requires an already authenticated ordinary QA account with no open exam. It does not claim to automate OTP provisioning or store-signing. Run it on a release simulator build; run the separate manual TestFlight script against the real store-signed build.
