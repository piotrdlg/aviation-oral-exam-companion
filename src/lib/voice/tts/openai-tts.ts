import OpenAI from 'openai';
import type { TTSProvider, TTSResult, TTSOptions, OpenAITTSConfig } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const DEFAULTS: OpenAITTSConfig = {
  voice: 'onyx',
  model: 'tts-1',
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

    const response = await openai.audio.speech.create({
      model,
      voice: voice as 'onyx',
      input: truncated,
      response_format: 'mp3',
      speed,
    });

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
