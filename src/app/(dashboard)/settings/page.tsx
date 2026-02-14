'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

interface DiagStep {
  label: string;
  status: TestStatus;
  detail: string;
}

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  // Voice diagnostics state
  const [diagRunning, setDiagRunning] = useState(false);
  const [steps, setSteps] = useState<DiagStep[]>([
    { label: 'Microphone access', status: 'idle', detail: '' },
    { label: 'Speech recognition', status: 'idle', detail: '' },
    { label: 'Speaker / TTS playback', status: 'idle', detail: '' },
  ]);
  const [micLevel, setMicLevel] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, [supabase.auth]);

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

    // --- Step 1: Microphone access ---
    updateStep(0, { status: 'running', detail: 'Requesting microphone permission...' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Show live mic level for 3 seconds
      updateStep(0, { detail: 'Mic active — speak to see level meter...' });
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
              detail: `Microphone working (peak level: ${peakLevel}%)`,
            });
          } else {
            updateStep(0, {
              status: 'fail',
              detail: 'Microphone connected but no audio detected. Check that your mic is not muted.',
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
      // Don't return — continue to test remaining steps
    }

    // --- Step 2: Speech recognition ---
    updateStep(1, { status: 'running', detail: 'Checking browser support...' });

    const SpeechRecognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      updateStep(1, {
        status: 'fail',
        detail: 'SpeechRecognition API not available. This feature requires Chrome or Edge.',
      });
    } else {
      updateStep(1, { detail: 'Say something (you have 6 seconds)...' });

      const transcript = await new Promise<string>((resolve) => {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        let lastTranscript = '';
        let gotResult = false;
        let errorMsg = '';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          gotResult = true;
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
          // Capture ALL errors for diagnostics (don't suppress no-speech)
          errorMsg = event.error;
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            resolve(`ERROR:${event.error}`);
          }
        };

        recognition.start();

        // Auto-stop after 6 seconds
        setTimeout(() => {
          try {
            recognition.stop();
          } catch {
            // already stopped
          }
        }, 6000);
      });

      // Clean up mic stream
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (transcript.startsWith('ERROR:')) {
        const errType = transcript.replace('ERROR:', '');
        let helpText = '';
        switch (errType) {
          case 'no-speech':
            helpText = 'No speech detected by Google servers. Your mic may work for recording but Chrome\'s speech service isn\'t receiving audio. Try: check Chrome mic settings (chrome://settings/content/microphone).';
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
          detail: 'No speech detected and no error reported. The SpeechRecognition API started and stopped without receiving audio. Check that Chrome has the correct microphone selected (chrome://settings/content/microphone).',
        });
      }
    }

    // --- Step 3: TTS playback ---
    updateStep(2, { status: 'running', detail: 'Requesting TTS audio from server...' });
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Voice diagnostics complete. Your microphone and speakers are working correctly.' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      updateStep(2, { detail: 'Playing audio — you should hear the examiner voice...' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Audio playback failed'));
        };
        audio.play().catch(reject);
      });

      updateStep(2, {
        status: 'pass',
        detail: 'TTS audio played successfully.',
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
        <h2 className="text-lg font-medium text-white mb-1">Voice Diagnostics</h2>
        <p className="text-sm text-gray-400 mb-5">
          Test your microphone, speech recognition, and speaker to make sure voice mode works.
        </p>

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
      </div>
    </div>
  );
}
