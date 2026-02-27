import { describe, it, expect } from 'vitest';
import {
  computeExamResultV2,
  DEFAULT_GATING_CONFIG,
  CRITICAL_AREAS_BY_RATING,
  type GatingConfig,
} from '../exam-result';
import type { ExamPlanV1 } from '../exam-plan';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(elements: string[], overrides?: Partial<ExamPlanV1>): ExamPlanV1 {
  const coverage: Record<string, 'pending' | 'asked' | 'credited_by_mention' | 'skipped'> = {};
  for (const code of elements) {
    coverage[code] = 'pending';
  }
  return {
    version: 1,
    planned_question_count: elements.length,
    bonus_question_max: 2,
    follow_up_max_per_element: 1,
    asked_count: 0,
    bonus_used: 0,
    mode: 'linear',
    coverage,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAttempt(code: string, score: 'satisfactory' | 'unsatisfactory' | 'partial') {
  return { element_code: code, score };
}

// Standard element codes across 3 areas
const AREA_I_ELEMENTS = ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.B.K1', 'PA.I.B.R1'];
const AREA_II_ELEMENTS = ['PA.II.A.K1', 'PA.II.A.K2', 'PA.II.B.K1'];
const AREA_III_ELEMENTS = ['PA.III.A.K1', 'PA.III.A.K2'];
const ALL_ELEMENTS = [...AREA_I_ELEMENTS, ...AREA_II_ELEMENTS, ...AREA_III_ELEMENTS];

// ---------------------------------------------------------------------------
// Tests: ExamResultV2 Computation
// ---------------------------------------------------------------------------

describe('computeExamResultV2', () => {
  describe('basic computation', () => {
    it('returns incomplete for empty plan', () => {
      const plan = makePlan([]);
      const result = computeExamResultV2([], plan, 'all_tasks_covered');
      expect(result.version).toBe(2);
      expect(result.overall_status).toBe('incomplete');
      expect(result.overall_score).toBe(0);
      expect(result.total_in_plan).toBe(0);
    });

    it('returns incomplete when no elements asked', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const result = computeExamResultV2([], plan, 'all_tasks_covered');
      expect(result.overall_status).toBe('incomplete');
      expect(result.elements_asked).toBe(0);
      expect(result.elements_not_asked).toBe(ALL_ELEMENTS.length);
    });

    it('computes plan-based denominator (not asked-only)', () => {
      const plan = makePlan(ALL_ELEMENTS);
      // Only answer 3 of 9 elements, all satisfactory
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'),
        makeAttempt('PA.I.A.K2', 'satisfactory'),
        makeAttempt('PA.I.B.K1', 'satisfactory'),
      ];
      const result = computeExamResultV2(attempts, plan, 'user_ended');

      // Plan-based: 3/9 ≈ 0.33
      expect(result.overall_score).toBeCloseTo(3 / 9, 2);
      // Asked-only: 3/3 = 1.00
      expect(result.asked_score).toBe(1.0);
      expect(result.elements_asked).toBe(3);
      expect(result.elements_not_asked).toBe(6);
    });

    it('passes when all elements satisfactory', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const attempts = ALL_ELEMENTS.map(code => makeAttempt(code, 'satisfactory'));
      // Mark all as asked in plan coverage
      for (const code of ALL_ELEMENTS) plan.coverage[code] = 'asked';
      plan.asked_count = ALL_ELEMENTS.length;

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.overall_status).toBe('pass');
      expect(result.overall_score).toBe(1.0);
      expect(result.failed_areas).toEqual([]);
    });

    it('fails when overall score below threshold', () => {
      const plan = makePlan(ALL_ELEMENTS);
      // 5 unsatisfactory, 4 satisfactory → 4/9 ≈ 0.44
      const attempts = [
        makeAttempt('PA.I.A.K1', 'unsatisfactory'),
        makeAttempt('PA.I.A.K2', 'unsatisfactory'),
        makeAttempt('PA.I.B.K1', 'unsatisfactory'),
        makeAttempt('PA.I.B.R1', 'unsatisfactory'),
        makeAttempt('PA.II.A.K1', 'unsatisfactory'),
        makeAttempt('PA.II.A.K2', 'satisfactory'),
        makeAttempt('PA.II.B.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K2', 'satisfactory'),
      ];
      for (const code of ALL_ELEMENTS) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.overall_status).toBe('fail');
      expect(result.overall_score).toBeCloseTo(4 / 9, 2);
    });

    it('includes partial score as 0.7 points', () => {
      const elements = ['PA.I.A.K1', 'PA.I.A.K2'];
      const plan = makePlan(elements);
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'), // 1.0
        makeAttempt('PA.I.A.K2', 'partial'),       // 0.7
      ];
      for (const code of elements) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.overall_score).toBeCloseTo((1.0 + 0.7) / 2, 2);
      expect(result.elements_partial).toBe(1);
    });

    it('counts credited-by-mention as satisfactory for overall score', () => {
      const plan = makePlan(ALL_ELEMENTS);
      // Credit 3 elements by mention
      plan.coverage['PA.I.A.K1'] = 'credited_by_mention';
      plan.coverage['PA.I.A.K2'] = 'credited_by_mention';
      plan.coverage['PA.I.B.K1'] = 'credited_by_mention';

      // Ask remaining 6, all satisfactory
      const remaining = ALL_ELEMENTS.filter(c =>
        !['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.B.K1'].includes(c)
      );
      const attempts = remaining.map(code => makeAttempt(code, 'satisfactory'));
      for (const code of remaining) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      // 6 asked (1.0 each) + 3 credited (1.0 each) = 9/9 = 1.0
      expect(result.overall_score).toBe(1.0);
      expect(result.elements_credited).toBe(3);
      expect(result.elements_asked).toBe(6);
    });

    it('deduplicates attempts (last write wins)', () => {
      const elements = ['PA.I.A.K1'];
      const plan = makePlan(elements);
      const attempts = [
        makeAttempt('PA.I.A.K1', 'unsatisfactory'),
        makeAttempt('PA.I.A.K1', 'satisfactory'), // retry succeeded
      ];

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.elements_satisfactory).toBe(1);
      expect(result.elements_unsatisfactory).toBe(0);
    });
  });

  describe('per-area gating', () => {
    it('fails exam when an area score is below area threshold', () => {
      const plan = makePlan(ALL_ELEMENTS);
      // Area I: all unsatisfactory (0%), Areas II+III: all satisfactory
      const attempts = [
        makeAttempt('PA.I.A.K1', 'unsatisfactory'),
        makeAttempt('PA.I.A.K2', 'unsatisfactory'),
        makeAttempt('PA.I.B.K1', 'unsatisfactory'),
        makeAttempt('PA.I.B.R1', 'unsatisfactory'),
        makeAttempt('PA.II.A.K1', 'satisfactory'),
        makeAttempt('PA.II.A.K2', 'satisfactory'),
        makeAttempt('PA.II.B.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K2', 'satisfactory'),
      ];
      for (const code of ALL_ELEMENTS) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      // Overall: 5/9 ≈ 0.56 (below 0.70) AND Area I failed
      expect(result.overall_status).toBe('fail');
      expect(result.failed_areas).toContain('I');

      const areaI = result.areas.find(a => a.area === 'I');
      expect(areaI?.status).toBe('fail');
    });

    it('marks area as insufficient_data when too few attempts', () => {
      const plan = makePlan(ALL_ELEMENTS);
      // Only 1 attempt in Area I (min_area_attempts default = 2)
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'),
        makeAttempt('PA.II.A.K1', 'satisfactory'),
        makeAttempt('PA.II.A.K2', 'satisfactory'),
        makeAttempt('PA.II.B.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K2', 'satisfactory'),
      ];
      for (const a of attempts) plan.coverage[a.element_code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'user_ended');
      const areaI = result.areas.find(a => a.area === 'I');
      expect(areaI?.status).toBe('insufficient_data');
      // Insufficient data areas don't cause failure
      expect(result.failed_areas).not.toContain('I');
    });

    it('fails critical area with any unsatisfactory even if area score passes', () => {
      // Area I is critical for private
      const elements = ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.B.K1', 'PA.I.B.R1'];
      const plan = makePlan(elements);
      // 3 sat + 1 unsat → area score = 3/4 = 0.75 (above 0.60 threshold)
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'),
        makeAttempt('PA.I.A.K2', 'satisfactory'),
        makeAttempt('PA.I.B.K1', 'satisfactory'),
        makeAttempt('PA.I.B.R1', 'unsatisfactory'),
      ];
      for (const code of elements) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered', 'private');
      const areaI = result.areas.find(a => a.area === 'I');
      expect(areaI?.status).toBe('fail');
      expect(areaI?.status_reason).toContain('Critical area');
      expect(result.failed_areas).toContain('I');
    });

    it('passes critical area when all elements satisfactory', () => {
      const elements = ['PA.I.A.K1', 'PA.I.A.K2'];
      const plan = makePlan(elements);
      const attempts = elements.map(c => makeAttempt(c, 'satisfactory'));
      for (const code of elements) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered', 'private');
      const areaI = result.areas.find(a => a.area === 'I');
      expect(areaI?.status).toBe('pass');
    });

    it('respects custom gating overrides', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const attempts = ALL_ELEMENTS.map(code => makeAttempt(code, 'partial'));
      for (const code of ALL_ELEMENTS) plan.coverage[code] = 'asked';

      // Default: partial=0.70, area threshold=0.60 → passes
      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered', 'private', {
        area_pass_threshold: 0.75, // Stricter: 0.70 < 0.75 → fail
      });
      // Every area score is 0.70, which is below 0.75 threshold
      expect(result.failed_areas.length).toBeGreaterThan(0);
    });
  });

  describe('weak elements', () => {
    it('identifies unsatisfactory elements', () => {
      const plan = makePlan(['PA.I.A.K1', 'PA.I.A.K2']);
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'),
        makeAttempt('PA.I.A.K2', 'unsatisfactory'),
      ];
      for (const code of ['PA.I.A.K1', 'PA.I.A.K2']) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.weak_elements).toHaveLength(1);
      expect(result.weak_elements[0].element_code).toBe('PA.I.A.K2');
      expect(result.weak_elements[0].severity).toBe('unsatisfactory');
    });

    it('identifies partial elements', () => {
      const plan = makePlan(['PA.I.A.K1']);
      const attempts = [makeAttempt('PA.I.A.K1', 'partial')];
      plan.coverage['PA.I.A.K1'] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.weak_elements).toHaveLength(1);
      expect(result.weak_elements[0].severity).toBe('partial');
    });

    it('identifies not-asked elements', () => {
      const plan = makePlan(['PA.I.A.K1', 'PA.I.A.K2']);
      const attempts = [makeAttempt('PA.I.A.K1', 'satisfactory')];
      plan.coverage['PA.I.A.K1'] = 'asked';
      // PA.I.A.K2 remains 'pending'

      const result = computeExamResultV2(attempts, plan, 'user_ended');
      const notAsked = result.weak_elements.find(w => w.severity === 'not_asked');
      expect(notAsked).toBeDefined();
      expect(notAsked?.element_code).toBe('PA.I.A.K2');
    });

    it('excludes credited-by-mention from weak elements', () => {
      const plan = makePlan(['PA.I.A.K1', 'PA.I.A.K2']);
      plan.coverage['PA.I.A.K2'] = 'credited_by_mention';
      const attempts = [makeAttempt('PA.I.A.K1', 'satisfactory')];
      plan.coverage['PA.I.A.K1'] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.weak_elements).toHaveLength(0);
    });

    it('sorts weak elements: unsatisfactory first, then partial, then not_asked', () => {
      const plan = makePlan(['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.B.K1']);
      const attempts = [
        makeAttempt('PA.I.A.K1', 'partial'),
        makeAttempt('PA.I.A.K2', 'unsatisfactory'),
        // PA.I.B.K1 not asked
      ];
      plan.coverage['PA.I.A.K1'] = 'asked';
      plan.coverage['PA.I.A.K2'] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'user_ended');
      expect(result.weak_elements).toHaveLength(3);
      expect(result.weak_elements[0].severity).toBe('unsatisfactory');
      expect(result.weak_elements[1].severity).toBe('partial');
      expect(result.weak_elements[2].severity).toBe('not_asked');
    });
  });

  describe('completion triggers', () => {
    it('marks plan_exhausted when all_tasks_covered', () => {
      const plan = makePlan(['PA.I.A.K1']);
      const attempts = [makeAttempt('PA.I.A.K1', 'satisfactory')];
      plan.coverage['PA.I.A.K1'] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.plan_exhausted).toBe(true);
      expect(result.completion_trigger).toBe('all_tasks_covered');
    });

    it('returns incomplete when user ends very early (< 3 attempts)', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'),
        makeAttempt('PA.I.A.K2', 'satisfactory'),
      ];

      const result = computeExamResultV2(attempts, plan, 'user_ended');
      expect(result.overall_status).toBe('incomplete');
    });

    it('grades normally when user ends after 3+ attempts', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const attempts = [
        makeAttempt('PA.I.A.K1', 'satisfactory'),
        makeAttempt('PA.I.A.K2', 'satisfactory'),
        makeAttempt('PA.I.B.K1', 'satisfactory'),
        makeAttempt('PA.I.B.R1', 'satisfactory'),
        makeAttempt('PA.II.A.K1', 'satisfactory'),
        makeAttempt('PA.II.A.K2', 'satisfactory'),
        makeAttempt('PA.II.B.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K1', 'satisfactory'),
        makeAttempt('PA.III.A.K2', 'satisfactory'),
      ];
      for (const a of attempts) plan.coverage[a.element_code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'user_ended');
      expect(result.overall_status).toBe('pass');
    });
  });

  describe('area breakdown', () => {
    it('produces correct per-area counts', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const attempts = ALL_ELEMENTS.map(code => makeAttempt(code, 'satisfactory'));
      for (const code of ALL_ELEMENTS) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.areas.length).toBe(3); // I, II, III

      const areaI = result.areas.find(a => a.area === 'I')!;
      expect(areaI.total_in_plan).toBe(4);
      expect(areaI.asked).toBe(4);
      expect(areaI.satisfactory).toBe(4);

      const areaII = result.areas.find(a => a.area === 'II')!;
      expect(areaII.total_in_plan).toBe(3);

      const areaIII = result.areas.find(a => a.area === 'III')!;
      expect(areaIII.total_in_plan).toBe(2);
    });

    it('sorts areas by Roman numeral order', () => {
      const plan = makePlan(ALL_ELEMENTS);
      const attempts = ALL_ELEMENTS.map(code => makeAttempt(code, 'satisfactory'));
      for (const code of ALL_ELEMENTS) plan.coverage[code] = 'asked';

      const result = computeExamResultV2(attempts, plan, 'all_tasks_covered');
      expect(result.areas.map(a => a.area)).toEqual(['I', 'II', 'III']);
    });
  });

  describe('CRITICAL_AREAS_BY_RATING', () => {
    it('defines critical areas for private, commercial, instrument', () => {
      expect(CRITICAL_AREAS_BY_RATING.private).toContain('I');
      expect(CRITICAL_AREAS_BY_RATING.commercial).toContain('I');
      expect(CRITICAL_AREAS_BY_RATING.instrument).toContain('I');
      expect(CRITICAL_AREAS_BY_RATING.instrument).toContain('III');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Quick Drill queue building
// ---------------------------------------------------------------------------

import { buildElementQueue } from '../exam-logic';
import type { SessionConfig, ElementScore } from '@/types/database';

function makeWeakStat(code: string, latestScore: string, totalAttempts: number): ElementScore {
  return {
    element_code: code,
    task_id: code.split('.').slice(0, -1).join('.'),
    area: code.split('.')[1],
    element_type: 'knowledge',
    difficulty_default: 'medium',
    description: `Desc ${code}`,
    total_attempts: totalAttempts,
    satisfactory_count: latestScore === 'satisfactory' ? totalAttempts : 0,
    partial_count: latestScore === 'partial' ? totalAttempts : 0,
    unsatisfactory_count: latestScore === 'unsatisfactory' ? totalAttempts : 0,
    latest_score: latestScore as ElementScore['latest_score'],
    latest_attempt_at: '2026-01-01T00:00:00Z',
  };
}

describe('buildElementQueue quick_drill mode', () => {
  const drillConfig: SessionConfig = {
    rating: 'private',
    aircraftClass: 'ASEL',
    studyMode: 'quick_drill',
    difficulty: 'mixed',
    selectedAreas: [],
    selectedTasks: [],
  };

  function makeElement(code: string, diffDefault: 'easy' | 'medium' | 'hard' = 'medium') {
    return {
      code,
      task_id: code.split('.').slice(0, -1).join('.'),
      element_type: 'knowledge' as const,
      short_code: code.split('.').pop()!,
      description: `Description for ${code}`,
      order_index: 0,
      difficulty_default: diffDefault,
      weight: 1,
      created_at: '2026-01-01T00:00:00Z',
    };
  }

  it('excludes satisfactory elements in quick_drill mode', () => {
    const elements = [
      makeElement('PA.I.A.K1'),
      makeElement('PA.I.A.K2'),
      makeElement('PA.I.B.K1'),
    ];

    const weakStats: ElementScore[] = [
      makeWeakStat('PA.I.A.K1', 'satisfactory', 3),
      makeWeakStat('PA.I.A.K2', 'unsatisfactory', 2),
      // PA.I.B.K1 has no stats (untouched)
    ];

    const queue = buildElementQueue(elements, drillConfig, weakStats);

    // Should exclude PA.I.A.K1 (satisfactory) and include K2 (unsat) + B.K1 (untouched)
    expect(queue).toContain('PA.I.A.K2');
    expect(queue).toContain('PA.I.B.K1');
    expect(queue).not.toContain('PA.I.A.K1');
  });

  it('falls back to all elements when no weak stats provided', () => {
    const elements = [
      makeElement('PA.I.A.K1'),
      makeElement('PA.I.A.K2'),
    ];

    const queue = buildElementQueue(elements, drillConfig, []);
    expect(queue.length).toBe(2);
  });

  it('includes all elements as fallback when all are satisfactory', () => {
    const elements = [
      makeElement('PA.I.A.K1'),
      makeElement('PA.I.A.K2'),
    ];

    const weakStats: ElementScore[] = [
      makeWeakStat('PA.I.A.K1', 'satisfactory', 1),
      makeWeakStat('PA.I.A.K2', 'satisfactory', 1),
    ];

    const queue = buildElementQueue(elements, drillConfig, weakStats);
    // All satisfactory → fallback to all codes
    expect(queue.length).toBe(2);
  });
});
