'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

/** Aviation-specific vocabulary keywords for Deepgram custom vocabulary. */
const AVIATION_KEYWORDS = [
  'METAR', 'TAF', 'NOTAM', 'PIREP', 'SIGMET', 'AIRMET',
  'VOR', 'NDB', 'ILS', 'RNAV', 'GPS', 'DME',
  'ACS', 'DPE', 'ASEL', 'AMEL', 'ASES', 'AMES',
  'Cessna', 'Piper', 'Beechcraft', 'Cirrus',
  'CTAF', 'ATIS', 'AWOS', 'ASOS',
  'FAR', 'AIM', 'POH', 'AFM',
  'ADM', 'CRM', 'SRM', 'IMSAFE', 'PAVE', 'DECIDE',
  'sectional', 'checkride', 'logbook', 'endorsement',
];

interface UseDeepgramSTTOptions {
  sessionId?: string;
}

interface UseDeepgramSTTReturn {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

/**
 * React hook for Deepgram Nova-3 STT via direct WebSocket.
 * Fetches a temporary token from /api/stt/token, then connects directly to Deepgram.
 * Uses MediaRecorder (Opus/WebM) for Chrome/Firefox.
 */
export function useDeepgramSTT(options: UseDeepgramSTTOptions = {}): UseDeepgramSTTReturn {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const sessionIdRef = useRef(options.sessionId);

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
    setInterimTranscript('');
  }, [reportUsage]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setInterimTranscript('');

      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
      streamRef.current = stream;

      // 2. Fetch temporary token
      const tokenRes = await fetch('/api/stt/token');
      if (!tokenRes.ok) {
        const tokenErr = await tokenRes.json();
        throw new Error(tokenErr.error || 'Failed to get STT token');
      }
      const { token, url: baseWsUrl } = await tokenRes.json();

      // 3. Build WebSocket URL with aviation keywords
      // Token is already embedded in baseWsUrl by the server
      const keywordsParam = AVIATION_KEYWORDS.map(k => `keywords=${encodeURIComponent(k)}`).join('&');
      const wsUrl = `${baseWsUrl}&${keywordsParam}`;

      // 4. Report usage start
      await reportUsage('start');
      startTimeRef.current = Date.now();

      // 5. Open WebSocket to Deepgram (token is in URL query params)
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsListening(true);

        // 6. Start MediaRecorder (Opus/WebM)
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
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alternative = data.channel.alternatives[0];
            const transcriptText = alternative.transcript || '';

            if (data.is_final) {
              if (transcriptText.trim()) {
                setTranscript(prev => {
                  const separator = prev ? ' ' : '';
                  return prev + separator + transcriptText.trim();
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
        setError('WebSocket connection to speech service failed');
        stopListening();
      };

      ws.onclose = (event) => {
        // 1000 = normal close, 1005 = no status code, 1006 = abnormal (can happen on stop)
        if (event.code !== 1000 && event.code !== 1005 && event.code !== 1006) {
          setError(`Speech service disconnected (code: ${event.code})`);
        }
        setIsListening(false);
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start speech recognition';
      setError(message);
      setIsListening(false);

      // Clean up on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [reportUsage, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
    error,
    startListening,
    stopListening,
  };
}
