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
  ground_school: 'bg-gray-700 text-gray-300',
  checkride_prep: 'bg-blue-900/40 text-blue-300',
  dpe_live: 'bg-purple-900/40 text-purple-300',
};

const STATUS_COLORS: Record<AccountStatus, string> = {
  active: 'bg-green-900/30 text-green-400',
  suspended: 'bg-yellow-900/30 text-yellow-400',
  banned: 'bg-red-900/30 text-red-400',
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
          <Link href="/admin/users" className="text-gray-500 hover:text-gray-300 text-sm">
            Users
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-400 text-sm">Loading...</span>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 animate-pulse">
          <div className="h-6 bg-gray-800 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-800 rounded w-32" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin/users" className="text-gray-500 hover:text-gray-300 text-sm">
            Users
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-400 text-sm">Error</span>
        </div>
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-6 text-center">
          <p className="text-red-300 mb-3">{error || 'User not found'}</p>
          <button onClick={fetchUser} className="text-sm text-red-400 hover:text-red-300 underline">
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
        <Link href="/admin/users" className="text-gray-500 hover:text-gray-300 text-sm">
          Users
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-300 text-sm">{user.email}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{user.email}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[user.tier]}`}>
              {TIER_LABELS[user.tier]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[user.account_status]}`}>
              {user.account_status}
            </span>
            {user.subscription_status && user.subscription_status !== 'none' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
                Sub: {user.subscription_status}
              </span>
            )}
          </div>
          {user.status_reason && (
            <p className="text-xs text-gray-500 mt-1">Reason: {user.status_reason}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {user.account_status === 'active' && (
            <>
              <button
                onClick={() => performAction('suspend')}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-md bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50 transition-colors disabled:opacity-50"
              >
                Suspend
              </button>
              <button
                onClick={() => performAction('ban')}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-md bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors disabled:opacity-50"
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
                className="px-3 py-1.5 text-xs rounded-md bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors disabled:opacity-50"
              >
                Activate
              </button>
              <button
                onClick={() => performAction('ban')}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-md bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors disabled:opacity-50"
              >
                Ban
              </button>
            </>
          )}
          {user.account_status === 'banned' && (
            <button
              onClick={() => performAction('activate')}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors disabled:opacity-50"
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
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-300 ml-3">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
              {tab.value === 'notes' && notes.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-800 px-1.5 py-0.5 rounded-full">
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
      className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <p className="text-gray-500">No sessions found for this user</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left">
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rating</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Mode</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Exchanges</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tasks</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {sessions.map((session) => {
            const duration =
              session.ended_at && session.started_at
                ? Math.round(
                    (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) /
                      60000
                  )
                : null;
            return (
              <tr key={session.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 text-gray-300 text-xs">
                  {new Date(session.started_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 uppercase">
                    {session.rating}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{session.study_mode}</td>
                <td className="px-4 py-3 text-gray-300">{session.exchange_count}</td>
                <td className="px-4 py-3 text-gray-300">{session.acs_tasks_covered?.length || 0}</td>
                <td className="px-4 py-3">
                  <SessionStatusBadge status={session.status} />
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <p className="text-gray-500">No element scores recorded yet</p>
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
        <div key={area} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/30">
            <h3 className="text-sm font-medium text-gray-300">{area}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Element</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Attempts</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Sat</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Partial</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Unsat</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Latest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {areaScores
                .filter((s) => s.total_attempts > 0)
                .sort((a, b) => a.element_code.localeCompare(b.element_code))
                .map((score) => (
                  <tr key={score.element_code}>
                    <td className="px-4 py-2 text-gray-300 font-mono text-xs">
                      {score.element_code}
                    </td>
                    <td className="px-4 py-2 text-gray-400">{score.total_attempts}</td>
                    <td className="px-4 py-2 text-green-400">{score.satisfactory_count}</td>
                    <td className="px-4 py-2 text-yellow-400">{score.partial_count}</td>
                    <td className="px-4 py-2 text-red-400">{score.unsatisfactory_count}</td>
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <p className="text-gray-500">No usage data available</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left">
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">LLM Requests</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">TTS Requests</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">STT Sessions</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total Tokens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {usage.map((entry) => (
            <tr key={entry.date} className="hover:bg-gray-800/50 transition-colors">
              <td className="px-4 py-3 text-gray-300 text-xs">{entry.date}</td>
              <td className="px-4 py-3 text-gray-300">{entry.llm_requests.toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-300">{entry.tts_requests.toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-300">{entry.stt_sessions.toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-300">{entry.total_tokens.toLocaleString()}</td>
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Add Note</h3>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write an admin note about this user..."
          rows={3}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={onSubmit}
            disabled={!noteText.trim() || submitting}
            className="px-4 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
          >
            {submitting ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
          <p className="text-gray-500 text-sm">No admin notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">{note.admin_email}</span>
                <span className="text-xs text-gray-600">
                  {new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{note.note}</p>
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
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-sm text-gray-300 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-900/30 text-green-400',
    completed: 'bg-blue-900/30 text-blue-400',
    paused: 'bg-yellow-900/30 text-yellow-400',
    abandoned: 'bg-gray-800 text-gray-400',
    errored: 'bg-red-900/30 text-red-400',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  );
}

function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return <span className="text-xs text-gray-600">--</span>;
  const styles: Record<string, string> = {
    satisfactory: 'bg-green-900/30 text-green-400',
    partial: 'bg-yellow-900/30 text-yellow-400',
    unsatisfactory: 'bg-red-900/30 text-red-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[score] || 'bg-gray-800 text-gray-400'}`}>
      {score}
    </span>
  );
}
