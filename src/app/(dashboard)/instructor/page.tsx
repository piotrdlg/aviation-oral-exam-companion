'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ConnectionItem {
  connectionId: string;
  studentUserId: string;
  studentName: string | null;
  state: string;
  requestedAt: string | null;
  connectedAt: string | null;
  initiatedBy: string;
}

interface StudentSummary {
  studentUserId: string;
  displayName: string | null;
  lastActivityAt: string | null;
  sessionsLast7Days: number;
  readinessScore: number | null;
  weakElements: { elementCode: string; area: string; severity: string }[];
  recommendedTopics: string[];
}

type TabKey = 'students' | 'pending' | 'invites';

export default function InstructorCommandCenter() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('students');

  // Connection data
  const [connected, setConnected] = useState<ConnectionItem[]>([]);
  const [pending, setPending] = useState<ConnectionItem[]>([]);
  const [counts, setCounts] = useState({ connected: 0, pending: 0, unclaimedInvites: 0 });

  // Student summaries
  const [studentSummaries, setStudentSummaries] = useState<StudentSummary[]>([]);

  // Invite data (reuse from Phase 2)
  const [invites, setInvites] = useState<{ id: string; token: string; invite_url: string; expires_at: string; claimed_at: string | null; revoked_at: string | null }[]>([]);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteCopied, setInviteCopied] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Check feature flag
        const flagRes = await fetch('/api/flags');
        const flags = await flagRes.json();
        if (!flags.instructor_partnership_v1) {
          router.replace('/practice');
          return;
        }

        // Load connections + students + invites in parallel
        const [connRes, studentsRes, invitesRes] = await Promise.all([
          fetch('/api/instructor/connections'),
          fetch('/api/instructor/students'),
          fetch('/api/user/instructor/invites'),
        ]);

        if (connRes.status === 403 || connRes.status === 404) {
          router.replace('/practice');
          return;
        }

        if (connRes.ok) {
          const connData = await connRes.json();
          setConnected(connData.connected || []);
          setPending(connData.pending || []);
          setCounts(connData.counts || { connected: 0, pending: 0, unclaimedInvites: 0 });
        }

        if (studentsRes.ok) {
          const studentData = await studentsRes.json();
          setStudentSummaries(studentData.students || []);
        }

        if (invitesRes.ok) {
          const inviteData = await invitesRes.json();
          setInvites(inviteData.invites || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  // Active students = sessions in last 7 days > 0
  const activeStudents = studentSummaries.filter(s => s.sessionsLast7Days > 0).length;

  async function handleConnectionAction(connectionId: string, action: 'approve' | 'reject' | 'disconnect') {
    setActionLoading(connectionId);
    try {
      const res = await fetch('/api/instructor/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, connection_id: connectionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      // Refresh data
      const [connRes, studentsRes] = await Promise.all([
        fetch('/api/instructor/connections'),
        fetch('/api/instructor/students'),
      ]);
      if (connRes.ok) {
        const d = await connRes.json();
        setConnected(d.connected || []);
        setPending(d.pending || []);
        setCounts(d.counts || { connected: 0, pending: 0, unclaimedInvites: 0 });
      }
      if (studentsRes.ok) {
        const d = await studentsRes.json();
        setStudentSummaries(d.students || []);
      }
    } catch {
      setError('Action failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function createInvite() {
    setInviteCreating(true);
    try {
      const res = await fetch('/api/user/instructor/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      if (!res.ok) throw new Error('Failed');
      const listRes = await fetch('/api/user/instructor/invites');
      if (listRes.ok) {
        const d = await listRes.json();
        setInvites(d.invites || []);
      }
    } catch {
      setError('Failed to create invite.');
    } finally {
      setInviteCreating(false);
    }
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(id);
      setTimeout(() => setInviteCopied(null), 2000);
    });
  }

  async function revokeInvite(inviteId: string) {
    try {
      await fetch('/api/user/instructor/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', inviteId }),
      });
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch {
      // silently fail
    }
  }

  function formatDate(d: string | null): string {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'students', label: 'Students', count: counts.connected },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'invites', label: 'Invites', count: counts.unclaimedInvites },
  ];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-8 bg-c-bezel rounded animate-pulse w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-c-bezel rounded-lg animate-pulse" />)}
        </div>
        <div className="h-64 bg-c-bezel rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// INSTRUCTOR MODE</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">Command Center</h1>
      </div>

      {/* Legal disclaimer */}
      <div className="bg-c-panel border border-c-border rounded-lg px-4 py-3">
        <p className="font-mono text-[10px] text-c-dim leading-relaxed">
          HeyDPE supports your teaching; you remain the recommending instructor responsible for training and endorsement decisions.
        </p>
      </div>

      {error && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg px-4 py-3">
          <p className="text-c-red text-sm font-mono">{error}</p>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Connected', value: counts.connected, color: 'text-c-green' },
          { label: 'Pending', value: counts.pending, color: 'text-c-amber' },
          { label: 'Invites', value: counts.unclaimedInvites, color: 'text-c-cyan' },
          { label: 'Active (7d)', value: activeStudents, color: 'text-c-text' },
        ].map(kpi => (
          <div key={kpi.label} className="bezel rounded-lg border border-c-border p-4">
            <div className={`font-mono text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-c-border pb-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.key
                ? 'border-c-amber text-c-amber font-semibold'
                : 'border-transparent text-c-muted hover:text-c-text'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-c-elevated text-c-muted">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'students' && (
        <div>
          {connected.length === 0 ? (
            <p className="font-mono text-sm text-c-dim text-center py-12">No connected students yet. Share an invite link to get started.</p>
          ) : (
            <div className="space-y-2">
              {connected.map(conn => {
                const summary = studentSummaries.find(s => s.studentUserId === conn.studentUserId);
                return (
                  <div key={conn.connectionId} className="bezel rounded-lg border border-c-border p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm text-c-text font-semibold">
                        {conn.studentName || summary?.displayName || 'Student'}
                      </div>
                      <div className="font-mono text-[10px] text-c-dim mt-1 flex items-center gap-3">
                        {summary?.readinessScore !== null && summary?.readinessScore !== undefined ? (
                          <span className={summary.readinessScore >= 70 ? 'text-c-green' : summary.readinessScore >= 50 ? 'text-c-amber' : 'text-c-red'}>
                            Readiness: {summary.readinessScore}%
                          </span>
                        ) : (
                          <span className="text-c-dim">No score yet</span>
                        )}
                        <span>Last: {formatDate(summary?.lastActivityAt || null)}</span>
                        <span>{summary?.sessionsLast7Days ?? 0} sessions (7d)</span>
                      </div>
                    </div>
                    <Link
                      href={`/instructor/students/${conn.studentUserId}`}
                      className="px-3 py-1.5 rounded border border-c-amber/30 bg-c-amber-lo text-c-amber font-mono text-[10px] uppercase hover:bg-c-amber/20 transition-colors whitespace-nowrap"
                    >
                      View Progress
                    </Link>
                    <button
                      onClick={() => handleConnectionAction(conn.connectionId, 'disconnect')}
                      disabled={actionLoading === conn.connectionId}
                      className="px-3 py-1.5 rounded border border-c-red/20 bg-c-red-dim text-c-red font-mono text-[10px] uppercase hover:bg-c-red/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {actionLoading === conn.connectionId ? '...' : 'Disconnect'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <p className="font-mono text-sm text-c-dim text-center py-12">No pending connection requests.</p>
          ) : (
            <div className="space-y-2">
              {pending.map(conn => (
                <div key={conn.connectionId} className="bezel rounded-lg border border-c-border p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-c-text font-semibold">
                      {conn.studentName || 'Student'}
                    </div>
                    <div className="font-mono text-[10px] text-c-dim mt-1">
                      Requested {formatDate(conn.requestedAt)} &middot; {conn.initiatedBy === 'student' ? 'Student-initiated' : 'Invite'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleConnectionAction(conn.connectionId, 'approve')}
                    disabled={actionLoading === conn.connectionId}
                    className="px-3 py-1.5 rounded border border-c-green/30 bg-c-green-lo text-c-green font-mono text-[10px] uppercase hover:bg-c-green/20 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === conn.connectionId ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleConnectionAction(conn.connectionId, 'reject')}
                    disabled={actionLoading === conn.connectionId}
                    className="px-3 py-1.5 rounded border border-c-red/20 bg-c-red-dim text-c-red font-mono text-[10px] uppercase hover:bg-c-red/20 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'invites' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-c-muted">Share invite links with students to connect on HeyDPE.</p>
            <button
              onClick={createInvite}
              disabled={inviteCreating}
              className="px-3 py-1.5 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-[10px] font-semibold rounded-lg transition-colors uppercase whitespace-nowrap"
            >
              {inviteCreating ? 'CREATING...' : '+ NEW LINK'}
            </button>
          </div>
          {invites.filter(i => !i.revoked_at).length === 0 ? (
            <p className="font-mono text-sm text-c-dim text-center py-8">No active invite links.</p>
          ) : (
            <div className="space-y-2">
              {invites.filter(i => !i.revoked_at).map(invite => {
                const expired = new Date(invite.expires_at) < new Date();
                const claimed = !!invite.claimed_at;
                return (
                  <div key={invite.id} className="flex items-center gap-2 bg-c-panel rounded-lg border border-c-border px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-c-text truncate">{invite.invite_url}</div>
                      <div className="font-mono text-[9px] text-c-dim mt-0.5">
                        {claimed ? <span className="text-c-green">Claimed</span> : expired ? <span className="text-c-red">Expired</span> : <span>Expires {new Date(invite.expires_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {!claimed && !expired && (
                      <button onClick={() => copyUrl(invite.invite_url, invite.id)} className="px-2 py-1 rounded border border-c-border bg-c-bezel text-c-muted hover:text-c-text font-mono text-[9px] uppercase transition-colors whitespace-nowrap">
                        {inviteCopied === invite.id ? 'COPIED!' : 'COPY'}
                      </button>
                    )}
                    {!claimed && (
                      <button onClick={() => revokeInvite(invite.id)} className="px-2 py-1 rounded border border-c-red/20 bg-c-red-dim text-c-red hover:bg-c-red/20 font-mono text-[9px] uppercase transition-colors whitespace-nowrap">
                        REVOKE
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
