'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import WeakAreas from './components/WeakAreas';
import StudyRecommendations from './components/StudyRecommendations';
import type { ElementScore, AircraftClass, Rating } from '@/types/database';

const RATING_OPTIONS: { value: Rating; label: string }[] = [
  { value: 'private', label: 'PPL' },
  { value: 'commercial', label: 'CPL' },
  { value: 'instrument', label: 'IR' },
];

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Your Progress</h1>
        <div className="flex items-center gap-3">
          {/* Rating selector */}
          <div className="flex gap-0.5 bg-gray-800 rounded-lg p-0.5">
            {RATING_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRating(r.value)}
                className={`px-2 py-1.5 text-xs rounded-md transition-colors ${
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
                className={`px-2 py-1.5 text-xs rounded-md transition-colors ${
                  selectedClass === cls.value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {cls.label}
              </button>
            ))}
          </div>
          {/* View toggle */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
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
      <p className="text-gray-400 mb-6">
        Track your performance across ACS areas and identify weak spots.
      </p>

      {loading ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center min-h-[200px]">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : filteredSessions.length === 0 && elementScores.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center min-h-[200px]">
          <p className="text-gray-500">No sessions yet. Start a practice exam to track your progress.</p>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3 mb-6">
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
              <p className="text-xl font-bold text-white">{uniqueTasksCovered}</p>
              <p className="text-xs text-gray-400 mt-0.5">ACS Tasks</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-white">{attemptedElements}</p>
              <p className="text-xs text-gray-400 mt-0.5">Elements ({selectedClass})</p>
            </div>
          </div>

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
                  {filteredSessions.slice(0, 10).map((session) => (
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
                  ))}
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
