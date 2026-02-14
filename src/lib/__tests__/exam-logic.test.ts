import { describe, it, expect } from 'vitest';
import {
  ORAL_EXAM_AREAS,
  filterEligibleTasks,
  selectRandomTask,
  buildSystemPrompt,
  type AcsTaskRow,
} from '../exam-logic';

function makeTask(id: string, opts?: Partial<AcsTaskRow>): AcsTaskRow {
  return {
    id,
    area: opts?.area ?? id.split('.').slice(0, 2).join('.'),
    task: opts?.task ?? `Task ${id}`,
    knowledge_elements: opts?.knowledge_elements ?? [],
    risk_management_elements: opts?.risk_management_elements ?? [],
    skill_elements: opts?.skill_elements ?? [],
  };
}

describe('ORAL_EXAM_AREAS', () => {
  it('includes 9 oral-exam-relevant areas', () => {
    expect(ORAL_EXAM_AREAS).toHaveLength(9);
  });

  it('includes Preflight Preparation (Area I)', () => {
    expect(ORAL_EXAM_AREAS).toContain('PA.I.%');
  });

  it('includes Emergency Operations (Area IX)', () => {
    expect(ORAL_EXAM_AREAS).toContain('PA.IX.%');
  });

  it('excludes Takeoffs/Landings (Area IV)', () => {
    expect(ORAL_EXAM_AREAS).not.toContain('PA.IV.%');
  });

  it('excludes Performance Maneuvers (Area V)', () => {
    expect(ORAL_EXAM_AREAS).not.toContain('PA.V.%');
  });

  it('excludes Multiengine Operations (Area X)', () => {
    expect(ORAL_EXAM_AREAS).not.toContain('PA.X.%');
  });
});

describe('filterEligibleTasks', () => {
  const allTasks = [
    makeTask('PA.I.A'),
    makeTask('PA.I.B'),
    makeTask('PA.II.A'),
    makeTask('PA.III.A'),
    makeTask('PA.IV.A'),  // Takeoffs — excluded
    makeTask('PA.V.A'),   // Performance — excluded
    makeTask('PA.VI.A'),
    makeTask('PA.VII.A'),
    makeTask('PA.VIII.A'),
    makeTask('PA.IX.A'),
    makeTask('PA.X.A'),   // Multiengine — excluded
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
    expect(ids).not.toContain('PA.X.A');
  });

  it('returns 10 eligible tasks from the 13 total', () => {
    const eligible = filterEligibleTasks(allTasks);
    expect(eligible).toHaveLength(10);
  });

  it('excludes already-covered tasks', () => {
    const eligible = filterEligibleTasks(allTasks, ['PA.I.A', 'PA.II.A']);
    const ids = eligible.map((t) => t.id);

    expect(ids).not.toContain('PA.I.A');
    expect(ids).not.toContain('PA.II.A');
    expect(ids).toContain('PA.I.B');
    expect(eligible).toHaveLength(8);
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
  ];

  it('returns null for empty task list', () => {
    expect(selectRandomTask([])).toBeNull();
  });

  it('selects from oral-exam areas when available', () => {
    // Run multiple times to ensure randomness doesn't pick PA.IV.A
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const task = selectRandomTask(tasks);
      if (task) results.add(task.id);
    }
    expect(results).not.toContain('PA.IV.A');
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('falls back to any task when all oral-exam tasks are covered', () => {
    const task = selectRandomTask(tasks, ['PA.I.A', 'PA.IX.A']);
    expect(task).not.toBeNull();
    expect(task!.id).toBe('PA.IV.A');
  });

  it('returns first task when all are covered', () => {
    const task = selectRandomTask(tasks, ['PA.I.A', 'PA.IV.A', 'PA.IX.A']);
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
});
