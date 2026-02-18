'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatCents, formatPercent, relativeTime } from '@/lib/analytics-utils';

interface AnalyticsOverview {
  revenue: {
    mrr: number;
    arr: number;
    totalSubscribers: number;
    monthlySubscribers: number;
    annualSubscribers: number;
    trialingUsers: number;
    trialConversionRate: number;
    trialConvertedCount: number;
    trialTotalCount: number;
    churnRate: number;
    churnedLast30d: number;
  };
  growth: {
    totalUsers: number;
    tierBreakdown: { ground_school: number; checkride_prep: number; dpe_live: number };
    signupsPerDay: Array<{ date: string; count: number }>;
  };
  engagement: {
    ratingPopularity: Array<{ rating: string; count: number }>;
    sessionsPerDay: Array<{ date: string; count: number }>;
    avgSessionDurationMin: number;
    avgExchangesPerSession: number;
  };
  quality: {
    errorRatePerDay: Array<{ date: string; total: number; errors: number; rate: number }>;
    providerHealth: Array<{ provider: string; total: number; errors: number; rate: number }>;
  };
  measurementHealth: {
    posthog: {
      status: 'ok' | 'warning' | 'error' | 'unknown';
      lastEventAt: string | null;
      eventsLast24h: number;
      eventBreakdown: Array<{ event: string; count: number }>;
      message: string;
    };
    stripeWebhooks: {
      status: 'ok' | 'warning' | 'error';
      lastEventAt: string | null;
      eventsLast7d: number;
      failedLast7d: number;
      message: string;
    };
    gtm: {
      status: 'ok' | 'info';
      containerId: string;
      message: string;
    };
  };
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics/overview');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      setData(body);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">ANALYTICS</h1>
          {lastRefreshed && !loading && (
            <p className="font-mono text-[10px] text-c-dim mt-1 uppercase">
              Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={fetchAnalytics}
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
              <p className="font-mono text-xs text-c-red uppercase tracking-wider">FAILED TO LOAD ANALYTICS</p>
              <p className="text-xs text-c-muted mt-1">{error}</p>
              <button
                onClick={fetchAnalytics}
                className="mt-2 font-mono text-[10px] text-c-red hover:text-c-amber uppercase tracking-wider transition-colors"
              >
                &#8634; RETRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section: Measurement Health */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// MEASUREMENT HEALTH</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {loading && !data ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bezel rounded-lg border border-c-border p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-c-bezel flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 bg-c-bezel rounded w-20 mb-2" />
                    <div className="h-3 bg-c-bezel rounded w-32" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : data ? (
          <>
            <HealthIndicator
              label="PostHog"
              status={data.measurementHealth.posthog.status}
              message={data.measurementHealth.posthog.message}
              lastEventAt={data.measurementHealth.posthog.lastEventAt}
              detail={`${data.measurementHealth.posthog.eventsLast24h} events / 24h`}
            />
            <HealthIndicator
              label="Stripe Webhooks"
              status={data.measurementHealth.stripeWebhooks.status}
              message={data.measurementHealth.stripeWebhooks.message}
              lastEventAt={data.measurementHealth.stripeWebhooks.lastEventAt}
              detail={`${data.measurementHealth.stripeWebhooks.eventsLast7d} events / 7d`}
            />
            <HealthIndicator
              label="GTM"
              status={data.measurementHealth.gtm.status}
              message={data.measurementHealth.gtm.message}
              lastEventAt={null}
              detail={data.measurementHealth.gtm.containerId}
            />
          </>
        ) : null}
      </div>

      {/* Section: Revenue */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// REVENUE</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="MRR"
          value={data ? formatCents(data.revenue.mrr) : '$0.00'}
          detail={data ? `${formatCents(data.revenue.arr)} ARR` : 'Loading...'}
          color="cyan"
          loading={loading && !data}
        />
        <StatCard
          label="Subscribers"
          value={data?.revenue.totalSubscribers.toString() ?? '0'}
          detail={data ? `${data.revenue.monthlySubscribers} monthly \u00b7 ${data.revenue.annualSubscribers} annual \u00b7 ${data.revenue.trialingUsers} trialing` : 'Loading...'}
          color="cyan"
          loading={loading && !data}
        />
        <StatCard
          label="Trial Conversion"
          value={data ? formatPercent(data.revenue.trialConversionRate) : '0.0%'}
          detail={data ? `${data.revenue.trialConvertedCount}/${data.revenue.trialTotalCount} converted` : 'Loading...'}
          color="green"
          loading={loading && !data}
        />
        <StatCard
          label="Churn (30d)"
          value={data ? formatPercent(data.revenue.churnRate) : '0.0%'}
          detail={data ? `${data.revenue.churnedLast30d} canceled subscriptions` : 'Loading...'}
          color="amber"
          loading={loading && !data}
        />
      </div>

      {/* Section: Growth */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// GROWTH</p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <StatCard
          label="Total Users"
          value={data?.growth.totalUsers.toLocaleString() ?? '0'}
          detail=""
          color="cyan"
          loading={loading && !data}
        />
        <StatCard
          label="Tier Breakdown"
          value={data?.growth.totalUsers.toLocaleString() ?? '0'}
          detail={data ? `${data.growth.tierBreakdown.ground_school} ground \u00b7 ${data.growth.tierBreakdown.checkride_prep} prep \u00b7 ${data.growth.tierBreakdown.dpe_live} live` : 'Loading...'}
          color="cyan"
          loading={loading && !data}
        />
      </div>

      <div className="mb-8">
        <SparklineCard
          title="SIGNUPS / DAY (30D)"
          data={data?.growth.signupsPerDay ?? []}
          color="var(--color-c-cyan)"
          loading={loading && !data}
        />
      </div>

      {/* Section: Engagement */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// ENGAGEMENT</p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <StatCard
          label="Avg Duration"
          value={data ? `${data.engagement.avgSessionDurationMin.toFixed(1)} min` : '0.0 min'}
          detail=""
          color="amber"
          loading={loading && !data}
        />
        <StatCard
          label="Avg Exchanges"
          value={data ? data.engagement.avgExchangesPerSession.toFixed(1) : '0.0'}
          detail=""
          color="amber"
          loading={loading && !data}
        />
      </div>

      {/* Rating Popularity */}
      {data && data.engagement.ratingPopularity.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-5 mb-4">
          <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">Rating Popularity</p>
          <div className="space-y-2">
            {data.engagement.ratingPopularity.map(({ rating, count }) => {
              const maxCount = Math.max(...data.engagement.ratingPopularity.map(r => r.count), 1);
              return (
                <div key={rating} className="flex items-center gap-3">
                  <RatingBadge rating={rating} />
                  <div className="flex-1 h-2 bg-c-border rounded-full overflow-hidden">
                    <div className="h-full prog-c rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="font-mono text-xs text-c-text tabular-nums w-10 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="bezel rounded-lg border border-c-border p-5 mb-4 animate-pulse">
          <div className="h-3 bg-c-bezel rounded w-24 mb-3" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-5 bg-c-bezel rounded" />
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <SparklineCard
          title="SESSIONS / DAY (30D)"
          data={data?.engagement.sessionsPerDay ?? []}
          color="var(--color-c-cyan)"
          loading={loading && !data}
        />
      </div>

      {/* Section: Quality */}
      <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// QUALITY</p>

      <div className="mb-4">
        <SparklineCard
          title="ERROR RATE (14D)"
          data={(data?.quality.errorRatePerDay ?? []).map(d => ({ date: d.date, count: Math.round(d.rate * 1000) / 10 }))}
          color="var(--color-c-red)"
          loading={loading && !data}
          formatValue={(v) => `${v}%`}
        />
      </div>

      {/* Provider Health Table */}
      <div className="bezel rounded-lg border border-c-border overflow-hidden">
        {loading && !data ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-c-bezel rounded" />
            ))}
          </div>
        ) : !data || data.quality.providerHealth.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-mono text-xs text-c-dim uppercase">No data</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-c-border text-left">
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal">Provider</th>
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Requests</th>
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Errors</th>
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-c-border">
              {data.quality.providerHealth.map((p) => (
                <tr key={p.provider} className="hover:bg-c-elevated/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProviderDot provider={p.provider} />
                      <span className="font-mono text-xs text-c-text uppercase font-medium">{p.provider}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-c-text text-right tabular-nums">
                    {p.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.errors > 0 ? (
                      <span className="font-mono text-[10px] bg-c-red-dim/40 text-c-red px-2 py-0.5 rounded border border-c-red/20">
                        {p.errors}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-c-dim">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-right tabular-nums">
                    {p.rate > 0 ? (
                      <span className="text-c-red">{(p.rate * 100).toFixed(1)}%</span>
                    ) : (
                      <span className="text-c-green">0.0%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Components                                                  */
/* ------------------------------------------------------------------ */

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
      {detail && <p className="font-mono text-[10px] text-c-dim mt-1">{detail}</p>}
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

function HealthIndicator({ label, status, message, lastEventAt, detail }: {
  label: string;
  status: string;
  message: string;
  lastEventAt: string | null;
  detail: string;
}) {
  return (
    <div className="bezel rounded-lg border border-c-border p-4 flex items-center gap-3">
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        status === 'ok' ? 'bg-c-green' :
        status === 'warning' ? 'bg-c-amber' :
        status === 'error' ? 'bg-c-red' : 'bg-c-dim'
      }`} />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-c-text uppercase tracking-wider">{label}</p>
        <p className="font-mono text-[10px] text-c-muted truncate">{message}</p>
      </div>
      {lastEventAt && (
        <span className="font-mono text-[10px] text-c-dim flex-shrink-0">{relativeTime(lastEventAt)}</span>
      )}
    </div>
  );
}

function Sparkline({ data, color = 'var(--color-c-cyan)', height = 48 }: {
  data: Array<{ date: string; count: number }>;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map(d => d.count), 1);
  const width = 100;
  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (d.count / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill={color}
        fillOpacity="0.1"
        stroke="none"
      />
    </svg>
  );
}

function SparklineCard({ title, data, color, loading, formatValue }: {
  title: string;
  data: Array<{ date: string; count: number }>;
  color: string;
  loading: boolean;
  formatValue?: (v: number) => string;
}) {
  if (loading) {
    return (
      <div className="bezel rounded-lg border border-c-border p-5 animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-3 bg-c-bezel rounded w-32" />
          <div className="h-3 bg-c-bezel rounded w-16" />
        </div>
        <div className="iframe rounded-lg p-3">
          <div className="h-12 bg-c-bezel rounded" />
        </div>
      </div>
    );
  }

  const latestValue = data.length > 0 ? data[data.length - 1].count : 0;
  const displayValue = formatValue ? formatValue(latestValue) : latestValue.toString();

  return (
    <div className="bezel rounded-lg border border-c-border p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">{title}</p>
        <p className="font-mono text-xs text-c-cyan tabular-nums">{displayValue} today</p>
      </div>
      <div className="iframe rounded-lg p-3">
        <Sparkline data={data} color={color} height={48} />
      </div>
      {data.length > 0 && (
        <div className="flex justify-between mt-2">
          <span className="font-mono text-[10px] text-c-dim">{data[0]?.date}</span>
          <span className="font-mono text-[10px] text-c-dim">{data[data.length - 1]?.date}</span>
        </div>
      )}
    </div>
  );
}
