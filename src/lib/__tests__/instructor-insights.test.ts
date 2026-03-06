import { describe, it, expect, vi } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import {
  computeReadiness,
  computeReadinessTrend,
  computeCoverage,
  extractWeakAreas,
  extractStrongAreas,
  extractGapElements,
  recommendTopics,
  checkNeedsAttention,
} from '../instructor-insights';

import type { ExamResultV2, AreaBreakdown, WeakElement } from '@/lib/exam-result';

// ---------------------------------------------------------------------------
// Helper: makeExamResult factory
// ---------------------------------------------------------------------------

function makeExamResult(overrides?: Partial<ExamResultV2>): ExamResultV2 {
  return {
    version: 2,
    overall_status: 'pass',
    overall_score: 0.75,
    asked_score: 0.85,
    total_in_plan: 20,
    elements_asked: 15,
    elements_credited: 2,
    elements_not_asked: 3,
    elements_satisfactory: 12,
    elements_partial: 2,
    elements_unsatisfactory: 1,
    areas: [],
    weak_elements: [],
    failed_areas: [],
    completion_trigger: 'all_tasks_covered',
    plan_exhausted: false,
    graded_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: computeReadiness
// ---------------------------------------------------------------------------

describe('computeReadiness', () => {
  it('returns 75 for overall_score 0.75', () => {
    const result = makeExamResult({ overall_score: 0.75 });
    expect(computeReadiness(result)).toBe(75);
  });

  it('returns 0 for overall_score 0', () => {
    const result = makeExamResult({ overall_score: 0 });
    expect(computeReadiness(result)).toBe(0);
  });

  it('returns 100 for overall_score 1.0', () => {
    const result = makeExamResult({ overall_score: 1.0 });
    expect(computeReadiness(result)).toBe(100);
  });

  it('returns null for null input', () => {
    expect(computeReadiness(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: computeReadinessTrend
// ---------------------------------------------------------------------------

describe('computeReadinessTrend', () => {
  it("returns 'improving' when recent > older by >5", () => {
    // recent avg = (90 + 85) / 2 = 87.5, older avg = (70 + 72) / 2 = 71, diff = 16.5
    expect(computeReadinessTrend([90, 85, 75, 70, 72])).toBe('improving');
  });

  it("returns 'declining' when recent < older by >5", () => {
    // recent avg = (50 + 55) / 2 = 52.5, older avg = (80 + 78) / 2 = 79, diff = -26.5
    expect(computeReadinessTrend([50, 55, 60, 80, 78])).toBe('declining');
  });

  it("returns 'stable' when diff within 5", () => {
    // recent avg = (75 + 74) / 2 = 74.5, older avg = (72 + 73) / 2 = 72.5, diff = 2
    expect(computeReadinessTrend([75, 74, 73, 72, 73])).toBe('stable');
  });

  it("returns 'insufficient_data' for 2 scores", () => {
    expect(computeReadinessTrend([80, 70])).toBe('insufficient_data');
  });

  it("returns 'insufficient_data' for 0 scores", () => {
    expect(computeReadinessTrend([])).toBe('insufficient_data');
  });

  it('handles exactly 3 scores (minimum for determination)', () => {
    // recent avg = (90 + 80) / 2 = 85, older avg = (80 + 70) / 2 = 75, diff = 10
    expect(computeReadinessTrend([90, 80, 70])).toBe('improving');
  });
});

// ---------------------------------------------------------------------------
// Tests: computeCoverage
// ---------------------------------------------------------------------------

describe('computeCoverage', () => {
  it('returns 85 for 15 asked + 2 credited out of 20', () => {
    const result = makeExamResult({
      elements_asked: 15,
      elements_credited: 2,
      total_in_plan: 20,
    });
    expect(computeCoverage(result)).toBe(85);
  });

  it('returns null for null input', () => {
    expect(computeCoverage(null)).toBeNull();
  });

  it('returns null for 0 total_in_plan', () => {
    const result = makeExamResult({ total_in_plan: 0 });
    expect(computeCoverage(result)).toBeNull();
  });

  it('returns 100 when all elements asked/credited', () => {
    const result = makeExamResult({
      elements_asked: 18,
      elements_credited: 2,
      total_in_plan: 20,
    });
    expect(computeCoverage(result)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Tests: extractWeakAreas
// ---------------------------------------------------------------------------

describe('extractWeakAreas', () => {
  it('returns areas with score < 0.60', () => {
    const areas: AreaBreakdown[] = [
      makeArea('I', { score: 0.50 }),
      makeArea('II', { score: 0.85 }),
      makeArea('III', { score: 0.40 }),
    ];
    expect(extractWeakAreas(areas)).toEqual(['I', 'III']);
  });

  it('does NOT include areas with score = 0.60 (boundary)', () => {
    const areas: AreaBreakdown[] = [
      makeArea('I', { score: 0.60 }),
      makeArea('II', { score: 0.59 }),
    ];
    expect(extractWeakAreas(areas)).toEqual(['II']);
  });

  it('returns empty array when all areas are strong', () => {
    const areas: AreaBreakdown[] = [
      makeArea('I', { score: 0.90 }),
      makeArea('II', { score: 0.75 }),
    ];
    expect(extractWeakAreas(areas)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: extractStrongAreas
// ---------------------------------------------------------------------------

describe('extractStrongAreas', () => {
  it('returns areas with score >= 0.85', () => {
    const areas: AreaBreakdown[] = [
      makeArea('I', { score: 0.90 }),
      makeArea('II', { score: 0.50 }),
      makeArea('III', { score: 0.95 }),
    ];
    expect(extractStrongAreas(areas)).toEqual(['I', 'III']);
  });

  it('includes areas with score exactly 0.85 (boundary)', () => {
    const areas: AreaBreakdown[] = [
      makeArea('I', { score: 0.85 }),
      makeArea('II', { score: 0.84 }),
    ];
    expect(extractStrongAreas(areas)).toEqual(['I']);
  });

  it('returns empty array when no areas qualify', () => {
    const areas: AreaBreakdown[] = [
      makeArea('I', { score: 0.60 }),
      makeArea('II', { score: 0.70 }),
    ];
    expect(extractStrongAreas(areas)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: extractGapElements
// ---------------------------------------------------------------------------

describe('extractGapElements', () => {
  it('returns only not_asked elements', () => {
    const elements: WeakElement[] = [
      { element_code: 'PA.I.A.K1', area: 'I', score: 'unsatisfactory', severity: 'unsatisfactory' },
      { element_code: 'PA.I.B.K1', area: 'I', score: null, severity: 'not_asked' },
      { element_code: 'PA.II.A.K1', area: 'II', score: null, severity: 'not_asked' },
    ];
    expect(extractGapElements(elements)).toEqual(['PA.I.B.K1', 'PA.II.A.K1']);
  });

  it('ignores unsatisfactory and partial', () => {
    const elements: WeakElement[] = [
      { element_code: 'PA.I.A.K1', area: 'I', score: 'unsatisfactory', severity: 'unsatisfactory' },
      { element_code: 'PA.I.A.K2', area: 'I', score: 'partial', severity: 'partial' },
    ];
    expect(extractGapElements(elements)).toEqual([]);
  });

  it('returns empty array when no gaps', () => {
    expect(extractGapElements([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: recommendTopics
// ---------------------------------------------------------------------------

describe('recommendTopics', () => {
  it('returns max 5 elements', () => {
    const elements: WeakElement[] = [
      { element_code: 'PA.I.A.K1', area: 'I', score: null, severity: 'not_asked' },
      { element_code: 'PA.I.A.K2', area: 'I', score: null, severity: 'not_asked' },
      { element_code: 'PA.I.B.K1', area: 'I', score: null, severity: 'not_asked' },
      { element_code: 'PA.II.A.K1', area: 'II', score: null, severity: 'not_asked' },
      { element_code: 'PA.II.A.K2', area: 'II', score: null, severity: 'not_asked' },
      { element_code: 'PA.II.B.K1', area: 'II', score: null, severity: 'not_asked' },
      { element_code: 'PA.III.A.K1', area: 'III', score: null, severity: 'not_asked' },
    ];
    expect(recommendTopics(elements)).toHaveLength(5);
  });

  it('sorts unsatisfactory first, then partial, then not_asked', () => {
    const elements: WeakElement[] = [
      { element_code: 'PA.I.A.K1', area: 'I', score: null, severity: 'not_asked' },
      { element_code: 'PA.I.A.K2', area: 'I', score: 'partial', severity: 'partial' },
      { element_code: 'PA.I.B.K1', area: 'I', score: 'unsatisfactory', severity: 'unsatisfactory' },
    ];
    expect(recommendTopics(elements)).toEqual([
      'PA.I.B.K1',  // unsatisfactory first
      'PA.I.A.K2',  // partial second
      'PA.I.A.K1',  // not_asked last
    ]);
  });

  it('returns fewer than 5 when fewer weak elements exist', () => {
    const elements: WeakElement[] = [
      { element_code: 'PA.I.A.K1', area: 'I', score: 'unsatisfactory', severity: 'unsatisfactory' },
      { element_code: 'PA.I.A.K2', area: 'I', score: 'partial', severity: 'partial' },
    ];
    expect(recommendTopics(elements)).toEqual(['PA.I.A.K1', 'PA.I.A.K2']);
    expect(recommendTopics(elements)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(recommendTopics([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: checkNeedsAttention
// ---------------------------------------------------------------------------

describe('checkNeedsAttention', () => {
  it('flags when readiness < 60', () => {
    const result = checkNeedsAttention(45, 'stable', new Date().toISOString());
    expect(result.needsAttention).toBe(true);
    expect(result.reasons).toContain('Readiness score below 60%');
  });

  it("flags when trend is 'declining'", () => {
    const result = checkNeedsAttention(80, 'declining', new Date().toISOString());
    expect(result.needsAttention).toBe(true);
    expect(result.reasons).toContain('Performance trend is declining');
  });

  it('flags when lastActivityAt is > 7 days ago', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const result = checkNeedsAttention(80, 'stable', eightDaysAgo);
    expect(result.needsAttention).toBe(true);
    expect(result.reasons).toContain('No practice activity in 7+ days');
  });

  it('flags when lastActivityAt is null', () => {
    const result = checkNeedsAttention(80, 'stable', null);
    expect(result.needsAttention).toBe(true);
    expect(result.reasons).toContain('No practice activity in 7+ days');
  });

  it('returns needsAttention=false when all good (readiness 80, stable, recent activity)', () => {
    const result = checkNeedsAttention(80, 'stable', new Date().toISOString());
    expect(result.needsAttention).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('returns multiple reasons when multiple conditions met', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = checkNeedsAttention(40, 'declining', tenDaysAgo);
    expect(result.needsAttention).toBe(true);
    expect(result.reasons).toHaveLength(3);
    expect(result.reasons).toContain('Readiness score below 60%');
    expect(result.reasons).toContain('Performance trend is declining');
    expect(result.reasons).toContain('No practice activity in 7+ days');
  });
});

// ---------------------------------------------------------------------------
// Helper: makeArea factory
// ---------------------------------------------------------------------------

function makeArea(area: string, overrides?: Partial<AreaBreakdown>): AreaBreakdown {
  return {
    area,
    total_in_plan: 5,
    asked: 4,
    satisfactory: 3,
    partial: 1,
    unsatisfactory: 0,
    credited_by_mention: 0,
    score: 0.75,
    status: 'pass',
    ...overrides,
  };
}
