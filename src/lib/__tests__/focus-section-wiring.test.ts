import { describe, it, expect } from 'vitest';
import { buildElementQueue } from '../exam-logic';
import type { SessionConfig } from '@/types/database';

interface TestElement {
  code: string;
  task_id: string;
  element_type: 'knowledge' | 'risk' | 'skill';
  short_code: string;
  description: string;
  order_index: number;
  difficulty_default: 'easy' | 'medium' | 'hard';
  weight: number;
  created_at: string;
}

function makeElement(code: string, opts?: Partial<TestElement>): TestElement {
  const parts = code.split('.');
  return {
    code,
    task_id: parts.slice(0, 3).join('.'),
    element_type: opts?.element_type ?? 'knowledge',
    short_code: parts[3] || 'K1',
    description: `Element ${code}`,
    order_index: opts?.order_index ?? 0,
    difficulty_default: opts?.difficulty_default ?? 'medium',
    weight: opts?.weight ?? 1.0,
    created_at: opts?.created_at ?? '2026-01-01T00:00:00Z',
  };
}

const BASE_CONFIG: SessionConfig = {
  rating: 'private',
  aircraftClass: 'ASEL',
  studyMode: 'linear',
  difficulty: 'mixed',
  selectedAreas: [],
  selectedTasks: [],
};

const PRIVATE_ELEMENTS = [
  makeElement('PA.I.A.K1', { order_index: 1 }),
  makeElement('PA.I.A.K2', { order_index: 2 }),
  makeElement('PA.I.B.K1', { order_index: 3 }),
  makeElement('PA.II.A.K1', { order_index: 4 }),
  makeElement('PA.II.A.R1', { element_type: 'risk', order_index: 5 }),
  makeElement('PA.III.A.K1', { order_index: 6 }),
  makeElement('PA.IX.A.K1', { order_index: 7 }),
  makeElement('PA.IX.A.S1', { element_type: 'skill', order_index: 8 }),
];

const COMMERCIAL_ELEMENTS = [
  makeElement('CA.I.A.K1', { order_index: 1 }),
  makeElement('CA.I.B.K1', { order_index: 2 }),
  makeElement('CA.II.A.K1', { order_index: 3 }),
  makeElement('CA.III.A.K1', { order_index: 4 }),
];

const INSTRUMENT_ELEMENTS = [
  makeElement('IR.I.A.K1', { order_index: 1 }),
  makeElement('IR.I.B.K1', { order_index: 2 }),
  makeElement('IR.I.C.K1', { order_index: 3 }),
  makeElement('IR.II.A.K1', { order_index: 4 }),
  makeElement('IR.VI.A.K1', { order_index: 5 }),
  makeElement('IR.VII.A.K1', { order_index: 6 }),
];

describe('Focus section wiring — area-level selection', () => {
  describe('Private Pilot', () => {
    it('includes all oral elements when no areas selected', () => {
      const queue = buildElementQueue(PRIVATE_ELEMENTS, BASE_CONFIG);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).toContain('PA.II.A.R1');
      expect(queue).not.toContain('PA.IX.A.S1');
    });

    it('filters to single area via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.I.A', 'PA.I.B'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).toContain('PA.I.A.K2');
      expect(queue).toContain('PA.I.B.K1');
      expect(queue).not.toContain('PA.II.A.K1');
      expect(queue).not.toContain('PA.IX.A.K1');
    });

    it('filters to multiple areas via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.I.A', 'PA.IX.A'],
        selectedAreas: ['I', 'IX'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).toContain('PA.IX.A.K1');
      expect(queue).not.toContain('PA.II.A.K1');
      expect(queue).not.toContain('PA.III.A.K1');
    });

    it('selectedTasks takes priority over selectedAreas', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.IX.A'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.IX.A.K1');
      expect(queue).not.toContain('PA.I.A.K1');
    });

    it('excludes skill elements even when area selected', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.IX.A'],
        selectedAreas: ['IX'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.IX.A.K1');
      expect(queue).not.toContain('PA.IX.A.S1');
    });
  });

  describe('Commercial Pilot', () => {
    it('includes all oral elements when no areas selected', () => {
      const config = { ...BASE_CONFIG, rating: 'commercial' as const };
      const queue = buildElementQueue(COMMERCIAL_ELEMENTS, config);
      expect(queue).toContain('CA.I.A.K1');
      expect(queue).toContain('CA.III.A.K1');
      expect(queue).toHaveLength(4);
    });

    it('filters to selected area via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        rating: 'commercial' as const,
        selectedTasks: ['CA.I.A', 'CA.I.B'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(COMMERCIAL_ELEMENTS, config);
      expect(queue).toContain('CA.I.A.K1');
      expect(queue).toContain('CA.I.B.K1');
      expect(queue).not.toContain('CA.II.A.K1');
    });
  });

  describe('Instrument Rating', () => {
    it('includes oral-area elements and excludes flight-only areas when no areas selected', () => {
      const config = { ...BASE_CONFIG, rating: 'instrument' as const };
      const queue = buildElementQueue(INSTRUMENT_ELEMENTS, config);
      // W2.5 (bug 18): IR Area VI is not an oral-exam area — its K/R
      // elements no longer leak into default-scope exams.
      expect(queue).toHaveLength(5);
      expect(queue).not.toContain('IR.VI.A.K1');
      expect(queue).toContain('IR.VII.A.K1');
    });

    it('filters to Preflight Preparation (Area I) via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        rating: 'instrument' as const,
        selectedTasks: ['IR.I.A', 'IR.I.B', 'IR.I.C'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(INSTRUMENT_ELEMENTS, config);
      expect(queue).toContain('IR.I.A.K1');
      expect(queue).toContain('IR.I.B.K1');
      expect(queue).toContain('IR.I.C.K1');
      expect(queue).not.toContain('IR.II.A.K1');
      expect(queue).not.toContain('IR.VI.A.K1');
    });

    it('filters to Approach + Emergency areas via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        rating: 'instrument' as const,
        selectedTasks: ['IR.VI.A', 'IR.VII.A'],
        selectedAreas: ['VI', 'VII'],
      };
      const queue = buildElementQueue(INSTRUMENT_ELEMENTS, config);
      expect(queue).toContain('IR.VI.A.K1');
      expect(queue).toContain('IR.VII.A.K1');
      expect(queue).not.toContain('IR.I.A.K1');
      expect(queue).toHaveLength(2);
    });
  });

  describe('Study mode + Focus interaction', () => {
    it('linear mode preserves element order within selected area', () => {
      const config = {
        ...BASE_CONFIG,
        studyMode: 'linear' as const,
        selectedTasks: ['PA.I.A'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      const k1Idx = queue.indexOf('PA.I.A.K1');
      const k2Idx = queue.indexOf('PA.I.A.K2');
      expect(k1Idx).toBeLessThan(k2Idx);
    });

    it('cross_acs mode shuffles within selected areas', () => {
      const config = {
        ...BASE_CONFIG,
        studyMode: 'cross_acs' as const,
        selectedTasks: ['PA.I.A', 'PA.I.B', 'PA.II.A', 'PA.IX.A'],
        selectedAreas: ['I', 'II', 'IX'],
      };
      const linearQueue = buildElementQueue(PRIVATE_ELEMENTS, {
        ...config,
        studyMode: 'linear',
      });
      let differed = false;
      for (let i = 0; i < 20; i++) {
        const shuffled = buildElementQueue(PRIVATE_ELEMENTS, config);
        if (shuffled.join(',') !== linearQueue.join(',')) {
          differed = true;
          break;
        }
      }
      expect(differed).toBe(true);
    });

    it('difficulty filter combines with area selection', () => {
      const elements = [
        makeElement('PA.I.A.K1', { difficulty_default: 'easy', order_index: 1 }),
        makeElement('PA.I.A.K2', { difficulty_default: 'hard', order_index: 2 }),
        makeElement('PA.II.A.K1', { difficulty_default: 'easy', order_index: 3 }),
      ];
      const config = {
        ...BASE_CONFIG,
        difficulty: 'easy' as const,
        selectedTasks: ['PA.I.A'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(elements, config);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).not.toContain('PA.I.A.K2');
      expect(queue).not.toContain('PA.II.A.K1');
    });
  });
});

// Integration: the per-mode Focus PRE-FILL (weak-areas.ts) supplies selectedTasks,
// and the engine scopes to them. Verifies the weak/quick modes end-to-end.
describe('Focus pre-fill ↔ engine scope (weak / quick modes)', () => {
  // PA.I.A has a weak element (K1) and a satisfactory one (K2); PA.I.B and
  // PA.II.A are never-practiced (untouched).
  const elements = [
    makeElement('PA.I.A.K1', { order_index: 1 }),
    makeElement('PA.I.A.K2', { order_index: 2 }),
    makeElement('PA.I.B.K1', { order_index: 3 }),
    makeElement('PA.II.A.K1', { order_index: 4 }),
    makeElement('PA.III.A.K1', { order_index: 5 }), // out of scope
  ];
  const weakStats = [
    { element_code: 'PA.I.A.K1', task_id: 'PA.I.A', area: 'I', element_type: 'knowledge' as const, difficulty_default: 'medium' as const, description: '', total_attempts: 2, satisfactory_count: 0, partial_count: 0, unsatisfactory_count: 2, latest_score: 'unsatisfactory' as const, latest_attempt_at: '2026-01-01T00:00:00Z' },
    { element_code: 'PA.I.A.K2', task_id: 'PA.I.A', area: 'I', element_type: 'knowledge' as const, difficulty_default: 'medium' as const, description: '', total_attempts: 2, satisfactory_count: 2, partial_count: 0, unsatisfactory_count: 0, latest_score: 'satisfactory' as const, latest_attempt_at: '2026-01-01T00:00:00Z' },
  ];

  it('weak_areas: Focus scoped to the weak task keeps that task (incl. its elements), drops others', () => {
    const queue = buildElementQueue(
      elements,
      { ...BASE_CONFIG, studyMode: 'weak_areas', selectedTasks: ['PA.I.A'] },
      weakStats
    );
    expect(new Set(queue)).toEqual(new Set(['PA.I.A.K1', 'PA.I.A.K2']));
  });

  it('quick_drill: Focus = weak ∪ untouched tasks → drills only weak+untouched ELEMENTS (drops the satisfactory one)', () => {
    const queue = buildElementQueue(
      elements,
      { ...BASE_CONFIG, studyMode: 'quick_drill', selectedTasks: ['PA.I.A', 'PA.I.B', 'PA.II.A'] },
      weakStats
    );
    // weak (PA.I.A.K1) + untouched (PA.I.B.K1, PA.II.A.K1); satisfactory PA.I.A.K2 excluded.
    expect(new Set(queue)).toEqual(new Set(['PA.I.A.K1', 'PA.I.B.K1', 'PA.II.A.K1']));
    expect(queue).not.toContain('PA.I.A.K2');
    expect(queue).not.toContain('PA.III.A.K1'); // out of Focus scope
  });
});
