/**
 * Progress-page metrics — the single source of truth for the numbers and
 * classifications shown on `/progress` (readiness, coverage, satisfactory rate,
 * per-area coverage, per-element status + weakness reason). Pure, zero-runtime-
 * dependency (only sibling pure libs), fully unit-testable, so the page and its
 * components stay dumb and the math is verifiable.
 */
import type { ElementScore } from '@/types/database';
import { PARTIAL_CREDIT } from './exam-logic';
import { weaknessSeverity } from './weak-areas';
import { areaIdFromTaskId, areaNameFromTaskId } from './exam-summary';

export type ElementStatus = 'critical' | 'moderate' | 'strong' | 'untouched';
export type ReadinessTier = 'ready' | 'progressing' | 'building' | 'starting';

/** ACS area Roman numeral → ordinal, for stable area ordering (I…XII). */
const ROMAN_ORDER: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
};

/**
 * Bucket a single element: not attempted → 'untouched'; weak (per the shared
 * `weaknessSeverity`) → 'critical'/'moderate'; otherwise (attempted, not weak,
 * i.e. latest satisfactory) → 'strong'. This is what the Weak/Strong tabs and
 * the coverage bars classify on — never the raw `latest_score`.
 */
export function elementStatus(score: ElementScore): ElementStatus {
  if (score.total_attempts === 0) return 'untouched';
  const sev = weaknessSeverity(score);
  if (sev === 'critical') return 'critical';
  if (sev === 'moderate') return 'moderate';
  return 'strong';
}

/**
 * Short plain-language reason an element is where it is — shown instead of the
 * contradictory `latest_score` (e.g. a "satisfactory" latest that's still weak
 * from repeated partials). Safe for any attempted element.
 */
export function weaknessReason(score: ElementScore): string {
  const { latest_score, total_attempts, unsatisfactory_count, partial_count } = score;
  if (total_attempts === 0) return 'not attempted';
  if (latest_score === 'unsatisfactory') return 'last answer unsatisfactory';
  if (unsatisfactory_count / total_attempts >= 0.5) return `${unsatisfactory_count} unsat in ${total_attempts}`;
  if (latest_score === 'partial') return 'last answer partial';
  if (partial_count / total_attempts >= 0.5) return `mostly partial (${partial_count}/${total_attempts})`;
  return 'satisfactory';
}

/**
 * The SATISFACTORY stat: share of graded answers scored satisfactory across all
 * attempts. `null` when nothing has been graded yet (so the UI can show "—").
 */
export function satisfactoryRate(scores: ElementScore[]): number | null {
  let sat = 0;
  let total = 0;
  for (const s of scores) {
    sat += s.satisfactory_count;
    total += s.total_attempts;
  }
  return total === 0 ? null : Math.round((sat / total) * 100);
}

export interface AreaCoverage {
  areaId: string;       // qualified prefix, e.g. 'IR.VI.'
  areaNum: string;      // bare Roman numeral, e.g. 'VI'
  areaName: string;     // human name, e.g. 'Instrument Approach Procedures'
  total: number;        // elements in the area
  attempted: number;    // elements with ≥1 attempt
  critical: number;
  moderate: number;
  strong: number;
  untouched: number;
  elements: { score: ElementScore; status: ElementStatus }[];
}

/**
 * Group element scores into per-area coverage (counts by status + the element
 * list), ordered by ACS area. Drives the "Coverage by area" bars.
 */
export function areaCoverage(scores: ElementScore[]): AreaCoverage[] {
  const byArea = new Map<string, AreaCoverage>();
  for (const score of scores) {
    const areaId = areaIdFromTaskId(score.task_id);
    let area = byArea.get(areaId);
    if (!area) {
      area = {
        areaId,
        areaNum: score.area,
        areaName: areaNameFromTaskId(score.task_id),
        total: 0, attempted: 0, critical: 0, moderate: 0, strong: 0, untouched: 0,
        elements: [],
      };
      byArea.set(areaId, area);
    }
    const status = elementStatus(score);
    area.total++;
    if (status !== 'untouched') area.attempted++;
    area[status]++;
    area.elements.push({ score, status });
  }
  return [...byArea.values()].sort(
    (a, b) => (ROMAN_ORDER[a.areaNum] ?? 99) - (ROMAN_ORDER[b.areaNum] ?? 99)
  );
}

export interface Readiness {
  score: number;   // 0–100
  tier: ReadinessTier;
}

/**
 * Checkride readiness, 0–100: 40% weight on ACS coverage (breadth) + 60% on
 * answer quality (satisfactory full credit, partial `PARTIAL_CREDIT`). Identical
 * to the prior inline formula; centralized so the gauge + tests share it.
 */
export function readiness(scores: ElementScore[]): Readiness {
  const total = scores.length;
  const attempted = scores.filter((s) => s.total_attempts > 0).length;
  if (attempted === 0 || total === 0) return { score: 0, tier: 'starting' };
  const satisfactory = scores.filter((s) => s.latest_score === 'satisfactory').length;
  const partial = scores.filter((s) => s.latest_score === 'partial').length;
  const coverageWeight = attempted / total;
  const qualityWeight = (satisfactory + partial * PARTIAL_CREDIT) / total;
  const score = Math.round(coverageWeight * 40 + qualityWeight * 60);
  const tier: ReadinessTier = score >= 80 ? 'ready' : score >= 50 ? 'progressing' : score >= 20 ? 'building' : 'starting';
  return { score, tier };
}
