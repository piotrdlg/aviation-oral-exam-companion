import { describe, it, expect } from 'vitest';
import {
  generateTopicSlug,
  parseTopicsResponse,
  computeLevenshtein,
  toKebabCase,
  findFuzzyMatch,
} from '../extract-topics';

// ---------------------------------------------------------------------------
// toKebabCase
// ---------------------------------------------------------------------------

describe('toKebabCase', () => {
  it('converts "Left Turning Tendencies" to "left-turning-tendencies"', () => {
    expect(toKebabCase('Left Turning Tendencies')).toBe('left-turning-tendencies');
  });

  it('handles special characters and multiple spaces', () => {
    expect(toKebabCase('VOR/DME   Navigation & Procedures')).toBe('vordme-navigation-procedures');
  });

  it('truncates to reasonable length', () => {
    const longName =
      'A Very Long Aviation Concept Name That Goes On And On And On And On And On ' +
      'Repeating Many Words Over And Over Until It Exceeds Eighty Characters Easily';
    const result = toKebabCase(longName);
    expect(result.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// generateTopicSlug
// ---------------------------------------------------------------------------

describe('generateTopicSlug', () => {
  it('generates correct format "topic:left-turning-tendencies"', () => {
    expect(generateTopicSlug('Left Turning Tendencies', 'topic')).toBe(
      'topic:left-turning-tendencies',
    );
  });

  it('truncates long names to 100 char max slug', () => {
    const longName =
      'An Extremely Detailed Aviation Concept About Weather Patterns And Their Effects ' +
      'On General Aviation Operations During Winter Flying In Mountainous Terrain Areas';
    const slug = generateTopicSlug(longName, 'definition');
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug).toMatch(/^definition:/);
  });
});

// ---------------------------------------------------------------------------
// computeLevenshtein
// ---------------------------------------------------------------------------

describe('computeLevenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(computeLevenshtein('airspace', 'airspace')).toBe(0);
  });

  it('returns correct distance for simple edits', () => {
    // "kitten" -> "sitting" requires 3 edits
    expect(computeLevenshtein('kitten', 'sitting')).toBe(3);
    // single insertion
    expect(computeLevenshtein('cat', 'cats')).toBe(1);
    // single substitution
    expect(computeLevenshtein('cat', 'bat')).toBe(1);
    // single deletion
    expect(computeLevenshtein('cats', 'cat')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(computeLevenshtein('', '')).toBe(0);
    expect(computeLevenshtein('abc', '')).toBe(3);
    expect(computeLevenshtein('', 'xyz')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// findFuzzyMatch
// ---------------------------------------------------------------------------

describe('findFuzzyMatch', () => {
  it('finds match within threshold', () => {
    const existing = new Set(['Stall Speed', 'Airspace Classification', 'VOR Navigation']);
    // "Stall Speeds" is 1 edit from "Stall Speed" — within default threshold of 3
    const match = findFuzzyMatch('Stall Speeds', existing);
    expect(match).toBe('Stall Speed');
  });

  it('returns null when no match within threshold', () => {
    const existing = new Set(['Stall Speed', 'Airspace Classification']);
    // "Left Turning Tendencies" is far from both existing names
    const match = findFuzzyMatch('Left Turning Tendencies', existing);
    expect(match).toBeNull();
  });

  it('case insensitive matching', () => {
    const existing = new Set(['Stall Speed']);
    // Exact match ignoring case — distance 0, well within threshold
    const match = findFuzzyMatch('stall speed', existing);
    expect(match).toBe('Stall Speed');
  });
});

// ---------------------------------------------------------------------------
// parseTopicsResponse
// ---------------------------------------------------------------------------

describe('parseTopicsResponse', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify([
      {
        name: 'Left Turning Tendencies',
        category: 'topic',
        content: 'Four forces cause an aircraft to yaw left.',
        key_facts: ['Torque', 'P-factor'],
        common_misconceptions: [],
        related_cfr: [],
        aliases: ['Left Turning Forces'],
      },
    ]);
    const result = parseTopicsResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Left Turning Tendencies');
    expect(result[0].category).toBe('topic');
    expect(result[0].content).toBe('Four forces cause an aircraft to yaw left.');
    expect(result[0].key_facts).toEqual(['Torque', 'P-factor']);
    expect(result[0].aliases).toEqual(['Left Turning Forces']);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseTopicsResponse('not valid json')).toEqual([]);
    expect(parseTopicsResponse('{}')).toEqual([]);
    expect(parseTopicsResponse('')).toEqual([]);
  });

  it('handles markdown code fences', () => {
    const fenced =
      '```json\n' +
      JSON.stringify([
        {
          name: 'Airspace',
          category: 'definition',
          content: 'The FAA classifies airspace.',
          key_facts: [],
          common_misconceptions: [],
          related_cfr: ['14 CFR 71'],
          aliases: [],
        },
      ]) +
      '\n```';
    const result = parseTopicsResponse(fenced);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Airspace');
    expect(result[0].category).toBe('definition');
  });

  it('filters out items missing required fields', () => {
    const json = JSON.stringify([
      // Valid
      {
        name: 'Good Concept',
        category: 'procedure',
        content: 'A valid concept.',
        key_facts: [],
        common_misconceptions: [],
        related_cfr: [],
        aliases: [],
      },
      // Missing name
      {
        category: 'topic',
        content: 'Missing name field.',
      },
      // Missing content
      {
        name: 'No Content',
        category: 'topic',
      },
      // Invalid category
      {
        name: 'Bad Category',
        category: 'invalid',
        content: 'Bad category value.',
      },
      // Empty name
      {
        name: '',
        category: 'topic',
        content: 'Empty name.',
      },
      // Empty content
      {
        name: 'Empty Content',
        category: 'topic',
        content: '',
      },
    ]);
    const result = parseTopicsResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Good Concept');
  });
});
