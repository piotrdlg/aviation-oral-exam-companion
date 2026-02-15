export type VoiceTier = 'ground_school' | 'checkride_prep' | 'dpe_live';

export interface TTSProvider {
  readonly name: string;
  readonly supportsStreaming: boolean;
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface TTSOptions {
  voice?: string;
  sampleRate?: 24000 | 44100 | 48000;
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
