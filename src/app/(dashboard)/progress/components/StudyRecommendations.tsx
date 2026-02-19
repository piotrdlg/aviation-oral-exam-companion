'use client';

import type { ElementScore } from '@/types/database';

interface Props {
  scores: ElementScore[];
}

interface Recommendation {
  area: string;
  taskId: string;
  elementCodes: string[];
  severity: 'critical' | 'moderate';
  suggestion: string;
  sourceHint: string;
}

const SOURCE_MAP: Record<string, string> = {
  'I': 'PHAK Chapters 1-5, 14 CFR Part 61/91',
  'II': 'PHAK Chapter 2, POH/AFM Preflight Section',
  'III': 'AIM Chapter 4, Chart Supplement',
  'VI': 'PHAK Chapter 16, AIM Chapter 1',
  'VII': 'AFH Chapters 4-5, PHAK Chapter 5',
  'VIII': 'AFH Chapter 7, PHAK Chapter 8',
  'IX': 'AFH Chapter 18, POH Emergency Procedures',
  'XI': 'PHAK Chapter 17, AIM Chapter 1',
  'XII': 'PHAK Chapter 2, POH Postflight Section',
};

function generateRecommendations(scores: ElementScore[]): Recommendation[] {
  const weakElements = scores.filter((s) => {
    if (s.total_attempts === 0) return false;
    return s.latest_score === 'unsatisfactory' || s.latest_score === 'partial'
      || s.unsatisfactory_count / s.total_attempts >= 0.5;
  });

  // Group by area + task
  const grouped = new Map<string, typeof weakElements>();
  for (const el of weakElements) {
    const key = el.task_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(el);
  }

  const recs: Recommendation[] = [];
  for (const [taskId, elements] of grouped) {
    const area = elements[0].area;
    const areaNum = taskId.split('.')[1];
    const hasCritical = elements.some(
      (e) => e.latest_score === 'unsatisfactory' || e.unsatisfactory_count / e.total_attempts >= 0.5
    );

    recs.push({
      area,
      taskId,
      elementCodes: elements.map((e) => e.element_code),
      severity: hasCritical ? 'critical' : 'moderate',
      suggestion: hasCritical
        ? `Review the fundamentals for ${area}. Focus on elements with unsatisfactory scores.`
        : `Strengthen your understanding of ${area}. Practice application questions.`,
      sourceHint: SOURCE_MAP[areaNum] || 'Consult relevant FAA publications',
    });
  }

  return recs.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.elementCodes.length - a.elementCodes.length;
  });
}

export default function StudyRecommendations({ scores }: Props) {
  const recs = generateRecommendations(scores);

  if (recs.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-6 text-center">
        <p className="text-c-dim font-mono text-sm">
          {scores.some((s) => s.total_attempts > 0)
            ? 'No study recommendations — all areas are looking good!'
            : 'Complete a practice session to get study recommendations.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bezel rounded-lg border border-c-border p-4">
      <h3 className="font-mono text-base font-semibold text-c-amber uppercase tracking-wider mb-3">STUDY RECOMMENDATIONS</h3>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {recs.slice(0, 8).map((rec) => (
          <div
            key={rec.taskId}
            className={`p-3 rounded-lg border ${
              rec.severity === 'critical'
                ? 'bg-c-red-dim/40 border-c-red/20'
                : 'bg-c-amber-lo border-c-amber/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-mono text-sm font-semibold text-c-text uppercase">{rec.area}</p>
              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                rec.severity === 'critical'
                  ? 'bg-c-red-dim/40 text-c-red border-c-red/20'
                  : 'bg-c-amber-lo text-c-amber border-c-amber/20'
              }`}>
                {rec.elementCodes.length} WEAK ELEMENT{rec.elementCodes.length !== 1 ? 'S' : ''}
              </span>
            </div>
            <p className="text-sm text-c-muted mb-1">{rec.suggestion}</p>
            <p className="font-mono text-xs text-c-cyan">{rec.sourceHint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
