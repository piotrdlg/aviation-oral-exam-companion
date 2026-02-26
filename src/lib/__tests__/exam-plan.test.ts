import { describe, it, expect } from 'vitest';
import {
  buildExamPlan,
  isExamComplete,
  recordQuestionAsked,
  useBonusQuestion,
  creditMentionedElements,
  canFollowUp,
  DEFAULT_PLAN_DEFAULTS,
  type ExamPlanV1,
} from '../exam-plan';
import { connectedWalk, type TaxonomyFingerprints } from '../exam-logic';

// ================================================================
// buildExamPlan
// ================================================================

describe('buildExamPlan', () => {
  it('creates a plan with correct version and mode', () => {
    const plan = buildExamPlan(['A', 'B', 'C'], 'linear', 100);
    expect(plan.version).toBe(1);
    expect(plan.mode).toBe('linear');
    expect(plan.asked_count).toBe(0);
    expect(plan.bonus_used).toBe(0);
  });

  it('computes proportional planned_question_count for partial scope', () => {
    // 10 out of 100 total elements → 10% of 75 = 7.5 → 8
    const plan = buildExamPlan(
      Array.from({ length: 10 }, (_, i) => `E${i}`),
      'linear',
      100
    );
    expect(plan.planned_question_count).toBe(8); // ceil(75 * 10/100) = 8
  });

  it('caps at queue length for narrow scope', () => {
    // 3 elements, but 75 * 3/100 = 2.25 → 3 (min_question_count=5 floors, but queue=3 caps)
    const plan = buildExamPlan(['A', 'B', 'C'], 'linear', 100);
    expect(plan.planned_question_count).toBe(3); // capped at queue length
  });

  it('uses full count for full scope', () => {
    const queue = Array.from({ length: 200 }, (_, i) => `E${i}`);
    const plan = buildExamPlan(queue, 'cross_acs', 200);
    expect(plan.planned_question_count).toBe(75); // full_exam_question_count
  });

  it('respects min_question_count floor', () => {
    // 2 elements, ratio very small, but min is 5, yet queue is 2 → capped at 2
    const plan = buildExamPlan(['A', 'B'], 'linear', 1000);
    // ceil(75 * 2/1000) = 1, floor at 5, cap at 2
    expect(plan.planned_question_count).toBe(2);
  });

  it('applies admin overrides', () => {
    const queue = Array.from({ length: 100 }, (_, i) => `E${i}`);
    const plan = buildExamPlan(queue, 'linear', 100, {
      full_exam_question_count: 50,
      bonus_question_max: 5,
      follow_up_max_per_element: 3,
    });
    expect(plan.planned_question_count).toBe(50);
    expect(plan.bonus_question_max).toBe(5);
    expect(plan.follow_up_max_per_element).toBe(3);
  });

  it('initializes all elements as pending', () => {
    const plan = buildExamPlan(['A', 'B', 'C'], 'linear', 10);
    expect(plan.coverage).toEqual({
      A: 'pending',
      B: 'pending',
      C: 'pending',
    });
  });

  it('sets created_at timestamp', () => {
    const plan = buildExamPlan(['A'], 'linear', 10);
    expect(plan.created_at).toBeTruthy();
    expect(new Date(plan.created_at).getTime()).not.toBeNaN();
  });

  it('defaults bonus_question_max from DEFAULT_PLAN_DEFAULTS', () => {
    const plan = buildExamPlan(['A', 'B'], 'linear', 10);
    expect(plan.bonus_question_max).toBe(DEFAULT_PLAN_DEFAULTS.bonus_question_max);
    expect(plan.follow_up_max_per_element).toBe(DEFAULT_PLAN_DEFAULTS.follow_up_max_per_element);
  });
});

// ================================================================
// isExamComplete
// ================================================================

describe('isExamComplete', () => {
  function makePlan(asked: number, planned: number, bonus: number): ExamPlanV1 {
    return {
      version: 1,
      planned_question_count: planned,
      bonus_question_max: 2,
      follow_up_max_per_element: 1,
      asked_count: asked,
      bonus_used: bonus,
      mode: 'linear',
      coverage: {},
      created_at: new Date().toISOString(),
    };
  }

  it('returns false when asked < planned', () => {
    expect(isExamComplete(makePlan(5, 10, 0))).toBe(false);
  });

  it('returns true when asked >= planned + bonus', () => {
    expect(isExamComplete(makePlan(12, 10, 2))).toBe(true);
  });

  it('returns true at exact boundary', () => {
    expect(isExamComplete(makePlan(11, 10, 1))).toBe(true);
  });

  it('returns false when bonus extends the exam', () => {
    expect(isExamComplete(makePlan(10, 10, 2))).toBe(false);
  });
});

// ================================================================
// recordQuestionAsked
// ================================================================

describe('recordQuestionAsked', () => {
  it('increments asked_count', () => {
    const plan = buildExamPlan(['A', 'B'], 'linear', 10);
    const updated = recordQuestionAsked(plan, 'A');
    expect(updated.asked_count).toBe(1);
    expect(plan.asked_count).toBe(0); // immutable
  });

  it('marks element as asked in coverage', () => {
    const plan = buildExamPlan(['A', 'B'], 'linear', 10);
    const updated = recordQuestionAsked(plan, 'A');
    expect(updated.coverage['A']).toBe('asked');
    expect(updated.coverage['B']).toBe('pending');
  });
});

// ================================================================
// useBonusQuestion
// ================================================================

describe('useBonusQuestion', () => {
  it('increments bonus_used', () => {
    const plan = buildExamPlan(['A'], 'linear', 10);
    const updated = useBonusQuestion(plan);
    expect(updated).not.toBeNull();
    expect(updated!.bonus_used).toBe(1);
  });

  it('returns null when bonus budget exhausted', () => {
    const plan: ExamPlanV1 = {
      ...buildExamPlan(['A'], 'linear', 10),
      bonus_used: 2,
      bonus_question_max: 2,
    };
    expect(useBonusQuestion(plan)).toBeNull();
  });
});

// ================================================================
// creditMentionedElements
// ================================================================

describe('creditMentionedElements', () => {
  it('credits pending elements as credited_by_mention', () => {
    const plan = buildExamPlan(['A', 'B', 'C'], 'linear', 10);
    const updated = creditMentionedElements(plan, ['B', 'C']);
    expect(updated.coverage['A']).toBe('pending');
    expect(updated.coverage['B']).toBe('credited_by_mention');
    expect(updated.coverage['C']).toBe('credited_by_mention');
  });

  it('does not overwrite asked elements', () => {
    const plan = buildExamPlan(['A', 'B'], 'linear', 10);
    const afterAsk = recordQuestionAsked(plan, 'A');
    const updated = creditMentionedElements(afterAsk, ['A', 'B']);
    expect(updated.coverage['A']).toBe('asked'); // not overwritten
    expect(updated.coverage['B']).toBe('credited_by_mention');
  });

  it('ignores elements not in coverage', () => {
    const plan = buildExamPlan(['A'], 'linear', 10);
    const updated = creditMentionedElements(plan, ['Z']); // Z not in plan
    expect(updated.coverage['Z']).toBeUndefined();
  });
});

// ================================================================
// canFollowUp
// ================================================================

describe('canFollowUp', () => {
  it('allows follow-up on first attempt', () => {
    const plan = buildExamPlan(['A'], 'linear', 10);
    expect(canFollowUp(plan, 'A', 1)).toBe(true);
  });

  it('disallows follow-up when at max + 1 attempts', () => {
    const plan = buildExamPlan(['A'], 'linear', 10); // follow_up_max = 1
    // first ask is attempt 1, one follow-up makes it attempt 2
    expect(canFollowUp(plan, 'A', 2)).toBe(false);
  });

  it('respects custom follow_up_max', () => {
    const plan: ExamPlanV1 = {
      ...buildExamPlan(['A'], 'linear', 10),
      follow_up_max_per_element: 3,
    };
    expect(canFollowUp(plan, 'A', 3)).toBe(true);
    expect(canFollowUp(plan, 'A', 4)).toBe(false);
  });
});

// ================================================================
// connectedWalk
// ================================================================

describe('connectedWalk', () => {
  it('returns all elements in the output', () => {
    const codes = ['A', 'B', 'C', 'D'];
    const fp: TaxonomyFingerprints = new Map([
      ['A', new Set(['weather', 'airspace'])],
      ['B', new Set(['weather', 'navigation'])],
      ['C', new Set(['regulations', 'airspace'])],
      ['D', new Set(['regulations', 'navigation'])],
    ]);
    const result = connectedWalk(codes, fp);
    expect(result.sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns single element unchanged', () => {
    const fp: TaxonomyFingerprints = new Map([
      ['A', new Set(['weather'])],
    ]);
    expect(connectedWalk(['A'], fp)).toEqual(['A']);
  });

  it('handles empty input', () => {
    expect(connectedWalk([], new Map())).toEqual([]);
  });

  it('appends elements without fingerprints at the end', () => {
    const fp: TaxonomyFingerprints = new Map([
      ['A', new Set(['weather'])],
      ['B', new Set(['weather'])],
    ]);
    const result = connectedWalk(['A', 'B', 'C'], fp);
    expect(result).toHaveLength(3);
    // C has no fingerprint, should be last
    expect(result.indexOf('C')).toBe(2);
  });

  it('places similar elements adjacent', () => {
    const fp: TaxonomyFingerprints = new Map([
      ['WEATHER_1', new Set(['weather', 'metar', 'taf'])],
      ['WEATHER_2', new Set(['weather', 'metar', 'pirep'])],
      ['NAV_1', new Set(['navigation', 'vor', 'gps'])],
      ['NAV_2', new Set(['navigation', 'vor', 'ndb'])],
      ['REG_1', new Set(['regulations', 'part91'])],
    ]);
    // Run multiple times to account for random seed, check adjacency tendency
    let weatherAdjacent = 0;
    let navAdjacent = 0;
    for (let i = 0; i < 50; i++) {
      const result = connectedWalk(['WEATHER_1', 'WEATHER_2', 'NAV_1', 'NAV_2', 'REG_1'], fp);
      const w1 = result.indexOf('WEATHER_1');
      const w2 = result.indexOf('WEATHER_2');
      const n1 = result.indexOf('NAV_1');
      const n2 = result.indexOf('NAV_2');
      if (Math.abs(w1 - w2) <= 1) weatherAdjacent++;
      if (Math.abs(n1 - n2) <= 1) navAdjacent++;
    }
    // Expect weather elements to be adjacent more often than not
    expect(weatherAdjacent).toBeGreaterThan(25);
    // Expect nav elements to be adjacent more often than not
    expect(navAdjacent).toBeGreaterThan(25);
  });

  it('falls back to shuffle when all fingerprints are empty', () => {
    const fp: TaxonomyFingerprints = new Map([
      ['A', new Set()],
      ['B', new Set()],
      ['C', new Set()],
    ]);
    const result = connectedWalk(['A', 'B', 'C'], fp);
    expect(result).toHaveLength(3);
  });
});

// ================================================================
// Grounding Contract
// ================================================================

describe('GROUNDING_CONTRACT', () => {
  it('is included in default system prompts', async () => {
    const { buildSystemPrompt, GROUNDING_CONTRACT } = await import('../exam-logic');
    const task = {
      id: 'PA.I.A',
      area: 'Preflight',
      task: 'Qualifications',
      knowledge_elements: [{ code: 'PA.I.A.K1', description: 'Certs' }],
      risk_management_elements: [],
      skill_elements: [],
      applicable_classes: ['ASEL' as const, 'AMEL' as const, 'ASES' as const, 'AMES' as const],
    };
    const prompt = buildSystemPrompt(task);
    expect(prompt).toContain(GROUNDING_CONTRACT);
    expect(prompt).toContain('GROUNDING CONTRACT');
    expect(prompt).toContain('Do NOT generate plausible-sounding');
  });

  it('is included in DB-sourced prompts', async () => {
    const { buildSystemPrompt, GROUNDING_CONTRACT } = await import('../exam-logic');
    const task = {
      id: 'PA.I.A',
      area: 'Preflight',
      task: 'Qualifications',
      knowledge_elements: [],
      risk_management_elements: [],
      skill_elements: [],
      applicable_classes: ['ASEL' as const, 'AMEL' as const, 'ASES' as const, 'AMES' as const],
    };
    const prompt = buildSystemPrompt(task, undefined, undefined, 'private', 'Custom DB prompt content here');
    expect(prompt).toContain(GROUNDING_CONTRACT);
    expect(prompt).toContain('Custom DB prompt content here');
  });
});
