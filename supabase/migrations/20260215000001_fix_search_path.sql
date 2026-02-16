-- Fix SECURITY DEFINER function: add SET search_path to prevent object-shadowing attacks
-- See: https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY

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
  FROM source_chunks sc
  JOIN source_documents sd ON sd.id = sc.document_id
  WHERE sc.embedding IS NOT NULL
    AND (1 - (sc.embedding <=> query_embedding)) > similarity_threshold
    AND (filter_doc_type IS NULL OR sd.document_type = filter_doc_type)
    AND (filter_abbreviation IS NULL OR sd.abbreviation = filter_abbreviation)
  ORDER BY score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
