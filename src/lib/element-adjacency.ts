/**
 * Element adjacency — the Scenario Engine's relatedness layer (W5.3).
 *
 * Replaces both the dropped graph traversal (W5.1/D4) and keyword-Jaccard
 * structural fingerprints with a precomputed, inspectable, CFI-auditable
 * table of related ACS elements. Design: docs/plans/2026-06-09-scenario-
 * engine-design.md §3.
 *
 * This module is PURE math (no IO) so the offline build script
 * (scripts/pipeline/build-element-adjacency.ts), the planner integration,
 * and the unit tests all share one implementation.
 */

export interface AdjacencySignals {
  embedding: number;     // cosine similarity of element embeddings
  cooccurrence: number;  // Jaccard over top-10 retrieved chunk-id sets
  structural: number;    // same task 1.0 / same area 0.5 / else 0
}

export interface AdjacencyRow {
  element_code: string;
  related_code: string;
  score: number;
  signals: AdjacencySignals;
}

/** Per design §3: 0.60 embedding + 0.25 co-occurrence + 0.15 structural. */
export const ADJACENCY_WEIGHTS = { embedding: 0.6, cooccurrence: 0.25, structural: 0.15 } as const;
export const ADJACENCY_TOP_K = 12;
export const ADJACENCY_MIN_SCORE = 0.35;

export function blendAdjacency(signals: AdjacencySignals): number {
  return (
    ADJACENCY_WEIGHTS.embedding * signals.embedding +
    ADJACENCY_WEIGHTS.cooccurrence * signals.cooccurrence +
    ADJACENCY_WEIGHTS.structural * signals.structural
  );
}

/**
 * Structural prior from ACS codes: "PA.I.A.K1" → task "PA.I.A", area "PA.I".
 * Same task: 1.0; same area: 0.5; otherwise 0.
 */
export function structuralPrior(codeA: string, codeB: string): number {
  const a = codeA.split('.');
  const b = codeB.split('.');
  if (a.length < 4 || b.length < 4) return 0;
  if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) return 1.0;
  if (a[0] === b[0] && a[1] === b[1]) return 0.5;
  return 0;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface AdjacencyBuildItem {
  code: string;
  embedding: number[];
  chunkIds: Set<string>;
}

/**
 * Compute the full adjacency rows for one rating's elements.
 * stoplist entries are "CODE_A|CODE_B" pairs (order-independent).
 */
export function buildAdjacencyRows(
  items: AdjacencyBuildItem[],
  opts?: { topK?: number; minScore?: number; stoplist?: Set<string> }
): AdjacencyRow[] {
  const topK = opts?.topK ?? ADJACENCY_TOP_K;
  const minScore = opts?.minScore ?? ADJACENCY_MIN_SCORE;
  const stoplist = opts?.stoplist ?? new Set<string>();
  const rows: AdjacencyRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const scored: AdjacencyRow[] = [];
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i], b = items[j];
      const pairKey = a.code < b.code ? `${a.code}|${b.code}` : `${b.code}|${a.code}`;
      if (stoplist.has(pairKey)) continue;
      const signals: AdjacencySignals = {
        embedding: round4(cosineSimilarity(a.embedding, b.embedding)),
        cooccurrence: round4(jaccard(a.chunkIds, b.chunkIds)),
        structural: structuralPrior(a.code, b.code),
      };
      const score = round4(blendAdjacency(signals));
      if (score >= minScore) {
        scored.push({ element_code: a.code, related_code: b.code, score, signals });
      }
    }
    scored.sort((x, y) => y.score - x.score);
    rows.push(...scored.slice(0, topK));
  }
  return rows;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Neighbor list shape consumed by the planner and (W5.4) transition policy. */
export type AdjacencyNeighbors = Map<string, Array<{ code: string; score: number }>>;

/**
 * Greedy nearest-neighbor walk over adjacency scores (W5.3 planner mode).
 * Mirrors connectedWalk()'s contract: every input code appears exactly once;
 * codes with no adjacency rows are appended at the end in input order.
 * Deterministic given the same start (no random tie-breaks — adjacency
 * scores are real-valued, ties are vanishingly rare and broken by code).
 */
export function connectedWalkByAdjacency(
  codes: string[],
  neighbors: AdjacencyNeighbors,
  startCode?: string
): string[] {
  if (codes.length <= 1) return [...codes];
  const inQueue = new Set(codes);
  const known = codes.filter((c) => (neighbors.get(c) ?? []).length > 0);
  if (known.length === 0) return [...codes];

  const start = startCode && inQueue.has(startCode) ? startCode : known[0];
  const result: string[] = [start];
  const visited = new Set<string>([start]);

  while (result.length < codes.length) {
    const current = result[result.length - 1];
    // Best unvisited neighbor of the current element (by stored score)
    const next = (neighbors.get(current) ?? [])
      .filter((n) => inQueue.has(n.code) && !visited.has(n.code))
      .sort((x, y) => y.score - x.score || (x.code < y.code ? -1 : 1))[0];

    let chosen: string | undefined = next?.code;
    if (!chosen) {
      // Dead end: jump to the unvisited known element with the highest
      // adjacency to ANY visited element (keeps the walk coherent).
      let best: { code: string; score: number } | null = null;
      for (const candidate of known) {
        if (visited.has(candidate)) continue;
        const backScore = (neighbors.get(candidate) ?? [])
          .filter((n) => visited.has(n.code))
          .reduce((m, n) => Math.max(m, n.score), 0);
        if (!best || backScore > best.score) best = { code: candidate, score: backScore };
      }
      chosen = best?.code;
    }
    if (!chosen) break;
    result.push(chosen);
    visited.add(chosen);
  }

  // Anything not reached (plus fingerprint-less codes) keeps input order.
  const rest = codes.filter((c) => !visited.has(c));
  return [...result, ...rest];
}
