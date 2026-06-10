import { describe, it, expect } from 'vitest';
import {
  blendAdjacency,
  structuralPrior,
  cosineSimilarity,
  jaccard,
  buildAdjacencyRows,
  connectedWalkByAdjacency,
  ADJACENCY_TOP_K,
  type AdjacencyNeighbors,
} from '../element-adjacency';
import { buildElementQueue, type AcsElementDB, type SessionConfig } from '../exam-logic';

describe('blendAdjacency (design §3: 0.60/0.25/0.15)', () => {
  it('applies the exact design weights', () => {
    expect(blendAdjacency({ embedding: 1, cooccurrence: 0, structural: 0 })).toBeCloseTo(0.6);
    expect(blendAdjacency({ embedding: 0, cooccurrence: 1, structural: 0 })).toBeCloseTo(0.25);
    expect(blendAdjacency({ embedding: 0, cooccurrence: 0, structural: 1 })).toBeCloseTo(0.15);
    expect(blendAdjacency({ embedding: 1, cooccurrence: 1, structural: 1 })).toBeCloseTo(1.0);
    expect(blendAdjacency({ embedding: 0.8, cooccurrence: 0.4, structural: 0.5 })).toBeCloseTo(0.655);
  });
});

describe('structuralPrior', () => {
  it('same task = 1.0, same area = 0.5, cross-area = 0', () => {
    expect(structuralPrior('PA.I.A.K1', 'PA.I.A.R2')).toBe(1.0);
    expect(structuralPrior('PA.I.A.K1', 'PA.I.B.K4')).toBe(0.5);
    expect(structuralPrior('PA.I.A.K1', 'PA.VI.A.K1')).toBe(0);
    expect(structuralPrior('PA.I.A.K1', 'CA.I.A.K1')).toBe(0); // cross-rating
  });
});

describe('similarity primitives', () => {
  it('cosine of identical vectors is 1; orthogonal is 0', () => {
    expect(cosineSimilarity([1, 0, 2], [1, 0, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('jaccard handles empty and overlapping sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(['a']), new Set(['a']))).toBe(1);
  });
});

function item(code: string, embedding: number[], chunks: string[]) {
  return { code, embedding, chunkIds: new Set(chunks) };
}

describe('buildAdjacencyRows', () => {
  // Embeddings constructed so A≈B, both far from C
  const A = item('PA.I.A.K1', [1, 0, 0.1], ['c1', 'c2']);
  const B = item('PA.I.A.K2', [0.95, 0.05, 0.1], ['c2', 'c3']);
  const C = item('PA.VI.B.K1', [0, 1, 0], ['c9']);

  it('keeps only pairs at or above the 0.35 threshold, sorted by score', () => {
    const rows = buildAdjacencyRows([A, B, C]);
    const aRows = rows.filter((r) => r.element_code === 'PA.I.A.K1');
    expect(aRows.map((r) => r.related_code)).toEqual(['PA.I.A.K2']); // C is below threshold
    expect(aRows[0].score).toBeGreaterThanOrEqual(0.35);
    expect(aRows[0].signals.structural).toBe(1.0);
  });

  it('honors the stoplist (order-independent pair key)', () => {
    const stop = new Set(['PA.I.A.K1|PA.I.A.K2']);
    const rows = buildAdjacencyRows([A, B, C], { stoplist: stop });
    expect(rows.filter((r) => r.element_code === 'PA.I.A.K1')).toHaveLength(0);
    expect(rows.filter((r) => r.element_code === 'PA.I.A.K2')).toHaveLength(0);
  });

  it('caps neighbors at top-K', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item(`PA.I.A.K${i}`, [1, i * 0.001, 0], ['c1'])
    );
    const rows = buildAdjacencyRows(many);
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.element_code, (counts.get(r.element_code) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(ADJACENCY_TOP_K);
  });
});

describe('connectedWalkByAdjacency', () => {
  const neighbors: AdjacencyNeighbors = new Map([
    ['A', [{ code: 'B', score: 0.9 }, { code: 'C', score: 0.5 }]],
    ['B', [{ code: 'A', score: 0.9 }, { code: 'D', score: 0.7 }]],
    ['C', [{ code: 'A', score: 0.5 }]],
    ['D', [{ code: 'B', score: 0.7 }]],
  ]);

  it('walks highest-scored neighbors first from the start', () => {
    expect(connectedWalkByAdjacency(['A', 'B', 'C', 'D'], neighbors, 'A')).toEqual(['A', 'B', 'D', 'C']);
  });

  it('every code appears exactly once', () => {
    const out = connectedWalkByAdjacency(['A', 'B', 'C', 'D', 'X'], neighbors, 'A');
    expect([...out].sort()).toEqual(['A', 'B', 'C', 'D', 'X']);
  });

  it('codes without adjacency rows are appended at the end', () => {
    const out = connectedWalkByAdjacency(['X', 'A', 'B'], neighbors, 'A');
    expect(out[out.length - 1]).toBe('X');
  });

  it('returns input unchanged when no code has neighbors', () => {
    expect(connectedWalkByAdjacency(['X', 'Y'], new Map())).toEqual(['X', 'Y']);
  });
});

describe('buildElementQueue adjacency integration (W5.3, flag-gated)', () => {
  const elements = [
    { code: 'PA.I.A.K1', task_id: 'PA.I.A', element_type: 'knowledge', difficulty_default: 'medium', order_index: 1 },
    { code: 'PA.I.A.K2', task_id: 'PA.I.A', element_type: 'knowledge', difficulty_default: 'medium', order_index: 2 },
    { code: 'PA.VI.A.K1', task_id: 'PA.VI.A', element_type: 'knowledge', difficulty_default: 'medium', order_index: 3 },
    { code: 'PA.VIII.A.K1', task_id: 'PA.VIII.A', element_type: 'knowledge', difficulty_default: 'medium', order_index: 4 },
  ] as unknown as AcsElementDB[];
  const config = {
    rating: 'private', studyMode: 'cross_acs', difficulty: 'mixed',
    selectedAreas: ['I', 'VI', 'VIII'], selectedTasks: [],
  } as unknown as SessionConfig;

  it('uses the adjacency walk when neighbors are provided (flag ON path)', () => {
    // Adjacency chains VI.A.K1 → VIII.A.K1 with top score, so they must be
    // consecutive — impossible to guarantee under the random-shuffle fallback.
    const neighbors: AdjacencyNeighbors = new Map([
      ['PA.I.A.K1', [{ code: 'PA.I.A.K2', score: 0.9 }]],
      ['PA.I.A.K2', [{ code: 'PA.VI.A.K1', score: 0.8 }]],
      ['PA.VI.A.K1', [{ code: 'PA.VIII.A.K1', score: 0.95 }]],
      ['PA.VIII.A.K1', [{ code: 'PA.VI.A.K1', score: 0.95 }]],
    ]);
    for (let i = 0; i < 10; i++) {
      const queue = buildElementQueue(elements, config, undefined, undefined, neighbors);
      const vi = queue.indexOf('PA.VI.A.K1');
      const viii = queue.indexOf('PA.VIII.A.K1');
      expect(Math.abs(vi - viii)).toBe(1); // always consecutive under adjacency walk
      expect([...queue].sort()).toEqual(elements.map((e) => e.code).sort());
    }
  });

  it('flag OFF path (no neighbors passed) is unchanged: all codes present', () => {
    const queue = buildElementQueue(elements, config, undefined, undefined, undefined);
    expect([...queue].sort()).toEqual(elements.map((e) => e.code).sort());
  });
});
