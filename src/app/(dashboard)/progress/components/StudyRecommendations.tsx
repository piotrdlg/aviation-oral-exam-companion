'use client';

import Link from 'next/link';
import type { ElementScore } from '@/types/database';
import { elementStatus } from '@/lib/progress-metrics';
import { areaNameFromTaskId, areaIdFromTaskId } from '@/lib/exam-summary';

interface Props {
  scores: ElementScore[];
}

/**
 * Rating-aware FAA source hints, keyed by `${ratingPrefix}.${areaNum}`. Instrument
 * points at the Instrument Flying / Procedures Handbooks + AIM, not the airplane
 * PHAK/AFH the old shared map used for every rating.
 */
const SOURCE_MAP: Record<string, string> = {
  // Private / Commercial (airplane)
  'PA.I': 'PHAK 1–5 · FAR 61/91', 'PA.II': 'PHAK 7 · POH/AFM', 'PA.III': 'AIM 4 · Chart Supplement',
  'PA.VI': 'PHAK 16 · AIM 1', 'PA.VII': 'AFH 4–5', 'PA.VIII': 'IFH 6 · PHAK 8',
  'PA.IX': 'AFH 18 · POH emergencies', 'PA.XI': 'AFH 11 · AIM 1', 'PA.XII': 'PHAK 7 · POH',
  'CA.I': 'PHAK 1–5 · FAR 61/91', 'CA.II': 'PHAK 7 · POH/AFM', 'CA.III': 'AIM 4 · Chart Supplement',
  'CA.VI': 'PHAK 16 · AIM 1', 'CA.VII': 'AFH 4–5', 'CA.VIII': 'PHAK 7 · AIM 1',
  'CA.IX': 'AFH 18 · POH emergencies', 'CA.XI': 'PHAK 7 · POH',
  // Instrument
  'IR.I': 'IFH · IPH · FAR 61/91', 'IR.II': 'IFH · POH/AFM', 'IR.III': 'AIM 4–5 · IPH',
  'IR.V': 'IFH · AIM 1', 'IR.VI': 'Instrument Procedures Handbook · IFH', 'IR.VII': 'IFH · POH emergencies',
  'IR.VIII': 'IFH · POH',
};

interface AreaRec {
  areaName: string;
  count: number;
  hasCritical: boolean;
  source: string;
}

function buildRecs(scores: ElementScore[]): AreaRec[] {
  const byArea = new Map<string, { count: number; hasCritical: boolean; source: string }>();
  for (const s of scores) {
    const st = elementStatus(s);
    if (st !== 'critical' && st !== 'moderate') continue;
    const areaName = areaNameFromTaskId(s.task_id);
    const areaId = areaIdFromTaskId(s.task_id); // e.g. 'IR.VI.'
    const [prefix, num] = areaId.split('.');
    const source = SOURCE_MAP[`${prefix}.${num}`] || 'Relevant FAA handbooks & the ACS';
    const cur = byArea.get(areaName) || { count: 0, hasCritical: false, source };
    cur.count++;
    if (st === 'critical') cur.hasCritical = true;
    byArea.set(areaName, cur);
  }
  return [...byArea.entries()]
    .map(([areaName, v]) => ({ areaName, ...v }))
    .sort((a, b) => (a.hasCritical === b.hasCritical ? b.count - a.count : a.hasCritical ? -1 : 1));
}

export default function StudyRecommendations({ scores }: Props) {
  const recs = buildRecs(scores);

  if (recs.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-6 text-center">
        <p className="text-c-dim font-mono text-sm">
          {scores.some((s) => s.total_attempts > 0)
            ? 'No study targets — every area you’ve practiced is on standard.'
            : 'Complete a practice session to get a study plan.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bezel rounded-lg border border-c-border p-4">
      <p className="text-sm text-c-muted mb-3">Focus your study on these areas, weakest first:</p>
      <ul className="space-y-1.5 max-h-80 overflow-y-auto">
        {recs.map((rec) => (
          <li key={rec.areaName} className="px-3 py-2 rounded-lg bg-c-panel/60 border border-c-border">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: rec.hasCritical ? 'var(--color-c-red)' : 'var(--color-c-amber)' }}
              />
              <span className="text-sm text-c-text flex-1 min-w-0 truncate">{rec.areaName}</span>
              <span className="font-mono text-xs text-c-dim shrink-0 tabular-nums">{rec.count} weak</span>
            </div>
            <p className="font-mono text-[11px] text-c-cyan mt-0.5 ml-3.5 truncate">{rec.source}</p>
          </li>
        ))}
      </ul>
      <Link
        href="/practice?mode=weak_areas"
        className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-c-amber hover:text-c-amber-bright transition-colors"
      >
        Drill weak areas <span>▸</span>
      </Link>
    </div>
  );
}
