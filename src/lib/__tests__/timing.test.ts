import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 'server-only' since timing.ts imports it
vi.mock('server-only', () => ({}));

import { createTimingContext } from '../timing';

describe('createTimingContext', () => {
  let nowMs: number;

  beforeEach(() => {
    nowMs = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a span with start and end', () => {
    const timing = createTimingContext();
    timing.start('rag');
    nowMs += 42;
    timing.end('rag');

    const spans = timing.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('rag');
    expect(spans[0].durationMs).toBe(42);
  });

  it('toJSON() returns rounded durations keyed by name', () => {
    const timing = createTimingContext();

    timing.start('llm.assessment');
    nowMs += 123.7;
    timing.end('llm.assessment');

    timing.start('llm.examiner');
    nowMs += 456.2;
    timing.end('llm.examiner');

    expect(timing.toJSON()).toEqual({
      'llm.assessment': 124,
      'llm.examiner': 456,
    });
  });

  it('returns null for unclosed spans', () => {
    const timing = createTimingContext();
    timing.start('unclosed');

    expect(timing.toJSON()).toEqual({ unclosed: null });
  });

  it('supports multiple spans with the same name (nested)', () => {
    const timing = createTimingContext();

    timing.start('db');
    nowMs += 10;
    timing.start('db'); // nested
    nowMs += 20;
    timing.end('db'); // closes inner
    nowMs += 5;
    timing.end('db'); // closes outer

    const spans = timing.getSpans();
    expect(spans).toHaveLength(2);
    expect(spans[1].durationMs).toBe(20); // inner
    expect(spans[0].durationMs).toBe(35); // outer
  });

  it('end() on unknown span is a no-op', () => {
    const timing = createTimingContext();
    timing.end('nonexistent');
    expect(timing.getSpans()).toHaveLength(0);
  });

  it('getSpans() returns empty array when nothing recorded', () => {
    const timing = createTimingContext();
    expect(timing.getSpans()).toEqual([]);
    expect(timing.toJSON()).toEqual({});
  });
});
