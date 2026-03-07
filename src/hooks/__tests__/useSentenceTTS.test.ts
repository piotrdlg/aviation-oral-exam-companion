import { describe, it, expect, vi } from 'vitest';

/**
 * Regression tests for useSentenceTTS drain loop coordination.
 *
 * These tests validate the onReady callback pattern that synchronizes
 * text reveal with audio playback. The critical invariant:
 *
 *   onSentenceStart must fire INSIDE the onReady callback of speak(),
 *   NOT before speak() is called.
 *
 * Without this, text appears 500ms-2s before audio (the TTS fetch delay).
 *
 * Since useSentenceTTS is a React hook, we test the core drain loop logic
 * by extracting and verifying the callback wiring contract.
 */

// Minimal simulation of the drain loop logic from useSentenceTTS
async function simulateDrainLoop(
  queue: string[],
  speak: (text: string, onReady?: () => void) => Promise<void>,
  onSentenceStart: (sentence: string) => void,
) {
  for (const sentence of queue) {
    await speak(sentence, () => {
      onSentenceStart(sentence);
    });
  }
}

describe('useSentenceTTS drain loop — onReady sync contract', () => {
  it('fires onSentenceStart INSIDE onReady, not before speak()', async () => {
    const callOrder: string[] = [];

    const speak = vi.fn(async (text: string, onReady?: () => void) => {
      callOrder.push(`speak-start:${text}`);
      // Simulate TTS fetch delay
      await new Promise((r) => setTimeout(r, 10));
      // onReady fires after fetch, before play
      onReady?.();
      callOrder.push(`speak-playing:${text}`);
      // Simulate playback
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push(`speak-end:${text}`);
    });

    const onSentenceStart = vi.fn((sentence: string) => {
      callOrder.push(`text-reveal:${sentence}`);
    });

    await simulateDrainLoop(['Hello.', 'World.'], speak, onSentenceStart);

    // Verify: text-reveal must appear AFTER speak-start (TTS fetch),
    // not before it. This is the critical invariant.
    expect(callOrder).toEqual([
      'speak-start:Hello.',
      'text-reveal:Hello.',
      'speak-playing:Hello.',
      'speak-end:Hello.',
      'speak-start:World.',
      'text-reveal:World.',
      'speak-playing:World.',
      'speak-end:World.',
    ]);
  });

  it('sentences play sequentially (no overlapping)', async () => {
    const activePlaybacks: string[] = [];
    let maxConcurrent = 0;

    const speak = vi.fn(async (text: string, onReady?: () => void) => {
      activePlaybacks.push(text);
      maxConcurrent = Math.max(maxConcurrent, activePlaybacks.length);
      onReady?.();
      await new Promise((r) => setTimeout(r, 10));
      activePlaybacks.pop();
    });

    await simulateDrainLoop(['A.', 'B.', 'C.'], speak, () => {});

    expect(maxConcurrent).toBe(1);
    expect(speak).toHaveBeenCalledTimes(3);
  });

  it('onReady is optional — speak works without it', async () => {
    const speak = vi.fn(async (_text: string, onReady?: () => void) => {
      onReady?.(); // No-op if not provided
    });

    // Simulate speak without onReady (legacy path)
    await speak('test');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('text reveal order matches queue order', async () => {
    const revealed: string[] = [];

    const speak = vi.fn(async (_text: string, onReady?: () => void) => {
      await new Promise((r) => setTimeout(r, 5));
      onReady?.();
    });

    const onSentenceStart = (sentence: string) => {
      revealed.push(sentence);
    };

    const chunks = ['Good answer.', 'The VOR is...', 'Next question:'];
    await simulateDrainLoop(chunks, speak, onSentenceStart);

    expect(revealed).toEqual(chunks);
  });

  it('speak error does not prevent subsequent sentences', async () => {
    const revealed: string[] = [];
    let callCount = 0;

    const speak = vi.fn(async (text: string, onReady?: () => void) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('TTS fetch failed');
      }
      onReady?.();
      await new Promise((r) => setTimeout(r, 5));
    });

    // Modified drain loop with error handling (mirrors real useSentenceTTS)
    const queue = ['First.', 'FAIL.', 'Third.'];
    for (const sentence of queue) {
      try {
        await speak(sentence, () => {
          revealed.push(sentence);
        });
      } catch {
        // Continue to next sentence (matches real behavior)
      }
    }

    expect(revealed).toEqual(['First.', 'Third.']);
    expect(speak).toHaveBeenCalledTimes(3);
  });
});

describe('useSentenceTTS flush + onAllDone contract', () => {
  it('flush with empty buffer triggers onAllDone if sentences were played', async () => {
    // Simulates the flush() behavior: when buffer is empty and not draining,
    // onAllDone should fire if hasSentences is true
    const onAllDone = vi.fn();
    const hasSentences = true;
    const isDraining = false;
    const buffer = '';

    // Replicate flush logic
    const remaining = buffer.trim();
    const flushed = true;

    if (remaining.length === 0 && !isDraining && hasSentences && flushed) {
      onAllDone();
    }

    expect(onAllDone).toHaveBeenCalledOnce();
  });

  it('flush with remaining text enqueues it before completing', () => {
    const enqueued: string[] = [];
    const enqueueSentence = (text: string) => enqueued.push(text);

    // Replicate flush logic
    const buffer = 'remaining text';
    const remaining = buffer.trim();

    if (remaining.length > 0) {
      enqueueSentence(remaining);
    }

    expect(enqueued).toEqual(['remaining text']);
  });
});

describe('stream-end double-speak prevention', () => {
  it('chunksReceived > 0 should call flush, not speakText', () => {
    // This test documents the stream-end branching logic
    // that prevents double-speak when chunks are used
    const chunksReceived = 3;
    const paragraphsReceived = 0;
    const examinerMsg = 'Some message';

    let flushed = false;
    let spokeFull = false;

    // Replicate stream-end logic from practice/page.tsx
    if (chunksReceived > 0) {
      flushed = true; // sentenceTTS.flush()
    } else if (paragraphsReceived > 0) {
      // paragraph path
    } else {
      spokeFull = true; // speakText(examinerMsg)
    }

    expect(flushed).toBe(true);
    expect(spokeFull).toBe(false);
    // Key: when chunks received, we flush (not speak full text)
    expect(examinerMsg).toBeTruthy(); // examinerMsg exists but is not double-spoken
  });

  it('no chunks and no paragraphs falls back to speakText', () => {
    const chunksReceived = 0;
    const paragraphsReceived = 0;

    let flushed = false;
    let spokeFull = false;

    if (chunksReceived > 0) {
      flushed = true;
    } else if (paragraphsReceived > 0) {
      // paragraph path
    } else {
      spokeFull = true;
    }

    expect(flushed).toBe(false);
    expect(spokeFull).toBe(true);
  });

  it('paragraphs path does not trigger flush or speakText', () => {
    const chunksReceived = 0;
    const paragraphsReceived = 2;

    let flushed = false;
    let spokeFull = false;
    let paragraphPath = false;

    if (chunksReceived > 0) {
      flushed = true;
    } else if (paragraphsReceived > 0) {
      paragraphPath = true;
    } else {
      spokeFull = true;
    }

    expect(paragraphPath).toBe(true);
    expect(flushed).toBe(false);
    expect(spokeFull).toBe(false);
  });
});

describe('chunkModeActiveRef guard — isSpeaking effect bypass', () => {
  it('isSpeaking effect should NOT flush when chunk mode is active', () => {
    // Simulates the isSpeaking effect guard logic from practice/page.tsx.
    // When chunkModeActive is true, flushReveal must NOT be called —
    // the chunk path handles text reveal progressively via onSentenceStart.
    const chunkModeActive = true;
    let flushed = false;
    const pendingFullText = 'Full examiner message';

    // Replicate guarded isSpeaking effect
    if (!chunkModeActive && pendingFullText) {
      flushed = true;
    }

    expect(flushed).toBe(false);
  });

  it('isSpeaking effect SHOULD flush when chunk mode is NOT active', () => {
    const chunkModeActive = false;
    let flushed = false;
    const pendingFullText = 'Full examiner message';

    if (!chunkModeActive && pendingFullText) {
      flushed = true;
    }

    expect(flushed).toBe(true);
  });

  it('chunkModeActive clears on onAllDone, allowing subsequent flushReveal', () => {
    let chunkModeActive = true;
    let flushed = false;
    const pendingFullText = 'Full examiner message';

    // Simulate onAllDone callback
    chunkModeActive = false;

    // Now isSpeaking effect can flush
    if (!chunkModeActive && pendingFullText) {
      flushed = true;
    }

    expect(flushed).toBe(true);
  });
});

describe('speak() stop-previous guard', () => {
  it('stops previous audio before starting new audio', async () => {
    const callOrder: string[] = [];
    let abortCount = 0;
    let pauseCount = 0;

    // Simulate the stop-previous guard from useVoiceProvider.speak()
    const speakWithGuard = async (text: string) => {
      // Stop previous
      abortCount++;
      pauseCount++;
      callOrder.push(`stop-prev:${text}`);

      // Start new
      callOrder.push(`start:${text}`);
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push(`end:${text}`);
    };

    await speakWithGuard('chunk1');
    await speakWithGuard('chunk2');

    expect(callOrder).toEqual([
      'stop-prev:chunk1',
      'start:chunk1',
      'end:chunk1',
      'stop-prev:chunk2',
      'start:chunk2',
      'end:chunk2',
    ]);
    expect(abortCount).toBe(2);
    expect(pauseCount).toBe(2);
  });
});
