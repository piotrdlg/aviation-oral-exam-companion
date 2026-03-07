import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for audio-unlock.ts — browser audio pre-warming utility.
 *
 * Verifies:
 * - warmUpAudio() creates Audio element with silent WAV source
 * - warmUpAudio() calls play() synchronously (required for gesture context)
 * - Multiple calls are idempotent after first unlock
 * - isAudioUnlocked() reports correct state
 * - Graceful handling of play() rejection (no user gesture)
 */

describe('audio-unlock', () => {
  let playFn: ReturnType<typeof vi.fn>;
  let pauseFn: ReturnType<typeof vi.fn>;
  let lastAudioSrc: string | undefined;
  let lastAudioVolume: number | undefined;

  beforeEach(() => {
    // Reset module state between tests (unlocked flag is module-scoped)
    vi.resetModules();

    playFn = vi.fn().mockResolvedValue(undefined);
    pauseFn = vi.fn();
    lastAudioSrc = undefined;
    lastAudioVolume = undefined;

    // Mock Audio constructor
    const MockAudio = function (this: Record<string, unknown>, src?: string) {
      this.src = src || '';
      this.volume = 1;
      this.play = playFn;
      this.pause = pauseFn;
      this.load = vi.fn();
      this.removeAttribute = vi.fn();
      lastAudioSrc = src;
    } as unknown as typeof Audio;
    vi.stubGlobal('Audio', MockAudio);

    // Mock AudioContext
    const MockAudioContext = function (this: Record<string, unknown>) {
      this.state = 'suspended';
      this.resume = vi.fn().mockResolvedValue(undefined);
      this.close = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof AudioContext;
    vi.stubGlobal('AudioContext', MockAudioContext);

    // Make typeof window !== 'undefined' (SSR guard)
    if (typeof globalThis.window === 'undefined') {
      (globalThis as Record<string, unknown>).window = globalThis;
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates Audio element with silent WAV data URI', async () => {
    const { warmUpAudio } = await import('../audio-unlock');
    warmUpAudio();
    expect(lastAudioSrc).toBeDefined();
    expect(lastAudioSrc).toContain('data:audio/wav;base64,');
  });

  it('calls play() synchronously (within gesture context)', async () => {
    const { warmUpAudio } = await import('../audio-unlock');
    warmUpAudio();
    expect(playFn).toHaveBeenCalledTimes(1);
  });

  it('sets isAudioUnlocked to true after successful play', async () => {
    const { warmUpAudio, isAudioUnlocked } = await import('../audio-unlock');
    expect(isAudioUnlocked()).toBe(false);
    warmUpAudio();
    // Wait for play() promise to resolve
    await vi.waitFor(() => expect(isAudioUnlocked()).toBe(true), { timeout: 100 });
  });

  it('is idempotent — second call does not play again', async () => {
    const { warmUpAudio } = await import('../audio-unlock');
    warmUpAudio();
    await vi.waitFor(() => {}, { timeout: 20 });
    warmUpAudio(); // second call after unlock
    expect(playFn).toHaveBeenCalledTimes(1);
  });

  it('handles play() rejection gracefully (no gesture)', async () => {
    playFn.mockRejectedValueOnce(new DOMException('NotAllowedError'));
    const { warmUpAudio, isAudioUnlocked } = await import('../audio-unlock');
    warmUpAudio();
    await new Promise((r) => setTimeout(r, 20));
    expect(isAudioUnlocked()).toBe(false); // Still locked
  });

  it('retries on next call after previous rejection', async () => {
    playFn.mockRejectedValueOnce(new DOMException('NotAllowedError'));
    const { warmUpAudio, isAudioUnlocked } = await import('../audio-unlock');

    warmUpAudio();
    await new Promise((r) => setTimeout(r, 20));
    expect(isAudioUnlocked()).toBe(false);

    // Second attempt — play succeeds
    playFn.mockResolvedValueOnce(undefined);
    warmUpAudio();
    await vi.waitFor(() => expect(isAudioUnlocked()).toBe(true), { timeout: 100 });
  });

  it('silent WAV is valid base64 (RIFF/WAVE header)', async () => {
    const { warmUpAudio } = await import('../audio-unlock');
    warmUpAudio();
    expect(lastAudioSrc).toBeDefined();
    const base64 = lastAudioSrc!.split(',')[1];
    const decoded = Buffer.from(base64, 'base64');
    // Minimum valid WAV: 44 bytes (header) + data
    expect(decoded.length).toBeGreaterThanOrEqual(44);
    // RIFF magic bytes
    expect(decoded.slice(0, 4).toString()).toBe('RIFF');
    // WAVE format
    expect(decoded.slice(8, 12).toString()).toBe('WAVE');
  });
});

describe('useVoiceProvider playback contract (source inspection)', () => {
  it('uses explicit Blob with audio/mpeg MIME type (not response.blob())', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../hooks/useVoiceProvider.ts'),
      'utf-8',
    );
    // Must use explicit Blob constructor with MIME type
    expect(source).toContain("new Blob([arrayBuffer], { type: 'audio/mpeg' })");
    // Must NOT use response.blob() as actual code (comment references OK)
    const lines = source.split('\n');
    const responseBlobCodeLine = lines.find(
      (l) => l.includes('response.blob()') && !l.trim().startsWith('//') && !l.trim().startsWith('*'),
    );
    expect(responseBlobCodeLine).toBeUndefined();
  });

  it('checks for empty response (0 bytes)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../hooks/useVoiceProvider.ts'),
      'utf-8',
    );
    expect(source).toContain('arrayBuffer.byteLength === 0');
  });

  it('captures detailed error info in onerror handler', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../hooks/useVoiceProvider.ts'),
      'utf-8',
    );
    expect(source).toContain('audio.error');
    expect(source).toContain('canPlayType');
    expect(source).toContain('blob.size');
  });

  it('documents audio unlock requirement', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../hooks/useVoiceProvider.ts'),
      'utf-8',
    );
    expect(source).toContain('warmUpAudio');
  });
});

describe('practice page audio unlock integration (source inspection)', () => {
  it('imports warmUpAudio', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/practice/page.tsx'),
      'utf-8',
    );
    expect(source).toContain("import { warmUpAudio } from '@/lib/audio-unlock'");
  });

  it('calls warmUpAudio in startSession before first await', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/practice/page.tsx'),
      'utf-8',
    );
    const startIdx = source.indexOf('function startSession');
    const firstAwait = source.indexOf('await', startIdx);
    const warmUpIdx = source.indexOf('warmUpAudio()', startIdx);
    expect(warmUpIdx).toBeGreaterThan(startIdx);
    expect(warmUpIdx).toBeLessThan(firstAwait);
  });

  it('calls warmUpAudio in sendAnswer before first fetch', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/practice/page.tsx'),
      'utf-8',
    );
    const sendIdx = source.indexOf('function sendAnswer');
    const firstFetch = source.indexOf('fetchWithRetry', sendIdx);
    const warmUpIdx = source.indexOf('warmUpAudio()', sendIdx);
    expect(warmUpIdx).toBeGreaterThan(sendIdx);
    expect(warmUpIdx).toBeLessThan(firstFetch);
  });
});

describe('practice page resumeSession audio unlock (source inspection)', () => {
  it('calls warmUpAudio in resumeSession before first await', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/practice/page.tsx'),
      'utf-8',
    );
    const resumeIdx = source.indexOf('function resumeSession');
    const firstAwait = source.indexOf('await', source.indexOf('fetch(', resumeIdx));
    const warmUpIdx = source.indexOf('warmUpAudio()', resumeIdx);
    expect(warmUpIdx).toBeGreaterThan(resumeIdx);
    expect(warmUpIdx).toBeLessThan(firstAwait);
  });
});

describe('useVoiceProvider blob URL cleanup (source inspection)', () => {
  it('revokes blob URL in catch block when play() rejects', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../hooks/useVoiceProvider.ts'),
      'utf-8',
    );
    // The catch block must revoke blob URLs to prevent leaks
    const catchIdx = source.indexOf('} catch (err) {');
    const revokeInCatch = source.indexOf('revokeObjectURL', catchIdx);
    expect(revokeInCatch).toBeGreaterThan(catchIdx);
  });
});

describe('settings page audio unlock integration (source inspection)', () => {
  it('imports warmUpAudio', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/settings/page.tsx'),
      'utf-8',
    );
    expect(source).toContain("import { warmUpAudio } from '@/lib/audio-unlock'");
  });

  it('calls warmUpAudio in previewVoice before fetch', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/settings/page.tsx'),
      'utf-8',
    );
    const previewIdx = source.indexOf('function previewVoice');
    const firstFetch = source.indexOf('fetch(', previewIdx);
    const warmUpIdx = source.indexOf('warmUpAudio()', previewIdx);
    expect(warmUpIdx).toBeGreaterThan(previewIdx);
    expect(warmUpIdx).toBeLessThan(firstFetch);
  });

  it('calls warmUpAudio in runDiagnostics', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(
      resolve(__dirname, '../../app/(dashboard)/settings/page.tsx'),
      'utf-8',
    );
    const diagIdx = source.indexOf('function runDiagnostics');
    const warmUpIdx = source.indexOf('warmUpAudio()', diagIdx);
    expect(warmUpIdx).toBeGreaterThan(diagIdx);
  });
});
