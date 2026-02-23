'use client';

import { useCallback, useRef, useState } from 'react';
import { detectSentenceBoundary } from '@/lib/voice/sentence-boundary';

interface UseSentenceTTSOptions {
  /** Speak a sentence. Must return a promise that resolves when audio playback finishes. */
  speak: (text: string) => Promise<void>;
  /** Called right before each sentence starts playing — use to reveal that sentence's text. */
  onSentenceStart?: (sentence: string) => void;
  /** Called when flush() has been called and all queued sentences have finished playing. */
  onAllDone?: () => void;
  /** Called on TTS error for a sentence (playback continues with next sentence). */
  onError?: (err: Error) => void;
}

interface UseSentenceTTSReturn {
  /** Feed a new SSE token into the sentence buffer. Automatically queues TTS when a sentence completes. */
  pushToken: (token: string) => void;
  /** Directly enqueue a complete text chunk for TTS (bypasses sentence boundary detection). */
  enqueue: (text: string) => void;
  /** Flush any remaining buffer text to TTS (call when SSE stream ends). */
  flush: () => void;
  /** Cancel all pending sentences and stop (call on barge-in, end session, etc). */
  cancel: () => void;
  /** Whether a sentence is currently being spoken. */
  isSpeaking: boolean;
  /** Number of sentences waiting in queue. */
  queueLength: number;
}

/**
 * Client-side sentence-level TTS streaming hook.
 *
 * Accumulates SSE tokens, detects sentence boundaries, and plays each sentence
 * via a caller-provided speak() function (typically voice.speak from useVoiceProvider).
 * Text is revealed per-sentence via onSentenceStart callback, synchronized with audio.
 *
 * Feature-flagged: only used when tts_sentence_stream.enabled = true.
 */
export function useSentenceTTS(options: UseSentenceTTSOptions): UseSentenceTTSReturn {
  // Store callbacks in refs to avoid stale closures in the async drain loop
  const speakRef = useRef(options.speak);
  speakRef.current = options.speak;
  const onSentenceStartRef = useRef(options.onSentenceStart);
  onSentenceStartRef.current = options.onSentenceStart;
  const onAllDoneRef = useRef(options.onAllDone);
  onAllDoneRef.current = options.onAllDone;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const bufferRef = useRef('');
  const queueRef = useRef<string[]>([]);
  const drainingRef = useRef(false);
  const cancelledRef = useRef(false);
  const flushedRef = useRef(false);
  const hasSentencesRef = useRef(false);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [queueLength, setQueueLength] = useState(0);

  // Drain loop: processes sentences sequentially via speak()
  const startDraining = useCallback(async () => {
    if (drainingRef.current) return; // Already draining

    // Check if queue has anything
    if (queueRef.current.length === 0) {
      // Queue empty — if we already flushed and had sentences, signal completion
      if (flushedRef.current && hasSentencesRef.current) {
        setIsSpeaking(false);
        onAllDoneRef.current?.();
      }
      return;
    }

    drainingRef.current = true;
    setIsSpeaking(true);

    while (queueRef.current.length > 0 && !cancelledRef.current) {
      const sentence = queueRef.current.shift()!;
      setQueueLength(queueRef.current.length);
      hasSentencesRef.current = true;

      // Fire callback BEFORE speaking — this reveals the sentence text
      onSentenceStartRef.current?.(sentence);

      try {
        await speakRef.current(sentence);
      } catch (err) {
        if (!cancelledRef.current) {
          onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    drainingRef.current = false;

    if (cancelledRef.current) return;

    // Check if more sentences arrived during the last speak()
    if (queueRef.current.length > 0) {
      startDraining(); // Restart
      return;
    }

    // Queue empty and done draining
    setIsSpeaking(false);
    setQueueLength(0);

    if (flushedRef.current && hasSentencesRef.current) {
      onAllDoneRef.current?.();
    }
  }, []);

  const enqueueSentence = useCallback((sentence: string) => {
    if (cancelledRef.current) return;
    queueRef.current.push(sentence);
    setQueueLength(queueRef.current.length);
    startDraining(); // No-op if already draining
  }, [startDraining]);

  const pushToken = useCallback((token: string) => {
    if (cancelledRef.current) return;
    bufferRef.current += token;

    const result = detectSentenceBoundary(bufferRef.current);
    if (result) {
      bufferRef.current = result.remainder;
      enqueueSentence(result.sentence);
    }
  }, [enqueueSentence]);

  const flush = useCallback(() => {
    const remaining = bufferRef.current.trim();
    bufferRef.current = '';
    flushedRef.current = true;

    if (remaining.length > 0) {
      enqueueSentence(remaining);
    } else if (!drainingRef.current && hasSentencesRef.current) {
      // Nothing to flush and not draining — all done
      setIsSpeaking(false);
      onAllDoneRef.current?.();
    }
  }, [enqueueSentence]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    bufferRef.current = '';
    queueRef.current = [];
    flushedRef.current = false;
    hasSentencesRef.current = false;
    setQueueLength(0);
    setIsSpeaking(false);
    drainingRef.current = false;

    // Reset for next use
    cancelledRef.current = false;
  }, []);

  return { pushToken, enqueue: enqueueSentence, flush, cancel, isSpeaking, queueLength };
}
