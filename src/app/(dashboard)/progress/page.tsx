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
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center" style={{ height: 460 }}>
      <p className="text-gray-500">Loading treemap...</p>
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
  const readinessColor = readinessTier === 'ready' ? 'text-green-400' : readinessTier === 'progressing' ? 'text-blue-400' : readinessTier === 'building' ? 'text-yellow-400' : 'text-gray-400';
  const readinessBg = readinessTier === 'ready' ? 'from-green-500/20' : readinessTier === 'progressing' ? 'from-blue-500/20' : readinessTier === 'building' ? 'from-yellow-500/20' : 'from-gray-500/10';

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
        <h1 className="text-2xl font-bold text-white">Your Progress</h1>
        <p className="text-sm text-gray-400 mt-1">
          {RATING_LABELS[selectedRating]} ({selectedClass}) checkride preparation
        </p>
      </div>

      {/* Sticky tabs */}
      <div className="sticky top-0 z-10 bg-gray-950 pb-4 pt-2 -mx-1 px-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Rating selector */}
          <div className="flex gap-0.5 bg-gray-800 rounded-lg p-0.5">
            {RATING_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRating(r.value)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  selectedRating === r.value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Class selector */}
          <div className="flex gap-0.5 bg-gray-800 rounded-lg p-0.5">
            {CLASS_OPTIONS.map((cls) => (
              <button
                key={cls.value}
                onClick={() => setSelectedClass(cls.value)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  selectedClass === cls.value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {cls.label}
              </button>
            ))}
          </div>
          {/* View toggle */}
          <div className="flex gap-0.5 bg-gray-800 rounded-lg p-0.5 ml-auto">
            <button
              onClick={() => setView('overview')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                view === 'overview' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('treemap')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                view === 'treemap' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              ACS Map
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse">
                <div className="h-6 w-12 bg-gray-800 rounded mx-auto mb-2" />
                <div className="h-3 w-16 bg-gray-800 rounded mx-auto" />
              </div>
            ))}
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center min-h-[200px]">
            <p className="text-gray-500">Loading your progress...</p>
          </div>
        </div>
      ) : filteredSessions.length === 0 && elementScores.length === 0 ? (
        /* Empty state with CTA */
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <div className="text-4xl mb-3 opacity-50">
            <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-white mb-2">No progress data yet</h2>
          <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
            Complete your first practice session to start tracking your {RATING_LABELS[selectedRating]} checkride readiness.
          </p>
          <Link
            href="/practice"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Start Practicing
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      ) : (
        <>
          {/* Readiness Score + Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {/* Readiness Score — spans 1 col on mobile, 1 col on desktop */}
            <div className={`col-span-2 md:col-span-1 bg-gradient-to-br ${readinessBg} to-gray-900 rounded-xl border border-gray-800 p-4 text-center`}>
              <p className={`text-3xl font-bold ${readinessColor}`}>{readinessScore}</p>
              <p className="text-xs text-gray-400 mt-0.5">Readiness</p>
              <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    readinessTier === 'ready' ? 'bg-green-500' : readinessTier === 'progressing' ? 'bg-blue-500' : readinessTier === 'building' ? 'bg-yellow-500' : 'bg-gray-600'
                  }`}
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-white">{totalSessions}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Sessions{completedSessions < totalSessions ? ` (${completedSessions} done)` : ''}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-white">{totalExchanges}</p>
              <p className="text-xs text-gray-400 mt-0.5">Exchanges</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-white">{coveragePct}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Coverage</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-white">{attemptedElements}</p>
              <p className="text-xs text-gray-400 mt-0.5">Elements</p>
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
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-full text-xs text-gray-300"
                  >
                    <span className="text-blue-400 font-bold text-[10px]">{a.icon}</span>
                    {a.label}
                  </span>
                ))}
                {nextAchievement && (
                  <span
                    title={`Next: ${nextAchievement.label}`}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 border border-gray-800 border-dashed rounded-full text-xs text-gray-500"
                  >
                    <span className="text-gray-600 font-bold text-[10px]">{nextAchievement.icon}</span>
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
                className="flex items-center justify-between w-full px-4 py-3 bg-red-900/15 hover:bg-red-900/25 border border-red-800/30 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-red-300">{weakCount} weak element{weakCount !== 1 ? 's' : ''} need attention</p>
                    <p className="text-xs text-gray-400">Practice focused on your gaps</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-500 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          )}

          {view === 'treemap' ? (
            /* Treemap + Weak Areas View */
            <div className="space-y-4">
              {/* Session selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Session:</label>
                <select
                  value={selectedSessionId || ''}
                  onChange={(e) => setSelectedSessionId(e.target.value || null)}
                  className="bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  <span className="text-xs text-gray-500">Loading...</span>
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
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Recent Sessions</h2>
                <div className="space-y-2">
                  {filteredSessions.length === 0 ? (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
                      <p className="text-sm text-gray-500">No {RATING_LABELS[selectedRating]} sessions yet</p>
                    </div>
                  ) : (
                    filteredSessions.slice(0, 10).map((session) => (
                      <div
                        key={session.id}
                        className="bg-gray-900 rounded-xl border border-gray-800 p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm text-white">
                            {new Date(session.started_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {session.exchange_count || 0} exchanges
                            {session.acs_tasks_covered?.length
                              ? ` / ${session.acs_tasks_covered.length} tasks`
                              : ''}
                            {session.aircraft_class ? ` · ${session.aircraft_class}` : ''}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            session.status === 'completed'
                              ? 'bg-green-900/30 text-green-400'
                              : session.status === 'active'
                              ? 'bg-blue-900/30 text-blue-400'
                              : 'bg-yellow-900/30 text-yellow-400'
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
                  <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Weak Areas</h2>
                  <WeakAreas scores={filteredScores} />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Study Plan</h2>
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
