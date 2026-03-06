/**
 * scripts/eval/instructor-insights-audit.ts
 *
 * Deterministic offline audit for instructor insights + milestones system.
 * Run: npx tsx scripts/eval/instructor-insights-audit.ts
 *
 * 10 checks — no database or network access.
 * Pure functions are inlined to avoid the `server-only` import guard
 * in instructor-insights.ts.
 */

import {
  MILESTONE_KEYS,
  MILESTONE_LABELS,
  OPTIONAL_EMAIL_CATEGORIES,
} from '../../src/types/database';

// ============================================================
// Inlined pure functions from src/lib/instructor-insights.ts
// (avoids server-only import guard)
// ============================================================

interface AreaBreakdown {
  area: string;
  total_in_plan: number;
  asked: number;
  satisfactory: number;
  partial: number;
  unsatisfactory: number;
  credited_by_mention: number;
  score: number;
  status: string;
  status_reason?: string;
}

interface WeakElement {
  element_code: string;
  area: string;
  score: 'unsatisfactory' | 'partial' | null;
  severity: 'unsatisfactory' | 'partial' | 'not_asked';
}

interface ExamResultV2 {
  version: 2;
  overall_status: string;
  overall_score: number;
  asked_score: number;
  total_in_plan: number;
  elements_asked: number;
  elements_credited: number;
  elements_not_asked: number;
  elements_satisfactory: number;
  elements_partial: number;
  elements_unsatisfactory: number;
  areas: AreaBreakdown[];
  weak_elements: WeakElement[];
  failed_areas: string[];
  completion_trigger: string;
  plan_exhausted: boolean;
  graded_at: string;
}

function computeReadiness(examResultV2: ExamResultV2 | null): number | null {
  if (!examResultV2) return null;
  return Math.round(examResultV2.overall_score * 100);
}

function computeReadinessTrend(
  scores: number[]
): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  if (scores.length < 3) return 'insufficient_data';
  const recentAvg = (scores[0] + scores[1]) / 2;
  const olderAvg = (scores[scores.length - 2] + scores[scores.length - 1]) / 2;
  const diff = recentAvg - olderAvg;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

function computeCoverage(examResultV2: ExamResultV2 | null): number | null {
  if (!examResultV2) return null;
  if (examResultV2.total_in_plan === 0) return null;
  return Math.round(
    ((examResultV2.elements_asked + examResultV2.elements_credited) /
      examResultV2.total_in_plan) *
      100
  );
}

function extractWeakAreas(areas: AreaBreakdown[]): string[] {
  return areas.filter((a) => a.score < 0.60).map((a) => a.area);
}

function extractStrongAreas(areas: AreaBreakdown[]): string[] {
  return areas.filter((a) => a.score >= 0.85).map((a) => a.area);
}

function extractGapElements(weakElements: WeakElement[]): string[] {
  return weakElements
    .filter((e) => e.severity === 'not_asked')
    .map((e) => e.element_code);
}

function recommendTopics(weakElements: WeakElement[]): string[] {
  const severityOrder: Record<string, number> = {
    unsatisfactory: 0,
    partial: 1,
    not_asked: 2,
  };
  const sorted = [...weakElements].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
  return sorted.slice(0, 5).map((e) => e.element_code);
}

function checkNeedsAttention(
  readiness: number | null,
  trend: string,
  lastActivityAt: string | null
): { needsAttention: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (readiness !== null && readiness < 60) {
    reasons.push('Readiness score below 60%');
  }
  if (trend === 'declining') {
    reasons.push('Performance trend is declining');
  }
  if (!lastActivityAt) {
    reasons.push('No practice activity in 7+ days');
  } else {
    const lastActivity = new Date(lastActivityAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActivity.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      reasons.push('No practice activity in 7+ days');
    }
  }
  return { needsAttention: reasons.length > 0, reasons };
}

// ============================================================
// Test helpers
// ============================================================

let passed = 0;
let failed = 0;

function check(name: string, fn: () => boolean): void {
  try {
    const result = fn();
    if (result) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name} — returned false`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ ${name} — ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

// ============================================================
// Mock data
// ============================================================

function makeExamResult(overrides?: Partial<ExamResultV2>): ExamResultV2 {
  return {
    version: 2,
    overall_status: 'pass',
    overall_score: 0.75,
    asked_score: 0.80,
    total_in_plan: 20,
    elements_asked: 15,
    elements_credited: 2,
    elements_not_asked: 3,
    elements_satisfactory: 12,
    elements_partial: 2,
    elements_unsatisfactory: 1,
    areas: [
      { area: 'I', total_in_plan: 6, asked: 5, satisfactory: 4, partial: 1, unsatisfactory: 0, credited_by_mention: 1, score: 0.94, status: 'pass' },
      { area: 'II', total_in_plan: 4, asked: 3, satisfactory: 2, partial: 0, unsatisfactory: 1, credited_by_mention: 0, score: 0.67, status: 'pass' },
      { area: 'III', total_in_plan: 5, asked: 4, satisfactory: 3, partial: 1, unsatisfactory: 0, credited_by_mention: 1, score: 0.93, status: 'pass' },
      { area: 'IX', total_in_plan: 5, asked: 3, satisfactory: 3, partial: 0, unsatisfactory: 0, credited_by_mention: 0, score: 1.0, status: 'pass' },
    ],
    weak_elements: [
      { element_code: 'PA.II.A.K1', area: 'II', score: 'unsatisfactory', severity: 'unsatisfactory' },
      { element_code: 'PA.I.A.K3', area: 'I', score: 'partial', severity: 'partial' },
      { element_code: 'PA.IX.A.K2', area: 'IX', score: null, severity: 'not_asked' },
      { element_code: 'PA.III.A.K4', area: 'III', score: null, severity: 'not_asked' },
    ],
    failed_areas: [],
    completion_trigger: 'user_ended',
    plan_exhausted: false,
    graded_at: '2026-03-06T00:00:00.000Z',
    ...overrides,
  };
}

// ============================================================
// Checks
// ============================================================

console.log('\n📊 Instructor Insights + Milestones Audit\n');

// 1. computeReadiness returns correct percentage
check('1. computeReadiness maps 0-1 score to 0-100', () => {
  const r1 = computeReadiness(makeExamResult({ overall_score: 0.75 }));
  const r2 = computeReadiness(makeExamResult({ overall_score: 0 }));
  const r3 = computeReadiness(makeExamResult({ overall_score: 1.0 }));
  const r4 = computeReadiness(null);
  return r1 === 75 && r2 === 0 && r3 === 100 && r4 === null;
});

// 2. computeReadinessTrend handles all cases
check('2. computeReadinessTrend: improving, declining, stable, insufficient_data', () => {
  const improving = computeReadinessTrend([80, 75, 60, 55]);
  const declining = computeReadinessTrend([50, 55, 70, 75]);
  const stable = computeReadinessTrend([70, 72, 68, 71]);
  const insufficient = computeReadinessTrend([80, 70]);
  return improving === 'improving' && declining === 'declining' && stable === 'stable' && insufficient === 'insufficient_data';
});

// 3. computeCoverage calculates correctly
check('3. computeCoverage: (asked + credited) / total_in_plan * 100', () => {
  const c = computeCoverage(makeExamResult({ elements_asked: 15, elements_credited: 2, total_in_plan: 20 }));
  const cNull = computeCoverage(null);
  const cZero = computeCoverage(makeExamResult({ total_in_plan: 0 }));
  return c === 85 && cNull === null && cZero === null;
});

// 4. extractWeakAreas returns areas with score < 0.60
check('4. extractWeakAreas: correct threshold at 0.60', () => {
  const areas: AreaBreakdown[] = [
    { area: 'I', total_in_plan: 5, asked: 5, satisfactory: 5, partial: 0, unsatisfactory: 0, credited_by_mention: 0, score: 0.90, status: 'pass' },
    { area: 'II', total_in_plan: 5, asked: 5, satisfactory: 2, partial: 0, unsatisfactory: 3, credited_by_mention: 0, score: 0.40, status: 'fail' },
    { area: 'III', total_in_plan: 5, asked: 5, satisfactory: 3, partial: 2, unsatisfactory: 0, credited_by_mention: 0, score: 0.60, status: 'pass' },
  ];
  const weak = extractWeakAreas(areas);
  return weak.length === 1 && weak[0] === 'II';
});

// 5. extractStrongAreas returns areas with score >= 0.85
check('5. extractStrongAreas: correct threshold at 0.85', () => {
  const areas: AreaBreakdown[] = [
    { area: 'I', total_in_plan: 5, asked: 5, satisfactory: 5, partial: 0, unsatisfactory: 0, credited_by_mention: 0, score: 0.90, status: 'pass' },
    { area: 'II', total_in_plan: 5, asked: 5, satisfactory: 4, partial: 1, unsatisfactory: 0, credited_by_mention: 0, score: 0.84, status: 'pass' },
    { area: 'III', total_in_plan: 5, asked: 5, satisfactory: 5, partial: 0, unsatisfactory: 0, credited_by_mention: 0, score: 0.85, status: 'pass' },
  ];
  const strong = extractStrongAreas(areas);
  return strong.length === 2 && strong.includes('I') && strong.includes('III');
});

// 6. recommendTopics returns top 5 sorted by severity
check('6. recommendTopics: unsatisfactory > partial > not_asked, max 5', () => {
  const weak: WeakElement[] = [
    { element_code: 'A', area: 'I', score: null, severity: 'not_asked' },
    { element_code: 'B', area: 'I', score: 'partial', severity: 'partial' },
    { element_code: 'C', area: 'I', score: 'unsatisfactory', severity: 'unsatisfactory' },
    { element_code: 'D', area: 'I', score: null, severity: 'not_asked' },
    { element_code: 'E', area: 'I', score: 'partial', severity: 'partial' },
    { element_code: 'F', area: 'I', score: null, severity: 'not_asked' },
  ];
  const topics = recommendTopics(weak);
  return topics.length === 5 && topics[0] === 'C' && topics[1] === 'B' && topics[2] === 'E';
});

// 7. extractGapElements returns only not_asked elements
check('7. extractGapElements: only severity=not_asked', () => {
  const weak: WeakElement[] = [
    { element_code: 'A', area: 'I', score: 'unsatisfactory', severity: 'unsatisfactory' },
    { element_code: 'B', area: 'I', score: null, severity: 'not_asked' },
    { element_code: 'C', area: 'I', score: 'partial', severity: 'partial' },
  ];
  const gaps = extractGapElements(weak);
  return gaps.length === 1 && gaps[0] === 'B';
});

// 8. checkNeedsAttention covers all three conditions
check('8. checkNeedsAttention: readiness<60, declining, inactive all flagged', () => {
  const lowScore = checkNeedsAttention(55, 'stable', new Date().toISOString());
  const declining = checkNeedsAttention(80, 'declining', new Date().toISOString());
  const inactive = checkNeedsAttention(80, 'stable', new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString());
  const noActivity = checkNeedsAttention(null, 'stable', null);
  const fine = checkNeedsAttention(80, 'stable', new Date().toISOString());
  return (
    lowScore.needsAttention && lowScore.reasons.length === 1 &&
    declining.needsAttention && declining.reasons.length === 1 &&
    inactive.needsAttention && inactive.reasons[0].includes('7+') &&
    noActivity.needsAttention &&
    !fine.needsAttention
  );
});

// 9. MILESTONE_KEYS has exactly 4 entries with matching labels
check('9. MILESTONE_KEYS: 4 keys with labels', () => {
  return MILESTONE_KEYS.length === 4 &&
    MILESTONE_KEYS.every(k => MILESTONE_LABELS[k] !== undefined && MILESTONE_LABELS[k].length > 0);
});

// 10. instructor_weekly_summary is in OPTIONAL_EMAIL_CATEGORIES
check('10. instructor_weekly_summary in OPTIONAL_EMAIL_CATEGORIES', () => {
  return OPTIONAL_EMAIL_CATEGORIES.includes('instructor_weekly_summary');
});

// ============================================================
// Summary
// ============================================================

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
