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

interface TierInfo {
  tier: VoiceTier;
  features: TierFeatures;
  usage: {
    sessionsThisMonth: number;
    ttsCharsThisMonth: number;
    sttSecondsThisMonth: number;
  };
}

const TIER_OPTIONS: { value: VoiceTier; label: string; description: string }[] = [
  {
    value: 'ground_school',
    label: 'Ground School',
    description: 'Browser STT + OpenAI TTS (Chrome only)',
  },
  {
    value: 'checkride_prep',
    label: 'Checkride Prep',
    description: 'Deepgram STT & TTS (all browsers, aviation vocabulary)',
  },
  {
    value: 'dpe_live',
    label: 'DPE Live',
    description: 'Deepgram STT + Cartesia Sonic TTS (ultra-low latency)',
  },
];

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  // Voice tier state
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [tierLoading, setTierLoading] = useState(true);
  const [tierSaving, setTierSaving] = useState(false);
  const [tierMessage, setTierMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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

  // Fetch current voice tier
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.json())
      .then((data) => {
        if (data.tier) {
          setTierInfo({ tier: data.tier, features: data.features, usage: data.usage });
        }
      })
      .catch(() => {})
      .finally(() => setTierLoading(false));
  }, []);

  async function switchTier(newTier: VoiceTier) {
    if (tierInfo?.tier === newTier || tierSaving) return;
    setTierSaving(true);
    setTierMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: newTier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update tier');
      setTierInfo((prev) => prev ? { ...prev, tier: newTier, features: data.features } : null);
      setTierMessage({ text: `Switched to ${TIER_OPTIONS.find((t) => t.value === newTier)?.label}`, type: 'success' });
    } catch (err) {
      setTierMessage({ text: err instanceof Error ? err.message : 'Failed to update tier', type: 'error' });
    } finally {
      setTierSaving(false);
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

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-medium text-white mb-1">Voice Quality Tier</h2>
        <p className="text-sm text-gray-400 mb-5">
          Select the voice engine for your exam sessions. Higher tiers use professional STT/TTS providers.
        </p>

        {tierLoading ? (
          <div className="text-sm text-gray-500">Loading tier info...</div>
        ) : (
          <>
            <div className="grid gap-3">
              {TIER_OPTIONS.map((option) => {
                const isActive = tierInfo?.tier === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => switchTier(option.value)}
                    disabled={tierSaving || isActive}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/50'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-750'
                    } ${tierSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${isActive ? 'text-blue-400' : 'text-white'}`}>
                        {option.label}
                      </span>
                      {isActive && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{option.description}</p>
                  </button>
                );
              })}
            </div>

            {tierMessage && (
              <p className={`text-sm mt-3 ${tierMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {tierMessage.text}
              </p>
            )}

            {tierInfo && (
              <div className="mt-5 pt-4 border-t border-gray-800">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Current Usage</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold text-white">{tierInfo.usage.sessionsThisMonth}</div>
                    <div className="text-xs text-gray-500">
                      Sessions / {tierInfo.features.maxSessionsPerMonth === Infinity ? 'Unlimited' : tierInfo.features.maxSessionsPerMonth}
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {Math.round(tierInfo.usage.ttsCharsThisMonth / 1000)}k
                    </div>
                    <div className="text-xs text-gray-500">
                      TTS chars / {tierInfo.features.maxTtsCharsPerMonth === Infinity ? 'Unlimited' : `${Math.round(tierInfo.features.maxTtsCharsPerMonth / 1000)}k`}
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {tierInfo.features.maxExchangesPerSession}
                    </div>
                    <div className="text-xs text-gray-500">Max Q&A / session</div>
                  </div>
                </div>
              </div>
            )}
          </>
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
    </div>
  );
}
