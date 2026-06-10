import OpenAI from 'openai';
import type { TTSProvider, TTSResult, TTSOptions, OpenAITTSConfig } from '../types';

// Lazy client (W4.1): a missing OPENAI_API_KEY must not crash at import time —
// this module is dynamically imported as the FALLBACK provider, and an import
// crash would defeat the fallback chain entirely.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const DEFAULTS: OpenAITTSConfig = {
  voice: 'onyx',
  // W4.1 (review-04 #14): gpt-4o-mini-tts superseded tts-1 (better quality
  // per dollar, instructable). tts-1 remains selectable via system_config.
  model: 'gpt-4o-mini-tts',
  speed: 1.0,
};

export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';
  readonly supportsStreaming = false;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const cfg = options?.config as Partial<OpenAITTSConfig> | undefined;

    const voice = cfg?.voice || process.env.OPENAI_TTS_VOICE || DEFAULTS.voice;
    const model = cfg?.model || DEFAULTS.model;
    const speed = cfg?.speed ?? DEFAULTS.speed;

    const start = Date.now();
    const truncated = text.slice(0, 2000);

    const response = await getOpenAI().audio.speech.create({
      model,
      voice: voice as 'onyx',
      input: truncated,
      response_format: 'mp3',
      speed,
    }, { signal: AbortSignal.timeout(10000) });

    const ttfbMs = Date.now() - start;
    const arrayBuffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Wrap buffer in a single-chunk ReadableStream for uniform handling
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(uint8);
        controller.close();
      },
    });

    return {
      audio,
      contentType: 'audio/mpeg',
      encoding: 'mp3',
      sampleRate: 24000,
      channels: 1,
      ttfbMs,
    };
  }
}
