'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import WeakAreas from './components/WeakAreas';
import StudyRecommendations from './components/StudyRecommendations';
import type { ElementScore, AircraftClass, Rating } from '@/types/database';

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
      <p className="text-c-dim font-mono text-xs">LOADING TREEMAP...</p>
    </div>
  ),
});

interface Session {
  id: string;
  rating: Rating;
  status: 'active' | 'paused' | 'completed';
  started_at: string;
  ended_at: string | null;
  exchange_count: number;
  study_mode: string;
  difficulty_preference: string;
  aircraft_class?: string;
  acs_tasks_covered: { task_id: string; status: string; attempts?: number }[];
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
  icon: string;
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
    { id: 'first', label: 'First Session', icon: '1', earned: totalSessions >= 1 },
    { id: 'five', label: '5 Sessions', icon: '5', earned: completedSessions >= 5 },
    { id: 'ten', label: '10 Sessions', icon: '10', earned: completedSessions >= 10 },
    { id: 'exchanges50', label: '50 Exchanges', icon: '50', earned: totalExchanges >= 50 },
    { id: 'exchanges200', label: '200 Exchanges', icon: '200', earned: totalExchanges >= 200 },
    { id: 'coverage25', label: '25% Coverage', icon: '25%', earned: coveragePct >= 25 },
    { id: 'coverage50', label: '50% Coverage', icon: '50%', earned: coveragePct >= 50 },
    { id: 'coverage75', label: '75% Coverage', icon: '75%', earned: coveragePct >= 75 },
    { id: 'coverage100', label: 'Full Coverage', icon: '100%', earned: coveragePct >= 100 },
    { id: 'noWeak', label: 'No Weak Areas', icon: '0', earned: attemptedElements > 0 && weakCount === 0 },
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
  // Session-scoped treemap: null = "All Sessions (Lifetime)"
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
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
    ])
      .then(([sessionData, scoresData, taskData]) => {
        setSessions(sessionData.sessions || []);
        setElementScores(scoresData.scores || []);
        setTasks(taskData.tasks || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedRating, prefsLoaded]);

  // Filter sessions by selected rating
  const filteredSessions = useMemo(
    () => sessions.filter((s) => s.rating === selectedRating),
    [sessions, selectedRating]
  );

  // Auto-select latest session when sessions load
  useEffect(() => {
    if (filteredSessions.length > 0 && selectedSessionId === null) {
      setSelectedSessionId(filteredSessions[0].id);
    }
  }, [filteredSessions, selectedSessionId]);

  // Fetch session-specific scores when selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId) {
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
  const treemapScores = selectedSessionId ? filteredSessionScores : filteredScores;

  const totalSessions = filteredSessions.length;
  const completedSessions = filteredSessions.filter((s) => s.status === 'completed').length;
  const totalExchanges = filteredSessions.reduce((sum, s) => sum + (s.exchange_count || 0), 0);
  const allCoveredTasks = filteredSessions.flatMap((s) => s.acs_tasks_covered || []);
  const uniqueTasksCovered = new Set(allCoveredTasks.map((t) => t.task_id)).size;
  const attemptedElements = filteredScores.filter(s => s.total_attempts > 0).length;
  const totalElements = filteredScores.length;

  // Checkride readiness score (0-100)
  const readinessScore = useMemo(() => {
    if (attemptedElements === 0 || totalElements === 0) return 0;
    const satisfactory = filteredScores.filter(s => s.latest_score === 'satisfactory').length;
    const partial = filteredScores.filter(s => s.latest_score === 'partial').length;
    const coverageWeight = attemptedElements / totalElements;
    const qualityWeight = totalElements > 0
      ? (satisfactory + partial * 0.5) / totalElements
      : 0;
    return Math.round(coverageWeight * 40 + qualityWeight * 60);
  }, [filteredScores, attemptedElements, totalElements]);

  // Readiness tier
  const readinessTier = readinessScore >= 80 ? 'ready' : readinessScore >= 50 ? 'progressing' : readinessScore >= 20 ? 'building' : 'starting';
  const readinessColor = readinessTier === 'ready' ? 'text-c-green' : readinessTier === 'progressing' ? 'text-c-cyan' : readinessTier === 'building' ? 'text-c-amber' : 'text-c-muted';
  const readinessBg = readinessTier === 'ready' ? 'bg-c-green-lo' : readinessTier === 'progressing' ? 'bg-c-cyan-lo' : readinessTier === 'building' ? 'bg-c-amber-lo' : 'bg-c-bezel';
  const readinessGlow = readinessTier === 'ready' ? 'glow-g' : readinessTier === 'progressing' ? 'glow-c' : readinessTier === 'building' ? 'glow-a' : '';
  const readinessProgClass = readinessTier === 'ready' ? 'prog-g' : readinessTier === 'progressing' ? 'prog-c' : readinessTier === 'building' ? 'prog-a' : 'prog-a';

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
        <h1 className="font-mono font-bold text-xl text-c-amber glow-a tracking-wider uppercase">PROGRESS</h1>
        <p className="text-sm text-c-muted mt-1">
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
                className={`px-2.5 py-1.5 text-xs rounded-md font-mono transition-colors ${
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
                  className={`px-2.5 py-1.5 text-xs rounded-md font-mono transition-colors ${
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
              className={`px-3 py-1.5 text-xs rounded-md font-mono transition-colors ${
                view === 'overview' ? 'bg-c-elevated text-c-text font-semibold' : 'text-c-muted hover:text-c-text'
              }`}
            >
              OVERVIEW
            </button>
            <button
              onClick={() => setView('treemap')}
              className={`px-3 py-1.5 text-xs rounded-md font-mono transition-colors ${
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
            <p className="text-c-dim font-mono text-xs">LOADING YOUR PROGRESS...</p>
          </div>
        </div>
      ) : filteredSessions.length === 0 && elementScores.length === 0 ? (
        /* Empty state with CTA */
        <div className="bezel rounded-lg border border-c-border p-8 text-center">
          <div className="text-4xl mb-3 opacity-50">
            <span className="text-c-muted text-3xl">&#9636;</span>
          </div>
          <h2 className="font-mono font-semibold text-sm text-c-text uppercase mb-2">NO PROGRESS DATA YET</h2>
          <p className="text-sm text-c-muted mb-5 max-w-sm mx-auto">
            Complete your first practice session to start tracking your {RATING_LABELS[selectedRating]} checkride readiness.
          </p>
          <Link
            href="/practice"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-c-amber hover:bg-c-amber/90 text-c-bg text-xs font-mono font-semibold rounded-lg tracking-wide transition-colors shadow-lg shadow-c-amber/20 uppercase"
          >
            START PRACTICING
            <span>&#9654;</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Readiness Score + Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {/* Readiness Score */}
            <div className={`col-span-2 md:col-span-1 ${readinessBg} rounded-lg border border-c-border p-4 text-center`}>
              <p className={`text-3xl font-mono font-bold ${readinessColor} ${readinessGlow}`}>{readinessScore}</p>
              <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-0.5">READINESS</p>
              <div className="mt-2 h-1.5 bg-c-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${readinessProgClass}`}
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
            </div>
            <div className="bezel rounded-lg border border-c-border p-3 text-center">
              <p className="text-xl font-mono font-semibold text-c-text">{totalSessions}</p>
              <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-0.5">
                SESSIONS{completedSessions < totalSessions ? ` (${completedSessions} DONE)` : ''}
              </p>
            </div>
            <div className="bezel rounded-lg border border-c-border p-3 text-center">
              <p className="text-xl font-mono font-semibold text-c-text">{totalExchanges}</p>
              <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-0.5">EXCHANGES</p>
            </div>
            <div className="bezel rounded-lg border border-c-border p-3 text-center">
              <p className="text-xl font-mono font-semibold text-c-text">{coveragePct}%</p>
              <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-0.5">COVERAGE</p>
            </div>
            <div className="bezel rounded-lg border border-c-border p-3 text-center">
              <p className="text-xl font-mono font-semibold text-c-text">{attemptedElements}</p>
              <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-0.5">ELEMENTS</p>
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
                    className="shrink-0 inline-flex items-center gap-1.5 font-mono text-[10px] bg-c-bezel text-c-muted px-2.5 py-1 rounded-full border border-c-border"
                  >
                    <span className="text-c-amber font-bold text-[10px]">{a.icon}</span>
                    {a.label}
                  </span>
                ))}
                {nextAchievement && (
                  <span
                    title={`Next: ${nextAchievement.label}`}
                    className="shrink-0 inline-flex items-center gap-1.5 font-mono text-[10px] bg-c-panel text-c-dim px-2.5 py-1 rounded-full border border-c-border border-dashed"
                  >
                    <span className="text-c-dim font-bold text-[10px]">{nextAchievement.icon}</span>
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
                  <span className="text-c-red text-lg">&#9888;</span>
                  <div>
                    <p className="text-sm font-mono font-medium text-c-red">{weakCount} WEAK ELEMENT{weakCount !== 1 ? 'S' : ''} NEED ATTENTION</p>
                    <p className="text-xs text-c-muted">Practice focused on your gaps</p>
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
                <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider">SESSION:</label>
                <select
                  value={selectedSessionId || ''}
                  onChange={(e) => setSelectedSessionId(e.target.value || null)}
                  className="bg-c-panel border border-c-border rounded-lg text-xs text-c-text font-mono px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber"
                >
                  <option value="">All Sessions (Lifetime)</option>
                  {filteredSessions.map((s) => (
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
                  <span className="font-mono text-[10px] text-c-dim">LOADING...</span>
                )}
              </div>
              <AcsCoverageTreemap scores={treemapScores} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <WeakAreas scores={treemapScores} />
                <StudyRecommendations scores={treemapScores} />
              </div>
            </div>
          ) : (
            /* Overview View — Sessions + Weak Areas */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h2 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">RECENT SESSIONS</h2>
                <div className="space-y-2">
                  {filteredSessions.length === 0 ? (
                    <div className="bezel rounded-lg border border-c-border p-4 text-center">
                      <p className="text-sm text-c-dim font-mono">No {RATING_LABELS[selectedRating]} sessions yet</p>
                    </div>
                  ) : (
                    filteredSessions.slice(0, 10).map((session) => (
                      <div
                        key={session.id}
                        className="iframe rounded-lg p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-mono text-c-text">
                            {new Date(session.started_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="font-mono text-[10px] text-c-dim mt-0.5">
                            {session.exchange_count || 0} exchanges
                            {session.acs_tasks_covered?.length
                              ? ` / ${session.acs_tasks_covered.length} tasks`
                              : ''}
                            {session.aircraft_class ? ` · ${session.aircraft_class}` : ''}
                          </p>
                        </div>
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${
                            session.status === 'completed'
                              ? 'bg-c-green-lo text-c-green border-c-green/20'
                              : session.status === 'active'
                              ? 'bg-c-cyan-lo text-c-cyan border-c-cyan/20'
                              : 'bg-c-amber-lo text-c-amber border-c-amber/20'
                          }`}
                        >
                          {session.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">WEAK AREAS</h2>
                  <WeakAreas scores={filteredScores} />
                </div>
                <div>
                  <h2 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">STUDY PLAN</h2>
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
