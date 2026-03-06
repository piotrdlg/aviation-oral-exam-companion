import type { TTSProvider, TTSResult, TTSOptions, DeepgramTTSConfig } from '../types';

const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak';

const DEFAULTS: DeepgramTTSConfig = {
  model: 'aura-2-orion-en',
  sample_rate: 24000,
  encoding: 'mp3',
};

/**
 * Deepgram Aura-2 TTS provider.
 *
 * ENCODING IS ALWAYS MP3. The AudioWorklet PCM streaming pipeline is broken
 * across browsers (Firefox/Safari silence). MP3 via HTMLAudioElement is the
 * only reliable cross-browser path. system_config encoding overrides are
 * intentionally ignored — model overrides are still respected.
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
    const sampleRate = cfg?.sample_rate || options?.sampleRate || DEFAULTS.sample_rate;

    const url = new URL(DEEPGRAM_TTS_URL);
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', encoding);
    url.searchParams.set('sample_rate', String(sampleRate));
    // container=none strips WAV/RIFF headers from PCM formats.
    // MP3 is self-contained, so skip to avoid Deepgram edge cases.
    if (encoding !== 'mp3') {
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
