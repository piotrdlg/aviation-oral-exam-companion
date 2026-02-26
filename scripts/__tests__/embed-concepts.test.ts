import { describe, it, expect } from 'vitest';
import { buildEmbeddingText, batchArray } from '../embed-concepts';

describe('buildEmbeddingText', () => {
  it('constructs text from concept fields correctly', () => {
    const result = buildEmbeddingText({
      name: 'Airspace Classification',
      content: 'The FAA classifies airspace into several categories.',
      key_facts: ['Class A starts at FL180', 'Class B requires ATC clearance'],
    });

    expect(result).toBe(
      'Airspace Classification The FAA classifies airspace into several categories. ' +
        '["Class A starts at FL180","Class B requires ATC clearance"]'
    );
  });

  it('handles empty key_facts gracefully', () => {
    const result = buildEmbeddingText({
      name: 'VOR Navigation',
      content: 'VOR stations provide radial-based navigation.',
      key_facts: [],
    });

    expect(result).toBe('VOR Navigation VOR stations provide radial-based navigation.');
    expect(result).not.toContain('[]');
  });

  it('handles null key_facts gracefully', () => {
    const result = buildEmbeddingText({
      name: 'ATIS',
      content: 'Automatic Terminal Information Service.',
      key_facts: null,
    });

    expect(result).toBe('ATIS Automatic Terminal Information Service.');
  });

  it('handles null content', () => {
    const result = buildEmbeddingText({
      name: 'Stall Speed',
      content: null,
      key_facts: ['Vs increases with bank angle'],
    });

    expect(result).toBe('Stall Speed ["Vs increases with bank angle"]');
  });

  it('handles empty content', () => {
    const result = buildEmbeddingText({
      name: 'Weight and Balance',
      content: '   ',
      key_facts: ['CG must be within limits'],
    });

    expect(result).toBe('Weight and Balance ["CG must be within limits"]');
    expect(result).not.toContain('   ');
  });

  it('returns only name when content and key_facts are both empty/null', () => {
    const result = buildEmbeddingText({
      name: 'Empty Concept',
      content: null,
      key_facts: null,
    });

    expect(result).toBe('Empty Concept');
  });

  it('returns only name when content is empty string and key_facts is empty array', () => {
    const result = buildEmbeddingText({
      name: 'Bare Concept',
      content: '',
      key_facts: [],
    });

    expect(result).toBe('Bare Concept');
  });
});

describe('batchArray', () => {
  it('splits an array into batches of the given size', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const batches = batchArray(items, 3);

    expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('returns a single batch when items fit within batch size', () => {
    const items = ['a', 'b', 'c'];
    const batches = batchArray(items, 5);

    expect(batches).toEqual([['a', 'b', 'c']]);
  });

  it('returns empty array for empty input', () => {
    const batches = batchArray([], 10);

    expect(batches).toEqual([]);
  });

  it('handles batch size of 1', () => {
    const items = [10, 20, 30];
    const batches = batchArray(items, 1);

    expect(batches).toEqual([[10], [20], [30]]);
  });

  it('handles exact multiple of batch size', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const batches = batchArray(items, 3);

    expect(batches).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('produces batches with correct total element count', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const batches = batchArray(items, 100);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);

    const total = batches.reduce((sum, b) => sum + b.length, 0);
    expect(total).toBe(250);
  });
});
