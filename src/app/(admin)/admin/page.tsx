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
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">DASHBOARD</h1>
          {lastRefreshed && !loading && (
            <p className="font-mono text-[10px] text-c-dim mt-1 uppercase">
              Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-c-bezel hover:bg-c-elevated border border-c-border hover:border-c-border-hi rounded-lg text-xs text-c-text font-mono uppercase tracking-wide transition-colors disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>&#8634;</span>
          {loading ? 'REFRESHING...' : 'REFRESH'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bezel rounded-lg border border-c-red/30 border-l-2 p-5 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-c-red text-lg flex-shrink-0">&#9888;</span>
            <div>
              <p className="font-mono text-xs text-c-red uppercase tracking-wider">FAILED TO LOAD DASHBOARD</p>
              <p className="text-xs text-c-muted mt-1">{error}</p>
              <button
                onClick={fetchDashboard}
                className="mt-2 font-mono text-[10px] text-c-red hover:text-c-amber uppercase tracking-wider transition-colors"
              >
                &#8634; RETRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section: Metrics */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// METRICS</p>

      {/* 1. Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Users"
          value={stats?.totalUsers.toLocaleString() ?? '0'}
          detail={stats ? `${stats.dau} DAU / ${stats.wau} WAU / ${stats.mau} MAU` : 'Loading...'}
          color="cyan"
          loading={loading && !stats}
        />
        <StatCard
          label="Active Sessions"
          value={stats?.activeSessions.toString() ?? '0'}
          detail={stats ? `${stats.sessionsToday} today / ${stats.sessionsThisWeek} this week` : 'Loading...'}
          color="green"
          loading={loading && !stats}
          live
        />
        <StatCard
          label="7d Avg Exchanges"
          value={stats?.avgExchanges7d.toFixed(1) ?? '0'}
          detail={stats ? `${stats.avgDurationMin7d.toFixed(1)} min avg duration` : 'Loading...'}
          color="amber"
          loading={loading && !stats}
        />
        <StatCard
          label="Est. Daily Cost"
          value={`$${estimatedDailyCost.toFixed(2)}`}
          detail={stats ? `$${totalWeeklyCost.toFixed(2)} / 7 days` : 'Loading...'}
          color="amber"
          loading={loading && !stats}
        />
      </div>

      {/* Section: Alerts */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// ALERTS</p>

      {/* 2. Anomaly Alerts */}
      {stats && stats.anomalyUsers.length > 0 && (
        <div className="mb-8">
          <div className="bezel rounded-lg border border-c-border border-l-2 border-l-c-amber p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-c-amber text-sm">&#9888;</span>
              <h2 className="font-mono text-xs font-semibold text-c-amber uppercase tracking-wider">
                {stats.anomalyUsers.length} ANOMAL{stats.anomalyUsers.length === 1 ? 'Y' : 'IES'} DETECTED
              </h2>
              <span className="font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20">
                HIGH USAGE &gt;5X AVG, 7D
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {stats.anomalyUsers.map((user) => (
                <Link
                  key={user.id}
                  href={`/admin/users/${user.id}`}
                  className="flex items-center justify-between px-3 py-2 iframe rounded-lg border-l-2 border-l-c-amber transition-colors hover:bg-c-elevated/50 group"
                >
                  <span className="font-mono text-xs text-c-text truncate mr-2">{user.email}</span>
                  <span className="font-mono text-[10px] bg-c-red-dim/40 text-c-red px-1.5 rounded-full flex-shrink-0 group-hover:bg-c-red-dim/60">
                    {user.request_count} REQ
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No anomalies */}
      {stats && stats.anomalyUsers.length === 0 && (
        <div className="mb-8 flex items-center gap-2 px-3 py-2 iframe rounded-lg border-l-2 border-l-c-green">
          <span className="text-c-green text-sm glow-g">&#10003;</span>
          <span className="font-mono text-[10px] text-c-green uppercase tracking-wider">No usage anomalies detected</span>
        </div>
      )}

      {/* Section: Active Sessions */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// ACTIVE SESSIONS</p>

      {/* 3. Recent Sessions Table */}
      <div className="mb-8">
        <div className="bezel rounded-lg border border-c-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-c-border text-left">
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal">User</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal">Rating</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Exchanges</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal">Status</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal">Duration</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-c-border">
                {loading && !stats ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-5 bg-c-bezel rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : !stats || stats.recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-c-dim font-mono text-xs uppercase">
                      No data
                    </td>
                  </tr>
                ) : (
                  stats.recentSessions.map((session) => {
                    const durationMin = session.ended_at
                      ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
                      : null;
                    return (
                      <tr key={session.id} className="hover:bg-c-elevated/50 transition-colors">
                        <td className="px-4 py-3">
                          {session.user_id ? (
                            <Link
                              href={`/admin/users/${session.user_id}`}
                              className="font-mono text-xs text-c-text hover:text-c-cyan truncate max-w-[180px] block transition-colors"
                            >
                              {session.user_email || 'Unknown'}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-c-text truncate max-w-[180px] block">
                              {session.user_email || 'Unknown'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RatingBadge rating={session.rating} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-c-text text-right tabular-nums">
                          {session.exchange_count}
                        </td>
                        <td className="px-4 py-3">
                          <SessionStatusBadge status={session.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-c-dim tabular-nums">
                          {durationMin !== null ? `${durationMin}m` : '\u2014'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-c-dim text-right">
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

      {/* Section: Costs */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// COSTS</p>

      {/* 4. Cost Breakdown */}
      <div>
        <div className="bezel rounded-lg border border-c-border overflow-hidden">
          {loading && !stats ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-c-bezel rounded" />
              ))}
            </div>
          ) : !stats || stats.costBreakdown.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-mono text-xs text-c-dim uppercase">No data</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-c-border text-left">
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal">Provider</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Requests</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Avg Latency</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Errors</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-c-border">
                {Object.entries(providerCosts)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([provider, data]) => {
                    const avgLat = data.entries > 0 ? data.avgLatency / data.entries : 0;
                    const errorRate = data.requests > 0 ? (data.errors / data.requests) * 100 : 0;
                    const costPct = totalWeeklyCost > 0 ? (data.cost / totalWeeklyCost) * 100 : 0;
                    return (
                      <tr key={provider} className="hover:bg-c-elevated/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ProviderDot provider={provider} />
                            <span className="font-mono text-xs text-c-text uppercase font-medium">{provider}</span>
                          </div>
                          {/* Cost proportion bar */}
                          <div className="mt-1.5 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full prog-a" style={{ width: `${costPct}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-c-text text-right tabular-nums">
                          {data.requests.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-c-muted text-right tabular-nums">
                          {avgLat > 0 ? `${Math.round(avgLat)}ms` : '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {data.errors > 0 ? (
                            <span className="font-mono text-[10px] bg-c-red-dim/40 text-c-red px-2 py-0.5 rounded border border-c-red/20">
                              {data.errors} ({errorRate.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-c-dim">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-c-amber text-right tabular-nums font-medium">
                          ${data.cost.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                {/* Total row */}
                <tr className="bg-c-bezel/30">
                  <td className="px-4 py-3 font-mono text-xs text-c-muted uppercase font-medium">Total</td>
                  <td className="px-4 py-3 font-mono text-xs text-c-text text-right tabular-nums font-medium">
                    {Object.values(providerCosts).reduce((s, p) => s + p.requests, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Object.values(providerCosts).reduce((s, p) => s + p.errors, 0) > 0 ? (
                      <span className="font-mono text-[10px] text-c-red font-medium">
                        {Object.values(providerCosts).reduce((s, p) => s + p.errors, 0)}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-c-dim">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-c-amber text-right tabular-nums font-bold glow-a">
                    ${totalWeeklyCost.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        {stats && stats.costBreakdown.length > 0 && (
          <p className="font-mono text-[10px] text-c-dim mt-2">
            Cost estimates based on average per-request rates. Actual costs may vary.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, color, loading, live }: {
  label: string;
  value: string;
  detail: string;
  color: string;
  loading: boolean;
  live?: boolean;
}) {
  const colorMap: Record<string, { text: string; glow: string; prog: string }> = {
    cyan: { text: 'text-c-cyan', glow: 'glow-c', prog: 'prog-c' },
    green: { text: 'text-c-green', glow: 'glow-g', prog: 'prog-g' },
    amber: { text: 'text-c-amber', glow: 'glow-a', prog: 'prog-a' },
  };
  const c = colorMap[color] || colorMap.amber;

  if (loading) {
    return (
      <div className="bezel rounded-lg border border-c-border p-5 animate-pulse">
        <div className="h-3 bg-c-bezel rounded w-20 mb-3" />
        <div className="h-7 bg-c-bezel rounded w-14 mb-2" />
        <div className="h-3 bg-c-bezel rounded w-28" />
      </div>
    );
  }

  return (
    <div className={`bezel rounded-lg border border-c-border p-5${live ? ' ipulse' : ''}`}>
      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1">{label}</p>
      <div className="iframe rounded-lg p-3 mb-2">
        <p className={`text-2xl font-bold font-mono tabular-nums ${c.text} ${c.glow}`}>{value}</p>
      </div>
      <p className="font-mono text-[10px] text-c-dim mt-1">{detail}</p>
    </div>
  );
}

function RatingBadge({ rating }: { rating: string }) {
  const styles: Record<string, string> = {
    private: 'bg-c-cyan-lo text-c-cyan border-c-cyan/20',
    commercial: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    instrument: 'bg-c-green-lo text-c-green border-c-green/20',
    atp: 'bg-c-amber-lo text-c-amber border-c-amber/20',
  };

  const labels: Record<string, string> = {
    private: 'PPL',
    commercial: 'CPL',
    instrument: 'IR',
    atp: 'ATP',
  };

  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${styles[rating] || 'bg-c-bezel text-c-muted border-c-border'} uppercase`}>
      {labels[rating] || rating}
    </span>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-c-green-lo text-c-green border-c-green/20',
    completed: 'bg-c-cyan-lo text-c-cyan border-c-cyan/20',
    paused: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    abandoned: 'bg-c-bezel text-c-muted border-c-border',
    expired: 'bg-c-amber-lo text-c-amber border-c-amber/20',
  };

  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${styles[status] || 'bg-c-bezel text-c-muted border-c-border'} uppercase`}>
      {status}
    </span>
  );
}

function ProviderDot({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    anthropic: 'bg-c-amber',
    openai: 'bg-c-green',
    deepgram: 'bg-c-cyan',
    cartesia: 'bg-c-red',
  };

  return (
    <span className={`w-2 h-2 rounded-full ${colors[provider] || 'bg-c-dim'}`} />
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
