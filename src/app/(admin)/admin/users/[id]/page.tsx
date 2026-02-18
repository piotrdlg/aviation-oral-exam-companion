'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import type { VoiceTier, AccountStatus } from '@/types/database';

interface UserDetail {
  id: string;
  email: string;
  tier: VoiceTier;
  account_status: AccountStatus;
  subscription_status: string;
  status_reason: string | null;
  auth_method: string | null;
  last_login_at: string | null;
  created_at: string;
  stripe_customer_id: string | null;
}

interface UserSession {
  id: string;
  rating: string;
  status: string;
  exchange_count: number;
  started_at: string;
  ended_at: string | null;
  study_mode: string;
  acs_tasks_covered: { task_id: string; status: string; attempts?: number }[];
}

interface UserScore {
  element_code: string;
  task_id: string;
  area: string;
  total_attempts: number;
  satisfactory_count: number;
  partial_count: number;
  unsatisfactory_count: number;
  latest_score: string | null;
}

interface UsageEntry {
  date: string;
  llm_requests: number;
  tts_requests: number;
  stt_sessions: number;
  total_tokens: number;
}

interface AdminNoteEntry {
  id: string;
  admin_email: string;
  note: string;
  created_at: string;
}

interface UserDetailResponse {
  user: UserDetail;
  sessions: UserSession[];
  scores: UserScore[];
  usage: UsageEntry[];
  notes: AdminNoteEntry[];
}

type Tab = 'overview' | 'sessions' | 'scores' | 'usage' | 'notes';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'scores', label: 'Scores' },
  { value: 'usage', label: 'Usage' },
  { value: 'notes', label: 'Notes' },
];

const TIER_LABELS: Record<VoiceTier, string> = {
  ground_school: 'Ground School',
  checkride_prep: 'Checkride Prep',
  dpe_live: 'DPE Live',
};

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchUser() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }

  async function performAction(action: string, extra: Record<string, unknown> = {}) {
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Refresh user data
      await fetchUser();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', note: noteText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setNoteText('');
      await fetchUser();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Link href="/admin/users" className="font-mono text-xs text-c-muted hover:text-c-amber transition-colors inline-flex items-center gap-1.5 mb-6">
          &#9664; BACK TO USERS
        </Link>
        <div className="bezel rounded-lg border border-c-border p-8 animate-pulse">
          <div className="h-6 bg-c-bezel rounded w-48 mb-4" />
          <div className="h-4 bg-c-bezel rounded w-32" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/admin/users" className="font-mono text-xs text-c-muted hover:text-c-amber transition-colors inline-flex items-center gap-1.5 mb-6">
          &#9664; BACK TO USERS
        </Link>
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-6 text-center">
          <p className="text-c-red mb-3">{error || 'User not found'}</p>
          <button onClick={fetchUser} className="font-mono text-xs text-c-red hover:text-c-text uppercase transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { user, sessions, scores, usage, notes } = data;

  return (
    <div>
      {/* Back button */}
      <Link href="/admin/users" className="font-mono text-xs text-c-muted hover:text-c-amber transition-colors inline-flex items-center gap-1.5 mb-6">
        &#9664; BACK TO USERS
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// USER DETAIL</p>
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">{user.email.split('@')[0]}</h1>
          <p className="text-c-cyan font-mono text-xs mt-1">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <TierBadge tier={user.tier} />
            <AccountStatusBadge status={user.account_status} />
            {user.subscription_status && user.subscription_status !== 'none' && (
              <span className="font-mono text-[10px] bg-c-elevated text-c-muted px-2 py-0.5 rounded border border-c-border uppercase">
                Sub: {user.subscription_status}
              </span>
            )}
          </div>
          {user.status_reason && (
            <p className="font-mono text-[10px] text-c-dim mt-1">Reason: {user.status_reason}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {user.account_status === 'active' && (
            <>
              <button
                onClick={() => performAction('suspend')}
                disabled={actionLoading}
                className="px-4 py-2 text-xs rounded-lg bg-c-amber-lo text-c-amber hover:bg-c-amber hover:text-c-bg font-mono font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                Suspend
              </button>
              <button
                onClick={() => performAction('ban')}
                disabled={actionLoading}
                className="px-4 py-2 text-xs rounded-lg bg-c-red/80 hover:bg-c-red text-c-text font-mono font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                Ban
              </button>
            </>
          )}
          {user.account_status === 'suspended' && (
            <>
              <button
                onClick={() => performAction('activate')}
                disabled={actionLoading}
                className="px-4 py-2 text-xs rounded-lg bg-c-green-lo text-c-green hover:bg-c-green hover:text-c-bg font-mono font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                Activate
              </button>
              <button
                onClick={() => performAction('ban')}
                disabled={actionLoading}
                className="px-4 py-2 text-xs rounded-lg bg-c-red/80 hover:bg-c-red text-c-text font-mono font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                Ban
              </button>
            </>
          )}
          {user.account_status === 'banned' && (
            <button
              onClick={() => performAction('activate')}
              disabled={actionLoading}
              className="px-4 py-2 text-xs rounded-lg bg-c-green-lo text-c-green hover:bg-c-green hover:text-c-bg font-mono font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
            >
              Activate
            </button>
          )}
          <TierDropdown
            currentTier={user.tier}
            disabled={actionLoading}
            onChange={(tier) => performAction('change_tier', { tier })}
          />
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-3 mb-4 text-c-red text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-c-red hover:text-c-text ml-3 transition-colors">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-c-border mb-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 font-mono text-xs uppercase border-b-2 transition-colors ${
                activeTab === tab.value
                  ? 'border-c-amber text-c-amber font-semibold'
                  : 'border-transparent text-c-muted hover:text-c-text'
              }`}
            >
              {tab.label}
              {tab.value === 'notes' && notes.length > 0 && (
                <span className="ml-1.5 font-mono text-[10px] bg-c-amber-lo text-c-amber px-1.5 py-0.5 rounded border border-c-amber/20">
                  {notes.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab user={user} sessions={sessions} scores={scores} />
      )}
      {activeTab === 'sessions' && <SessionsTab sessions={sessions} />}
      {activeTab === 'scores' && <ScoresTab scores={scores} />}
      {activeTab === 'usage' && <UsageTab usage={usage} />}
      {activeTab === 'notes' && (
        <NotesTab
          notes={notes}
          noteText={noteText}
          setNoteText={setNoteText}
          onSubmit={addNote}
          submitting={noteSubmitting}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: VoiceTier }) {
  const styles: Record<VoiceTier, string> = {
    ground_school: 'bg-c-elevated text-c-muted border-c-border',
    checkride_prep: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    dpe_live: 'bg-c-green-lo text-c-green border-c-green/20',
  };
  const glow = tier === 'dpe_live' ? ' glow-g' : '';
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase${glow} ${styles[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const styles: Record<AccountStatus, string> = {
    active: 'bg-c-green-lo text-c-green border-c-green/20',
    suspended: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    banned: 'bg-c-red-dim text-c-red border-c-red/20',
  };
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function TierDropdown({
  currentTier,
  disabled,
  onChange,
}: {
  currentTier: VoiceTier;
  disabled: boolean;
  onChange: (tier: VoiceTier) => void;
}) {
  return (
    <select
      value={currentTier}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as VoiceTier)}
      className="px-3 py-2 text-xs rounded-lg bg-c-panel text-c-text border border-c-border focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber font-mono uppercase disabled:opacity-50 transition-colors"
    >
      <option value="ground_school">Ground School</option>
      <option value="checkride_prep">Checkride Prep</option>
      <option value="dpe_live">DPE Live</option>
    </select>
  );
}

function OverviewTab({
  user,
  sessions,
  scores,
}: {
  user: UserDetail;
  sessions: UserSession[];
  scores: UserScore[];
}) {
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const totalExchanges = sessions.reduce((sum, s) => sum + (s.exchange_count || 0), 0);
  const totalAttempts = scores.reduce((sum, s) => sum + s.total_attempts, 0);
  const satRate =
    totalAttempts > 0
      ? (
          (scores.reduce((sum, s) => sum + s.satisfactory_count, 0) / totalAttempts) *
          100
        ).toFixed(1)
      : '0';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Account Info */}
      <div className="bezel rounded-lg border border-c-border p-5">
        <h3 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-4">
          Account Info
        </h3>
        <dl className="space-y-3">
          <InfoRow label="User ID" value={user.id} mono />
          <InfoRow label="Email" value={user.email} mono />
          <InfoRow label="Auth Method" value={user.auth_method || 'password'} />
          <InfoRow
            label="Tier"
            value={TIER_LABELS[user.tier]}
            badge={<TierBadge tier={user.tier} />}
          />
          <InfoRow
            label="Joined"
            value={new Date(user.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
          <InfoRow
            label="Last Login"
            value={
              user.last_login_at
                ? new Date(user.last_login_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'Never'
            }
          />
          {user.stripe_customer_id && (
            <InfoRow label="Stripe Customer" value={user.stripe_customer_id} mono />
          )}
        </dl>
      </div>

      {/* Quick Stats */}
      <div className="bezel rounded-lg border border-c-border p-5">
        <h3 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-4">
          Quick Stats
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <StatBox label="Total Sessions" value={totalSessions.toString()} />
          <StatBox label="Completed" value={completedSessions.toString()} />
          <StatBox label="Total Exchanges" value={totalExchanges.toString()} />
          <StatBox label="Sat. Rate" value={`${satRate}%`} highlight={parseFloat(satRate) >= 70} />
          <StatBox label="Elements Attempted" value={scores.filter((s) => s.total_attempts > 0).length.toString()} />
          <StatBox label="Total Attempts" value={totalAttempts.toString()} />
        </div>
      </div>
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: UserSession[] }) {
  if (sessions.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-8 text-center">
        <p className="text-c-dim font-mono text-xs">No sessions found for this user</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const duration =
          session.ended_at && session.started_at
            ? Math.round(
                (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) /
                  60000
              )
            : null;
        return (
          <div key={session.id} className="iframe rounded-lg p-3 flex items-center justify-between hover:bg-c-elevated/30 transition-colors">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-c-green font-mono text-xs font-semibold uppercase">{session.rating}</span>
                  <span className="font-mono text-[10px] text-c-dim">&middot;</span>
                  <span className="font-mono text-[10px] text-c-muted uppercase">{session.study_mode}</span>
                </div>
                <p className="font-mono text-[10px] text-c-dim mt-0.5">
                  {new Date(session.started_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {' '}&middot;{' '}
                  {session.exchange_count} exchange{session.exchange_count !== 1 ? 's' : ''}
                  {duration !== null && <>{' '}&middot;{' '}{duration} min</>}
                  {' '}&middot;{' '}
                  {session.acs_tasks_covered?.length || 0} task{(session.acs_tasks_covered?.length || 0) !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <SessionStatusBadge status={session.status} />
          </div>
        );
      })}
    </div>
  );
}

function ScoresTab({ scores }: { scores: UserScore[] }) {
  if (scores.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-8 text-center">
        <p className="text-c-dim font-mono text-xs">No element scores recorded yet</p>
      </div>
    );
  }

  // Group by area
  const areas = new Map<string, UserScore[]>();
  for (const score of scores) {
    const existing = areas.get(score.area) || [];
    existing.push(score);
    areas.set(score.area, existing);
  }

  return (
    <div className="space-y-4">
      {Array.from(areas.entries()).map(([area, areaScores]) => (
        <div key={area} className="bezel rounded-lg border border-c-border overflow-hidden">
          <div className="px-4 py-3 border-b border-c-border bg-c-panel">
            <h3 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">{area}</h3>
          </div>
          <div className="space-y-1 p-3">
            {areaScores
              .filter((s) => s.total_attempts > 0)
              .sort((a, b) => a.element_code.localeCompare(b.element_code))
              .map((score) => {
                const satPct = score.total_attempts > 0
                  ? (score.satisfactory_count / score.total_attempts) * 100
                  : 0;
                const partialPct = score.total_attempts > 0
                  ? (score.partial_count / score.total_attempts) * 100
                  : 0;
                const unsatPct = score.total_attempts > 0
                  ? (score.unsatisfactory_count / score.total_attempts) * 100
                  : 0;
                return (
                  <div key={score.element_code} className="iframe rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-c-dim">{score.element_code}</span>
                        <span className="font-mono text-[10px] text-c-muted">{score.total_attempts} attempt{score.total_attempts !== 1 ? 's' : ''}</span>
                      </div>
                      <ScoreBadge score={score.latest_score} />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-c-green">SAT</span>
                          <span className="font-mono text-[10px] text-c-green tabular-nums">{score.satisfactory_count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full prog-g" style={{ width: `${satPct}%` }} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-c-amber">PARTIAL</span>
                          <span className="font-mono text-[10px] text-c-amber tabular-nums">{score.partial_count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full prog-a" style={{ width: `${partialPct}%` }} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-c-red">UNSAT</span>
                          <span className="font-mono text-[10px] text-c-red tabular-nums">{score.unsatisfactory_count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full prog-r" style={{ width: `${unsatPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function UsageTab({ usage }: { usage: UsageEntry[] }) {
  if (usage.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-8 text-center">
        <p className="text-c-dim font-mono text-xs">No usage data available</p>
      </div>
    );
  }

  // Compute totals for summary cards
  const totals = usage.reduce(
    (acc, e) => ({
      llm: acc.llm + e.llm_requests,
      tts: acc.tts + e.tts_requests,
      stt: acc.stt + e.stt_sessions,
      tokens: acc.tokens + e.total_tokens,
    }),
    { llm: 0, tts: 0, stt: 0, tokens: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="iframe rounded-lg p-4 text-center">
          <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1">LLM Requests</p>
          <p className="font-mono text-lg font-bold text-c-text tabular-nums">{totals.llm.toLocaleString()}</p>
        </div>
        <div className="iframe rounded-lg p-4 text-center">
          <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1">TTS Requests</p>
          <p className="font-mono text-lg font-bold text-c-text tabular-nums">{totals.tts.toLocaleString()}</p>
        </div>
        <div className="iframe rounded-lg p-4 text-center">
          <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1">STT Sessions</p>
          <p className="font-mono text-lg font-bold text-c-text tabular-nums">{totals.stt.toLocaleString()}</p>
        </div>
        <div className="iframe rounded-lg p-4 text-center">
          <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1">Total Tokens</p>
          <p className="font-mono text-lg font-bold text-c-text tabular-nums">{totals.tokens.toLocaleString()}</p>
        </div>
      </div>

      {/* Daily breakdown table */}
      <div className="bezel rounded-lg border border-c-border overflow-hidden">
        <div className="px-4 py-3 border-b border-c-border bg-c-panel">
          <h3 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">Daily Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-c-panel border-b border-c-border text-left">
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">LLM Requests</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">TTS Requests</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">STT Sessions</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Total Tokens</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((entry) => (
              <tr key={entry.date} className="hover:bg-c-elevated/50 transition-colors border-b border-c-border">
                <td className="px-4 py-3 font-mono text-xs text-c-text">{entry.date}</td>
                <td className="px-4 py-3 font-mono text-xs text-c-text tabular-nums">{entry.llm_requests.toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-c-text tabular-nums">{entry.tts_requests.toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-c-text tabular-nums">{entry.stt_sessions.toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-c-text tabular-nums">{entry.total_tokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotesTab({
  notes,
  noteText,
  setNoteText,
  onSubmit,
  submitting,
}: {
  notes: AdminNoteEntry[];
  noteText: string;
  setNoteText: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Add Note Form */}
      <div className="bezel rounded-lg border border-c-border p-4">
        <h3 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider mb-3">Add Note</h3>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write an admin note about this user..."
          rows={3}
          className="fb-textarea w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs placeholder-c-dim focus:outline-none focus:border-c-amber resize-none transition-colors"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={onSubmit}
            disabled={!noteText.trim() || submitting}
            className="px-5 py-2.5 rounded-lg bg-c-amber hover:bg-c-amber/90 text-c-bg font-mono font-semibold text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:hover:bg-c-amber"
          >
            {submitting ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="bezel rounded-lg border border-c-border p-6 text-center">
          <p className="text-c-dim font-mono text-xs">No admin notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="iframe rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] text-c-muted uppercase">{note.admin_email}</span>
                <span className="font-mono text-[10px] text-c-dim">
                  {new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-c-text leading-relaxed whitespace-pre-wrap">{note.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI helpers ───────────────────────────────────────────────────

function InfoRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center iframe rounded-lg p-3">
      <dt className="font-mono text-[10px] text-c-muted uppercase tracking-wider">{label}</dt>
      <dd>{badge || <span className={`font-mono text-xs text-c-text ${mono ? '' : ''}`}>{value}</span>}</dd>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="iframe rounded-lg p-3 text-center">
      <p className={`font-mono text-lg font-bold tabular-nums ${highlight ? 'text-c-green glow-g' : 'text-c-text'}`}>{value}</p>
      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-c-cyan-lo text-c-cyan border-c-cyan/20',
    completed: 'bg-c-green-lo text-c-green border-c-green/20',
    paused: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    abandoned: 'bg-c-elevated text-c-muted border-c-border',
    errored: 'bg-c-red-dim text-c-red border-c-red/20',
  };

  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${styles[status] || 'bg-c-elevated text-c-muted border-c-border'}`}>
      {status}
    </span>
  );
}

function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return <span className="font-mono text-[10px] text-c-dim">--</span>;
  const styles: Record<string, string> = {
    satisfactory: 'bg-c-green-lo text-c-green border-c-green/20',
    partial: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    unsatisfactory: 'bg-c-red-dim text-c-red border-c-red/20',
  };
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${styles[score] || 'bg-c-elevated text-c-muted border-c-border'}`}>
      {score}
    </span>
  );
}
