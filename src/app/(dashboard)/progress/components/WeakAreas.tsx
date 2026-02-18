'use client';

import type { ElementScore } from '@/types/database';

interface Props {
  scores: ElementScore[];
}

interface WeakElement {
  element_code: string;
  area: string;
  task_id: string;
  element_type: string;
  latest_score: string;
  total_attempts: number;
  unsatisfactory_count: number;
  partial_count: number;
  severity: 'critical' | 'moderate' | 'minor';
}

function classifyWeakness(score: ElementScore): WeakElement | null {
  if (score.total_attempts === 0) return null;

  const unsatRate = score.unsatisfactory_count / score.total_attempts;
  const partialRate = score.partial_count / score.total_attempts;

  let severity: 'critical' | 'moderate' | 'minor';

  if (score.latest_score === 'unsatisfactory' || unsatRate >= 0.5) {
    severity = 'critical';
  } else if (score.latest_score === 'partial' || partialRate >= 0.5) {
    severity = 'moderate';
  } else {
    return null; // Not weak
  }

  return {
    element_code: score.element_code,
    area: score.area,
    task_id: score.task_id,
    element_type: score.element_type,
    latest_score: score.latest_score || 'unknown',
    total_attempts: score.total_attempts,
    unsatisfactory_count: score.unsatisfactory_count,
    partial_count: score.partial_count,
    severity,
  };
}

export default function WeakAreas({ scores }: Props) {
  const weakElements = scores
    .map(classifyWeakness)
    .filter((w): w is WeakElement => w !== null)
    .sort((a, b) => {
      const severityOrder = { critical: 0, moderate: 1, minor: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  if (weakElements.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-6 text-center">
        <p className="text-c-dim font-mono text-xs">
          {scores.some(s => s.total_attempts > 0)
            ? 'No weak areas identified. Great job!'
            : 'Complete a practice session to identify areas to improve.'}
        </p>
      </div>
    );
  }

  // Group by area
  const grouped = new Map<string, WeakElement[]>();
  for (const weak of weakElements) {
    if (!grouped.has(weak.area)) {
      grouped.set(weak.area, []);
    }
    grouped.get(weak.area)!.push(weak);
  }

  const critical = weakElements.filter(w => w.severity === 'critical').length;
  const moderate = weakElements.filter(w => w.severity === 'moderate').length;

  return (
    <div className="bezel rounded-lg border border-c-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-sm font-semibold text-c-amber uppercase tracking-wider">WEAK AREAS</h3>
        <div className="flex gap-3 font-mono text-[10px]">
          {critical > 0 && (
            <span className="text-c-red">{critical} CRITICAL</span>
          )}
          {moderate > 0 && (
            <span className="text-c-amber">{moderate} MODERATE</span>
          )}
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {Array.from(grouped.entries()).map(([area, elements]) => (
          <div key={area}>
            <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1.5">{area}</p>
            <div className="space-y-1">
              {elements.map((el) => (
                <div
                  key={el.element_code}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    el.severity === 'critical'
                      ? 'bg-c-red-dim/40 border border-c-red/20'
                      : 'bg-c-amber-lo border border-c-amber/20'
                  }`}
                >
                  <div className="flex-1">
                    <span className="font-mono text-[10px] text-c-dim mr-2">{el.element_code}</span>
                    <span className={`font-mono text-xs uppercase ${el.severity === 'critical' ? 'text-c-red' : 'text-c-amber'}`}>
                      {el.latest_score}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-c-dim">
                    {el.unsatisfactory_count}U / {el.partial_count}P / {el.total_attempts} total
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-c-border">
        <p className="font-mono text-[10px] text-c-dim">
          Study recommendation: Focus on elements with critical status. Review the relevant FAA source material for each weak area.
        </p>
      </div>
    </div>
  );
}
