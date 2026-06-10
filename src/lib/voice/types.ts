export type VoiceTier = 'ground_school' | 'checkride_prep' | 'dpe_live';

export interface TTSProvider {
  readonly name: string;
  readonly supportsStreaming: boolean;
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface TTSOptions {
  voice?: string;
  sampleRate?: 24000 | 44100 | 48000;
  config?: Record<string, unknown>;
}

// Per-provider config stored in system_config JSONB
export interface OpenAITTSConfig {
  voice: string;    // onyx, alloy, echo, fable, nova, shimmer
  model: string;    // gpt-4o-mini-tts (default), tts-1, tts-1-hd
  speed: number;    // 0.25 - 4.0
}

export interface DeepgramTTSConfig {
  model: string;       // aura-2-orion-en, etc.
  sample_rate: number; // 8000, 16000, 24000, 32000, 48000
  encoding: string;    // linear16, mp3, opus, flac, aac
}

// W4.2 / decision D2: Cartesia was removed — it never actually served a tier
// (TIER_FEATURES always pointed at Deepgram) and its pcm_f32le output is
// incompatible with the MP3/HTMLAudioElement playback path that the March
// 2026 incident forced. Aura-2 is the single product voice; OpenAI is the
// runtime fallback.

export interface TTSResult {
  audio: ReadableStream<Uint8Array>;
  contentType: string;
  encoding: 'mp3' | 'linear16';
  sampleRate: number;
  channels: 1 | 2;
  ttfbMs: number;
}

export interface TierFeatures {
  sttProvider: 'browser' | 'deepgram';
  ttsProvider: 'openai' | 'deepgram';
  supportsAllBrowsers: boolean;
  customVocabulary: boolean;
  maxSessionsPerMonth: number;
  maxExchangesPerSession: number;
  maxTtsCharsPerMonth: number;
  maxSttSecondsPerMonth: number;
}

// W3.2 / decision D1: voice (TTS + STT) is available on EVERY tier. The free
// tier (checkride_prep) is gated by the 3-exam COUNT limit (enforced at session
// creation) plus tight anti-theft monthly budgets (~3 sessions' worth of TTS +
// STT). Paid (dpe_live) keeps generous caps. ground_school is legacy/unused.
export const TIER_FEATURES: Record<VoiceTier, TierFeatures> = {
  ground_school: {
    sttProvider: 'deepgram',
    ttsProvider: 'deepgram',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: 60,
    maxExchangesPerSession: 30,
    maxTtsCharsPerMonth: 35_000,
    maxSttSecondsPerMonth: 4_200, // ~70 min
  },
  checkride_prep: {
    sttProvider: 'deepgram',
    ttsProvider: 'deepgram',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: 60,
    maxExchangesPerSession: 30,
    maxTtsCharsPerMonth: 35_000,   // ~3 trial sessions (anti-theft backstop)
    maxSttSecondsPerMonth: 4_200,  // ~70 min trial budget
  },
  dpe_live: {
    sttProvider: 'deepgram',
    ttsProvider: 'deepgram',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: Infinity,
    maxExchangesPerSession: 50,
    maxTtsCharsPerMonth: 1_000_000,
    maxSttSecondsPerMonth: 360_000, // ~100 hours
  },
};
