import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { getSttToken } from '@/lib/endpoints';

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Student voice input (STT). Captures raw PCM16 (linear16 @ 16 kHz mono) from the
 * mic via expo-audio's useAudioStream and streams it over a WebSocket to Deepgram
 * Nova-3 (token + URL from /api/stt/token), mirroring the web src/hooks/useDeepgramSTT.ts
 * protocol — Sec-WebSocket-Protocol subprotocol auth, Results/is_final parsing with
 * dedup, interim transcripts.
 *
 * Half-duplex with the examiner TTS: the iOS audio session can't record + play at
 * once, so the caller barges in (voice.stop()) before start(), and stop() re-asserts
 * the playback session so the examiner can speak again. expo-audio is in the dev
 * build only (Expo Go can't run this app), so no extra native module / rebuild.
 */
export function useStudentSTT() {
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [interim, setInterim] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef(''); // accumulated finals (avoids stale closure)
  const lastFinalRef = useRef(''); // Deepgram emits duplicate is_finals — dedup
  const fluxRef = useRef(false);
  const userStoppedRef = useRef(false);

  // The stream is created lazily by the hook (native object only; the mic isn't
  // touched until start()). onBuffer is held in a ref internally, so this stable
  // closure always sends to the current ws.
  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buf) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(buf.data);
    },
  });

  const teardown = useCallback(
    (restorePlayback: boolean) => {
      try {
        stream.stop();
      } catch {
        /* already stopped */
      }
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch {
          /* closing anyway */
        }
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      }
      // Restore the playback session so the examiner voice (TTS) works after recording.
      if (restorePlayback) {
        setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
      }
    },
    [stream]
  );

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    setListening(false);
    setConnecting(false);
    setInterim('');
    setError(null); // a deliberate stop clears any prior failure banner
    teardown(true);
  }, [teardown]);

  const handleMessage = useCallback((raw: unknown) => {
    let data: any;
    try {
      data = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (!fluxRef.current && data?.type === 'Results') {
      const text: string = data.channel?.alternatives?.[0]?.transcript ?? '';
      if (data.is_final) {
        const t = text.trim();
        if (t && t !== lastFinalRef.current) {
          lastFinalRef.current = t;
          transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${t}` : t;
          setTranscript(transcriptRef.current);
          setInterim('');
        }
      } else {
        setInterim(text);
      }
    } else if (fluxRef.current && data?.type === 'TurnInfo') {
      const turnText: string = (data.transcript ?? '').trim();
      if (data.event === 'EndOfTurn') {
        if (turnText && turnText !== lastFinalRef.current) {
          lastFinalRef.current = turnText;
          transcriptRef.current = turnText; // Flux delivers the whole turn
          setTranscript(transcriptRef.current);
          setInterim('');
        }
      } else {
        setInterim(turnText);
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (listening || connecting) return;
    setError(null);
    setInterim('');
    setTranscript('');
    transcriptRef.current = '';
    lastFinalRef.current = '';
    userStoppedRef.current = false;
    setConnecting(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setConnecting(false);
        setError('Microphone access is off. Enable it in Settings to answer by voice.');
        track('stt_mic_permission_failed', {});
        return;
      }
      const { token, url, flux } = await getSttToken();
      fluxRef.current = !!flux;
      if (userStoppedRef.current) return;

      await new Promise<void>((resolve, reject) => {
        const isJwt = token.startsWith('eyJ');
        const ws = new WebSocket(url, [isJwt ? 'bearer' : 'token', token]);
        wsRef.current = ws;
        let opened = false; // distinguishes pre-open failures from mid-session drops
        const timer = setTimeout(() => {
          if (!opened) {
            try {
              ws.close();
            } catch {
              /* noop */
            }
            reject(new Error('connect_timeout'));
          }
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = async () => {
          clearTimeout(timer);
          opened = true;
          if (userStoppedRef.current) {
            teardown(true);
            resolve();
            return;
          }
          try {
            await stream.start(); // sets the iOS record session + starts PCM frames
          } catch {
            reject(new Error('mic_start_failed'));
            return;
          }
          // stop() may have fired during the await — re-check before going live.
          if (userStoppedRef.current) {
            teardown(true);
            resolve();
            return;
          }
          setConnecting(false);
          setListening(true);
          track('voice_input_started', {});
          resolve();
        };
        ws.onmessage = (ev) => handleMessage(ev.data);
        // Pre-open error: reject so start() settles (else it hangs forever). RN
        // dispatches 'error' then 'close' on a failed handshake — guard on `opened`.
        ws.onerror = () => {
          clearTimeout(timer);
          if (!opened) reject(new Error('websocket_connect_failed'));
        };
        ws.onclose = () => {
          clearTimeout(timer);
          if (!opened) {
            reject(new Error('websocket_closed'));
            return;
          }
          // Mid-session drop (idle/keepalive/network): release the hot mic + restore
          // the playback session so the examiner can speak again, and surface a retry.
          if (!userStoppedRef.current) {
            setListening(false);
            setError('Voice input dropped. Tap the mic to retry.');
            teardown(true);
            track('stt_websocket_closed', {});
          }
        };
      });
    } catch {
      setConnecting(false);
      setError('Couldn’t start voice input. Tap the mic to retry.');
      track('stt_websocket_failed', {});
      teardown(true);
    }
  }, [listening, connecting, handleMessage, teardown, stream]);

  useEffect(
    () => () => {
      userStoppedRef.current = true;
      teardown(false);
    },
    [teardown]
  );

  return { listening, connecting, interim, transcript, error, start, stop };
}
