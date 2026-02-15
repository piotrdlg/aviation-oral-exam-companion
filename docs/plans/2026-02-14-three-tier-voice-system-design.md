# Three-Tier Voice Quality System — Technical Design Document

**Project**: Aviation Oral Exam Companion
**Date**: 2026-02-14
**Author**: Claude (Opus 4.6)
**Status**: APPROVED by GPT-5.2 (unconditional approval, Round 4)
**Review History**:
- v1: 15 objections from GPT-5.2
- v2: All 15 addressed → 7 new objections
- v3: All 7 addressed → 5 new objections
- v4: All 5 addressed → **APPROVED** (2 non-blocking implementation notes incorporated below)

---

## 1. Executive Summary

This document describes the complete technical architecture for a three-tier voice quality system in the Aviation Oral Exam Companion. Each tier represents a distinct product offering with different voice AI providers, latency characteristics, and cost profiles.

**Cost assumptions**: p90 estimates (worst-case heavy user). 15 exchanges/session, ~800 chars/examiner response (p90), ~30s avg student answer duration (p90).

**Per-session costs are variable-only (no amortized base fees). See Section 8 for full derivation.**

| Tier | Brand Name | Monthly Price | Per-Session Cost (median / p90) | Target Latency |
|------|-----------|--------------|-------------------------------|----------------|
| 1 | **Ground School** | $9.99 | $0.30 / $0.51 | 2-4s |
| 2 | **Checkride Prep** | $24.99 | $0.45 / $0.75 | 0.8-1.5s |
| 3 | **DPE Live** | $49.99 | $0.51 / $0.86 | 0.3-0.8s |

---

## 2. Tier Definitions

### Tier 1: Ground School (Current Stack)

**Tech Stack:**
- LLM: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- TTS: OpenAI TTS (`tts-1`, voice `onyx`, MP3)
- STT: Browser Web Speech API (Chrome-native)

**Characteristics:**
- Non-streaming TTS (full audio buffer returned)
- Browser-native STT (free, Chrome-only)
- Streaming LLM responses (SSE, already implemented)
- Parallel LLM calls (examiner + assessment, already implemented)

**Cost Per Session (see Section 8 for full derivation):**

| Component | Median (12 exch) | p90 (15 exch) |
|-----------|-----------------|---------------|
| Claude Sonnet (LLM) | $0.19 | $0.33 |
| OpenAI TTS | $0.11 | $0.18 |
| Browser STT | $0.00 | $0.00 |
| **Per session** | **$0.30** | **$0.51** |

### Tier 2: Checkride Prep (Deepgram Upgrade)

**Tech Stack:**
- LLM: Claude Sonnet 4.5 (same as Tier 1)
- TTS: Deepgram Aura-2 (`aura-2-thalia-en`, REST streaming via server, linear16)
- STT: Deepgram Nova-3 (client-side WebSocket via temporary token, interim results)

**Characteristics:**
- Streaming TTS via server-side REST (audio chunks arrive in ~200ms, chunked transfer encoding)
- Cloud STT with 6.84% WER (54% better than browser Web Speech API)
- Custom vocabulary support for aviation terms (METAR, NOTAM, VOR, etc.)
- Works in all browsers (not Chrome-only)
- Single vendor for both STT and TTS (simpler integration)

**Cost Breakdown (median / p90):**

| Component | Median (12 exch, 600 ch) | p90 (15 exch, 800 ch) |
|-----------|--------------------------|------------------------|
| Claude Sonnet | $0.19 | $0.33 |
| Deepgram Aura-2 TTS | $0.22 (7,200 ch × $0.030/1K) | $0.36 (12,000 ch × $0.030/1K) |
| Deepgram Nova-3 STT | $0.04 (12 × 20s = 4 min × $0.0077) | $0.06 (15 × 30s = 7.5 min × $0.0077) |
| **Per session** | **$0.45** | **$0.75** |

### Tier 3: DPE Live (Cartesia + Deepgram)

**Tech Stack:**
- LLM: Claude Sonnet 4.5 (same)
- TTS: Cartesia Sonic-3 (server-side REST streaming, sub-90ms TTFB at origin, ~150ms with server hop)
- STT: Deepgram Nova-3 (client-side WebSocket via temporary token, same as Tier 2)

**Characteristics:**
- Ultra-low-latency TTS (50-90ms time-to-first-byte)
- Natural emotion and laughter in speech (SSM-based model)
- Sub-second total voice round-trip latency
- Most realistic DPE simulation experience

**Cost Breakdown (median / p90):**

Cartesia pricing is credit-based (1 credit = 1 character). Plan economics:

| Cartesia Plan | Base Cost | Included Credits | Effective Rate/1K chars | Break-even Sessions |
|--------------|----------|-----------------|------------------------|-------------------|
| Pro ($5/mo) | $5 | 100K | $0.050 | 14 sessions (at 7,200 ch) |
| Startup ($49/mo) | $49 | 1.25M | $0.039 | 174 sessions |
| Scale ($299/mo) | $299 | 8M | $0.037 | 1,111 sessions |

**Recommended plan progression:**
- Development: Pro ($5/mo)
- 1-20 Tier 3 users: Startup ($49/mo) — 1.25M credits covers ~174 median sessions
- 20+ Tier 3 users: Scale ($299/mo) — 8M credits covers ~1,111 median sessions

| Component | Median (12 exch, 600 ch) | p90 (15 exch, 800 ch) |
|-----------|--------------------------|------------------------|
| Claude Sonnet | $0.19 | $0.33 |
| Cartesia Sonic-3 TTS (Startup rate) | $0.28 (7,200 ch × $0.039/1K) | $0.47 (12,000 ch × $0.039/1K) |
| Deepgram Nova-3 STT | $0.04 | $0.06 |
| **Per session (variable only)** | **$0.51** | **$0.86** |

**Tier 3 break-even subscriber count (Startup plan at $49/mo base):**
- At 12 sessions/user/month: variable cost = 12 × $0.51 = $6.12/user + $49 amortized
- Revenue per user: $49.99
- With 3 Tier 3 users: $49/3 = $16.33 amortized + $6.12 variable = $22.45/user → margin $27.54 (55%)
- With 1 Tier 3 user: $49 + $6.12 = $55.12 → **negative margin (-$5.13)**
- **Minimum Tier 3 users to break even: 2** (at median usage)
- **Safe launch threshold: 5 Tier 3 users** (comfortable margin even at p90 usage)

---

## 3. Architecture Overview

### 3.1 Provider Abstraction Layer

A unified interface abstracts all voice providers, allowing the API routes to be tier-agnostic.

```
src/lib/voice/
├── types.ts              # Shared interfaces
├── provider-factory.ts   # Creates provider by tier, with fallback chain
├── tts/
│   ├── openai-tts.ts     # Tier 1: OpenAI TTS REST (existing, wrapped)
│   ├── deepgram-tts.ts   # Tier 2: Deepgram Aura-2 REST streaming
│   └── cartesia-tts.ts   # Tier 3: Cartesia Sonic-3 REST streaming
├── stt/
│   ├── browser-stt.ts    # Tier 1: Web Speech API (client-side only)
│   └── deepgram-stt.ts   # Tier 2/3: Deepgram Nova-3 WebSocket
└── playback/
    └── audio-worklet-player.ts  # AudioWorklet-based jitter buffer for streaming playback
```

### 3.2 Core Interfaces

```typescript
// src/lib/voice/types.ts

export type VoiceTier = 'ground_school' | 'checkride_prep' | 'dpe_live';

export interface TTSProvider {
  readonly name: string;
  readonly supportsStreaming: boolean;
  /**
   * Synthesize text to audio.
   * ALWAYS returns ReadableStream<Uint8Array> for uniform handling.
   * Non-streaming providers wrap their buffer in a single-chunk stream.
   */
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface TTSOptions {
  voice?: string;
  sampleRate?: 24000 | 44100 | 48000;
}

export interface TTSResult {
  /** Audio data — always a Web ReadableStream for uniform handling */
  audio: ReadableStream<Uint8Array>;
  /** Content type for HTTP response */
  contentType: string;
  /** Audio encoding metadata for client-side decoding */
  encoding: 'mp3' | 'linear16' | 'pcm_f32le';
  sampleRate: number;
  channels: 1 | 2;
  /** Time-to-first-byte in ms (for monitoring) */
  ttfbMs: number;
}

export interface STTConfig {
  readonly name: string;
  readonly isServerSide: boolean;
  /** Custom vocabulary terms for aviation */
  readonly customVocabulary?: string[];
}
```

**[Fix #14]** All providers return `ReadableStream<Uint8Array>` (Web Streams API). OpenAI TTS wraps its Buffer in a single-chunk ReadableStream. No `Buffer | ReadableStream` union — uniform handling everywhere.

### 3.3 Connection Topology

**[Fix #10]** Clarifying where WebSocket connections terminate and Vercel compatibility:

| Connection | Tier 1 | Tier 2 | Tier 3 |
|-----------|--------|--------|--------|
| STT | Browser-native (no server) | Client → Deepgram direct (via temp token) | Client → Deepgram direct (via temp token) |
| TTS | Client → `/api/tts` → OpenAI REST → Client | Client → `/api/tts` → Deepgram REST streaming → Client | Client → `/api/tts` → Cartesia REST streaming → Client |
| LLM | Client → `/api/exam` (Node serverless, SSE) | Same | Same |

**All connections are either browser-native, client-to-provider-direct (STT only), or client→server→provider (TTS, LLM). No long-lived WebSockets on our server.**

**Key decisions:**
1. **STT (Tier 2/3)**: Client connects directly to Deepgram via temporary token. No server proxy. Avoids Vercel WebSocket limitations entirely.
2. **TTS (all tiers)**: Server-side via Node serverless `/api/tts` route. Each provider uses its REST API with streaming response (chunked transfer encoding). Vercel serverless supports streaming up to 25 seconds (sufficient for any single TTS response). **Cartesia API key is NEVER exposed to the browser.** This costs ~20-50ms extra latency vs client-direct but eliminates the key-exposure security risk entirely.
3. **LLM**: Existing SSE streaming via Node serverless. Already working on Vercel.
4. **Why not client-side Cartesia?** Cartesia does not offer ephemeral/scoped tokens. Exposing the API key in the browser would make it exfiltratable. Server-side proxy keeps the key safe at the cost of one extra network hop (~30ms), which is acceptable given Cartesia's 90ms TTFB — total TTFB remains ~120-150ms, well within the 0.3-0.8s target.

### 3.4 Data Flow Per Tier

**Tier 1 (Ground School) — Current flow:**
```
Browser Mic → Web Speech API (browser) → text
text → POST /api/exam (SSE stream, Node serverless) → examiner text
examiner text → POST /api/tts (Node serverless) → OpenAI REST API → MP3 buffer → Audio playback
```

**Tier 2 (Checkride Prep) — Deepgram flow:**
```
Browser Mic → MediaRecorder (Opus/WebM) → WSS Deepgram direct (temp token) → transcript
transcript → POST /api/exam (SSE stream) → examiner text
examiner text → POST /api/tts (Node serverless) → Deepgram REST streaming → PCM chunks → AudioWorklet playback
```

**Tier 3 (DPE Live) — Server-side Cartesia + sentence streaming:**
```
Browser Mic → MediaRecorder (Opus/WebM) → WSS Deepgram direct (temp token) → transcript
transcript → POST /api/exam (SSE stream) → examiner text tokens (streamed)
LLM tokens → client sentence buffer → POST /api/tts per sentence → Cartesia REST streaming → PCM chunks → AudioWorklet playback
```
Note: Each sentence is a separate `/api/tts` request. Server connects to Cartesia REST API per request — no long-lived WebSocket on server.

**Pipelining constraints:**
- **Max 2 concurrent in-flight `/api/tts` requests per client.** Additional sentences queue client-side.
- **Max text length per request: 500 chars.** Longer sentences are split at the nearest word boundary.
- **Server-side hard timeout: 20 seconds per request** (Vercel serverless limit is 25s; 20s gives headroom).
- **Provider rate limiting**: If Cartesia/Deepgram returns 429, client backs off exponentially (1s, 2s, 4s) before retrying. Max 3 retries per sentence, then skip.
- **Global concurrency**: At peak (50 concurrent Tier 3 users × 2 in-flight = 100 concurrent serverless invocations), this is within Vercel Pro's default concurrency limits. Monitor and adjust if needed.

---

## 4. API Design

### 4.1 Updated TTS Route (`/api/tts`)

**Runtime: Node.js serverless** (not Edge — needs SDK imports)

```typescript
// POST /api/tts
// Request: { text: string }
// Response: ReadableStream of audio

// The route:
// 1. Authenticates user
// 2. Looks up user's tier from user_profiles table
// 3. Verifies usage quota not exceeded (see Section 9.4)
// 4. Creates appropriate TTS provider via factory (OpenAI for T1, Deepgram for T2)
// 5. Calls provider.synthesize(text)
// 6. Logs usage to usage_logs (chars, provider, latency)
// 7. Returns ReadableStream with Content-Type and encoding headers
// Max duration: 25s (Vercel serverless limit, sufficient for any single response)
```

**All tiers use `/api/tts`**. The route selects the correct provider (OpenAI / Deepgram / Cartesia) based on user tier. Cartesia API key stays server-side — never exposed to browser.

### 4.2 STT Token Route (`/api/stt/token`) — Tier 2/3

**[Fix #3, #9]** Redesigned for robustness:

```typescript
// GET /api/stt/token
// Response: { token: string, url: string, expiresAt: number }

// The route:
// 1. Authenticates user
// 2. Verifies user's tier is checkride_prep or dpe_live
// 3. Rate limit: max 4 tokens per user per minute (prevents abuse)
// 4. Logs token issuance to usage_logs
// 5. Requests temporary token from Deepgram API
// 6. Returns token + pre-built WebSocket URL with query params

// Token lifecycle on client:
// - Token has 30-second TTL from Deepgram
// - Client opens WebSocket with token immediately after receiving it
// - Once WebSocket is OPEN, the connection persists regardless of token expiry
//   (Deepgram validates token only at connection time, not during the session)
// - Client requests new token ONLY when opening a NEW WebSocket connection
//   (e.g., after page reload or explicit disconnect)
// - No periodic token refresh needed during an active WebSocket session
```

**[Fix #3 resolution]** The 30-second TTL is NOT a problem because:
- Deepgram validates the token at WebSocket handshake time only
- Once the WebSocket is established, it stays open for the duration of the session
- The token is consumed once and discarded
- New token is only needed if the WebSocket drops and needs reconnection
- On reconnection: fetch new token → open new WebSocket → resume (gap of ~1-2 seconds)

### 4.3 STT Usage Route (`/api/stt/usage`) — Tier 2/3

Reports STT session duration for best-effort quota tracking:

```typescript
// POST /api/stt/usage
// Request: { sessionId: string, action: 'start' | 'end', durationSeconds?: number }
// Response: { ok: true }

// On 'start': Creates usage_logs entry with event_type='stt_session', status='ok', quantity=0
//   - Also checks concurrent session cap (max 1 for T2, 2 for T3)
//   - Returns 429 if concurrent cap exceeded
// On 'end': Updates the usage_logs entry with final durationSeconds
//   - Client tracks duration locally (Date.now() delta from start)
//   - This is best-effort: a malicious client could underreport, but:
//     (a) post-hoc reconciliation catches large discrepancies
//     (b) STT cost is low ($0.0077/min) so abuse impact is bounded

// Auth: Required. Rate limit: 2 calls per minute per user.
```

### 4.4 Tier Lookup Route (`/api/user/tier`)

```typescript
// GET /api/user/tier
// Response: { tier: VoiceTier, features: TierFeatures, usage: UsageSummary }

interface TierFeatures {
  sttProvider: 'browser' | 'deepgram';
  ttsProvider: 'openai' | 'deepgram' | 'cartesia';
  supportsAllBrowsers: boolean;
  customVocabulary: boolean;
  maxSessionsPerMonth: number;
  maxExchangesPerSession: number;
  maxTtsCharsPerMonth: number;
}

interface UsageSummary {
  sessionsThisMonth: number;
  ttsCharsThisMonth: number;
  sttSecondsThisMonth: number;
}
```

---

## 5. Database Schema Changes

### 5.1 New `user_profiles` Table

**[Fix #7, #8]** Corrected RLS policies and added complete Stripe billing state:

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tier
  tier TEXT NOT NULL DEFAULT 'ground_school'
    CHECK (tier IN ('ground_school', 'checkride_prep', 'dpe_live')),

  -- Stripe billing state (complete for support + idempotency)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  stripe_subscription_item_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  last_webhook_event_id TEXT,          -- Idempotency: prevent duplicate processing
  last_webhook_event_ts TIMESTAMPTZ,
  latest_invoice_status TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS: Correct Postgres semantics per command type
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own profile
CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users CANNOT insert or update their own profile (prevents tier self-promotion)
-- All writes go through service_role (webhooks, triggers)
```

**Note**: Service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS entirely, so no explicit service_role policy needed. The absence of INSERT/UPDATE policies for authenticated users means they cannot modify their profile.

### 5.2 New `usage_logs` Table

**[Fix #7, #13]** Corrected RLS and added observability columns:

```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_id UUID REFERENCES exam_sessions(id),
  request_id TEXT,                     -- Correlation ID for tracing
  event_type TEXT NOT NULL
    CHECK (event_type IN ('tts_request', 'stt_session', 'llm_request', 'token_issued')),
  provider TEXT NOT NULL,              -- 'openai', 'deepgram', 'cartesia'
  tier TEXT NOT NULL,
  quantity NUMERIC NOT NULL,           -- chars (TTS), seconds (STT), tokens (LLM)
  latency_ms INTEGER,                  -- TTFB or total latency
  status TEXT DEFAULT 'ok'
    CHECK (status IN ('ok', 'error', 'timeout')),
  error_code TEXT,                     -- Provider error code if failed
  metadata JSONB DEFAULT '{}',         -- Extensible: model, voice_id, encoding, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_date ON usage_logs (user_id, created_at);
CREATE INDEX idx_usage_logs_session ON usage_logs (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users read own usage"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can write (via server-side API routes)
-- No INSERT policy for authenticated users = they cannot write directly
```

### 5.3 Auto-Create Profile on Signup

```sql
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'ground_school', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();
```

### 5.4 Backfill Existing Users

```sql
-- One-time migration for existing users without profiles
INSERT INTO user_profiles (user_id, tier, subscription_status)
SELECT id, 'ground_school', 'active'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles);
```

---

## 6. Client-Side Architecture

### 6.1 Voice Provider Hook (`useVoiceProvider`)

A React hook that abstracts voice I/O based on the user's tier:

```typescript
// src/hooks/useVoiceProvider.ts

interface VoiceProvider {
  // STT
  startListening(): void;
  stopListening(): void;
  transcript: string;
  isListening: boolean;
  interimTranscript: string;

  // TTS
  speak(text: string): Promise<void>;
  speakStreaming(tokenStream: AsyncIterable<string>): Promise<void>; // Tier 3 only
  stopSpeaking(): void;
  isSpeaking: boolean;

  // Meta
  tier: VoiceTier;
  sttProvider: 'browser' | 'deepgram';
  ttsProvider: 'openai' | 'deepgram' | 'cartesia';
  isReady: boolean;
  error: string | null;
}
```

### 6.2 STT Implementation Details

**[Fix #4]** Audio capture format per browser:

**Tier 1 (Browser Web Speech API):** No change. Chrome only.

**Tier 2/3 (Deepgram Nova-3 via direct WebSocket):**

The client connects directly to Deepgram's WebSocket after obtaining a temporary token.

```typescript
// Audio capture strategy per browser:

// Chrome/Edge: MediaRecorder with audio/webm;codecs=opus
// Firefox: MediaRecorder with audio/webm;codecs=opus
// Safari/iOS: MediaRecorder limited — use AudioWorklet PCM fallback

// Deepgram WebSocket connection params per browser:
// Chrome/Firefox: wss://api.deepgram.com/v1/listen?model=nova-3&encoding=opus&container=webm&sample_rate=48000
// Safari fallback: wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1

// Detection logic:
function getSTTConfig(): { encoding: string; container?: string; sampleRate: number } {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) {
    // Safari: AudioWorklet captures raw PCM, no MediaRecorder container
    return { encoding: 'linear16', sampleRate: 16000 };
  }
  // Chrome, Firefox, Edge: MediaRecorder produces Opus in WebM
  return { encoding: 'opus', container: 'webm', sampleRate: 48000 };
}

// Safari AudioWorklet fallback:
// 1. getUserMedia() → AudioContext → AudioWorkletNode (pcm-capture-processor)
// 2. Worklet sends Float32 PCM frames to main thread via port.postMessage
// 3. Main thread converts Float32 → Int16 and sends over WebSocket to Deepgram
// 4. This is a well-established pattern for Safari STT
```

**Token lifecycle (corrected from v1):**
- Fetch token from `/api/stt/token` once at session start
- Open WebSocket immediately with token
- WebSocket stays open for entire exam session (Deepgram bills on audio sent, not connection time)
- If WebSocket drops (network glitch): fetch new token → reconnect → UI shows brief "Reconnecting..." state
- No periodic token refresh during active session

### 6.3 Progressive Audio Playback

**[Fix #5]** Replaced naïve `createBuffer` approach with AudioWorklet ring buffer:

```typescript
// src/lib/voice/playback/audio-worklet-player.ts

// Architecture:
// 1. AudioWorkletNode with a ring buffer (2 seconds capacity)
// 2. Main thread pushes PCM chunks into ring buffer via port.postMessage
// 3. Worklet pulls from ring buffer in process() at audio rate
// 4. Handles jitter: if buffer underruns, outputs silence (no pop/click)
// 5. Handles drift: ring buffer absorbs timing variations

// AudioWorklet processor (runs in audio thread):
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array;
  private writePos = 0;
  private readPos = 0;
  private capacity: number;

  constructor() {
    super();
    this.capacity = 48000 * 2; // 2 seconds at 48kHz
    this.buffer = new Float32Array(this.capacity);
    this.port.onmessage = (e) => {
      // Handle flush command (barge-in)
      if (e.data?.type === 'flush') {
        this.writePos = 0;
        this.readPos = 0;
        this.buffer.fill(0);
        return;
      }
      const samples = e.data as Float32Array;
      for (let i = 0; i < samples.length; i++) {
        // Overflow policy: if buffer is full, drop oldest by advancing readPos
        if (this.writePos - this.readPos >= this.capacity) {
          this.readPos = this.writePos - this.capacity + 1; // Drop oldest samples
        }
        this.buffer[this.writePos % this.capacity] = samples[i];
        this.writePos++;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      if (this.readPos < this.writePos) {
        output[i] = this.buffer[this.readPos % this.capacity];
        this.readPos++;
      } else {
        output[i] = 0; // Underrun: silence, no pop
      }
    }
    return true;
  }
}

// Main thread usage:
// const audioContext = new AudioContext({ sampleRate: 48000 });
// await audioContext.audioWorklet.addModule('/audio-worklet/pcm-playback-processor.js');
// const playerNode = new AudioWorkletNode(audioContext, 'pcm-playback-processor');
// playerNode.connect(audioContext.destination);
//
// On each audio chunk from TTS provider:
//   const float32 = convertToFloat32(chunk, encoding, sampleRate);
//   const resampled = resample(float32, sourceSampleRate, 48000); // if needed
//   playerNode.port.postMessage(resampled);

// Buffer management:
// - Target buffering: 150-300ms (7200-14400 samples at 48kHz)
// - Overflow policy: drop oldest samples (readPos advances) — graceful latency recovery
// - Underrun policy: output silence — no pops or clicks
// - Backpressure: if (writePos - readPos) > 0.5 * capacity, log warning (provider sending faster than playback)
//
// Resampling:
// Deepgram Aura-2 outputs linear16 at 48000Hz → direct playback, no resampling
// Cartesia Sonic-3 outputs pcm_f32le at 44100Hz → resample to 48000Hz via linear interpolation
// OpenAI TTS-1 outputs MP3 → decode with AudioContext.decodeAudioData() (no worklet needed)
```

### 6.4 Voice Mode Eligibility Gating

Before enabling voice mode, the client runs a capability check to determine the best available mode:

```typescript
type VoiceMode = 'full_voice' | 'tts_only' | 'text_only';

interface VoiceCapabilities {
  mode: VoiceMode;
  sttMethod: 'deepgram_opus' | 'deepgram_pcm' | 'web_speech_api' | 'none';
  ttsMethod: 'streaming_pcm' | 'mp3_buffer' | 'none';
  reason?: string; // User-facing explanation if degraded
}

function detectVoiceCapabilities(tier: VoiceTier): VoiceCapabilities {
  const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia;
  const hasAudioWorklet = !!window.AudioWorkletNode;
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const hasWebSpeechAPI = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

  // Check MediaRecorder MIME support for STT
  const hasOpusWebm = typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus');

  // iOS autoplay restriction: AudioContext must be created inside user gesture
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // === STT capability ===
  let sttMethod: VoiceCapabilities['sttMethod'] = 'none';
  if (tier !== 'ground_school') {
    // Tier 2/3: Deepgram STT
    if (hasGetUserMedia && hasOpusWebm) {
      sttMethod = 'deepgram_opus'; // Chrome, Firefox, Edge
    } else if (hasGetUserMedia && hasAudioWorklet) {
      sttMethod = 'deepgram_pcm'; // Safari via AudioWorklet
    }
    // else: no STT available on this browser for Tier 2/3
  } else {
    // Tier 1: Web Speech API
    if (hasWebSpeechAPI && isChrome) {
      sttMethod = 'web_speech_api';
    }
  }

  // === TTS capability ===
  let ttsMethod: VoiceCapabilities['ttsMethod'] = 'none';
  if (tier === 'ground_school') {
    ttsMethod = 'mp3_buffer'; // OpenAI TTS returns MP3, uses decodeAudioData
  } else {
    // Tier 2/3: streaming PCM via AudioWorklet
    if (hasAudioWorklet) {
      ttsMethod = 'streaming_pcm';
    } else {
      ttsMethod = 'mp3_buffer'; // Fallback: non-streaming via OpenAI
    }
  }

  // === Determine final mode ===
  if (sttMethod !== 'none' && ttsMethod !== 'none') {
    return { mode: 'full_voice', sttMethod, ttsMethod };
  }
  if (ttsMethod !== 'none') {
    return {
      mode: 'tts_only', sttMethod: 'none', ttsMethod,
      reason: 'Voice input is not available on this browser. You can hear the examiner but must type your answers.',
    };
  }
  return {
    mode: 'text_only', sttMethod: 'none', ttsMethod: 'none',
    reason: 'Voice mode is not supported on this browser. Please use Chrome for the best experience.',
  };
}

// iOS-specific: AudioContext must be created/resumed inside a user gesture handler.
// The "Begin Exam" button handler creates the AudioContext before starting the session.
// This satisfies iOS autoplay policy.
```

The capability check runs once on mount. The result determines:
- Whether the voice toggle is shown at all
- Whether the voice toggle is pre-checked or disabled
- What warning/info text appears next to the toggle
- Which STT/TTS code paths are used during the session

### 6.5 Tier Selection in Session Config

The `SessionConfig.tsx` component gets a tier display section:

```
┌─────────────────────────────────────────────┐
│  Your Plan: Checkride Prep                  │
│  Voice: Deepgram Aura-2 | STT: Nova-3      │
│  [Upgrade to DPE Live →]                    │
├─────────────────────────────────────────────┤
│  Aircraft Class:  [ASEL] [AMEL] [ASES] ... │
│  Study Mode:      [Linear] [Cross-ACS] ... │
│  ...                                        │
└─────────────────────────────────────────────┘
```

The tier is read-only in the session config (set via subscription). Voice toggle behavior changes per tier:
- Tier 1: Toggle shows "Voice mode (Chrome only)"
- Tier 2/3: Toggle shows "Voice mode" (all browsers)

---

## 7. LLM-to-TTS Streaming (Tier 3 Only)

**[Fix #6]** Single architecture chosen: **client-side sentence chunking with server-side TTS**.

### 7.1 Architecture

```
/api/exam (SSE) → Client token buffer → Sentence boundary detector → POST /api/tts per sentence → Cartesia REST streaming → AudioWorklet
```

1. Client receives LLM tokens via existing SSE stream from `/api/exam`
2. Tokens are accumulated in a buffer string
3. Sentence boundary detector checks buffer after each token
4. Complete sentences are sent to `/api/tts` (server-side, which calls Cartesia REST API)
5. Audio chunks stream back via chunked transfer encoding
6. Audio flows into the AudioWorklet ring buffer for progressive playback
7. Multiple `/api/tts` requests can be in-flight simultaneously (pipelined)
8. Cartesia API key remains server-side at all times

### 7.2 Sentence Boundary Detection (Robust)

**[Fix #6]** Replaced naïve regex with aviation-aware boundary detection:

```typescript
// Aviation abbreviations that contain periods but are NOT sentence endings
const AVIATION_ABBREVIATIONS = new Set([
  'e.g.', 'i.e.', 'vs.', 'approx.', 'min.', 'max.', 'alt.', 'hdg.',
  'Mr.', 'Dr.', 'Jr.', 'Sr.', 'Inc.', 'Ltd.', 'etc.',
]);

// FAA reference patterns (e.g., "14 CFR 91.205", "AIM 7-1-11")
const FAA_REF_PATTERN = /\d+\s*CFR\s*\d+\.\d+|\bAIM\s+\d+-\d+-\d+|\bAC\s+\d+-\d+/;

// Decimal number pattern (e.g., "3.5 degrees", "122.8 MHz")
const DECIMAL_PATTERN = /\d+\.\d/;

const MIN_SENTENCE_LENGTH = 20;  // Don't send tiny fragments
const MAX_BUFFER_CHARS = 200;     // Force flush at 200 chars even without boundary

// List marker patterns — periods here are NOT sentence endings
const LIST_MARKER_PATTERN = /(?:\(\d+\)|\d+\)|\([a-zA-Z]\)|[a-zA-Z]\))\.\s*$/;

interface BoundaryResult {
  sentence: string;
  remainder: string;
}

function detectSentenceBoundary(buffer: string): BoundaryResult | null {
  // Force flush if buffer is very long (handles edge case of no punctuation)
  if (buffer.length > MAX_BUFFER_CHARS) {
    // Find last space before MAX_BUFFER_CHARS to avoid mid-word split
    const cutPoint = buffer.lastIndexOf(' ', MAX_BUFFER_CHARS);
    if (cutPoint > MIN_SENTENCE_LENGTH) {
      return { sentence: buffer.slice(0, cutPoint).trim(), remainder: buffer.slice(cutPoint) };
    }
  }

  // Look for sentence-ending punctuation followed by space or end of string
  const candidates = [...buffer.matchAll(/[.?!]\s+/g)];

  for (const match of candidates) {
    const endPos = match.index! + match[0].length;
    const candidate = buffer.slice(0, endPos).trim();

    // Skip if too short
    if (candidate.length < MIN_SENTENCE_LENGTH) continue;

    // Check if the period is part of an abbreviation
    const lastWord = candidate.match(/\S+\.$/)?.[0];
    if (lastWord && AVIATION_ABBREVIATIONS.has(lastWord.toLowerCase())) continue;

    // Check if period is part of a FAA reference (e.g., "91.205")
    const beforePeriod = buffer.slice(Math.max(0, match.index! - 20), match.index! + 2);
    if (FAA_REF_PATTERN.test(beforePeriod)) continue;

    // Check if period is a decimal number
    if (DECIMAL_PATTERN.test(buffer.slice(match.index! - 2, match.index! + 3))) continue;

    // Check if period follows a list marker: "(1).", "A).", etc.
    if (LIST_MARKER_PATTERN.test(candidate)) continue;

    // Valid sentence boundary found
    return { sentence: candidate, remainder: buffer.slice(endPos) };
  }

  // Colon handling: "Here are the requirements: ..." is a soft boundary
  // Only split on colon if buffer is already long enough to be meaningful
  if (buffer.length > 80) {
    const colonMatch = buffer.match(/:\s+/);
    if (colonMatch && colonMatch.index! > MIN_SENTENCE_LENGTH) {
      const endPos = colonMatch.index! + colonMatch[0].length;
      return { sentence: buffer.slice(0, endPos).trim(), remainder: buffer.slice(endPos) };
    }
  }

  return null;
}

// TIMER-BASED FLUSH (architectural integration):
// The sentence boundary detector is called after each SSE token arrives.
// Additionally, a timer runs alongside:
//
// let flushTimer: ReturnType<typeof setTimeout> | null = null;
//
// function onToken(token: string) {
//   tokenBuffer += token;
//   // Reset timer on every new token
//   if (flushTimer) clearTimeout(flushTimer);
//   // If no boundary found after 3 seconds of no new tokens, force flush
//   flushTimer = setTimeout(() => {
//     if (tokenBuffer.length > 0) {
//       enqueueSentence(tokenBuffer.trim());
//       tokenBuffer = '';
//     }
//   }, 3000);
//   // Try boundary detection
//   const result = detectSentenceBoundary(tokenBuffer);
//   if (result) {
//     enqueueSentence(result.sentence);
//     tokenBuffer = result.remainder;
//   }
// }
//
// This ensures:
// - Normal sentences are split at punctuation boundaries
// - Long pauses (>3s without new tokens) flush whatever is buffered
// - End of LLM stream flushes remaining buffer immediately
```

### 7.3 Barge-In (User Interrupts)

When the user starts speaking while the examiner is still talking:
1. `stopSpeaking()` is called on the voice provider
2. **Client**: All in-flight `/api/tts` fetch requests are aborted via `AbortController.abort()`
3. **Server**: The `/api/tts` route uses `request.signal` (from Next.js) to detect client disconnect, then aborts the upstream provider request (`fetch` to Cartesia/Deepgram with `signal` propagation). This stops the provider from generating further audio (no wasted cost).
4. **AudioWorklet**: Ring buffer is flushed immediately (write silence, reset positions)
5. Any remaining LLM tokens are still accumulated in the text buffer but NOT sent to TTS
6. The full examiner message is preserved in chat history (from the SSE `examinerMessage` event)
7. User's answer is processed normally

```typescript
// Client-side barge-in implementation:
const ttsAbortControllers: AbortController[] = [];

function stopSpeaking() {
  // Abort all in-flight TTS requests
  ttsAbortControllers.forEach(c => c.abort());
  ttsAbortControllers.length = 0;
  // Flush audio buffer
  playerNode.port.postMessage({ type: 'flush' });
  // Stop sentence pipeline
  sentencePipelineActive = false;
}

// Server-side: /api/tts propagates abort
// const upstreamResponse = await fetch(providerUrl, { signal: request.signal, ... });
// If client disconnects, request.signal fires, aborting the upstream fetch.
```

### 7.4 Error Handling

- If upstream provider returns 5xx/timeout: skip that sentence, move to next. Log error in `usage_logs`.
- If LLM stream errors: stop TTS pipeline, show error state to user
- **Two-layer timeout**: 5-second TTFB watchdog (if no first byte within 5s, abort and skip) + 20-second absolute cap per request (aligns with server-side hard timeout). Both use AbortController with `AbortSignal.timeout()`.
- Provider 429 (rate limit): exponential backoff (1s, 2s, 4s), max 3 retries, then skip sentence

---

## 8. Cost & Margin Analysis (Corrected)

**[Fix #1, #2]** All costs use p90 estimates with explicit assumptions.

### 8.1 Assumptions

| Parameter | Median | p90 (heavy user) |
|-----------|--------|-------------------|
| Exchanges per session | 12 | 15 |
| Chars per examiner response | 600 | 800 |
| Student answer duration | 20s | 30s |
| Sessions per month per user | 10 | 20 |
| LLM input tokens per exchange (growing avg) | 2,500 | 3,500 |
| LLM output tokens per exchange | 400 | 500 |

### 8.2 Variable Costs Per Session

| Component | Tier 1 Median / p90 | Tier 2 Median / p90 | Tier 3 Median / p90 |
|-----------|---------------------|---------------------|---------------------|
| Claude Sonnet | $0.19 / $0.33 | $0.19 / $0.33 | $0.19 / $0.33 |
| TTS | $0.11 / $0.18 (OpenAI) | $0.22 / $0.36 (DG) | $0.28 / $0.47 (Cartesia Startup) |
| STT | $0.00 / $0.00 | $0.04 / $0.06 (DG) | $0.04 / $0.06 (DG) |
| **Per session** | **$0.30 / $0.51** | **$0.45 / $0.75** | **$0.51 / $0.86** |

### 8.3 Fixed Monthly Costs

| Cost | Amount | Notes |
|------|--------|-------|
| Vercel Pro | $20/mo | Hosting |
| Supabase Pro | $25/mo | Database |
| Cartesia (conditional) | $0-49/mo | Only if Tier 3 users exist. Startup plan at 5+ users. |
| **Total fixed** | **$45-94/mo** | |

### 8.4 Tier 3 Unit Economics Detail

**[Fix #2]** Complete model with base fee amortization:

| Tier 3 Users | Cartesia Plan | Base Fee/User | Variable/User (12 sess) | Total Cost/User | Revenue/User | Margin/User | Margin % |
|-------------|--------------|---------------|------------------------|----------------|-------------|------------|----------|
| 1 | Pro ($5) | $5.00 | $6.12 | $11.12 | $49.99 | $38.87 | 78% |
| 3 | Startup ($49) | $16.33 | $6.12 | $22.45 | $49.99 | $27.54 | 55% |
| 5 | Startup ($49) | $9.80 | $6.12 | $15.92 | $49.99 | $34.07 | 68% |
| 10 | Startup ($49) | $4.90 | $6.12 | $11.02 | $49.99 | $38.97 | 78% |
| 20 | Scale ($299) | $14.95 | $5.58* | $20.53 | $49.99 | $29.46 | 59% |
| 50 | Scale ($299) | $5.98 | $5.58* | $11.56 | $49.99 | $38.43 | 77% |

*Scale rate: $0.037/1K chars vs Startup $0.039/1K

**Recommended plan progression:**
- 0-2 Tier 3 users: Pro ($5/mo) — 100K credits, covers ~14 sessions
- 3-19 Tier 3 users: Startup ($49/mo) — 1.25M credits, covers ~174 sessions
- 20+ Tier 3 users: Scale ($299/mo) — 8M credits, covers ~1,111 sessions

**Break-even: 1 Tier 3 user on Pro plan is profitable from day one.**

### 8.5 Revenue Model (100 Users, p90 usage scenario)

Distribution: 50 Tier 1, 35 Tier 2, 15 Tier 3.
Usage: p90 (20 sessions/month for all tiers — worst case).

| Metric | Tier 1 | Tier 2 | Tier 3 | Total |
|--------|--------|--------|--------|-------|
| Users | 50 | 35 | 15 | 100 |
| Monthly revenue | $499.50 | $874.65 | $749.85 | **$2,124.00** |
| Variable cost (p90) | $510.00 | $525.00 | $258.00 | $1,293.00 |
| Fixed costs | — | — | — | $94.00 |
| Stripe fees | $14.49 | $25.37 | $21.75 | $61.59 |
| **Net margin** | — | — | — | **$675.41** |
| **Margin %** | — | — | — | **31.8%** |

**Median usage (10 sessions/month):**

| Metric | Tier 1 | Tier 2 | Tier 3 | Total |
|--------|--------|--------|--------|-------|
| Variable cost | $150.00 | $157.50 | $76.50 | $384.00 |
| Fixed + Stripe | — | — | — | $155.59 |
| **Net margin** | — | — | — | **$1,584.41** |
| **Margin %** | — | — | — | **74.6%** |

---

## 9. Billing Integration (Stripe)

### 9.1 Subscription Flow

```
User clicks "Upgrade" → Stripe Checkout (hosted page) → Payment
→ Stripe webhook → /api/webhooks/stripe → Update user_profiles (tier + all Stripe fields)
→ Next page load reads new tier → Voice providers switch automatically
```

### 9.2 Webhook Handler (`/api/webhooks/stripe`)

```typescript
// Handles these events:
// checkout.session.completed → Set tier, store all Stripe IDs (customer, subscription, price, product, item)
// customer.subscription.updated → Tier change, update price_id/status/cancel_at_period_end
// customer.subscription.deleted → Revert tier to ground_school
// invoice.payment_failed → Set subscription_status to 'past_due'
// invoice.paid → Clear 'past_due' status

// IDEMPOTENCY & OUT-OF-ORDER HANDLING:
// 1. Verify webhook signature with stripe.webhooks.constructEvent()
// 2. Check if event.created > last_webhook_event_ts for this user
//    - If older: skip (out-of-order delivery of stale event)
//    - If same/newer: process
// 3. For subscription events: DO NOT trust event payload for tier determination.
//    Instead, fetch authoritative state from Stripe:
//      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
//      const priceId = subscription.items.data[0].price.id;
//      const tier = PRICE_TO_TIER[priceId];
//    This ensures correct tier even if events arrive out of order.
// 4. Store event.id and event.created as last_webhook_event_id/ts
// 5. Map price_id → tier deterministically:
//      STRIPE_PRICE_GROUND_SCHOOL → 'ground_school'
//      STRIPE_PRICE_CHECKRIDE_PREP → 'checkride_prep'
//      STRIPE_PRICE_DPE_LIVE → 'dpe_live'
//
// PRORATION: Use Stripe defaults (prorate on upgrade, credit on downgrade).
// No custom proration logic needed — Stripe handles billing math.
```

### 9.3 Pricing Page

A dedicated `/pricing` page (accessible without auth) displays the three tiers with feature comparison.

### 9.4 Tier Enforcement & Usage Quotas

**[Fix #12]** Hard limits enforced server-side:

| Limit | Tier 1 | Tier 2 | Tier 3 |
|-------|--------|--------|--------|
| Sessions per month | 30 | 60 | Unlimited |
| Exchanges per session | 20 | 30 | 50 |
| TTS chars per month | 200,000 | 500,000 | 1,000,000 |
| STT minutes per month (best effort) | N/A (browser) | 300 | 600 |
| Concurrent STT sessions | N/A | 1 | 2 |

**Enforcement mechanisms by quota type:**

**Hard enforcement (server-side, airtight):**
- `/api/session` (create action): Check `sessions_this_month < limit` → strictly enforced
- `/api/exam` (respond action): Check `exchange_count < limit` → strictly enforced
- `/api/tts`: Check `tts_chars_this_month < limit` → strictly enforced (server controls all TTS)

**Best-effort enforcement (STT — client→Deepgram direct, server has no mid-session control):**
- `/api/stt/token`: Rate limit 4 tokens/min/user + check `stt_minutes_this_month < limit` before issuing token
- **Concurrent session cap**: Client calls `POST /api/stt/usage { action: 'start' }` before opening Deepgram WebSocket. Server checks concurrent active sessions in `usage_logs`. Returns 429 if cap exceeded. Client calls `POST /api/stt/usage { action: 'end', durationSeconds }` when WebSocket closes.
- **Client-side timer**: Client tracks STT duration locally (start timestamp on WebSocket open, delta on close). Reports duration via `/api/stt/usage` endpoint at session end. Disconnects WebSocket when approaching monthly limit.
- **Post-hoc reconciliation**: Weekly job compares our `usage_logs` against Deepgram usage API. Flag users whose Deepgram usage significantly exceeds our records (indicates client-side timer bypass). Disable token issuance for flagged accounts pending review.
- **Why not server proxy?** Proxying STT through our server would add ~100ms latency and require a WebSocket-capable host (not Vercel serverless). The latency cost defeats the purpose of Tier 2/3. Best-effort enforcement is sufficient because: (a) STT costs $0.0077/min — even extreme abuse is bounded by Deepgram's own rate limits, and (b) token issuance is server-controlled.

**STT minutes quota is explicitly documented as "best effort" in the pricing page** — not a hard limit. The hard limits are sessions/month and exchanges/session.

When a hard limit is reached, API returns `{ error: 'quota_exceeded', limit: '...', upgrade_url: '/pricing' }` and client shows upgrade prompt.

---

## 10. Aviation-Specific STT Vocabulary

For Tier 2/3, Deepgram Nova-3 supports custom vocabulary keywords:

```typescript
const AVIATION_VOCABULARY = [
  'METAR', 'TAF', 'NOTAM', 'PIREP', 'SIGMET', 'AIRMET',
  'VOR', 'NDB', 'ILS', 'RNAV', 'GPS', 'DME',
  'ACS', 'DPE', 'ASEL', 'AMEL', 'ASES', 'AMES',
  'Cessna', 'Piper', 'Beechcraft', 'Cirrus',
  'V1', 'Vr', 'Vy', 'Vx', 'Va', 'Vne', 'Vno', 'Vfe', 'Vso', 'Vs1',
  'CTAF', 'ATIS', 'AWOS', 'ASOS',
  'FAR', 'AIM', 'POH', 'AFM',
  'ADM', 'CRM', 'SRM', 'IMSAFE', 'PAVE', 'DECIDE',
  'sectional', 'checkride', 'logbook', 'endorsement',
];
```

Passed as the `keywords` parameter in the Deepgram WebSocket connection URL.

---

## 11. Required API Keys & Accounts

### 11.1 Existing (No Action Needed)

| Service | Status | Used By |
|---------|--------|---------|
| Anthropic (Claude) | Active | All tiers — LLM |
| OpenAI | Active | Tier 1 — TTS |
| Supabase | Active | All tiers — DB, Auth |

### 11.2 New Accounts Required

| Service | Account Type | Monthly Cost | API Key Env Var | Used By |
|---------|-------------|-------------|-----------------|---------|
| **Deepgram** | Pay-As-You-Go | Usage-based ($200 free credit) | `DEEPGRAM_API_KEY` | Tier 2/3 — STT + Tier 2 TTS |
| **Cartesia** | Pro ($5/mo) to start | $5-49/mo + usage | `CARTESIA_API_KEY` | Tier 3 — TTS |
| **Stripe** | Standard | 2.9% + $0.30 per txn | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |

### 11.3 Account Setup Instructions

**Deepgram:**
1. Sign up at https://console.deepgram.com/signup
2. New accounts get $200 in free credits (no credit card required)
3. Dashboard → API Keys → Create Key
4. Permissions: `usage:read`, `listen:write` (STT), `speak:write` (TTS)
5. Copy API key → `DEEPGRAM_API_KEY` in `.env.local` and Vercel

**Cartesia:**
1. Sign up at https://play.cartesia.ai
2. Start with Pro plan ($5/mo, 100K credits) for development
3. Settings → API Keys → Generate
4. Copy API key → `CARTESIA_API_KEY` in `.env.local` and Vercel
5. Browse voices in playground → note voice ID for DPE persona

**Stripe:**
1. Register at https://dashboard.stripe.com/register
2. Create 3 products with monthly recurring prices:
   - Ground School: $9.99/month
   - Checkride Prep: $24.99/month
   - DPE Live: $49.99/month
3. Copy Price IDs → `STRIPE_PRICE_GROUND_SCHOOL`, `STRIPE_PRICE_CHECKRIDE_PREP`, `STRIPE_PRICE_DPE_LIVE`
4. Developers → API keys → copy secret key and publishable key
5. Developers → Webhooks → Add endpoint:
   - URL: `https://aviation-oral-exam-companion.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`
6. Copy webhook signing secret → `STRIPE_WEBHOOK_SECRET`

### 11.4 Environment Variables

```bash
# Existing
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# New — Deepgram (Tier 2/3)
DEEPGRAM_API_KEY=...

# New — Cartesia (Tier 3)
CARTESIA_API_KEY=...

# New — Stripe (Billing)
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...

# New — Stripe Price IDs
STRIPE_PRICE_GROUND_SCHOOL=price_xxx
STRIPE_PRICE_CHECKRIDE_PREP=price_xxx
STRIPE_PRICE_DPE_LIVE=price_xxx
```

---

## 12. Rollback & Degradation Strategy

**[Fix #11]** Per-capability fallback that respects browser compatibility:

| Failure | Tier 2 Behavior | Tier 3 Behavior |
|---------|----------------|-----------------|
| Deepgram STT down | If Chrome: fall back to Web Speech API. If other browser: **text-only mode** (type answers instead of speaking). Toast: "Voice input temporarily unavailable." | Same as Tier 2 |
| Deepgram TTS down (Tier 2) | Fall back to OpenAI TTS (non-streaming, higher latency). Toast: "Using backup voice — latency may be higher." | N/A (Tier 3 doesn't use Deepgram TTS) |
| Cartesia TTS down (Tier 3) | N/A | Fall back to Deepgram Aura-2 TTS (streaming, slightly higher latency). If Deepgram also down: OpenAI TTS. Toast shown. |
| OpenAI TTS down (Tier 1) | N/A | N/A |
| All TTS providers down | Text-only mode. No audio. Chat still works. | Same | Same |

**Fallback chain in `provider-factory.ts`:**
```
Tier 3 TTS: Cartesia → Deepgram → OpenAI → text-only
Tier 2 TTS: Deepgram → OpenAI → text-only
Tier 1 TTS: OpenAI → text-only
Tier 2/3 STT: Deepgram → Web Speech API (Chrome) → text-only
Tier 1 STT: Web Speech API → text-only
```

**No silent downgrades**: Every fallback triggers a user-visible notification.

**Billing**: Fallback usage still counts against the user's quota but at the lower provider's rate. If a user is significantly impacted (>30 min of degraded service), support can issue credit via Stripe.

---

## 13. Security Considerations

1. **API Key Protection**: `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, and `STRIPE_SECRET_KEY` are server-only environment variables. **No API keys are ever exposed to the browser.** Cartesia TTS runs server-side specifically to protect the key.
2. **STT Token Security**: Deepgram temporary tokens (30s TTL) are consumed at WebSocket handshake only. Rate limited: 4/min/user. Token issuance logged.
3. **Stripe Webhook Verification**: `stripe.webhooks.constructEvent()` with signing secret. Out-of-order handling via timestamp comparison + authoritative Stripe fetch.
4. **Tier Enforcement**: Server-side only via `user_profiles` table. Client reads tier for UI but cannot modify it. No INSERT/UPDATE RLS policies for authenticated users.
5. **RLS**: Correct Postgres semantics: `SELECT` uses `USING`, no `INSERT`/`UPDATE` policies for authenticated users on `user_profiles` (prevents tier self-promotion).
6. **Usage Quotas**: TTS and session limits strictly enforced server-side. STT minutes are best-effort (client→Deepgram direct) with post-hoc reconciliation.
7. **STT Abuse Controls**: Concurrent session caps, token rate limiting, post-hoc usage reconciliation against Deepgram API, account flagging for anomalous usage.

---

## 14. Data Policy & Compliance

**[Fix #15]** Data handling for voice-capture aviation training product:

### 14.1 Audio Data
- **Audio is NEVER stored.** All audio (STT input, TTS output) is processed in real-time and not persisted.
- STT audio goes directly from browser to Deepgram (no server involvement). Deepgram processes in real-time and does not store audio by default (configurable in Deepgram dashboard).
- TTS audio is streamed to the browser and played. Not saved to disk or server.

### 14.2 Transcript Data
- Text transcripts (examiner questions + student answers) are stored in `session_transcripts` table.
- Transcripts are user-owned via RLS (`user_id = auth.uid()`).
- Retention: indefinite (user's study history). User can delete their account which cascades to all data.

### 14.3 User Data Deletion
- Supabase Auth account deletion cascades to `user_profiles` (ON DELETE CASCADE), `exam_sessions`, `session_transcripts`, `usage_logs`.
- Stripe customer data requires separate deletion via Stripe API (handled in account deletion flow).

### 14.4 Disclaimers
- App displays: "This is a study tool and does not replace actual FAA examination. Results are not certified."
- Terms of Service and Privacy Policy pages required before commercial launch.
- No HIPAA/medical data involved. No PII beyond email address.

---

## 15. Monitoring & Observability

**[Fix #13]** Observability matches the schema:

### 15.1 Usage Logging (via `usage_logs` table)

Every TTS, STT, and LLM call creates a row with:
- `event_type`: 'tts_request' | 'stt_session' | 'llm_request' | 'token_issued'
- `quantity`: chars (TTS), seconds (STT), tokens (LLM)
- `latency_ms`: TTFB for TTS, total for LLM, session duration for STT
- `status`: 'ok' | 'error' | 'timeout'
- `error_code`: provider-specific error code
- `metadata`: JSON with model, voice_id, encoding, sample_rate, etc.

### 15.2 Alerts (via periodic SQL query or external monitoring)
- TTS TTFB p95 exceeds threshold (>2s for Tier 2, >500ms for Tier 3)
- Provider error rate exceeds 5% in any 15-minute window
- Monthly variable costs exceed budget threshold per tier
- Any user exceeding 80% of their quota (proactive notification)

### 15.3 Dashboard
- Admin-only page (future): per-user usage, cost breakdown, provider health
- For MVP: SQL queries against `usage_logs` in Supabase dashboard

---

## 16. Implementation Phases

### Phase 1: Foundation (Week 1)
- Database migration: `user_profiles`, `usage_logs` tables + backfill + trigger
- Type system: `VoiceTier`, `TTSProvider`, `TTSResult`, `TierFeatures`
- Provider abstraction: `src/lib/voice/` directory structure
- OpenAI TTS wrapped in provider interface (ReadableStream output)
- `/api/user/tier` endpoint
- Usage quota checking utility

### Phase 2: Deepgram Integration — Tier 2 (Week 2)
- Install `@deepgram/sdk`
- `deepgram-tts.ts`: REST streaming to Deepgram Aura-2
- `/api/stt/token`: temporary token endpoint with rate limiting
- Client: `useDeepgramSTT` hook (WebSocket + MediaRecorder / AudioWorklet Safari fallback)
- Client: AudioWorklet ring buffer for progressive playback
- Aviation vocabulary configuration
- Usage logging for all Deepgram calls

### Phase 3: Cartesia Integration — Tier 3 (Week 3)
- Install `@cartesia/cartesia-js` (server-side only)
- `cartesia-tts.ts`: server-side REST streaming provider
- Client: sentence boundary detection + pipelined `/api/tts` requests
- Client: barge-in support (cancel in-flight TTS requests)
- Usage logging for Cartesia calls

### Phase 4: Stripe Billing (Week 3-4)
- Install `stripe`
- Stripe products + prices setup
- `/api/webhooks/stripe`: webhook handler with idempotency
- Checkout flow (Stripe hosted checkout)
- `/pricing` page
- Tier enforcement in all API routes
- Quota enforcement

### Phase 5: Polish & Hardening (Week 4)
- Rollback/degradation testing per provider
- Cross-browser testing (Chrome, Firefox, Safari, Edge)
- Safari AudioWorklet STT fallback testing
- Usage quota UX (warnings at 80%, upgrade prompts at limit)
- Latency monitoring validation
- Data policy pages (Terms, Privacy)
- Production Cartesia plan selection based on subscriber count

---

## 17. Testing Strategy

### Unit Tests
- Provider factory returns correct provider per tier
- Sentence boundary detection: abbreviations, FAA refs, decimals, long buffers, aviation terms
- Tier enforcement: mock user with wrong tier gets 403
- Usage quota: correctly calculates remaining quota
- Webhook idempotency: duplicate events are skipped
- Price-to-tier mapping

### Integration Tests
- Deepgram STT: WebSocket connection + transcription accuracy with aviation vocabulary
- Deepgram TTS: REST streaming + AudioWorklet playback
- Cartesia TTS: Server-side REST streaming + AudioWorklet playback
- Stripe webhook: signature verification + tier update + idempotency
- Fallback chain: mock provider failure → graceful degradation

### Manual Testing
- Full voice round-trip per tier
- Latency measurement per tier (target validation)
- Browser matrix: Chrome, Firefox, Safari (desktop + iOS), Edge
- Network degradation: throttled connection, disconnection, reconnection
- Subscription lifecycle: upgrade, downgrade, cancel, resume
- Quota exceeded: clear error state + upgrade prompt
- Barge-in: user interrupts examiner mid-speech

---

*End of design document v4. APPROVED by GPT-5.2 (Round 4, unconditional approval).*
