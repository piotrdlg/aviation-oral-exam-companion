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
/** Max mid-session reconnect cycles per listening session (W4.1). */
const MAX_RECONNECT_CYCLES = 2;
/** Reject a WebSocket connect attempt that neither opens nor errors (W4.1). */
const CONNECT_TIMEOUT_MS = 10_000;
/** Refresh the cached token if it expires within this window. */
const TOKEN_REFRESH_MARGIN_MS = 30_000;

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
  // W4.1 mid-session reconnect state: cached token + cycle counter + a ref to
  // the reconnect fn (breaks the attemptConnect <-> reconnect callback cycle).
  const tokenRef = useRef<{ token: string; wsUrl: string; expiresAt: number } | null>(null);
  const reconnectCyclesRef = useRef(0);
  const reconnectRef = useRef<(stream: MediaStream) => void>(() => {});

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

      // W4.1 (review-04 #8): a handshake rejection can close the socket
      // without firing onerror — previously startListening() hung forever.
      let opened = false;
      const connectTimer = setTimeout(() => {
        if (!opened) {
          try { ws.close(); } catch { /* already closed */ }
          reject(new Error('connect_timeout'));
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        opened = true;
        clearTimeout(connectTimer);
        captureVoiceEvent('stt_websocket_connected', {
          attempt,
          session_id: sessionIdRef.current,
        });

        // W4.1 (review-04 #8): Safari < 18.4 supports neither webm variant —
        // probe audio/mp4 (containerized AAC, accepted by Deepgram) before
        // giving up, and treat recorder-construction failure as a rejection
        // instead of an uncaught throw inside onopen (which left the promise
        // pending and the mic hot).
        try {
          const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
          const mimeType = candidates.find((c) => {
            try { return MediaRecorder.isTypeSupported(c); } catch { return false; }
          });

          const mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
            : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };

          // Send audio chunks every 250ms for low latency
          mediaRecorder.start(250);
        } catch (recErr) {
          captureVoiceEvent('stt_recorder_failed', {
            attempt,
            error: recErr instanceof Error ? recErr.message : 'recorder_error',
            session_id: sessionIdRef.current,
          });
          try { ws.close(); } catch { /* noop */ }
          reject(recErr instanceof Error ? recErr : new Error('recorder_failed'));
          return;
        }

        setIsListening(true);
        setIsRetrying(false);
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

        clearTimeout(connectTimer);
        // Only reject if we haven't already resolved (i.e., error before open)
        if (!opened) {
          wsRef.current = null;
          reject(new Error('websocket_connect_failed'));
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectTimer);

        if (!opened) {
          // Closed before opening (e.g. handshake 401) — reject so the
          // connect-retry path in startListening handles it.
          reject(new Error('websocket_connect_failed'));
          return;
        }

        if (userStoppedRef.current) {
          setIsListening(false);
          return;
        }

        // W4.1 (review-04 #7): mid-session drop. Previously the recorder kept
        // running into a dead socket and everything said after the drop was
        // silently lost. Recover by reconnecting with the cached token.
        captureVoiceEvent('stt_websocket_closed', {
          attempt,
          close_code: event.code,
          close_reason: event.reason || undefined,
          session_id: sessionIdRef.current,
        });
        setIsListening(false);
        reconnectRef.current(stream);
      };
    });
  }, []);

  // W4.1 mid-session reconnect: up to MAX_RECONNECT_CYCLES per listening
  // session, refreshing the token when it nears expiry. On exhaustion the mic
  // is RELEASED (no hot-mic leak) and the existing error state surfaces.
  reconnectRef.current = async (stream: MediaStream) => {
    if (userStoppedRef.current) return;

    if (reconnectCyclesRef.current >= MAX_RECONNECT_CYCLES) {
      captureVoiceEvent('stt_reconnect_exhausted', {
        cycles: reconnectCyclesRef.current,
        session_id: sessionIdRef.current,
      });
      setError('Voice connection lost. Tap the mic to resume.');
      setIsRetrying(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      }
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (startTimeRef.current > 0) {
        reportUsage('end', Math.round((Date.now() - startTimeRef.current) / 1000));
        startTimeRef.current = 0;
      }
      return;
    }

    reconnectCyclesRef.current++;
    setIsRetrying(true);
    captureVoiceEvent('stt_reconnect_attempted', {
      cycle: reconnectCyclesRef.current,
      session_id: sessionIdRef.current,
    });

    // Stop the old recorder before attaching a new one to the fresh socket
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
    }
    mediaRecorderRef.current = null;

    await new Promise((r) => setTimeout(r, 500));
    if (userStoppedRef.current) return;

    // Refresh the token if it's near expiry (10-min TTL usually covers us)
    let tok = tokenRef.current;
    if (!tok || tok.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
      try {
        const res = await fetch('/api/stt/token');
        if (res.ok) {
          const d = await res.json();
          tok = { token: d.token, wsUrl: d.url, expiresAt: d.expiresAt };
          tokenRef.current = tok;
        }
      } catch { /* fall through with the cached token, if any */ }
    }
    if (!tok) {
      setError('Voice connection lost. Tap the mic to resume.');
      setIsRetrying(false);
      return;
    }

    try {
      await attemptWebSocketConnect(tok.wsUrl, tok.token, stream, 100 + reconnectCyclesRef.current);
      setIsRetrying(false);
      captureVoiceEvent('stt_reconnect_succeeded', {
        cycle: reconnectCyclesRef.current,
        session_id: sessionIdRef.current,
      });
    } catch {
      // Next cycle (cap enforced at the top)
      reconnectRef.current(stream);
    }
  };

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setInterimTranscript('');
      setIsRetrying(false);
      lastFinalTextRef.current = '';
      userStoppedRef.current = false;
      reconnectCyclesRef.current = 0; // fresh reconnect budget per session (W4.1)

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
        // Cache for mid-session reconnects (W4.1)
        tokenRef.current = { token, wsUrl, expiresAt: tokenData.expiresAt ?? Date.now() + 9 * 60_000 };

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
