# M3 Voice Spike — Go / No-Go Gate

> **Status:** binding de-risking gate for the mobile build. **Owner sign-off required** on the SPIKE-REPORT (§7) before any production-voice milestone begins.
> **Read order:** This doc is the proof gate referenced throughout `docs/mobile/03-VOICE-PIPELINE.md` ("No claim in that doc is *done* until the spike measures it on a physical device"). Read `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` §A first — it defines the **Bearer transport** the spike rides on and the **server-side STT URL change** for native linear16 PCM. Read `docs/mobile/02-DESIGN-SYSTEM.md` only for the FLIGHT DECK typography rule applied to the spike's throwaway readout HUD (§5.5).
> **One-line purpose:** prove the React Native + Expo voice loop hits the latency/quality budget on real hardware **before** we commit the production RN build — and define the exact rule under which we instead escalate to a Flutter comparison.

---

## 0. Why this gate exists (and what it is NOT)

The locked framework decision (Owner decision D5) is **React Native + Expo (dev-client, New Architecture)**. That decision is **not** re-litigated here. What is genuinely unproven — and what has historically killed voice products on RN — is the **native real-time audio loop**: streaming raw 16 kHz PCM out of the mic into a WebSocket while simultaneously playing examiner TTS through the speaker, on a phone, with the OS audio session arbitrating both, fast enough to feel like a conversation, without the examiner hearing itself.

None of that is provable from a simulator (OS Acoustic Echo Cancellation is **non-functional on the iOS Simulator / Android emulator** — `docs/mobile/03-VOICE-PIPELINE.md:235`), from the web stack (which uses `MediaRecorder`→Opus/WebM and `HTMLAudioElement`, both browser-only — `src/hooks/useDeepgramSTT.ts:171-188`, `src/hooks/useVoiceProvider.ts:172-227`), or from library README claims (the leading native-capture modules carry explicit **VERIFY-AT-SUBMISSION** flags — §9). So we build a **throwaway** Expo dev-client app, measure four things on physical devices, and let the numbers decide.

**This spike is:** a measurement instrument. Ugly is fine. Hardcoded is fine. One screen is fine.

**This spike is NOT:** the production voice feature, a place to design UI, or code we keep. The only artifacts that survive are (a) the SPIKE-REPORT, (b) the confirmed module + version choices, and (c) a short list of code snippets worth lifting (§7.4). Everything else is deleted with the directory.

### 0.1 The four things this spike must prove (verbatim scope)

| # | Claim under test | Headline threshold | Maps to prod threshold |
|---|------------------|--------------------|------------------------|
| **S1** | Mic → linear16 PCM 16 kHz → Deepgram WS yields a **live interim transcript** | **capture → first interim < 800 ms** | T1 (`03-VOICE-PIPELINE.md:308`) |
| **S2** | `/api/tts` mp3 → `expo-audio` plays with measured **time-to-first-audio** and **gap-free 3-chunk** playback | **TTFA < 1.5 s on Wi-Fi**; inter-chunk gap **< 120 ms** | T2 + T3 (`:309-310`) |
| **S3** | **Echo sanity** — TTS through the speaker while mic is open: is the examiner voice transcribed? | **0** examiner words transcribed in a quiet room (gate ON); **< 2%** word leakage AEC-only | T4 (`:311`) |
| **S4** | **Background** — lock the screen mid-TTS; the examiner sentence **completes audibly** | sentence completes; **0** truncation in 10/10 trials | §5 background policy (`:251-260`) |

> **Note on scope discipline.** Barge-in (T5) and warm-socket-per-exam (T6) are *production* thresholds in `03-VOICE-PIPELINE.md` but are **explicitly out of scope for the M3 go/no-go**. They are validated later, in the production-voice milestone, against the same instrument. The M3 gate rides on **S1–S4 only** — the four irreducible "does the platform even do this" questions. Keeping the spike to four scenarios is what makes it fast.

---

## 1. The throwaway app — where it lives and what it contains

### 1.1 Location & isolation (hard requirement)

The spike lives in a **separate top-level directory `mobile-spike/`** at the repo root. It is **NOT** `apps/mobile/`, **NOT** part of the Turborepo workspace graph, and **NOT** in the production build.

- It is its own standalone Expo project with its own `package.json` and its own `node_modules`. It does **not** import from `packages/shared` (which does not exist yet — `ls packages/` → none, per the grounding brief) and does **not** import from `apps/mobile`.
- It MUST be excluded from the workspace so a `turbo`/workspace install never pulls its (possibly bleeding-edge) deps into the real build. Add `mobile-spike` to the root `.gitignore`-adjacent workspace-ignore (or simply do not list it in the root `workspaces` array; an unlisted top-level dir is not a workspace).
- It is committed (so the SPIKE-REPORT's snippets are reviewable) but it is **archived/deleted after the gate** — see §8.4.

> **OWNER DECISION — commit vs. branch the spike.** Default: commit `mobile-spike/` on a short-lived branch `spike/m3-voice`, open a draft PR purely to host the SPIKE-REPORT and snippets for review, and **delete the directory in the same PR that opens `apps/mobile`** (so `main` never carries it). Alternative: keep it on `main` under `mobile-spike/` permanently as a reference rig. Recommend the branch+delete path to keep `main` clean. Confirm or override.

### 1.2 App skeleton (one screen, six buttons, one readout)

A single screen. Six buttons, each firing exactly one spike scenario, plus a "RUN ALL" that scripts S1→S4 in sequence and prints a copy-pasteable SPIKE-REPORT row. The readout shows live numbers only — this is a stopwatch, not a product.

```
[ S1  MIC → DEEPGRAM ]      capture→interim:  ____ ms   interim: "…"
[ S2  TTS → SPEAKER  ]      TTFA: ____ ms   gap1: __ ms  gap2: __ ms
[ S3  ECHO SANITY    ]      examiner words in transcript: __   leakage: __%
[ S4  BACKGROUND     ]      locked-screen TTS completed: PASS/FAIL
[ RUN ALL ]                 [ COPY REPORT ROW ]
─────────────────────────────────────────────
device: iPhone 14 Pro / iOS 18.5 / Wi-Fi 5GHz
build:  dev-client (prebuild) / New Arch ON
```

**Qualitative "done":** a non-author can pick up the device, tap RUN ALL, and read a pass/fail verdict + the four headline numbers without touching Xcode/Android Studio. **Measurable "done":** the COPY REPORT ROW button emits a fully-populated §7 row (no `____` placeholders) to the clipboard and to `console`/`adb logcat`.

### 1.3 Dependencies the spike pins (and records the exact version of)

The spike's #1 job after measuring latency is to **resolve the VERIFY-AT-SUBMISSION choices in §9** by actually installing and running them. It MUST record the resolved version of every audio-relevant dep in the report.

| Concern | Spike picks (primary) | Spike also trials (so the report can recommend) |
|---|---|---|
| Mic → raw PCM capture | `@siteed/expo-audio-studio` (`RecordingConfig { sampleRate:16000, channels:1, encoding:'pcm_16bit', interval:100 }`) | `expo-audio` `useAudioStream()` (SDK 56, `encoding:'int16'`); `@speechmatics/expo-two-way-audio` if a tagged release exists |
| TTS mp3 playback | `expo-audio` (temp-file source; `expo-av` is removed SDK 55+) | data-URI / in-memory source **only if** it proves gap-free |
| iOS AEC / full-duplex session | native config-plugin/module setting `playAndRecord` + `.voiceChat`, **or** `@speechmatics/expo-two-way-audio` (AEC built-in) | `react-native-audio-session` (BonnierNews) for the iOS half |
| Android AEC | `AudioSource.VOICE_COMMUNICATION` + `AcousticEchoCanceler` (guarded by `isAvailable()`), `MODIFY_AUDIO_SETTINGS` | n/a — never `VOICE_RECOGNITION` (known-weak) |
| Expo runtime | latest stable Expo SDK with **New Architecture ON**, **dev-client / prebuild** (none of the native paths run in Expo Go) | n/a |

**Measurable:** the report's "Module choices" block (§7.3) lists, for each row above, the **exact installed semver**, whether it **explicitly claims New-Architecture support**, and a one-line **adoption note** (stars / npm dependents / last-publish), so a VERIFY flag is either cleared or escalated.

---

## 2. Wiring to the real backend (the spike calls production APIs, unchanged)

The spike does **not** stub the backend. It exercises the **real** `/api/tts` and `/api/stt/token` routes against a deployed environment (staging or prod) so the measured numbers are real-world. This also validates the doc-01 Bearer transport end-to-end.

### 2.1 Auth — Bearer, not cookies

Both routes authenticate via the Supabase session. The web app rides a session **cookie** (`createClient()` → `supabase.auth.getUser()` at `src/app/api/tts/route.ts:38-42` and the STT token route's equivalent). A native app has no cookie jar, so the spike obtains a Supabase **JWT** (sign in once with a seeded test account via the Supabase JS client) and sends:

```
Authorization: Bearer <supabase_access_token>
```

This is the exact transport doc 01 §A makes the routes dual-mode for. **The spike is the first real proof that the dual-mode auth works for native clients** — if Bearer auth is not yet shipped server-side, that is a doc-01 prerequisite, not a spike task.

**Measurable:** `GET /api/stt/token` with the Bearer header returns HTTP 200 + JSON `{ token, url, expiresAt, flux, _debug }` (`src/app/api/stt/token/route.ts:190-203`); a request with no/expired Bearer returns 401. Both asserted in the spike before S1 runs.

### 2.2 The STT URL must carry linear16 params (the one server-side change the spike validates)

The token route's default Nova-3 URL is built **without** `encoding`/`sample_rate` params (`src/app/api/stt/token/route.ts:158-167`) because the web client streams **WebM/Opus containers** that Deepgram auto-detects. The spike streams **raw linear16 PCM with no container**, so the wss URL **must** carry `&encoding=linear16&sample_rate=16000&channels=1` or Deepgram mis-decodes into garbage.

> **OWNER DECISION — where the linear16 params are appended (mirror `03-VOICE-PIPELINE.md:52`).** For the spike specifically: the recommended path is the **server** appends the three params when the request is a native client (a `?client=native` query or a header the dual-mode route reads). The spike MAY append them client-side **for the spike only** to unblock measurement, but the SPIKE-REPORT must flag that the production path is server-authored (so a tampered client can't change the decode contract). Confirm the production placement before M3 build; the spike just proves the params *work*.

**Measurable:** with the three params present, S1 produces an intelligible interim transcript of a read-aloud sentence (≥ 80% word accuracy vs. script); with the params **removed**, the transcript is provably garbage (≤ 10% word accuracy) — this negative control proves the params are load-bearing and is recorded in the report.

### 2.3 WS subprotocol auth (replicate the web scheme exactly)

The token from `auth/grant` always begins `eyJ` (a JWT). The web client opens the socket with subprotocols `['bearer', token]` (`src/hooks/useDeepgramSTT.ts:143-144`). The spike's native WS client MUST send the same `Sec-WebSocket-Protocol: bearer, <jwt>` pair. The `'token'` scheme is a legacy raw-API-key fallback the native path never hits.

**Measurable:** the WS `onopen` fires (handshake accepted) within the web client's `CONNECT_TIMEOUT_MS = 10000` budget; a deliberately malformed subprotocol is rejected — both logged.

### 2.4 KeepAlive (so the half-duplex echo test in S3 is realistic)

Deepgram closes an idle socket at ~10 s of no audio + no KeepAlive. During S3/S4 the spike *mutes* the mic feed while TTS plays, so it MUST emit a `{"type":"KeepAlive"}` **text** frame every **3–5 s** during the muted window, exactly as the production half-duplex gate will (`03-VOICE-PIPELINE.md:80`). The spike asserts the socket stays open across a 12 s muted TTS turn.

---

## 3. Device matrix (the spike runs on physical hardware only)

OS AEC and real audio routing only exist on real devices. The matrix below is the **minimum** for the M3 gate: **≥ 1 physical iPhone AND ≥ 1 physical Android**, with a clear "primary" device per platform that the GO decision binds to, plus recommended secondary coverage to catch device-specific AEC variance.

### 3.1 Required minimum (binding for the gate)

| Role | Platform | Device class | OS floor | Why this one |
|------|----------|--------------|----------|--------------|
| **iOS primary** | iOS | iPhone 14 Pro / 15 / 15 Pro (A16+/A17) | iOS 18.x | iOS is FIRST (Owner D5); modern VoiceProcessingIO AEC; the device the GO call binds to |
| **Android primary** | Android | Pixel 8 / 8 Pro (recent, near-stock) | Android 14+ | Near-stock `AcousticEchoCanceler`; Android follows on the same foundation |

### 3.2 Recommended secondary (run if available; flags device variance early, not gating)

| Role | Platform | Device class | OS floor | Why |
|------|----------|--------------|----------|-----|
| iOS low-end / older | iOS | iPhone SE (2nd/3rd gen) or iPhone 12 | iOS 18.x | Smallest AEC headroom on the iOS line; if S3 passes here it passes everywhere |
| Android OEM-skinned | Android | Samsung Galaxy S-series (One UI) | Android 14+ | OEM audio HAL differs most from stock; AEC quality is the known variable |
| Bluetooth route | either | one device + a common BT headset/AirPods | — | Route change re-asserts sample rate; smoke-test that S1 still transcribes over BT |

> **OWNER DECISION — exact device serials.** Default minimum is **iPhone 14 Pro (iOS 18.5) + Pixel 8 (Android 14)**. Substitute the closest devices physically on hand; record the **exact model + OS build** in every report row (that string is part of the result). The only hard rule: **no simulator/emulator result counts** toward the gate.

### 3.3 Network conditions (each scenario records which it ran under)

- **Wi-Fi (5 GHz, good signal)** — the binding condition for the TTFA threshold (T2/S2 is "**< 1.5 s on Wi-Fi**"). All headline gate numbers are measured on Wi-Fi.
- **LTE/5G cellular** — run S1 + S2 **once** as an informational data point (not gating); record the numbers so the production plan knows the cellular delta. A large cellular regression is a note, not a No-Go.

**Measurable:** every report row stamps `device model + OS build + network (wifi/cell)`; the gate verdict is computed from **Wi-Fi rows on the two primary devices only**.

---

## 4. The four scenarios — exact procedure + measurable acceptance

Each scenario specifies: the **setup**, the **measurement point** (so two people measure the same thing), the **pass threshold**, and the **median-of-N** rule. **All headline numbers are the median of ≥ 10 trials** on Wi-Fi (matching `03-VOICE-PIPELINE.md:304`). A scenario PASSES on a device only if its median clears the threshold **and** ≥ 8/10 individual trials clear it (so a good median can't hide a flaky tail).

### S1 — Mic → linear16 PCM 16 kHz → Deepgram WS, live interim

**Setup.** Acquire mic permission. Configure capture at `sampleRate:16000, channels:1, encoding:'pcm_16bit', interval:100ms`. Mint a token (§2.1), open the WS with linear16 params (§2.2) and the `bearer` subprotocol (§2.3). Read aloud a fixed 8-word script ("November one two three Cessna, ready to taxi") on a metronome-cued start.

**Measure.** Start the stopwatch at the **first emitted PCM frame after the cue** (first phoneme proxy); stop it at the **first inbound `Results` message whose `channel.alternatives[0].transcript` is non-empty** (the first interim). That delta is `capture → first interim`.

**Format pre-check (hard, exact-match).** Before the latency trials, write 1 s of captured frames to a WAV header and assert `sample_rate == 16000, bits == 16, channels == 1` (`03-VOICE-PIPELINE.md:70`). If this fails, S1 fails outright — the bytes are wrong, latency is moot.

**Pass.**
- ✅ **capture → first interim median < 800 ms** (T1), ≥ 8/10 trials < 800 ms.
- ✅ interim transcript word accuracy **≥ 80%** vs. the script.
- ✅ WAV format pre-check exact-match.
- ✅ negative control (§2.2): params-removed transcript ≤ 10% accuracy.

### S2 — `/api/tts` mp3 → `expo-audio`, TTFA + gap-free 3-chunk

**Setup.** `POST /api/tts` with body **`{ text }`** only (the client never sends `voice` — `src/app/api/tts/route.ts:44`; truncates at 2000 chars `:50`). The response is raw mp3 bytes, `Content-Type: audio/mpeg`, `X-Audio-Encoding: mp3`, `X-Audio-Sample-Rate: 22050`, `X-Audio-Channels: 1` (`route.ts:179-188`). To test **gap-free 3-chunk**, synthesize a 3-sentence examiner turn as **three separate `/api/tts` calls** (mirroring the production sentence-granular drain — `03-VOICE-PIPELINE.md:114`) and play them back-to-back through one `AudioSink`.

**Measure.**
- **TTFA** = stopwatch from **`POST /api/tts` request sent** to **first audible sample** of sentence 1 (use the player's playback-started callback as the audible proxy; if the player can't timestamp first-sample, fall back to `onPlaybackStatusUpdate` first `positionMillis > 0`).
- **Inter-chunk gap** = device-side audio-timeline delta between sentence N's `onPlaybackEnd` and sentence N+1's first-sample, for the two boundaries (gap1, gap2).

**Pass.**
- ✅ **TTFA median < 1.5 s on Wi-Fi** (T2), ≥ 8/10 trials < 1.5 s.
- ✅ **gap1 and gap2 each < 120 ms** (T3) — perceptually seamless.
- ✅ **0-byte guard:** a stubbed 0-byte TTS body raises a handled error and never plays silence (`03-VOICE-PIPELINE.md:127`; the web client throws on empty body — `useVoiceProvider.ts:160-162`).
- ✅ **no temp-file leak:** temp-dir file count returns to baseline after the 3-sentence turn (`03-VOICE-PIPELINE.md:128`).

> **Note.** "Start on first chunk" here means **sentence-level**: sentence 1 begins as soon as its mp3 arrives while 2 and 3 are still synthesizing. We do **not** test sub-sentence chunked mp3 decoding — sentence granularity is the chunk (`03-VOICE-PIPELINE.md:114`).

### S3 — Echo sanity (the core "self-hearing" test)

**Setup.** **Physical device, quiet room** (OS AEC is null on simulators — `03-VOICE-PIPELINE.md:235`). iOS: session `playAndRecord` + mode `.voiceChat` (VoiceProcessingIO). Android: `VOICE_COMMUNICATION` + `AcousticEchoCanceler` if `isAvailable()`. Open the mic + WS (S1 path). Play a **scripted 10-sentence examiner TTS turn through the loudspeaker** at a normal listening volume while the mic stays open. Run the turn **twice**:

1. **AEC-only** (mic feed NOT muted) — measures raw OS echo cancellation.
2. **Gate ON** (the half-duplex backstop: stop forwarding mic bytes while TTS plays, KeepAlive the socket every 3–5 s — §2.4) — the production default.

**Measure.** Count **examiner words that appear in the Deepgram transcript** during the turn (a word is "leaked" if it matches the examiner script and no human spoke it). Leakage % = leaked examiner words / total examiner words.

**Pass.**
- ✅ **Gate ON: 0 examiner words transcribed** in a quiet room (T4) — the gate is deterministic and must be perfect.
- ✅ **AEC-only: < 2% word leakage** (T4) — characterizes the device's hardware AEC; informs whether the gate alone is sufficient or AEC adds margin.
- ✅ session config asserted at runtime: iOS category `playAndRecord` + mode `voiceChat`; Android `AcousticEchoCanceler.isAvailable()` checked + enabled where available (`03-VOICE-PIPELINE.md:243`).

> If **AEC-only ≥ 2%** but **Gate ON = 0**, that is still a PASS for the gate — it just confirms the half-duplex gate (not raw AEC) is the load-bearing mechanism, which is the architecture's intent. A FAIL is only **Gate ON > 0 examiner words**.

### S4 — Background completion (lock screen mid-TTS)

**Setup.** Configure background audio: `["expo-audio", { "enableBackgroundPlayback": true }]` → `UIBackgroundModes: [audio]` on iOS (`03-VOICE-PIPELINE.md:253`); runtime `setAudioModeAsync({ playsInSilentMode:true, shouldPlayInBackground:true, interruptionMode:'doNotMix' })` (`:120`). Begin playing a single ~8 s examiner sentence; **lock the screen (press the side/power button) ~2 s in**.

**Measure.** With the screen locked and the device in the user's hand to ear (or on a desk), confirm the **examiner sentence finishes audibly** and is not truncated/ducked into silence. Repeat 10×.

**Pass.**
- ✅ **sentence completes audibly in 10/10 trials** with the screen locked — **0 truncations**.
- ✅ background **mic capture is correctly blocked** (the OS forbids activating a recording session from the background — `03-VOICE-PIPELINE.md:254`): the spike confirms that attempting to start capture while backgrounded fails gracefully (no crash, no hot-mic), proving the production UI's "Tap to answer only when foregrounded" rule is enforceable.

---

## 5. The instrument — how the spike measures honestly

### 5.1 Timestamping (no hand-stopwatching the headline numbers)

All four headline deltas are computed **in-app** from monotonic timestamps (`performance.now()` / native `CLOCK_MONOTONIC`), never by a human with a stopwatch. The human only triggers the cue (the read-aloud start, the screen lock). Each trial logs a structured line: `{scenario, trial, deltaMs, pass, device, os, network}`.

### 5.2 Median-of-N and the tail rule

For S1/S2 the spike runs **≥ 10 trials** and reports **median + p90 + min + max + pass-count/10**. The gate uses **median < threshold AND ≥ 8/10 trials < threshold**. p90 and max are recorded so a flaky tail is visible even when it doesn't change the verdict.

### 5.3 Negative controls (proves a PASS is real, not lucky)

- S1: params-removed garbage transcript (§2.2).
- S2: 0-byte TTS body → handled error, not silence.
- S3: with the gate ON, the test only passes if it can ALSO be shown to FAIL when the gate is deliberately disabled and AEC is poor — i.e., the spike must be capable of catching leakage, not blind to it. Demonstrate at least one configuration that produces > 0 leaked words (e.g., speaker at high volume, gate off) so a "0" is trustworthy.

### 5.4 What the spike does NOT measure (and must not pretend to)

Barge-in (T5), warm-socket-per-exam over a full 90 s exam (T6), 30-exchange endurance, prefetch hit-rate, interruption/route-change cycles — all are **production-milestone** validations. The spike must not block on them and must not report a green for them. Listing them here prevents scope creep.

### 5.5 The HUD typography (the one place the FLIGHT DECK rule applies)

The spike's on-screen readout is a brand instrument moment, so it follows the FLIGHT DECK rule: **caps-mono + subtle glow** for the `// CAPTURE→INTERIM`, `// TTFA`, `// GAP`, `// LEAKAGE` micro-labels and the numeric readouts; status annunciators (`PASS` green / `FAIL` red) as caps-mono badges. Everything else (instructions, button labels) is sentence-case IBM Plex. **Never 10px text**; touch targets **≥ 44 pt iOS / 48 dp Android**. This is the *only* design rule the throwaway honors — it doubles as a tiny early proof the design tokens render natively.

---

## 6. Pre-flight checklist (must be green before any trial counts)

A trial only counts toward the gate if ALL of these hold (assert in-app and log them):

- [ ] Running on a **physical device** (assert `!isSimulator`/`!isEmulator`); a sim/emulator run is logged as `INVALID — does not count`.
- [ ] **Dev-client / prebuild** build with **New Architecture ON** (logged: `newArch: true`).
- [ ] **Bearer auth** to `/api/stt/token` returns 200 (§2.1).
- [ ] STT wss URL contains `encoding=linear16&sample_rate=16000&channels=1` (§2.2).
- [ ] WS opened with `bearer` subprotocol; `onopen` fired < 10 s (§2.3).
- [ ] Mic permission granted; iOS session = `playAndRecord`/`.voiceChat`; Android `AcousticEchoCanceler.isAvailable()` resolved (§S3).
- [ ] Network condition stamped (`wifi`/`cell`); headline numbers on **Wi-Fi**.
- [ ] Quiet room for S3 (ambient noise floor noted; no other speech in the room).

---

## 7. SPIKE-REPORT template (the only durable output)

The report is a single markdown file `mobile-spike/SPIKE-REPORT.md` (committed). It has four blocks. **A No-Go cannot be overturned by argument — only by a green report.**

### 7.1 Per-threshold × per-device results matrix

| Scenario | Threshold | iOS primary (model/OS) | Android primary (model/OS) | iOS secondary | Android secondary |
|----------|-----------|------------------------|----------------------------|---------------|-------------------|
| **S1** capture→interim | median **< 800 ms**, ≥8/10 | `___ms (p90 ___) PASS/FAIL n/10` | `___ms (p90 ___) PASS/FAIL n/10` | … | … |
| **S1** word accuracy | **≥ 80%** | `__% PASS/FAIL` | … | … | … |
| **S2** TTFA (Wi-Fi) | median **< 1.5 s**, ≥8/10 | `___ms (p90 ___) PASS/FAIL n/10` | … | … | … |
| **S2** gap1 / gap2 | each **< 120 ms** | `__ / __ ms PASS/FAIL` | … | … | … |
| **S2** 0-byte guard | handled, no silence | `PASS/FAIL` | … | … | … |
| **S3** examiner words, gate ON | **0** | `__ words PASS/FAIL` | … | … | … |
| **S3** leakage, AEC-only | **< 2%** | `__% PASS/FAIL` | … | … | … |
| **S4** locked-screen TTS completes | **10/10** | `__/10 PASS/FAIL` | … | … | … |
| **S4** background mic blocked gracefully | no crash/hot-mic | `PASS/FAIL` | … | … | … |

Plus an **informational** (non-gating) row: S1 + S2 on **cellular** (record the delta vs. Wi-Fi).

### 7.2 Verdict line (computed, not narrated)

```
GATE VERDICT: GO | NO-GO
  iOS primary  (model/OS):  S1 ✓  S2 ✓  S3 ✓  S4 ✓   → PASS
  Android primary (model/OS): S1 ✓  S2 ✗  S3 ✓  S4 ✓   → FAIL (S2 TTFA median 1.71s)
  Rule applied: §8.  Decision: ____
```

### 7.3 Module choices (resolves the §9 VERIFY flags)

For each audio dep: **exact installed semver**, **New-Arch support: explicitly-claimed / verified-empirically / unknown**, **adoption note**, and a one-line **recommendation for production** (adopt / adopt-with-native-shim / reject + reason). This block is what unblocks the production pipeline's library decisions.

### 7.4 Snippets worth keeping (the few load-bearing lines)

Lift only the genuinely tricky, hard-won fragments — not the whole app. Expected keepers:
- The native WS open call with the `bearer` subprotocol pair (the exact API shape that worked).
- The `RecordingConfig` that produced bit-exact linear16/16k (and the WAV-assert proving it).
- The iOS `.voiceChat` / Android `AcousticEchoCanceler` session setup that made S3 pass.
- The `expo-audio` play-strategy (temp-file vs. memory) that achieved gap-free 3-chunk.
- The KeepAlive cadence code that kept the socket warm through the muted window.

Each snippet is annotated with the file:line it should land in for the production port (e.g. "→ becomes the `ExpoAudioSink.play()` body, `03-VOICE-PIPELINE.md:184`").

---

## 8. The GO / NO-GO decision rule (binding)

### 8.1 GO — React Native confirmed

**GO** is declared **iff** on **both primary devices on Wi-Fi**, **all four scenarios pass simultaneously**:

- S1 capture→interim **median < 800 ms** (≥8/10) **and** word accuracy ≥ 80%, **and**
- S2 TTFA **median < 1.5 s** (≥8/10) **and** both gaps < 120 ms **and** 0-byte guard handled, **and**
- S3 **0 examiner words transcribed with the gate ON** (and AEC-only < 2% recorded), **and**
- S4 locked-screen TTS **completes 10/10** and background mic-start fails gracefully.

A GO means the platform is proven and the production RN voice milestone is unblocked. Secondary-device failures do **not** block a GO but are logged as **device-variance risks** for the production plan to mitigate (e.g., "Galaxy S AEC-only leakage 4% → gate is mandatory, not optional").

### 8.2 NO-GO — escalate to a Flutter comparison

**NO-GO** is declared if **any** of the following holds after a genuine remediation attempt:

- **Any S1–S4 threshold fails on a primary device on Wi-Fi**, AND
- a **bounded remediation window** (default **3 working days** — try the alternate module from §1.3, the native session shim, a different capture interval, server-side TTS warmup) **fails to bring the failing threshold green**.

On NO-GO the action is **not** "ship anyway" and **not** "abandon mobile." It is: **escalate to a focused Flutter spike of the same four scenarios** (`flutter` + `flutter_sound`/`record` + native AEC) and decide RN-vs-Flutter on a head-to-head of the same numbers on the same devices. The owner makes the framework call from two SPIKE-REPORTs side by side.

> **OWNER DECISION — the remediation window length and who calls it.** Default **3 working days** before NO-GO escalation, with the owner (pd@imagineflying.com) making the final GO/NO-GO/escalate call on the report. Adjust the window if a single threshold is *close* (e.g., TTFA 1.6 s) — a near-miss may warrant a longer tuning window rather than a Flutter pivot. Confirm.

### 8.3 Decision-tree summary

```
            ┌─ all S1–S4 PASS on BOTH primaries (Wi-Fi) ─► GO  (RN confirmed → build prod voice)
RUN SPIKE ──┤
            └─ any threshold FAIL on a primary ─► remediate ≤3 days
                                                   ├─ now PASS ─► GO
                                                   └─ still FAIL ─► NO-GO ─► Flutter comparison spike
```

### 8.4 What happens to the spike after the decision

- **On GO:** the SPIKE-REPORT + §7.4 snippets are linked from `03-VOICE-PIPELINE.md`; the `mobile-spike/` directory is **deleted** (per §1.1 / the §1.1 owner decision). The production voice work proceeds in `apps/mobile` consuming the (now-validated) module choices and the shared sentence-boundary logic from `packages/shared`.
- **On NO-GO:** the directory is kept until the Flutter comparison concludes, then both spikes are archived under `docs/mobile/spike-archive/` with their reports.

---

## 9. VERIFY-AT-SUBMISSION — what the spike must resolve, not assume

These are unverified-at-research-time facts the spike **converts to measured truth**. The spike is the verification mechanism. Each MUST end the spike with a definite resolved value in §7.3.

| # | Claim to verify | How the spike resolves it | Pass criterion |
|---|-----------------|---------------------------|----------------|
| V1 | `@siteed/expo-audio-studio` is **New-Architecture compatible** at the pinned version | Build the dev-client with New Arch ON; run S1 | Capture works on New Arch; record exact version |
| V2 | `@siteed/expo-audio-studio` emits **bit-exact int16 LE / 16 kHz / 1ch** | WAV-assert in S1 | `sample_rate=16000, bits=16, channels=1` exact-match |
| V3 | `@speechmatics/expo-two-way-audio` has a **usable tagged release** (had none at research time) | `npm view` the version; if present, trial it as the §1.3 fallback | A real semver exists AND it installs/builds AND its AEC passes S3 — else mark "no release; not viable for v1" |
| V4 | `expo-audio` `useAudioStream()` (SDK 56) is **stable enough** as the low-dep capture path | Trial it for S1 alongside siteed | Captures int16/16k with interim < 800 ms — else "too new, defer" |
| V5 | iOS `.voiceChat` / Android `AcousticEchoCanceler` actually suppress the examiner voice **on this hardware** | S3 on physical devices | Gate ON = 0 words; AEC-only < 2% |
| V6 | `expo-audio` temp-file play is **gap-free** at sentence boundaries (vs. memory source) | S2 gap measurement, both strategies | gaps < 120 ms; report which strategy wins |
| V7 | The server **dual-mode Bearer auth** + **native linear16 URL params** work end-to-end | §2.1–2.2 pre-checks | 200 + intelligible transcript; garbage without params |
| V8 | `react-native-deepgram` is **reference-only, not load-bearing** (early-stage, ~5★) | Do NOT make it the core; optionally read its session code | Confirmed not adopted as primary |

---

## 10. Relationship to the milestone plan (this gate blocks the build)

**This gate MUST pass before any milestone that builds the production voice feature.** Concretely:

- The production voice pipeline (`docs/mobile/03-VOICE-PIPELINE.md`) is explicitly written so that "**No claim in this doc is *done* until the spike measures it on a physical device**" (`:3`). Its headline thresholds T1–T6 (`:306-313`) are partially proven here (T1–T4 ≈ S1–S4); T5/T6 are proven in the production milestone.
- The `packages/shared` extraction (sentence-boundary + tier mapping) is **not** blocked by this spike (it's pure TS) — but **wiring that shared brain to native capture/playback is**.
- Therefore the build order is: **M3 spike (this doc) → GO → production `apps/mobile` voice milestone**. A NO-GO redirects to the Flutter comparison before any production voice code is written.

**Qualitative "done" for M3:** we can look a store reviewer (and ourselves) in the eye and say the native voice loop is proven on real iPhones and Androids, not hoped-for. **Measurable "done":** a committed `SPIKE-REPORT.md` with a computed `GATE VERDICT: GO` line, all §7.1 primary-device cells PASS on Wi-Fi, all §9 VERIFY rows resolved, and owner sign-off recorded.

---

## 11. Open items rolled up for the owner

1. **§1.1** — Commit the spike on a branch + delete-in-PR (recommended) vs. keep on `main` as a reference rig.
2. **§2.2 / §3 of `03`** — Where the linear16 URL params are appended in production (server `client=native` recommended).
3. **§3.2** — Exact device serials for the two primaries (default iPhone 14 Pro / Pixel 8).
4. **§8.2** — Remediation-window length before NO-GO escalation (default 3 working days) and final-call owner.

---

*This is the binding M3 go/no-go gate. A green SPIKE-REPORT is the only artifact that authorizes the production RN voice build; a NO-GO redirects to a Flutter comparison spike of the identical four scenarios.*
