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

const CARTESIA_VOICES = [
  // ── Aviation / Authority ──
  { value: '36b42fcb-60c5-4bec-b077-cb1a00a92ec6', label: 'Pilot over Intercom', group: 'Aviation' },
  // ── Male — Authoritative / Professional ──
  { value: '63ff761f-c1e8-414b-b969-d1833d1c870c', label: 'Confident British Man', group: 'Male — Professional' },
  { value: '95856005-0332-41b0-935f-352e296aa0df', label: 'Classy British Man', group: 'Male — Professional' },
  { value: 'b043dea0-a007-4bbe-a708-769dc0d0c569', label: 'Wise Man', group: 'Male — Professional' },
  { value: 'd46abd1d-2d02-43e8-819f-51fb652c1c61', label: 'Newsman', group: 'Male — Professional' },
  { value: '69267136-1bdc-412f-ad78-0caad210fb40', label: 'Friendly Man', group: 'Male — Professional' },
  { value: 'ee7ea9f8-c0c1-498c-9f62-dc2571ec235e', label: 'Middle-Aged American Man', group: 'Male — Professional' },
  { value: '41534e16-2966-4c6b-9670-111411def906', label: 'Barbershop Man', group: 'Male — Professional' },
  { value: 'a0e99571-1535-43b5-8c6a-43eb3e42e2c6', label: 'Storyteller Man', group: 'Male — Professional' },
  // ── Male — Narrator / Deep ──
  { value: 'fb26447f-308b-471e-8b00-8e9f04284eb5', label: 'Deep Narrator Man', group: 'Male — Narrator' },
  { value: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', label: 'Movie Narrator Man', group: 'Male — Narrator' },
  { value: '15a9cd88-84b0-4a8b-95f2-5d583b54c72e', label: 'Teacher Man', group: 'Male — Narrator' },
  { value: '726d5ae5-055f-4c3d-8571-8c18cdf420e8', label: 'Commercial Man', group: 'Male — Narrator' },
  { value: '50d6beb4-80ea-4802-8387-6c948fe84208', label: 'Announcer Man', group: 'Male — Narrator' },
  { value: 'ed81fd13-2016-4a49-8fe3-c0d2761695fc', label: 'Calm Man', group: 'Male — Narrator' },
  // ── Male — Casual ──
  { value: '2ee87190-8f84-4925-97da-e52547f9462c', label: 'Nonfiction Man', group: 'Male — Casual' },
  { value: 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94', label: 'Conversational Man', group: 'Male — Casual' },
  { value: 'bd9120b6-7761-47a6-a446-77ca49132781', label: 'Enthusiastic Man', group: 'Male — Casual' },
  { value: '87748186-691b-497e-b88d-9590dbc3f014', label: 'Australian Man', group: 'Male — Casual' },
  { value: 'a3520a8f-226a-428d-9f2c-ab39f005e090', label: 'Indian Man', group: 'Male — Casual' },
  // ── Female — Professional ──
  { value: 'b7d50908-b179-4d23-8183-6a75d5c6b1d3', label: 'Confident Woman', group: 'Female — Professional' },
  { value: '21b81c14-f85b-436d-aff5-43f2e788ecf8', label: 'Professional Woman', group: 'Female — Professional' },
  { value: '00a77add-48d5-4ef6-8157-71e5437b282d', label: 'Calm Woman', group: 'Female — Professional' },
  { value: '248be419-c632-4f23-adf1-5324ed7dbf1d', label: 'Announcer Woman', group: 'Female — Professional' },
  { value: 'c2ac25f9-ecc4-4f56-9095-651354df60c0', label: 'Commercial Woman', group: 'Female — Professional' },
  // ── Female — Narrator ──
  { value: '5619d38c-cf51-4514-82fb-7e73bfe9be0e', label: 'Narrator Woman', group: 'Female — Narrator' },
  { value: 'a01c369f-6d2d-4571-b735-0b3a01c828b5', label: 'Storyteller Woman', group: 'Female — Narrator' },
  { value: 'e3827ec5-697a-4b7c-9704-1a23041bbc51', label: 'British Narrator Woman', group: 'Female — Narrator' },
  { value: 'daf747c6-6bc2-4083-bd59-aa94571c3728', label: 'Wise Woman', group: 'Female — Narrator' },
  { value: '694f9389-aac1-45b6-b726-9d9369183238', label: 'Teacher Woman', group: 'Female — Narrator' },
  // ── Female — Casual ──
  { value: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'Friendly Woman', group: 'Female — Casual' },
  { value: '2b568345-1d48-4047-b25f-7baccf842eb0', label: 'Conversational Woman', group: 'Female — Casual' },
  { value: 'e00d0e4c-a5c8-443f-a8a1-8d82f2e0b4a1', label: 'Young Woman', group: 'Female — Casual' },
  { value: '156fb8d2-335b-4950-9cb3-a2d33befec77', label: 'Cheerful Woman', group: 'Female — Casual' },
  { value: 'f114a467-c40a-4db8-964d-aaba89cd08fa', label: 'Australian Woman', group: 'Female — Casual' },
  { value: '3f6e78f4-30c5-4c56-b61a-9ffc3db7c79d', label: 'Indian Woman', group: 'Female — Casual' },
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
    voice_id: '95856005-0332-41b0-935f-352e296aa0df',
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

          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1.5">Voice</label>
            <select
              value={state.cartesia.voice_id}
              onChange={(e) => {
                const voice = CARTESIA_VOICES.find((v) => v.value === e.target.value);
                updateCartesia('voice_id', e.target.value);
                if (voice) updateCartesia('voice_name', voice.label);
              }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              {Object.entries(
                CARTESIA_VOICES.reduce<Record<string, typeof CARTESIA_VOICES>>((acc, v) => {
                  (acc[v.group] ||= []).push(v);
                  return acc;
                }, {})
              ).map(([group, voices]) => (
                <optgroup key={group} label={group}>
                  {voices.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              ID: <code className="text-gray-500">{state.cartesia.voice_id}</code>
            </p>
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
