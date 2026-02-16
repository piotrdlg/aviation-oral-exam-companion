import { describe, it, expect } from 'vitest';
import {
  ORAL_EXAM_AREA_PREFIXES,
  filterEligibleTasks,
  selectRandomTask,
  buildSystemPrompt,
  buildElementQueue,
  pickNextElement,
  initPlannerState,
  type AcsTaskRow,
} from '../exam-logic';
import type { AcsElement as AcsElementDB, ElementScore, SessionConfig } from '@/types/database';

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

  it('returns empty queue when all filtered out', () => {
    const config: SessionConfig = { ...defaultConfig, difficulty: 'easy', selectedAreas: ['I'] };
    // Area I elements are all 'medium' by default, so easy filter empties it
    const queue = buildElementQueue(elements, config);
    expect(queue).toHaveLength(0);
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
