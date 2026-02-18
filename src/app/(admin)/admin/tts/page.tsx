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
  // ── Masculine ──
  { value: 'aura-2-orion-en', label: 'Orion — Calm, polite (M, American)' },
  { value: 'aura-2-zeus-en', label: 'Zeus — Deep, trustworthy (M, American)' },
  { value: 'aura-2-mars-en', label: 'Mars — Patient, baritone (M, American)' },
  { value: 'aura-2-odysseus-en', label: 'Odysseus — Professional, smooth (M, American)' },
  { value: 'aura-2-apollo-en', label: 'Apollo — Confident, casual (M, American)' },
  { value: 'aura-2-arcas-en', label: 'Arcas — Natural, clear (M, American)' },
  { value: 'aura-2-aries-en', label: 'Aries — Warm, energetic (M, American)' },
  { value: 'aura-2-atlas-en', label: 'Atlas — Enthusiastic, friendly (M, American)' },
  { value: 'aura-2-hermes-en', label: 'Hermes — Engaging, professional (M, American)' },
  { value: 'aura-2-jupiter-en', label: 'Jupiter — Knowledgeable, baritone (M, American)' },
  { value: 'aura-2-neptune-en', label: 'Neptune — Patient, polite (M, American)' },
  { value: 'aura-2-orpheus-en', label: 'Orpheus — Confident, trustworthy (M, American)' },
  { value: 'aura-2-pluto-en', label: 'Pluto — Calm, empathetic, baritone (M, American)' },
  { value: 'aura-2-saturn-en', label: 'Saturn — Confident, baritone (M, American)' },
  { value: 'aura-2-draco-en', label: 'Draco — Warm, trustworthy, baritone (M, British)' },
  { value: 'aura-2-hyperion-en', label: 'Hyperion — Caring, warm (M, Australian)' },
  // ── Feminine ──
  { value: 'aura-2-thalia-en', label: 'Thalia — Confident, energetic (F, American)' },
  { value: 'aura-2-athena-en', label: 'Athena — Calm, professional (F, American)' },
  { value: 'aura-2-luna-en', label: 'Luna — Friendly, natural (F, American)' },
  { value: 'aura-2-asteria-en', label: 'Asteria — Confident, knowledgeable (F, American)' },
  { value: 'aura-2-aurora-en', label: 'Aurora — Cheerful, energetic (F, American)' },
  { value: 'aura-2-hera-en', label: 'Hera — Smooth, warm, professional (F, American)' },
  { value: 'aura-2-helena-en', label: 'Helena — Caring, friendly, raspy (F, American)' },
  { value: 'aura-2-pandora-en', label: 'Pandora — Smooth, calm, melodic (F, British)' },
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
  // ── Male — Professional / Authority ──
  { value: '36b42fcb-60c5-4bec-b077-cb1a00a92ec6', label: 'Gordon — Pilot (intercom)', group: 'Male — Professional' },
  { value: 'bd9120b6-7761-47a6-a446-77ca49132781', label: 'Owen — Tutorial Man (mature)', group: 'Male — Professional' },
  { value: 'b043dea0-a007-4bbe-a708-769dc0d0c569', label: 'Wise Man (deep, deliberate)', group: 'Male — Professional' },
  { value: '41534e16-2966-4c6b-9670-111411def906', label: 'Clarence — Newsman (firm, deep)', group: 'Male — Professional' },
  { value: 'd46abd1d-2d02-43e8-819f-51fb652c1c61', label: 'Grant — Friendly Support (neutral)', group: 'Male — Professional' },
  { value: '63ff761f-c1e8-414b-b969-d1833d1c870c', label: 'Malcom — Talk Show Host (lively)', group: 'Male — Professional' },
  { value: '95856005-0332-41b0-935f-352e296aa0df', label: 'Hugo — Teatime Friend (British)', group: 'Male — Professional' },
  // ── Male — Narrator / Character ──
  { value: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', label: 'Trevor — Movieman (deep, elderly)', group: 'Male — Narrator' },
  { value: '50d6beb4-80ea-4802-8387-6c948fe84208', label: 'Alfred — Cheeky Person (elderly)', group: 'Male — Narrator' },
  { value: 'ed81fd13-2016-4a49-8fe3-c0d2761695fc', label: 'Zack — Sportsman (energetic)', group: 'Male — Narrator' },
  { value: '69267136-1bdc-412f-ad78-0caad210fb40', label: 'Friendly Reading Man', group: 'Male — Narrator' },
  { value: 'f114a467-c40a-4db8-964d-aaba89cd08fa', label: 'Miles — Yogi (deep, soothing)', group: 'Male — Narrator' },
  // ── Other ──
  { value: 'fb26447f-308b-471e-8b00-8e9f04284eb5', label: 'Thistle — Troublemaker (neutral)', group: 'Other' },
  { value: '2ee87190-8f84-4925-97da-e52547f9462c', label: 'Child (young voice)', group: 'Other' },
  // ── Female — Professional ──
  { value: '248be419-c632-4f23-adf1-5324ed7dbf1d', label: 'Elizabeth — Manager (clear)', group: 'Female — Professional' },
  { value: 'c2ac25f9-ecc4-4f56-9095-651354df60c0', label: 'Renee — Commander (firm)', group: 'Female — Professional' },
  { value: '15a9cd88-84b0-4a8b-95f2-5d583b54c72e', label: 'Claire — Storyteller (soothing)', group: 'Female — Professional' },
  { value: '694f9389-aac1-45b6-b726-9d9369183238', label: 'Sarah — Mindful Woman (calming)', group: 'Female — Professional' },
  // ── Female — Casual ──
  { value: 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94', label: 'Caroline — Southern Guide (friendly)', group: 'Female — Casual' },
  { value: '21b81c14-f85b-436d-aff5-43f2e788ecf8', label: 'Riley — Chill Friend (casual)', group: 'Female — Casual' },
  { value: '00a77add-48d5-4ef6-8157-71e5437b282d', label: 'Callie — Encourager (smooth)', group: 'Female — Casual' },
  { value: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'British Lady (elegant)', group: 'Female — Casual' },
  { value: '156fb8d2-335b-4950-9cb3-a2d33befec77', label: 'Sunny — Pep Talker (upbeat)', group: 'Female — Casual' },
  { value: 'e3827ec5-697a-4b7c-9704-1a23041bbc51', label: 'Dottie — Sweet Gal (young)', group: 'Female — Casual' },
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
    voice_name: 'Hugo — Teatime Friend (British)',
    speed: 0.95,
    volume: 1.0,
    emotion: 'confident',
    sample_rate: 48000,
  },
};

interface UserVoiceOption {
  model: string;
  label: string;
  desc?: string;
  gender?: string;
}

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

  // User voice options curation state
  const [userVoiceOptions, setUserVoiceOptions] = useState<UserVoiceOption[]>([]);
  const [voiceOptionsSaving, setVoiceOptionsSaving] = useState(false);
  const [voiceOptionsSaved, setVoiceOptionsSaved] = useState(false);

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
        } else if (entry.key === 'voice.user_options') {
          setUserVoiceOptions(entry.value as unknown as UserVoiceOption[]);
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

  function toggleUserVoice(model: string, label: string) {
    setVoiceOptionsSaved(false);
    setUserVoiceOptions((prev) => {
      const exists = prev.some((v) => v.model === model);
      if (exists) {
        // Don't allow removing the last voice
        if (prev.length <= 1) return prev;
        return prev.filter((v) => v.model !== model);
      }
      // Max 5 voices
      if (prev.length >= 5) return prev;
      return [...prev, { model, label }];
    });
  }

  async function saveUserVoiceOptions() {
    setVoiceOptionsSaving(true);
    setVoiceOptionsSaved(false);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ key: 'voice.user_options', value: userVoiceOptions }],
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setVoiceOptionsSaved(true);
    } catch {
      setSaveError('Failed to save voice options');
    } finally {
      setVoiceOptionsSaving(false);
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
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// VOICE CONFIGURATION</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a mb-6">VOICE / TTS CONFIGURATION</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bezel rounded-lg border border-c-border p-6 animate-pulse">
              <div className="h-5 bg-c-bezel rounded w-48 mb-4" />
              <div className="h-32 bg-c-bezel rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// VOICE CONFIGURATION</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a mb-6">VOICE / TTS CONFIGURATION</h1>
        <div className="iframe rounded-lg p-6 text-center border-l-2 border-c-red">
          <p className="text-c-red mb-3">{error}</p>
          <button onClick={fetchConfig} className="font-mono text-xs text-c-red hover:text-c-text underline transition-colors">
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// VOICE CONFIGURATION</p>
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">VOICE / TTS CONFIGURATION</h1>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && <span className="font-mono text-[10px] text-c-green glow-g uppercase">SAVED</span>}
          {saveError && <span className="font-mono text-[10px] text-c-red">{saveError}</span>}
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-5 py-2.5 text-xs rounded-lg bg-c-amber text-c-bg font-mono font-semibold uppercase tracking-wide hover:bg-c-amber/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'SAVING...' : 'SAVE ALL CHANGES'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* ─── User Voice Options (curated by admin) ─── */}
        <section className="bezel rounded-lg border border-c-amber/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-1">// USER CURATION</p>
              <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">
                USER VOICE OPTIONS
              </h2>
              <p className="text-xs text-c-dim mt-0.5">
                Select up to 5 Deepgram voices that users can choose from in Settings. Minimum 1 required.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {voiceOptionsSaved && <span className="font-mono text-[10px] text-c-green glow-g uppercase">SAVED</span>}
              <button
                onClick={saveUserVoiceOptions}
                disabled={voiceOptionsSaving || userVoiceOptions.length === 0}
                className="px-4 py-2 text-xs rounded-lg bg-c-amber text-c-bg font-mono font-semibold uppercase tracking-wide hover:bg-c-amber/90 disabled:opacity-50 transition-colors"
              >
                {voiceOptionsSaving ? 'SAVING...' : 'SAVE VOICE OPTIONS'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DEEPGRAM_VOICES.map((voice) => {
              const isSelected = userVoiceOptions.some((v) => v.model === voice.value);
              return (
                <button
                  key={voice.value}
                  onClick={() => toggleUserVoice(voice.value, voice.label)}
                  className={`text-left iframe rounded-lg p-3 font-mono text-[10px] transition-colors ${
                    isSelected
                      ? 'border-l-2 border-c-amber ring-1 ring-c-amber/20 text-c-amber font-semibold'
                      : 'text-c-muted hover:border-c-border-hi'
                  }`}
                >
                  <span className="mr-2">{isSelected ? '\u2713' : '\u25CB'}</span>
                  {voice.label}
                </button>
              );
            })}
          </div>

          {userVoiceOptions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-c-border">
              <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1.5">CURRENTLY CURATED ({userVoiceOptions.length}/5)</p>
              <div className="flex flex-wrap gap-1.5">
                {userVoiceOptions.map((v) => (
                  <span key={v.model} className="font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20">
                    {v.label} <span className="text-c-dim">({v.model})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── Tier 1: Ground School (OpenAI) ─── */}
        <section className="bezel rounded-lg border border-c-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs text-c-muted glow-c tracking-[0.3em] uppercase mb-1">// FREE TIER</p>
              <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">
                TIER 1 &mdash; GROUND SCHOOL
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[10px] bg-c-cyan-lo text-c-cyan px-2 py-0.5 rounded border border-c-cyan/20">OPENAI TTS</span>
              </div>
            </div>
            <button
              onClick={() => testVoice('openai')}
              disabled={testing !== null}
              className="px-4 py-2 text-xs rounded-lg bg-c-bezel text-c-text font-mono font-semibold uppercase tracking-wide hover:bg-c-elevated disabled:opacity-50 transition-colors border border-c-border-hi"
            >
              {testing === 'openai' ? <><span>&#9632;</span> PLAYING...</> : <><span>&#9654;</span> TEST VOICE</>}
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
        <section className="bezel rounded-lg border border-c-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase mb-1">// STANDARD TIER</p>
              <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">
                TIER 2 &mdash; CHECKRIDE PREP
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[10px] bg-c-cyan-lo text-c-cyan px-2 py-0.5 rounded border border-c-cyan/20">DEEPGRAM AURA-2</span>
              </div>
            </div>
            <button
              onClick={() => testVoice('deepgram')}
              disabled={testing !== null}
              className="px-4 py-2 text-xs rounded-lg bg-c-bezel text-c-text font-mono font-semibold uppercase tracking-wide hover:bg-c-elevated disabled:opacity-50 transition-colors border border-c-border-hi"
            >
              {testing === 'deepgram' ? <><span>&#9632;</span> PLAYING...</> : <><span>&#9654;</span> TEST VOICE</>}
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
          <div className="iframe rounded-lg p-3 mt-3">
            <p className="font-mono text-[10px] text-c-dim">
              Deepgram Aura-2 does not support speed, pitch, or emotion controls. Prosody is handled automatically by the model.
            </p>
          </div>
        </section>

        {/* ─── Tier 3: DPE Live (Cartesia) ─── */}
        <section className="bezel rounded-lg border border-c-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs text-c-amber glow-a tracking-[0.3em] uppercase mb-1">// PREMIUM TIER</p>
              <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">
                TIER 3 &mdash; DPE LIVE
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[10px] bg-c-cyan-lo text-c-cyan px-2 py-0.5 rounded border border-c-cyan/20">CARTESIA SONIC 3</span>
              </div>
            </div>
            <button
              onClick={() => testVoice('cartesia')}
              disabled={testing !== null}
              className="px-4 py-2 text-xs rounded-lg bg-c-bezel text-c-text font-mono font-semibold uppercase tracking-wide hover:bg-c-elevated disabled:opacity-50 transition-colors border border-c-border-hi"
            >
              {testing === 'cartesia' ? <><span>&#9632;</span> PLAYING...</> : <><span>&#9654;</span> TEST VOICE</>}
            </button>
          </div>

          <div className="mb-4">
            <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1.5">VOICE</label>
            <select
              value={state.cartesia.voice_id}
              onChange={(e) => {
                const voice = CARTESIA_VOICES.find((v) => v.value === e.target.value);
                updateCartesia('voice_id', e.target.value);
                if (voice) updateCartesia('voice_name', voice.label);
              }}
              className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
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
            <div className="iframe rounded-lg p-2 mt-1.5">
              <p className="font-mono text-[10px] text-c-dim">
                ID: {state.cartesia.voice_id}
              </p>
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
        <section className="iframe rounded-lg p-4">
          <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1.5">TEST PHRASE</p>
          <p className="text-sm text-c-text/70 font-light leading-relaxed">&ldquo;{TEST_PHRASE}&rdquo;</p>
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
      <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
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
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div>
      <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="flex-1 accent-c-amber transition-colors"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-20 px-2 py-1.5 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text text-center focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
        />
      </div>
      <div className="mt-1.5">
        <div className="h-1.5 w-full bg-c-border rounded-full overflow-hidden">
          <div className="h-full rounded-full prog-a" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-c-dim mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
