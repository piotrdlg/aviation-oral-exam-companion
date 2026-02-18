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

const TIER_COLORS: Record<VoiceTier, string> = {
  ground_school: 'bg-c-elevated text-c-text',
  checkride_prep: 'bg-c-cyan/20 text-c-cyan',
  dpe_live: 'bg-purple-900/40 text-purple-300',
};

const STATUS_COLORS: Record<AccountStatus, string> = {
  active: 'bg-green-900/30 text-c-green',
  suspended: 'bg-yellow-900/30 text-c-amber',
  banned: 'bg-red-900/30 text-c-red',
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
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin/users" className="text-c-dim hover:text-c-text text-sm">
            Users
          </Link>
          <span className="text-c-dim">/</span>
          <span className="text-c-muted text-sm">Loading...</span>
        </div>
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
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin/users" className="text-c-dim hover:text-c-text text-sm">
            Users
          </Link>
          <span className="text-c-dim">/</span>
          <span className="text-c-muted text-sm">Error</span>
        </div>
        <div className="bg-c-red-dim/40 border border-red-800/50 rounded-lg p-6 text-center">
          <p className="text-red-300 mb-3">{error || 'User not found'}</p>
          <button onClick={fetchUser} className="text-sm text-c-red hover:text-red-300 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { user, sessions, scores, usage, notes } = data;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/users" className="text-c-dim hover:text-c-text text-sm">
          Users
        </Link>
        <span className="text-c-dim">/</span>
        <span className="text-c-text text-sm">{user.email}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-c-text font-mono uppercase tracking-wider">{user.email}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[user.tier]}`}>
              {TIER_LABELS[user.tier]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[user.account_status]}`}>
              {user.account_status}
            </span>
            {user.subscription_status && user.subscription_status !== 'none' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-c-bezel text-c-text">
                Sub: {user.subscription_status}
              </span>
            )}
          </div>
          {user.status_reason && (
            <p className="text-xs text-c-dim mt-1">Reason: {user.status_reason}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {user.account_status === 'active' && (
            <>
              <button
                onClick={() => performAction('suspend')}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-md bg-yellow-900/30 text-c-amber hover:bg-yellow-900/50 font-mono uppercase transition-colors disabled:opacity-50"
              >
                Suspend
              </button>
              <button
                onClick={() => performAction('ban')}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-md bg-red-900/30 text-c-red hover:bg-red-900/50 font-mono uppercase transition-colors disabled:opacity-50"
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
                className="px-3 py-1.5 text-xs rounded-md bg-green-900/30 text-c-green hover:bg-green-900/50 font-mono uppercase transition-colors disabled:opacity-50"
              >
                Activate
              </button>
              <button
                onClick={() => performAction('ban')}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-md bg-red-900/30 text-c-red hover:bg-red-900/50 font-mono uppercase transition-colors disabled:opacity-50"
              >
                Ban
              </button>
            </>
          )}
          {user.account_status === 'banned' && (
            <button
              onClick={() => performAction('activate')}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-green-900/30 text-c-green hover:bg-green-900/50 font-mono uppercase transition-colors disabled:opacity-50"
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
        <div className="bg-c-red-dim/40 border border-red-800/50 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-c-red hover:text-red-300 ml-3">
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
              className={`px-4 py-2.5 text-sm font-mono uppercase border-b-2 transition-colors ${
                activeTab === tab.value
                  ? 'border-c-amber text-c-text'
                  : 'border-transparent text-c-dim hover:text-c-text'
              }`}
            >
              {tab.label}
              {tab.value === 'notes' && notes.length > 0 && (
                <span className="ml-1.5 text-xs bg-c-bezel px-1.5 py-0.5 rounded-full">
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
      className="px-3 py-1.5 text-xs rounded-md bg-c-bezel text-c-text border border-c-border-hi focus:outline-none focus:ring-2 focus:ring-c-amber font-mono uppercase disabled:opacity-50"
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
        <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-4">
          Account Info
        </h3>
        <dl className="space-y-3">
          <InfoRow label="User ID" value={user.id} mono />
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Auth Method" value={user.auth_method || 'password'} />
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
        <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-4">
          Quick Stats
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <StatBox label="Total Sessions" value={totalSessions.toString()} />
          <StatBox label="Completed" value={completedSessions.toString()} />
          <StatBox label="Total Exchanges" value={totalExchanges.toString()} />
          <StatBox label="Sat. Rate" value={`${satRate}%`} />
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
        <p className="text-c-dim">No sessions found for this user</p>
      </div>
    );
  }

  return (
    <div className="bezel rounded-lg border border-c-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-c-border text-left">
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Rating</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Mode</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Exchanges</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Tasks</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-c-border">
          {sessions.map((session) => {
            const duration =
              session.ended_at && session.started_at
                ? Math.round(
                    (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) /
                      60000
                  )
                : null;
            return (
              <tr key={session.id} className="hover:bg-c-bezel/50 transition-colors">
                <td className="px-4 py-3 text-c-text text-xs">
                  {new Date(session.started_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-c-bezel text-c-text uppercase font-mono">
                    {session.rating}
                  </span>
                </td>
                <td className="px-4 py-3 text-c-muted text-xs">{session.study_mode}</td>
                <td className="px-4 py-3 text-c-text">{session.exchange_count}</td>
                <td className="px-4 py-3 text-c-text">{session.acs_tasks_covered?.length || 0}</td>
                <td className="px-4 py-3">
                  <SessionStatusBadge status={session.status} />
                </td>
                <td className="px-4 py-3 text-c-dim text-xs">
                  {duration !== null ? `${duration} min` : '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoresTab({ scores }: { scores: UserScore[] }) {
  if (scores.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-8 text-center">
        <p className="text-c-dim">No element scores recorded yet</p>
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
          <div className="px-4 py-3 border-b border-c-border bg-c-bezel/30">
            <h3 className="text-sm font-medium text-c-text font-mono uppercase tracking-wider">{area}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-c-border text-left">
                <th className="px-4 py-2 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Element</th>
                <th className="px-4 py-2 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Attempts</th>
                <th className="px-4 py-2 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Sat</th>
                <th className="px-4 py-2 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Partial</th>
                <th className="px-4 py-2 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Unsat</th>
                <th className="px-4 py-2 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Latest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-c-border/50">
              {areaScores
                .filter((s) => s.total_attempts > 0)
                .sort((a, b) => a.element_code.localeCompare(b.element_code))
                .map((score) => (
                  <tr key={score.element_code}>
                    <td className="px-4 py-2 text-c-text font-mono text-xs">
                      {score.element_code}
                    </td>
                    <td className="px-4 py-2 text-c-muted">{score.total_attempts}</td>
                    <td className="px-4 py-2 text-c-green">{score.satisfactory_count}</td>
                    <td className="px-4 py-2 text-c-amber">{score.partial_count}</td>
                    <td className="px-4 py-2 text-c-red">{score.unsatisfactory_count}</td>
                    <td className="px-4 py-2">
                      <ScoreBadge score={score.latest_score} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function UsageTab({ usage }: { usage: UsageEntry[] }) {
  if (usage.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-8 text-center">
        <p className="text-c-dim">No usage data available</p>
      </div>
    );
  }

  return (
    <div className="bezel rounded-lg border border-c-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-c-border text-left">
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">LLM Requests</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">TTS Requests</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">STT Sessions</th>
            <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-dim uppercase tracking-wider">Total Tokens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-c-border">
          {usage.map((entry) => (
            <tr key={entry.date} className="hover:bg-c-bezel/50 transition-colors">
              <td className="px-4 py-3 text-c-text text-xs">{entry.date}</td>
              <td className="px-4 py-3 text-c-text">{entry.llm_requests.toLocaleString()}</td>
              <td className="px-4 py-3 text-c-text">{entry.tts_requests.toLocaleString()}</td>
              <td className="px-4 py-3 text-c-text">{entry.stt_sessions.toLocaleString()}</td>
              <td className="px-4 py-3 text-c-text">{entry.total_tokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">Add Note</h3>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write an admin note about this user..."
          rows={3}
          className="w-full px-3 py-2 bg-c-bezel border border-c-border-hi rounded-lg text-sm text-c-text placeholder-c-dim focus:outline-none focus:ring-2 focus:ring-c-amber resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={onSubmit}
            disabled={!noteText.trim() || submitting}
            className="px-4 py-1.5 text-sm rounded-md bg-c-amber text-c-text hover:bg-c-amber/90 font-mono uppercase disabled:opacity-50 disabled:hover:bg-c-amber transition-colors"
          >
            {submitting ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="bezel rounded-lg border border-c-border p-6 text-center">
          <p className="text-c-dim text-sm">No admin notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bezel rounded-lg border border-c-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-c-muted">{note.admin_email}</span>
                <span className="text-xs text-c-dim">
                  {new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-c-text whitespace-pre-wrap">{note.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI helpers ───────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <dt className="font-mono text-[10px] text-c-dim uppercase tracking-wider">{label}</dt>
      <dd className={`text-sm text-c-text ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-c-bezel/50 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-c-text">{value}</p>
      <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">{label}</p>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-900/30 text-c-green',
    completed: 'bg-c-cyan/20 text-c-cyan',
    paused: 'bg-yellow-900/30 text-c-amber',
    abandoned: 'bg-c-bezel text-c-muted',
    errored: 'bg-red-900/30 text-c-red',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || 'bg-c-bezel text-c-muted'}`}>
      {status}
    </span>
  );
}

function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return <span className="text-xs text-c-dim">--</span>;
  const styles: Record<string, string> = {
    satisfactory: 'bg-green-900/30 text-c-green',
    partial: 'bg-yellow-900/30 text-c-amber',
    unsatisfactory: 'bg-red-900/30 text-c-red',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[score] || 'bg-c-bezel text-c-muted'}`}>
      {score}
    </span>
  );
}
