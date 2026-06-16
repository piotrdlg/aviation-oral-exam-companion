import { appendKeytermParams } from '@/lib/voice/aviation-keyterms';

/** Encodings a native client may request for raw-PCM capture (exact-match allowlist). */
export const ENCODING_ALLOW = new Set(['linear16']);
/** Sample rates accepted for raw PCM. 16000 is the shipped default (Nova-3 is tuned for 16 kHz). */
export const RATE_ALLOW = new Set([16000, 48000]);

/** Thrown when a client requests an encoding outside {@link ENCODING_ALLOW}; the route maps it to 400. */
export class UnsupportedEncodingError extends Error {
  readonly allowed = [...ENCODING_ALLOW];
  constructor() {
    super('unsupported_encoding');
    this.name = 'UnsupportedEncodingError';
  }
}

export interface BuildListenUrlInput {
  /** `stt.flux_pilot` enabled → /v2/listen; otherwise Nova-3 /v1/listen. */
  flux: boolean;
  /** `system_config['stt.keyterms']` override (array of strings), or undefined for the default list. */
  keytermsConfig?: unknown;
  /** Raw `encoding` query value; its presence signals raw-PCM (container-less) capture. */
  encoding?: string | null;
  /** Raw `sample_rate` query value. */
  sampleRate?: number | string | null;
}

/**
 * Build the Deepgram listen WebSocket URL the client connects to.
 *
 * Web (browser `MediaRecorder`) sends a self-describing Opus/WebM container and
 * passes no `encoding` → the URL omits `encoding`/`sample_rate` (Deepgram
 * auto-detects), exactly as before. Native clients capturing raw linear PCM pass
 * `encoding=linear16` (+ optional `sample_rate`); Deepgram cannot auto-detect raw
 * PCM, so these are required and validated against the allowlist — anything else
 * throws {@link UnsupportedEncodingError} and never reaches Deepgram.
 */
export function buildListenUrl(input: BuildListenUrlInput): { url: string; keytermCount: number } {
  let params: URLSearchParams;
  let base: string;
  if (input.flux) {
    params = new URLSearchParams({ model: 'flux-general-en', eot_threshold: '0.7' });
    base = 'wss://api.deepgram.com/v2/listen?';
  } else {
    params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',
      vad_events: 'true',
    });
    base = 'wss://api.deepgram.com/v1/listen?';
  }

  const keytermCount = appendKeytermParams(params, input.keytermsConfig).length;

  const wantsRawPcm = input.encoding != null && input.encoding !== '';
  if (wantsRawPcm) {
    if (!ENCODING_ALLOW.has(input.encoding as string)) throw new UnsupportedEncodingError();
    const rate = RATE_ALLOW.has(Number(input.sampleRate)) ? Number(input.sampleRate) : 16000;
    params.set('encoding', input.encoding as string);
    params.set('sample_rate', String(rate));
  }

  return { url: base + params.toString(), keytermCount };
}
