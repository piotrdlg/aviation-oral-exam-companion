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
        <h1 className="text-2xl font-bold text-white mb-6">System Configuration</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-6 animate-pulse">
              <div className="h-5 bg-gray-800 rounded w-40 mb-4" />
              <div className="h-10 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">System Configuration</h1>
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
        <h1 className="text-2xl font-bold text-white">System Configuration</h1>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-green-400">Saved successfully</span>
          )}
          {saveError && (
            <span className="text-xs text-red-400">{saveError}</span>
          )}
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
        {/* Kill Switches — Providers */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Provider Kill Switches
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
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Tier Kill Switches
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
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Maintenance Mode
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
              <label className="block text-xs text-gray-500 mb-1.5">
                User-facing message
              </label>
              <input
                type="text"
                value={localState.maintenanceMode.message}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="We'll be back shortly..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {localState.maintenanceMode.enabled && (
            <div className="mt-3 bg-amber-900/10 border border-amber-800/30 rounded-lg p-3">
              <p className="text-xs text-amber-300">
                Maintenance mode is ACTIVE. Users will see the maintenance page instead of the app.
              </p>
            </div>
          )}
        </section>

        {/* Hard Caps */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Per-User Daily Hard Caps
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
          ? 'bg-red-900/10 border-red-800/40'
          : 'bg-gray-800/30 border-gray-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-200">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <ToggleSwitch enabled={enabled} onToggle={onToggle} label={label} danger />
      </div>
      {enabled && (
        <p className="text-xs text-red-400 mt-2">
          KILLED -- Service is disabled
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
        enabled
          ? danger
            ? 'bg-red-600 focus:ring-red-500'
            : 'bg-blue-600 focus:ring-blue-500'
          : 'bg-gray-700 focus:ring-gray-500'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
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
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full mt-2 accent-blue-500"
      />
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>{min.toLocaleString()}</span>
        <span>{value.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
