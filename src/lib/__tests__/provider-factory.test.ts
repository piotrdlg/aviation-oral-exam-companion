import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Provider factory tests, incl. the W4.1 RUNTIME fallback chain: a provider
 * failure at synthesize() time (not just import time) falls through to the
 * next provider, and `provider.name` reflects who actually served.
 */

const h = vi.hoisted(() => ({
  deepgramSynthesize: vi.fn(),
  openaiSynthesize: vi.fn(),
}));

vi.mock('../voice/tts/deepgram-tts', () => ({
  DeepgramTTSProvider: class {
    name = 'deepgram';
    supportsStreaming = true;
    synthesize = h.deepgramSynthesize;
  },
}));

vi.mock('../voice/tts/openai-tts', () => ({
  OpenAITTSProvider: class {
    name = 'openai';
    supportsStreaming = false;
    synthesize = h.openaiSynthesize;
  },
}));

import { getTTSProviderName, createTTSProvider } from '../voice/provider-factory';

const fakeResult = (provider: string) => ({
  audio: new ReadableStream(),
  contentType: 'audio/mpeg',
  encoding: 'mp3' as const,
  sampleRate: 22050,
  channels: 1 as const,
  ttfbMs: 50,
  _from: provider,
});

beforeEach(() => {
  h.deepgramSynthesize.mockReset();
  h.openaiSynthesize.mockReset();
});

describe('getTTSProviderName', () => {
  it('returns deepgram for every tier (D2: Aura-2 single provider)', () => {
    expect(getTTSProviderName('ground_school')).toBe('deepgram');
    expect(getTTSProviderName('checkride_prep')).toBe('deepgram');
    expect(getTTSProviderName('dpe_live')).toBe('deepgram');
  });
});

describe('runtime fallback chain (W4.1)', () => {
  it('serves from the primary when it succeeds', async () => {
    h.deepgramSynthesize.mockResolvedValue(fakeResult('deepgram'));
    const provider = await createTTSProvider('dpe_live');
    const result = await provider.synthesize('hello', { config: { model: 'aura-2-orion-en' } });
    expect((result as unknown as { _from: string })._from).toBe('deepgram');
    expect(provider.name).toBe('deepgram');
    expect(h.openaiSynthesize).not.toHaveBeenCalled();
  });

  it('falls through to OpenAI when Deepgram FAILS AT SYNTHESIS TIME', async () => {
    h.deepgramSynthesize.mockRejectedValue(new Error('Deepgram TTS request failed (503)'));
    h.openaiSynthesize.mockResolvedValue(fakeResult('openai'));

    const provider = await createTTSProvider('dpe_live');
    const result = await provider.synthesize('hello', { config: { model: 'aura-2-orion-en' } });

    expect((result as unknown as { _from: string })._from).toBe('openai');
    // name now reflects the provider that actually served (usage logs + header)
    expect(provider.name).toBe('openai');
    // the fallback must NOT receive the primary's config (aura model string
    // would be an invalid OpenAI model)
    expect(h.openaiSynthesize).toHaveBeenCalledWith('hello', undefined);
  });

  it('throws the last error when every provider fails', async () => {
    h.deepgramSynthesize.mockRejectedValue(new Error('deepgram down'));
    h.openaiSynthesize.mockRejectedValue(new Error('openai down'));
    const provider = await createTTSProvider('dpe_live');
    await expect(provider.synthesize('hello')).rejects.toThrow('openai down');
  });
});
