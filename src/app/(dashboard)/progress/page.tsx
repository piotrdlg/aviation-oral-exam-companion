'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import WeakAreas from './components/WeakAreas';
import StudyRecommendations from './components/StudyRecommendations';
import ReadinessGauge from './components/ReadinessGauge';
import StatCard from './components/StatCard';
import AcsCoverageBars from './components/AcsCoverageBars';
import type { ElementScore, AircraftClass, Rating } from '@/types/database';
import { readiness, satisfactoryRate } from '@/lib/progress-metrics';

const RATING_OPTIONS: { value: Rating; label: string }[] = [
  { value: 'private', label: 'PPL' },
  { value: 'commercial', label: 'CPL' },
  { value: 'instrument', label: 'IR' },
];

const RATING_LABELS: Record<Rating, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial',
  instrument: 'Instrument',
  atp: 'ATP',
};

// Dynamic import to avoid SSR issues with Nivo
const AcsCoverageTreemap = dynamic(() => import('./components/AcsCoverageTreemap'), {
  ssr: false,
  loading: () => (
    <div className="bezel rounded-lg border border-c-border p-6 flex items-center justify-center" style={{ height: 460 }}>
      <p className="text-c-dim font-mono text-sm">LOADING TREEMAP...</p>
    </div>
  ),
});

interface Session {
  id: string;
  rating: Rating;
  status: 'active' | 'paused' | 'completed' | 'expired' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  exchange_count: number;
  study_mode: string;
  difficulty_preference: string;
  aircraft_class?: string;
  acs_tasks_covered: { task_id: string; status: string; attempts?: number }[];
  result?: {
    grade: string;
    elements_asked: number;
    total_elements_in_set: number;
    completion_trigger: string;
  } | null;
}

interface TaskInfo {
  id: string;
  applicable_classes: string[];
}

const CLASS_OPTIONS: { value: AircraftClass; label: string }[] = [
  { value: 'ASEL', label: 'ASEL' },
  { value: 'AMEL', label: 'AMEL' },
  { value: 'ASES', label: 'ASES' },
  { value: 'AMES', label: 'AMES' },
];

// Achievement milestones
interface Achievement {
  id: string;
  label: string;
  earned: boolean;
}

function computeAchievements(
  totalSessions: number,
  completedSessions: number,
  totalExchanges: number,
  coveragePct: number,
  weakCount: number,
  attemptedElements: number,
): Achievement[] {
  return [
    { id: 'first', label: 'First Exam', earned: totalSessions >= 1 },
    { id: 'five', label: '5 Exams', earned: completedSessions >= 5 },
    { id: 'ten', label: '10 Exams', earned: completedSessions >= 10 },
    { id: 'exchanges50', label: '50 Exchanges', earned: totalExchanges >= 50 },
    { id: 'exchanges200', label: '200 Exchanges', earned: totalExchanges >= 200 },
    { id: 'coverage25', label: '25% Coverage', earned: coveragePct >= 25 },
    { id: 'coverage50', label: '50% Coverage', earned: coveragePct >= 50 },
    { id: 'coverage75', label: '75% Coverage', earned: coveragePct >= 75 },
    { id: 'coverage100', label: 'Full Coverage', earned: coveragePct >= 100 },
    { id: 'noWeak', label: 'No Weak Areas', earned: attemptedElements > 0 && weakCount === 0 },
  ];
}

export default function ProgressPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [elementScores, setElementScores] = useState<ElementScore[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'overview' | 'treemap'>('overview');
  const [selectedClass, setSelectedClass] = useState<AircraftClass>('ASEL');
  const [selectedRating, setSelectedRating] = useState<Rating>('private');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // Session-scoped treemap selection. W2.5 (bug 15): 'lifetime' is an
  // explicit sentinel — null only means "not yet auto-selected", so choosing
  // All Exams no longer snaps back to the latest session.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  // W2.5 (bug 16): server-computed lifetime aggregates (all sessions, not the 20-row window)
  const [lifetimeStats, setLifetimeStats] = useState<{ totalSessions: number; completedSessions: number; totalExchanges: number; uniqueTasksCovered: number } | null>(null);
  const [sessionScores, setSessionScores] = useState<ElementScore[]>([]);
  const [sessionScoresLoading, setSessionScoresLoading] = useState(false);

  // Initialize from user preferences
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.preferredRating) setSelectedRating(data.preferredRating);
        if (data?.preferredAircraftClass) setSelectedClass(data.preferredAircraftClass);
        setPrefsLoaded(true);
      })
      .catch(() => { setPrefsLoaded(true); });
  }, []);

  // Fetch session data when rating changes (wait for preferences to load)
  useEffect(() => {
    if (!prefsLoaded) return;
    setLoading(true);
    setSelectedSessionId(null);
    setSessionScores([]);
    Promise.all([
      fetch('/api/session').then((res) => res.json()),
      fetch(`/api/session?action=element-scores&rating=${selectedRating}`).then((res) => res.json()).catch(() => ({ scores: [] })),
      fetch(`/api/exam?action=list-tasks&rating=${selectedRating}`).then((res) => res.json()).catch(() => ({ tasks: [] })),
      // W2.5 (bug 16): lifetime stats computed server-side over ALL sessions
      fetch(`/api/session?action=stats&rating=${selectedRating}`).then((res) => res.json()).catch(() => ({ stats: null })),
    ])
      .then(([sessionData, scoresData, taskData, statsData]) => {
        setSessions(sessionData.sessions || []);
        setElementScores(scoresData.scores || []);
        setTasks(taskData.tasks || []);
        setLifetimeStats(statsData.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedRating, prefsLoaded]);

  // Filter sessions by selected rating
  const filteredSessions = useMemo(
    () => sessions.filter((s) => s.rating === selectedRating),
    [sessions, selectedRating]
  );

  // Default the ACS-map view to lifetime (selectedSessionId stays null → 'lifetime'),
  // not the most-recent session — which is often an abandoned 0-coverage one.

  // Fetch session-specific scores when selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId || selectedSessionId === 'lifetime') {
      setSessionScores([]);
      return;
    }
    setSessionScoresLoading(true);
    fetch(`/api/session?action=session-element-scores&sessionId=${selectedSessionId}`)
      .then((res) => res.json())
      .then((data) => setSessionScores(data.scores || []))
      .catch(() => setSessionScores([]))
      .finally(() => setSessionScoresLoading(false));
  }, [selectedSessionId]);

  // Build set of task IDs applicable to the selected class
  const classTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (task.applicable_classes?.includes(selectedClass)) {
        ids.add(task.id);
      }
    }
    return ids;
  }, [tasks, selectedClass]);

  // Filter element scores by class (lifetime)
  const filteredScores = useMemo(
    () => elementScores.filter((s) => classTaskIds.has(s.task_id)),
    [elementScores, classTaskIds]
  );

  // Filter session-scoped scores by class
  const filteredSessionScores = useMemo(
    () => sessionScores.filter((s) => classTaskIds.has(s.task_id)),
    [sessionScores, classTaskIds]
  );

  // Choose which scores to display in the treemap
  const treemapScores = selectedSessionId && selectedSessionId !== 'lifetime' ? filteredSessionScores : filteredScores;

  // W2.5 (bug 16): tiles + achievements use server aggregates; the 20-row
  // session list remains only for the dropdown.
  const totalSessions = lifetimeStats?.totalSessions ?? filteredSessions.length;
  const completedSessions = lifetimeStats?.completedSessions ?? filteredSessions.filter((s) => s.status === 'completed').length;
  const totalExchanges = lifetimeStats?.totalExchanges ?? filteredSessions.reduce((sum, s) => sum + (s.exchange_count || 0), 0);
  const attemptedElements = filteredScores.filter(s => s.total_attempts > 0).length;
  const totalElements = filteredScores.length;

  // Checkride readiness (0-100) + tier — shared formula (progress-metrics).
  const { score: readinessScore, tier: readinessTier } = useMemo(() => readiness(filteredScores), [filteredScores]);
  const satisfactoryPct = useMemo(() => satisfactoryRate(filteredScores), [filteredScores]);

  // Recent exams exclude discarded/expired sessions (align with the EXAMS count).
  const recentSessions = useMemo(
    () => filteredSessions.filter((s) => s.status !== 'abandoned' && s.status !== 'expired'),
    [filteredSessions]
  );

  // Weak elements count (for achievements)
  const weakCount = useMemo(() => {
    return filteredScores.filter(s => {
      if (s.total_attempts === 0) return false;
      const unsatRate = s.unsatisfactory_count / s.total_attempts;
      return s.latest_score === 'unsatisfactory' || unsatRate >= 0.5
        || s.latest_score === 'partial' || s.partial_count / s.total_attempts >= 0.5;
    }).length;
  }, [filteredScores]);

  // Coverage percentage
  const coveragePct = totalElements > 0 ? Math.round((attemptedElements / totalElements) * 100) : 0;

  // Achievements
  const achievements = useMemo(
    () => computeAchievements(totalSessions, completedSessions, totalExchanges, coveragePct, weakCount, attemptedElements),
    [totalSessions, completedSessions, totalExchanges, coveragePct, weakCount, attemptedElements]
  );
  const earnedAchievements = achievements.filter(a => a.earned);
  const nextAchievement = achievements.find(a => !a.earned);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-2">
        <h1 className="font-bold text-3xl text-c-text tracking-tight">Progress</h1>
        <p className="text-base text-c-muted mt-1">
          {RATING_LABELS[selectedRating]}{selectedRating !== 'instrument' ? ` (${selectedClass})` : ' — Airplane'} checkride preparation
        </p>
      </div>

      {/* Sticky tabs */}
      <div className="sticky top-0 z-10 bg-c-bg pb-4 pt-2 -mx-1 px-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Rating selector */}
          <div className="flex gap-0.5 bg-c-bezel rounded-lg p-0.5">
            {RATING_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRating(r.value)}
                className={`px-2.5 py-1.5 text-sm rounded-md font-mono transition-colors ${
                  selectedRating === r.value ? 'bg-c-amber text-c-bg font-semibold' : 'text-c-muted hover:text-c-text'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Class selector (not applicable for instrument rating) */}
          {selectedRating !== 'instrument' && (
            <div className="flex gap-0.5 bg-c-bezel rounded-lg p-0.5">
              {CLASS_OPTIONS.map((cls) => (
                <button
                  key={cls.value}
                  onClick={() => setSelectedClass(cls.value)}
                  className={`px-2.5 py-1.5 text-sm rounded-md font-mono transition-colors ${
                    selectedClass === cls.value ? 'bg-c-amber text-c-bg font-semibold' : 'text-c-muted hover:text-c-text'
                  }`}
                >
                  {cls.label}
                </button>
              ))}
            </div>
          )}
          {/* View toggle */}
          <div className="flex gap-0.5 bg-c-bezel rounded-lg p-0.5 ml-auto">
            <button
              onClick={() => setView('overview')}
              className={`px-3 py-1.5 text-sm rounded-md font-mono transition-colors ${
                view === 'overview' ? 'bg-c-elevated text-c-text font-semibold' : 'text-c-muted hover:text-c-text'
              }`}
            >
              OVERVIEW
            </button>
            <button
              onClick={() => setView('treemap')}
              className={`px-3 py-1.5 text-sm rounded-md font-mono transition-colors ${
                view === 'treemap' ? 'bg-c-elevated text-c-text font-semibold' : 'text-c-muted hover:text-c-text'
              }`}
            >
              ACS MAP
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bezel rounded-lg border border-c-border p-4 animate-pulse">
                <div className="h-6 w-12 bg-c-bezel rounded mx-auto mb-2" />
                <div className="h-3 w-16 bg-c-bezel rounded mx-auto" />
              </div>
            ))}
          </div>
          <div className="bezel rounded-lg border border-c-border p-6 flex items-center justify-center min-h-[200px]">
            <p className="text-c-dim font-mono text-sm">LOADING YOUR PROGRESS...</p>
          </div>
        </div>
      ) : filteredSessions.length === 0 && elementScores.length === 0 ? (
        /* Empty state with CTA */
        <div className="bezel rounded-lg border border-c-border p-8 text-center">
          <div className="text-4xl mb-3 opacity-50">
            <span className="text-c-muted text-3xl">&#9636;</span>
          </div>
          <h2 className="font-mono font-semibold text-base text-c-text uppercase mb-2">NO PROGRESS DATA YET</h2>
          <p className="text-base text-c-muted mb-5 max-w-sm mx-auto">
            Complete your first practice exam to start tracking your {RATING_LABELS[selectedRating]} checkride readiness.
          </p>
          <Link
            href="/practice"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-c-amber hover:bg-c-amber/90 text-c-bg text-sm font-mono font-semibold rounded-lg tracking-wide transition-colors shadow-lg shadow-c-amber/20 uppercase"
          >
            START PRACTICING
            <span>&#9654;</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Readiness gauge + explained stat readouts */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <ReadinessGauge score={readinessScore} tier={readinessTier} hasData={attemptedElements > 0} />
            <div className="col-span-2 grid grid-cols-2 gap-3">
              <StatCard
                label="Exams"
                value={totalSessions}
                accent="cyan"
                meta={completedSessions === totalSessions ? 'all completed' : `${completedSessions} completed · ${totalSessions - completedSessions} in progress`}
              />
              <StatCard label="Exchanges" value={totalExchanges} meta="Questions answered" />
              <StatCard label="ACS coverage" value={`${coveragePct}%`} accent="amber" meta={`${attemptedElements} of ${totalElements} elements`} />
              <StatCard label="Satisfactory" value={satisfactoryPct === null ? '—' : `${satisfactoryPct}%`} accent="green" meta="of graded answers" />
            </div>
          </div>

          {/* Achievements strip */}
          {earnedAchievements.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {earnedAchievements.map((a) => (
                  <span
                    key={a.id}
                    title={a.label}
                    className="shrink-0 inline-flex items-center gap-1.5 font-mono text-xs bg-c-bezel text-c-muted px-2.5 py-1 rounded-full border border-c-border"
                  >
                    <span className="text-c-amber text-xs" aria-hidden="true">✓</span>
                    {a.label}
                  </span>
                ))}
                {nextAchievement && (
                  <span
                    title={`Next: ${nextAchievement.label}`}
                    className="shrink-0 inline-flex items-center gap-1.5 font-mono text-xs bg-c-panel text-c-dim px-2.5 py-1 rounded-full border border-c-border border-dashed"
                  >
                    <span className="text-c-dim text-xs" aria-hidden="true">○</span>
                    {nextAchievement.label}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Practice weak areas CTA */}
          {weakCount > 0 && (
            <div className="mb-4">
              <Link
                href="/practice?mode=weak_areas"
                className="flex items-center justify-between w-full px-4 py-3 bg-c-red-dim/40 hover:bg-c-red-dim/60 border border-c-red/20 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-c-red text-xl">&#9888;</span>
                  <div>
                    <p className="text-base font-mono font-medium text-c-red">{weakCount} WEAK ELEMENT{weakCount !== 1 ? 'S' : ''} NEED ATTENTION</p>
                    <p className="text-sm text-c-muted">Practice focused on your gaps</p>
                  </div>
                </div>
                <span className="text-c-dim group-hover:text-c-red transition-colors">&#9654;</span>
              </Link>
            </div>
          )}

          {view === 'treemap' ? (
            /* Treemap + Weak Areas View */
            <div className="space-y-4">
              {/* Session selector */}
              <div className="flex items-center gap-2">
                <label className="font-mono text-xs text-c-muted uppercase tracking-wider">EXAM:</label>
                <select
                  value={selectedSessionId === 'lifetime' || !selectedSessionId ? 'lifetime' : selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="bg-c-panel border border-c-border rounded-lg text-sm text-c-text font-mono px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber"
                >
                  <option value="lifetime">All Exams (Lifetime)</option>
                  {recentSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.started_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {' '}({s.exchange_count || 0} exchanges{s.status !== 'completed' ? ` · ${s.status}` : ''})
                    </option>
                  ))}
                </select>
                {sessionScoresLoading && (
                  <span className="font-mono text-xs text-c-dim">LOADING...</span>
                )}
              </div>
              <AcsCoverageBars scores={treemapScores} />
              <details className="bezel rounded-lg border border-c-border group">
                <summary className="cursor-pointer list-none font-mono text-xs text-c-muted uppercase tracking-wider px-4 py-3 hover:text-c-text select-none flex items-center gap-2">
                  <span className="text-c-dim group-open:rotate-90 transition-transform inline-block">▸</span>
                  Show full element treemap
                </summary>
                <div className="px-2 pb-2">
                  <AcsCoverageTreemap scores={treemapScores} />
                </div>
              </details>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <WeakAreas scores={treemapScores} />
                <StudyRecommendations scores={treemapScores} />
              </div>
            </div>
          ) : (
            /* Overview View — Sessions + Weak Areas */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">RECENT EXAMS</h2>
                <div className="space-y-2">
                  {recentSessions.length === 0 ? (
                    <div className="bezel rounded-lg border border-c-border p-4 text-center">
                      <p className="text-base text-c-dim font-mono">No {RATING_LABELS[selectedRating]} exams yet</p>
                    </div>
                  ) : (
                    recentSessions.slice(0, 10).map((session) => {
                      const grade = session.result?.grade;
                      const gradeLabel = grade === 'satisfactory' ? 'SATISFACTORY'
                        : grade === 'unsatisfactory' ? 'UNSATISFACTORY'
                        : session.status === 'completed' ? 'INCOMPLETE' : null;
                      const gradeBadgeClass = grade === 'satisfactory'
                        ? 'bg-c-green-lo text-c-green border-c-green/20'
                        : grade === 'unsatisfactory'
                        ? 'bg-red-500/10 text-red-400 border-red-400/20'
                        : 'bg-c-amber-lo text-c-amber border-c-amber/20';
                      const statusLabel = session.status === 'active' ? 'IN PROGRESS' : session.status.toUpperCase();
                      const statusBadgeClass = session.status === 'completed'
                        ? 'bg-c-green-lo text-c-green border-c-green/20'
                        : session.status === 'active'
                        ? 'bg-c-cyan-lo text-c-cyan border-c-cyan/20'
                        : session.status === 'expired'
                        ? 'bg-red-500/10 text-red-400 border-red-400/20'
                        : 'bg-c-amber-lo text-c-amber border-c-amber/20';
                      const coveragePctSession = session.result
                        ? Math.round((session.result.elements_asked / session.result.total_elements_in_set) * 100)
                        : null;
                      const difficultyLabel = session.difficulty_preference
                        ? session.difficulty_preference.charAt(0).toUpperCase() + session.difficulty_preference.slice(1)
                        : null;
                      return (
                        <div
                          key={session.id}
                          className="iframe rounded-lg p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-mono text-c-text truncate">
                              {RATING_LABELS[session.rating]}
                              {session.aircraft_class ? ` ${session.aircraft_class}` : ''}
                              {difficultyLabel ? `, ${difficultyLabel}` : ''}
                            </p>
                            <p className="font-mono text-xs text-c-dim mt-0.5">
                              {new Date(session.started_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                              {' · '}{session.exchange_count || 0} exchanges
                              {coveragePctSession !== null ? ` · ${coveragePctSession}% coverage` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {gradeLabel && (
                              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${gradeBadgeClass}`}>
                                {gradeLabel}
                              </span>
                            )}
                            {!gradeLabel && (
                              <span className={`font-mono text-xs px-2 py-0.5 rounded border uppercase ${statusBadgeClass}`}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">WEAK AREAS</h2>
                  <WeakAreas scores={filteredScores} />
                </div>
                <div>
                  <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-3">STUDY PLAN</h2>
                  <StudyRecommendations scores={filteredScores} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
