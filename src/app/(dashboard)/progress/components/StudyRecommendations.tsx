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
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
        <p className="text-gray-500">
          {scores.some((s) => s.total_attempts > 0)
            ? 'No study recommendations — all areas are looking good!'
            : 'Complete a practice session to get study recommendations.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h3 className="text-sm font-medium text-white mb-3">Study Recommendations</h3>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {recs.slice(0, 8).map((rec) => (
          <div
            key={rec.taskId}
            className={`p-3 rounded-lg border ${
              rec.severity === 'critical'
                ? 'bg-red-900/10 border-red-800/30'
                : 'bg-yellow-900/10 border-yellow-800/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-white">{rec.area}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                rec.severity === 'critical'
                  ? 'bg-red-900/30 text-red-400'
                  : 'bg-yellow-900/30 text-yellow-400'
              }`}>
                {rec.elementCodes.length} weak element{rec.elementCodes.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-1">{rec.suggestion}</p>
            <p className="text-xs text-blue-400">{rec.sourceHint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
