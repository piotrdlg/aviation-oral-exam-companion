'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceTier, TierFeatures } from '@/lib/voice/types';
import { TIER_FEATURES } from '@/lib/voice/types';
import { useDeepgramSTT } from './useDeepgramSTT';

interface UseVoiceProviderOptions {
  tier: VoiceTier;
  sessionId?: string;
}

interface UseVoiceProviderReturn {
  // STT
  startListening: () => Promise<void>;
  stopListening: () => void;
  transcript: string;
  interimTranscript: string;
  isListening: boolean;

  // TTS
  speak: (text: string, onReady?: () => void) => Promise<void>;
  /** Pre-fetch TTS audio for text that will be spoken soon. Idempotent per text.
   *  When speak() is later called with the same text, it uses the cached audio
   *  instead of making a new fetch — eliminating the inter-chunk latency gap. */
  prefetch: (text: string) => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;

  // Meta
  tier: VoiceTier;
  features: TierFeatures;
  isReady: boolean;
  /** Whether STT is retrying a failed WebSocket connection */
  isRetrying: boolean;
  error: string | null;
}

/**
 * Unified voice provider hook.
 *
 * STT: Deepgram Nova-3 via WebSocket (all tiers).
 * TTS: /api/tts returns MP3 → played via HTMLAudioElement (all tiers).
 *
 * The AudioWorklet PCM streaming pipeline was removed because it produced
 * silence in Firefox/Safari. MP3 + Audio element works cross-browser.
 *
 * Audio unlock: callers must call warmUpAudio() from src/lib/audio-unlock.ts
 * SYNCHRONOUSLY inside their user gesture handlers (onClick) BEFORE any
 * async work. This is required for Safari/iOS autoplay policy compliance.
 */
export function useVoiceProvider(options: UseVoiceProviderOptions): UseVoiceProviderReturn {
  const { tier, sessionId } = options;
  const features = TIER_FEATURES[tier];

  // Deepgram STT (all tiers)
  const deepgramSTT = useDeepgramSTT({ sessionId });

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  // Prefetch cache: maps text → { promise resolving to Blob, AbortController }.
  // Allows upcoming chunks to be fetched in parallel with current playback,
  // eliminating the ~400-800ms TTS API round-trip gap between chunks.
  const prefetchCacheRef = useRef<Map<string, { promise: Promise<Blob>; controller: AbortController }>>(new Map());

  const [error, setError] = useState<string | null>(null);

  // === TTS prefetch: start fetching audio before it's needed ===
  const prefetch = useCallback((text: string): void => {
    if (prefetchCacheRef.current.has(text)) return; // Already prefetching
    const controller = new AbortController();
    const promise = fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`TTS prefetch failed (${res.status})`);
        return res.arrayBuffer();
      })
      .then(buf => new Blob([buf], { type: 'audio/mpeg' }))
      .catch(err => {
        // Remove failed entries so speak() falls back to normal fetch
        prefetchCacheRef.current.delete(text);
        throw err;
      });
    prefetchCacheRef.current.set(text, { promise, controller });
  }, []);

  const clearPrefetch = useCallback(() => {
    for (const entry of prefetchCacheRef.current.values()) {
      entry.controller.abort();
    }
    prefetchCacheRef.current.clear();
  }, []);

  // === TTS: /api/tts → MP3 → HTMLAudioElement ===
  // IMPORTANT: speak() resolves when audio playback ENDS, not when it starts.
  // This ensures sequential playback in the paragraph drain loop.
  const speak = useCallback(async (text: string, onReady?: () => void) => {
    try {
      setError(null);

      // Defensive: stop any previously playing audio to prevent overlap.
      // For sequential calls (drain loop), previous audio has already ended — no-ops.
      // For concurrent calls from different code paths, this prevents two Audio
      // elements playing simultaneously.
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const abortController = new AbortController();
      ttsAbortRef.current = abortController;

      // Check prefetch cache first — if audio was pre-fetched while the
      // previous chunk was playing, we can skip the TTS API round-trip entirely.
      let blob: Blob | null = null;
      const cached = prefetchCacheRef.current.get(text);
      if (cached) {
        prefetchCacheRef.current.delete(text);
        try {
          blob = await cached.promise;
          // Check if we were aborted while waiting for the cached promise
          if (abortController.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          blob = null; // Prefetch failed — fall through to normal fetch
        }
      }

      if (!blob) {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'TTS request failed' }));
          throw new Error(errData.error || `TTS failed (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (arrayBuffer.byteLength === 0) {
          throw new Error('TTS returned empty audio (0 bytes)');
        }

        blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      }

      setIsSpeaking(true);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      // Wait for audio playback to COMPLETE (not just start).
      // This is critical: the paragraph drain loop awaits speak(),
      // so it must not advance to the next paragraph until this one finishes.
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          const mediaErr = audio.error;
          const detail = mediaErr
            ? `code=${mediaErr.code} ${mediaErr.message || ''}`
            : 'unknown';
          console.error(
            `[TTS] Audio playback error: ${detail}`,
            `blob.size=${blob.size}`,
            `blob.type=${blob.type}`,
            `canPlayMP3=${audio.canPlayType('audio/mpeg')}`,
          );
          setError(`Audio playback failed (${detail})`);
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          reject(new Error(`Audio playback failed (${detail})`));
        };

        // Handle barge-in: stopSpeaking() aborts this controller
        abortController.signal.addEventListener('abort', () => {
          audio.pause();
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          reject(new DOMException('Aborted', 'AbortError'));
        });

        // Signal that audio is ready — caller can reveal text here,
        // synchronized with the moment audio is about to play.
        onReady?.();

        audio.play().catch((playErr) => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          reject(playErr);
        });
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Intentional abort (barge-in)
      }
      const msg = err instanceof Error ? err.message : 'TTS playback failed';
      console.error('[TTS] speak() error:', msg);
      setError(msg);
      setIsSpeaking(false);
      if (audioRef.current) {
        const src = audioRef.current.src;
        if (src && src.startsWith('blob:')) {
          URL.revokeObjectURL(src);
        }
        audioRef.current = null;
      }
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    // Abort in-flight TTS fetch
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }

    // Stop audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);

    // Abort and clear any prefetched audio (barge-in cleanup)
    clearPrefetch();
  }, [clearPrefetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      clearPrefetch();
    };
  }, [clearPrefetch]);

  // Combine errors
  const combinedError = error || deepgramSTT.error;

  return {
    startListening: deepgramSTT.startListening,
    stopListening: deepgramSTT.stopListening,
    transcript: deepgramSTT.transcript,
    interimTranscript: deepgramSTT.interimTranscript,
    isListening: deepgramSTT.isListening,
    speak,
    prefetch,
    stopSpeaking,
    isSpeaking,
    tier,
    features,
    isReady: true, // MP3 + Audio element needs no initialization
    isRetrying: deepgramSTT.isRetrying,
    error: combinedError,
  };
}
