'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import WeakAreas from './components/WeakAreas';
import StudyRecommendations from './components/StudyRecommendations';
import type { ElementScore } from '@/types/database';

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
  status: 'active' | 'paused' | 'completed';
  started_at: string;
  ended_at: string | null;
  exchange_count: number;
  study_mode: string;
  difficulty_preference: string;
  acs_tasks_covered: { task_id: string; status: string; attempts?: number }[];
}

export default function ProgressPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [elementScores, setElementScores] = useState<ElementScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'overview' | 'treemap'>('overview');

  useEffect(() => {
    Promise.all([
      fetch('/api/session').then((res) => res.json()),
      fetch('/api/session?action=element-scores').then((res) => res.json()).catch(() => ({ scores: [] })),
    ])
      .then(([sessionData, scoresData]) => {
        setSessions(sessionData.sessions || []);
        setElementScores(scoresData.scores || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const totalExchanges = sessions.reduce((sum, s) => sum + (s.exchange_count || 0), 0);
  const allCoveredTasks = sessions.flatMap((s) => s.acs_tasks_covered || []);
  const uniqueTasksCovered = new Set(allCoveredTasks.map((t) => t.task_id)).size;
  const attemptedElements = elementScores.filter(s => s.total_attempts > 0).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Your Progress</h1>
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
      <p className="text-gray-400 mb-6">
        Track your performance across ACS areas and identify weak spots.
      </p>

      {loading ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center min-h-[200px]">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : sessions.length === 0 && elementScores.length === 0 ? (
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
              <p className="text-xs text-gray-400 mt-0.5">Elements</p>
            </div>
          </div>

          {view === 'treemap' ? (
            /* Treemap + Weak Areas View */
            <div className="space-y-4">
              <AcsCoverageTreemap scores={elementScores} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <WeakAreas scores={elementScores} />
                <StudyRecommendations scores={elementScores} />
              </div>
            </div>
          ) : (
            /* Overview View — Sessions + Weak Areas */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Recent Sessions</h2>
                <div className="space-y-2">
                  {sessions.slice(0, 10).map((session) => (
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
                  <WeakAreas scores={elementScores} />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Study Plan</h2>
                  <StudyRecommendations scores={elementScores} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
