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
  model: string;    // tts-1, tts-1-hd
  speed: number;    // 0.25 - 4.0
}

export interface DeepgramTTSConfig {
  model: string;       // aura-2-orion-en, etc.
  sample_rate: number; // 8000, 16000, 24000, 32000, 48000
  encoding: string;    // linear16, mp3, opus, flac, aac
}

export interface CartesiaTTSConfig {
  model: string;       // sonic-3, sonic-turbo
  voice_id: string;    // UUID from Cartesia voice library
  voice_name: string;  // Display name
  speed: number;       // 0.6 - 1.5
  volume: number;      // 0.5 - 2.0
  emotion: string;     // confident, calm, neutral, determined, etc.
  sample_rate: number; // 8000-48000
}

export interface TTSResult {
  audio: ReadableStream<Uint8Array>;
  contentType: string;
  encoding: 'mp3' | 'linear16' | 'pcm_f32le';
  sampleRate: number;
  channels: 1 | 2;
  ttfbMs: number;
}

export interface TierFeatures {
  sttProvider: 'browser' | 'deepgram';
  ttsProvider: 'openai' | 'deepgram' | 'cartesia';
  supportsAllBrowsers: boolean;
  customVocabulary: boolean;
  maxSessionsPerMonth: number;
  maxExchangesPerSession: number;
  maxTtsCharsPerMonth: number;
}

export const TIER_FEATURES: Record<VoiceTier, TierFeatures> = {
  ground_school: {
    sttProvider: 'browser',
    ttsProvider: 'openai',
    supportsAllBrowsers: false,
    customVocabulary: false,
    maxSessionsPerMonth: 30,
    maxExchangesPerSession: 20,
    maxTtsCharsPerMonth: 200_000,
  },
  checkride_prep: {
    sttProvider: 'deepgram',
    ttsProvider: 'deepgram',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: 60,
    maxExchangesPerSession: 30,
    maxTtsCharsPerMonth: 500_000,
  },
  dpe_live: {
    sttProvider: 'deepgram',
    ttsProvider: 'cartesia',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: Infinity,
    maxExchangesPerSession: 50,
    maxTtsCharsPerMonth: 1_000_000,
  },
};
