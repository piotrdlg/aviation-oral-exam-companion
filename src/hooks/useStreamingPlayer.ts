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

        await ctx.audioWorklet.addModule('/audio-worklet/pcm-playback-processor.js?v=3');

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
   * Always copies to a fresh buffer to avoid transferring oversized
   * underlying ArrayBuffers when the input is a view.
   */
  function pcmF32leToFloat32(data: Uint8Array): Float32Array {
    const copy = new Float32Array(data.byteLength >> 2);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < copy.length; i++) {
      copy[i] = view.getFloat32(i * 4, true); // little-endian
    }
    return copy;
  }

  const playStream = useCallback(async (response: Response, encoding: AudioEncoding, sampleRate: number) => {
    try {
      await ensureInitialized();

      const ctx = audioContextRef.current;
      const node = workletNodeRef.current;
      if (!ctx || !node) {
        throw new Error('Audio playback not initialized');
      }

      // Handle MP3: decode entire buffer via decodeAudioData
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

      // PCM streaming via AudioWorklet with stateful resampling.
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Configure worklet with source sample rate and WAIT for ACK
      // before sending any audio data (prevents config/data race)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worklet config timeout')), 5000);
        const onAck = (event: MessageEvent) => {
          if (event.data?.type === 'configured') {
            clearTimeout(timeout);
            node.port.removeEventListener('message', onAck);
            resolve();
          }
        };
        node.port.addEventListener('message', onAck);
        node.port.postMessage({ type: 'config', sourceRate: sampleRate });
      });

      if (abortController.signal.aborted) return;

      // Clear any leftover remainder from a previous stream
      remainderRef.current = null;

      const bytesPerSample = encoding === 'linear16' ? 2 : 4; // linear16=2, pcm_f32le=4

      setIsSpeaking(true);

      const body = response.body;
      if (!body) {
        throw new Error('Response has no body for streaming');
      }

      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || abortController.signal.aborted) break;

          let chunk: Uint8Array = value;

          // Prepend any remainder from previous chunk (partial sample bytes)
          if (remainderRef.current && remainderRef.current.length > 0) {
            const merged = new Uint8Array(remainderRef.current.length + chunk.length);
            merged.set(remainderRef.current);
            merged.set(chunk, remainderRef.current.length);
            chunk = merged;
            remainderRef.current = null;
          }

          // Save any trailing bytes that don't form a complete sample
          const remainder = chunk.length % bytesPerSample;
          if (remainder > 0) {
            remainderRef.current = chunk.slice(chunk.length - remainder);
            chunk = chunk.slice(0, chunk.length - remainder);
          }

          if (chunk.length === 0) continue;

          // Convert to Float32 (always a fresh copy — safe to transfer)
          let float32: Float32Array;
          if (encoding === 'linear16') {
            float32 = linear16ToFloat32(chunk);
          } else {
            float32 = pcmF32leToFloat32(chunk);
          }

          // Transfer buffer to worklet (zero-copy)
          node.port.postMessage(float32, [float32.buffer]);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('PCM stream read error:', err);
        }
      } finally {
        reader.releaseLock();
      }

      // Wait for worklet to drain its buffer before marking as done
      if (!abortController.signal.aborted) {
        await new Promise<void>((resolve) => {
          const onMessage = (event: MessageEvent) => {
            if (event.data?.type === 'drain') {
              node.port.removeEventListener('message', onMessage);
              resolve();
            }
          };
          node.port.addEventListener('message', onMessage);

          // Also check abort periodically
          const checkInterval = setInterval(() => {
            if (abortController.signal.aborted) {
              clearInterval(checkInterval);
              node.port.removeEventListener('message', onMessage);
              resolve();
            }
          }, 200);

          // Timeout: max 120 seconds (covers longest possible exam utterance)
          setTimeout(() => {
            clearInterval(checkInterval);
            node.port.removeEventListener('message', onMessage);
            resolve();
          }, 120000);
        });
      }

      if (abortControllerRef.current === abortController) {
        setIsSpeaking(false);
        abortControllerRef.current = null;
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
