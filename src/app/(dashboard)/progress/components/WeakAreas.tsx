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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
        <p className="text-gray-500">
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
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Weak Areas</h3>
        <div className="flex gap-3 text-xs">
          {critical > 0 && (
            <span className="text-red-400">{critical} critical</span>
          )}
          {moderate > 0 && (
            <span className="text-yellow-400">{moderate} moderate</span>
          )}
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {Array.from(grouped.entries()).map(([area, elements]) => (
          <div key={area}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{area}</p>
            <div className="space-y-1">
              {elements.map((el) => (
                <div
                  key={el.element_code}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    el.severity === 'critical'
                      ? 'bg-red-900/20 border border-red-800/30'
                      : 'bg-yellow-900/20 border border-yellow-800/30'
                  }`}
                >
                  <div className="flex-1">
                    <span className="font-mono text-xs text-gray-500 mr-2">{el.element_code}</span>
                    <span className={el.severity === 'critical' ? 'text-red-300' : 'text-yellow-300'}>
                      {el.latest_score}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {el.unsatisfactory_count}U / {el.partial_count}P / {el.total_attempts} total
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-800">
        <p className="text-xs text-gray-500">
          Study recommendation: Focus on elements with critical status. Review the relevant FAA source material for each weak area.
        </p>
      </div>
    </div>
  );
}
