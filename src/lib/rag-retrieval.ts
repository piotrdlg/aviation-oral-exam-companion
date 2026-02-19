import 'server-only';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Embedding cache helpers
// ---------------------------------------------------------------------------

/** Normalize a query for cache key stability: lowercase, collapse whitespace, trim. */
function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** SHA-256 hex hash of the normalized query text. */
function queryHash(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

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
 * Checks the DB embedding_cache first. On miss, calls OpenAI and upserts the cache.
 * The cache key is SHA-256(lowercase + whitespace-collapsed text).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const normalized = normalizeQuery(text);
  const hash = queryHash(normalized);

  // 1. Check cache
  try {
    const { data: cached } = await supabase
      .from('embedding_cache')
      .select('embedding')
      .eq('query_hash', hash)
      .maybeSingle();

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
  } catch {
    // Cache read failed — fall through to OpenAI (cache is non-critical)
  }

  // 2. Cache miss → call OpenAI
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  const embedding = response.data[0].embedding;

  // 3. Upsert cache (non-blocking)
  supabase
    .from('embedding_cache')
    .upsert({
      query_hash: hash,
      normalized_query: normalized.slice(0, 1000), // cap for storage
      embedding: embedding as unknown as string,
      model: 'text-embedding-3-small',
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'query_hash' })
    .then(({ error }) => {
      if (error) console.error('embedding_cache upsert error:', error.message);
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
  } = {}
): Promise<ChunkSearchResult[]> {
  const {
    matchCount = 6,
    similarityThreshold = 0.3,
    filterDocType,
    filterAbbreviation,
  } = options;

  // Skip embedding calls for trivially short queries
  if (query.trim().length < 3) return [];

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
  chunkIds: string[]
): Promise<ImageResult[]> {
  if (chunkIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_images_for_chunks', {
    chunk_ids: chunkIds,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

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
