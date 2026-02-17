'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardStats {
  totalUsers: number;
  dau: number;
  wau: number;
  mau: number;
  activeSessions: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  avgExchanges7d: number;
  avgDurationMin7d: number;
  estDailyCost: number;
  costBreakdown: CostEntry[];
  anomalyUsers: AnomalyUser[];
  recentSessions: RecentSession[];
}

interface CostEntry {
  provider: string;
  event_type: string;
  request_count: number;
  total_quantity: number;
  avg_latency: number;
  error_count: number;
}

interface AnomalyUser {
  id: string;
  email: string;
  request_count: number;
}

interface RecentSession {
  id: string;
  user_email: string;
  rating: string;
  status: string;
  exchange_count: number;
  started_at: string;
  ended_at: string | null;
}

// Rough cost estimates per provider request
const COST_PER_REQUEST: Record<string, number> = {
  anthropic: 0.015,
  openai: 0.006,
  deepgram: 0.004,
  cartesia: 0.008,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dashboard');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-5 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-800 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 animate-pulse">
          <div className="h-4 bg-gray-800 rounded w-40 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-6 text-center">
          <p className="text-red-300 mb-3">{error}</p>
          <button
            onClick={fetchDashboard}
            className="text-sm text-red-400 hover:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Estimate daily cost from 7-day breakdown
  const estimatedDailyCost = stats.costBreakdown.reduce((sum, entry) => {
    const rate = COST_PER_REQUEST[entry.provider] || 0.01;
    return sum + (entry.request_count / 7) * rate;
  }, 0);

  const statCards = [
    {
      label: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      detail: `${stats.dau} DAU / ${stats.wau} WAU / ${stats.mau} MAU`,
      color: 'text-blue-400',
    },
    {
      label: 'Active Sessions',
      value: stats.activeSessions.toString(),
      detail: `${stats.sessionsToday} today / ${stats.sessionsThisWeek} this week`,
      color: 'text-green-400',
    },
    {
      label: '7d Avg Exchanges',
      value: stats.avgExchanges7d.toFixed(1),
      detail: `${stats.avgDurationMin7d.toFixed(1)} min avg duration`,
      color: 'text-purple-400',
    },
    {
      label: 'Est. Daily Cost',
      value: `$${estimatedDailyCost.toFixed(2)}`,
      detail: `From ${stats.costBreakdown.length} provider(s)`,
      color: 'text-amber-400',
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <button
          onClick={fetchDashboard}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-900 rounded-xl border border-gray-800 p-5"
          >
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
              {card.label}
            </p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sessions Table */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Recent Sessions
          </h2>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rating</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Exchanges</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {stats.recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No sessions found
                    </td>
                  </tr>
                ) : (
                  stats.recentSessions.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-gray-300 truncate max-w-[160px] block">
                          {session.user_email || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 uppercase">
                          {session.rating}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{session.exchange_count}</td>
                      <td className="px-4 py-3">
                        <SessionStatusBadge status={session.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatRelativeTime(session.started_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Anomaly Alerts */}
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Anomaly Alerts
          </h2>
          <div className="space-y-2">
            {stats.anomalyUsers.length === 0 ? (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
                <p className="text-gray-500 text-sm">No anomalies detected</p>
              </div>
            ) : (
              stats.anomalyUsers.map((user) => (
                <Link
                  key={user.id}
                  href={`/admin/users/${user.id}`}
                  className="block bg-amber-900/10 border border-amber-800/30 rounded-xl p-4 hover:bg-amber-900/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-amber-200 truncate">{user.email}</p>
                      <p className="text-xs text-amber-400/70 mt-0.5">
                        {user.request_count} requests (7d)
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 flex-shrink-0">
                      High usage
                    </span>
                  </div>
                </Link>
              ))
            )}

            {/* Cost Breakdown */}
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mt-6 mb-3">
              7-Day Provider Costs
            </h2>
            <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
              {stats.costBreakdown.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-gray-500 text-sm">No usage data</p>
                </div>
              ) : (
                stats.costBreakdown.map((entry, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-300 capitalize">{entry.provider}</p>
                      <p className="text-xs text-gray-500">{entry.event_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-300">
                        {entry.request_count.toLocaleString()} req
                      </p>
                      {entry.error_count > 0 && (
                        <p className="text-xs text-red-400">{entry.error_count} errors</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
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

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
