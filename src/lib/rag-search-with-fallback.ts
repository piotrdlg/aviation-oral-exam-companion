import { searchChunks, type ChunkSearchResult } from './rag-retrieval';
import { inferRagFilters, type RagFilterHint } from './rag-filters';

/** Minimal timing interface to avoid importing 'server-only' transitively. */
interface TimingLike {
  start(name: string): void;
  end(name: string): void;
}

/**
 * Two-pass RAG search with metadata filtering and safe fallback.
 *
 * Pass 1: Search with inferred metadata filters (if any and if feature enabled).
 * Pass 2: If Pass 1 returns too few results or low scores, search without filters.
 * Merge, deduplicate by chunk ID, return top K.
 */
export async function searchWithFallback(
  query: string,
  options: {
    matchCount?: number;
    similarityThreshold?: number;
    filterHint?: RagFilterHint | null;
    featureEnabled?: boolean;
    timing?: TimingLike;
  } = {}
): Promise<ChunkSearchResult[]> {
  const {
    matchCount = 6,
    similarityThreshold = 0.3,
    filterHint,
    featureEnabled = false,
    timing,
  } = options;

  // If filtering disabled or no filter hint, just do normal search
  if (!featureEnabled || !filterHint) {
    return searchChunks(query, { matchCount, similarityThreshold, timing });
  }

  // Pass 1: filtered search
  timing?.start('rag.search.filtered');
  const filtered = await searchChunks(query, {
    matchCount,
    similarityThreshold,
    filterDocType: filterHint.filterDocType,
    filterAbbreviation: filterHint.filterAbbreviation,
    timing,
  });
  timing?.end('rag.search.filtered');

  const MIN_RESULTS = 2;
  const MIN_TOP_SCORE = 0.4;

  // If filtered results are adequate, return them
  if (filtered.length >= MIN_RESULTS && (filtered[0]?.score ?? 0) >= MIN_TOP_SCORE) {
    return filtered;
  }

  // Pass 2: unfiltered fallback
  timing?.start('rag.search.unfiltered_fallback');
  const unfiltered = await searchChunks(query, { matchCount, similarityThreshold, timing });
  timing?.end('rag.search.unfiltered_fallback');

  // Merge + deduplicate by chunk id
  const seen = new Set(filtered.map((c) => c.id));
  const merged = [...filtered];
  for (const chunk of unfiltered) {
    if (!seen.has(chunk.id)) {
      merged.push(chunk);
      seen.add(chunk.id);
    }
  }

  // Return top K by score
  return merged.sort((a, b) => b.score - a.score).slice(0, matchCount);
}

// Re-export inferRagFilters for convenience so callers only need one import
export { inferRagFilters };
export type { RagFilterHint };
