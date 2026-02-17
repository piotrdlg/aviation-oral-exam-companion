'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VoiceTier, TierFeatures } from '@/lib/voice/types';
import VoiceLab from './components/VoiceLab';

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
  voiceOptions: VoiceOption[];
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

  // Subscription state (Task 35)
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

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
            voiceOptions: data.voiceOptions || [],
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
    } catch {
      // Failed to open portal — user may not have a Stripe customer
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
      setTierInfo((prev) => prev ? { ...prev, preferredVoice: data.preferredVoice } : null);
      const label = tierInfo?.voiceOptions.find((v) => v.model === model)?.label || model;
      setVoiceMessage({ text: `Voice changed to ${label}`, type: 'success' });
    } catch (err) {
      setVoiceMessage({ text: err instanceof Error ? err.message : 'Failed to update voice', type: 'error' });
    } finally {
      setVoiceSaving(false);
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
        return '○';
      case 'running':
        return '◌';
      case 'pass':
        return '✓';
      case 'fail':
        return '✗';
    }
  };

  const statusColor = (s: TestStatus) => {
    switch (s) {
      case 'idle':
        return 'text-gray-500';
      case 'running':
        return 'text-yellow-400 animate-pulse';
      case 'pass':
        return 'text-green-400';
      case 'fail':
        return 'text-red-400';
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
        <p className="text-gray-400 mb-8">Manage your account and preferences.</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-4">Account</h2>
        <div className="text-sm">
          <span className="text-gray-400">Email: </span>
          <span className="text-white">{email ?? 'Loading...'}</span>
        </div>
      </div>

      {/* Usage Dashboard (Task 35) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-1">Plan &amp; Usage</h2>
        <p className="text-sm text-gray-400 mb-5">
          Your current subscription and usage this billing period.
        </p>

        {subLoading || tierLoading ? (
          <div className="text-sm text-gray-500">Loading subscription info...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">Current Plan</div>
                <div className="text-white font-semibold capitalize">
                  {subInfo?.status === 'active' || subInfo?.status === 'trialing'
                    ? (subInfo.plan || 'Paid')
                    : 'Free'}
                </div>
                {subInfo?.status === 'trialing' && (
                  <div className="text-xs text-blue-400 mt-1">Trial active</div>
                )}
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">Renewal Date</div>
                <div className="text-white font-semibold">
                  {subInfo?.renewalDate
                    ? new Date(subInfo.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'N/A'}
                </div>
              </div>
            </div>

            {tierInfo && (
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Sessions This Month</div>
                  <div className="text-white font-semibold">
                    {tierInfo.usage.sessionsThisMonth}
                    <span className="text-gray-500 font-normal">
                      {' / '}
                      {tierInfo.features.maxSessionsPerMonth === Infinity ? 'Unlimited' : tierInfo.features.maxSessionsPerMonth}
                    </span>
                  </div>
                  {tierInfo.features.maxSessionsPerMonth !== Infinity && (
                    <div className="mt-2 h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          tierInfo.usage.sessionsThisMonth / tierInfo.features.maxSessionsPerMonth >= 0.8
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, (tierInfo.usage.sessionsThisMonth / tierInfo.features.maxSessionsPerMonth) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">TTS Characters</div>
                  <div className="text-white font-semibold">
                    {Math.round(tierInfo.usage.ttsCharsThisMonth / 1000)}k
                    <span className="text-gray-500 font-normal">
                      {' / '}
                      {tierInfo.features.maxTtsCharsPerMonth === Infinity ? 'Unlimited' : `${Math.round(tierInfo.features.maxTtsCharsPerMonth / 1000)}k`}
                    </span>
                  </div>
                  {tierInfo.features.maxTtsCharsPerMonth !== Infinity && (
                    <div className="mt-2 h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          tierInfo.usage.ttsCharsThisMonth / tierInfo.features.maxTtsCharsPerMonth >= 0.8
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, (tierInfo.usage.ttsCharsThisMonth / tierInfo.features.maxTtsCharsPerMonth) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {subInfo?.hasStripeCustomer ? (
                <button
                  onClick={openCustomerPortal}
                  disabled={portalLoading}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {portalLoading ? 'Opening...' : 'Manage Subscription'}
                </button>
              ) : (
                <a
                  href="/pricing"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors inline-block"
                >
                  Upgrade Plan
                </a>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-1">Examiner Voice</h2>
        <p className="text-sm text-gray-400 mb-5">
          Choose the voice your DPE examiner will use during practice sessions.
        </p>

        {tierLoading ? (
          <div className="text-sm text-gray-500">Loading voice options...</div>
        ) : tierInfo?.voiceOptions && tierInfo.voiceOptions.length > 0 ? (
          <>
            <div className="grid gap-3">
              {tierInfo.voiceOptions.map((option) => {
                const isActive = tierInfo.preferredVoice === option.model
                  || (!tierInfo.preferredVoice && option === tierInfo.voiceOptions[0]);
                return (
                  <button
                    key={option.model}
                    onClick={() => switchVoice(option.model)}
                    disabled={voiceSaving || isActive}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/50'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-750'
                    } ${voiceSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${isActive ? 'text-blue-400' : 'text-white'}`}>
                        {option.label}
                      </span>
                      {isActive && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Deepgram Aura-2 &middot; {option.model}</p>
                  </button>
                );
              })}
            </div>

            {voiceMessage && (
              <p className={`text-sm mt-3 ${voiceMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {voiceMessage.text}
              </p>
            )}
          </>
        ) : (
          <div className="text-sm text-gray-500">No voice options available. Contact admin.</div>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-1">Voice Diagnostics</h2>
        <p className="text-sm text-gray-400 mb-5">
          Test your microphone, speech recognition, and speaker to make sure voice mode works.
        </p>

        {/* Microphone selector */}
        {audioDevices.length > 0 && (
          <div className="mb-5">
            <label className="block text-sm text-gray-300 mb-1.5">Microphone</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={diagRunning}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-4 mb-5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className={`text-lg font-mono mt-0.5 ${statusColor(step.status)}`}>
                {statusIcon(step.status)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{step.label}</p>
                {step.detail && (
                  <p className={`text-xs mt-0.5 ${step.status === 'fail' ? 'text-red-300' : 'text-gray-400'}`}>
                    {step.detail}
                  </p>
                )}
                {/* Mic level meter */}
                {i === 0 && step.status === 'running' && micLevel > 0 && (
                  <div className="mt-2 h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-75"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                )}
                {/* Recognized text display */}
                {i === 1 && step.status === 'running' && recognizedText && (
                  <p className="text-xs mt-1 text-blue-300 italic">
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
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {diagRunning ? 'Running...' : 'Run Voice Test'}
        </button>

        <p className="text-xs text-gray-600 mt-3">
          Note: Speech recognition uses Chrome&apos;s built-in mic setting, which may differ from the selection above.
          Check chrome://settings/content/microphone if recognition fails.
        </p>
      </div>

      <VoiceLab />

      {/* Active Sessions (Task 32) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-1">Active Sessions</h2>
        <p className="text-sm text-gray-400 mb-5">
          Devices where you are currently signed in.
        </p>

        {sessionsLoading ? (
          <div className="text-sm text-gray-500">Loading sessions...</div>
        ) : activeSessions.length === 0 ? (
          <div className="text-sm text-gray-500">No active sessions found.</div>
        ) : (
          <div className="space-y-3 mb-5">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  session.this_device
                    ? 'border-blue-500/30 bg-blue-950/20'
                    : 'border-gray-800 bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
                  </svg>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white truncate">{session.device_label}</span>
                      {session.this_device && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          This device
                        </span>
                      )}
                      {session.is_exam_active && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Exam active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      {session.approximate_location && (
                        <span>{session.approximate_location}</span>
                      )}
                      <span>
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
          <p className={`text-sm mb-3 ${sessionsMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {sessionsMessage.text}
          </p>
        )}

        {activeSessions.length > 1 && (
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
            className="px-4 py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
          >
            {signOutOthersLoading ? 'Signing out...' : 'Sign Out All Other Sessions'}
          </button>
        )}
      </div>

      {/* Feedback Widget (Task 27) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-1">Feedback</h2>
        <p className="text-sm text-gray-400 mb-5">
          Help us improve HeyDPE by reporting bugs or content errors.
        </p>

        {feedbackType === null ? (
          <div className="flex gap-3">
            <button
              onClick={() => { setFeedbackType('bug_report'); setFeedbackMessage(null); }}
              className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135c-.117-1.08-.83-1.868-1.868-1.868H6.812c-1.037 0-1.75.788-1.868 1.868A23.91 23.91 0 0 1 3.793 14.19 24.232 24.232 0 0 1 12 12.75ZM2.25 6.75c0-2.071 1.679-3.75 3.75-3.75h12c2.071 0 3.75 1.679 3.75 3.75v.006c0 .243-.022.483-.065.72a.75.75 0 0 1-1.474-.267A3.753 3.753 0 0 0 21.75 6.75 2.25 2.25 0 0 0 18 4.5H6A2.25 2.25 0 0 0 2.25 6.75c0 .075.002.15.007.224a.75.75 0 0 1-1.474.267A5.265 5.265 0 0 1 .75 6.75h1.5Z" />
                </svg>
                <span className="text-sm font-medium text-white">Report a Bug</span>
              </div>
              <p className="text-xs text-gray-400">Something isn&apos;t working correctly</p>
            </button>
            <button
              onClick={() => { setFeedbackType('content_error'); setFeedbackMessage(null); }}
              className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                <span className="text-sm font-medium text-white">Report Content Error</span>
              </div>
              <p className="text-xs text-gray-400">Incorrect aviation information</p>
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                feedbackType === 'bug_report'
                  ? 'bg-amber-900/40 text-amber-400'
                  : 'bg-blue-900/40 text-blue-400'
              }`}>
                {feedbackType === 'bug_report' ? 'Bug Report' : 'Content Error'}
              </span>
            </div>

            <textarea
              value={feedbackDescription}
              onChange={(e) => setFeedbackDescription(e.target.value)}
              placeholder={feedbackType === 'bug_report'
                ? 'Describe the bug... What happened? What did you expect?'
                : 'Describe the content error... What information was incorrect?'}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />

            {feedbackMessage && (
              <p className={`text-sm mb-3 ${feedbackMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
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
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setFeedbackSubmitting(true);
                  setFeedbackMessage(null);
                  try {
                    const details: Record<string, unknown> = {
                      description: feedbackDescription,
                    };
                    // Capture browser info for bug reports
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
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {feedbackSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
