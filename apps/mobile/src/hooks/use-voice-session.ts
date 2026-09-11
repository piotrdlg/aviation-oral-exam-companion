import { createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { apiRequest } from '@/lib/api';
import { getSttToken } from '@/lib/endpoints';
import { startSpeechCapture, type PcmBuffer } from '@/lib/stt-capture';
import { voiceMetric, markVoicePlayback } from '@/lib/voice-metrics';
import { VoiceSession } from '@/lib/voice-session';

let utteranceId = 0;

async function fetchUtterance(text: string, signal: AbortSignal): Promise<Uint8Array> {
  const request = new AbortController();
  const cancel = () => request.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(cancel, 30_000);
  try {
    const res = await apiRequest('/api/tts', { method: 'POST', json: { text }, signal: request.signal });
    if (!res.ok) throw new Error('Examiner audio is unavailable. You can continue with text.');
    return new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    if (request.signal.aborted && !signal.aborted) throw new Error('Examiner audio timed out. You can continue with text.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

async function playUtterance(text: string, signal: AbortSignal, onPlaying: () => void): Promise<void> {
  const startedAt = performance.now();
  const bytes = await fetchUtterance(text, signal);
  if (signal.aborted) return;
  voiceMetric('tts_response', performance.now() - startedAt);
  const file = new File(Paths.cache, `heydpe-voice-${Date.now()}-${++utteranceId}.mp3`);
  try {
    file.create();
    file.write(bytes);
    if (signal.aborted) return;
    const player = createAudioPlayer(file.uri, { updateInterval: 50 });
    try {
      await new Promise<void>((resolve, reject) => {
        let played = false;
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Examiner audio stopped unexpectedly. You can continue with text.'));
        }, 180_000);
        const stop = () => { player.pause(); cleanup(); resolve(); };
        const cleanup = () => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', stop);
          listener.remove();
        };
        const listener = player.addListener('playbackStatusUpdate', (status) => {
          if (signal.aborted) return;
          if (status.playing && !played) {
            played = true;
            onPlaying();
            voiceMetric('tts_playing', performance.now() - startedAt);
          }
          if (status.didJustFinish) { cleanup(); resolve(); }
        });
        signal.addEventListener('abort', stop, { once: true });
        if (signal.aborted) stop();
        else player.play();
      });
    } finally { player.remove(); }
  } finally {
    if (file.exists) file.delete();
  }
}

export function useVoiceSession() {
  const [buffers] = useState<{ handler: ((buffer: PcmBuffer) => void) | null }>(() => ({ handler: null }));
  const { stream } = useAudioStream({
    sampleRate: 16000, channels: 1, encoding: 'int16',
    onBuffer: (buffer) => buffers.handler?.(buffer),
  });
  const [controller] = useState(() => new VoiceSession({
    recordingMode: (allowsRecording) => setAudioModeAsync({
      allowsRecording, playsInSilentMode: true, interruptionMode: 'doNotMix',
      shouldPlayInBackground: false, shouldRouteThroughEarpiece: false,
    }),
    play: playUtterance,
    metric: voiceMetric,
    firstPlayback: markVoicePlayback,
    listen: (signal, onText, onError) => startSpeechCapture({
      stream,
      permission: requestRecordingPermissionsAsync,
      token: getSttToken,
      setBufferHandler: (handler) => { buffers.handler = handler; },
      metric: voiceMetric,
    }, signal, onText, onError),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const focused = useRef(false);
  const activate = useCallback(() => {
    if (focused.current && AppState.currentState === 'active') void controller.activate().catch(() => {});
  }, [controller]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    activate();
    return () => {
      focused.current = false;
      void controller.suspend().catch(() => {});
    };
  }, [activate, controller]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') activate();
      else void controller.suspend().catch(() => {});
    });
    return () => { sub.remove(); void controller.suspend().catch(() => {}); };
  }, [activate, controller]);

  return { ...state, controller };
}
