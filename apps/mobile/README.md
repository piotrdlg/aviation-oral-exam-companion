# HeyDPE Mobile

Native Expo SDK 57 / React Native 0.86 app using the existing HeyDPE API. Run all commands below from `apps/mobile`.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run ios
```

Configure the public API and Supabase values listed in `.env.example`. Use a native development build. SDK/native dependency changes require rebuilding the client.

## Release Profiles

- `development`: native development client, internal device distribution.
- `smoke`: release JavaScript in a simulator build for local Maestro testing.
- `preview`: store-signed build for TestFlight, automatic build-number increment.
- `production`: store-signed release, separate environment.

Before cloud builds, sign in with `npx eas-cli login`, link the real Imagine Flying project with `npx eas-cli init`, and set the EAS environment values. Set `ascAppId` in `eas.json` after creating the actual App Store Connect record. The Apple team ID is prefilled from the handoff; no project/app IDs or signing credentials are invented.

Release profiles reject nonempty `EXPO_PUBLIC_DEV_*` variables. Production credentials such as service-role keys, Sentry upload tokens, and Apple keys must never use the `EXPO_PUBLIC_` prefix. Use `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` at build time for source-map upload.

Native Apple sign-in requires the bundle ID `com.imagineflying.heydpe` in Supabase's Apple client IDs and the Apple App ID capability. Google/Microsoft PKCE requires `heydpe://auth-callback` in the redirect allowlist.

## Voice And Tests

`VoiceSession` serializes playback and capture. Student actions cancel queued speech. Graceful stop waits up to 1.5 seconds for final transcription; background/blur aborts immediately. No background audio is enabled in this testing milestone.

Tests cover controller races, the Deepgram protocol, speech accumulation, HTTP cancellation, exam payloads, secure session storage, and telemetry privacy. Device latency, echo, interruptions, native Apple sign-in, and crash ingestion require physical-device evidence. Follow `../../docs/mobile/11-TESTFLIGHT-TEST-SCRIPT.md`.

The Maestro flow starts from an authenticated test account. It has not replaced real sign-in or physical TestFlight validation.
