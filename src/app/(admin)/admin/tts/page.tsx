'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ─── Option lists ────────────────────────────────────────────────────────────

const OPENAI_VOICES = [
  { value: 'onyx', label: 'Onyx — Deep, authoritative male' },
  { value: 'alloy', label: 'Alloy — Neutral, balanced' },
  { value: 'echo', label: 'Echo — Warm, conversational male' },
  { value: 'fable', label: 'Fable — Expressive, British' },
  { value: 'nova', label: 'Nova — Warm, friendly female' },
  { value: 'shimmer', label: 'Shimmer — Clear, bright female' },
];

const OPENAI_MODELS = [
  { value: 'tts-1', label: 'tts-1 — Standard (faster)' },
  { value: 'tts-1-hd', label: 'tts-1-hd — High Definition' },
];

const DEEPGRAM_VOICES = [
  { value: 'aura-2-orion-en', label: 'Orion — Male American' },
  { value: 'aura-2-zeus-en', label: 'Zeus — Male American' },
  { value: 'aura-2-mars-en', label: 'Mars — Male American' },
  { value: 'aura-2-odysseus-en', label: 'Odysseus — Male American' },
  { value: 'aura-2-apollo-en', label: 'Apollo — Male American' },
  { value: 'aura-2-arcas-en', label: 'Arcas — Male American' },
  { value: 'aura-2-aries-en', label: 'Aries — Male American' },
  { value: 'aura-2-atlas-en', label: 'Atlas — Male American' },
  { value: 'aura-2-hermes-en', label: 'Hermes — Male American' },
  { value: 'aura-2-jupiter-en', label: 'Jupiter — Male American' },
  { value: 'aura-2-neptune-en', label: 'Neptune — Male American' },
  { value: 'aura-2-orpheus-en', label: 'Orpheus — Male American' },
  { value: 'aura-2-pluto-en', label: 'Pluto — Male American' },
  { value: 'aura-2-saturn-en', label: 'Saturn — Male American' },
  { value: 'aura-2-draco-en', label: 'Draco — Male British' },
  { value: 'aura-2-hyperion-en', label: 'Hyperion — Male Australian' },
  { value: 'aura-2-thalia-en', label: 'Thalia — Female American' },
  { value: 'aura-2-athena-en', label: 'Athena — Female American' },
  { value: 'aura-2-luna-en', label: 'Luna — Female American' },
  { value: 'aura-2-stella-en', label: 'Stella — Female American' },
];

const DEEPGRAM_ENCODINGS = [
  { value: 'linear16', label: 'Linear16 (PCM)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' },
  { value: 'flac', label: 'FLAC' },
  { value: 'aac', label: 'AAC' },
];

const SAMPLE_RATES = [
  { value: 8000, label: '8 kHz' },
  { value: 16000, label: '16 kHz' },
  { value: 24000, label: '24 kHz' },
  { value: 32000, label: '32 kHz' },
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' },
];

const CARTESIA_MODELS = [
  { value: 'sonic-3', label: 'Sonic 3 (Latest)' },
  { value: 'sonic-turbo', label: 'Sonic Turbo (Faster)' },
  { value: 'sonic-multilingual', label: 'Sonic Multilingual' },
];

const CARTESIA_EMOTIONS = [
  { value: 'confident', label: 'Confident' },
  { value: 'calm', label: 'Calm' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'determined', label: 'Determined' },
  { value: 'proud', label: 'Proud' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'professional', label: 'Professional' },
  { value: 'serious', label: 'Serious' },
  { value: 'contemplative', label: 'Contemplative' },
  { value: 'curious', label: 'Curious' },
  { value: 'excited', label: 'Excited' },
  { value: 'happy', label: 'Happy' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'sympathetic', label: 'Sympathetic' },
  { value: 'skeptical', label: 'Skeptical' },
  { value: 'disappointed', label: 'Disappointed' },
  { value: 'frustrated', label: 'Frustrated' },
  { value: 'angry', label: 'Angry' },
  { value: 'sad', label: 'Sad' },
  { value: 'scared', label: 'Scared' },
];

const TEST_PHRASE = "Good morning. I'm your designated pilot examiner for today's oral examination. Let's begin with the first area of operation: Preflight Preparation. Can you describe the required documents for airworthiness?";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OpenAIConfig {
  voice: string;
  model: string;
  speed: number;
}

interface DeepgramConfig {
  model: string;
  sample_rate: number;
  encoding: string;
}

interface CartesiaConfig {
  model: string;
  voice_id: string;
  voice_name: string;
  speed: number;
  volume: number;
  emotion: string;
  sample_rate: number;
}

interface TTSState {
  openai: OpenAIConfig;
  deepgram: DeepgramConfig;
  cartesia: CartesiaConfig;
}

const DEFAULTS: TTSState = {
  openai: { voice: 'onyx', model: 'tts-1', speed: 1.0 },
  deepgram: { model: 'aura-2-orion-en', sample_rate: 48000, encoding: 'linear16' },
  cartesia: {
    model: 'sonic-3',
    voice_id: 'a167e0f3-df7e-4d52-a9c3-f949145571bd',
    voice_name: 'Classy British Man',
    speed: 0.95,
    volume: 1.0,
    emotion: 'confident',
    sample_rate: 48000,
  },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TTSConfigPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [state, setState] = useState<TTSState>({ ...DEFAULTS });
  const [testing, setTesting] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const entries: { key: string; value: Record<string, unknown> }[] = data.configs || [];

      const newState = { ...DEFAULTS };
      for (const entry of entries) {
        if (entry.key === 'tts.openai') {
          newState.openai = { ...DEFAULTS.openai, ...entry.value } as OpenAIConfig;
        } else if (entry.key === 'tts.deepgram') {
          newState.deepgram = { ...DEFAULTS.deepgram, ...entry.value } as DeepgramConfig;
        } else if (entry.key === 'tts.cartesia') {
          newState.cartesia = { ...DEFAULTS.cartesia, ...entry.value } as CartesiaConfig;
        }
      }
      setState(newState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function saveAll() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            { key: 'tts.openai', value: state.openai },
            { key: 'tts.deepgram', value: state.deepgram },
            { key: 'tts.cartesia', value: state.cartesia },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSaveSuccess(true);
      await fetchConfig();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function testVoice(provider: string) {
    setTesting(provider);
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: TEST_PHRASE }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `TTS failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(null);
    }
  }

  function updateOpenAI<K extends keyof OpenAIConfig>(key: K, value: OpenAIConfig[K]) {
    setState((prev) => ({ ...prev, openai: { ...prev.openai, [key]: value } }));
    setSaveSuccess(false);
  }

  function updateDeepgram<K extends keyof DeepgramConfig>(key: K, value: DeepgramConfig[K]) {
    setState((prev) => ({ ...prev, deepgram: { ...prev.deepgram, [key]: value } }));
    setSaveSuccess(false);
  }

  function updateCartesia<K extends keyof CartesiaConfig>(key: K, value: CartesiaConfig[K]) {
    setState((prev) => ({ ...prev, cartesia: { ...prev.cartesia, [key]: value } }));
    setSaveSuccess(false);
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Voice / TTS Configuration</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-6 animate-pulse">
              <div className="h-5 bg-gray-800 rounded w-48 mb-4" />
              <div className="h-32 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Voice / TTS Configuration</h1>
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-6 text-center">
          <p className="text-red-300 mb-3">{error}</p>
          <button onClick={fetchConfig} className="text-sm text-red-400 hover:text-red-300 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Voice / TTS Configuration</h1>
        <div className="flex items-center gap-3">
          {saveSuccess && <span className="text-xs text-green-400">Saved successfully</span>}
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* ─── Tier 1: Ground School (OpenAI) ─── */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Tier 1 — Ground School
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">OpenAI TTS</p>
            </div>
            <button
              onClick={() => testVoice('openai')}
              disabled={testing !== null}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors border border-gray-700"
            >
              {testing === 'openai' ? 'Playing...' : 'Test Voice'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="Voice"
              value={state.openai.voice}
              options={OPENAI_VOICES}
              onChange={(v) => updateOpenAI('voice', v)}
            />
            <SelectField
              label="Model"
              value={state.openai.model}
              options={OPENAI_MODELS}
              onChange={(v) => updateOpenAI('model', v)}
            />
            <SliderField
              label="Speed"
              value={state.openai.speed}
              min={0.25}
              max={4.0}
              step={0.05}
              onChange={(v) => updateOpenAI('speed', v)}
            />
          </div>
        </section>

        {/* ─── Tier 2: Checkride Prep (Deepgram) ─── */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Tier 2 — Checkride Prep
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">Deepgram Aura-2</p>
            </div>
            <button
              onClick={() => testVoice('deepgram')}
              disabled={testing !== null}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors border border-gray-700"
            >
              {testing === 'deepgram' ? 'Playing...' : 'Test Voice'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="Voice"
              value={state.deepgram.model}
              options={DEEPGRAM_VOICES}
              onChange={(v) => updateDeepgram('model', v)}
            />
            <SelectField
              label="Encoding"
              value={state.deepgram.encoding}
              options={DEEPGRAM_ENCODINGS}
              onChange={(v) => updateDeepgram('encoding', v)}
            />
            <SelectField
              label="Sample Rate"
              value={String(state.deepgram.sample_rate)}
              options={SAMPLE_RATES.map((r) => ({ value: String(r.value), label: r.label }))}
              onChange={(v) => updateDeepgram('sample_rate', Number(v))}
            />
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Deepgram Aura-2 does not support speed, pitch, or emotion controls. Prosody is handled automatically by the model.
          </p>
        </section>

        {/* ─── Tier 3: DPE Live (Cartesia) ─── */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Tier 3 — DPE Live
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">Cartesia Sonic 3</p>
            </div>
            <button
              onClick={() => testVoice('cartesia')}
              disabled={testing !== null}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors border border-gray-700"
            >
              {testing === 'cartesia' ? 'Playing...' : 'Test Voice'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Voice ID</label>
              <input
                type="text"
                value={state.cartesia.voice_id}
                onChange={(e) => updateCartesia('voice_id', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="UUID from Cartesia voice library"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Voice Name (display only)</label>
              <input
                type="text"
                value={state.cartesia.voice_name}
                onChange={(e) => updateCartesia('voice_name', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Classy British Man"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <SelectField
              label="Model"
              value={state.cartesia.model}
              options={CARTESIA_MODELS}
              onChange={(v) => updateCartesia('model', v)}
            />
            <SelectField
              label="Emotion"
              value={state.cartesia.emotion}
              options={CARTESIA_EMOTIONS}
              onChange={(v) => updateCartesia('emotion', v)}
            />
            <SelectField
              label="Sample Rate"
              value={String(state.cartesia.sample_rate)}
              options={SAMPLE_RATES.map((r) => ({ value: String(r.value), label: r.label }))}
              onChange={(v) => updateCartesia('sample_rate', Number(v))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SliderField
              label="Speed"
              value={state.cartesia.speed}
              min={0.6}
              max={1.5}
              step={0.05}
              onChange={(v) => updateCartesia('speed', v)}
            />
            <SliderField
              label="Volume"
              value={state.cartesia.volume}
              min={0.5}
              max={2.0}
              step={0.1}
              onChange={(v) => updateCartesia('volume', v)}
            />
          </div>
        </section>

        {/* ─── Test Phrase ─── */}
        <section className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-4">
          <p className="text-xs text-gray-500 mb-1">Test phrase used by "Test Voice" buttons:</p>
          <p className="text-sm text-gray-400 italic">&ldquo;{TEST_PHRASE}&rdquo;</p>
        </section>
      </div>
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="flex-1 accent-blue-500"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-20 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
