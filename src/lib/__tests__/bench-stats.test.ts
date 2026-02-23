import { describe, it, expect } from 'vitest';
import { percentile, mean, stdev, computeStepStats, formatMs, classifyStep } from '../../../scripts/staging/bench-stats';

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns the single value for a 1-element array', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it('computes p50 (median) of odd-length array', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('computes p50 (median) of even-length array with interpolation', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it('computes p95 correctly', () => {
    const sorted = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const p95 = percentile(sorted, 95);
    // idx = 0.95 * 9 = 8.55 → interpolate between sorted[8]=900 and sorted[9]=1000
    expect(p95).toBeCloseTo(955, 0);
  });

  it('p0 returns first element', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it('p100 returns last element', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });
});

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('computes correct mean', () => {
    expect(mean([100, 200, 300])).toBe(200);
  });

  it('handles single value', () => {
    expect(mean([42])).toBe(42);
  });
});

describe('stdev', () => {
  it('returns 0 for empty array', () => {
    expect(stdev([])).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(stdev([42])).toBe(0);
  });

  it('computes sample standard deviation', () => {
    // Values: 2, 4, 4, 4, 5, 5, 7, 9 → mean=5, sample stdev ≈ 2.138
    const result = stdev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2.138, 2);
  });

  it('returns 0 for identical values', () => {
    expect(stdev([100, 100, 100])).toBe(0);
  });
});

describe('computeStepStats', () => {
  it('computes full stats for a set of samples', () => {
    const stats = computeStepStats('db.session_create', [100, 150, 120, 130, 110]);
    expect(stats.step).toBe('db.session_create');
    expect(stats.samples).toBe(5);
    expect(stats.mean).toBe(122); // (100+110+120+130+150)/5 = 122
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(150);
    expect(stats.p50).toBe(120);
    expect(stats.p95).toBeGreaterThan(140);
  });
});

describe('formatMs', () => {
  it('formats sub-second values in ms', () => {
    expect(formatMs(150)).toBe('150ms');
  });

  it('formats values >= 1000 in seconds', () => {
    expect(formatMs(1500)).toBe('1.5s');
  });

  it('formats exact second', () => {
    expect(formatMs(1000)).toBe('1.0s');
  });
});

describe('classifyStep', () => {
  it('classifies db steps', () => {
    expect(classifyStep('db.session_create')).toBe('db');
    expect(classifyStep('db.planner_init')).toBe('db');
    expect(classifyStep('db.session_complete')).toBe('db');
  });

  it('classifies claude steps as llm', () => {
    expect(classifyStep('claude.first_question')).toBe('llm');
    expect(classifyStep('claude.assess[0]')).toBe('llm');
    expect(classifyStep('claude.followup[0]')).toBe('llm');
  });
});
