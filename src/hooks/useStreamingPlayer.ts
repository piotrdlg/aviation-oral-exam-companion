'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type AudioEncoding = 'linear16' | 'pcm_f32le' | 'mp3';

interface UseStreamingPlayerReturn {
  /** Play audio from a streaming Response. Reads the body and pipes PCM to AudioWorklet. */
  playStream: (response: Response, encoding: AudioEncoding, sampleRate: number) => Promise<void>;
  /** Stop playback immediately, abort stream, flush buffer. */
  stopPlayback: () => void;
  /** Whether audio is currently playing. */
  isSpeaking: boolean;
  /** Whether AudioContext and AudioWorklet are initialized and ready. */
  isReady: boolean;
  /** Error message if initialization or playback failed. */
  error: string | null;
}

/**
 * React hook for progressive PCM audio playback via AudioWorklet.
 *
 * Initializes AudioContext + AudioWorkletNode on first use (must be triggered by user gesture on iOS).
 * Reads streaming Response bodies, converts PCM formats to Float32, and sends to the worklet ring buffer.
 *
 * Supports encodings:
 * - linear16: 16-bit signed integer PCM (Deepgram Aura-2)
 * - pcm_f32le: 32-bit float PCM (Cartesia Sonic)
 * - mp3: Decoded via AudioContext.decodeAudioData (OpenAI TTS fallback)
 */
export function useStreamingPlayer(): UseStreamingPlayerReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  // Remainder buffer for handling partial samples across chunk boundaries
  const remainderRef = useRef<Uint8Array | null>(null);

  /**
   * Initialize AudioContext and load AudioWorklet processor.
   * Idempotent -- only initializes once.
   */
  const ensureInitialized = useCallback(async () => {
    if (isReady && audioContextRef.current && workletNodeRef.current) {
      // Resume if suspended (e.g., iOS autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return;
    }

    // Prevent concurrent initialization
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    initPromiseRef.current = (async () => {
      try {
        const ctx = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = ctx;

        await ctx.audioWorklet.addModule('/audio-worklet/pcm-playback-processor.js');

        const node = new AudioWorkletNode(ctx, 'pcm-playback-processor');
        node.connect(ctx.destination);
        workletNodeRef.current = node;

        // Resume if needed
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        setIsReady(true);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize audio playback';
        setError(msg);
        throw err;
      }
    })();

    await initPromiseRef.current;
  }, [isReady]);

  /**
   * Convert linear16 (Int16) PCM bytes to Float32 samples.
   */
  function linear16ToFloat32(data: Uint8Array): Float32Array {
    const int16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength >> 1);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return float32;
  }

  /**
   * Convert pcm_f32le bytes to Float32Array.
   */
  function pcmF32leToFloat32(data: Uint8Array): Float32Array {
    // Ensure alignment
    if (data.byteOffset % 4 === 0) {
      return new Float32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
    }
    // Copy to aligned buffer
    const aligned = new ArrayBuffer(data.byteLength);
    new Uint8Array(aligned).set(data);
    return new Float32Array(aligned);
  }

  /**
   * Simple linear interpolation resampling.
   * Used when source sample rate differs from AudioContext sample rate (48kHz).
   */
  function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const outputLength = Math.ceil(samples.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcFloor = Math.floor(srcIndex);
      const srcCeil = Math.min(srcFloor + 1, samples.length - 1);
      const frac = srcIndex - srcFloor;
      output[i] = samples[srcFloor] * (1 - frac) + samples[srcCeil] * frac;
    }
    return output;
  }

  const playStream = useCallback(async (response: Response, encoding: AudioEncoding, sampleRate: number) => {
    try {
      await ensureInitialized();

      const ctx = audioContextRef.current;
      const node = workletNodeRef.current;
      if (!ctx || !node) {
        throw new Error('Audio playback not initialized');
      }

      // Handle MP3 (non-streaming): decode entire buffer
      if (encoding === 'mp3') {
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        setIsSpeaking(true);
        source.onended = () => setIsSpeaking(false);
        source.start();
        return;
      }

      // Streaming PCM playback
      if (!response.body) {
        throw new Error('Response has no body for streaming playback');
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsSpeaking(true);

      const reader = response.body.getReader();
      const targetRate = ctx.sampleRate; // 48000
      const bytesPerSample = encoding === 'linear16' ? 2 : 4; // pcm_f32le = 4

      // Clear remainder from any previous stream
      remainderRef.current = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || abortController.signal.aborted) break;

          if (!value || value.byteLength === 0) continue;

          // Prepend any remainder bytes from the previous chunk
          let chunk: Uint8Array;
          if (remainderRef.current) {
            chunk = new Uint8Array(remainderRef.current.length + value.length);
            chunk.set(remainderRef.current, 0);
            chunk.set(value, remainderRef.current.length);
            remainderRef.current = null;
          } else {
            chunk = value;
          }

          // Save any trailing bytes that don't form a complete sample
          const leftover = chunk.byteLength % bytesPerSample;
          if (leftover > 0) {
            remainderRef.current = chunk.slice(chunk.byteLength - leftover);
            chunk = chunk.slice(0, chunk.byteLength - leftover);
          }

          if (chunk.byteLength === 0) continue;

          let float32: Float32Array;
          if (encoding === 'linear16') {
            float32 = linear16ToFloat32(chunk);
          } else {
            // pcm_f32le
            float32 = pcmF32leToFloat32(chunk);
          }

          // Resample if needed
          if (sampleRate !== targetRate) {
            float32 = resample(float32, sampleRate, targetRate);
          }

          // Send to worklet ring buffer
          node.port.postMessage(float32);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('Stream reading error:', err);
        }
      } finally {
        remainderRef.current = null;
        reader.releaseLock();

        // Wait a bit for the ring buffer to drain before marking as not speaking
        setTimeout(() => {
          if (abortControllerRef.current === abortController) {
            setIsSpeaking(false);
            abortControllerRef.current = null;
          }
        }, 500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Playback failed';
      setError(msg);
      setIsSpeaking(false);
    }
  }, [ensureInitialized]);

  const stopPlayback = useCallback(() => {
    // Abort any in-flight stream reading
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Flush the AudioWorklet ring buffer
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'flush' });
    }

    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    playStream,
    stopPlayback,
    isSpeaking,
    isReady,
    error,
  };
}
