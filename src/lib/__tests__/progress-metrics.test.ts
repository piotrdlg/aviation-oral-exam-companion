import { describe, it, expect } from 'vitest';
import type { ElementScore } from '@/types/database';
import { PARTIAL_CREDIT } from '../exam-logic';
import {
  elementStatus,
  weaknessReason,
  satisfactoryRate,
  areaCoverage,
  readiness,
} from '../progress-metrics';

/** Build an ElementScore with sensible defaults; override what the test needs. */
function es(overrides: Partial<ElementScore> & { element_code: string }): ElementScore {
  const taskId = overrides.task_id ?? overrides.element_code.split('.').slice(0, 3).join('.');
  return {
    element_code: overrides.element_code,
    task_id: taskId,
    area: overrides.area ?? taskId.split('.')[1],
    element_type: overrides.element_type ?? 'knowledge',
    difficulty_default: overrides.difficulty_default ?? 'medium',
    description: overrides.description ?? '',
    total_attempts: overrides.total_attempts ?? 0,
    satisfactory_count: overrides.satisfactory_count ?? 0,
    partial_count: overrides.partial_count ?? 0,
    unsatisfactory_count: overrides.unsatisfactory_count ?? 0,
    latest_score: overrides.latest_score ?? null,
    latest_attempt_at: overrides.latest_attempt_at ?? null,
  };
}

describe('elementStatus', () => {
  it('never-attempted → untouched', () => {
    expect(elementStatus(es({ element_code: 'IR.I.A.K1', total_attempts: 0 }))).toBe('untouched');
  });
  it('latest unsatisfactory → critical', () => {
    expect(elementStatus(es({ element_code: 'IR.I.A.K1', total_attempts: 2, latest_score: 'unsatisfactory' }))).toBe('critical');
  });
  it('latest partial → moderate', () => {
    expect(elementStatus(es({ element_code: 'IR.I.A.K1', total_attempts: 2, latest_score: 'partial' }))).toBe('moderate');
  });
  it('latest satisfactory but partial-rate ≥ 0.5 → moderate (the contradictory-row bug)', () => {
    // 4 attempts, 2 partial, latest satisfactory → still weak, must NOT be "strong"
    expect(elementStatus(es({ element_code: 'IR.I.C.K1', total_attempts: 4, partial_count: 2, satisfactory_count: 2, latest_score: 'satisfactory' }))).toBe('moderate');
  });
  it('latest satisfactory and not weak → strong', () => {
    expect(elementStatus(es({ element_code: 'IR.I.A.K1', total_attempts: 3, satisfactory_count: 3, latest_score: 'satisfactory' }))).toBe('strong');
  });
});

describe('weaknessReason', () => {
  it('explains each weakness without printing "satisfactory" for weak rows', () => {
    expect(weaknessReason(es({ element_code: 'x.I.A.K1', total_attempts: 2, latest_score: 'unsatisfactory' }))).toBe('last answer unsatisfactory');
    expect(weaknessReason(es({ element_code: 'x.I.A.K1', total_attempts: 2, unsatisfactory_count: 1, satisfactory_count: 1, latest_score: 'satisfactory' }))).toBe('1 unsat in 2');
    expect(weaknessReason(es({ element_code: 'x.I.A.K1', total_attempts: 2, latest_score: 'partial' }))).toBe('last answer partial');
    expect(weaknessReason(es({ element_code: 'x.I.A.K1', total_attempts: 4, partial_count: 2, satisfactory_count: 2, latest_score: 'satisfactory' }))).toBe('mostly partial (2/4)');
    expect(weaknessReason(es({ element_code: 'x.I.A.K1', total_attempts: 3, satisfactory_count: 3, latest_score: 'satisfactory' }))).toBe('satisfactory');
  });
});

describe('satisfactoryRate', () => {
  it('is the share of graded answers scored satisfactory', () => {
    const scores = [
      es({ element_code: 'a', total_attempts: 4, satisfactory_count: 3 }),
      es({ element_code: 'b', total_attempts: 6, satisfactory_count: 2 }),
    ];
    // 5 satisfactory of 10 attempts → 50%
    expect(satisfactoryRate(scores)).toBe(50);
  });
  it('is null when nothing has been graded', () => {
    expect(satisfactoryRate([es({ element_code: 'a', total_attempts: 0 })])).toBeNull();
    expect(satisfactoryRate([])).toBeNull();
  });
});

describe('areaCoverage', () => {
  // `area` carries the full NAME in real data (not the Roman numeral), so the
  // numeral must be derived from task_id.
  const scores = [
    es({ element_code: 'IR.VI.D.K1', task_id: 'IR.VI.D', area: 'Instrument Approach Procedures', total_attempts: 2, satisfactory_count: 2, latest_score: 'satisfactory' }), // strong
    es({ element_code: 'IR.VI.D.R2', task_id: 'IR.VI.D', area: 'Instrument Approach Procedures', total_attempts: 1, latest_score: 'partial' }),                              // moderate
    es({ element_code: 'IR.I.A.K1', task_id: 'IR.I.A', area: 'Preflight Preparation', total_attempts: 1, latest_score: 'unsatisfactory' }),                                  // critical
    es({ element_code: 'IR.I.A.K2', task_id: 'IR.I.A', area: 'Preflight Preparation', total_attempts: 0 }),                                                                  // untouched
    es({ element_code: 'IR.III.B.K1', task_id: 'IR.III.B', area: 'ATC Clearances and Procedures', total_attempts: 0 }),                                                      // untouched
  ];

  it('groups by area, derives the Roman numeral from task_id, counts by status', () => {
    const cov = areaCoverage(scores);
    const vi = cov.find((a) => a.areaNum === 'VI')!; // numeral from task_id, not score.area
    expect(vi.areaName).toBe('Instrument Approach Procedures');
    expect(vi).toMatchObject({ total: 2, attempted: 2, strong: 1, moderate: 1, critical: 0, untouched: 0 });
    const i = cov.find((a) => a.areaNum === 'I')!;
    expect(i).toMatchObject({ total: 2, attempted: 1, critical: 1, untouched: 1 });
  });

  it('orders areas by ACS Roman numeral (I, III, VI)', () => {
    expect(areaCoverage(scores).map((a) => a.areaNum)).toEqual(['I', 'III', 'VI']);
  });
});

describe('readiness', () => {
  it('empty → 0 / starting', () => {
    expect(readiness([])).toEqual({ score: 0, tier: 'starting' });
    expect(readiness([es({ element_code: 'a', total_attempts: 0 })])).toEqual({ score: 0, tier: 'starting' });
  });

  it('full coverage, all satisfactory → 100 / ready', () => {
    const scores = Array.from({ length: 10 }, (_, i) =>
      es({ element_code: `a${i}`, total_attempts: 1, satisfactory_count: 1, latest_score: 'satisfactory' })
    );
    expect(readiness(scores)).toEqual({ score: 100, tier: 'ready' });
  });

  it('matches the coverage×40 + quality×60 formula (parity with the prior inline calc)', () => {
    // 10 elements: 5 attempted — 3 sat, 1 partial, 1 unsat (latest)
    const scores = [
      ...Array.from({ length: 3 }, (_, i) => es({ element_code: `s${i}`, total_attempts: 1, satisfactory_count: 1, latest_score: 'satisfactory' as const })),
      es({ element_code: 'p', total_attempts: 1, partial_count: 1, latest_score: 'partial' }),
      es({ element_code: 'u', total_attempts: 1, unsatisfactory_count: 1, latest_score: 'unsatisfactory' }),
      ...Array.from({ length: 5 }, (_, i) => es({ element_code: `z${i}`, total_attempts: 0 })),
    ];
    const coverageWeight = 5 / 10;
    const qualityWeight = (3 + 1 * PARTIAL_CREDIT) / 10;
    const expected = Math.round(coverageWeight * 40 + qualityWeight * 60);
    expect(readiness(scores).score).toBe(expected);
  });

  it('assigns tiers at the 20/50/80 thresholds', () => {
    // 2 of 10 attempted, both satisfactory → coverage .2, quality .2 → 8+12 = 20 → building
    const scores = [
      ...Array.from({ length: 2 }, (_, i) => es({ element_code: `s${i}`, total_attempts: 1, satisfactory_count: 1, latest_score: 'satisfactory' as const })),
      ...Array.from({ length: 8 }, (_, i) => es({ element_code: `z${i}`, total_attempts: 0 })),
    ];
    expect(readiness(scores)).toEqual({ score: 20, tier: 'building' });
  });
});
