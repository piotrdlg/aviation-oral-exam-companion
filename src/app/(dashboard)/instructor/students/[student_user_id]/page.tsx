'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import { Logo } from '@/components/Brand';

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
        posthog.capture('instructor_student_detail_viewed', { student_user_id });

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
        <p className="text-c-muted text-sm">{error || 'Student not found.'}</p>
        <Link href="/instructor" className="text-sm font-semibold text-c-amber hover:underline mt-4 inline-block">
          Back to command center
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link + header */}
      <div>
        <div className="mb-3">
          <Logo size="md" href="/home" />
        </div>
        <Link href="/instructor" className="text-sm text-c-muted hover:text-c-text transition-colors">
          &larr; Command center
        </Link>
        <h1 className="text-3xl font-bold text-c-text tracking-tight mt-2">
          {student.displayName || 'Student'}
        </h1>
      </div>

      {/* Legal disclaimer */}
      <div className="bg-c-panel border border-c-border rounded-lg px-4 py-3">
        <p className="text-sm text-c-muted leading-relaxed">
          HeyDPE supports your teaching; you remain the recommending instructor responsible for training and endorsement decisions.
        </p>
      </div>

      {error && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg px-4 py-3">
          <p className="text-c-red text-sm">{error}</p>
        </div>
      )}

      {/* Readiness Score */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-semibold text-base text-c-text tracking-tight mb-3">Readiness score</h2>
        <div className="flex items-baseline gap-4">
          <span className={`font-mono tabular-nums text-4xl font-bold ${scoreColor(student.readinessScore)}`}>
            {student.readinessScore !== null ? `${student.readinessScore}%` : '--'}
          </span>
          <span className="text-[11px] text-c-muted">
            {student.readinessScore !== null ? 'Estimated based on recent practice sessions' : 'No completed sessions yet'}
          </span>
          {insights?.readinessTrend && insights.readinessTrend !== 'insufficient_data' && (
            <span className={`text-[11px] ${
              insights.readinessTrend === 'improving' ? 'text-c-green-readable' :
              insights.readinessTrend === 'declining' ? 'text-c-red' : 'text-c-muted'
            }`}>
              {insights.readinessTrend === 'improving' ? 'Trending up' :
               insights.readinessTrend === 'declining' ? 'Trending down' : 'Stable'}
            </span>
          )}
        </div>
        {insights?.coveragePercent !== null && insights?.coveragePercent !== undefined && (
          <div className="text-[11px] text-c-muted mt-1">
            ACS coverage: <span className="font-mono tabular-nums text-c-text">{insights.coveragePercent}%</span> of plan elements
          </div>
        )}
        <div className="text-[11px] text-c-muted mt-2">
          <span className="font-mono tabular-nums">{student.sessionsLast7Days}</span> session{student.sessionsLast7Days !== 1 ? 's' : ''} in last 7 days &middot; Last active: {formatDate(student.lastActivityAt)}
        </div>
      </div>

      {/* Needs Attention */}
      {insights?.needsAttention && (
        <div className="bg-c-red-dim/20 border border-c-red/20 border-l-4 border-l-c-red rounded-lg px-4 py-3">
          <p className="font-mono text-[11px] text-c-red uppercase tracking-wider mb-1">Needs attention</p>
          <ul className="space-y-0.5">
            {insights.needsAttentionReasons.map((reason, i) => (
              <li key={i} className="text-xs text-c-red/90">• {reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Milestones */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-semibold text-base text-c-text tracking-tight mb-3">Milestones</h2>
        <p className="text-xs text-c-muted mb-3">Self-reported by student or instructor. Not verified by HeyDPE.</p>
        <div className="space-y-2">
          {(insights?.milestones || []).map(m => {
            const badge = STATUS_BADGES[m.status] || STATUS_BADGES.not_set;
            return (
              <div key={m.key} className="flex items-center gap-3 py-1.5 border-b border-c-border last:border-0">
                <span className="text-sm text-c-text flex-1">{MILESTONE_LABELS[m.key] || m.key}</span>
                <span className={`font-mono text-[11px] uppercase tracking-wider ${badge.color}`}>{badge.label}</span>
                <select
                  value={m.status}
                  onChange={(e) => handleMilestoneUpdate(m.key, e.target.value)}
                  disabled={milestoneUpdating === m.key}
                  className="text-sm bg-c-panel border border-c-border rounded px-2 py-1 text-c-text disabled:opacity-50"
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
          <h2 className="font-semibold text-base text-c-text tracking-tight mb-3">Area breakdown</h2>
          <div className="space-y-2">
            {student.areaBreakdown.map(area => (
              <div key={area.area} className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-c-muted w-16">Area {area.area}</span>
                <div className="flex-1 h-2 bg-c-panel rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${area.score >= 70 ? 'bg-c-green/70' : area.score >= 50 ? 'bg-c-amber/70' : 'bg-c-red/70'}`}
                    style={{ width: `${Math.min(area.score, 100)}%` }}
                  />
                </div>
                <span className={`font-mono tabular-nums text-[11px] w-10 text-right ${scoreColor(area.score)}`}>{area.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak Elements / Recommended Topics */}
      {student.recommendedTopics.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-semibold text-base text-c-text tracking-tight mb-3">Recommended lesson topics</h2>
          <div className="space-y-1.5">
            {student.recommendedTopics.map((topic, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-xs text-c-amber">{i + 1}.</span>
                <span className="text-sm text-c-text">{topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak Elements Detail */}
      {student.weakElements.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-semibold text-base text-c-text tracking-tight mb-3">Weak elements</h2>
          <div className="space-y-1">
            {student.weakElements.map((el, i) => (
              <div key={i} className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-c-text w-24">{el.elementCode}</span>
                <span className="text-c-muted">Area {el.area}</span>
                <span className={`uppercase tracking-wider ${el.severity === 'unsatisfactory' ? 'text-c-red' : 'text-c-amber'}`}>
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
          <h2 className="font-semibold text-base text-c-text tracking-tight mb-3">Recent sessions</h2>
          <div className="space-y-2">
            {student.recentSessions.map(session => (
              <div key={session.id} className="flex items-center gap-3 py-1.5 border-b border-c-border last:border-0">
                <span className="font-mono tabular-nums text-[11px] text-c-muted w-20">{formatDate(session.createdAt)}</span>
                <span className="font-mono text-[11px] text-c-text uppercase w-20">{session.rating}</span>
                <span className={`text-[11px] w-16 ${session.status === 'completed' ? 'text-c-green-readable' : 'text-c-muted'}`}>
                  {session.status}
                </span>
                <span className="text-[11px] text-c-muted"><span className="font-mono tabular-nums">{session.exchangeCount}</span> Q&amp;A</span>
                {session.overallScore !== null && (
                  <span className={`font-mono tabular-nums text-[11px] ml-auto ${scoreColor(session.overallScore)}`}>
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
          className="min-h-11 px-4 rounded border border-c-red/20 bg-c-red-dim text-c-red hover:bg-c-red/20 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect student'}
        </button>
      </div>
    </div>
  );
}
