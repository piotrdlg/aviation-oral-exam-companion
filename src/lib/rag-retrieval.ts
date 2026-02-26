import 'server-only';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

/** Minimal timing interface to avoid coupling to timing.ts imports. */
interface TimingLike {
  start(name: string): void;
  end(name: string): void;
}

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

/** Normalize query text for consistent cache keys. */
function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** SHA-256 hex hash of the normalized query. */
function queryHash(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate an embedding for a text query using OpenAI's text-embedding-3-small.
 * Checks the DB-backed embedding_cache first to avoid redundant API calls.
 */
export async function generateEmbedding(text: string, timing?: TimingLike): Promise<number[]> {
  const normalized = normalizeQuery(text);
  const hash = queryHash(normalized);

  // Check DB cache
  timing?.start('rag.embedding.cache_check');
  const { data: cached } = await supabase
    .from('embedding_cache')
    .select('embedding')
    .eq('query_hash', hash)
    .single();
  timing?.end('rag.embedding.cache_check');

  if (cached?.embedding) {
    // Touch last_used_at (non-blocking)
    supabase
      .from('embedding_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('query_hash', hash)
      .then(({ error }) => {
        if (error) console.error('embedding_cache touch error:', error.message);
      });
    return cached.embedding as unknown as number[];
  }

  // Cache miss — call OpenAI
  timing?.start('rag.embedding.openai');
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  const embedding = response.data[0].embedding;
  timing?.end('rag.embedding.openai');

  // Write to cache (non-blocking)
  supabase
    .from('embedding_cache')
    .upsert({
      query_hash: hash,
      normalized_query: normalized,
      embedding: embedding as unknown as string,
      model: 'text-embedding-3-small',
    })
    .then(({ error }) => {
      if (error) console.error('embedding_cache write error:', error.message);
    });

  return embedding;
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
    timing?: TimingLike;
  } = {}
): Promise<ChunkSearchResult[]> {
  const {
    matchCount = 6,
    similarityThreshold = 0.3,
    filterDocType,
    filterAbbreviation,
    timing,
  } = options;

  // Skip embedding calls for trivially short queries
  if (query.trim().length < 3) return [];

  timing?.start('rag.embedding');
  const queryEmbedding = await generateEmbedding(query, timing);
  timing?.end('rag.embedding');

  timing?.start('rag.hybridSearch');
  const { data, error } = await supabase.rpc('chunk_hybrid_search', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
    filter_doc_type: filterDocType ?? null,
    filter_abbreviation: filterAbbreviation ?? null,
  });
  timing?.end('rag.hybridSearch');

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

// ---------------------------------------------------------------------------
// Image retrieval (linked to RAG chunks)
// ---------------------------------------------------------------------------

export interface ImageResult {
  image_id: string;
  figure_label: string | null;
  caption: string | null;
  image_category: string;
  public_url: string;
  width: number;
  height: number;
  description: string | null;
  doc_abbreviation: string;
  page_number: number;
  link_type: string;
  relevance_score: number;
}

/**
 * Fetch linked images for a set of RAG chunk IDs.
 * Uses the get_images_for_chunks RPC (returns deduplicated, priority-ordered images).
 */
export async function getImagesForChunks(
  chunkIds: string[],
  timing?: TimingLike
): Promise<ImageResult[]> {
  if (chunkIds.length === 0) return [];

  timing?.start('rag.imageSearch');
  const { data, error } = await supabase.rpc('get_images_for_chunks', {
    chunk_ids: chunkIds,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  timing?.end('rag.imageSearch');

  if (error) {
    console.error('getImagesForChunks RPC failed:', error.message, { chunkCount: chunkIds.length });
    return [];
  }

  const results = (data ?? []) as ImageResult[];
  const valid = results.filter(img => img.public_url != null);
  if (valid.length < results.length) {
    console.warn(`${results.length - valid.length} images had NULL public_url (check app.settings.supabase_url)`);
  }
  return valid;
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
