import type { TTSProvider, TTSResult, TTSOptions, DeepgramTTSConfig } from '../types';

const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak';

const DEFAULTS: DeepgramTTSConfig = {
  model: 'aura-2-orion-en',
  sample_rate: 24000,
  encoding: 'mp3',
};

/**
 * Encodings where sample_rate is NOT configurable per Deepgram API docs.
 * Sending sample_rate with these encodings causes HTTP 400 UNSUPPORTED_AUDIO_FORMAT.
 * See: https://developers.deepgram.com/docs/tts-media-output-settings
 */
const FIXED_RATE_ENCODINGS = new Set(['mp3', 'opus', 'aac']);

/**
 * Deepgram Aura-2 TTS provider.
 *
 * Encoding is forced to MP3 for cross-browser reliability.
 * The AudioWorklet PCM streaming pipeline produced silence in Firefox/Safari.
 * MP3 via HTMLAudioElement is the only reliable cross-browser path.
 *
 * Request contract enforcement:
 * - MP3/Opus/AAC: sample_rate is NOT sent (Deepgram rejects it)
 * - Linear16/FLAC/etc: sample_rate IS sent
 * - container=none only sent for non-MP3 PCM formats
 * - system_config encoding overrides are ignored; model overrides respected
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
    // Force MP3 — PCM streaming via AudioWorklet is broken cross-browser.
    // Ignore cfg.encoding to prevent system_config from overriding back to linear16.
    const encoding = 'mp3';

    const url = new URL(DEEPGRAM_TTS_URL);
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', encoding);

    // Deepgram API contract: MP3/Opus/AAC have fixed sample rates.
    // Sending sample_rate with these encodings causes 400 UNSUPPORTED_AUDIO_FORMAT.
    const isFixedRate = FIXED_RATE_ENCODINGS.has(encoding);
    if (!isFixedRate) {
      const sampleRate = cfg?.sample_rate || options?.sampleRate || DEFAULTS.sample_rate;
      url.searchParams.set('sample_rate', String(sampleRate));
      // container=none strips WAV/RIFF headers from PCM formats.
      url.searchParams.set('container', 'none');
    }

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

    // MP3 fixed at 22050 Hz by Deepgram; linear16 uses configurable rate
    const effectiveSampleRate = isFixedRate ? 22050 : (cfg?.sample_rate || options?.sampleRate || DEFAULTS.sample_rate);

    return {
      audio: response.body as ReadableStream<Uint8Array>,
      contentType: encoding === 'mp3' ? 'audio/mpeg' : 'audio/l16',
      encoding: encoding as 'linear16' | 'mp3',
      sampleRate: effectiveSampleRate,
      channels: 1,
      ttfbMs,
    };
  }
}
