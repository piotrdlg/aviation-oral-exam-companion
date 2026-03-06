'use client';

import { useState, useEffect, useCallback } from 'react';

interface KpiSummary {
  summary: {
    totalApproved: number;
    withConnectedStudents: number;
    withPaidStudents: number;
  };
  funnel: {
    invites7d: number;
    claims7d: number;
    totalConnections: number;
    totalPaidStudents: number;
  };
  instructors: {
    instructorId: string;
    displayName: string;
    connectedStudents: number;
    pendingRequests: number;
    paidStudents: number;
    invites7d: number;
    claims7d: number;
  }[];
  generatedAt: string;
}

interface FraudData {
  flagged: {
    instructorId: string;
    displayName: string;
    riskLevel: string;
    riskScore: number;
    reasons: string[];
    recommendedAction: string;
  }[];
  total: number;
}

interface QuotaData {
  defaults: {
    emailInviteLimit: number;
    tokenCreationLimit: number;
    adaptiveQuotas: { enabled: boolean };
  };
  overrides: {
    active: number;
    list: { instructorId: string; emailInviteLimit: number | null; tokenCreationLimit: number | null; note: string | null }[];
  };
  usage7d: {
    activeInstructors: number;
    emails: { p50: number; p90: number; p95: number; max: number };
    tokens: { p50: number; p90: number; p95: number; max: number };
  };
}

export default function PartnershipDashboardPage() {
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [fraud, setFraud] = useState<FraudData | null>(null);
  const [quotas, setQuotas] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, fraudRes, quotaRes] = await Promise.all([
        fetch('/api/admin/partnership/kpis'),
        fetch('/api/admin/partnership/fraud'),
        fetch('/api/admin/partnership/quotas'),
      ]);

      if (!kpiRes.ok || !fraudRes.ok || !quotaRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [kpiData, fraudData, quotaData] = await Promise.all([
        kpiRes.json(),
        fraudRes.json(),
        quotaRes.json(),
      ]);

      setKpis(kpiData);
      setFraud(fraudData);
      setQuotas(quotaData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg text-c-amber uppercase tracking-widest">Partnership Dashboard</h1>
        <div className="text-c-muted font-mono text-sm">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg text-c-amber uppercase tracking-widest">Partnership Dashboard</h1>
        <div className="text-red-400 font-mono text-sm">Error: {error}</div>
        <button onClick={fetchData} className="text-c-amber font-mono text-xs uppercase hover:underline">
          Retry
        </button>
      </div>
    );
  }

  // Sort instructors by connected students descending
  const topInviteVolume = [...(kpis?.instructors || [])]
    .sort((a, b) => b.invites7d - a.invites7d)
    .slice(0, 10);

  const topPaidConversions = [...(kpis?.instructors || [])]
    .sort((a, b) => b.paidStudents - a.paidStudents)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg text-c-amber uppercase tracking-widest">Partnership Dashboard</h1>
        <button onClick={fetchData} className="text-c-muted font-mono text-[10px] uppercase hover:text-c-amber transition-colors">
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Approved Instructors', value: kpis?.summary.totalApproved ?? 0 },
          { label: 'With Connected Students', value: kpis?.summary.withConnectedStudents ?? 0 },
          { label: 'With Paid Students', value: kpis?.summary.withPaidStudents ?? 0 },
        ].map((card) => (
          <div key={card.label} className="bg-c-panel border border-c-border rounded-lg p-4">
            <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">{card.label}</p>
            <p className="font-mono text-2xl text-c-text mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="bg-c-panel border border-c-border rounded-lg p-4">
        <h2 className="font-mono text-xs text-c-amber uppercase tracking-wider mb-4">// 7-Day Funnel</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Invites Sent', value: kpis?.funnel.invites7d ?? 0 },
            { label: 'Claims', value: kpis?.funnel.claims7d ?? 0 },
            { label: 'Total Connections', value: kpis?.funnel.totalConnections ?? 0 },
            { label: 'Paid Students', value: kpis?.funnel.totalPaidStudents ?? 0 },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className="font-mono text-xl text-c-text">{item.value}</p>
              <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two columns: Top Invite Volume + Top Paid Conversions */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Invite Volume */}
        <div className="bg-c-panel border border-c-border rounded-lg p-4">
          <h2 className="font-mono text-xs text-c-amber uppercase tracking-wider mb-3">// Top Invite Volume (7d)</h2>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-c-dim uppercase tracking-wider">
                <th className="text-left pb-2">Instructor</th>
                <th className="text-right pb-2">Invites</th>
                <th className="text-right pb-2">Claims</th>
              </tr>
            </thead>
            <tbody>
              {topInviteVolume.map((inst) => (
                <tr key={inst.instructorId} className="border-t border-c-border/50">
                  <td className="py-1.5 text-c-text">{inst.displayName}</td>
                  <td className="py-1.5 text-right text-c-muted">{inst.invites7d}</td>
                  <td className="py-1.5 text-right text-c-muted">{inst.claims7d}</td>
                </tr>
              ))}
              {topInviteVolume.length === 0 && (
                <tr><td colSpan={3} className="py-2 text-c-dim text-center">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Top Paid Conversions */}
        <div className="bg-c-panel border border-c-border rounded-lg p-4">
          <h2 className="font-mono text-xs text-c-amber uppercase tracking-wider mb-3">// Top Paid Conversions</h2>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-c-dim uppercase tracking-wider">
                <th className="text-left pb-2">Instructor</th>
                <th className="text-right pb-2">Paid</th>
                <th className="text-right pb-2">Connected</th>
              </tr>
            </thead>
            <tbody>
              {topPaidConversions.map((inst) => (
                <tr key={inst.instructorId} className="border-t border-c-border/50">
                  <td className="py-1.5 text-c-text">{inst.displayName}</td>
                  <td className="py-1.5 text-right text-c-muted">{inst.paidStudents}</td>
                  <td className="py-1.5 text-right text-c-muted">{inst.connectedStudents}</td>
                </tr>
              ))}
              {topPaidConversions.length === 0 && (
                <tr><td colSpan={3} className="py-2 text-c-dim text-center">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flagged for Review */}
      <div className="bg-c-panel border border-c-border rounded-lg p-4">
        <h2 className="font-mono text-xs text-c-amber uppercase tracking-wider mb-3">
          // Flagged for Review {fraud && fraud.total > 0 && <span className="text-red-400">({fraud.total})</span>}
        </h2>
        {fraud && fraud.flagged.length > 0 ? (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-c-dim uppercase tracking-wider">
                <th className="text-left pb-2">Instructor</th>
                <th className="text-left pb-2">Risk</th>
                <th className="text-right pb-2">Score</th>
                <th className="text-left pb-2">Action</th>
                <th className="text-left pb-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {fraud.flagged.map((f) => (
                <tr key={f.instructorId} className="border-t border-c-border/50">
                  <td className="py-1.5 text-c-text">{f.displayName}</td>
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                      f.riskLevel === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {f.riskLevel}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-c-muted">{f.riskScore}</td>
                  <td className="py-1.5 text-c-muted">{f.recommendedAction}</td>
                  <td className="py-1.5 text-c-dim max-w-[300px] truncate">{f.reasons.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-c-dim font-mono text-xs">No flagged instructors</p>
        )}
      </div>

      {/* Quota Usage */}
      {quotas && (
        <div className="bg-c-panel border border-c-border rounded-lg p-4">
          <h2 className="font-mono text-xs text-c-amber uppercase tracking-wider mb-3">// Quota Usage (7d)</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="font-mono text-[10px] text-c-dim uppercase mb-2">Email Invites (limit: {quotas.defaults.emailInviteLimit})</p>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                {['p50', 'p90', 'p95', 'max'].map((key) => (
                  <div key={key} className="text-center">
                    <p className="text-c-text">{quotas.usage7d.emails[key as keyof typeof quotas.usage7d.emails]}</p>
                    <p className="text-[10px] text-c-dim uppercase">{key}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] text-c-dim uppercase mb-2">Token Creation (limit: {quotas.defaults.tokenCreationLimit})</p>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                {['p50', 'p90', 'p95', 'max'].map((key) => (
                  <div key={key} className="text-center">
                    <p className="text-c-text">{quotas.usage7d.tokens[key as keyof typeof quotas.usage7d.tokens]}</p>
                    <p className="text-[10px] text-c-dim uppercase">{key}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {quotas.overrides.active > 0 && (
            <div className="mt-4 pt-3 border-t border-c-border/50">
              <p className="font-mono text-[10px] text-c-dim uppercase mb-2">Active Overrides ({quotas.overrides.active})</p>
              {quotas.overrides.list.map((o) => (
                <div key={o.instructorId} className="text-xs font-mono text-c-muted">
                  {o.instructorId}... — email: {o.emailInviteLimit ?? 'default'}, token: {o.tokenCreationLimit ?? 'default'}
                  {o.note && <span className="text-c-dim ml-2">({o.note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="font-mono text-[10px] text-c-dim">
        Generated at {kpis?.generatedAt ? new Date(kpis.generatedAt).toLocaleString() : '—'}
      </p>
    </div>
  );
}
