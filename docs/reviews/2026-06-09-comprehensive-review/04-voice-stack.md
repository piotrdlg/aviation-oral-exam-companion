# Review 04 — Voice Stack (TTS/STT) + June 2026 Market Check

> Date: 2026-06-09 · Reviewer: AI agent (code review + web market research)
> Scope: src/lib/voice/, voice hooks, /api/tts, /api/stt, docs 65–71 incident history

## Incident history context (docs 65–71)

P0/P1 incident chain on 2026-03-06: (Phase A) Deepgram 400 from `sample_rate`+`encoding=mp3`; (Phase B) Safari autoplay rejection + Firefox MIME blob failure; (Phase C) missing CSP `media-src`. Root design flaw: a tier migration (commit `e80d682`) silently moved playback from MP3/HTMLAudioElement to a PCM AudioWorklet pipeline that never worked in Firefox/Safari. Resolution: **abandon streaming PCM entirely, force MP3 + HTMLAudioElement everywhere**. Doc 71 then fixed 4 latent bugs to activate the 3-chunk sentence-stream path. Several "Next steps" from docs 69/70 remain unfixed (quota bug, dead code).

## Code findings

1. **Premium Cartesia tier doesn't exist in code — all tiers route to Deepgram Aura-2**
   `src/lib/voice/types.ts:57-85` — Severity: High (product/architecture drift)
   `TIER_FEATURES` sets `ttsProvider: 'deepgram'` for all three tiers, so `createTTSProvider()` never returns Cartesia. The "tiered Cartesia (premium) / Deepgram (standard)" story in CLAUDE.md is fiction; `cartesia-tts.ts` is dead code (confirmed doc 68 §4). If ever activated, Cartesia outputs `pcm_f32le` (`cartesia-tts.ts:57`) — **incompatible with the MP3-only HTMLAudioElement playback path**; it would reproduce the March silence incident. Fix: either delete the adapter and update docs, or wire it with `container: 'mp3'` and a real tier mapping.

2. **TTS character quota counts rows, not characters — cost cap is unenforced**
   `src/app/api/tts/route.ts:72-78` — Severity: High (cost control)
   `select('*', { count: 'exact', head: true })` counts usage_log *rows*, then compares against a 500,000-**character** limit. A user would need 500K *requests* to trip it. Flagged in doc 69 §4 (March 2026), still open. Fix: sum `quantity` (RPC or `select('quantity.sum()')`).

3. **Fallback chain only covers module import, never runtime API failures**
   `src/lib/voice/provider-factory.ts:14-33` — Severity: High (reliability)
   The try/catch wraps `importProvider()` (dynamic import + constructor) which essentially never fails. When Deepgram returns 429/5xx, `provider.synthesize()` throws in the route → client 500 → sentence skipped (`useSentenceTTS.ts:120-124` swallows per-sentence errors). The Cartesia→Deepgram→OpenAI fallback never executes. Fix: move fallback to wrap `synthesize()` calls with per-provider error classification.

4. **No timeout or retry on upstream TTS fetches**
   `src/lib/voice/tts/deepgram-tts.ts:64`, `cartesia-tts.ts:40` — Severity: Medium
   A hung Deepgram response holds the Vercel function and stalls the client drain loop. Fix: `AbortSignal.timeout(8000)` + single retry, then fallback per finding 3.

5. **Sentences ending in a decimal or reg reference never split — latency spike + bad prosody**
   `src/lib/voice/sentence-boundary.ts:114-121` — Severity: Medium (aviation-specific)
   The catch-all `\d+\.\d+` window test in `isFAAReference()` looks at `buffer.slice(periodIndex-5, periodIndex+4)`. For "…contact approach on 121.5. What would…", the terminal period matches and the real boundary is rejected; sentence only flushes at the 200-char force-cut. Fix: require a digit *immediately after* the period in the general pattern (the dedicated `isDecimalNumber()` already does this correctly).

6. **Time-to-first-audio path has 3 serial DB hits per sentence and no streamed playback**
   `src/app/api/tts/route.ts:39-78`, `src/hooks/useVoiceProvider.ts:145-165` — Severity: Medium (latency)
   Per sentence: `auth.getUser()` round-trip + system_config + monthly-usage count, then a non-streaming `/v1/speak` call, then the client awaits the **entire** `arrayBuffer()` before playback — starts at full-download, not TTFB. Prefetch hides this between chunks, but first-sentence TTFA = SSE wait + boundary + API overhead + full synthesis + full download. Mitigations: cache auth per session, batch the quota check, consider Deepgram TTS WebSocket streaming when a streaming-capable player returns (native mobile).

7. **No mid-session STT reconnect; mic stays hot and audio is silently lost after a drop**
   `src/hooks/useDeepgramSTT.ts:203-215` — Severity: High (reliability)
   Retry exists only at connect time. If the WebSocket closes mid-answer, MediaRecorder keeps running; `ondataavailable` drops frames; `streamRef` tracks never stopped. Everything said after the drop is lost. Fix: on abnormal close while `!userStopped`, stop recorder, reconnect with cached token (TTL 10 min), restart, surface "reconnecting".

8. **MediaRecorder fallback never requests `audio/mp4` — older iOS Safari hangs instead of erroring**
   `src/hooks/useDeepgramSTT.ts:143-150` — Severity: High (browser-compat goal)
   Fallback from `audio/webm;codecs=opus` is `audio/webm` — also unsupported on Safari < 18.4. The constructor throw happens inside `ws.onopen`, so the connect promise neither resolves nor rejects → `startListening()` hangs with no timeout. Doc 68's validation matrix claims "iOS Safari: MediaRecorder uses audio/mp4" but the code never asks for it. Fix: probe `audio/mp4` (Deepgram accepts containerized AAC), wrap recorder construction in try/catch rejecting the promise, add a connect timeout.

9. **Aviation custom vocabulary silently disabled despite `customVocabulary: true`**
   `src/app/api/stt/token/route.ts:114-125`, `types.ts:51` — Severity: Medium (accuracy)
   WS URL was stripped because "30 repeated `keywords=` params caused Deepgram to reject the handshake." But `keywords=` is the Nova-2 parameter; **Nova-3 uses `keyterm=`** (paid add-on, ~$0.0013/min). Result: METAR/NOTAM/VOR/V-speeds get no boost. Fix: re-add curated aviation list via `keyterm`, verify handshake.

10. **Free tier can mint STT tokens — STT has no tier gate or seconds quota**
    `src/app/api/stt/token/route.ts:23` (docstring claims "Tier 2/3 only" — no code enforces it); `usage.ts:16-57` has no STT branch despite tracking `sttSecondsThisMonth` — Severity: Medium (cost leak, noted doc 65, still open)

11. **`hasTtsAccess` contradicts `TIER_FEATURES`**
    `src/lib/voice/usage.ts:63-65` vs `types.ts:58-66` — Severity: Low
    ground_school denied TTS by `hasTtsAccess()` yet `TIER_FEATURES` grants it a deepgram provider and 500K chars/month.

12. **Dead code flagged in March still shipping**: `useStreamingPlayer.ts` (no imports), `public/audio-worklet/pcm-playback-processor.js`, the Cartesia adapter, `browser-detect.ts:supportsSpeechRecognition` — Severity: Low, but it's the code class that caused the March incident.

13. **`audio-unlock.ts` gesture warm-up is fragile and was already missed once**
    `src/lib/audio-unlock.ts:40-74`, call sites `practice/page.tsx:567,697,1384` — Severity: Medium
    Every new TTS-triggering gesture handler must remember a synchronous `warmUpAudio()` call (doc 69: `resumeSession()` was missed, shipped broken on Safari). The `unlocked` flag is never set by the AudioContext branch. None of this hack class translates to native mobile.

14. **OpenAI fallback still uses `tts-1`, non-streaming**
    `src/lib/voice/tts/openai-tts.ts:8,14` — Severity: Low
    `gpt-4o-mini-tts` superseded tts-1. Adapter buffers the whole file, making the worst-case fallback also the slowest.

## Cost model

Assumptions from code: structured responses capped at 120 words ≈ ~740 chars (`exam-logic.ts:231`), non-structured ~370; realistic average **~550 chars/examiner turn**. TTS route truncates at 2,000 chars. STT mic-open ≈ 40s/answer.

Per 30-exchange session: TTS ≈ 16,500 chars; STT ≈ 20 min.

| Tier (actual provider in code) | TTS cost | STT cost | Total/session |
|---|---|---|---|
| ground_school (TTS blocked; STT ungated) | $0 | 20 min × $0.0077 = $0.154 | ~$0.15 |
| checkride_prep (Aura-2) | 16.5K × $0.030/1K = $0.50 | $0.154 | **~$0.65** |
| dpe_live (Aura-2 — *not* Cartesia) | $0.50 | $0.154 | **~$0.65** |
| (hypothetical) dpe_live on Cartesia Sonic-3 | 16.5K × $35/M = $0.58 | $0.154 | ~$0.73 |
| (fallback) OpenAI tts-1 | $0.25 | — | — |

Monthly worst case at the 60-session cap: checkride_prep ≈ **$39/user/month** voice cost — material against subscription pricing; the 500K-char cap that should bound this (≈$15 of Aura-2) is not enforced (finding 2). Claude examiner calls are additional and larger.

OpenAI Realtime S2S comparison: $0.05–0.10/min cached ($0.18–0.46 uncached) → 40-min session = $2–4 (cached) to $7–18 (uncached) — 3–28× current voice cost, and it would replace the Claude examiner.

## Market assessment (mid-2026)

| Option | Type | Latency | Price | Native mobile SDK | Notes |
|---|---|---|---|---|---|
| Deepgram Nova-3 (current STT) | STT stream | <300ms | $0.0077/min | Raw WebSocket works anywhere | Keyterm prompting available but unused |
| **Deepgram Flux (GA Apr 2026)** | Conversational STT + turn detection | <300ms median end-of-turn | similar | same | Would replace the crude `utterance_end_ms=1500` silence wait — biggest perceived-latency win available |
| AssemblyAI Universal-Streaming | STT stream | ~300ms | $0.15/hr (~3× cheaper) | WebSocket | Keyterms prompting; credible plan-B |
| OpenAI gpt-4o-transcribe / -mini | STT | streaming via Realtime | $0.006 / $0.003/min | OpenAI SDKs | No turn-detection advantage |
| Deepgram Aura-2 (current TTS) | TTS | ~200-400ms TTFB | $0.030/1K chars | REST | Adequate, mid-pack quality |
| Cartesia Sonic-3 / Sonic 4 | TTS stream | 90ms/~40ms TTFA | ~$35/M chars | WebSocket/REST; no official mobile SDK | Best latency; currently dead code |
| ElevenLabs Flash v2.5 | TTS stream | ~75ms | $0.05/1K chars | **Official Swift, Kotlin, React Native SDKs** | Best persona quality + best mobile story |
| OpenAI gpt-4o-mini-tts | TTS | moderate | ~$0.015/min audio | OpenAI SDKs | Better fallback than tts-1 |
| OpenAI Realtime (gpt-realtime-2) | **S2S** | 200-300ms v2v | $32/M in, $64/M out | WebRTC | Would replace Claude examiner; loses assessment pipeline |
| Gemini Live (Flash Live) | S2S | low | ~$0.002/min class | Google SDKs | Cheapest S2S; same architectural objection |

**Recommendation: keep the cascaded STT→Claude→TTS pipeline; upgrade components, not architecture.**

1. **Do not move to speech-to-speech.** 2026 industry consensus still favors cascaded for production (<15% S2S adoption; debuggability, provider flexibility, transcript auditability). HeyDPE's case is stronger: the product *is* the two-call Claude architecture — `assessAnswer()` element scoring, RAG citations, ACS coverage tracking, prompt-versioned personas all require text in the middle. S2S would discard the assessment engine for 3–28× the cost.
2. **STT: stay with Deepgram, pilot Flux** (model-based end-of-turn detection replacing the fixed 1.5s silence wait). Restore aviation vocabulary via `keyterm`. AssemblyAI is a credible 3×-cheaper plan-B; keep the token endpoint provider-agnostic.
3. **TTS: make the tier story real, one way or the other.** Either (a) commit to Aura-2 single-provider and delete the Cartesia/PCM dead code, or (b) actually ship a premium voice for `dpe_live` — ElevenLabs Flash v2.5 or Cartesia Sonic-3 *configured for MP3 output* (~$0.58–0.83/session). ElevenLabs is stronger if mobile apps are imminent (first-party Swift/Kotlin SDKs).
4. **Fix the reliability gaps first** (findings 2, 3, 7, 8) — they matter more than any provider swap.

## Mobile implications

**Reusable as-is (server side):** `/api/tts` route, provider adapters, quota/tier/kill-switch logic, `/api/stt/token` ephemeral-JWT pattern, usage logging, system_config. `sentence-boundary.ts` and `useSentenceTTS` queue/drain logic are pure TS — portable to RN or translatable.

**Must be rebuilt for native:**
- **Audio capture**: MediaRecorder/Opus-WebM → AVAudioEngine (iOS) / AudioRecord (Android) emitting raw linear16 PCM (Deepgram prefers it) + OS echo cancellation.
- **Audio playback**: HTMLAudioElement + blob URLs → AVAudioPlayer/ExoPlayer. Native players can do true streamed playback, removing the full-download limitation and re-opening streaming PCM TTS (Cartesia) that web had to abandon.
- **All browser-policy hacks become deletable**: audio-unlock, silent-WAV warm-up, CSP media-src, MP3-only forcing, blob MIME workarounds. The March incident class disappears on native.
- **Hooks**: `useDeepgramSTT`/`useVoiceProvider` are web-API-bound; rewrite. ElevenLabs ships official Swift/Kotlin/RN SDKs; Deepgram/Cartesia are raw WebSocket/REST; LiveKit/Pipecat client SDKs are the managed-transport option.
- **Design caution**: the web stack's deepest fragility was the playback layer. For mobile, define a thin `AudioSink` interface per platform up front so provider/encoding choices stop being architecture decisions.

## Sources

- Deepgram pricing: https://deepgram.com/pricing · Flux: https://deepgram.com/learn/introducing-flux-conversational-speech-recognition · Flux Multilingual GA: https://deepgram.com/learn/deepgram-launches-flux-multilingual-press-release
- Cartesia: https://www.cartesia.ai/pricing · https://www.eesel.ai/blog/cartesia-sonic-3-pricing · https://artificialanalysis.ai/text-to-speech/model-families/cartesia
- ElevenLabs: https://elevenlabs.io/pricing/api · https://elevenlabs.io/docs/overview/models · https://github.com/elevenlabs/elevenlabs-swift-sdk · https://elevenlabs.io/docs/eleven-agents/libraries/react-native
- AssemblyAI: https://www.assemblyai.com/universal-streaming · https://www.assemblyai.com/pricing
- OpenAI: https://openai.com/api/pricing/ · https://openai.com/index/introducing-gpt-realtime/ · https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026
- Architecture: https://www.coval.ai/blog/speech-to-speech-vs-cascaded-voice-ai-which-architecture-should-you-deploy · https://deepgram.com/learn/speech-to-speech-vs-cascade-voice-agent-architecture
