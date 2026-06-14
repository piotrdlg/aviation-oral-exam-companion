'use client';

import { useMemo, useState } from 'react';
import type { ElementScore } from '@/types/database';
import { elementStatus, weaknessReason, type ElementStatus } from '@/lib/progress-metrics';
import { areaNameFromTaskId } from '@/lib/exam-summary';

interface Props {
  scores: ElementScore[];
}

type Tab = 'weak' | 'strong';

const STATUS_VAR: Record<ElementStatus, string> = {
  critical: 'var(--color-c-red)',
  moderate: 'var(--color-c-amber)',
  strong: 'var(--color-c-green)',
  untouched: 'var(--color-c-border-hi)',
};

const SEVERITY_ORDER: Record<ElementStatus, number> = { critical: 0, moderate: 1, strong: 2, untouched: 3 };

/** Group scores by ACS area name, preserving first-seen order, sorting each
 *  group's elements by severity (critical first). */
function groupByArea(scores: ElementScore[]): { area: string; elements: ElementScore[] }[] {
  const byArea = new Map<string, ElementScore[]>();
  for (const s of scores) {
    const area = areaNameFromTaskId(s.task_id);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push(s);
  }
  return [...byArea.entries()].map(([area, elements]) => ({
    area,
    elements: elements.sort((a, b) => SEVERITY_ORDER[elementStatus(a)] - SEVERITY_ORDER[elementStatus(b)]),
  }));
}

export default function WeakAreas({ scores }: Props) {
  const [tab, setTab] = useState<Tab>('weak');

  const { weak, strong } = useMemo(() => {
    const weak: ElementScore[] = [];
    const strong: ElementScore[] = [];
    for (const s of scores) {
      const st = elementStatus(s);
      if (st === 'critical' || st === 'moderate') weak.push(s);
      else if (st === 'strong') strong.push(s);
    }
    return { weak, strong };
  }, [scores]);

  const anyAttempted = scores.some((s) => s.total_attempts > 0);
  const active = tab === 'weak' ? weak : strong;
  const groups = useMemo(() => groupByArea(active), [active]);

  return (
    <div className="bezel rounded-lg border border-c-border p-4">
      {/* Tabs */}
      <div className="flex gap-0.5 bg-c-panel rounded-lg p-0.5 mb-3 w-fit">
        <button
          onClick={() => setTab('weak')}
          className={`px-3 py-1 text-xs rounded-md font-mono transition-colors ${tab === 'weak' ? 'bg-c-elevated text-c-text font-semibold' : 'text-c-muted hover:text-c-text'}`}
        >
          Needs work {weak.length}
        </button>
        <button
          onClick={() => setTab('strong')}
          className={`px-3 py-1 text-xs rounded-md font-mono transition-colors ${tab === 'strong' ? 'bg-c-elevated text-c-text font-semibold' : 'text-c-muted hover:text-c-text'}`}
        >
          Strong {strong.length}
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-c-dim font-mono text-sm text-center py-6">
          {!anyAttempted
            ? 'Complete a practice session to see where you stand.'
            : tab === 'weak'
            ? 'No weak elements — nice work. Keep widening your coverage.'
            : 'No mastered elements yet. Strong answers will show up here.'}
        </p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {groups.map(({ area, elements }) => (
            <div key={area}>
              <p className="font-mono text-[11px] text-c-muted uppercase tracking-wider mb-1">{area}</p>
              <div className="space-y-1">
                {elements.map((el) => {
                  const st = elementStatus(el);
                  return (
                    <div key={el.element_code} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-c-panel/60 border border-c-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_VAR[st] }} />
                        <span className="font-mono text-xs text-c-dim shrink-0">{el.element_code}</span>
                        <span className="text-sm text-c-muted truncate">
                          {st === 'strong' ? 'satisfactory' : weaknessReason(el)}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-c-dim shrink-0 tabular-nums">
                        {el.unsatisfactory_count}U / {el.partial_count}P / {el.total_attempts}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
