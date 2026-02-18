'use client';

import { useEffect, useState, useCallback } from 'react';
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
  user_id?: string;
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
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async () => {
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
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Estimate daily cost from 7-day breakdown
  const estimatedDailyCost = stats?.costBreakdown.reduce((sum, entry) => {
    const rate = COST_PER_REQUEST[entry.provider] || 0.01;
    return sum + (entry.request_count / 7) * rate;
  }, 0) ?? 0;

  // Per-provider cost rollup
  const providerCosts = stats?.costBreakdown.reduce<Record<string, { requests: number; errors: number; cost: number; avgLatency: number; entries: number }>>((acc, entry) => {
    const key = entry.provider;
    if (!acc[key]) acc[key] = { requests: 0, errors: 0, cost: 0, avgLatency: 0, entries: 0 };
    acc[key].requests += entry.request_count;
    acc[key].errors += entry.error_count;
    acc[key].avgLatency += entry.avg_latency;
    acc[key].entries += 1;
    const rate = COST_PER_REQUEST[entry.provider] || 0.01;
    acc[key].cost += entry.request_count * rate;
    return acc;
  }, {}) ?? {};

  const totalWeeklyCost = Object.values(providerCosts).reduce((sum, p) => sum + p.cost, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          {lastRefreshed && !loading && (
            <p className="text-xs text-gray-500 mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm text-red-300 font-medium">Failed to load dashboard</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
              <button
                onClick={fetchDashboard}
                className="mt-2 text-xs text-red-400 hover:text-red-300 underline transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Users"
          value={stats?.totalUsers.toLocaleString() ?? '0'}
          detail={stats ? `${stats.dau} DAU / ${stats.wau} WAU / ${stats.mau} MAU` : 'Loading...'}
          color="text-blue-400"
          loading={loading && !stats}
        />
        <StatCard
          label="Active Sessions"
          value={stats?.activeSessions.toString() ?? '0'}
          detail={stats ? `${stats.sessionsToday} today / ${stats.sessionsThisWeek} this week` : 'Loading...'}
          color="text-green-400"
          loading={loading && !stats}
        />
        <StatCard
          label="7d Avg Exchanges"
          value={stats?.avgExchanges7d.toFixed(1) ?? '0'}
          detail={stats ? `${stats.avgDurationMin7d.toFixed(1)} min avg duration` : 'Loading...'}
          color="text-purple-400"
          loading={loading && !stats}
        />
        <StatCard
          label="Est. Daily Cost"
          value={`$${estimatedDailyCost.toFixed(2)}`}
          detail={stats ? `$${totalWeeklyCost.toFixed(2)} / 7 days` : 'Loading...'}
          color="text-amber-400"
          loading={loading && !stats}
        />
      </div>

      {/* 2. Anomaly Alerts */}
      {stats && stats.anomalyUsers.length > 0 && (
        <div className="mb-6">
          <div className="bg-amber-900/10 border border-amber-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h2 className="text-sm font-medium text-amber-300">
                {stats.anomalyUsers.length} Anomal{stats.anomalyUsers.length === 1 ? 'y' : 'ies'} Detected
              </h2>
              <span className="text-xs text-amber-500/70">High usage (&gt;5x avg, 7d)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {stats.anomalyUsers.map((user) => (
                <Link
                  key={user.id}
                  href={`/admin/users/${user.id}`}
                  className="flex items-center justify-between px-3 py-2 bg-amber-900/15 hover:bg-amber-900/30 rounded-lg transition-colors group"
                >
                  <span className="text-sm text-amber-200 truncate mr-2">{user.email}</span>
                  <span className="text-xs text-amber-400/70 flex-shrink-0 group-hover:text-amber-300">
                    {user.request_count} req
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No anomalies — subtle confirmation */}
      {stats && stats.anomalyUsers.length === 0 && (
        <div className="mb-6 flex items-center gap-2 px-3 py-2 bg-green-900/10 border border-green-800/20 rounded-lg">
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs text-green-400/80">No usage anomalies detected</span>
        </div>
      )}

      {/* 3. Recent Sessions Table */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          Recent Sessions
        </h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rating</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Exchanges</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading && !stats ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-5 bg-gray-800 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : !stats || stats.recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                      No data
                    </td>
                  </tr>
                ) : (
                  stats.recentSessions.map((session) => {
                    const durationMin = session.ended_at
                      ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
                      : null;
                    return (
                      <tr key={session.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3">
                          {session.user_id ? (
                            <Link
                              href={`/admin/users/${session.user_id}`}
                              className="text-gray-300 hover:text-blue-400 truncate max-w-[180px] block transition-colors"
                            >
                              {session.user_email || 'Unknown'}
                            </Link>
                          ) : (
                            <span className="text-gray-300 truncate max-w-[180px] block">
                              {session.user_email || 'Unknown'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RatingBadge rating={session.rating} />
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-right tabular-nums">
                          {session.exchange_count}
                        </td>
                        <td className="px-4 py-3">
                          <SessionStatusBadge status={session.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                          {durationMin !== null ? `${durationMin}m` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs text-right">
                          {formatRelativeTime(session.started_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Cost Breakdown */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          7-Day Cost Breakdown
        </h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {loading && !stats ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-800 rounded" />
              ))}
            </div>
          ) : !stats || stats.costBreakdown.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-500">No data</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Provider</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Requests</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Avg Latency</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Errors</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {Object.entries(providerCosts)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([provider, data]) => {
                    const avgLat = data.entries > 0 ? data.avgLatency / data.entries : 0;
                    const errorRate = data.requests > 0 ? (data.errors / data.requests) * 100 : 0;
                    return (
                      <tr key={provider} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ProviderDot provider={provider} />
                            <span className="text-gray-300 capitalize font-medium">{provider}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-right tabular-nums">
                          {data.requests.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-right tabular-nums text-xs">
                          {avgLat > 0 ? `${Math.round(avgLat)}ms` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {data.errors > 0 ? (
                            <span className="text-red-400 text-xs">
                              {data.errors} ({errorRate.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-amber-400 text-right tabular-nums font-medium">
                          ${data.cost.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                {/* Total row */}
                <tr className="bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400 font-medium">Total</td>
                  <td className="px-4 py-3 text-gray-300 text-right tabular-nums font-medium">
                    {Object.values(providerCosts).reduce((s, p) => s + p.requests, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Object.values(providerCosts).reduce((s, p) => s + p.errors, 0) > 0 ? (
                      <span className="text-red-400 text-xs font-medium">
                        {Object.values(providerCosts).reduce((s, p) => s + p.errors, 0)}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-amber-300 text-right tabular-nums font-bold">
                    ${totalWeeklyCost.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        {stats && stats.costBreakdown.length > 0 && (
          <p className="text-xs text-gray-600 mt-2">
            Cost estimates based on average per-request rates. Actual costs may vary.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, color, loading }: {
  label: string;
  value: string;
  detail: string;
  color: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 animate-pulse">
        <div className="h-3 bg-gray-800 rounded w-20 mb-3" />
        <div className="h-7 bg-gray-800 rounded w-14 mb-2" />
        <div className="h-3 bg-gray-800 rounded w-28" />
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}

function RatingBadge({ rating }: { rating: string }) {
  const styles: Record<string, string> = {
    private: 'bg-blue-900/30 text-blue-400',
    commercial: 'bg-purple-900/30 text-purple-400',
    instrument: 'bg-cyan-900/30 text-cyan-400',
    atp: 'bg-amber-900/30 text-amber-400',
  };

  const labels: Record<string, string> = {
    private: 'PPL',
    commercial: 'CPL',
    instrument: 'IR',
    atp: 'ATP',
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles[rating] || 'bg-gray-800 text-gray-400'} uppercase font-medium`}>
      {labels[rating] || rating}
    </span>
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

function ProviderDot({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    anthropic: 'bg-orange-400',
    openai: 'bg-green-400',
    deepgram: 'bg-blue-400',
    cartesia: 'bg-purple-400',
  };

  return (
    <span className={`w-2 h-2 rounded-full ${colors[provider] || 'bg-gray-500'}`} />
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
