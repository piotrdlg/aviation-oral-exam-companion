# 15 — Owner checklist: from merged code to testing on your iPhone

> For Piotr. Written 2026-09-11 by the PM after PRs #59 to #72 were merged to `main`.
> Every step below is something only the account owner can do, or a command you run on your
> Mac. Steps are in dependency order. Estimated hands-on time: **about 2 hours of setup**,
> then a build wait, then testing. Where a step needs a value written back into the repo, the
> PM or engineer does that from your message.

Where things stand: the web app on `main` is deployed. The mobile app builds and runs in the
simulator with the SDK 57 stack, native Sign in with Apple, always-on anonymous crash
reporting, the trial counter, the receipt-based recovery, and the voice pipeline. Nothing has
run on a physical iPhone yet. The receipt table is live in production.

---

## Part A — Accounts and services (one time)

### A1. Apple Developer: app identifier — DONE (found 2026-09-11)
The App ID `com.heydpe.app` ("HeyDPE") already existed under team `45K5W4N8DG` with Sign In with Apple enabled. The code now uses it. The updated Program License Agreement was accepted the same day.

### A2. App Store Connect: app record — DONE (created 2026-09-11)
App `HeyDPE`, iOS, English (U.S.), bundle `com.heydpe.app`, SKU `heydpe-ios`, Apple ID **6811163760** (now in `apps/mobile/eas.json` as `ascAppId`). The updated App Store Connect Terms of Service were accepted the same day.

### A3. Supabase — DONE 2026-09-11
Apple provider Client IDs are `com.heydpe.auth,com.heydpe.app`; the Apple OAuth secret was rotated (valid to 2027-03-10; re-arm the reminders); `heydpe://auth-callback` is in the redirect allow-list.

#### (original steps, kept for reference)
1. https://supabase.com/dashboard/project/pvuiwwqsumoqjepukjhz/auth/providers → Apple.
2. **Client IDs** currently `com.heydpe.auth`. Change to `com.heydpe.auth,com.heydpe.app`. Save. (The Services-ID secret stays as is; web login is unaffected.)
3. Authentication → URL Configuration → Redirect URLs: confirm `heydpe://auth-callback` is listed. Add it if missing.

### A4. EAS — account and project DONE 2026-09-11; signing still open
Expo account `@piotrdlg`; EAS project `heydpe`, ID `bdc9dc70-140c-451b-9e32-ce010af65545`, linked in `app.json`. Signing (`eas credentials` or the first `eas build`) still needs your Apple ID login in the terminal.

#### (original steps, kept for reference)
From your Mac, in `apps/mobile`:
```sh
npx eas-cli login
npx eas-cli init          # links the Imagine Flying EAS project; writes extra.eas.projectId into app.json
npx eas-cli credentials   # iOS → development profile → let EAS manage the certificate and provisioning profile
npx eas-cli credentials   # iOS → preview profile (App Store distribution) → let EAS manage
```
Commit the `app.json` change (`extra.eas.projectId`) or send me the project ID and I will.

### A5. Register the two test iPhones
```sh
npx eas-cli device:create
```
Choose "Website", open the generated link on **each** iPhone in Safari, install the profile (Settings → Profile Downloaded → Install). Use one recent iPhone and one that is 3 to 4 years old. Re-run `npx eas-cli credentials` for the development profile afterwards so the new devices are included.

### A6. Sentry — project DONE 2026-09-11; token still open
Project `heydpe-ios` in org `imagine-flying-llc`, IP-address prevention enabled, DSN stored in EAS for preview and production. Still needed: the organization auth token stored as the EAS secret `SENTRY_AUTH_TOKEN` (you create and paste it; hidden input).

#### (original steps, kept for reference)
1. In the existing Sentry org → Projects → Create Project → platform **React Native** → name `heydpe-ios`.
2. Copy the **DSN** (Settings → Projects → heydpe-ios → Client Keys).
3. Settings → Projects → heydpe-ios → Security & Privacy → enable **Prevent Storing of IP Addresses**.
4. Settings → Auth Tokens (organization) → create a token with scopes `project:releases`, `project:read`, `org:read`. Copy it once.
5. Store all four values in EAS, **never in the repo**. From `apps/mobile`:
```sh
npx eas-cli env:create --scope project --environment preview --name EXPO_PUBLIC_SENTRY_DSN --value "<dsn>" --visibility plaintext
npx eas-cli env:create --scope project --environment preview --name SENTRY_ORG --value "<org-slug>" --visibility plaintext
npx eas-cli env:create --scope project --environment preview --name SENTRY_PROJECT --value "heydpe-ios" --visibility plaintext
npx eas-cli env:create --scope project --environment preview --name SENTRY_AUTH_TOKEN --value "<token>" --visibility secret
```
Repeat the four for `--environment production`. Release builds fail on purpose if any of these is missing (decision recorded in PR #71).

### A7. PostHog and public config in EAS — DONE 2026-09-11
Stored for preview and production: Supabase URL and anon key, API URL, PostHog key and host, Sentry DSN, org and project.

#### (original steps, kept for reference)
For `preview` and `production` environments, also create:
```
EXPO_PUBLIC_SUPABASE_URL=https://pvuiwwqsumoqjepukjhz.supabase.co   (plaintext)
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>                            (plaintext; it is client-safe)
EXPO_PUBLIC_API_URL=https://aviation-oral-exam-companion.vercel.app (plaintext)
EXPO_PUBLIC_POSTHOG_KEY=<the existing PostHog project key>          (plaintext)
```
Do **not** create any `EXPO_PUBLIC_DEV_*` variable in these environments; the build rejects them.

### A8. Test accounts and the Tester override
1. You will use your own account (`pd@imagineflying.com`) as the main tester. Create **one fresh ordinary account** with a new email for trial-gate tests; leave it without any override.
2. After your first sign-in on the device (Part B), open the web admin → Users → your account → Entitlement overrides → grant **`paid_equivalent`**, reason `TestFlight tester`, expiry = end of the testing window. This is what unlocks unlimited exams and shows "Tester" in the app. The ordinary account keeps the 3-exam / 7-day trial.

### A9. App Store Connect testers
Users and Access → **+** → add each tester's Apple ID with role **App Manager** (or Developer) and access to HeyDPE. Then TestFlight → Internal Testing → create group `HeyDPE Internal` and add them. (You are already eligible as the account holder.)

---

## Part B — First build on your iPhone (development client)

This is the fastest way to see the app on a device. It needs A1, A4 and A5. It does **not** need Sentry or PostHog.

1. Build in the cloud and install:
```sh
cd apps/mobile
npx eas-cli build --profile development --platform ios
```
When it finishes, open the build link on the iPhone and tap Install.
2. Start the JavaScript server on your Mac (same Wi-Fi as the phone):
```sh
npx expo start --dev-client
```
Open HeyDPE on the phone; it connects to the server (use `--tunnel` if the network blocks it).
3. Smoke test, in this order, and note anything odd:
   - **Sign in with Apple** (needs A3). Then force-quit and reopen: still signed in.
   - Onboarding, both consents, then a **text exam**: two exchanges, End exam, results shown.
   - **Voice**: toggle voice on, the examiner speaks; tap the mic, answer, tap Send. Check that the examiner never talks over your open mic and that your spoken words appear in the answer field.
   - Background the app mid-exam and return; take a phone call mid-exam; both must leave the mic closed and the app recoverable.
   - Grant yourself the Tester override (A8.2) and confirm Home shows **Tester** and no trial counter; the ordinary account shows the counter.
4. Send me: iPhone model, iOS version, and what you saw. The engineer fixes anything found before the TestFlight build.

---

## Part C — TestFlight build

Needs everything in Part A. A `preview` build is store-signed and can only be installed through TestFlight.

1. Build and submit:
```sh
cd apps/mobile
npx eas-cli build --profile preview --platform ios
npx eas-cli submit --platform ios --profile preview --latest
```
2. In App Store Connect → TestFlight, wait for processing (10 to 30 minutes), answer the export-compliance prompt if it appears (the app declares non-exempt encryption = false), then add the build to `HeyDPE Internal`.
3. On both iPhones: install the **TestFlight** app, accept the invite, install HeyDPE.
4. Run `docs/mobile/11-TESTFLIGHT-TEST-SCRIPT.md` (30 minutes) on both devices. Turn **Usage analytics on** in Settings for your test account first; the voice-timing samples travel with analytics, and the preview build has them enabled.
5. Report through TestFlight's screenshot feedback plus a short note per finding: steps, expected, actual, device, iOS, build number, Wi-Fi or cellular, speaker or headphones.

I will pull the voice samples from PostHog, produce the T1 to T4 tables, and write the GO / NO-GO with the engineer.

---

## What is still deliberately open

- Purchases are unavailable in test builds (RevenueCat is a later milestone).
- Crash reporting always runs; a first-frame crash reaching Sentry from the TestFlight build is a test I will ask the engineer to make triggerable in preview builds.
- If an exam ever shows "Check saved progress" and never recovers, start a new exam and tell me the time; that state is intentionally frozen for investigation, and the engineer is adding an operator path for it.
