import type { TTSProvider, TTSResult, TTSOptions } from '../types';

const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak';
const DEFAULT_MODEL = 'aura-2-thalia-en';
const DEFAULT_SAMPLE_RATE = 48000;

/**
 * Deepgram Aura-2 TTS provider.
 * Uses REST API with streaming response for low-latency audio delivery.
 * Output: linear16 PCM at 48kHz, mono.
 */
export class DeepgramTTSProvider implements TTSProvider {
  readonly name = 'deepgram';
  readonly supportsStreaming = true;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is not set');
    }

    const model = DEFAULT_MODEL;
    const sampleRate = options?.sampleRate || DEFAULT_SAMPLE_RATE;

    const url = new URL(DEEPGRAM_TTS_URL);
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16');
    url.searchParams.set('sample_rate', String(sampleRate));
    url.searchParams.set('container', 'none');

    const start = Date.now();

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Deepgram TTS request failed (${response.status}): ${errorBody}`
      );
    }

    const ttfbMs = Date.now() - start;

    if (!response.body) {
      throw new Error('Deepgram TTS response has no body');
    }

    return {
      audio: response.body as ReadableStream<Uint8Array>,
      contentType: 'audio/l16',
      encoding: 'linear16',
      sampleRate,
      channels: 1,
      ttfbMs,
    };
  }
}
