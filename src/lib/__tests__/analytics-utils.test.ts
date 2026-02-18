import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  groupByDate,
  fillDateGaps,
  computeMRR,
  computeChurnRate,
  computeTrialConversion,
  computeAvgDuration,
  formatCents,
  formatPercent,
  relativeTime,
} from '../analytics-utils';

describe('groupByDate', () => {
  it('buckets rows by date field', () => {
    const rows = [
      { created_at: '2026-02-10T10:00:00Z' },
      { created_at: '2026-02-10T15:00:00Z' },
      { created_at: '2026-02-11T08:00:00Z' },
    ];
    const result = groupByDate(rows, 'created_at');
    expect(result).toEqual({ '2026-02-10': 2, '2026-02-11': 1 });
  });

  it('returns empty object for empty array', () => {
    expect(groupByDate([], 'created_at')).toEqual({});
  });

  it('skips rows with missing field', () => {
    const rows = [
      { created_at: '2026-02-10T10:00:00Z' },
      { other: 'value' },
    ];
    const result = groupByDate(rows, 'created_at');
    expect(result).toEqual({ '2026-02-10': 1 });
  });
});

describe('fillDateGaps', () => {
  it('fills missing dates with 0', () => {
    const buckets = { '2026-02-10': 3, '2026-02-12': 1 };
    const result = fillDateGaps(buckets, new Date('2026-02-10'), 4);
    expect(result).toEqual([
      { date: '2026-02-10', count: 3 },
      { date: '2026-02-11', count: 0 },
      { date: '2026-02-12', count: 1 },
      { date: '2026-02-13', count: 0 },
    ]);
  });

  it('returns sorted array for 30-day range', () => {
    const result = fillDateGaps({}, new Date('2026-01-01'), 30);
    expect(result).toHaveLength(30);
    expect(result[0].date).toBe('2026-01-01');
    expect(result[29].date).toBe('2026-01-30');
    expect(result.every((r) => r.count === 0)).toBe(true);
  });
});

describe('computeMRR', () => {
  it('calculates correctly: (4x3900) + (2x2492) = 20584', () => {
    expect(computeMRR(4, 2)).toBe(4 * 3900 + 2 * Math.round(29900 / 12));
  });

  it('returns 0 for 0 subscribers', () => {
    expect(computeMRR(0, 0)).toBe(0);
  });
});

describe('computeChurnRate', () => {
  it('calculates: 3 churned / (10 + 3) approx 0.231', () => {
    const rate = computeChurnRate(10, 3);
    expect(rate).toBeCloseTo(3 / 13, 5);
  });

  it('returns 0 when denominator is 0', () => {
    expect(computeChurnRate(0, 0)).toBe(0);
  });
});

describe('computeTrialConversion', () => {
  it('calculates: 5/20 = 0.25', () => {
    expect(computeTrialConversion(5, 20)).toBe(0.25);
  });

  it('returns 0 when no trials', () => {
    expect(computeTrialConversion(0, 0)).toBe(0);
  });
});

describe('computeAvgDuration', () => {
  it('calculates average in minutes', () => {
    const sessions = [
      { started_at: '2026-02-10T10:00:00Z', ended_at: '2026-02-10T10:30:00Z' },
      { started_at: '2026-02-10T11:00:00Z', ended_at: '2026-02-10T12:00:00Z' },
    ];
    // 30min + 60min = 90min / 2 = 45min
    expect(computeAvgDuration(sessions)).toBe(45);
  });

  it('filters out sessions with null ended_at', () => {
    const sessions = [
      { started_at: '2026-02-10T10:00:00Z', ended_at: '2026-02-10T10:30:00Z' },
      { started_at: '2026-02-10T11:00:00Z', ended_at: null },
    ];
    expect(computeAvgDuration(sessions)).toBe(30);
  });

  it('returns 0 for empty array', () => {
    expect(computeAvgDuration([])).toBe(0);
  });
});

describe('formatCents', () => {
  it('formats 3900 to "$39.00"', () => {
    expect(formatCents(3900)).toBe('$39.00');
  });

  it('formats 0 to "$0.00"', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats 29900 to "$299.00"', () => {
    expect(formatCents(29900)).toBe('$299.00');
  });
});

describe('formatPercent', () => {
  it('formats 0.231 to "23.1%"', () => {
    expect(formatPercent(0.231)).toBe('23.1%');
  });

  it('formats 0 to "0.0%"', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats 1 to "100.0%"', () => {
    expect(formatPercent(1)).toBe('100.0%');
  });
});

describe('relativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "just now" for < 60 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(relativeTime(new Date(now - 30_000).toISOString())).toBe('just now');
  });

  it('returns "5m ago" for 5 minutes ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
  });

  it('returns "2h ago" for 2 hours ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(relativeTime(new Date(now - 2 * 3600_000).toISOString())).toBe('2h ago');
  });

  it('returns "3d ago" for 3 days ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(relativeTime(new Date(now - 3 * 86400_000).toISOString())).toBe('3d ago');
  });
});
