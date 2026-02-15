import type { TTSProvider, TTSResult, TTSOptions } from '../types';

const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';
const DEFAULT_MODEL = 'sonic-english';
const DEFAULT_SAMPLE_RATE = 44100;
// Default to a professional male voice (Cartesia "Classy British Man")
// Override via CARTESIA_VOICE_ID env var
const DEFAULT_VOICE_ID = '95856005-0332-41b0-935f-352e296aa0df';

/**
 * Cartesia Sonic TTS provider.
 * Uses REST API for bytes endpoint with streaming response.
 * Output: pcm_f32le at 44100Hz, mono.
 * Ultra-low-latency TTFB (~50-90ms at origin).
 */
export class CartesiaTTSProvider implements TTSProvider {
  readonly name = 'cartesia';
  readonly supportsStreaming = true;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      throw new Error('CARTESIA_API_KEY environment variable is not set');
    }

    const voiceId = process.env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID;
    const sampleRate = options?.sampleRate || DEFAULT_SAMPLE_RATE;

    const start = Date.now();

    const response = await fetch(CARTESIA_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: DEFAULT_MODEL,
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
