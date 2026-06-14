'use client';

import { useState } from 'react';
import type { ElementScore } from '@/types/database';
import { areaCoverage, weaknessReason, type AreaCoverage, type ElementStatus } from '@/lib/progress-metrics';

interface Props {
  scores: ElementScore[];
}

const STATUS_VAR: Record<ElementStatus, string> = {
  strong: 'var(--color-c-green)',
  moderate: 'var(--color-c-amber)',
  critical: 'var(--color-c-red)',
  untouched: 'var(--color-c-border-hi)',
};

const STATUS_ICON: Record<ElementStatus, string> = {
  strong: '✓', moderate: '~', critical: '✗', untouched: '·',
};

function Segment({ count, total, status }: { count: number; total: number; status: ElementStatus }) {
  if (count === 0) return null;
  return <div style={{ width: `${(count / total) * 100}%`, backgroundColor: STATUS_VAR[status] }} />;
}

function AreaRow({ area }: { area: AreaCoverage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-c-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-c-bezel/40 transition-colors rounded"
        aria-expanded={open}
      >
        <span className="font-mono text-[11px] text-c-dim w-8 shrink-0 text-right">{area.areaNum}</span>
        <span className="text-sm text-c-text flex-1 min-w-0 truncate">{area.areaName}</span>
        {/* stacked coverage bar */}
        <div className="hidden sm:flex h-2 w-28 shrink-0 rounded-full overflow-hidden bg-c-border">
          <Segment count={area.strong} total={area.total} status="strong" />
          <Segment count={area.moderate} total={area.total} status="moderate" />
          <Segment count={area.critical} total={area.total} status="critical" />
        </div>
        <span className="font-mono text-xs text-c-muted tabular-nums w-12 shrink-0 text-right">
          {area.attempted}/{area.total}
        </span>
        <span className="text-c-dim w-3 shrink-0 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="pb-3 pl-11 pr-2 flex flex-wrap gap-x-4 gap-y-1">
          {area.elements.map(({ score, status }) => (
            <span key={score.element_code} className="inline-flex items-center gap-1.5 text-xs">
              <span className="font-mono" style={{ color: STATUS_VAR[status] }}>{STATUS_ICON[status]}</span>
              <span className="font-mono text-c-dim">{score.element_code}</span>
              <span className="text-c-muted">{status === 'untouched' ? 'not attempted' : weaknessReason(score)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Coverage by ACS area — the clear answer to "what have I covered?". Each area
 * is a row with a stacked status bar (satisfactory / partial / unsatisfactory
 * over an untouched track) and an attempted/total count; expand a row to see its
 * individual elements. Replaces the dense treemap as the default ACS-map view
 * (the treemap remains available as an opt-in detail).
 */
export default function AcsCoverageBars({ scores }: Props) {
  const areas = areaCoverage(scores);
  const total = areas.reduce((n, a) => n + a.total, 0);
  const attempted = areas.reduce((n, a) => n + a.attempted, 0);
  const pct = total > 0 ? Math.round((attempted / total) * 100) : 0;

  if (areas.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-6 text-center">
        <p className="text-c-dim font-mono text-sm">No coverage data for this selection yet.</p>
      </div>
    );
  }

  return (
    <div className="bezel rounded-lg border border-c-border p-4">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h3 className="font-mono text-xs text-c-muted uppercase tracking-wider">Coverage by area</h3>
        <span className="font-mono text-xs text-c-muted tabular-nums">
          {attempted} / {total} elements · {pct}%
        </span>
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 font-mono text-[10px] text-c-dim uppercase tracking-wider">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_VAR.strong }} /> satisfactory</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_VAR.moderate }} /> partial</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_VAR.critical }} /> unsatisfactory</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_VAR.untouched }} /> untouched</span>
      </div>
      <div>
        {areas.map((area) => (
          <AreaRow key={area.areaId} area={area} />
        ))}
      </div>
    </div>
  );
}
