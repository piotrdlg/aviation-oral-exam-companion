import type { TTSProvider, TTSResult, TTSOptions, CartesiaTTSConfig } from '../types';

const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';

const DEFAULTS: CartesiaTTSConfig = {
  model: 'sonic-3',
  voice_id: 'a167e0f3-df7e-4d52-a9c3-f949145571bd',
  voice_name: 'Classy British Man',
  speed: 0.95,
  volume: 1.0,
  emotion: 'confident',
  sample_rate: 48000,
};

/**
 * Cartesia Sonic 3 TTS provider.
 * Config priority: system_config > env var > hardcoded default.
 */
export class CartesiaTTSProvider implements TTSProvider {
  readonly name = 'cartesia';
  readonly supportsStreaming = true;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      throw new Error('CARTESIA_API_KEY environment variable is not set');
    }

    const cfg = options?.config as Partial<CartesiaTTSConfig> | undefined;

    const model = cfg?.model || DEFAULTS.model;
    const voiceId = cfg?.voice_id || process.env.CARTESIA_VOICE_ID || DEFAULTS.voice_id;
    const speed = cfg?.speed ?? (process.env.CARTESIA_SPEED ? parseFloat(process.env.CARTESIA_SPEED) : DEFAULTS.speed);
    const volume = cfg?.volume ?? DEFAULTS.volume;
    const emotion = cfg?.emotion || process.env.CARTESIA_EMOTION || DEFAULTS.emotion;
    const sampleRate = cfg?.sample_rate || options?.sampleRate || DEFAULTS.sample_rate;

    const start = Date.now();

    const response = await fetch(CARTESIA_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-11-13',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: model,
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_f32le',
          sample_rate: sampleRate,
        },
        generation_config: {
          speed,
          volume,
          emotion,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Cartesia TTS request failed (${response.status}): ${errorBody}`
      );
    }

    const ttfbMs = Date.now() - start;

    if (!response.body) {
      throw new Error('Cartesia TTS response has no body');
    }

    return {
      audio: response.body as ReadableStream<Uint8Array>,
      contentType: 'audio/pcm',
      encoding: 'pcm_f32le',
      sampleRate,
      channels: 1,
      ttfbMs,
    };
  }
}
