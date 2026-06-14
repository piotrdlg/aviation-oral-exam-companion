import { describe, it, expect } from 'vitest';
import type { ElementScore } from '@/types/database';
import {
  weaknessSeverity,
  weakTaskIds,
  untouchedTaskIds,
  isOralTaskId,
  oralTaskIds,
  focusTasksForMode,
} from '../weak-areas';

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

describe('weaknessSeverity', () => {
  it('never-attempted elements are not weak', () => {
    expect(weaknessSeverity(es({ element_code: 'PA.I.A.K1', total_attempts: 0 }))).toBeNull();
  });

  it('latest unsatisfactory → critical', () => {
    expect(weaknessSeverity(es({ element_code: 'PA.I.A.K1', total_attempts: 3, satisfactory_count: 2, latest_score: 'unsatisfactory' }))).toBe('critical');
  });

  it('unsatisfactory-rate >= 0.5 → critical even if latest was satisfactory', () => {
    expect(weaknessSeverity(es({ element_code: 'PA.I.A.K1', total_attempts: 2, unsatisfactory_count: 1, satisfactory_count: 1, latest_score: 'satisfactory' }))).toBe('critical');
  });

  it('latest partial → moderate', () => {
    expect(weaknessSeverity(es({ element_code: 'PA.I.A.K1', total_attempts: 3, satisfactory_count: 2, latest_score: 'partial' }))).toBe('moderate');
  });

  it('partial-rate >= 0.5 → moderate even if latest was satisfactory', () => {
    expect(weaknessSeverity(es({ element_code: 'PA.I.A.K1', total_attempts: 2, partial_count: 1, satisfactory_count: 1, latest_score: 'satisfactory' }))).toBe('moderate');
  });

  it('all satisfactory → not weak', () => {
    expect(weaknessSeverity(es({ element_code: 'PA.I.A.K1', total_attempts: 3, satisfactory_count: 3, latest_score: 'satisfactory' }))).toBeNull();
  });
});

describe('weakTaskIds', () => {
  it('returns distinct task IDs that have at least one weak element', () => {
    const scores = [
      es({ element_code: 'PA.I.A.K1', total_attempts: 1, latest_score: 'unsatisfactory' }), // weak → PA.I.A
      es({ element_code: 'PA.I.A.K2', total_attempts: 1, latest_score: 'satisfactory' }),   // not weak (same task)
      es({ element_code: 'PA.II.B.K1', total_attempts: 2, latest_score: 'partial' }),        // weak → PA.II.B
      es({ element_code: 'PA.III.C.K1', total_attempts: 0 }),                                 // untouched, not weak
    ];
    expect(new Set(weakTaskIds(scores))).toEqual(new Set(['PA.I.A', 'PA.II.B']));
  });
});

describe('untouchedTaskIds', () => {
  it('returns tasks with no attempted element', () => {
    const all = ['PA.I.A', 'PA.II.B', 'PA.III.C'];
    const scores = [
      es({ element_code: 'PA.I.A.K1', task_id: 'PA.I.A', total_attempts: 2 }),  // touched
      es({ element_code: 'PA.III.C.K1', task_id: 'PA.III.C', total_attempts: 0 }), // present but never attempted
    ];
    // PA.II.B never appears; PA.III.C has 0 attempts → both untouched
    expect(new Set(untouchedTaskIds(all, scores))).toEqual(new Set(['PA.II.B', 'PA.III.C']));
  });
});

describe('isOralTaskId / oralTaskIds', () => {
  it('excludes flight-only private areas IV and V', () => {
    expect(isOralTaskId('PA.I.A', 'private')).toBe(true);
    expect(isOralTaskId('PA.IV.A', 'private')).toBe(false); // Takeoffs/Landings
    expect(isOralTaskId('PA.V.B', 'private')).toBe(false);  // Performance Maneuvers
    expect(isOralTaskId('PA.VI.A', 'private')).toBe(true);
    expect(oralTaskIds(['PA.I.A', 'PA.IV.A', 'PA.V.B', 'PA.IX.C'], 'private')).toEqual(['PA.I.A', 'PA.IX.C']);
  });
});

describe('focusTasksForMode', () => {
  const oral = ['PA.I.A', 'PA.I.B', 'PA.II.A', 'PA.VI.A', 'PA.IX.A'];
  const scores = [
    es({ element_code: 'PA.I.A.K1', task_id: 'PA.I.A', total_attempts: 2, latest_score: 'unsatisfactory' }), // weak
    es({ element_code: 'PA.II.A.K1', task_id: 'PA.II.A', total_attempts: 2, latest_score: 'satisfactory' }), // touched, not weak
    es({ element_code: 'PA.VI.A.K1', task_id: 'PA.VI.A', total_attempts: 1, latest_score: 'partial' }),       // weak
    // PA.I.B and PA.IX.A never attempted → untouched
  ];

  it('weak_areas → struggled tasks only', () => {
    expect(new Set(focusTasksForMode('weak_areas', oral, scores))).toEqual(new Set(['PA.I.A', 'PA.VI.A']));
  });

  it('quick_drill → struggled ∪ never-practiced', () => {
    expect(new Set(focusTasksForMode('quick_drill', oral, scores))).toEqual(
      new Set(['PA.I.A', 'PA.VI.A', 'PA.I.B', 'PA.IX.A'])
    );
  });

  it('linear / cross_acs / scenario → the full oral set', () => {
    for (const m of ['linear', 'cross_acs', 'scenario'] as const) {
      expect(focusTasksForMode(m, oral, scores)).toEqual(oral);
    }
  });

  it('weak/quick pre-fills never include non-oral tasks passed in scores', () => {
    const withFlight = [...scores, es({ element_code: 'PA.IV.A.K1', task_id: 'PA.IV.A', total_attempts: 1, latest_score: 'unsatisfactory' })];
    // oral set does not contain PA.IV.A, so it must not appear
    expect(focusTasksForMode('weak_areas', oral, withFlight)).not.toContain('PA.IV.A');
  });
});
