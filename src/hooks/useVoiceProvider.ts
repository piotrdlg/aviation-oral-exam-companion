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
  speak: (text: string) => Promise<void>;
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

  const [error, setError] = useState<string | null>(null);

  // === TTS: /api/tts → MP3 → HTMLAudioElement ===
  const speak = useCallback(async (text: string) => {
    try {
      setError(null);
      const abortController = new AbortController();
      ttsAbortRef.current = abortController;

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

      setIsSpeaking(true);

      // Read the full response as ArrayBuffer, then create a Blob with
      // explicit MIME type. This is more reliable than response.blob()
      // which may not preserve Content-Type through Next.js streaming.
      // This matches the pattern used in Settings diagnostics (page.tsx:949).
      const arrayBuffer = await response.arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        throw new Error('TTS returned empty audio (0 bytes)');
      }

      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        // Capture detailed error info for diagnostics
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
      };

      await audio.play();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Intentional abort (barge-in)
      }
      const msg = err instanceof Error ? err.message : 'TTS playback failed';
      console.error('[TTS] speak() error:', msg);
      setError(msg);
      setIsSpeaking(false);
      // Clean up blob URL and audio ref to prevent resource leaks.
      // When play() rejects (e.g., autoplay policy), onerror/onended
      // never fire, so we must revoke the URL here.
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
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Combine errors
  const combinedError = error || deepgramSTT.error;

  return {
    startListening: deepgramSTT.startListening,
    stopListening: deepgramSTT.stopListening,
    transcript: deepgramSTT.transcript,
    interimTranscript: deepgramSTT.interimTranscript,
    isListening: deepgramSTT.isListening,
    speak,
    stopSpeaking,
    isSpeaking,
    tier,
    features,
    isReady: true, // MP3 + Audio element needs no initialization
    isRetrying: deepgramSTT.isRetrying,
    error: combinedError,
  };
}
