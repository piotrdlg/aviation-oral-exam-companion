-- ============================================================
-- Migration: two-stage chunk_hybrid_search (W5.2)
-- ============================================================
-- Fixes review-03 finding 3: the old single-pass query computed the blended
-- score over EVERY chunk and ordered by it, so the HNSW index on
-- source_chunks.embedding was bypassed (the planner cannot use a vector
-- index to order by a blended expression). Stage 1 collects candidates via
-- two index-friendly scans (pure vector ORDER BY <=> LIMIT 50 → HNSW;
-- FTS @@ match → GIN); stage 2 blends/re-ranks only the candidate union
-- with the existing 65/35 weights and threshold. Signature unchanged.
--
-- Also fixes finding 4: chunks whose embedding_status = 'stale' (re-ingested
-- text whose embedding was not yet recomputed) are excluded — a stale vector
-- silently mis-ranks against the CURRENT text it no longer represents.

CREATE OR REPLACE FUNCTION chunk_hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 6,
  similarity_threshold FLOAT DEFAULT 0.3,
  filter_doc_type TEXT DEFAULT NULL,
  filter_abbreviation TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  heading TEXT,
  content TEXT,
  page_start INT,
  page_end INT,
  doc_title TEXT,
  doc_abbreviation TEXT,
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH vec_candidates AS (
    -- HNSW-eligible: pure distance ordering, no blended expression
    SELECT sc.id
    FROM source_chunks sc
    JOIN source_documents sd ON sd.id = sc.document_id
    WHERE sc.embedding IS NOT NULL
      AND sc.embedding_status IS DISTINCT FROM 'stale'
      AND (filter_doc_type IS NULL OR sd.document_type = filter_doc_type)
      AND (filter_abbreviation IS NULL OR sd.abbreviation = filter_abbreviation)
    ORDER BY sc.embedding <=> query_embedding
    LIMIT 50
  ),
  fts_candidates AS (
    -- GIN-eligible: text-match candidates the vector scan may have missed
    SELECT sc.id
    FROM source_chunks sc
    JOIN source_documents sd ON sd.id = sc.document_id
    WHERE sc.fts @@ plainto_tsquery('english', query_text)
      AND sc.embedding IS NOT NULL
      AND sc.embedding_status IS DISTINCT FROM 'stale'
      AND (filter_doc_type IS NULL OR sd.document_type = filter_doc_type)
      AND (filter_abbreviation IS NULL OR sd.abbreviation = filter_abbreviation)
    ORDER BY ts_rank(sc.fts, plainto_tsquery('english', query_text)) DESC
    LIMIT 50
  ),
  candidates AS (
    SELECT vc.id FROM vec_candidates vc
    UNION
    SELECT fc.id FROM fts_candidates fc
  )
  SELECT
    sc.id,
    sc.document_id,
    sc.heading,
    sc.content,
    sc.page_start,
    sc.page_end,
    sd.title AS doc_title,
    sd.abbreviation AS doc_abbreviation,
    (
      0.65 * (1 - (sc.embedding <=> query_embedding))
      + 0.35 * (ts_rank(sc.fts, plainto_tsquery('english', query_text))
                / (1 + ts_rank(sc.fts, plainto_tsquery('english', query_text))))
    )::FLOAT AS score
  FROM candidates c
  JOIN source_chunks sc ON sc.id = c.id
  JOIN source_documents sd ON sd.id = sc.document_id
  WHERE (1 - (sc.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
