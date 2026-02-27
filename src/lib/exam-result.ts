/**
 * ExamResultV2 — plan-based grading with per-area gating and weak-area feedback.
 *
 * Builds on Phase 4 ExamPlanV1 to provide:
 *   - Plan-based denominator (total elements in plan, not just asked)
 *   - Per-area pass/fail with configurable thresholds
 *   - Weak element identification with severity levels
 *   - Completion reason tracking
 *
 * Persisted to exam_sessions.metadata.examResultV2 (no schema changes).
 * V1 ExamResult continues to be stored in exam_sessions.result for backwards compat.
 */

import type { ExamPlanV1, ElementCoverageStatus } from '@/lib/exam-plan';
import type { CompletionTrigger } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverallStatus = 'pass' | 'fail' | 'incomplete';
export type AreaStatus = 'pass' | 'fail' | 'insufficient_data';
export type WeakElementSeverity = 'unsatisfactory' | 'partial' | 'not_asked';

export interface AreaBreakdown {
  /** ACS area identifier (Roman numeral, e.g. "I", "II") */
  area: string;
  /** Number of elements in the plan for this area */
  total_in_plan: number;
  /** Number of elements actually scored (asked) */
  asked: number;
  /** Score counts */
  satisfactory: number;
  partial: number;
  unsatisfactory: number;
  /** Credited via mention (not directly asked) */
  credited_by_mention: number;
  /** Area-level score: points / asked (NaN-safe, 0 if no asks) */
  score: number;
  /** Per-area gating result */
  status: AreaStatus;
  /** Reason for fail/insufficient, if applicable */
  status_reason?: string;
}

export interface WeakElement {
  /** Element code (e.g. "PA.I.A.K1") */
  element_code: string;
  /** Area (e.g. "I") */
  area: string;
  /** Score received (null = not asked) */
  score: 'unsatisfactory' | 'partial' | null;
  /** Severity classification */
  severity: WeakElementSeverity;
}

export interface ExamResultV2 {
  version: 2;
  /** Overall exam outcome */
  overall_status: OverallStatus;
  /** Aggregate score (points / total plan elements) — plan-based denominator */
  overall_score: number;
  /** Aggregate score based on asked only (points / asked) — for comparison with V1 */
  asked_score: number;
  /** Total elements in the exam plan */
  total_in_plan: number;
  /** Elements actually scored */
  elements_asked: number;
  /** Elements credited by mention */
  elements_credited: number;
  /** Elements not asked and not credited */
  elements_not_asked: number;
  /** Score breakdown */
  elements_satisfactory: number;
  elements_partial: number;
  elements_unsatisfactory: number;
  /** Per-area breakdown with gating results */
  areas: AreaBreakdown[];
  /** Elements requiring review (unsatisfactory, partial, or not asked) */
  weak_elements: WeakElement[];
  /** Which areas failed gating (empty = all passed) */
  failed_areas: string[];
  /** Why the exam ended */
  completion_trigger: CompletionTrigger;
  /** Whether the plan was fully executed */
  plan_exhausted: boolean;
  /** ISO timestamp */
  graded_at: string;
}

// ---------------------------------------------------------------------------
// Gating Configuration
// ---------------------------------------------------------------------------

export interface GatingConfig {
  /** Overall pass threshold (default: 0.70) */
  overall_pass_threshold: number;
  /** Per-area pass threshold (default: 0.60) */
  area_pass_threshold: number;
  /** Minimum scored elements per area for area gating to apply (default: 2 for full exam, 1 for narrow) */
  min_area_attempts: number;
  /** Areas considered critical (regulatory-heavy). Unsatisfactory in critical area with no remediation = fail. */
  critical_areas: string[];
}

export const DEFAULT_GATING_CONFIG: GatingConfig = {
  overall_pass_threshold: 0.70,
  area_pass_threshold: 0.60,
  min_area_attempts: 2,
  critical_areas: [], // Populated per-rating at call time
};

/**
 * Critical areas by rating — areas heavy in regulatory knowledge where
 * unsatisfactory scores are especially concerning for safety.
 *
 * Private: I (Preflight Preparation — regs, airworthiness, weather)
 * Commercial: I (Preflight Preparation — commercial regs, privileges/limitations)
 * Instrument: I (Preflight Preparation — IFR regs, currency), III (ATC Clearances)
 */
export const CRITICAL_AREAS_BY_RATING: Record<string, string[]> = {
  private: ['I'],
  commercial: ['I'],
  instrument: ['I', 'III'],
  atp: ['I'],
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

/**
 * Compute ExamResultV2 from element attempts and the exam plan.
 *
 * Pure function — no external dependencies.
 *
 * Scoring (same as V1 for consistency):
 *   - satisfactory = 1.0 point
 *   - partial = 0.7 points
 *   - unsatisfactory = 0 points
 *
 * Key difference from V1: denominator is plan-based (all elements in plan),
 * not just elements asked. This means not-asked elements count as 0 points.
 *
 * Per-area gating: each area must independently meet area_pass_threshold,
 * and areas must have at least min_area_attempts scored elements for gating
 * to apply. Critical areas with any unsatisfactory score are flagged.
 */
export function computeExamResultV2(
  attempts: Array<{ element_code: string; score: 'satisfactory' | 'unsatisfactory' | 'partial' }>,
  examPlan: ExamPlanV1,
  completionTrigger: CompletionTrigger,
  rating: string = 'private',
  gatingOverrides?: Partial<GatingConfig>
): ExamResultV2 {
  const config: GatingConfig = {
    ...DEFAULT_GATING_CONFIG,
    critical_areas: CRITICAL_AREAS_BY_RATING[rating] || [],
    ...gatingOverrides,
  };

  const planElements = Object.keys(examPlan.coverage);
  const totalInPlan = planElements.length;

  // Degenerate case
  if (totalInPlan === 0) {
    return {
      version: 2,
      overall_status: 'incomplete',
      overall_score: 0,
      asked_score: 0,
      total_in_plan: 0,
      elements_asked: 0,
      elements_credited: 0,
      elements_not_asked: 0,
      elements_satisfactory: 0,
      elements_partial: 0,
      elements_unsatisfactory: 0,
      areas: [],
      weak_elements: [],
      failed_areas: [],
      completion_trigger: completionTrigger,
      plan_exhausted: false,
      graded_at: new Date().toISOString(),
    };
  }

  // Deduplicate attempts (last write wins — handles retries)
  const deduped = new Map<string, typeof attempts[0]>();
  for (const a of attempts) {
    deduped.set(a.element_code, a);
  }

  // Build per-element score map from deduped attempts
  const scoreMap = new Map<string, 'satisfactory' | 'unsatisfactory' | 'partial'>();
  for (const [code, a] of deduped) {
    scoreMap.set(code, a.score);
  }

  // Count coverage statuses from plan
  let elementsCredited = 0;
  for (const status of Object.values(examPlan.coverage)) {
    if (status === 'credited_by_mention') elementsCredited++;
  }

  // Count scored elements
  const elementsAsked = scoreMap.size;
  const elementsSatisfactory = [...scoreMap.values()].filter(s => s === 'satisfactory').length;
  const elementsPartial = [...scoreMap.values()].filter(s => s === 'partial').length;
  const elementsUnsatisfactory = [...scoreMap.values()].filter(s => s === 'unsatisfactory').length;
  const elementsNotAsked = Math.max(0, totalInPlan - elementsAsked - elementsCredited);

  // Points
  const pointsEarned = elementsSatisfactory * 1.0 + elementsPartial * 0.7;

  // Plan-based score: denominator = total plan elements (not-asked = 0 points)
  // Credited-by-mention elements count as satisfactory (1.0 point each)
  const adjustedPoints = pointsEarned + elementsCredited * 1.0;
  const overallScore = totalInPlan > 0
    ? Math.round((adjustedPoints / totalInPlan) * 100) / 100
    : 0;

  // Asked-only score (for comparison with V1)
  const askedScore = elementsAsked > 0
    ? Math.round((pointsEarned / elementsAsked) * 100) / 100
    : 0;

  // -----------------------------------------------------------------------
  // Per-area breakdown
  // -----------------------------------------------------------------------

  // Group plan elements by area
  const areaGroups = new Map<string, string[]>();
  for (const code of planElements) {
    const area = extractArea(code);
    if (!areaGroups.has(area)) areaGroups.set(area, []);
    areaGroups.get(area)!.push(code);
  }

  const areas: AreaBreakdown[] = [];
  const failedAreas: string[] = [];

  for (const [area, codes] of areaGroups) {
    const areaTotal = codes.length;
    let areaSat = 0, areaPart = 0, areaUnsat = 0, areaCredited = 0, areaAsked = 0;

    for (const code of codes) {
      const coverageStatus = examPlan.coverage[code];
      if (coverageStatus === 'credited_by_mention') {
        areaCredited++;
        continue;
      }
      const score = scoreMap.get(code);
      if (score) {
        areaAsked++;
        if (score === 'satisfactory') areaSat++;
        else if (score === 'partial') areaPart++;
        else areaUnsat++;
      }
    }

    const areaPoints = areaSat * 1.0 + areaPart * 0.7;
    const areaScore = areaAsked > 0
      ? Math.round((areaPoints / areaAsked) * 100) / 100
      : 0;

    // Area gating
    let areaStatus: AreaStatus;
    let statusReason: string | undefined;

    if (areaAsked < config.min_area_attempts) {
      areaStatus = 'insufficient_data';
      statusReason = `Only ${areaAsked} of ${config.min_area_attempts} required attempts`;
    } else if (areaScore < config.area_pass_threshold) {
      areaStatus = 'fail';
      statusReason = `Score ${(areaScore * 100).toFixed(0)}% below ${(config.area_pass_threshold * 100).toFixed(0)}% threshold`;
      failedAreas.push(area);
    } else if (config.critical_areas.includes(area) && areaUnsat > 0) {
      areaStatus = 'fail';
      statusReason = `Critical area with ${areaUnsat} unsatisfactory element(s)`;
      failedAreas.push(area);
    } else {
      areaStatus = 'pass';
    }

    areas.push({
      area,
      total_in_plan: areaTotal,
      asked: areaAsked,
      satisfactory: areaSat,
      partial: areaPart,
      unsatisfactory: areaUnsat,
      credited_by_mention: areaCredited,
      score: areaScore,
      status: areaStatus,
      ...(statusReason ? { status_reason: statusReason } : {}),
    });
  }

  // Sort areas by Roman numeral order
  areas.sort((a, b) => romanToInt(a.area) - romanToInt(b.area));

  // -----------------------------------------------------------------------
  // Weak elements
  // -----------------------------------------------------------------------

  const weakElements: WeakElement[] = [];

  for (const code of planElements) {
    const score = scoreMap.get(code);
    const coverage = examPlan.coverage[code];

    if (score === 'unsatisfactory') {
      weakElements.push({
        element_code: code,
        area: extractArea(code),
        score: 'unsatisfactory',
        severity: 'unsatisfactory',
      });
    } else if (score === 'partial') {
      weakElements.push({
        element_code: code,
        area: extractArea(code),
        score: 'partial',
        severity: 'partial',
      });
    } else if (!score && coverage !== 'credited_by_mention') {
      // Not asked and not credited = gap
      weakElements.push({
        element_code: code,
        area: extractArea(code),
        score: null,
        severity: 'not_asked',
      });
    }
  }

  // Sort: unsatisfactory first, then partial, then not_asked
  const severityOrder: Record<WeakElementSeverity, number> = {
    unsatisfactory: 0,
    partial: 1,
    not_asked: 2,
  };
  weakElements.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // -----------------------------------------------------------------------
  // Overall status
  // -----------------------------------------------------------------------

  const planExhausted = completionTrigger === 'all_tasks_covered'
    || Object.values(examPlan.coverage).every(s => s !== 'pending');

  let overallStatus: OverallStatus;

  if (elementsAsked === 0) {
    overallStatus = 'incomplete';
  } else if (completionTrigger === 'user_ended' && elementsAsked < 3) {
    // User ended very early — not enough data to grade
    overallStatus = 'incomplete';
  } else if (overallScore < config.overall_pass_threshold) {
    overallStatus = 'fail';
  } else if (failedAreas.length > 0) {
    overallStatus = 'fail';
  } else {
    overallStatus = 'pass';
  }

  return {
    version: 2,
    overall_status: overallStatus,
    overall_score: overallScore,
    asked_score: askedScore,
    total_in_plan: totalInPlan,
    elements_asked: elementsAsked,
    elements_credited: elementsCredited,
    elements_not_asked: elementsNotAsked,
    elements_satisfactory: elementsSatisfactory,
    elements_partial: elementsPartial,
    elements_unsatisfactory: elementsUnsatisfactory,
    areas,
    weak_elements: weakElements,
    failed_areas: failedAreas,
    completion_trigger: completionTrigger,
    plan_exhausted: planExhausted,
    graded_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the ACS area (Roman numeral) from an element code.
 * e.g. "PA.I.A.K1" → "I", "IR.III.B.R2" → "III"
 */
function extractArea(elementCode: string): string {
  const parts = elementCode.split('.');
  return parts.length >= 2 ? parts[1] : '';
}

/**
 * Convert Roman numeral to integer for sorting.
 * Handles I through XII (sufficient for ACS areas).
 */
function romanToInt(roman: string): number {
  const map: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
    VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
  };
  return map[roman] ?? 99;
}
