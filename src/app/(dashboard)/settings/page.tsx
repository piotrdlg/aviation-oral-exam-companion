'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VoiceTier, TierFeatures } from '@/lib/voice/types';
import type { Rating, AircraftClass } from '@/types/database';
import { THEMES, setTheme } from '@/lib/theme';
import { DEFAULT_AVATARS } from '@/lib/avatar-options';

type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

interface DiagStep {
  label: string;
  status: TestStatus;
  detail: string;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface VoiceOption {
  model: string;
  label: string;
  desc?: string;
  gender?: string;
  persona_id?: string;
  image?: string;
}

interface TierInfo {
  tier: VoiceTier;
  features: TierFeatures;
  usage: {
    sessionsThisMonth: number;
    ttsCharsThisMonth: number;
    sttSecondsThisMonth: number;
  };
  preferredVoice: string | null;
  preferredRating: Rating;
  preferredAircraftClass: AircraftClass;
  aircraftType: string | null;
  homeAirport: string | null;
  preferredTheme: string;
  voiceOptions: VoiceOption[];
  displayName: string | null;
  avatarUrl: string | null;
}

interface SubscriptionInfo {
  tier: string;
  status: string;
  plan: string | null;
  renewalDate: string | null;
  hasStripeCustomer: boolean;
}

interface ActiveSessionItem {
  id: string;
  device_label: string;
  approximate_location: string | null;
  is_exam_active: boolean;
  last_activity_at: string;
  created_at: string;
  this_device: boolean;
}

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  // Voice tier & voice preference state
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [tierLoading, setTierLoading] = useState(true);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Practice defaults state
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Subscription state (Task 35)
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Feedback widget state (Task 27)
  const [feedbackType, setFeedbackType] = useState<'bug_report' | 'content_error' | null>(null);
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Active sessions state (Task 32)
  const [activeSessions, setActiveSessions] = useState<ActiveSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [signOutOthersLoading, setSignOutOthersLoading] = useState(false);
  const [sessionsMessage, setSessionsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Voice diagnostics state
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [steps, setSteps] = useState<DiagStep[]>([
    { label: 'Microphone access', status: 'idle', detail: '' },
    { label: 'Speech recognition', status: 'idle', detail: '' },
    { label: 'Speaker / TTS playback', status: 'idle', detail: '' },
  ]);
  const [micLevel, setMicLevel] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, [supabase.auth]);

  // Fetch current voice tier + voice options
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.json())
      .then((data) => {
        if (data.tier) {
          setTierInfo({
            tier: data.tier,
            features: data.features,
            usage: data.usage,
            preferredVoice: data.preferredVoice || null,
            preferredRating: data.preferredRating || 'private',
            preferredAircraftClass: data.preferredAircraftClass || 'ASEL',
            aircraftType: data.aircraftType || null,
            homeAirport: data.homeAirport || null,
            preferredTheme: data.preferredTheme || 'cockpit',
            voiceOptions: data.voiceOptions || [],
            displayName: data.displayName || null,
            avatarUrl: data.avatarUrl || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setTierLoading(false));
  }, []);

  // Fetch subscription status (Task 35)
  useEffect(() => {
    fetch('/api/stripe/status')
      .then((res) => res.json())
      .then((data) => {
        setSubInfo({
          tier: data.tier || 'checkride_prep',
          status: data.status || 'free',
          plan: data.plan || null,
          renewalDate: data.renewalDate || null,
          hasStripeCustomer: !!data.tier && data.status !== 'free',
        });
      })
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, []);

  // Fetch active sessions (Task 32)
  const fetchActiveSessions = useCallback(() => {
    setSessionsLoading(true);
    fetch('/api/user/sessions')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.sessions) setActiveSessions(data.sessions);
      })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    fetchActiveSessions();
  }, [fetchActiveSessions]);

  async function openCustomerPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open portal');
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Failed to open subscription portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  async function switchVoice(model: string) {
    if (tierInfo?.preferredVoice === model || voiceSaving) return;
    setVoiceSaving(true);
    setVoiceMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredVoice: model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update voice');
      setTierInfo((prev) => prev ? { ...prev, preferredVoice: model } : null);
      const label = tierInfo?.voiceOptions.find((v) => v.model === model)?.label || model;
      setVoiceMessage({ text: `Voice changed to ${label}`, type: 'success' });
    } catch (err) {
      setVoiceMessage({ text: err instanceof Error ? err.message : 'Failed to update voice', type: 'error' });
    } finally {
      setVoiceSaving(false);
    }
  }

  async function savePracticeDefault(field: 'preferredRating' | 'preferredAircraftClass' | 'aircraftType' | 'homeAirport' | 'preferredTheme' | 'displayName' | 'avatarUrl', value: string) {
    setDefaultsSaving(true);
    setDefaultsMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setTierInfo((prev) => {
        if (!prev) return null;
        if (field === 'preferredRating') return { ...prev, preferredRating: value as Rating };
        if (field === 'preferredAircraftClass') return { ...prev, preferredAircraftClass: value as AircraftClass };
        if (field === 'aircraftType') return { ...prev, aircraftType: value || null };
        if (field === 'homeAirport') return { ...prev, homeAirport: value || null };
        if (field === 'displayName') return { ...prev, displayName: value || null };
        if (field === 'avatarUrl') return { ...prev, avatarUrl: value || null };
        return prev;
      });
      setDefaultsMessage({ text: 'Preference saved', type: 'success' });
      setTimeout(() => setDefaultsMessage(null), 2000);
    } catch (err) {
      setDefaultsMessage({ text: err instanceof Error ? err.message : 'Failed to save', type: 'error' });
    } finally {
      setDefaultsSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setTierInfo((prev) => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
      setDefaultsMessage({ text: 'Avatar updated', type: 'success' });
      setTimeout(() => setDefaultsMessage(null), 2000);
    } catch (err) {
      setDefaultsMessage({ text: err instanceof Error ? err.message : 'Upload failed', type: 'error' });
    }
  }

  async function previewVoice(model: string) {
    // Stop any currently playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    setPreviewingVoice(model);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Good morning. I'm your designated pilot examiner. Let's begin with the oral examination.",
          voice: model,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const encoding = res.headers.get('X-Audio-Encoding') || 'mp3';
      const arrayBuffer = await res.arrayBuffer();

      if (encoding === 'mp3') {
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); };
        audio.onerror = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); };
        await audio.play();
      } else {
        // PCM: decode via AudioContext
        const sampleRate = parseInt(res.headers.get('X-Audio-Sample-Rate') || '48000', 10);
        const audioCtx = new AudioContext({ sampleRate });
        let float32: Float32Array;
        if (encoding === 'linear16') {
          const int16 = new Int16Array(arrayBuffer);
          float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
        } else {
          float32 = new Float32Array(arrayBuffer);
        }
        const buffer = audioCtx.createBuffer(1, float32.length, sampleRate);
        buffer.getChannelData(0).set(float32);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.onended = () => { audioCtx.close(); setPreviewingVoice(null); };
        source.start();
      }
    } catch (err) {
      setVoiceMessage({ text: `Preview failed: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
      setPreviewingVoice(null);
    }
  }

  // Load available audio input devices
  const loadDevices = useCallback(async () => {
    try {
      // Need to request permission first to get labeled devices
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        }));
      setAudioDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch {
      // Permission denied or no devices — will be caught during diagnostics
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      cancelAnimationFrame(animRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  function updateStep(index: number, updates: Partial<DiagStep>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  }

  async function runDiagnostics() {
    setDiagRunning(true);
    setRecognizedText('');
    setMicLevel(0);
    setSteps([
      { label: 'Microphone access', status: 'idle', detail: '' },
      { label: 'Speech recognition', status: 'idle', detail: '' },
      { label: 'Speaker / TTS playback', status: 'idle', detail: '' },
    ]);

    const deviceLabel = audioDevices.find((d) => d.deviceId === selectedDeviceId)?.label || 'default';

    // --- Step 1: Microphone access ---
    updateStep(0, { status: 'running', detail: `Requesting "${deviceLabel}"...` });

    const audioConstraints: MediaTrackConstraints | boolean = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId } }
      : true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      // Report which device we actually got
      const track = stream.getAudioTracks()[0];
      const actualDevice = track?.label || 'Unknown device';
      updateStep(0, { detail: `Using: ${actualDevice} — speak to see level meter...` });

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const startTime = Date.now();
      let peakLevel = 0;

      function updateLevel() {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        if (normalized > peakLevel) peakLevel = normalized;

        if (Date.now() - startTime < 3000) {
          animRef.current = requestAnimationFrame(updateLevel);
        } else {
          setMicLevel(0);
          audioCtx.close();
          if (peakLevel > 5) {
            updateStep(0, {
              status: 'pass',
              detail: `${actualDevice} — working (peak level: ${peakLevel}%)`,
            });
          } else {
            updateStep(0, {
              status: 'fail',
              detail: `${actualDevice} — connected but no audio detected. Check that mic is not muted.`,
            });
          }
        }
      }
      updateLevel();

      // Wait for mic test to finish
      await new Promise((r) => setTimeout(r, 3200));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateStep(0, {
        status: 'fail',
        detail: `Microphone access denied or unavailable: ${msg}`,
      });
    }

    // --- Step 2: Speech recognition ---
    updateStep(1, { status: 'running', detail: 'Checking browser support...' });

    const SpeechRecognitionAPI =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionAPI) {
      updateStep(1, {
        status: 'fail',
        detail: 'SpeechRecognition API not available. This feature requires Chrome or Edge.',
      });
    } else {
      // Acquire a fresh stream with the selected device BEFORE starting recognition.
      // This hints Chrome to route that device to SpeechRecognition.
      let hintStream: MediaStream | null = null;
      try {
        hintStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch {
        // If this fails, recognition will use Chrome's default mic
      }

      updateStep(1, { detail: 'Say something (you have 6 seconds)...' });

      const transcript = await new Promise<string>((resolve) => {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        let lastTranscript = '';
        let errorMsg = '';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let text = '';
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          lastTranscript = text;
          setRecognizedText(text);
        };

        recognition.onend = () => {
          if (errorMsg) {
            resolve(`ERROR:${errorMsg}`);
          } else {
            resolve(lastTranscript);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          errorMsg = event.error;
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            resolve(`ERROR:${event.error}`);
          }
        };

        recognition.start();

        setTimeout(() => {
          try {
            recognition.stop();
          } catch {
            // already stopped
          }
        }, 6000);
      });

      // Clean up hint stream
      hintStream?.getTracks().forEach((t) => t.stop());

      if (transcript.startsWith('ERROR:')) {
        const errType = transcript.replace('ERROR:', '');
        let helpText = '';
        switch (errType) {
          case 'no-speech':
            helpText = `No speech detected by Google servers. The SpeechRecognition API may be using a different mic than selected. Check Chrome's mic setting: chrome://settings/content/microphone`;
            break;
          case 'audio-capture':
            helpText = 'Chrome could not capture audio. Another app may be using the microphone exclusively.';
            break;
          case 'not-allowed':
            helpText = 'Microphone permission denied for speech recognition. Allow mic access in Chrome settings.';
            break;
          case 'network':
            helpText = 'Network error — Chrome Speech Recognition requires internet (audio is processed by Google servers).';
            break;
          case 'service-not-allowed':
            helpText = 'Speech service blocked. This can happen if Chrome is not the default browser or speech services are restricted.';
            break;
          default:
            helpText = `Error type: "${errType}". Check Chrome console for details.`;
        }
        updateStep(1, { status: 'fail', detail: helpText });
      } else if (transcript.length > 0) {
        updateStep(1, {
          status: 'pass',
          detail: `Recognized: "${transcript}"`,
        });
      } else {
        updateStep(1, {
          status: 'fail',
          detail: `No speech detected. The SpeechRecognition API may be using a different mic than "${deviceLabel}". Check Chrome's mic at: chrome://settings/content/microphone`,
        });
      }
    }

    // Clean up any remaining mic stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // --- Step 3: TTS playback ---
    updateStep(2, { status: 'running', detail: 'Requesting TTS audio from server...' });
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'This is the examiner voice. If you can hear this clearly, your speaker is working.' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
      }

      const encoding = res.headers.get('X-Audio-Encoding') || 'mp3';
      const sampleRate = parseInt(res.headers.get('X-Audio-Sample-Rate') || '44100', 10);
      const provider = res.headers.get('X-TTS-Provider') || 'unknown';

      updateStep(2, { detail: `Playing audio (${provider})...` });
      const arrayBuffer = await res.arrayBuffer();

      if (encoding === 'mp3') {
        // MP3: use standard Audio element
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio playback failed')); };
          audio.play().catch(reject);
        });
      } else {
        // PCM (linear16 or pcm_f32le): decode and play via AudioContext
        const audioCtx = new AudioContext({ sampleRate });
        let float32: Float32Array;

        if (encoding === 'linear16') {
          const int16 = new Int16Array(arrayBuffer);
          float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768;
          }
        } else {
          // pcm_f32le
          float32 = new Float32Array(arrayBuffer);
        }

        const audioBuffer = audioCtx.createBuffer(1, float32.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        await new Promise<void>((resolve) => {
          source.onended = () => { audioCtx.close(); resolve(); };
          source.start();
        });
      }

      updateStep(2, {
        status: 'pass',
        detail: `Audio played (${provider}, ${encoding}). If you heard the voice, speakers are working.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateStep(2, {
        status: 'fail',
        detail: `TTS playback failed: ${msg}`,
      });
    }

    setDiagRunning(false);
  }

  const statusIcon = (s: TestStatus) => {
    switch (s) {
      case 'idle':
        return '\u25CB';
      case 'running':
        return '\u25CC';
      case 'pass':
        return '\u2713';
      case 'fail':
        return '\u2717';
    }
  };

  const statusColor = (s: TestStatus) => {
    switch (s) {
      case 'idle':
        return 'text-c-muted';
      case 'running':
        return 'text-c-amber blink';
      case 'pass':
        return 'text-c-green glow-g';
      case 'fail':
        return 'text-c-red';
    }
  };

  const isPaidUser = subInfo?.hasStripeCustomer && (subInfo.status === 'active' || subInfo.status === 'trialing');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-mono font-bold text-xl text-c-amber glow-a tracking-wider uppercase">SETTINGS</h1>
        <p className="font-mono text-xs text-c-muted mt-1">Manage your account, subscription, and preferences.</p>
      </div>

      {/* 1. Profile */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-1 tracking-wider uppercase">PROFILE</h2>
        <p className="font-mono text-[10px] text-c-muted mb-5">
          Your name and avatar appear during exam sessions.
        </p>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-c-border bg-c-bezel flex-shrink-0">
            {tierInfo?.avatarUrl ? (
              <img src={tierInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-c-muted text-2xl font-mono">
                {tierInfo?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <input type="file" id="avatar-upload" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
            <label htmlFor="avatar-upload" className="cursor-pointer inline-block px-3 py-1.5 rounded font-mono text-[10px] font-medium bg-c-bezel border border-c-border text-c-muted hover:bg-c-border hover:text-c-text transition-colors uppercase">
              UPLOAD PHOTO
            </label>
            <p className="font-mono text-[10px] text-c-dim mt-1">Max 2MB. JPG, PNG, or WebP.</p>
          </div>
        </div>

        {/* Default avatar options */}
        <div className="mb-4">
          <label className="block font-mono text-[10px] text-c-muted mb-2 uppercase tracking-wider">OR CHOOSE AN AVATAR</label>
          <div className="flex gap-2">
            {DEFAULT_AVATARS.map((av) => (
              <button
                key={av.id}
                onClick={() => savePracticeDefault('avatarUrl', av.url)}
                className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-colors ${
                  tierInfo?.avatarUrl === av.url ? 'border-c-amber' : 'border-c-border hover:border-c-border-hi'
                }`}
              >
                <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Display name */}
        <div>
          <label className="block font-mono text-[10px] text-c-muted mb-1.5 uppercase tracking-wider">DISPLAY NAME</label>
          <input
            type="text"
            defaultValue={tierInfo?.displayName || ''}
            onBlur={(e) => {
              const val = e.target.value.trim();
              savePracticeDefault('displayName', val);
            }}
            placeholder="How should the examiner address you?"
            maxLength={50}
            className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
          />
        </div>
      </div>

      {/* 2. Account Info */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-4 tracking-wider uppercase">ACCOUNT</h2>
        <div className="text-xs mb-5 font-mono">
          <span className="text-c-muted">EMAIL: </span>
          <span className="text-c-text">{email ?? 'LOADING...'}</span>
        </div>

        {/* Practice Defaults (folded into Account) */}
        <div className="border-t border-c-border pt-4">
          <h3 className="font-mono text-[10px] text-c-muted mb-3 tracking-wider uppercase">PRACTICE DEFAULTS</h3>
          {tierLoading ? (
            <div className="font-mono text-xs text-c-dim">LOADING PREFERENCES...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-c-muted mb-1.5 uppercase">CERTIFICATE / RATING</label>
                <div className="flex gap-2">
                  {([
                    { value: 'private', label: 'PRIVATE PILOT' },
                    { value: 'commercial', label: 'COMMERCIAL' },
                    { value: 'instrument', label: 'INSTRUMENT' },
                  ] as const).map((r) => (
                    <button
                      key={r.value}
                      onClick={() => savePracticeDefault('preferredRating', r.value)}
                      disabled={defaultsSaving || tierInfo?.preferredRating === r.value}
                      className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] transition-colors ${
                        tierInfo?.preferredRating === r.value
                          ? 'border-c-amber/50 bg-c-amber-lo/50 text-c-amber font-semibold'
                          : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
                      } disabled:opacity-70`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {tierInfo?.preferredRating !== 'instrument' ? (
                <div>
                  <label className="block font-mono text-[10px] text-c-muted mb-1.5 uppercase">AIRCRAFT CLASS</label>
                  <div className="flex gap-2">
                    {([
                      { value: 'ASEL', label: 'ASEL' },
                      { value: 'AMEL', label: 'AMEL' },
                      { value: 'ASES', label: 'ASES' },
                      { value: 'AMES', label: 'AMES' },
                    ] as const).map((cls) => (
                      <button
                        key={cls.value}
                        onClick={() => savePracticeDefault('preferredAircraftClass', cls.value)}
                        disabled={defaultsSaving || tierInfo?.preferredAircraftClass === cls.value}
                        className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] transition-colors ${
                          tierInfo?.preferredAircraftClass === cls.value
                            ? 'border-c-cyan/50 bg-c-cyan-lo/50 text-c-cyan font-semibold'
                            : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
                        } disabled:opacity-70`}
                      >
                        {cls.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="font-mono text-[10px] text-c-dim uppercase">INSTRUMENT RATING — AIRPLANE</p>
              )}
              <div>
                <label className="block font-mono text-[10px] text-c-muted mb-1.5 uppercase">AIRCRAFT TYPE</label>
                <input
                  type="text"
                  value={tierInfo?.aircraftType || ''}
                  onChange={(e) => setTierInfo(prev => prev ? { ...prev, aircraftType: e.target.value } : null)}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (tierInfo?.aircraftType || '')) {
                      savePracticeDefault('aircraftType', val);
                    }
                  }}
                  placeholder="e.g., Cessna 172"
                  maxLength={100}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-c-muted mb-1.5 uppercase">HOME AIRPORT</label>
                <input
                  type="text"
                  value={tierInfo?.homeAirport || ''}
                  onChange={(e) => setTierInfo(prev => prev ? { ...prev, homeAirport: e.target.value.toUpperCase() } : null)}
                  onBlur={(e) => {
                    const val = e.target.value.trim().toUpperCase();
                    if (val !== (tierInfo?.homeAirport || '')) {
                      savePracticeDefault('homeAirport', val);
                    }
                  }}
                  placeholder="e.g., KJAX"
                  maxLength={10}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim uppercase transition-colors"
                />
              </div>
              {defaultsMessage && (
                <p className={`font-mono text-[10px] ${defaultsMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {defaultsMessage.type === 'success' ? '\u2713 ' : ''}{defaultsMessage.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Plan & Usage */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-1 tracking-wider uppercase">PLAN &amp; USAGE</h2>
        <p className="font-mono text-[10px] text-c-muted mb-5">
          Your current subscription and usage this billing period.
        </p>

        {subLoading || tierLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="iframe rounded-lg p-4 h-20" />
              <div className="iframe rounded-lg p-4 h-20" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="iframe rounded-lg p-4">
                <div className="font-mono text-[10px] text-c-muted mb-1 uppercase">CURRENT PLAN</div>
                <div className="font-mono text-c-green font-semibold text-sm glow-g uppercase">
                  {isPaidUser ? (subInfo?.plan || 'PAID') : 'FREE'}
                </div>
                {subInfo?.status === 'trialing' && (
                  <div className="font-mono text-[10px] text-c-amber mt-1 uppercase">TRIAL ACTIVE</div>
                )}
              </div>
              <div className="iframe rounded-lg p-4">
                <div className="font-mono text-[10px] text-c-muted mb-1 uppercase">
                  {isPaidUser ? 'RENEWAL DATE' : 'STATUS'}
                </div>
                <div className="font-mono text-c-text font-semibold text-sm uppercase">
                  {subInfo?.renewalDate
                    ? new Date(subInfo.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : isPaidUser ? 'N/A' : 'FREE TIER'}
                </div>
              </div>
            </div>

            {tierInfo && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="iframe rounded-lg p-4">
                  <div className="font-mono text-[10px] text-c-muted mb-1 uppercase">SESSIONS THIS MONTH</div>
                  <div className="font-mono text-c-text font-semibold text-sm">
                    {tierInfo.usage.sessionsThisMonth}
                    <span className="text-c-muted font-normal">
                      {' / '}
                      {tierInfo.features.maxSessionsPerMonth === Infinity ? 'UNLIMITED' : tierInfo.features.maxSessionsPerMonth}
                    </span>
                  </div>
                  {tierInfo.features.maxSessionsPerMonth !== Infinity && (
                    <div className="mt-2 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full prog-a"
                        style={{ width: `${Math.min(100, (tierInfo.usage.sessionsThisMonth / tierInfo.features.maxSessionsPerMonth) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="iframe rounded-lg p-4">
                  <div className="font-mono text-[10px] text-c-muted mb-1 uppercase">TTS CHARACTERS</div>
                  <div className="font-mono text-c-text font-semibold text-sm">
                    {Math.round(tierInfo.usage.ttsCharsThisMonth / 1000)}k
                    <span className="text-c-muted font-normal">
                      {' / '}
                      {tierInfo.features.maxTtsCharsPerMonth === Infinity ? 'UNLIMITED' : `${Math.round(tierInfo.features.maxTtsCharsPerMonth / 1000)}k`}
                    </span>
                  </div>
                  {tierInfo.features.maxTtsCharsPerMonth !== Infinity && (
                    <div className="mt-2 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full prog-c"
                        style={{ width: `${Math.min(100, (tierInfo.usage.ttsCharsThisMonth / tierInfo.features.maxTtsCharsPerMonth) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {portalError && (
              <p className="font-mono text-xs text-c-red mb-3">{portalError}</p>
            )}

            <div className="flex items-center gap-3">
              {isPaidUser ? (
                <>
                  <button
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                    className="px-4 py-2 bg-c-bezel hover:bg-c-border border border-c-border text-c-text font-mono text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 uppercase tracking-wide"
                  >
                    {portalLoading ? 'OPENING...' : 'MANAGE SUBSCRIPTION'}
                  </button>
                  <button
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                    className="px-4 py-2 font-mono text-xs text-c-muted hover:text-c-text transition-colors uppercase tracking-wide"
                  >
                    PAUSE SUBSCRIPTION
                  </button>
                </>
              ) : (
                <a
                  href="/pricing"
                  className="px-4 py-2 bg-c-amber hover:bg-c-amber/90 text-c-bg font-mono text-xs font-semibold rounded-lg transition-colors inline-block uppercase tracking-wide"
                >
                  UPGRADE PLAN
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {/* 3. Theme */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-1 tracking-wider uppercase">THEME</h2>
        <p className="font-mono text-[10px] text-c-muted mb-5">
          Choose the cockpit aesthetic for your entire interface.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {THEMES.map((t) => {
            const isActive = (tierInfo?.preferredTheme || 'cockpit') === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  savePracticeDefault('preferredTheme', t.id);
                  setTierInfo(prev => prev ? { ...prev, preferredTheme: t.id } : null);
                }}
                disabled={isActive}
                className={`iframe rounded-lg p-4 text-left transition-colors ${
                  isActive
                    ? 'border-l-2 border-c-amber ring-1 ring-c-amber/20'
                    : 'hover:border-c-border-hi cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.accent }} />
                  <span className={`font-mono text-xs font-semibold uppercase ${isActive ? 'text-c-amber' : 'text-c-text'}`}>
                    {t.label}
                  </span>
                  {isActive && (
                    <span className="font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20 uppercase ml-auto">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="font-mono text-[10px] text-c-dim">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Examiner Voice */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-1 tracking-wider uppercase">EXAMINER VOICE</h2>
        <p className="font-mono text-[10px] text-c-muted mb-5">
          Choose the voice your DPE examiner will use during sessions.
        </p>

        {tierLoading ? (
          <div className="font-mono text-xs text-c-dim uppercase">LOADING VOICE OPTIONS...</div>
        ) : tierInfo?.voiceOptions && tierInfo.voiceOptions.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {tierInfo.voiceOptions.map((option) => {
                const isActive = tierInfo.preferredVoice === option.model
                  || (!tierInfo.preferredVoice && option === tierInfo.voiceOptions[0]);
                const isPreviewing = previewingVoice === option.model;
                return (
                  <div
                    key={option.model}
                    className={`iframe rounded-lg p-4 transition-colors ${
                      isActive
                        ? 'border-l-2 border-c-amber ring-1 ring-c-amber/20'
                        : 'hover:border-c-border-hi'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        {option.image && (
                          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-c-border flex-shrink-0 bg-c-bezel">
                            <img src={option.image} alt={option.label} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div>
                          <span className={`font-mono text-xs font-semibold uppercase ${isActive ? 'text-c-amber' : 'font-medium text-c-text'}`}>
                            {option.label}
                          </span>
                          {option.desc && <p className="font-mono text-[10px] text-c-dim mt-0.5">{option.desc}</p>}
                        </div>
                      </div>
                      {isActive && (
                        <span className="font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20 uppercase">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => isPreviewing ? (() => { previewAudioRef.current?.pause(); previewAudioRef.current = null; setPreviewingVoice(null); })() : previewVoice(option.model)}
                        disabled={previewingVoice !== null && !isPreviewing}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] font-medium transition-colors ${
                          isPreviewing
                            ? 'bg-c-amber text-c-bg'
                            : 'bg-c-bezel border border-c-border text-c-muted hover:bg-c-border hover:text-c-text'
                        } disabled:opacity-40 uppercase`}
                      >
                        {isPreviewing ? '\u25A0' : '\u25B6'} {isPreviewing ? 'STOP' : 'PREVIEW'}
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => switchVoice(option.model)}
                          disabled={voiceSaving}
                          className="px-3 py-1.5 rounded font-mono text-[10px] font-medium bg-c-amber-lo text-c-amber hover:bg-c-amber hover:text-c-bg transition-colors border border-c-amber/30 disabled:opacity-40 uppercase"
                        >
                          SELECT
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {voiceMessage && (
              <p className={`font-mono text-[10px] mt-3 ${voiceMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                {voiceMessage.text}
              </p>
            )}
          </>
        ) : (
          <div className="font-mono text-xs text-c-dim uppercase">NO VOICE OPTIONS AVAILABLE FOR YOUR CURRENT PLAN.</div>
        )}
      </div>

      {/* 5. Voice Diagnostics (collapsible) */}
      <div className="bezel rounded-lg border border-c-border">
        <button
          onClick={() => setDiagOpen(!diagOpen)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <div>
            <h2 className="font-mono font-semibold text-sm text-c-amber tracking-wider uppercase">VOICE DIAGNOSTICS</h2>
            <p className="font-mono text-[10px] text-c-muted mt-0.5">
              Test your microphone, speech recognition, and speaker.
            </p>
          </div>
          <span className={`font-mono text-c-muted text-sm transition-transform ${diagOpen ? 'rotate-180' : ''}`}>
            &#9660;
          </span>
        </button>

        {diagOpen && (
          <div className="px-6 pb-6 border-t border-c-border pt-4">
            {/* Microphone selector */}
            {audioDevices.length > 0 && (
              <div className="mb-5">
                <label className="block font-mono text-[10px] text-c-muted mb-1.5 uppercase">MICROPHONE</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={diagRunning}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber disabled:opacity-50"
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3 mb-5">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 iframe rounded-lg">
                  <span className={`font-mono text-sm mt-0.5 ${statusColor(step.status)}`}>
                    {statusIcon(step.status)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-c-text uppercase">{step.label}</p>
                    {step.detail && (
                      <p className={`font-mono text-[10px] mt-0.5 ${step.status === 'fail' ? 'text-c-red' : step.status === 'pass' ? 'text-c-green' : 'text-c-muted'}`}>
                        {step.detail}
                      </p>
                    )}
                    {/* Mic level meter */}
                    {i === 0 && step.status === 'running' && micLevel > 0 && (
                      <div className="mt-2 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full prog-g transition-all duration-75"
                          style={{ width: `${micLevel}%` }}
                        />
                      </div>
                    )}
                    {/* Recognized text display */}
                    {i === 1 && step.status === 'running' && recognizedText && (
                      <p className="font-mono text-[10px] mt-1 text-c-cyan italic">
                        &ldquo;{recognizedText}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={runDiagnostics}
              disabled={diagRunning}
              className="px-5 py-2.5 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-xs font-semibold rounded-lg transition-colors uppercase tracking-wide"
            >
              {diagRunning ? 'RUNNING...' : 'RUN VOICE TEST'}
            </button>

            <p className="text-[10px] text-c-dim font-mono mt-3 leading-relaxed">
              Note: Speech recognition uses Chrome&apos;s built-in mic setting, which may differ from the selection above.
              Check chrome://settings/content/microphone if recognition fails.
            </p>
          </div>
        )}
      </div>

      {/* 6. Active Sessions */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-1 tracking-wider uppercase">ACTIVE SESSIONS</h2>
        <p className="font-mono text-[10px] text-c-muted mb-5">
          Devices where you are currently signed in.
        </p>

        {sessionsLoading ? (
          <div className="space-y-3">
            <div className="iframe rounded-lg p-3 h-16" />
          </div>
        ) : activeSessions.length === 0 ? (
          <div className="font-mono text-xs text-c-dim uppercase">NO ACTIVE SESSIONS FOUND.</div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 iframe rounded-lg ${
                  session.this_device
                    ? 'border-l-2 border-c-cyan'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-c-muted text-lg">&#9109;</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-c-text">{session.device_label}</span>
                      {session.this_device && (
                        <span className="font-mono text-[10px] bg-c-cyan-lo text-c-cyan px-1.5 py-0.5 rounded border border-c-cyan/20 uppercase">
                          THIS DEVICE
                        </span>
                      )}
                      {session.is_exam_active && (
                        <span className="font-mono text-[10px] bg-c-green-lo text-c-green px-1.5 py-0.5 rounded border border-c-green/20 uppercase">
                          EXAM ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {session.approximate_location && (
                        <span className="font-mono text-[10px] text-c-dim">{session.approximate_location}</span>
                      )}
                      {session.approximate_location && (
                        <span className="font-mono text-[10px] text-c-dim">&middot;</span>
                      )}
                      <span className="font-mono text-[10px] text-c-dim">
                        Last active: {new Date(session.last_activity_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {sessionsMessage && (
          <p className={`font-mono text-[10px] mt-3 ${sessionsMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
            {sessionsMessage.text}
          </p>
        )}

        {activeSessions.filter(s => !s.this_device).length > 0 && (
          <button
            onClick={async () => {
              setSignOutOthersLoading(true);
              setSessionsMessage(null);
              try {
                const res = await fetch('/api/user/sessions', { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to sign out other sessions');
                setSessionsMessage({ text: 'All other sessions have been signed out.', type: 'success' });
                fetchActiveSessions();
              } catch (err) {
                setSessionsMessage({ text: err instanceof Error ? err.message : 'Failed to sign out other sessions', type: 'error' });
              } finally {
                setSignOutOthersLoading(false);
              }
            }}
            disabled={signOutOthersLoading}
            className="mt-4 px-4 py-2 bg-c-red/80 hover:bg-c-red disabled:opacity-50 text-c-text font-mono text-xs font-semibold rounded-lg transition-colors uppercase tracking-wide"
          >
            {signOutOthersLoading ? 'SIGNING OUT...' : 'SIGN OUT ALL OTHER SESSIONS'}
          </button>
        )}
      </div>

      {/* 7. Feedback */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-sm text-c-amber mb-1 tracking-wider uppercase">FEEDBACK</h2>
        <p className="font-mono text-[10px] text-c-muted mb-5">
          Help us improve HeyDPE by reporting bugs or content errors.
        </p>

        {feedbackType === null ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setFeedbackType('bug_report'); setFeedbackMessage(null); }}
              className="px-4 py-3 bg-c-panel hover:bg-c-elevated border border-c-border hover:border-c-amber/30 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-c-amber text-sm">&#9888;</span>
                <span className="font-mono text-xs font-semibold text-c-text uppercase">REPORT A BUG</span>
              </div>
              <p className="font-mono text-[10px] text-c-muted">Something isn&apos;t working correctly</p>
            </button>
            <button
              onClick={() => { setFeedbackType('content_error'); setFeedbackMessage(null); }}
              className="px-4 py-3 bg-c-panel hover:bg-c-elevated border border-c-border hover:border-c-cyan/30 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-c-cyan text-sm">&#9776;</span>
                <span className="font-mono text-xs font-semibold text-c-text uppercase">CONTENT ERROR</span>
              </div>
              <p className="font-mono text-[10px] text-c-muted">Incorrect aviation information</p>
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${
                feedbackType === 'bug_report'
                  ? 'bg-c-amber-lo text-c-amber border-c-amber/20'
                  : 'bg-c-cyan-lo text-c-cyan border-c-cyan/20'
              }`}>
                {feedbackType === 'bug_report' ? 'BUG REPORT' : 'CONTENT ERROR'}
              </span>
              <button
                onClick={() => {
                  setFeedbackType(null);
                  setFeedbackDescription('');
                  setFeedbackMessage(null);
                }}
                disabled={feedbackSubmitting}
                className="font-mono text-[10px] text-c-dim hover:text-c-text transition-colors uppercase"
              >
                CHANGE TYPE
              </button>
            </div>

            <textarea
              value={feedbackDescription}
              onChange={(e) => setFeedbackDescription(e.target.value)}
              placeholder={feedbackType === 'bug_report'
                ? 'Describe the bug... What happened? What did you expect?'
                : 'Describe the content error... What information was incorrect?'}
              rows={4}
              className="fb-textarea w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:border-c-amber placeholder-c-dim resize-none mb-4 transition-colors"
            />

            {feedbackMessage && (
              <p className={`font-mono text-[10px] mb-3 ${feedbackMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                {feedbackMessage.text}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setFeedbackType(null);
                  setFeedbackDescription('');
                  setFeedbackMessage(null);
                }}
                disabled={feedbackSubmitting}
                className="px-4 py-2 text-c-muted hover:text-c-text font-mono text-xs transition-colors uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  setFeedbackSubmitting(true);
                  setFeedbackMessage(null);
                  try {
                    const details: Record<string, unknown> = {
                      description: feedbackDescription,
                    };
                    if (feedbackType === 'bug_report' && typeof navigator !== 'undefined') {
                      details.browser_info = navigator.userAgent;
                      details.page_url = window.location.href;
                    }
                    const res = await fetch('/api/report', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        report_type: feedbackType,
                        details,
                      }),
                    });
                    if (res.ok) {
                      setFeedbackMessage({ text: 'Thank you! Your feedback has been submitted.', type: 'success' });
                      setFeedbackDescription('');
                      setTimeout(() => {
                        setFeedbackType(null);
                        setFeedbackMessage(null);
                      }, 3000);
                    } else {
                      const data = await res.json().catch(() => ({}));
                      setFeedbackMessage({ text: data.error || 'Failed to submit feedback', type: 'error' });
                    }
                  } catch {
                    setFeedbackMessage({ text: 'Failed to submit feedback', type: 'error' });
                  } finally {
                    setFeedbackSubmitting(false);
                  }
                }}
                disabled={feedbackSubmitting || !feedbackDescription.trim()}
                className="px-5 py-2 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-xs font-semibold rounded-lg transition-colors uppercase tracking-wide"
              >
                {feedbackSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
