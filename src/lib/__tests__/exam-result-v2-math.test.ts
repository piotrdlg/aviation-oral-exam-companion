import { describe, it, expect } from 'vitest';
import { computeExamResultV2, v2ToV1Grade } from '../exam-result';
import { buildExamPlan, creditMentionedElements, type ExamPlanV1 } from '../exam-plan';

/**
 * W2.3 — V2 grading math: plan-filtered numerator, no credited+scored double
 * count, score provably <= 100%, deterministic given ordered input, and the
 * V1 grade label derives from the V2 outcome.
 */

type Score = 'satisfactory' | 'unsatisfactory' | 'partial';
const SCORES: Score[] = ['satisfactory', 'unsatisfactory', 'partial'];

function plan(codes: string[]): ExamPlanV1 {
  return buildExamPlan(codes, 'linear', codes.length);
}

describe('computeExamResultV2 math (W2.3)', () => {
  const codes = ['PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.R1'];

  it('ignores attempts on element codes outside the plan (bug 12)', () => {
    const p = plan(codes);
    const result = computeExamResultV2(
      [
        { element_code: 'PA.I.A.K1', score: 'satisfactory' },
        { element_code: 'PA.I.A.S1', score: 'satisfactory' }, // skill — not in plan
        { element_code: 'CA.I.A.K1', score: 'satisfactory' }, // wrong rating
      ],
      p, 'user_ended', 'private'
    );
    expect(result.elements_asked).toBe(1);
    expect(result.overall_score).toBeCloseTo(1 / 4, 5);
  });

  it('counts an element credited AND later scored exactly once, as scored', () => {
    let p = plan(codes);
    p = creditMentionedElements(p, ['PA.I.A.K2']);
    const result = computeExamResultV2(
      [{ element_code: 'PA.I.A.K2', score: 'partial' }],
      p, 'user_ended', 'private'
    );
    expect(result.elements_credited).toBe(0); // scored wins
    expect(result.elements_partial).toBe(1);
    // 0.7 / 4 = 0.175 → rounds to 0.18; double-counting would give 1.7 / 4 = 0.43
    expect(result.overall_score).toBe(0.18);
  });

  it('property: overall_score never exceeds 1.0 for any attempt set (200 random trials)', () => {
    // Deterministic PRNG (mulberry32) — reproducible without Math.random in test data
    let seed = 42;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const allCodes = [...codes, 'PA.III.B.K3', 'PA.IX.A.R2', 'PA.I.A.S1', 'XX.BAD.CODE'];
    for (let trial = 0; trial < 200; trial++) {
      let p = plan(codes);
      // Randomly credit some elements
      const credits = allCodes.filter(() => rand() < 0.3);
      p = creditMentionedElements(p, credits);
      // Random attempts incl. duplicates and out-of-plan codes
      const n = Math.floor(rand() * 12);
      const attempts = Array.from({ length: n }, () => ({
        element_code: allCodes[Math.floor(rand() * allCodes.length)],
        score: SCORES[Math.floor(rand() * SCORES.length)],
      }));
      const result = computeExamResultV2(attempts, p, 'user_ended', 'private');
      expect(result.overall_score).toBeLessThanOrEqual(1.0);
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.elements_not_asked).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic: same ordered input → identical grade', () => {
    const p = plan(codes);
    const attempts = [
      { element_code: 'PA.I.A.K1', score: 'unsatisfactory' as const },
      { element_code: 'PA.I.A.K1', score: 'satisfactory' as const }, // retry — last wins
      { element_code: 'PA.II.A.K1', score: 'partial' as const },
    ];
    const a = computeExamResultV2(attempts, p, 'user_ended', 'private');
    const b = computeExamResultV2(attempts, p, 'user_ended', 'private');
    expect(a.overall_score).toBe(b.overall_score);
    expect(a.overall_status).toBe(b.overall_status);
    expect(a.elements_satisfactory).toBe(1); // last write won
  });
});

describe('v2ToV1Grade (W2.3 canonicalization)', () => {
  it('maps V2 outcomes onto the legacy V1 enum', () => {
    expect(v2ToV1Grade('pass')).toBe('satisfactory');
    expect(v2ToV1Grade('fail')).toBe('unsatisfactory');
    expect(v2ToV1Grade('incomplete')).toBe('incomplete');
  });
});
