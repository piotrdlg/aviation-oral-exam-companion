'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { captureVoiceEvent } from '@/lib/voice-telemetry';

interface UseDeepgramSTTOptions {
  sessionId?: string;
}

interface UseDeepgramSTTReturn {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  error: string | null;
  /** Whether a retry is in progress (UI can show "Retrying..." state) */
  isRetrying: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

/** Max WebSocket connection attempts (initial + 1 retry). */
const MAX_ATTEMPTS = 2;
/** Delay before retry in milliseconds. */
const RETRY_DELAY_MS = 2000;

/**
 * React hook for Deepgram Nova-3 STT via direct WebSocket.
 * Fetches a temporary token from /api/stt/token, then connects directly to Deepgram.
 * Uses MediaRecorder (Opus/WebM) for Chrome/Firefox.
 *
 * Includes one automatic retry on WebSocket connection failure.
 */
export function useDeepgramSTT(options: UseDeepgramSTTOptions = {}): UseDeepgramSTTReturn {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const sessionIdRef = useRef(options.sessionId);
  // Track last finalized text to deduplicate Deepgram's duplicate is_final results.
  const lastFinalTextRef = useRef('');
  // Track whether the user deliberately stopped (prevents retry after intentional stop)
  const userStoppedRef = useRef(false);

  // Keep sessionId ref up to date
  useEffect(() => {
    sessionIdRef.current = options.sessionId;
  }, [options.sessionId]);

  const reportUsage = useCallback(async (action: 'start' | 'end', durationSeconds?: number) => {
    try {
      await fetch('/api/stt/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          action,
          durationSeconds,
        }),
      });
    } catch (err) {
      console.warn('Failed to report STT usage:', err);
    }
  }, []);

  const stopListening = useCallback(() => {
    userStoppedRef.current = true;

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        // Send close frame per Deepgram protocol
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Report usage
    if (startTimeRef.current > 0) {
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      reportUsage('end', durationSeconds);
      startTimeRef.current = 0;
    }

    setIsListening(false);
    setIsRetrying(false);
    setInterimTranscript('');
  }, [reportUsage]);

  /**
   * Attempt a single WebSocket connection to Deepgram.
   * Returns a promise that resolves on open or rejects on error/close.
   */
  const attemptWebSocketConnect = useCallback((
    wsUrl: string,
    token: string,
    stream: MediaStream,
    attempt: number,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (userStoppedRef.current) {
        reject(new Error('user_stopped'));
        return;
      }

      captureVoiceEvent('stt_websocket_connect_started', {
        attempt,
        session_id: sessionIdRef.current,
      });

      const isJwt = token.startsWith('eyJ');
      const ws = new WebSocket(wsUrl, [isJwt ? 'bearer' : 'token', token]);
      wsRef.current = ws;

      ws.onopen = () => {
        captureVoiceEvent('stt_websocket_connected', {
          attempt,
          session_id: sessionIdRef.current,
        });

        setIsListening(true);
        setIsRetrying(false);

        // Start MediaRecorder (Opus/WebM)
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 128000,
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };

        // Send audio chunks every 250ms for low latency
        mediaRecorder.start(250);
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alternative = data.channel.alternatives[0];
            const transcriptText = alternative.transcript || '';

            if (data.is_final) {
              const trimmed = transcriptText.trim();
              if (trimmed && trimmed !== lastFinalTextRef.current) {
                lastFinalTextRef.current = trimmed;
                setTranscript(prev => {
                  const separator = prev ? ' ' : '';
                  return prev + separator + trimmed;
                });
              }
              setInterimTranscript('');
            } else {
              setInterimTranscript(transcriptText);
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        captureVoiceEvent('stt_websocket_failed', {
          attempt,
          session_id: sessionIdRef.current,
          ready_state: ws.readyState,
        });

        // Only reject if we haven't already resolved (i.e., error before open)
        wsRef.current = null;
        reject(new Error('websocket_connect_failed'));
      };

      ws.onclose = (event) => {
        // 1000 = normal close, 1005 = no status code, 1006 = abnormal (can happen on stop)
        if (event.code !== 1000 && event.code !== 1005 && event.code !== 1006) {
          captureVoiceEvent('stt_websocket_closed', {
            attempt,
            close_code: event.code,
            close_reason: event.reason || undefined,
            session_id: sessionIdRef.current,
          });
          setError(`Speech service disconnected (code: ${event.code})`);
        }
        setIsListening(false);
      };
    });
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setInterimTranscript('');
      setIsRetrying(false);
      lastFinalTextRef.current = '';
      userStoppedRef.current = false;

      // 1. Request microphone access
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
        });
      } catch (micErr) {
        const msg = micErr instanceof Error ? micErr.message : 'Microphone access denied';
        captureVoiceEvent('stt_mic_permission_failed', { error: msg });
        throw new Error(`Microphone access failed: ${msg}`);
      }
      streamRef.current = stream;

      // 2. Fetch temporary token
      captureVoiceEvent('stt_token_request_started', {
        session_id: sessionIdRef.current,
      });

      let token: string;
      let wsUrl: string;
      try {
        const tokenRes = await fetch('/api/stt/token');
        if (!tokenRes.ok) {
          const tokenErr = await tokenRes.json().catch(() => ({ error: 'Unknown token error' }));
          captureVoiceEvent('stt_token_request_failed', {
            status: tokenRes.status,
            error: tokenErr.error,
          });
          throw new Error(tokenErr.error || 'Failed to get STT token');
        }
        const tokenData = await tokenRes.json();
        token = tokenData.token;
        wsUrl = tokenData.url;

        captureVoiceEvent('stt_token_request_succeeded', {
          session_id: sessionIdRef.current,
        });
      } catch (fetchErr) {
        // Re-throw if already our error, otherwise wrap
        if (fetchErr instanceof Error && fetchErr.message.includes('STT token')) {
          throw fetchErr;
        }
        captureVoiceEvent('stt_token_request_failed', {
          error: fetchErr instanceof Error ? fetchErr.message : 'fetch_error',
        });
        throw new Error('Failed to get STT token');
      }

      // 3. Report usage start
      await reportUsage('start');
      startTimeRef.current = Date.now();

      // 4. Attempt WebSocket connection with retry
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (userStoppedRef.current) return;

        try {
          await attemptWebSocketConnect(wsUrl, token, stream, attempt);
          // Success — connected
          return;
        } catch (wsErr) {
          if (userStoppedRef.current) return;
          if (wsErr instanceof Error && wsErr.message === 'user_stopped') return;

          if (attempt < MAX_ATTEMPTS) {
            // Retry after delay
            captureVoiceEvent('voice_retry_attempted', {
              attempt,
              session_id: sessionIdRef.current,
            });
            setIsRetrying(true);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            if (userStoppedRef.current) return;
            continue;
          }

          // All attempts exhausted
          captureVoiceEvent('voice_auto_disabled', {
            attempts: MAX_ATTEMPTS,
            session_id: sessionIdRef.current,
            final_error: 'websocket_connect_failed',
          });
          setError('Voice connection failed. Unable to reach speech service.');
          setIsRetrying(false);
          setIsListening(false);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start speech recognition';
      setError(message);
      setIsListening(false);
      setIsRetrying(false);

      // Clean up on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [reportUsage, attemptWebSocketConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isRetrying,
    error,
    startListening,
    stopListening,
  };
}
