import type { TTSProvider, TTSResult, TTSOptions, DeepgramTTSConfig } from '../types';

const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak';

const DEFAULTS: DeepgramTTSConfig = {
  model: 'aura-2-orion-en',
  sample_rate: 48000,
  encoding: 'linear16',
};

/**
 * Deepgram Aura-2 TTS provider.
 * Config priority: system_config > env var > hardcoded default.
 */
export class DeepgramTTSProvider implements TTSProvider {
  readonly name = 'deepgram';
  readonly supportsStreaming = true;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is not set');
    }

    const cfg = options?.config as Partial<DeepgramTTSConfig> | undefined;

    const model = cfg?.model || process.env.DEEPGRAM_VOICE_MODEL || DEFAULTS.model;
    const encoding = cfg?.encoding || DEFAULTS.encoding;
    const sampleRate = cfg?.sample_rate || options?.sampleRate || DEFAULTS.sample_rate;

    const url = new URL(DEEPGRAM_TTS_URL);
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', encoding);
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
      contentType: encoding === 'mp3' ? 'audio/mpeg' : 'audio/l16',
      encoding: encoding as 'linear16' | 'mp3',
      sampleRate,
      channels: 1,
      ttfbMs,
    };
  }
}
