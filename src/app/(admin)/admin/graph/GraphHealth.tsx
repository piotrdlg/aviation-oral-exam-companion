'use client';

import { useState, useEffect, useMemo } from 'react';
import type { GraphHealthData, OrphanNode, UnvalidatedNode } from './graph-types';
import { CATEGORY_LABELS } from './graph-types';
import type { ConceptCategory } from '@/types/database';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onNavigateToExplorer: (slug: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LIST_ITEMS = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return progress bar class based on percentage */
function progressClass(pct: number): string {
  if (pct >= 80) return 'prog-g';
  if (pct >= 40) return 'prog-a';
  return 'prog-r';
}

/** Return text color class based on percentage */
function pctTextClass(pct: number): string {
  if (pct === 100) return 'text-c-green';
  if (pct > 0) return 'text-c-amber';
  return 'text-c-dim';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphHealth({ onNavigateToExplorer }: Props) {
  const [data, setData] = useState<GraphHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [orphanCategoryFilter, setOrphanCategoryFilter] = useState<string>('all');
  const [unvalidatedCategoryFilter, setUnvalidatedCategoryFilter] = useState<string>('all');

  // ── Fetch on mount ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/admin/graph/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: GraphHealthData = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch health data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHealth();
    return () => { cancelled = true; };
  }, []);

  // ── Derived: unique categories in orphans / unvalidated ────────
  const orphanCategories = useMemo(() => {
    if (!data) return [];
    const cats = new Set(data.orphans.map((o) => o.category));
    return Array.from(cats).sort();
  }, [data]);

  const unvalidatedCategories = useMemo(() => {
    if (!data) return [];
    const cats = new Set(data.unvalidated.map((u) => u.category));
    return Array.from(cats).sort();
  }, [data]);

  // ── Filtered lists ─────────────────────────────────────────────
  const filteredOrphans = useMemo(() => {
    if (!data) return [];
    return orphanCategoryFilter === 'all'
      ? data.orphans
      : data.orphans.filter((o) => o.category === orphanCategoryFilter);
  }, [data, orphanCategoryFilter]);

  const filteredUnvalidated = useMemo(() => {
    if (!data) return [];
    return unvalidatedCategoryFilter === 'all'
      ? data.unvalidated
      : data.unvalidated.filter((u) => u.category === unvalidatedCategoryFilter);
  }, [data, unvalidatedCategoryFilter]);

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="flicker font-mono text-sm text-c-amber uppercase tracking-wider">
          Loading health data...
        </span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="font-mono text-sm text-c-red">
          {error ?? 'No data available'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ── Section 1: Summary cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Concepts" value={data.totals.concepts} />
        <SummaryCard label="Edges" value={data.totals.edges} />
        <SummaryCard label="Evidence" value={data.totals.evidence} />
        <SummaryCard label="Orphans" value={data.totals.orphans} warn={data.totals.orphans > 0} />
      </div>

      {/* ── Section 2: Category breakdown ────────────────────────── */}
      <div className="bezel rounded-lg border border-c-border p-4">
        <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3">
          // CATEGORY BREAKDOWN
        </p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-c-muted text-left">
                <th className="pb-2 pr-4 font-normal">Category</th>
                <th className="pb-2 pr-4 font-normal text-right">Count</th>
                <th className="pb-2 pr-4 font-normal text-right">Embedded %</th>
                <th className="pb-2 pr-4 font-normal text-right">Validated %</th>
                <th className="pb-2 font-normal text-right">Avg Edges</th>
              </tr>
            </thead>
            <tbody>
              {data.byCategory.map((cat) => (
                <tr key={cat.category} className="border-t border-c-border/30">
                  <td className="py-1.5 pr-4 text-c-text">
                    {CATEGORY_LABELS[cat.category as ConceptCategory] ?? cat.category}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-c-muted">{cat.count}</td>
                  <td className={`py-1.5 pr-4 text-right ${pctTextClass(cat.pctEmbedded)}`}>
                    {cat.pctEmbedded}%
                  </td>
                  <td className={`py-1.5 pr-4 text-right ${pctTextClass(cat.pctValidated)}`}>
                    {cat.pctValidated}%
                  </td>
                  <td className="py-1.5 text-right text-c-muted">{cat.avgEdges.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 3: Edge distribution ─────────────────────────── */}
      <div className="bezel rounded-lg border border-c-border p-4">
        <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3">
          // EDGE DISTRIBUTION
        </p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-c-muted text-left">
                <th className="pb-2 pr-4 font-normal">Relation Type</th>
                <th className="pb-2 pr-4 font-normal text-right">Count</th>
                <th className="pb-2 pr-4 font-normal text-right">Avg Confidence</th>
                <th className="pb-2 font-normal text-right">Avg Weight</th>
              </tr>
            </thead>
            <tbody>
              {data.byRelation.map((rel) => (
                <tr key={rel.type} className="border-t border-c-border/30">
                  <td className="py-1.5 pr-4 text-c-text">{rel.type.replace(/_/g, ' ')}</td>
                  <td className="py-1.5 pr-4 text-right text-c-muted">{rel.count}</td>
                  <td className="py-1.5 pr-4 text-right text-c-muted">{rel.avgConfidence.toFixed(2)}</td>
                  <td className="py-1.5 text-right text-c-muted">{rel.avgWeight.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 4: ACS Element Coverage ──────────────────────── */}
      {data.coverage.length > 0 && (
        <div className="bezel rounded-lg border border-c-border p-4">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3">
            // ACS ELEMENT COVERAGE
          </p>
          <div className="space-y-3">
            {data.coverage.map((cov) => (
              <div key={cov.rating}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-c-text uppercase">{cov.rating}</span>
                  <span className="font-mono text-[10px] text-c-muted">
                    {cov.connectedElements}/{cov.totalElements} ({cov.pct}%)
                  </span>
                </div>
                <div className="h-2 bg-c-border/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${progressClass(cov.pct)}`}
                    style={{ width: `${Math.max(cov.pct, 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 5: Orphan nodes ──────────────────────────────── */}
      <div className="bezel rounded-lg border border-c-border p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">
            // ORPHAN NODES ({filteredOrphans.length})
          </p>
          {orphanCategories.length > 1 && (
            <select
              value={orphanCategoryFilter}
              onChange={(e) => setOrphanCategoryFilter(e.target.value)}
              className="font-mono text-[10px] bg-c-panel border border-c-border rounded px-2 py-1 text-c-text"
            >
              <option value="all">All categories</option>
              {orphanCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat as ConceptCategory] ?? cat}
                </option>
              ))}
            </select>
          )}
        </div>

        {filteredOrphans.length === 0 ? (
          <p className="font-mono text-xs text-c-dim">No orphan nodes found.</p>
        ) : (
          <>
            <div className="space-y-1">
              {filteredOrphans.slice(0, MAX_LIST_ITEMS).map((orphan) => (
                <OrphanRow key={orphan.id} orphan={orphan} onClick={onNavigateToExplorer} />
              ))}
            </div>
            {filteredOrphans.length > MAX_LIST_ITEMS && (
              <p className="font-mono text-[10px] text-c-dim mt-2">
                ...and {filteredOrphans.length - MAX_LIST_ITEMS} more
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Section 6: Unvalidated concepts ──────────────────────── */}
      <div className="bezel rounded-lg border border-c-border p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">
            // UNVALIDATED CONCEPTS ({filteredUnvalidated.length})
          </p>
          {unvalidatedCategories.length > 1 && (
            <select
              value={unvalidatedCategoryFilter}
              onChange={(e) => setUnvalidatedCategoryFilter(e.target.value)}
              className="font-mono text-[10px] bg-c-panel border border-c-border rounded px-2 py-1 text-c-text"
            >
              <option value="all">All categories</option>
              {unvalidatedCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat as ConceptCategory] ?? cat}
                </option>
              ))}
            </select>
          )}
        </div>

        {filteredUnvalidated.length === 0 ? (
          <p className="font-mono text-xs text-c-dim">All concepts are validated.</p>
        ) : (
          <>
            <div className="space-y-1">
              {filteredUnvalidated.slice(0, MAX_LIST_ITEMS).map((node) => (
                <UnvalidatedRow key={node.id} node={node} />
              ))}
            </div>
            {filteredUnvalidated.length > MAX_LIST_ITEMS && (
              <p className="font-mono text-[10px] text-c-dim mt-2">
                ...and {filteredUnvalidated.length - MAX_LIST_ITEMS} more
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`bezel rounded-lg border border-c-border p-4 ${warn ? 'glow-a' : ''}`}>
      <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`font-mono text-2xl font-bold ${warn ? 'text-c-amber' : 'text-c-text'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function OrphanRow({ orphan, onClick }: { orphan: OrphanNode; onClick: (slug: string) => void }) {
  return (
    <button
      onClick={() => onClick(orphan.slug)}
      className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-c-elevated/50 transition-colors text-left group"
    >
      <span className="font-mono text-xs text-c-text group-hover:text-c-amber truncate mr-2">
        {orphan.name}
      </span>
      <span className="font-mono text-[10px] text-c-dim flex-shrink-0">
        {CATEGORY_LABELS[orphan.category as ConceptCategory] ?? orphan.category}
      </span>
    </button>
  );
}

function UnvalidatedRow({ node }: { node: UnvalidatedNode }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded">
      <span className="font-mono text-xs text-c-text truncate mr-2">
        {node.name}
      </span>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-[10px] text-c-dim">
          {CATEGORY_LABELS[node.category as ConceptCategory] ?? node.category}
        </span>
        <span className={`font-mono text-[10px] ${
          node.confidence === null ? 'text-c-dim' :
          node.confidence >= 0.8 ? 'text-c-green' :
          node.confidence >= 0.5 ? 'text-c-amber' :
          'text-c-red'
        }`}>
          {node.confidence !== null ? `${(node.confidence * 100).toFixed(0)}%` : 'N/A'}
        </span>
      </div>
    </div>
  );
}
