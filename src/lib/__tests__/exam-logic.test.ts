import { describe, it, expect } from 'vitest';
import {
  ORAL_EXAM_AREA_PREFIXES,
  filterEligibleTasks,
  selectRandomTask,
  buildSystemPrompt,
  buildElementQueue,
  pickNextElement,
  initPlannerState,
  computeExamResult,
  extractStructuredChunks,
  buildPlainTextFromChunks,
  STRUCTURED_CHUNK_FIELDS,
  type AcsTaskRow,
} from '../exam-logic';
import type { AcsElement as AcsElementDB, ElementScore, SessionConfig, CompletionTrigger } from '@/types/database';

function makeTask(id: string, opts?: Partial<AcsTaskRow>): AcsTaskRow {
  return {
    id,
    area: opts?.area ?? id.split('.').slice(0, 2).join('.'),
    task: opts?.task ?? `Task ${id}`,
    knowledge_elements: opts?.knowledge_elements ?? [],
    risk_management_elements: opts?.risk_management_elements ?? [],
    skill_elements: opts?.skill_elements ?? [],
    applicable_classes: opts?.applicable_classes ?? ['ASEL', 'AMEL', 'ASES', 'AMES'],
  };
}

const defaultConfig: SessionConfig = {
  rating: 'private',
  aircraftClass: 'ASEL',
  studyMode: 'linear',
  difficulty: 'mixed',
  selectedAreas: [],
  selectedTasks: [],
};

describe('ORAL_EXAM_AREA_PREFIXES', () => {
  it('is a Record with private, commercial, instrument, and atp keys', () => {
    expect(Object.keys(ORAL_EXAM_AREA_PREFIXES)).toEqual(
      expect.arrayContaining(['private', 'commercial', 'instrument', 'atp'])
    );
  });

  it('includes 10 oral-exam-relevant areas for private (including multiengine)', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.private).toHaveLength(10);
  });

  it('includes Preflight Preparation (Area I) for private', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.private).toContain('PA.I.');
  });

  it('includes Emergency Operations (Area IX) for private', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.private).toContain('PA.IX.');
  });

  it('includes Multiengine Operations (Area X) for private — filtered by class, not area', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.private).toContain('PA.X.');
  });

  it('excludes Takeoffs/Landings (Area IV) for private', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.private).not.toContain('PA.IV.');
  });

  it('excludes Performance Maneuvers (Area V) for private', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.private).not.toContain('PA.V.');
  });

  it('has 7 commercial oral-exam areas', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.commercial).toHaveLength(7);
  });

  it('has 6 instrument oral-exam areas', () => {
    expect(ORAL_EXAM_AREA_PREFIXES.instrument).toHaveLength(6);
  });
});

describe('filterEligibleTasks', () => {
  const allTasks = [
    makeTask('PA.I.A'),
    makeTask('PA.I.B'),
    makeTask('PA.II.A'),
    makeTask('PA.III.A'),
    makeTask('PA.IV.A'),  // Takeoffs — excluded by area
    makeTask('PA.V.A'),   // Performance — excluded by area
    makeTask('PA.VI.A'),
    makeTask('PA.VII.A'),
    makeTask('PA.VIII.A'),
    makeTask('PA.IX.A'),
    makeTask('PA.X.A', { applicable_classes: ['AMEL', 'AMES'] }), // Multiengine — class-filtered
    makeTask('PA.XI.A'),
    makeTask('PA.XII.A'),
  ];

  it('filters to oral-exam-relevant areas only', () => {
    const eligible = filterEligibleTasks(allTasks);
    const ids = eligible.map((t) => t.id);

    expect(ids).toContain('PA.I.A');
    expect(ids).toContain('PA.IX.A');
    expect(ids).toContain('PA.XII.A');
    expect(ids).not.toContain('PA.IV.A');
    expect(ids).not.toContain('PA.V.A');
  });

  it('returns 11 eligible tasks from the 13 total (Area X now included)', () => {
    const eligible = filterEligibleTasks(allTasks);
    expect(eligible).toHaveLength(11);
  });

  it('excludes already-covered tasks', () => {
    const eligible = filterEligibleTasks(allTasks, ['PA.I.A', 'PA.II.A']);
    const ids = eligible.map((t) => t.id);

    expect(ids).not.toContain('PA.I.A');
    expect(ids).not.toContain('PA.II.A');
    expect(ids).toContain('PA.I.B');
    expect(eligible).toHaveLength(9);
  });

  it('filters by aircraft class', () => {
    const eligible = filterEligibleTasks(allTasks, [], 'ASEL');
    const ids = eligible.map((t) => t.id);

    // PA.X.A is AMEL/AMES only — should be excluded for ASEL
    expect(ids).not.toContain('PA.X.A');
    expect(eligible).toHaveLength(10);
  });

  it('includes multiengine tasks for AMEL class', () => {
    const eligible = filterEligibleTasks(allTasks, [], 'AMEL');
    const ids = eligible.map((t) => t.id);

    expect(ids).toContain('PA.X.A');
  });

  it('returns empty when all eligible are covered', () => {
    const allEligibleIds = filterEligibleTasks(allTasks).map((t) => t.id);
    const eligible = filterEligibleTasks(allTasks, allEligibleIds);
    expect(eligible).toHaveLength(0);
  });

  it('handles empty task list', () => {
    expect(filterEligibleTasks([])).toHaveLength(0);
  });
});

describe('selectRandomTask', () => {
  const tasks = [
    makeTask('PA.I.A'),
    makeTask('PA.IV.A'), // excluded from oral areas
    makeTask('PA.IX.A'),
    makeTask('PA.X.A', { applicable_classes: ['AMEL', 'AMES'] }),
  ];

  it('returns null for empty task list', () => {
    expect(selectRandomTask([])).toBeNull();
  });

  it('selects from oral-exam areas when available', () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const task = selectRandomTask(tasks);
      if (task) results.add(task.id);
    }
    expect(results).not.toContain('PA.IV.A');
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('filters by aircraft class in random selection', () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const task = selectRandomTask(tasks, [], 'ASEL');
      if (task) results.add(task.id);
    }
    // PA.X.A is AMEL/AMES only — should never appear for ASEL
    expect(results).not.toContain('PA.X.A');
  });

  it('falls back to any task when all oral-exam tasks are covered', () => {
    const task = selectRandomTask(tasks, ['PA.I.A', 'PA.IX.A', 'PA.X.A']);
    expect(task).not.toBeNull();
    expect(task!.id).toBe('PA.IV.A');
  });

  it('returns first task when all are covered', () => {
    const task = selectRandomTask(tasks, ['PA.I.A', 'PA.IV.A', 'PA.IX.A', 'PA.X.A']);
    expect(task).not.toBeNull();
    expect(task!.id).toBe('PA.I.A');
  });
});

describe('buildSystemPrompt', () => {
  it('includes the task area and ID', () => {
    const task = makeTask('PA.I.A', {
      area: 'Preflight Preparation',
      task: 'Pilot Qualifications',
      knowledge_elements: [
        { code: 'PA.I.A.K1', description: 'Certification requirements' },
      ],
      risk_management_elements: [
        { code: 'PA.I.A.R1', description: 'Risk of inadequate preparation' },
      ],
    });
    const prompt = buildSystemPrompt(task);
    expect(prompt).toContain('Preflight Preparation');
    expect(prompt).toContain('Pilot Qualifications');
    expect(prompt).toContain('PA.I.A');
    expect(prompt).toContain('PA.I.A.K1');
    expect(prompt).toContain('Certification requirements');
    expect(prompt).toContain('PA.I.A.R1');
    expect(prompt).toContain('Risk of inadequate preparation');
  });

  it('includes DPE role instructions', () => {
    const task = makeTask('PA.I.A');
    const prompt = buildSystemPrompt(task);
    expect(prompt).toContain('Designated Pilot Examiner');
    expect(prompt).toContain('Private Pilot oral examination');
    expect(prompt).toContain('Ask ONE clear question');
  });

  it('includes difficulty instruction when provided', () => {
    const task = makeTask('PA.I.A');
    const prompt = buildSystemPrompt(task, 'hard');
    expect(prompt).toContain('DIFFICULTY LEVEL: HARD');
    expect(prompt).toContain('complex edge cases');
  });

  it('omits difficulty instruction when not provided', () => {
    const task = makeTask('PA.I.A');
    const prompt = buildSystemPrompt(task);
    expect(prompt).not.toContain('DIFFICULTY LEVEL');
  });

  it('includes aircraft class instruction when provided', () => {
    const task = makeTask('PA.I.A');
    const prompt = buildSystemPrompt(task, undefined, 'ASEL');
    expect(prompt).toContain('AIRCRAFT CLASS: ASEL');
    expect(prompt).toContain('Single-Engine Land');
    expect(prompt).toContain('Only ask questions relevant to this class');
  });

  it('omits aircraft class instruction when not provided', () => {
    const task = makeTask('PA.I.A');
    const prompt = buildSystemPrompt(task);
    expect(prompt).not.toContain('AIRCRAFT CLASS');
  });
});

// ================================================================
// Planner Pure Functions
// ================================================================

function makeElement(code: string, opts?: Partial<AcsElementDB>): AcsElementDB {
  const parts = code.split('.');
  return {
    code,
    task_id: `${parts[0]}.${parts[1]}.${parts[2]}`,
    element_type: opts?.element_type ?? 'knowledge',
    short_code: parts[parts.length - 1],
    description: opts?.description ?? `Description for ${code}`,
    order_index: opts?.order_index ?? 0,
    difficulty_default: opts?.difficulty_default ?? 'medium',
    weight: opts?.weight ?? 1,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('buildElementQueue', () => {
  const elements: AcsElementDB[] = [
    makeElement('PA.I.A.K1', { element_type: 'knowledge', order_index: 1 }),
    makeElement('PA.I.A.K2', { element_type: 'knowledge', order_index: 2 }),
    makeElement('PA.I.A.R1', { element_type: 'risk', order_index: 3 }),
    makeElement('PA.I.A.S1', { element_type: 'skill', order_index: 4 }),
    makeElement('PA.II.A.K1', { element_type: 'knowledge', order_index: 5 }),
    makeElement('PA.IX.A.K1', { element_type: 'knowledge', difficulty_default: 'easy', order_index: 6 }),
    makeElement('PA.IX.A.K2', { element_type: 'knowledge', difficulty_default: 'hard', order_index: 7 }),
  ];

  it('filters out skill elements', () => {
    const queue = buildElementQueue(elements, defaultConfig);
    expect(queue).not.toContain('PA.I.A.S1');
  });

  it('includes knowledge and risk elements', () => {
    const queue = buildElementQueue(elements, defaultConfig);
    expect(queue).toContain('PA.I.A.K1');
    expect(queue).toContain('PA.I.A.R1');
  });

  it('filters by selected areas', () => {
    const config: SessionConfig = { ...defaultConfig, selectedAreas: ['IX'] };
    const queue = buildElementQueue(elements, config);
    expect(queue).toContain('PA.IX.A.K1');
    expect(queue).toContain('PA.IX.A.K2');
    expect(queue).not.toContain('PA.I.A.K1');
  });

  it('filters by selected tasks (overrides areas)', () => {
    const config: SessionConfig = { ...defaultConfig, selectedTasks: ['PA.IX.A'], selectedAreas: ['I'] };
    const queue = buildElementQueue(elements, config);
    // selectedTasks wins over selectedAreas
    expect(queue).toContain('PA.IX.A.K1');
    expect(queue).toContain('PA.IX.A.K2');
    expect(queue).not.toContain('PA.I.A.K1');
  });

  it('filters by difficulty when not mixed', () => {
    const config: SessionConfig = { ...defaultConfig, difficulty: 'easy' };
    const queue = buildElementQueue(elements, config);
    expect(queue).toContain('PA.IX.A.K1');
    expect(queue).not.toContain('PA.IX.A.K2');
  });

  it('preserves order in linear mode', () => {
    const queue = buildElementQueue(elements, defaultConfig);
    const k1Idx = queue.indexOf('PA.I.A.K1');
    const k2Idx = queue.indexOf('PA.I.A.K2');
    const r1Idx = queue.indexOf('PA.I.A.R1');
    expect(k1Idx).toBeLessThan(k2Idx);
    expect(k2Idx).toBeLessThan(r1Idx);
  });

  it('shuffles in cross_acs mode', () => {
    const config: SessionConfig = { ...defaultConfig, studyMode: 'cross_acs' };
    const linearQueue = buildElementQueue(elements, defaultConfig);
    let differed = false;
    for (let i = 0; i < 20; i++) {
      const shuffled = buildElementQueue(elements, config);
      if (shuffled.join(',') !== linearQueue.join(',')) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });

  it('falls back to all elements when difficulty filter would empty queue', () => {
    const config: SessionConfig = { ...defaultConfig, difficulty: 'easy', selectedAreas: ['I'] };
    // Area I elements are all 'medium' by default, so easy filter matches none;
    // fallback skips difficulty filter and returns all K/R elements
    const queue = buildElementQueue(elements, config);
    expect(queue.length).toBeGreaterThan(0);
    // All should be Area I elements (PA.I.*)
    for (const code of queue) {
      expect(code.split('.')[1]).toBe('I');
    }
  });
});

describe('pickNextElement', () => {
  it('picks the first element from the queue', () => {
    const state = initPlannerState(['A', 'B', 'C']);
    const result = pickNextElement(state, defaultConfig);
    expect(result).not.toBeNull();
    expect(result!.elementCode).toBe('A');
  });

  it('advances cursor after pick', () => {
    const state = initPlannerState(['A', 'B', 'C']);
    const r1 = pickNextElement(state, defaultConfig)!;
    const r2 = pickNextElement(r1.updatedState, defaultConfig)!;
    expect(r2.elementCode).toBe('B');
  });

  it('skips recently visited elements', () => {
    const state = initPlannerState(['A', 'B', 'C']);
    const stateWithRecent = { ...state, recent: ['A'] };
    const result = pickNextElement(stateWithRecent, defaultConfig);
    expect(result!.elementCode).toBe('B');
  });

  it('wraps around the queue', () => {
    const state = initPlannerState(['A', 'B']);
    const r1 = pickNextElement(state, defaultConfig)!;
    const r2 = pickNextElement(r1.updatedState, defaultConfig)!;
    const r3 = pickNextElement(r2.updatedState, defaultConfig)!;
    expect(r3.elementCode).toBe('A');
  });

  it('increments attempt count', () => {
    const state = initPlannerState(['A', 'B']);
    const r1 = pickNextElement(state, defaultConfig)!;
    expect(r1.updatedState.attempts['A']).toBe(1);
    const r2 = pickNextElement(r1.updatedState, defaultConfig)!;
    const r3 = pickNextElement(r2.updatedState, defaultConfig)!;
    expect(r3.updatedState.attempts['A']).toBe(2);
  });

  it('returns null for empty queue', () => {
    const state = initPlannerState([]);
    expect(pickNextElement(state, defaultConfig)).toBeNull();
  });

  it('increments version', () => {
    const state = initPlannerState(['A']);
    const r1 = pickNextElement(state, defaultConfig)!;
    expect(r1.updatedState.version).toBe(1);
  });
});

describe('initPlannerState', () => {
  it('creates state with correct defaults', () => {
    const state = initPlannerState(['X', 'Y']);
    expect(state.version).toBe(0);
    expect(state.cursor).toBe(0);
    expect(state.queue).toEqual(['X', 'Y']);
    expect(state.recent).toEqual([]);
    expect(state.attempts).toEqual({});
  });
});

// ================================================================
// Exam Grading
// ================================================================

describe('computeExamResult', () => {
  function makeAttempts(entries: Array<{ code: string; score: 'satisfactory' | 'unsatisfactory' | 'partial' }>) {
    return entries.map(e => ({
      element_code: e.code,
      score: e.score,
      area: e.code.split('.')[1],
    }));
  }

  // --- Score percentage & grade tests ---

  it('returns satisfactory (100%) when all elements are satisfactory', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.I.A.R1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 3, 'all_tasks_covered');
    expect(result.grade).toBe('satisfactory');
    expect(result.score_percentage).toBe(1.0);
    expect(result.elements_asked).toBe(3);
    expect(result.elements_satisfactory).toBe(3);
    expect(result.elements_unsatisfactory).toBe(0);
    expect(result.elements_not_asked).toBe(0);
    expect(result.completion_trigger).toBe('all_tasks_covered');
  });

  it('returns satisfactory when score >= 70% (mix of sat + partial)', () => {
    // 7 sat (7.0) + 3 partial (2.1) = 9.1 / 10 = 91%
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.I.A.R1', score: 'satisfactory' },
      { code: 'PA.II.A.K1', score: 'satisfactory' },
      { code: 'PA.II.A.K2', score: 'satisfactory' },
      { code: 'PA.II.B.R1', score: 'satisfactory' },
      { code: 'PA.III.A.K1', score: 'satisfactory' },
      { code: 'PA.III.A.K2', score: 'partial' },
      { code: 'PA.III.B.K1', score: 'partial' },
      { code: 'PA.III.B.R1', score: 'partial' },
    ]);
    const result = computeExamResult(attempts, 10, 'all_tasks_covered');
    expect(result.grade).toBe('satisfactory');
    expect(result.score_percentage).toBe(0.91);
  });

  it('returns satisfactory at exactly 70% threshold', () => {
    // 4 sat (4.0) + 0 partial + 0 unsat, but we need exactly 70% with partials
    // 0 sat + 10 partial = 7.0 / 10 = 70% exactly
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'partial' },
      { code: 'PA.I.A.K2', score: 'partial' },
      { code: 'PA.I.A.R1', score: 'partial' },
      { code: 'PA.II.A.K1', score: 'partial' },
      { code: 'PA.II.A.K2', score: 'partial' },
      { code: 'PA.II.B.R1', score: 'partial' },
      { code: 'PA.III.A.K1', score: 'partial' },
      { code: 'PA.III.A.K2', score: 'partial' },
      { code: 'PA.III.B.K1', score: 'partial' },
      { code: 'PA.III.B.R1', score: 'partial' },
    ]);
    const result = computeExamResult(attempts, 10, 'all_tasks_covered');
    expect(result.grade).toBe('satisfactory');
    expect(result.score_percentage).toBe(0.7);
  });

  it('returns unsatisfactory when score < 70%', () => {
    // 1 sat (1.0) + 0 partial + 2 unsat (0) = 1.0 / 3 = 33%
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'unsatisfactory' },
      { code: 'PA.II.A.K1', score: 'unsatisfactory' },
    ]);
    const result = computeExamResult(attempts, 3, 'user_ended');
    expect(result.grade).toBe('unsatisfactory');
    expect(result.score_percentage).toBeCloseTo(0.33, 2);
    expect(result.elements_unsatisfactory).toBe(2);
  });

  it('returns unsatisfactory just below 70% threshold', () => {
    // 6 sat (6.0) + 0 partial + 4 unsat (0) = 6.0 / 10 = 60%
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.I.A.R1', score: 'satisfactory' },
      { code: 'PA.II.A.K1', score: 'satisfactory' },
      { code: 'PA.II.A.K2', score: 'satisfactory' },
      { code: 'PA.II.B.R1', score: 'satisfactory' },
      { code: 'PA.III.A.K1', score: 'unsatisfactory' },
      { code: 'PA.III.A.K2', score: 'unsatisfactory' },
      { code: 'PA.III.B.K1', score: 'unsatisfactory' },
      { code: 'PA.III.B.R1', score: 'unsatisfactory' },
    ]);
    const result = computeExamResult(attempts, 10, 'all_tasks_covered');
    expect(result.grade).toBe('unsatisfactory');
    expect(result.score_percentage).toBe(0.6);
  });

  it('grades against elements asked when user ends exam early', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 5, 'user_ended');
    // User-ended exams grade against what was asked, not the full set
    expect(result.grade).toBe('satisfactory');
    expect(result.score_percentage).toBe(1.0); // 1/1 = 100% of what was asked
    expect(result.elements_asked).toBe(1);
    expect(result.elements_not_asked).toBe(4);
  });

  it('returns incomplete for natural completion with partial coverage', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 5, 'all_tasks_covered');
    expect(result.grade).toBe('incomplete');
  });

  it('returns incomplete for expired exams', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 10, 'expired');
    expect(result.grade).toBe('incomplete');
    expect(result.completion_trigger).toBe('expired');
  });

  it('computes score_by_area correctly', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'unsatisfactory' },
      { code: 'PA.II.A.K1', score: 'satisfactory' },
      { code: 'PA.II.B.R1', score: 'satisfactory' },
    ]);
    const result = computeExamResult(attempts, 4, 'all_tasks_covered');
    expect(result.score_by_area['I']).toEqual({ asked: 2, satisfactory: 1, unsatisfactory: 1 });
    expect(result.score_by_area['II']).toEqual({ asked: 2, satisfactory: 2, unsatisfactory: 0 });
  });

  it('handles empty attempts (zero exchanges)', () => {
    const result = computeExamResult([], 10, 'user_ended');
    expect(result.grade).toBe('incomplete');
    expect(result.score_percentage).toBe(0);
    expect(result.elements_asked).toBe(0);
    expect(result.elements_not_asked).toBe(10);
  });

  it('all-partial scores 70% — passes at threshold', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'partial' },
      { code: 'PA.I.A.K2', score: 'partial' },
    ]);
    const result = computeExamResult(attempts, 2, 'all_tasks_covered');
    expect(result.grade).toBe('satisfactory');
    expect(result.score_percentage).toBe(0.7);
    expect(result.elements_partial).toBe(2);
  });

  it('returns incomplete when totalElementsInSet is 0 (degenerate case)', () => {
    const result = computeExamResult([], 0, 'user_ended');
    expect(result.grade).toBe('incomplete');
    expect(result.score_percentage).toBe(0);
    expect(result.elements_asked).toBe(0);
    expect(result.elements_not_asked).toBe(0);
    expect(result.total_elements_in_set).toBe(0);
  });

  it('deduplicates element_codes using last-score-wins', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'unsatisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.I.A.K1', score: 'satisfactory' }, // retry — should supersede the unsatisfactory
    ]);
    const result = computeExamResult(attempts, 2, 'all_tasks_covered');
    expect(result.elements_asked).toBe(2); // deduplicated count
    expect(result.elements_satisfactory).toBe(2);
    expect(result.elements_unsatisfactory).toBe(0);
    expect(result.grade).toBe('satisfactory');
    expect(result.score_percentage).toBe(1.0);
  });

  it('handles more attempts than total elements (retries with dedup)', () => {
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.I.A.K1', score: 'satisfactory' }, // retry
    ]);
    const result = computeExamResult(attempts, 2, 'all_tasks_covered');
    expect(result.elements_asked).toBe(2); // deduplicated
    expect(result.elements_not_asked).toBe(0);
    expect(result.grade).toBe('satisfactory');
  });

  it('extracts area correctly for multi-character Roman numerals', () => {
    const attempts = makeAttempts([
      { code: 'CA.VIII.A.R2', score: 'satisfactory' },
      { code: 'IR.VII.A.K1', score: 'unsatisfactory' },
    ]);
    const result = computeExamResult(attempts, 2, 'all_tasks_covered');
    expect(result.score_by_area['VIII']).toEqual({ asked: 1, satisfactory: 1, unsatisfactory: 0 });
    expect(result.score_by_area['VII']).toEqual({ asked: 1, satisfactory: 0, unsatisfactory: 1 });
  });

  it('mixed sat/partial/unsat computes correct percentage', () => {
    // 2 sat (2.0) + 1 partial (0.7) + 1 unsat (0) = 2.7 / 4 = 67.5% → unsatisfactory
    const attempts = makeAttempts([
      { code: 'PA.I.A.K1', score: 'satisfactory' },
      { code: 'PA.I.A.K2', score: 'satisfactory' },
      { code: 'PA.II.A.K1', score: 'partial' },
      { code: 'PA.II.A.K2', score: 'unsatisfactory' },
    ]);
    const result = computeExamResult(attempts, 4, 'all_tasks_covered');
    expect(result.grade).toBe('unsatisfactory');
    expect(result.score_percentage).toBeCloseTo(0.68, 2);
  });
});

// ================================================================
// Structured Response Chunk Extraction
// ================================================================

describe('extractStructuredChunks', () => {
  it('extracts all 3 fields from well-formed JSON', () => {
    const json = `{"feedback_quick": "That's right.", "feedback_detail": "You covered the key points.", "question": "Let's move on. What about VFR minimums?"}`;
    const chunks = extractStructuredChunks(json, new Set());
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ field: 'feedback_quick', text: "That's right." });
    expect(chunks[1]).toEqual({ field: 'feedback_detail', text: 'You covered the key points.' });
    expect(chunks[2]).toEqual({ field: 'question', text: "Let's move on. What about VFR minimums?" });
    expect(chunks.map(c => c.field)).toEqual(['feedback_quick', 'feedback_detail', 'question']);
  });

  it('skips already-emitted fields', () => {
    const json = `{"feedback_quick": "Good.", "feedback_detail": "Nice.", "question": "Next?"}`;
    const already = new Set(['feedback_quick', 'feedback_detail']);
    const chunks = extractStructuredChunks(json, already);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].field).toBe('question');
    expect(chunks[0].text).toBe('Next?');
  });

  it('handles escaped quotes inside values', () => {
    const json = `{"feedback_quick": "He said \\"good job\\" to you.", "feedback_detail": "Detail.", "question": "Question?"}`;
    const chunks = extractStructuredChunks(json, new Set());
    expect(chunks[0].text).toBe('He said "good job" to you.');
  });

  it('handles escaped newlines inside values', () => {
    const json = `{"feedback_quick": "Line 1.\\nLine 2.", "feedback_detail": "Ok.", "question": "Q?"}`;
    const chunks = extractStructuredChunks(json, new Set());
    expect(chunks[0].text).toBe('Line 1.\nLine 2.');
  });

  it('handles escaped backslashes inside values', () => {
    const json = `{"feedback_quick": "Path is C:\\\\Users\\\\test.", "feedback_detail": "Ok.", "question": "Q?"}`;
    const chunks = extractStructuredChunks(json, new Set());
    expect(chunks[0].text).toBe('Path is C:\\Users\\test.');
  });

  it('returns empty array for partial JSON with no complete field', () => {
    const partial = `{"feedback_quick": "This is not fini`;
    const chunks = extractStructuredChunks(partial, new Set());
    expect(chunks).toHaveLength(0);
  });

  it('extracts only completed fields from partial streaming JSON', () => {
    const partial = `{"feedback_quick": "Done.", "feedback_detail": "Also done.", "question": "Not fini`;
    const chunks = extractStructuredChunks(partial, new Set());
    expect(chunks).toHaveLength(2);
    expect(chunks[0].field).toBe('feedback_quick');
    expect(chunks[1].field).toBe('feedback_detail');
  });

  it('handles model output that is not JSON at all', () => {
    const nonJson = 'Sure, let me ask you about VFR weather minimums...';
    const chunks = extractStructuredChunks(nonJson, new Set());
    expect(chunks).toHaveLength(0);
  });

  it('handles JSON with extra whitespace between field and value', () => {
    const json = `{  "feedback_quick"  :  "Spaced."  , "feedback_detail":"Tight.","question"  :  "Q?" }`;
    const chunks = extractStructuredChunks(json, new Set());
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toBe('Spaced.');
    expect(chunks[1].text).toBe('Tight.');
  });
});

describe('buildPlainTextFromChunks', () => {
  it('joins all 3 chunks with double newline', () => {
    const chunkTexts: Record<string, string> = {
      feedback_quick: 'Good.',
      feedback_detail: 'You got it right.',
      question: 'What about Class B airspace?',
    };
    const result = buildPlainTextFromChunks('{}', chunkTexts);
    expect(result).toBe('Good.\n\nYou got it right.\n\nWhat about Class B airspace?');
  });

  it('fills missing chunks from full JSON parse', () => {
    const fullJson = `{"feedback_quick": "Nice.", "feedback_detail": "Detail text.", "question": "Next question?"}`;
    const chunkTexts: Record<string, string> = { feedback_quick: 'Nice.' };
    const result = buildPlainTextFromChunks(fullJson, chunkTexts);
    expect(result).toBe('Nice.\n\nDetail text.\n\nNext question?');
    expect(chunkTexts.feedback_detail).toBe('Detail text.');
    expect(chunkTexts.question).toBe('Next question?');
  });

  it('does full JSON parse when no chunks were extracted', () => {
    const fullJson = `{"feedback_quick": "A.", "feedback_detail": "B.", "question": "C?"}`;
    const chunkTexts: Record<string, string> = {};
    const result = buildPlainTextFromChunks(fullJson, chunkTexts);
    expect(result).toBe('A.\n\nB.\n\nC?');
  });

  it('strips markdown code blocks before parsing', () => {
    const wrapped = '```json\n{"feedback_quick": "A.", "feedback_detail": "B.", "question": "C?"}\n```';
    const chunkTexts: Record<string, string> = {};
    const result = buildPlainTextFromChunks(wrapped, chunkTexts);
    expect(result).toBe('A.\n\nB.\n\nC?');
  });

  it('falls back to raw fullText when JSON is completely malformed', () => {
    const garbage = 'This is not JSON at all, just the examiner talking.';
    const chunkTexts: Record<string, string> = {};
    const result = buildPlainTextFromChunks(garbage, chunkTexts);
    expect(result).toBe(garbage);
  });

  it('falls back to raw fullText when partial chunks exist and JSON parse fails', () => {
    const malformed = '{"feedback_quick": "Good." broken json here';
    const chunkTexts: Record<string, string> = { feedback_quick: 'Good.' };
    const result = buildPlainTextFromChunks(malformed, chunkTexts);
    // Only has feedback_quick, JSON parse fails for rest
    expect(result).toBe('Good.');
  });

  it('returns all 3 chunks when all were already extracted (no parse needed)', () => {
    const chunkTexts: Record<string, string> = {
      feedback_quick: 'X.',
      feedback_detail: 'Y.',
      question: 'Z?',
    };
    const result = buildPlainTextFromChunks('irrelevant', chunkTexts);
    expect(result).toBe('X.\n\nY.\n\nZ?');
  });
});

describe('STRUCTURED_CHUNK_FIELDS', () => {
  it('contains exactly 3 fields in the correct order', () => {
    expect(STRUCTURED_CHUNK_FIELDS).toEqual(['feedback_quick', 'feedback_detail', 'question']);
  });
});
