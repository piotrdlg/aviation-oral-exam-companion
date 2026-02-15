import OpenAI from 'openai';
import type { TTSProvider, TTSResult, TTSOptions } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';
  readonly supportsStreaming = false;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const start = Date.now();
    const truncated = text.slice(0, 2000);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: (options?.voice as 'onyx') || 'onyx',
      input: truncated,
      response_format: 'mp3',
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
