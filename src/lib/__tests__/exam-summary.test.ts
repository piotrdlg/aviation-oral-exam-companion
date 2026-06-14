import { describe, it, expect } from 'vitest';
import {
  ACS_AREA_NAMES,
  studyModeLabel,
  areaIdFromTaskId,
  areaNameFromTaskId,
  scopeAreaName,
  joinAreas,
  summarizeExam,
} from '../exam-summary';

describe('scopeAreaName', () => {
  it('resolves a BARE Roman numeral using the session rating (the stored format)', () => {
    expect(scopeAreaName('VIII', 'instrument')).toBe('Postflight Procedures');
    expect(scopeAreaName('V', 'instrument')).toBe('Navigation Systems');
    expect(scopeAreaName('I', 'private')).toBe('Preflight Preparation');
    expect(scopeAreaName('VI', 'commercial')).toBe('Navigation');
  });

  it('resolves an already-qualified area or task id without a rating', () => {
    expect(scopeAreaName('IR.VIII.')).toBe('Postflight Procedures');
    expect(scopeAreaName('PA.IX.A')).toBe('Emergency Operations');
  });

  it('falls back to the raw numeral when the rating is missing/unknown', () => {
    expect(scopeAreaName('VIII')).toBe('VIII');
    expect(scopeAreaName('VIII', 'glider')).toBe('VIII');
  });
});

describe('joinAreas', () => {
  it('joins up to max names with commas', () => {
    expect(joinAreas(['A', 'B', 'C'])).toBe('A, B, C');
    expect(joinAreas([])).toBe('');
  });

  it('collapses the tail to +N past max', () => {
    expect(joinAreas(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C +2');
    expect(joinAreas(['A', 'B', 'C', 'D'], 2)).toBe('A, B +2');
  });
});

describe('areaIdFromTaskId', () => {
  it('reduces a task id to its area prefix', () => {
    expect(areaIdFromTaskId('PA.I.B')).toBe('PA.I.');
    expect(areaIdFromTaskId('IR.VIII.A')).toBe('IR.VIII.');
    expect(areaIdFromTaskId('CA.XI.A')).toBe('CA.XI.');
  });

  it('is tolerant of an already-area id (with or without trailing dot)', () => {
    expect(areaIdFromTaskId('PA.I.')).toBe('PA.I.');
    expect(areaIdFromTaskId('PA.I')).toBe('PA.I.');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(areaIdFromTaskId('')).toBe('');
    expect(areaIdFromTaskId('garbage')).toBe('garbage');
  });
});

describe('areaNameFromTaskId', () => {
  it('resolves human names across all three ratings', () => {
    expect(areaNameFromTaskId('PA.I.B')).toBe('Preflight Preparation');
    expect(areaNameFromTaskId('PA.VI.A')).toBe('Navigation');
    expect(areaNameFromTaskId('IR.III.A')).toBe('Air Traffic Control (ATC) Clearances and Procedures');
    expect(areaNameFromTaskId('CA.VIII.B')).toBe('High-Altitude Operations');
  });

  it('accepts an area id directly', () => {
    expect(areaNameFromTaskId('PA.IX.')).toBe('Emergency Operations');
  });

  it('falls back to the raw area id for an unknown/legacy prefix', () => {
    expect(areaNameFromTaskId('ZZ.I.A')).toBe('ZZ.I.');
  });

  it('every seeded prefix has a non-empty name', () => {
    for (const [id, name] of Object.entries(ACS_AREA_NAMES)) {
      expect(name.length).toBeGreaterThan(0);
      expect(id.endsWith('.')).toBe(true);
    }
  });
});

describe('studyModeLabel', () => {
  it('labels all five modes correctly', () => {
    expect(studyModeLabel('linear')).toBe('Area by Area');
    expect(studyModeLabel('cross_acs')).toBe('Across ACS');
    expect(studyModeLabel('weak_areas')).toBe('Weak Areas');
    // The two the old inline ternary mislabeled as "Weak Areas":
    expect(studyModeLabel('quick_drill')).toBe('Quick Drill');
    expect(studyModeLabel('scenario')).toBe('Mock Checkride');
  });

  it('quick_drill and scenario are no longer mislabeled as Weak Areas', () => {
    expect(studyModeLabel('quick_drill')).not.toBe('Weak Areas');
    expect(studyModeLabel('scenario')).not.toBe('Weak Areas');
  });

  it('defaults safely for null/unknown modes', () => {
    expect(studyModeLabel(null)).toBe('Area by Area');
    expect(studyModeLabel(undefined)).toBe('Area by Area');
    expect(studyModeLabel('legacy_mode')).toBe('Area by Area');
  });
});

describe('summarizeExam — started exams', () => {
  it('groups covered tasks by area, dedupes areas, preserves first-seen order', () => {
    const { coveredAreas } = summarizeExam({
      exchange_count: 5,
      acs_tasks_covered: [
        { task_id: 'PA.VI.A', status: 'satisfactory' },
        { task_id: 'PA.I.B', status: 'partial' },
        { task_id: 'PA.VI.C', status: 'unsatisfactory' }, // same area as first
      ],
    });
    expect(coveredAreas.map((a) => a.areaId)).toEqual(['PA.VI.', 'PA.I.']); // first-seen order
    expect(coveredAreas[0].areaName).toBe('Navigation');
    expect(coveredAreas[0].tasks).toEqual([
      { task_id: 'PA.VI.A', status: 'satisfactory' },
      { task_id: 'PA.VI.C', status: 'unsatisfactory' },
    ]);
    expect(coveredAreas[1].tasks).toEqual([{ task_id: 'PA.I.B', status: 'partial' }]);
  });

  it('defaults a missing/empty task status to "unknown"', () => {
    const { coveredAreas } = summarizeExam({
      exchange_count: 1,
      acs_tasks_covered: [{ task_id: 'PA.I.A' }, { task_id: 'PA.I.B', status: '' }],
    });
    expect(coveredAreas[0].tasks.map((t) => t.status)).toEqual(['unknown', 'unknown']);
  });

  it('ignores malformed covered entries without a task_id', () => {
    const { coveredAreas } = summarizeExam({
      exchange_count: 1,
      // @ts-expect-error — exercising defensive runtime handling of bad data
      acs_tasks_covered: [{ status: 'satisfactory' }, null, { task_id: 'PA.II.A', status: 'satisfactory' }],
    });
    expect(coveredAreas).toHaveLength(1);
    expect(coveredAreas[0].areaId).toBe('PA.II.');
  });
});

describe('summarizeExam — not-yet-started exams', () => {
  it('uses selected_areas (bare numerals + rating) for scope when nothing is covered yet', () => {
    const { coveredAreas, scopeAreaNames } = summarizeExam({
      rating: 'instrument',
      exchange_count: 0,
      selected_areas: ['I', 'V'], // the real stored format: bare Roman numerals
      acs_tasks_covered: [],
    });
    expect(coveredAreas).toHaveLength(0);
    expect(scopeAreaNames).toEqual(['Preflight Preparation', 'Navigation Systems']);
  });

  it('reports "All areas" when no specific areas were selected', () => {
    expect(summarizeExam({ exchange_count: 0, selected_areas: [] }).scopeAreaNames).toEqual(['All areas']);
    expect(summarizeExam({ exchange_count: 0 }).scopeAreaNames).toEqual(['All areas']);
  });
});
