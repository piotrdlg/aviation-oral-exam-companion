'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import type { ComputedNode } from '@nivo/treemap';
import type { CoverageData, CoverageArea, CoverageTask, CoverageElement } from './graph-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onNavigateToExplorer: (slug: string) => void;
}

// ---------------------------------------------------------------------------
// Tree node shape for Nivo
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  children?: TreeNode[];
  value?: number;
  color?: string;
  elementCode?: string;
  edgeCount?: number;
}

// ---------------------------------------------------------------------------
// Color function — edge-count based
// ---------------------------------------------------------------------------

function getEdgeColor(edgeCount: number): string {
  if (edgeCount >= 5) return 'rgba(0, 255, 65, 0.75)';     // green — rich coverage
  if (edgeCount >= 1) return 'rgba(245, 166, 35, 0.75)';    // amber — some coverage
  return 'rgba(255, 59, 48, 0.4)';                           // red — no coverage
}

// ---------------------------------------------------------------------------
// Build tree hierarchy from coverage data
// ---------------------------------------------------------------------------

function buildTreeData(data: CoverageData): TreeNode {
  const areaChildren: TreeNode[] = data.areas.map((area: CoverageArea) => {
    const taskChildren: TreeNode[] = area.tasks.map((task: CoverageTask) => {
      const elementChildren: TreeNode[] = task.elements.map((el: CoverageElement) => ({
        name: el.code.split('.').pop() || el.code,
        value: 1,
        color: getEdgeColor(el.edgeCount),
        elementCode: el.code,
        edgeCount: el.edgeCount,
      }));

      return {
        name: task.name,
        children: elementChildren,
      };
    });

    return {
      name: area.name,
      children: taskChildren,
    };
  });

  return {
    name: data.rating.toUpperCase(),
    children: areaChildren,
  };
}

// ---------------------------------------------------------------------------
// Tooltip component
// ---------------------------------------------------------------------------

function CoverageTooltip({ node }: { node: ComputedNode<TreeNode> }) {
  const { data } = node;
  if (!data.elementCode) return null;

  return (
    <div className="bg-c-bezel border border-c-border rounded-lg px-3 py-2 max-w-xs shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-[9px] text-c-muted">{data.elementCode}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
          (data.edgeCount ?? 0) >= 5
            ? 'bg-c-green-lo text-c-green border-c-green/20'
            : (data.edgeCount ?? 0) >= 1
              ? 'bg-c-amber-lo text-c-amber border-c-amber/20'
              : 'bg-c-red-dim/40 text-c-red border-c-red/20'
        }`}>
          {data.edgeCount ?? 0} EDGE{(data.edgeCount ?? 0) !== 1 ? 'S' : ''}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphCoverage({ onNavigateToExplorer }: Props) {
  const [rating, setRating] = useState<string>('private');
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch on rating change ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchCoverage() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/admin/graph/coverage?rating=${rating}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: CoverageData = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch coverage data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCoverage();
    return () => { cancelled = true; };
  }, [rating]);

  // ── Derived: tree data + stats ─────────────────────────────────
  const treeData = useMemo(() => {
    if (!data || data.areas.length === 0) return null;
    return buildTreeData(data);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, connected: 0, rich: 0 };
    let total = 0;
    let connected = 0;
    let rich = 0;

    for (const area of data.areas) {
      for (const task of area.tasks) {
        for (const el of task.elements) {
          total++;
          if (el.edgeCount >= 1) connected++;
          if (el.edgeCount >= 5) rich++;
        }
      }
    }

    return { total, connected, rich };
  }, [data]);

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="flicker font-mono text-sm text-c-amber uppercase tracking-wider">
          Loading coverage data...
        </span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="font-mono text-sm text-c-red">{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Controls bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Rating selector */}
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="font-mono text-[11px] bg-c-panel border border-c-border rounded px-3 py-1.5 text-c-text uppercase tracking-wide"
        >
          <option value="private">Private Pilot</option>
          <option value="commercial">Commercial Pilot</option>
          <option value="instrument">Instrument Rating</option>
        </select>

        {/* Legend */}
        <div className="flex items-center gap-4 font-mono text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(0, 255, 65, 0.75)' }} />
            <span className="text-c-muted">5+ edges</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(245, 166, 35, 0.75)' }} />
            <span className="text-c-muted">1-4 edges</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(255, 59, 48, 0.4)' }} />
            <span className="text-c-muted">0 edges</span>
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 font-mono text-[10px] text-c-muted">
          <span>Total: {stats.total}</span>
          <span className="text-c-amber">Connected: {stats.connected}</span>
          <span className="text-c-green">Rich: {stats.rich}</span>
        </div>
      </div>

      {/* ── Treemap ───────────────────────────────────────────────── */}
      <div className="bezel rounded-lg border border-c-border p-2">
        {!treeData || stats.total === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="font-mono text-xs text-c-dim">No ACS elements found for this rating.</p>
          </div>
        ) : (
          <div className="h-[calc(100vh-280px)]">
            <ResponsiveTreeMap
              data={treeData}
              identity="name"
              value="value"
              leavesOnly={true}
              innerPadding={2}
              outerPadding={4}
              colors={(node) => {
                return (node.data as TreeNode).color || 'rgba(28, 35, 51, 0.4)';
              }}
              borderWidth={1}
              borderColor="rgba(28, 35, 51, 0.8)"
              labelSkipSize={20}
              label={(node) => (node.data as TreeNode).name || ''}
              labelTextColor="rgba(201, 209, 217, 0.8)"
              parentLabelSize={14}
              parentLabelTextColor="rgba(201, 209, 217, 0.5)"
              tooltip={CoverageTooltip}
              onClick={(node) => {
                const nodeData = node.data as TreeNode;
                if (nodeData.elementCode) {
                  onNavigateToExplorer('acs_element:' + nodeData.elementCode);
                }
              }}
              theme={{
                labels: { text: { fontFamily: 'JetBrains Mono, monospace', fontSize: 9 } },
                tooltip: { container: { background: 'transparent', padding: 0, boxShadow: 'none' } },
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
