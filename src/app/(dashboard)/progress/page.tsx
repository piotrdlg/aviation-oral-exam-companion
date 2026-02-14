'use client';

import { useEffect, useState } from 'react';

interface Session {
  id: string;
  status: 'active' | 'paused' | 'completed';
  started_at: string;
  ended_at: string | null;
  exchange_count: number;
  acs_tasks_covered: { task_id: string; status: string }[];
}

export default function ProgressPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/session')
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const totalExchanges = sessions.reduce((sum, s) => sum + (s.exchange_count || 0), 0);
  const allCoveredTasks = sessions.flatMap((s) => s.acs_tasks_covered || []);
  const uniqueTasksCovered = new Set(allCoveredTasks.map((t) => t.task_id)).size;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Your Progress</h1>
      <p className="text-gray-400 mb-8">
        Track your performance across ACS areas and identify weak spots.
      </p>

      {loading ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center min-h-[200px]">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-center justify-center min-h-[200px]">
          <p className="text-gray-500">No sessions yet. Start a practice exam to track your progress.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-white">{totalSessions}</p>
              <p className="text-xs text-gray-400 mt-1">Sessions{completedSessions < totalSessions ? ` (${completedSessions} completed)` : ''}</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-white">{totalExchanges}</p>
              <p className="text-xs text-gray-400 mt-1">Exchanges</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-white">{uniqueTasksCovered}</p>
              <p className="text-xs text-gray-400 mt-1">ACS Tasks</p>
            </div>
          </div>

          <h2 className="text-lg font-medium text-white mb-4">Recent Sessions</h2>
          <div className="space-y-3">
            {sessions.slice(0, 10).map((session) => (
              <div
                key={session.id}
                className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between"
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
                  <p className="text-xs text-gray-500 mt-1">
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
        </>
      )}
    </div>
  );
}
