# Mobile Voice Pipeline — Technical Design (M3)

> **Read order:** Read `docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md` first (it defines the Bearer transport this pipeline rides on and the **server-side STT URL change** for native PCM). Read `docs/mobile/02-DESIGN-SYSTEM.md` for the FLIGHT DECK typography rule applied to the voice UI in §11. The proof gate for everything below is the **M3 spike** — `docs/mobile/08-VOICE-SPIKE-M3.md`. **No claim in this doc is "done" until the spike measures it on a physical device.**
>
> **Scope guardrails for this doc:**
> - **The server is a fixed contract.** `POST /api/tts` and `GET /api/stt/token` are consumed exactly as the web client consumes them, with one additive server change (linear16/16k query params for native PCM, defined in doc 01 §B and re-stated here in §1.4). The mobile client is a **client** — it does not change synthesis, quota, or tier logic.
> - **No web behavior change.** The native capture/playback stack replaces only the browser-DOM-bound halves of the web hooks (`MediaRecorder`, `HTMLAudioElement`, `getUserMedia`, `URL.createObjectURL`). The pure algorithm — sentence-boundary + queue/drain/prefetch state machine — is **extracted to `packages/shared` and consumed unchanged by both web and mobile** (single source of truth, locked decision D5).
> - **iOS first, Android second on the same foundation.** Every abstraction here (`AudioSink`, the half-duplex gate, the interruption controller) is platform-neutral; only the two native leaves (capture module, player) are platform-specific, and both ship for iOS and Android.
> - **Every section carries BOTH** (a) qualitative "done" bar and (b) measurable pass/fail criteria. A section without numbers is incomplete by the owner's standard.
> - **This is M3 code, gated on the M3 spike GO — it does NOT ship at M2.** Per the cross-cutting milestone plan, **M2 screens ship voice OFF / type-only**; the entire native capture/playback/duplex stack in this doc lights up only **after** the M3 spike (`docs/mobile/08-VOICE-SPIKE-M3.md`) passes T1–T6 on physical hardware. Until that GO, none of the production voice paths below are wired into the shipping app.

---

## 0. Pipeline at a glance

```
                          ┌──────────────────────── packages/shared (pure TS, no DOM/native) ─────────────────────┐
                          │  sentence-boundary.ts (verbatim)   SentenceTTSController (queue/drain/prefetch)        │
                          └───────────────────────────────────────────────────────────────────────────────────────┘
   EXAMINER TEXT (SSE tokens from /api/exam respond)                      STUDENT SPEECH
        │                                                                      │
        ▼                                                                      ▼
   pushToken ─► detectSentenceBoundary ─► enqueue ─► drain (sequential)   native mic capture
        │                                                │                  (linear16 PCM 16k)
        │                              prefetch(queue[0])│                       │
        ▼                                                ▼                       ▼  binary WS frames
   POST /api/tts {text}  ──►  mp3 bytes  ──►  AudioSink.play(bytes) ──► expo-audio   wss://…/v1/listen
                                                  │  resolves on END           ?encoding=linear16&sample_rate=16000
                                                  ▼                                  │
                                          HALF-DUPLEX GATE                           ▼
                                  (TTS playing → stop forwarding mic            interim + final
                                   bytes; KeepAlive socket; resume on END)      transcripts
        ▲                                                                            │
        └──────────────── BARGE-IN: VAD/first-interim cancels TTS ◄──────────────────┘
```

Two native leaves, one shared brain. The shared brain is the web algorithm lifted out of React. The native leaves are the capture module (§1) and the `AudioSink` player (§2/§3). The half-duplex gate (§3/§4), audio session (§4), background policy (§5), and interruption controller (§6) are the native plumbing that makes the two leaves coexist on a phone.

---

## 1. Capture path — native mic → linear16 PCM 16 kHz → Deepgram WS

### 1.1 What the server already gives us (verified contract)

- **Token mint:** `GET /api/stt/token` (mobile sends `Authorization: Bearer <supabase_jwt>`; doc 01 §A makes the route dual-mode). The route calls Deepgram `POST https://api.deepgram.com/v1/auth/grant` with `{ ttl_seconds: 600 }` (`src/app/api/stt/token/route.ts:103-110`) and returns JSON `{ token, url, expiresAt, flux, _debug }` (`token/route.ts:190-203`). `token` is a JWT that always begins `eyJ` (`token/route.ts:124-127`). TTL is **600 s** (`token/route.ts:20`); rate limit **4 tokens/min/user** (`token/route.ts:19, 57-70`) → mobile MUST reuse one token for a whole listening session and only re-mint near expiry.
- **Default Nova-3 URL** (`token/route.ts:158-167`): `wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&interim_results=true&utterance_end_ms=1500&vad_events=true` + `keyterm=` params (43-term aviation boost, `token/route.ts:166`).
- **WS subprotocol auth** (verified in web client `src/hooks/useDeepgramSTT.ts:143-144`): `isJwt = token.startsWith('eyJ')` → open the socket with subprotocols `['bearer', token]`. The JWT from `auth/grant` is always a JWT, so mobile **always** sends `Sec-WebSocket-Protocol: bearer, <jwt>`. (`'token'` is a legacy raw-API-key fallback the mobile path never hits.)

### 1.2 Why the URL needs a server change for native PCM

The web client streams **Opus/WebM containers** (`MediaRecorder`, `useDeepgramSTT.ts:171-178`), so the Nova-3 URL deliberately sends **no `encoding`/`sample_rate`** — Deepgram auto-detects the container. Native PCM is **raw, container-less** linear16: Deepgram cannot auto-detect it and will mis-decode unless `encoding=linear16&sample_rate=16000` (and `channels=1`) are present on the wss URL. This is a **server-side URL change**, not a client query tweak, because the client must not be trusted to construct or mutate the wss URL (the keyterm list and model are server-curated). The change is specified in doc 01 §B; restated here as the binding requirement.

> **OWNER DECISION — where the linear16 params live (recommend: server, `client=native` switch).** Two options, pick one before M3 build:
> 1. **(Recommended)** `GET /api/stt/token?client=native` (or an `X-Client: ios|android` header) makes the route append `encoding=linear16&sample_rate=16000&channels=1` to the Nova-3 URL it already builds (`token/route.ts:158-167`). Web sends no param and is byte-for-byte unchanged. Single source of truth for the wss URL stays server-side.
> 2. Client appends the three params to the returned `url`. Rejected as the default: it splits wss-URL authorship across client+server and lets a tampered client change the decode contract.
> **This plan recommends option 1.** Confirm or override. Flux pilot (`/v2/listen`, `token/route.ts:146-152`) is **out of scope for mobile v1** — it accepts containers and has a different message schema (`TurnInfo`); mobile v1 is Nova-3-only.

### 1.3 Native capture module — recommendation + fallback

**Primary: `@siteed/expo-audio-studio`.** Mature Expo module (Swift/Kotlin, dev-client/prebuild — not Expo Go). Configure the recording with `RecordingConfig { sampleRate: 16000, channels: 1, encoding: 'pcm_16bit', interval: 100 }` and forward every `onAudioStream` chunk as a **binary WebSocket frame**. `pcm_16bit` is bit-exact `linear16` (16-bit little-endian signed PCM) — **zero transcoding**. Recording natively at 16 kHz avoids a 48k→16k resample step.

**Fallback A (purpose-built for the self-hearing problem): `@speechmatics/expo-two-way-audio`.** Full-duplex capture+playback with **built-in Acoustic Echo Cancellation**; emits clean mic samples at 1ch/16-bit/16 kHz via `onMicrophoneData` and plays examiner TTS via `playPCMData(Uint8Array)`. It is the cleanest answer to §4's echo requirement, but had **no tagged release** at research time → **VERIFY-AT-SUBMISSION** before depending on it (see §12).

**Fallback B (lowest-dependency): `expo-audio` `useAudioStream()` (SDK 56).** First-party, New-Architecture-native, `encoding: 'int16'` (= linear16), configurable `sampleRate`. New (SDK 56 beta) and exposes **no echo-cancellation / voiceChat control**, so it still needs the native session module from §4.

**Not the core: `react-native-deepgram`.** Turnkey on paper (`encoding:'linear16'`, `sampleRate:16000` defaults, claims AVAudioEngine HW echo cancellation) but early-stage/low-adoption — use only as a spike reference, never load-bearing.

**Qualitative "done":** the mic produces a continuous stream of 16 kHz mono int16 PCM frames on a physical iPhone and a physical Android device, forwarded as binary WS frames, with the half-duplex gate (§3) and AEC (§4) in place; the capture module is pinned and New-Architecture-verified (§12).

**Measurable success criteria:**
- [ ] **Format on the wire:** captured frames are int16 LE, 16 kHz, 1 channel — verified by writing 1 s to a WAV header and confirming `sample_rate=16000, bits=16, channels=1` (assert in the M3 spike, exact-match).
- [ ] **First-interim latency:** from the first user phoneme to the first Deepgram interim transcript **< 800 ms** on Wi-Fi, median of 10 trials, physical device (§7 threshold T1).
- [ ] **No resample artifact:** transcript WER on the fixed 20-utterance aviation script is **≤ 8% absolute WER** on a physical device (absolute target; there is no in-tree web-path WER baseline to diff against today). **Prerequisite — capture the baseline first:** before judging this criterion, run the *same* 20-utterance script through the **web Opus/WebM path** and store the measured web-path WER as the comparison artifact in the M3 spike report (`docs/mobile/08-VOICE-SPIKE-M3.md`); the native linear16 WER is then reported both absolutely (≤ 8%) and as a delta against that captured baseline (proves linear16 path is not degrading recognition).
- [ ] **Chunk cadence:** `interval` produces frames every **80–120 ms** (target 100 ms); no frame larger than 200 ms of audio (keeps barge-in latency bounded).
- [ ] Capture starts only in the **foreground** (§5) and never throws an uncaught error on permission-denied (graceful prompt instead).

### 1.4 KeepAlive (the silence that closes the socket)

Deepgram closes an idle socket after **10 s** of no audio **and** no KeepAlive (`NET-0001`). The half-duplex gate (§3) stops sending mic bytes whenever the examiner is talking — a window that routinely exceeds 10 s — so the client MUST send a `{"type":"KeepAlive"}` **text** frame every **3–5 s** during any muted window. **KeepAlive is NEW native behavior, not a port:** the web client never sends KeepAlive (it keeps the recorder running and lets `MediaRecorder` emit container frames, so its socket never goes idle; grep of `src/hooks` + `src/lib/voice` shows **0** KeepAlive hits). What mobile *does* mirror from the web stop path is the teardown: send `{"type":"CloseStream"}` then `ws.close()` on stop, exactly as `src/hooks/useDeepgramSTT.ts:98` (`CloseStream`) → `:100` (`ws.close()`). KeepAlive is the difference between one warm socket per exam and a reconnect on every examiner turn.

**Measurable:** in a scripted 90 s exam with three 12 s examiner turns, the STT socket opens **exactly once** (0 mid-exam reconnects attributable to idle close); KeepAlive frames are emitted at **3–5 s** intervals during every muted window (assert frame timestamps in the spike).

### 1.5 STT resilience — port the logic, not the transport

The web reconnect/retry state machine is portable; only the transport (WS + recorder) is native. Port these constants verbatim from `useDeepgramSTT.ts:22-30`:

| Constant | Value | Behavior to preserve |
|---|---|---|
| `MAX_ATTEMPTS` | 2 | initial connect + 1 retry (`useDeepgramSTT.ts:22`) |
| `RETRY_DELAY_MS` | 2000 | delay before connect retry (`:23`) |
| `MAX_RECONNECT_CYCLES` | 2 | mid-session reconnects per listening session (`:26`, `:294-363`) |
| `CONNECT_TIMEOUT_MS` | 10000 | reject a handshake that neither opens nor errors (`:28`, `:150-155`) |
| `TOKEN_REFRESH_MARGIN_MS` | 30000 | re-mint token if within 30 s of `expiresAt` on reconnect (`:30`, `:335`) |

On reconnect exhaustion the **mic is released** (no hot-mic leak) and an error surfaces: "Voice connection lost. Tap the mic to resume." (`:302`, `:297-314`). Native must replicate the release: stop the capture module, deactivate the audio session, end usage reporting.

**Measurable:** a forced socket drop mid-utterance reconnects within **≤ 2 cycles** and resumes transcribing without losing the post-drop utterance; on a hard failure (3rd cycle) the mic is **provably released** within 1 s (assert audio session inactive + no input-level meter activity in the spike).

---

## 2. Playback path — `/api/tts` mp3 → `expo-audio`, start-on-first-chunk

### 2.1 The TTS contract (verified, consumed unchanged)

- **Request** (`src/app/api/tts/route.ts:44-50`): `POST /api/tts`, `Content-Type: application/json`, body **`{ text }`** only — mobile never sends `voice` (override is admin/preview only). Auth via Bearer (doc 01). Server truncates `text.slice(0,2000)` (`route.ts:50`).
- **Success** (`route.ts:179-188`): raw **MP3** bytes (`Content-Type: audio/mpeg`), headers `X-Audio-Encoding: mp3`, `X-Audio-Sample-Rate: 22050`, `X-Audio-Channels: 1`, `X-TTS-Provider: deepgram`, `Cache-Control: no-cache`. The web client **ignores** the `X-Audio-*` headers and treats the body as `audio/mpeg` (`useVoiceProvider.ts:85, 164`); mobile does the same — the only contract that matters is "MP3 bytes". A **0-byte** body is an error (`useVoiceProvider.ts:160-162`).
- **Errors:** 401 (`route.ts:41`), 400 missing text (`:46`), 503 kill-switch (`:65-70`), 429 `quota_exceeded`/`daily_cap_reached` with `upgrade_url:'/pricing'` (`:100-121`), 500 (`:192-195`). Mobile maps 429 → the upgrade sheet (RevenueCat path, payments doc), 503 → "Examiner voice is briefly unavailable" toast, 500 → retry-once-then-text-only.

### 2.2 Why mp3 + a native player (not PCM streaming)

`useStreamingPlayer.ts` **does not exist** — the AudioWorklet PCM path was deleted because it produced silence in Firefox/Safari (`useVoiceProvider.ts:46-50`). The product is **mp3 → element-style playback**, and the TTS route hard-strips `encoding` from config to prevent a regression back to linear16 (`route.ts:149-151`, restated in the Deepgram adapter). Mobile inherits this decision: **mp3 in, native decoder out**. MP3 is hard-pinned to 22050 Hz by Deepgram regardless of config — the native player must accept 22050 Hz mono mp3 (every iOS/Android codec does).

### 2.3 Player choice + "start on first audio"

**Player: `expo-audio`** (`expo-av` is removed in SDK 55+). The drain loop synthesizes **one sentence at a time** (§2.4), so each `AudioSink.play(bytes)` call already operates on a complete short mp3 — "start on first chunk" at the pipeline level means **the first sentence's audio begins as soon as its mp3 arrives, while later sentences are still being synthesized/prefetched.** We do **not** need sub-sentence chunked decoding; the sentence granularity is the chunk.

Two viable `expo-audio` play strategies for one sentence's mp3:
1. **(Recommended) Write bytes → temp file `uri` → `createAudioPlayer({ uri })` → `play()`.** Robust, universally decodable, trivial cleanup. The ~1–3 KB temp-file write is **< 5 ms** and off the critical perceptual path.
2. Data-URI / in-memory source if the pinned `expo-audio` version supports a memory source without a temp file. Use only if the spike proves it is gap-free.

**Background-audio config plugin** (required for §5): `["expo-audio", { "enableBackgroundPlayback": true }]`. Runtime mode set once at startup (§4): `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`. **Note:** `setAudioModeAsync` does **not** enable AEC — that needs the native session module in §4.

**Qualitative "done":** the examiner's first sentence is audible quickly after the SSE stream starts producing tokens; subsequent sentences play back-to-back with no audible gap; the user can barge in at any moment and audio stops instantly.

**Measurable success criteria:**
- [ ] **Time-to-first-audio (TTFA):** from the first SSE token of the examiner turn to the first audible sample **< 1.5 s on Wi-Fi**, median of 10 trials, physical device (§7 threshold T2). This is bounded by `/api/tts` synthesis (8 s timeout + 1 retry server-side) for the **first** sentence; prefetch hides it for all later sentences.
- [ ] **Gap-free 3-chunk playback:** for a 3-sentence examiner turn, the inter-sentence silence is **< 120 ms** measured device-side (§7 threshold T3) — the prefetch (§2.5) must make sentences 2 and 3 start with cached audio.
- [ ] **0-byte guard:** an empty TTS body raises a handled error, never plays silence, and falls back to text-only reveal (assert in spike with a stubbed 0-byte response).
- [ ] Temp-file artifacts are deleted after `onPlaybackEnd`; no temp file leaks across a 30-exchange session (assert temp dir count returns to baseline).

### 2.4 Port the sentence machine into `packages/shared`

**`packages/shared` does not exist yet** — it is created by this work (locked decision D5). Two things move in:

**(a) `sentence-boundary.ts` — verbatim, zero changes.** `src/lib/voice/sentence-boundary.ts` (146 lines) is pure: `detectSentenceBoundary(buffer)` with aviation abbreviations (`ABBREVIATIONS`, `:16-20`), FAA refs `91.205`/`AIM 7-1-11`/`AC 61-98` (`:113-128`), decimals `122.8` (`:130-141`), list markers (`:143-146`), colon soft-boundary at 80 chars (`:94-100`), force-flush at 200 chars (`:48-58`), min sentence 20 chars (`:23`). No DOM, no React, no fetch → lift-and-shift with its **21 passing tests** (`src/lib/__tests__/sentence-boundary.test.ts`). Web then imports it from `packages/shared` so there is exactly one copy.

**(b) The queue/drain/prefetch state machine — extract from React into a plain `SentenceTTSController` class/store.** `src/hooks/useSentenceTTS.ts` (205 lines) is ~80% pure algorithm wrapped in ~20% React glue (`useRef`/`useCallback`/`useState`). Preserve exactly:
- `pushToken` accumulates buffer → `detectSentenceBoundary` → `enqueue` (`useSentenceTTS.ts:165-174`).
- Sequential `startDraining` loop that **`await`s `speak()` per sentence** and never advances until the current sentence's playback **ends** (`:92-129`).
- **Lookahead prefetch** of `queue[0]` while the current sentence plays (`:105-107`) **plus** enqueue-time prefetch when already draining (`:158-160`).
- `flush()` for the trailing buffer on stream end (`:176-188`); `cancel()` that empties buffer+queue and re-arms for reuse (`:190-202`).
- Callbacks `onSentenceStart`/`onWaitingForNext`/`onAllDone`/`onError` for text-reveal sync (`:13-21`).

The controller is platform-neutral: it takes an injected `speak(text, onReady): Promise<void>` and `prefetch(text): void`. On mobile, `speak`/`prefetch` are backed by the `AudioSink` (§3); on web they stay backed by `useVoiceProvider`. **The controller never imports a DOM or native API.**

**Measurable:**
- [ ] **Zero-diff boundary detection:** the shared `detectSentenceBoundary` passes the **same 21 tests** unchanged on web and in the mobile package (CI gate).
- [ ] **Controller parity:** a headless test feeding a fixed 8-sentence token stream with a mocked `speak` yields the **identical enqueue order, prefetch order, and onSentenceStart sequence** on web and mobile (golden-trace equality).
- [ ] Web continues to consume `packages/shared` (no duplicated copy of `sentence-boundary.ts` remains under `src/lib/voice/` after extraction, or it re-exports from shared) — verified by a CI grep.

### 2.5 The prefetch contract — keep verbatim semantics

`useVoiceProvider`'s prefetch cache is a `Map<text, {promise, controller}>` that fires a parallel `/api/tts` fetch ahead of need (`useVoiceProvider.ts:67, 72-92`). Mobile preserves the **shape and the two load-bearing invariants**, replacing only the fetch result type (browser `Blob` → native bytes/temp-file `uri`):
1. **`speak()` resolves on playback END, not start** (`useVoiceProvider.ts:102-103, 177-179`) — the sequential drain loop depends on this.
2. **Cache hit skips the round-trip:** a sentence whose audio was prefetched while the previous sentence played starts from cached bytes (`useVoiceProvider.ts:123-143`); a failed prefetch is deleted so `speak()` falls back to a fresh fetch (`:86-90`).

**Measurable:** for sentences 2..N of a turn, the spike logs a **PREFETCH HIT** (cached) ≥ 90% of the time on Wi-Fi; a forced prefetch failure cleanly falls back to a fresh fetch with no dropped sentence.

---

## 3. The `AudioSink` abstraction + barge-in

### 3.1 `AudioSink` — the one seam between shared brain and native audio

`AudioSink` is the platform-neutral interface the `SentenceTTSController` talks to. It is the **only** place native audio APIs are touched on the playback side, and it is where the half-duplex gate and barge-in live.

```ts
// packages/shared/voice/audio-sink.ts  (interface only — impls are native)
export interface AudioSink {
  /** Synthesize+play one sentence. MUST resolve on playback END (not start).
   *  onReady fires after audio is fetched, immediately before play() — text reveal. */
  speak(text: string, onReady?: () => void): Promise<void>;
  /** Parallel pre-fetch for an upcoming sentence. Idempotent per text. */
  prefetch(text: string): void;
  /** Barge-in / end-session: abort in-flight fetch, stop playback,
   *  clear+abort all prefetches. Idempotent. (mirrors stopSpeaking) */
  stop(): void;
  /** True while a sentence is audible — drives the half-duplex gate (§3.3). */
  readonly isPlaying: boolean;
  /** Fires on every transition so the mic gate and UI can react. */
  onPlayingChange(cb: (playing: boolean) => void): () => void;
}
```

The web `useVoiceProvider` is, in effect, the browser `AudioSink` (`speak`/`prefetch`/`stopSpeaking`/`isSpeaking`). Mobile ships `ExpoAudioSink` implementing the same interface over `expo-audio` + the temp-file player + the native prefetch map. **The controller is unaware which sink it holds.**

**Qualitative "done":** swapping `ExpoAudioSink` for the web sink under the shared controller requires **zero controller changes**; both satisfy the resolve-on-END and cache-hit invariants of §2.5.

**Measurable:**
- [ ] Interface conformance test passes for both sinks (resolve-on-END, idempotent `stop()`, `onPlayingChange` fires `true` then `false` exactly once per sentence).
- [ ] `stop()` called mid-fetch and mid-playback both leave `isPlaying === false` and no orphaned player/temp file (assert in spike).

### 3.2 Barge-in — cancel TTS the instant the user speaks

Web barge-in (`useVoiceProvider.ts:246-263`, `useSentenceTTS.ts:190-202`): aborts the in-flight TTS fetch, pauses+resets audio, clears+aborts every prefetch, and the in-flight `speak()` rejects with `AbortError` (swallowed as intentional, `:229-231`); the controller `cancel()` empties buffer+queue and re-arms. Mobile replicates this exactly through `AudioSink.stop()` + `controller.cancel()`.

**The mobile trigger for barge-in** is the user starting to speak while the examiner is talking. Because the half-duplex gate (§3.3) normally **stops forwarding mic bytes during TTS**, barge-in needs a lightweight always-on **local VAD / input-level threshold** that runs even while the gate is closed:
- Use the capture module's input level (RMS) or a tiny on-device VAD. When sustained voice energy crosses a threshold for **≥ 150 ms** while `AudioSink.isPlaying`, fire barge-in: `stop()` the sink, `cancel()` the controller, open the gate, and resume forwarding mic bytes to Deepgram.
- The 150 ms debounce prevents the examiner's own audio (already AEC-suppressed, §4) or a cough from cutting off the question.

> **OWNER DECISION — barge-in arming policy.** Default: barge-in is **always armed** during examiner speech (most natural for an oral exam — the student can interrupt). Alternative: arm only after the examiner has spoken ≥ 1 full sentence (prevents the student's "uh-huh" backchannel from killing the question's first words). **This plan recommends always-armed with the 150 ms energy debounce**; revisit if the M3 spike shows false-positive cutoffs > 5%. Confirm or override.

**Qualitative "done":** the student can start answering over the examiner and the examiner voice stops within a perceptual instant; the partially-spoken sentence is abandoned cleanly (no audio tail, no queued sentences leak into the next turn).

**Measurable success criteria:**
- [ ] **Barge-in latency:** from sustained user voice onset to examiner audio silence **< 250 ms** on a physical device, median of 10 trials.
- [ ] **No tail:** after barge-in, **0** further TTS audio plays and the controller queue length is **0** (assert).
- [ ] **False-positive rate:** in a 5-minute quiet-room exam with no intentional interruptions, unintended barge-ins **< 1 per 5 minutes** (the AEC + 150 ms debounce must keep the examiner's own voice from self-triggering).
- [ ] **Recovery:** after barge-in the mic is forwarding to Deepgram within **< 150 ms** and the next interim transcript reflects the student's words.

### 3.3 The half-duplex gate (belt-and-suspenders with §4 AEC)

While `AudioSink.isPlaying`, **stop forwarding mic bytes to Deepgram** (keep the socket warm with KeepAlive, §1.4); resume on the `false` transition. This is deterministic and guarantees the examiner's TTS can never enter the transcript **even on devices with weak AEC**. It is the application-level half of the two-layer defense; OS-level AEC (§4) is the other half. Barge-in (§3.2) is the controlled exception that opens the gate early.

**Measurable:** with the gate active and TTS playing, **0 bytes** of mic audio are sent to Deepgram during the playing window (assert byte count == 0 over the window), and the socket stays open via KeepAlive (no reconnect).

---

## 4. Audio session — simultaneous record+playback + OS echo cancellation

The examiner may speak while the mic is hot (during barge-in, and at the turn boundary). The OS audio session must support full-duplex **and** echo-cancel the examiner voice so it is not transcribed.

### 4.1 iOS

- **Category `playAndRecord` + mode `.voiceChat`** (`AVAudioSessionModeVoiceChat`). `.voiceChat` switches on the platform **VoiceProcessingIO** audio unit → hardware AEC + AGC + noise suppression + full-duplex. This is the single switch that keeps the examiner out of the transcript.
- Add category options **`.allowBluetooth` + `.allowBluetoothA2DP`** for BT headsets / CarPlay (§6).
- `expo-audio`'s `setAudioModeAsync` exposes `allowsRecording`/`playsInSilentMode`/`shouldPlayInBackground`/`interruptionMode` but **not** category/mode/voiceChat — so a **native config-plugin/module** (or `react-native-audio-session`) sets `playAndRecord` + `.voiceChat`. `@speechmatics/expo-two-way-audio` packages this AEC for you (fallback A, §1.3).
- **Caveat:** `.voiceChat` aggressively routes/ducks (can shove output to the earpiece). Design the UI to expect a quieter/earpiece route and offer a speaker toggle.

### 4.2 Android

- Capture with **`MediaRecorder.AudioSource.VOICE_COMMUNICATION`** (the platform may insert AEC in this capture path) **and** explicitly attach **`AcousticEchoCanceler`** to the `AudioRecord` via `getAudioSessionId()`, guarded by `AcousticEchoCanceler.isAvailable()`. Requires **`MODIFY_AUDIO_SETTINGS`** permission. Do **not** use `VOICE_RECOGNITION` (the known-weak reference choice that has no AEC).

### 4.3 Hard caveat — AEC is device-only

OS AEC is **non-functional on the iOS Simulator / Android emulator.** Echo correctness MUST be judged on physical hardware (this is why §7's echo test and the entire M3 spike are device-bound). The §3.3 half-duplex gate is the deterministic backstop precisely because AEC quality varies by device.

**Qualitative "done":** in a quiet room, on physical iPhone and Android, the examiner's spoken question never appears (in whole or part) in the student's transcript, whether the gate is the primary defense or AEC is.

**Measurable success criteria:**
- [ ] **Echo-not-transcribed (gate ON):** scripted exam, examiner speaks 10 full sentences, gate active — **0** examiner words appear in the transcript (§7 threshold T4).
- [ ] **Echo-not-transcribed (gate OFF, AEC only):** with the half-duplex gate disabled for the test, examiner speaks 10 sentences at normal speaker volume in a quiet room — examiner-word leakage into the transcript **< 2%** of examiner words on a physical device (proves AEC is actually engaged, not just the gate).
- [ ] **Full-duplex proven:** during barge-in (gate open, both playing+recording for the overlap window) the mic still captures the student with WER within ±3 points of the non-overlapping case.
- [ ] Session config asserted at runtime: iOS category == `playAndRecord`, mode == `voiceChat`; Android `AcousticEchoCanceler.isAvailable()` checked and enabled where available (logged in spike).

---

## 5. Background behavior — examiner audio finishes; mic is foreground-only

The product behavior at lock/background: **the examiner's current sentence/turn finishes playing; the mic does not capture in the background.**

### 5.1 iOS

- **`UIBackgroundModes: [audio]`** in `Info.plist` (via the `expo-audio` config plugin, `enableBackgroundPlayback: true`) + `AVAudioSession` category `.playback` semantics for the background-playback window. This keeps TTS audible with the screen locked.
- **Background MIC capture is blocked by the OS:** a recording session **cannot be activated from the background** — capture must start in the **foreground**. So the locked-screen flow is **playback-only** (examiner finishing speaking); to capture the student's answer the app must be foregrounded. The UI must make this explicit (annunciator: "Tap to answer" only when foregrounded).
- **Do not abuse the audio mode:** the `audio` background mode must play **genuinely audible content** — App Review rejects silent-keepalive use. HeyDPE is compliant because it plays real TTS; **never** use background `audio` as a between-utterances keep-alive hack. (Full Apple gates in the App Store compliance doc.)

### 5.2 Android

- **`FOREGROUND_SERVICE_MEDIA_PLAYBACK`** permission + a media-playback foreground service so the examiner audio survives backgrounding; enable **lock-screen controls** (`player.setActiveForLockScreen(true, {title, artist})`) or background audio **stops after ~3 minutes**.
- Mic capture is likewise **foreground-only** by product policy; no background `RECORD_AUDIO` foreground service in v1.

**Qualitative "done":** locking the phone mid-examiner-turn lets the sentence finish playing; the app does not silently record in the background; returning to foreground cleanly re-enables capture.

**Measurable success criteria:**
- [ ] Lock the screen during a 3-sentence examiner turn → all 3 sentences finish playing with the screen locked (iOS + Android), 10/10 trials.
- [ ] No mic capture occurs while backgrounded: the **red recording indicator does not appear** on iOS while backgrounded (assert), and no transcript text is produced while backgrounded.
- [ ] Android background audio survives **> 3 minutes** with lock-screen controls enabled (play a long synthetic turn; assert audio still playing at 3:30).
- [ ] Foreground return re-arms capture within **< 500 ms** of `AppState` → `active`.

---

## 6. Interruptions — calls, Siri, notifications, route changes, Bluetooth, CarPlay

### 6.1 iOS

- Subscribe to **`AVAudioSession.interruptionNotification`** (phone/FaceTime call, Siri → `.began`/`.ended`) and **`routeChangeNotification`** (headset/BT/CarPlay plug/unplug).
- On **`.began`:** pause/stop `AudioSink` playback, tear down the mic tap, and **flush+KeepAlive or close** the Deepgram socket; mark the listening session interrupted.
- On **`.ended` with `.shouldResume`:** reactivate the session and re-tap the mic; resume playback only if the turn was mid-flight.
- **AVAudioEngine stops on interruption and must be explicitly restarted** — failing to restart leaves the session inconsistent (the single most-reported duplex bug). The native capture module must expose a restart hook the interruption controller calls.
- **Route changes** (BT connect/disconnect, CarPlay) often change the hardware sample rate/buffer — **re-read the actual hardware sample rate after a route change and re-assert `sample_rate=16000`** in the Deepgram URL contract (resample to 16k if the new route forces a different native rate) or transcripts garble.

### 6.2 Android

- Handle **`AudioManager.AUDIOFOCUS_*`** changes (transient loss for nav prompts/calls): on transient loss, pause capture + KeepAlive the socket; on regain, resume.
- Use **`AudioDeviceCallback`** for device add/remove (BT/wired). Mirror the practical resilience knobs the field references use: bounded read-failure retries and a small backoff to recover `AudioRecord` corruption after a route change.

### 6.3 The interruption controller (shared shape, native leaves)

A platform-neutral `InterruptionController` owns the state machine — `{ active → interrupted → resuming → active }` — and calls into the native session/capture/`AudioSink` leaves. It also drives the half-duplex gate (§3.3) and barge-in (§3.2) so all "who owns the audio right now" logic lives in one place.

**Qualitative "done":** an incoming call, a Siri invocation, a nav prompt, plugging in AirPods, and entering CarPlay each pause the exam cleanly and resume (or prompt to resume) without a hot-mic leak, a dead socket, or a garbled transcript.

**Measurable success criteria (each is a pass/fail spike scenario on a physical device):**
- [ ] **Phone call:** incoming call mid-turn → audio+mic pause; after hang-up the exam resumes (or shows a "Resume" annunciator) with the socket healthy; **0** transcript corruption.
- [ ] **Siri:** "Hey Siri" mid-turn → exam pauses, Siri works, exam resumes; **0** examiner audio lost beyond the current sentence.
- [ ] **Notification ding / nav prompt (Android transient focus loss):** capture pauses + KeepAlive keeps the socket; resumes within **< 1 s** of focus regain.
- [ ] **Route change (AirPods connect/disconnect, CarPlay):** post-change transcripts are **not** garbled — hardware sample rate is re-read and `sample_rate=16000` re-asserted; WER within ±3 points of the pre-change baseline.
- [ ] **AVAudioEngine restart:** after any iOS interruption, the engine is provably restarted (capture resumes producing frames) — **no** stuck/inconsistent session in 20 consecutive interrupt/resume cycles.

---

## 7. Measurable thresholds (the binding latency/quality budget)

These are the headline numbers; each is also referenced at its section. **All measured on a physical device, Wi-Fi, median of ≥ 10 trials, in the M3 spike.**

| ID | Metric | Threshold | Where measured | Cross-ref |
|----|--------|-----------|----------------|-----------|
| **T1** | Capture → first Deepgram interim | **< 800 ms** | first phoneme → first interim transcript | §1.3 |
| **T2** | TTS time-to-first-audio (TTFA) | **< 1.5 s on Wi-Fi** | first SSE token → first audible sample | §2.3 |
| **T3** | Gap-free 3-chunk playback | inter-sentence gap **< 120 ms** | device-side audio timeline over a 3-sentence turn | §2.3 |
| **T4** | Echo not transcribed (quiet room) | **0** examiner words with gate ON; **< 2%** leakage with AEC-only | scripted 10-sentence examiner turn | §3.3 / §4 |
| **T5** | Barge-in latency | **< 250 ms** voice onset → examiner silence | §3.2 |
| **T6** | One warm socket per exam | **0** idle-close reconnects in a 90 s exam | KeepAlive cadence 3–5 s | §1.4 |

**Qualitative "done" for §7:** the voice loop *feels* like a real conversation — the examiner answers promptly, sentences flow without seams, the student can interrupt naturally, and the examiner never hears itself. **Measurable "done":** **all of T1–T6 pass simultaneously** in a single end-to-end M3 spike run on a physical iPhone (and the same suite green on a physical Android before Android GA). A single failing threshold blocks the M3 gate.

---

## 8. Threading & lifecycle ownership (so nothing fights over the mic)

A short, explicit ownership model prevents the classic duplex bugs:

- **One `VoiceSession` object** per exam owns: the capture module, the `AudioSink`, the `SentenceTTSController`, the `InterruptionController`, and the Deepgram socket. Nothing else touches audio APIs.
- **State machine:** `idle → listening → examiner_speaking (gate closed) → [barge-in] → listening → … → ended`. The gate (§3.3), background policy (§5), and interruptions (§6) are transitions on this one machine.
- **Teardown is exhaustive:** ending the exam (or unmount) stops capture, deactivates the audio session, closes the socket with `CloseStream`, clears temp files, and reports usage — mirroring web `stopListening` (`useDeepgramSTT.ts:85-120`) and `stopSpeaking` (`useVoiceProvider.ts:246-263`).

**Measurable:** after 5 consecutive start→barge-in→interrupt→end cycles, there are **0** leaked audio sessions, **0** open sockets, **0** orphan temp files, and the mic input indicator is **off** (assert each at end-of-cycle).

---

## 9. Telemetry parity (so the mobile loop is observable like the web loop)

Mirror the web voice telemetry (`src/lib/voice-telemetry.ts` events such as `stt_websocket_connect_started`, `stt_websocket_connected`, `stt_websocket_closed`, `stt_reconnect_attempted/succeeded/exhausted`, `stt_recorder_failed`) plus the timing logs (`[VOICE-TIMING]` TTS ready / playback done in `useVoiceProvider.ts:169, 184`). Add mobile-specific events: `audio_session_configured` (category/mode), `aec_available` (Android), `barge_in_fired`, `half_duplex_gate_open/close`, `interruption_began/ended`, `route_changed`.

**Qualitative "done":** every threshold in §7 can be reconstructed from telemetry alone, post-hoc, without a debugger attached.

**Measurable:** each of T1–T6 has a corresponding emitted metric (TTFA ms, first-interim ms, inter-sentence gap ms, barge-in ms, idle-close count, echo-leak count) visible in PostHog within one exam session; the M3 spike report is generated **from these events**, not from manual stopwatch readings.

---

## 10. Test & proof plan

1. **Shared-package unit tests (CI, every PR):** the 21 `sentence-boundary` tests run green from `packages/shared`; the `SentenceTTSController` golden-trace test (§2.4) runs on Node with a mocked sink.
2. **`AudioSink` conformance suite:** runs against both the web sink and `ExpoAudioSink` (resolve-on-END, idempotent stop, prefetch hit/miss, onPlayingChange).
3. **M3 spike (the proof gate):** the full device matrix in `docs/mobile/08-VOICE-SPIKE-M3.md` measures T1–T6 on physical hardware. **The voice pipeline is not "done" until the M3 spike is green.**
4. **TestFlight dogfood:** a real 30-exchange checkride on a physical device over (a) Wi-Fi and (b) LTE, with AirPods and CarPlay exercised, before external beta.

**Measurable gate:** M3 ships only when (1)+(2) are green in CI **and** (3) reports all of T1–T6 passing on a physical iPhone, with the device-only echo test (§4.3 caveat) explicitly run on hardware (not simulator).

---

## 11. Voice UI — FLIGHT DECK typography rule (applied)

Per `docs/mobile/02-DESIGN-SYSTEM.md` §1, **caps-mono + glow is ONLY for instrument moments**; everything else is sentence-case IBM Plex; never 10 px text; touch targets **≥ 44 pt iOS / 48 dp Android**.

- **Annunciators (caps-mono, glow OK):** `LISTENING`, `EXAMINER SPEAKING`, `MUTED`, `RECONNECTING`, `TAP TO ANSWER` — these read like cockpit annunciator lights.
- **Micro-labels (caps-mono, sentence-case after `//`):** `// Voice`, `// Mic`, `// Examiner`.
- **Numeric readouts (mono, `tabular-nums`):** live input-level meter, elapsed exam timer, exchange count.
- **Everything else (sentence-case IBM Plex):** the transcript text, interim text, error toasts ("Voice connection lost. Tap the mic to resume."), the upgrade/quota copy.
- **The mic button** is the primary instrument control: ≥ 44 pt hit target, glowing amber while `LISTENING`, dim while examiner speaks; barge-in is implicit (just start talking) but the button also stops the examiner on tap.

**Measurable:** UI audit confirms (a) no caps-mono+glow on non-instrument text, (b) no text < 11 px, (c) every interactive voice control ≥ 44 pt / 48 dp, (d) the four annunciator states are mutually exclusive and always reflect the §8 state machine.

---

## 12. VERIFY-AT-SUBMISSION (do not ship on these without re-checking)

These are the load-bearing unknowns from research; each must be re-confirmed against the pinned version at build/submission time:

1. **`@siteed/expo-audio-studio`** is **New-Architecture compatible** at the pinned version (built as an Expo module → expected, not explicitly stated). If not, fall back to `expo-audio` `useAudioStream()` (first-party, NewArch by construction).
2. **`@speechmatics/expo-two-way-audio`** has a **tagged/published release** before adopting it as fallback A (no release tag at research time).
3. **`expo-audio` memory/data-URI source** (vs temp-file) is gap-free at the pinned SDK — if not, use the temp-file path (§2.3 option 1), which is the safe default.
4. **`react-native-audio-session`** (if used for the iOS `.voiceChat` switch instead of a local config-plugin) is NewArch-compatible at its pinned version.
5. **Deepgram `auth/grant` TTL + rate-limit** (`ttl_seconds: 600`, 4/min) unchanged — re-verify the token reuse strategy (§1.1) still holds.
6. **iOS `.voiceChat` earpiece-routing behavior** at the current iOS version — confirm the speaker toggle in §4.1 still needed.
7. **Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK`** declaration requirements (Play Console foreground-service-type review) for the §5.2 background-playback service.

---

## Appendix A — Port-size map (what moves where)

| Piece | Source | LOC | Destination / port type |
|---|---|---|---|
| Sentence boundary | `src/lib/voice/sentence-boundary.ts` | 146 | `packages/shared` **verbatim** (+21 tests); web re-imports |
| Queue/drain/prefetch | `src/hooks/useSentenceTTS.ts` | 205 | `SentenceTTSController` in `packages/shared` (~80% logic verbatim, ~20% React shell rewritten) |
| `AudioSink` interface | new | — | `packages/shared/voice/audio-sink.ts` (interface only) |
| TTS play/prefetch | `src/hooks/useVoiceProvider.ts` | 297 | `ExpoAudioSink` (apps/mobile) — ~70% native rewrite; **keep prefetch-Map + resolve-on-END** |
| STT capture/WS | `src/hooks/useDeepgramSTT.ts` | 509 | native capture module + WS transport (apps/mobile) — ~50% native; reconnect constants verbatim (§1.5) |
| TTS adapter | `src/lib/voice/tts/deepgram-tts.ts` | — | server-side, **unchanged** |
| Voice types/contract | `src/lib/voice/types.ts` | 89 | server/shared, **unchanged** |
| TTS API | `src/app/api/tts/route.ts` | 197 | server, **unchanged** (mobile is a client; Bearer via doc 01) |
| STT token API | `src/app/api/stt/token/route.ts` | 211 | server; **add `client=native` → linear16/16k URL params** (§1.2) |
| `useStreamingPlayer.ts` | — | — | **does not exist (deleted) — skip** |

---

*Last updated: 2026-06-15. Authoritative source citations are `file:line` against the repo at the path in the env header. Proof gate: `docs/mobile/08-VOICE-SPIKE-M3.md`.*
