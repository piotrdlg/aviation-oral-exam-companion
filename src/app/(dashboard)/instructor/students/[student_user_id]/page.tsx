'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface StudentDetail {
  studentUserId: string;
  displayName: string | null;
  lastActivityAt: string | null;
  sessionsLast7Days: number;
  readinessScore: number | null;
  weakElements: { elementCode: string; area: string; severity: string }[];
  recommendedTopics: string[];
  recentSessions: {
    id: string;
    rating: string;
    status: string;
    exchangeCount: number;
    overallScore: number | null;
    createdAt: string;
  }[];
  areaBreakdown: { area: string; score: number; status: string }[];
}

interface MilestoneSnapshot {
  key: string;
  status: string;
  declaredAt: string | null;
  declaredBy: string;
}

interface StudentInsights {
  readinessScore: number | null;
  readinessTrend: string;
  coveragePercent: number | null;
  totalSessions: number;
  completedSessions: number;
  lastActivityAt: string | null;
  areaBreakdown: { area: string; score: number; status: string; totalElements: number; askedElements: number; weakElementCount: number }[];
  weakAreas: string[];
  strongAreas: string[];
  gapElements: string[];
  recommendedTopics: string[];
  milestones: MilestoneSnapshot[];
  needsAttention: boolean;
  needsAttentionReasons: string[];
}

export default function StudentDetailPage() {
  const { student_user_id } = useParams<{ student_user_id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [insights, setInsights] = useState<StudentInsights | null>(null);
  const [milestoneUpdating, setMilestoneUpdating] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [res, insightsRes] = await Promise.all([
          fetch(`/api/instructor/students/${student_user_id}`),
          fetch(`/api/user/instructor/students/insights?studentUserId=${student_user_id}`),
        ]);
        if (res.status === 403 || res.status === 404) {
          router.replace('/instructor');
          return;
        }
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setStudent(data.student);
        if (insightsRes.ok) {
          const insData = await insightsRes.json();
          setInsights(insData.insights || null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load student data');
      } finally {
        setLoading(false);
      }
    }
    if (student_user_id) load();
  }, [student_user_id, router]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      // Find connection ID for this student
      const connRes = await fetch('/api/instructor/connections');
      if (!connRes.ok) throw new Error('Failed');
      const connData = await connRes.json();
      const conn = (connData.connected || []).find((c: { studentUserId: string }) => c.studentUserId === student_user_id);
      if (!conn) throw new Error('Connection not found');

      const res = await fetch('/api/instructor/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', connection_id: conn.connectionId }),
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      router.push('/instructor');
    } catch {
      setError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  }

  function formatDate(d: string | null): string {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function scoreColor(score: number | null): string {
    if (score === null) return 'text-c-dim';
    if (score >= 70) return 'text-c-green';
    if (score >= 50) return 'text-c-amber';
    return 'text-c-red';
  }

  const MILESTONE_LABELS: Record<string, string> = {
    knowledge_test_passed: 'FAA Knowledge Test',
    mock_oral_completed: 'Mock Oral Exam',
    checkride_scheduled: 'Checkride Scheduled',
    oral_passed: 'Oral Exam Passed',
  };

  const STATUS_BADGES: Record<string, { label: string; color: string }> = {
    not_set: { label: 'Not Set', color: 'text-c-dim' },
    in_progress: { label: 'In Progress', color: 'text-c-amber' },
    completed: { label: 'Completed', color: 'text-c-green' },
  };

  async function handleMilestoneUpdate(key: string, newStatus: string) {
    setMilestoneUpdating(key);
    try {
      const res = await fetch('/api/user/instructor/students/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentUserId: student_user_id,
          milestoneKey: key,
          status: newStatus,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      // Refresh insights
      const insightsRes = await fetch(`/api/user/instructor/students/insights?studentUserId=${student_user_id}`);
      if (insightsRes.ok) {
        const insData = await insightsRes.json();
        setInsights(insData.insights || null);
      }
    } catch {
      setError('Failed to update milestone.');
    } finally {
      setMilestoneUpdating(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-6 bg-c-bezel rounded animate-pulse w-32" />
        <div className="h-32 bg-c-bezel rounded-lg animate-pulse" />
        <div className="h-48 bg-c-bezel rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-c-dim font-mono text-sm">{error || 'Student not found.'}</p>
        <Link href="/instructor" className="font-mono text-sm text-c-amber hover:underline mt-4 inline-block">
          Back to Command Center
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link + header */}
      <div>
        <Link href="/instructor" className="font-mono text-[10px] text-c-muted hover:text-c-text uppercase tracking-wider transition-colors">
          &larr; Command Center
        </Link>
        <h1 className="text-xl font-bold text-c-amber font-mono uppercase tracking-wider mt-2 glow-a">
          {student.displayName || 'Student'}
        </h1>
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

      {/* Readiness Score */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">READINESS SCORE</h2>
        <div className="flex items-baseline gap-4">
          <span className={`font-mono text-4xl font-bold ${scoreColor(student.readinessScore)}`}>
            {student.readinessScore !== null ? `${student.readinessScore}%` : '--'}
          </span>
          <span className="font-mono text-[10px] text-c-dim">
            {student.readinessScore !== null ? 'Estimated based on recent practice sessions' : 'No completed sessions yet'}
          </span>
          {insights?.readinessTrend && insights.readinessTrend !== 'insufficient_data' && (
            <span className={`font-mono text-[10px] ${
              insights.readinessTrend === 'improving' ? 'text-c-green' :
              insights.readinessTrend === 'declining' ? 'text-c-red' : 'text-c-dim'
            }`}>
              {insights.readinessTrend === 'improving' ? 'Trending up' :
               insights.readinessTrend === 'declining' ? 'Trending down' : 'Stable'}
            </span>
          )}
        </div>
        {insights?.coveragePercent !== null && insights?.coveragePercent !== undefined && (
          <div className="font-mono text-[10px] text-c-dim mt-1">
            ACS Coverage: <span className="text-c-text">{insights.coveragePercent}%</span> of plan elements
          </div>
        )}
        <div className="font-mono text-[10px] text-c-dim mt-2">
          {student.sessionsLast7Days} session{student.sessionsLast7Days !== 1 ? 's' : ''} in last 7 days &middot; Last active: {formatDate(student.lastActivityAt)}
        </div>
      </div>

      {/* Needs Attention */}
      {insights?.needsAttention && (
        <div className="bg-c-red-dim/20 border border-c-red/20 border-l-4 border-l-c-red rounded-lg px-4 py-3">
          <p className="font-mono text-xs text-c-red uppercase tracking-wider mb-1">Needs Attention</p>
          <ul className="space-y-0.5">
            {insights.needsAttentionReasons.map((reason, i) => (
              <li key={i} className="font-mono text-[10px] text-c-red/80">• {reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Milestones */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">MILESTONES</h2>
        <p className="font-mono text-[9px] text-c-dim mb-3">Self-reported by student or instructor. Not verified by HeyDPE.</p>
        <div className="space-y-2">
          {(insights?.milestones || []).map(m => {
            const badge = STATUS_BADGES[m.status] || STATUS_BADGES.not_set;
            return (
              <div key={m.key} className="flex items-center gap-3 py-1.5 border-b border-c-border last:border-0">
                <span className="font-mono text-sm text-c-text flex-1">{MILESTONE_LABELS[m.key] || m.key}</span>
                <span className={`font-mono text-[10px] ${badge.color}`}>{badge.label}</span>
                <select
                  value={m.status}
                  onChange={(e) => handleMilestoneUpdate(m.key, e.target.value)}
                  disabled={milestoneUpdating === m.key}
                  className="font-mono text-[10px] bg-c-panel border border-c-border rounded px-2 py-1 text-c-text disabled:opacity-50"
                >
                  <option value="not_set">Not Set</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Area Breakdown */}
      {student.areaBreakdown.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">AREA BREAKDOWN</h2>
          <div className="space-y-2">
            {student.areaBreakdown.map(area => (
              <div key={area.area} className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-c-muted w-16">Area {area.area}</span>
                <div className="flex-1 h-2 bg-c-panel rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${area.score >= 70 ? 'bg-c-green/70' : area.score >= 50 ? 'bg-c-amber/70' : 'bg-c-red/70'}`}
                    style={{ width: `${Math.min(area.score, 100)}%` }}
                  />
                </div>
                <span className={`font-mono text-[10px] w-10 text-right ${scoreColor(area.score)}`}>{area.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak Elements / Recommended Topics */}
      {student.recommendedTopics.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">RECOMMENDED LESSON TOPICS</h2>
          <div className="space-y-1.5">
            {student.recommendedTopics.map((topic, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-c-amber">{i + 1}.</span>
                <span className="font-mono text-sm text-c-text">{topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak Elements Detail */}
      {student.weakElements.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">WEAK ELEMENTS</h2>
          <div className="space-y-1">
            {student.weakElements.map((el, i) => (
              <div key={i} className="flex items-center gap-3 font-mono text-[10px]">
                <span className="text-c-text w-24">{el.elementCode}</span>
                <span className="text-c-dim">Area {el.area}</span>
                <span className={el.severity === 'unsatisfactory' ? 'text-c-red' : 'text-c-amber'}>
                  {el.severity.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {student.recentSessions.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">RECENT SESSIONS</h2>
          <div className="space-y-2">
            {student.recentSessions.map(session => (
              <div key={session.id} className="flex items-center gap-3 py-1.5 border-b border-c-border last:border-0">
                <span className="font-mono text-[10px] text-c-dim w-20">{formatDate(session.createdAt)}</span>
                <span className="font-mono text-[10px] text-c-text uppercase w-20">{session.rating}</span>
                <span className={`font-mono text-[10px] w-16 ${session.status === 'completed' ? 'text-c-green' : 'text-c-muted'}`}>
                  {session.status}
                </span>
                <span className="font-mono text-[10px] text-c-dim">{session.exchangeCount} Q&amp;A</span>
                {session.overallScore !== null && (
                  <span className={`font-mono text-[10px] ml-auto ${scoreColor(session.overallScore)}`}>
                    {session.overallScore}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disconnect */}
      <div className="pt-4 border-t border-c-border">
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="px-4 py-2 rounded border border-c-red/20 bg-c-red-dim text-c-red hover:bg-c-red/20 font-mono text-[10px] uppercase transition-colors disabled:opacity-50"
        >
          {disconnecting ? 'DISCONNECTING...' : 'DISCONNECT STUDENT'}
        </button>
      </div>
    </div>
  );
}
