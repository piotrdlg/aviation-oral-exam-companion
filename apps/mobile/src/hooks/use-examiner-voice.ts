import type { AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest } from '@/lib/api';

// expo-audio / expo-file-system are NATIVE modules — present in a dev build, but
// NOT in Expo Go. Load them lazily so a runtime without them (Expo Go) degrades
// to a silent, text-only exam instead of crashing the screen at import.
type AudioMod = typeof import('expo-audio');
type FsMod = typeof import('expo-file-system');
let mods: { audio: AudioMod; fs: FsMod } | null | undefined;
function loadMods() {
  if (mods === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mods = { audio: require('expo-audio'), fs: require('expo-file-system') };
    } catch {
      mods = null; // not available in this runtime
    }
  }
  return mods;
}

// Set the audio session once: play even with the iOS silent switch on, exclusive focus.
let audioModeReady: Promise<void> | null = null;
function ensureAudioMode(audio: AudioMod) {
  if (!audioModeReady) {
    audioModeReady = audio
      .setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' })
      .catch(() => {
        audioModeReady = null;
      });
  }
  return audioModeReady;
}

type VoiceState = { speaking: boolean; loading: boolean };

/**
 * Examiner TTS playback. speak(text) POSTs /api/tts (Deepgram Aura-2 mp3), writes
 * the bytes to a cache file, and plays it via expo-audio. Best-effort — a missing
 * native module (Expo Go) or a TTS failure never throws to the caller; the exam
 * keeps working text-only. A new speak()/stop() barges in on the current utterance.
 */
export function useExaminerVoice() {
  const playerRef = useRef<AudioPlayer | null>(null);
  const fileRef = useRef<{ delete(): void } | null>(null);
  const seq = useRef(0);
  const mounted = useRef(true);
  const [state, setState] = useState<VoiceState>({ speaking: false, loading: false });

  const teardown = useCallback(() => {
    try {
      playerRef.current?.remove();
    } catch {
      /* already gone */
    }
    playerRef.current = null;
    try {
      fileRef.current?.delete();
    } catch {
      /* best-effort cleanup */
    }
    fileRef.current = null;
  }, []);

  const stop = useCallback(() => {
    seq.current++; // invalidate any in-flight speak
    teardown();
    if (mounted.current) setState({ speaking: false, loading: false });
  }, [teardown]);

  const speak = useCallback(
    async (text: string) => {
      const t = text?.trim();
      if (!t) return;
      const m = loadMods();
      if (!m) return; // no native audio in this runtime → text-only
      const mine = ++seq.current; // claim this utterance; supersedes prior
      teardown();
      if (mounted.current) setState({ speaking: false, loading: true });
      try {
        await ensureAudioMode(m.audio);
        const res = await apiRequest('/api/tts', { method: 'POST', json: { text: t.slice(0, 2000) } });
        if (!res.ok) throw new Error(`tts_${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (mine !== seq.current || !mounted.current) return; // superseded/unmounted

        const file = new m.fs.File(m.fs.Paths.cache, `examiner-${mine}.mp3`);
        try {
          file.create();
        } catch {
          /* unique name makes a collision rare */
        }
        file.write(bytes);
        fileRef.current = file;

        const player = m.audio.createAudioPlayer(file.uri);
        playerRef.current = player;
        player.addListener('playbackStatusUpdate', (s) => {
          if (s.didJustFinish && mine === seq.current) {
            teardown();
            if (mounted.current) setState({ speaking: false, loading: false });
          }
        });
        player.play();
        if (mounted.current) setState({ speaking: true, loading: false });
      } catch {
        // best-effort: swallow and fall back to text-only
        if (mine === seq.current && mounted.current) setState({ speaking: false, loading: false });
      }
    },
    [teardown]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      seq.current++;
      teardown();
    };
  }, [teardown]);

  return { speak, stop, speaking: state.speaking, loading: state.loading };
}
