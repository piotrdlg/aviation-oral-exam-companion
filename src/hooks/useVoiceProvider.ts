'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceTier, TierFeatures } from '@/lib/voice/types';
import { TIER_FEATURES } from '@/lib/voice/types';
import { useDeepgramSTT } from './useDeepgramSTT';
import { useStreamingPlayer } from './useStreamingPlayer';

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
  error: string | null;
}

/**
 * Unified voice provider hook that abstracts STT and TTS based on user tier.
 *
 * - Tier 1 (Ground School): Web Speech API STT + OpenAI TTS via /api/tts
 * - Tier 2 (Checkride Prep): Deepgram STT + Deepgram TTS via /api/tts
 * - Tier 3 (DPE Live): Deepgram STT + Cartesia TTS via /api/tts
 *
 * speak() always calls /api/tts, which routes to the correct provider based on the user's tier.
 */
export function useVoiceProvider(options: UseVoiceProviderOptions): UseVoiceProviderReturn {
  const { tier, sessionId } = options;
  const features = TIER_FEATURES[tier];

  // Deepgram STT (Tier 2/3)
  const deepgramSTT = useDeepgramSTT({ sessionId });

  // Streaming player for PCM audio (Tier 2/3)
  const streamingPlayer = useStreamingPlayer();

  // Web Speech API STT state (Tier 1)
  const [webSpeechTranscript, setWebSpeechTranscript] = useState('');
  const [webSpeechInterim, setWebSpeechInterim] = useState('');
  const [webSpeechListening, setWebSpeechListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // TTS state for Tier 1 (non-streaming MP3)
  const [isSpeakingTier1, setIsSpeakingTier1] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  const [error, setError] = useState<string | null>(null);

  const useDeepgram = features.sttProvider === 'deepgram';
  const useStreamingTTS = features.ttsProvider !== 'openai';

  // === STT: Web Speech API (Tier 1) ===
  const startWebSpeechListening = useCallback(async () => {
    const SpeechRecognitionClass =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setError('Speech recognition not supported in this browser. Use Chrome for voice mode.');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      setWebSpeechTranscript(finalText);
      setWebSpeechInterim(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(`Speech recognition error: ${event.error}`);
      }
      setWebSpeechListening(false);
    };

    recognition.onend = () => {
      setWebSpeechListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setWebSpeechListening(true);
    setWebSpeechTranscript('');
    setWebSpeechInterim('');
  }, []);

  const stopWebSpeechListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setWebSpeechListening(false);
    setWebSpeechInterim('');
  }, []);

  // === TTS: speak() routes through /api/tts ===
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

      const encoding = response.headers.get('X-Audio-Encoding') as 'mp3' | 'linear16' | 'pcm_f32le' || 'mp3';
      const sampleRate = parseInt(response.headers.get('X-Audio-Sample-Rate') || '24000', 10);

      if (useStreamingTTS && encoding !== 'mp3') {
        // Tier 2/3: streaming PCM playback via AudioWorklet
        await streamingPlayer.playStream(response, encoding, sampleRate);
      } else {
        // Tier 1: MP3 playback via Audio element
        setIsSpeakingTier1(true);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeakingTier1(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setIsSpeakingTier1(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        await audio.play();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Intentional abort (barge-in)
      }
      const msg = err instanceof Error ? err.message : 'TTS playback failed';
      setError(msg);
      setIsSpeakingTier1(false);
    }
  }, [useStreamingTTS, streamingPlayer]);

  const stopSpeaking = useCallback(() => {
    // Abort in-flight TTS fetch
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }

    // Stop streaming player (Tier 2/3)
    streamingPlayer.stopPlayback();

    // Stop audio element (Tier 1)
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeakingTier1(false);
  }, [streamingPlayer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Select the appropriate STT interface
  const startListening = useDeepgram ? deepgramSTT.startListening : startWebSpeechListening;
  const stopListening = useDeepgram ? deepgramSTT.stopListening : stopWebSpeechListening;
  const transcript = useDeepgram ? deepgramSTT.transcript : webSpeechTranscript;
  const interimTranscript = useDeepgram ? deepgramSTT.interimTranscript : webSpeechInterim;
  const isListening = useDeepgram ? deepgramSTT.isListening : webSpeechListening;

  // Combine speaking state
  const isSpeaking = useStreamingTTS ? streamingPlayer.isSpeaking : isSpeakingTier1;

  // Combine errors
  const combinedError = error || (useDeepgram ? deepgramSTT.error : null) || streamingPlayer.error;

  // Ready state: for streaming tiers, AudioWorklet must be initialized
  const isReady = useStreamingTTS ? streamingPlayer.isReady || !useStreamingTTS : true;

  return {
    startListening,
    stopListening,
    transcript,
    interimTranscript,
    isListening,
    speak,
    stopSpeaking,
    isSpeaking,
    tier,
    features,
    isReady,
    error: combinedError,
  };
}
