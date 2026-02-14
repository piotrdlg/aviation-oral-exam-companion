import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ChunkSearchResult {
  id: string;
  document_id: string;
  heading: string | null;
  content: string;
  page_start: number | null;
  page_end: number | null;
  doc_title: string;
  doc_abbreviation: string;
  score: number;
}

/**
 * Generate an embedding for a text query using OpenAI's text-embedding-3-small.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Search source chunks using hybrid vector + FTS search.
 * Uses the chunk_hybrid_search RPC function.
 */
export async function searchChunks(
  query: string,
  options: {
    matchCount?: number;
    similarityThreshold?: number;
    filterDocType?: string;
    filterAbbreviation?: string;
  } = {}
): Promise<ChunkSearchResult[]> {
  const {
    matchCount = 6,
    similarityThreshold = 0.3,
    filterDocType,
    filterAbbreviation,
  } = options;

  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('chunk_hybrid_search', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
    filter_doc_type: filterDocType ?? null,
    filter_abbreviation: filterAbbreviation ?? null,
  });

  if (error) {
    console.error('RAG search error:', error.message);
    return [];
  }

  return (data ?? []) as ChunkSearchResult[];
}

/**
 * Format search results into a context string for LLM prompts.
 */
export function formatChunksForPrompt(chunks: ChunkSearchResult[]): string {
  if (chunks.length === 0) return '';

  return chunks
    .map((chunk, i) => {
      const source = chunk.doc_abbreviation.toUpperCase();
      const pages = chunk.page_start
        ? chunk.page_end && chunk.page_end !== chunk.page_start
          ? `pp.${chunk.page_start}-${chunk.page_end}`
          : `p.${chunk.page_start}`
        : '';
      const heading = chunk.heading ? ` — ${chunk.heading}` : '';
      return `[${i + 1}] ${source}${heading}${pages ? ` (${pages})` : ''}\n${chunk.content}`;
    })
    .join('\n\n');
}

/**
 * Generate embeddings for an array of texts in batches.
 * Returns embeddings in the same order as input texts.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 100
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });

    // Sort by index to maintain order
    const sorted = response.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((d) => d.embedding));
  }

  return allEmbeddings;
}
