-- ============================================================
-- Migration: source_documents + source_chunks + transcript_citations
-- RAG substrate for grounding AI examiner in FAA source material
-- ============================================================

-- 1. Source Documents (PDF registry)
CREATE TABLE source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                -- "Ch 7 — Safety of Flight"
  faa_number TEXT,                    -- "AIM", "FAA-H-8083-25B"
  abbreviation TEXT NOT NULL,         -- "aim", "phak", "ifh"
  document_type TEXT NOT NULL CHECK (document_type IN
    ('handbook','ac','cfr','aim','other')),
  chapter_number INT,
  chapter_title TEXT,
  file_name TEXT NOT NULL,            -- "aim_07_ch7.pdf"
  total_pages INT,
  storage_path TEXT,                  -- Supabase Storage path (optional)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_source_docs_abbrev ON source_documents (abbreviation);
CREATE INDEX idx_source_docs_type ON source_documents (document_type);

-- 2. Source Chunks (extracted text + embeddings for RAG)
CREATE TABLE source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  heading TEXT,                       -- section heading if available
  content TEXT NOT NULL,              -- ~500-1000 tokens
  content_hash TEXT,                  -- SHA-256 for detecting re-ingestion
  page_start INT,
  page_end INT,
  embedding VECTOR(1536),
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  embedding_dim INT DEFAULT 1536,
  embedding_status TEXT DEFAULT 'current'
    CHECK (embedding_status IN ('current', 'stale')),
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED,
  extraction_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_chunk_per_doc UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_chunks_document ON source_chunks (document_id);
CREATE INDEX idx_chunks_embedding ON source_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_fts ON source_chunks USING GIN (fts);
CREATE INDEX idx_chunks_order ON source_chunks (document_id, chunk_index);

-- 3. Transcript Citations (chunk references per exchange)
CREATE TABLE transcript_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES session_transcripts(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES source_chunks(id),
  rank INT NOT NULL,
  score FLOAT,
  snippet TEXT,                       -- short extracted quote for UI display
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_citations_transcript ON transcript_citations (transcript_id);
CREATE INDEX idx_citations_chunk ON transcript_citations (chunk_id);

-- ============================================================
-- RLS Policies
-- ============================================================

-- source_documents: readable by all authenticated
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source_docs_read" ON source_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "source_docs_admin_insert" ON source_documents
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- source_chunks: readable by all authenticated
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source_chunks_read" ON source_chunks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "source_chunks_admin_insert" ON source_chunks
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- transcript_citations: via session ownership (through transcript -> session)
ALTER TABLE transcript_citations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "citations_user_select" ON transcript_citations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM session_transcripts st
    JOIN exam_sessions es ON es.id = st.session_id
    WHERE st.id = transcript_id AND es.user_id = auth.uid()
  ));
CREATE POLICY "citations_user_insert" ON transcript_citations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM session_transcripts st
    JOIN exam_sessions es ON es.id = st.session_id
    WHERE st.id = transcript_id AND es.user_id = auth.uid()
  ));

-- ============================================================
-- RPC: chunk_hybrid_search — RAG retrieval
-- ============================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
