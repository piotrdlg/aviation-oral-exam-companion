'use client';

import { useEffect, useState, useCallback } from 'react';
import type { KillSwitchValue, MaintenanceModeValue, UserHardCapsValue } from '@/types/database';

interface ConfigEntry {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
}

interface ConfigState {
  killSwitches: Record<string, KillSwitchValue>;
  maintenanceMode: MaintenanceModeValue;
  userHardCaps: UserHardCapsValue;
}

const KILL_SWITCH_GROUPS = {
  providers: [
    { key: 'kill_switch.anthropic', label: 'Anthropic (Claude)', description: 'Disables all LLM API calls' },
    { key: 'kill_switch.openai', label: 'OpenAI', description: 'Disables TTS and legacy STT' },
    { key: 'kill_switch.deepgram', label: 'Deepgram', description: 'Disables Deepgram STT' },
    { key: 'kill_switch.cartesia', label: 'Cartesia', description: 'Disables Cartesia TTS' },
  ],
  tiers: [
    { key: 'kill_switch.tier.ground_school', label: 'Ground School', description: 'Free tier' },
    { key: 'kill_switch.tier.checkride_prep', label: 'Checkride Prep', description: 'Mid tier' },
    { key: 'kill_switch.tier.dpe_live', label: 'DPE Live', description: 'Premium tier' },
  ],
};

const DEFAULT_HARD_CAPS: UserHardCapsValue = {
  daily_llm_tokens: 100000,
  daily_tts_chars: 50000,
  daily_stt_seconds: 3600,
};

export default function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local state for editable values
  const [localState, setLocalState] = useState<ConfigState>({
    killSwitches: {},
    maintenanceMode: { enabled: false, message: '' },
    userHardCaps: { ...DEFAULT_HARD_CAPS },
  });

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
      const entries: ConfigEntry[] = data.configs || [];
      setConfigs(entries);

      // Parse into structured state
      const ks: Record<string, KillSwitchValue> = {};
      let mm: MaintenanceModeValue = { enabled: false, message: '' };
      let hc: UserHardCapsValue = { ...DEFAULT_HARD_CAPS };

      for (const entry of entries) {
        if (entry.key.startsWith('kill_switch.')) {
          ks[entry.key] = entry.value as unknown as KillSwitchValue;
        } else if (entry.key === 'maintenance_mode') {
          mm = entry.value as unknown as MaintenanceModeValue;
        } else if (entry.key === 'user_hard_caps') {
          hc = entry.value as unknown as UserHardCapsValue;
        }
      }

      setLocalState({ killSwitches: ks, maintenanceMode: mm, userHardCaps: hc });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  function toggleKillSwitch(key: string) {
    setLocalState((prev) => ({
      ...prev,
      killSwitches: {
        ...prev.killSwitches,
        [key]: {
          enabled: !(prev.killSwitches[key]?.enabled ?? false),
        },
      },
    }));
    setSaveSuccess(false);
  }

  function toggleMaintenance() {
    setLocalState((prev) => ({
      ...prev,
      maintenanceMode: {
        ...prev.maintenanceMode,
        enabled: !prev.maintenanceMode.enabled,
      },
    }));
    setSaveSuccess(false);
  }

  function setMaintenanceMessage(message: string) {
    setLocalState((prev) => ({
      ...prev,
      maintenanceMode: {
        ...prev.maintenanceMode,
        message,
      },
    }));
    setSaveSuccess(false);
  }

  function setHardCap(field: keyof UserHardCapsValue, value: number) {
    setLocalState((prev) => ({
      ...prev,
      userHardCaps: {
        ...prev.userHardCaps,
        [field]: value,
      },
    }));
    setSaveSuccess(false);
  }

  async function saveAll() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Build updates from local state
      const updates: { key: string; value: Record<string, unknown> }[] = [];

      // Kill switches
      for (const [key, val] of Object.entries(localState.killSwitches)) {
        updates.push({ key, value: val as unknown as Record<string, unknown> });
      }

      // Maintenance mode
      updates.push({
        key: 'maintenance_mode',
        value: localState.maintenanceMode as unknown as Record<string, unknown>,
      });

      // Hard caps
      updates.push({
        key: 'user_hard_caps',
        value: localState.userHardCaps as unknown as Record<string, unknown>,
      });

      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      setSaveSuccess(true);
      // Refresh from server
      await fetchConfig();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// SYSTEM CONFIGURATION</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a mb-6">SYSTEM CONFIGURATION</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bezel rounded-lg border border-c-border p-6 animate-pulse">
              <div className="h-5 bg-c-bezel rounded w-40 mb-4" />
              <div className="h-10 bg-c-bezel rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// SYSTEM CONFIGURATION</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a mb-6">SYSTEM CONFIGURATION</h1>
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-6 text-center">
          <p className="text-c-red font-mono text-sm mb-3">{error}</p>
          <button onClick={fetchConfig} className="font-mono text-[10px] text-c-red hover:text-c-red/80 underline transition-colors">
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
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// SYSTEM CONFIGURATION</p>
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">SYSTEM CONFIGURATION</h1>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-c-green glow-g font-mono text-[10px] uppercase tracking-wider">&#10003; SAVED SUCCESSFULLY</span>
          )}
          {saveError && (
            <span className="text-c-red font-mono text-[10px]">{saveError}</span>
          )}
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-5 py-2.5 text-xs rounded-lg bg-c-amber hover:bg-c-amber/90 text-c-bg font-mono font-semibold uppercase tracking-wide disabled:opacity-50 transition-colors"
          >
            {saving ? 'SAVING...' : 'SAVE ALL CHANGES'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Kill Switches — Providers */}
        <section className="bezel rounded-lg border border-c-border p-6">
          <p className="font-mono text-xs text-c-red tracking-[0.3em] uppercase mb-1">// KILL SWITCHES</p>
          <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-4">
            PROVIDER KILL SWITCHES
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {KILL_SWITCH_GROUPS.providers.map((ks) => (
              <KillSwitchCard
                key={ks.key}
                label={ks.label}
                description={ks.description}
                enabled={localState.killSwitches[ks.key]?.enabled ?? false}
                onToggle={() => toggleKillSwitch(ks.key)}
              />
            ))}
          </div>
        </section>

        {/* Kill Switches — Tiers */}
        <section className="bezel rounded-lg border border-c-border p-6">
          <p className="font-mono text-xs text-c-red tracking-[0.3em] uppercase mb-1">// KILL SWITCHES</p>
          <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-4">
            TIER KILL SWITCHES
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {KILL_SWITCH_GROUPS.tiers.map((ks) => (
              <KillSwitchCard
                key={ks.key}
                label={ks.label}
                description={ks.description}
                enabled={localState.killSwitches[ks.key]?.enabled ?? false}
                onToggle={() => toggleKillSwitch(ks.key)}
              />
            ))}
          </div>
        </section>

        {/* Maintenance Mode */}
        <section className={`bezel rounded-lg border border-c-border p-6 ${
          localState.maintenanceMode.enabled ? 'border-l-2 border-l-c-amber bg-c-amber-lo/20' : ''
        }`}>
          <p className="font-mono text-xs text-c-amber tracking-[0.3em] uppercase mb-1">// MAINTENANCE</p>
          <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-4">
            MAINTENANCE MODE
          </h2>
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <ToggleSwitch
                enabled={localState.maintenanceMode.enabled}
                onToggle={toggleMaintenance}
                label="Maintenance mode"
              />
            </div>
            <div className="flex-1">
              <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1.5">
                USER-FACING MESSAGE
              </label>
              <input
                type="text"
                value={localState.maintenanceMode.message}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="We'll be back shortly..."
                className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
              />
            </div>
          </div>
          {localState.maintenanceMode.enabled && (
            <div className="mt-3 iframe rounded-lg p-3 border-l-2 border-c-amber">
              <p className="text-c-amber font-mono text-xs">
                &#9888; MAINTENANCE MODE IS ACTIVE — Users will see the maintenance page instead of the app.
              </p>
            </div>
          )}
        </section>

        {/* Hard Caps */}
        <section className="bezel rounded-lg border border-c-border p-6">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-1">// HARD CAPS</p>
          <h2 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-4">
            PER-USER DAILY HARD CAPS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HardCapInput
              label="Daily LLM Tokens"
              value={localState.userHardCaps.daily_llm_tokens}
              onChange={(v) => setHardCap('daily_llm_tokens', v)}
              min={1000}
              max={1000000}
              step={1000}
            />
            <HardCapInput
              label="Daily TTS Characters"
              value={localState.userHardCaps.daily_tts_chars}
              onChange={(v) => setHardCap('daily_tts_chars', v)}
              min={1000}
              max={500000}
              step={1000}
            />
            <HardCapInput
              label="Daily STT Seconds"
              value={localState.userHardCaps.daily_stt_seconds}
              onChange={(v) => setHardCap('daily_stt_seconds', v)}
              min={60}
              max={36000}
              step={60}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function KillSwitchCard({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        enabled
          ? 'border-l-2 border-c-red bg-c-red-dim/20'
          : 'border-l-2 border-c-green bg-c-green-lo/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs font-semibold text-c-text uppercase tracking-wider">{label}</p>
          <p className="font-mono text-[10px] text-c-dim mt-0.5">{description}</p>
        </div>
        <ToggleSwitch enabled={enabled} onToggle={onToggle} label={label} danger />
      </div>
      <div className="mt-2">
        {enabled ? (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-c-red-dim/40 text-c-red border border-c-red/20">
            KILLED
          </span>
        ) : (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-c-green-lo text-c-green border border-c-green/20">
            ACTIVE
          </span>
        )}
      </div>
      {enabled && (
        <p className="text-c-red glow-a font-mono text-[10px] mt-1.5 uppercase tracking-wider">
          &#9888; SERVICE DISABLED
        </p>
      )}
    </div>
  );
}

function ToggleSwitch({
  enabled,
  onToggle,
  label,
  danger,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-c-panel ${
        enabled
          ? danger
            ? 'bg-c-red focus:ring-c-red'
            : 'bg-c-amber focus:ring-c-amber'
          : 'bg-c-elevated focus:ring-c-dim'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-c-text transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function HardCapInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  const pct = Math.min(((value - min) / (max - min)) * 100, 100);
  const progClass = pct >= 90 ? 'prog-r' : pct >= 70 ? 'prog-a' : 'prog-g';

  return (
    <div className="iframe rounded-lg p-4">
      <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-2">{label}</label>
      <p className="font-mono font-bold text-c-amber glow-a text-lg mb-3">{value.toLocaleString()}</p>
      <div className="h-1.5 w-full bg-c-border rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full ${progClass}`} style={{ width: `${pct}%` }} />
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
      />
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full mt-2 accent-c-amber"
      />
      <div className="flex justify-between font-mono text-[10px] text-c-dim mt-0.5">
        <span>{min.toLocaleString()}</span>
        <span className="text-c-muted">{value.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
