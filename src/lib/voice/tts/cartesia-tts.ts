import type { TTSProvider, TTSResult, TTSOptions } from '../types';

const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';
const DEFAULT_MODEL = 'sonic-3';
const DEFAULT_SAMPLE_RATE = 48000;

// "Classy British Man" — deep, authoritative, professional male voice
// Well-suited for DPE persona: composed, deliberate, confident
// Override via CARTESIA_VOICE_ID env var
const DEFAULT_VOICE_ID = 'a167e0f3-df7e-4d52-a9c3-f949145571bd';

// DPE persona generation config — slightly slower pace, confident emotion
const DPE_GENERATION_CONFIG = {
  speed: 0.95,    // slightly deliberate pacing — examiner is never rushed
  volume: 1.0,
  emotion: 'confident' as const,
};

/**
 * Cartesia Sonic 3 TTS provider.
 * Uses REST bytes endpoint with streaming response.
 * Output: pcm_f32le at 48kHz, mono.
 *
 * Sonic 3 features used for DPE persona:
 * - generation_config.speed: 0.95 (deliberate, examiner-like pace)
 * - generation_config.emotion: "confident" (professional authority)
 * - SSML: <spell> for aviation abbreviations, <break> for natural pauses
 *
 * Override voice via CARTESIA_VOICE_ID env var.
 * Override speed via CARTESIA_SPEED env var (0.6-1.5).
 * Override emotion via CARTESIA_EMOTION env var.
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

    const speed = process.env.CARTESIA_SPEED
      ? parseFloat(process.env.CARTESIA_SPEED)
      : DPE_GENERATION_CONFIG.speed;
    const emotion = process.env.CARTESIA_EMOTION || DPE_GENERATION_CONFIG.emotion;

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
        generation_config: {
          speed,
          volume: DPE_GENERATION_CONFIG.volume,
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
