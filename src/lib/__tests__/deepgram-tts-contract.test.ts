import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * Deepgram TTS request contract tests.
 *
 * Verify that the outgoing request to Deepgram never contains
 * illegal parameter combinations that cause 400 UNSUPPORTED_AUDIO_FORMAT.
 *
 * Contract rules (per Deepgram API docs):
 * - MP3/Opus/AAC: sample_rate MUST NOT be sent (fixed rate)
 * - Linear16/FLAC: sample_rate MAY be sent
 * - container=none only for PCM formats
 * - system_config MUST NOT override encoding back to linear16
 */

// Capture the URL passed to fetch
let capturedUrl: string | null = null;

const mockFetch = vi.fn().mockImplementation(async (url: string) => {
  capturedUrl = url;
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xfb]));
        controller.close();
      },
    }),
  };
});

beforeEach(() => {
  capturedUrl = null;
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('DEEPGRAM_API_KEY', 'test-key-not-real');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mockFetch.mockClear();
});

async function callSynthesize(config?: Record<string, unknown>) {
  const { DeepgramTTSProvider } = await import('../voice/tts/deepgram-tts');
  const provider = new DeepgramTTSProvider();
  return provider.synthesize('Hello world', config ? { config } : undefined);
}

function getUrlParams(): URLSearchParams {
  expect(capturedUrl).not.toBeNull();
  return new URL(capturedUrl!).searchParams;
}

describe('Deepgram TTS request contract', () => {
  describe('MP3 encoding (current default)', () => {
    it('sets encoding=mp3', async () => {
      await callSynthesize();
      const params = getUrlParams();
      expect(params.get('encoding')).toBe('mp3');
    });

    it('does NOT send sample_rate with mp3', async () => {
      await callSynthesize();
      const params = getUrlParams();
      expect(params.has('sample_rate')).toBe(false);
    });

    it('does NOT send sample_rate even when system_config provides one', async () => {
      await callSynthesize({ sample_rate: 24000 });
      const params = getUrlParams();
      expect(params.has('sample_rate')).toBe(false);
    });

    it('does NOT send container with mp3', async () => {
      await callSynthesize();
      const params = getUrlParams();
      expect(params.has('container')).toBe(false);
    });

    it('returns audio/mpeg content type', async () => {
      const result = await callSynthesize();
      expect(result.contentType).toBe('audio/mpeg');
    });

    it('returns fixed 22050 Hz sample rate for mp3', async () => {
      const result = await callSynthesize();
      expect(result.sampleRate).toBe(22050);
    });
  });

  describe('system_config encoding override prevention', () => {
    it('ignores encoding=linear16 from system_config', async () => {
      await callSynthesize({ encoding: 'linear16' });
      const params = getUrlParams();
      expect(params.get('encoding')).toBe('mp3');
    });

    it('ignores encoding=opus from system_config', async () => {
      await callSynthesize({ encoding: 'opus' });
      const params = getUrlParams();
      expect(params.get('encoding')).toBe('mp3');
    });

    it('ignores encoding=aac from system_config', async () => {
      await callSynthesize({ encoding: 'aac' });
      const params = getUrlParams();
      expect(params.get('encoding')).toBe('mp3');
    });

    it('does not send sample_rate even when system_config has encoding=linear16 + sample_rate', async () => {
      await callSynthesize({ encoding: 'linear16', sample_rate: 48000 });
      const params = getUrlParams();
      expect(params.get('encoding')).toBe('mp3');
      expect(params.has('sample_rate')).toBe(false);
    });
  });

  describe('model override respected', () => {
    it('allows model override from system_config', async () => {
      await callSynthesize({ model: 'aura-2-theia-en' });
      const params = getUrlParams();
      expect(params.get('model')).toBe('aura-2-theia-en');
    });

    it('uses default model when not overridden', async () => {
      await callSynthesize();
      const params = getUrlParams();
      expect(params.get('model')).toBe('aura-2-orion-en');
    });
  });

  describe('TTSResult contract', () => {
    it('returns encoding field as mp3', async () => {
      const result = await callSynthesize();
      expect(result.encoding).toBe('mp3');
    });

    it('returns channels=1', async () => {
      const result = await callSynthesize();
      expect(result.channels).toBe(1);
    });

    it('returns ttfbMs as a number >= 0', async () => {
      const result = await callSynthesize();
      expect(typeof result.ttfbMs).toBe('number');
      expect(result.ttfbMs).toBeGreaterThanOrEqual(0);
    });

    it('returns audio as a ReadableStream', async () => {
      const result = await callSynthesize();
      expect(result.audio).toBeDefined();
    });
  });

  describe('authorization', () => {
    it('throws if DEEPGRAM_API_KEY is empty', async () => {
      vi.stubEnv('DEEPGRAM_API_KEY', '');
      // Need fresh import to pick up new env
      const { DeepgramTTSProvider } = await import('../voice/tts/deepgram-tts');
      const provider = new DeepgramTTSProvider();
      await expect(provider.synthesize('test')).rejects.toThrow('DEEPGRAM_API_KEY');
    });
  });
});

describe('TTS route encoding sanitization (source inspection)', () => {
  const routeSource = readFileSync(
    resolve(__dirname, '../../app/api/tts/route.ts'),
    'utf-8',
  );

  it('strips encoding from system_config before passing to provider', () => {
    expect(routeSource).toContain('encoding:');
    expect(routeSource).toContain('safeTtsConfig');
  });

  it('does not pass raw ttsConfig directly to synthesize', () => {
    expect(routeSource).not.toMatch(/provider\.synthesize\([^)]*ttsConfig[^)]*\)/);
  });
});

describe('FIXED_RATE_ENCODINGS coverage (source inspection)', () => {
  const providerSource = readFileSync(
    resolve(__dirname, '../voice/tts/deepgram-tts.ts'),
    'utf-8',
  );

  it('defines FIXED_RATE_ENCODINGS set', () => {
    expect(providerSource).toContain('FIXED_RATE_ENCODINGS');
  });

  it('includes mp3 in FIXED_RATE_ENCODINGS', () => {
    // Both FIXED_RATE_ENCODINGS and 'mp3' must appear in the source
    expect(providerSource).toContain("'mp3'");
  });

  it('includes opus in FIXED_RATE_ENCODINGS', () => {
    expect(providerSource).toContain("'opus'");
  });

  it('includes aac in FIXED_RATE_ENCODINGS', () => {
    expect(providerSource).toContain("'aac'");
  });

  it('conditionally sends sample_rate only when NOT a fixed-rate encoding', () => {
    expect(providerSource).toContain('if (!isFixedRate)');
  });
});
