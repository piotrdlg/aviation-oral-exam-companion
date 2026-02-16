-- Image Augmentation: source_images + chunk_image_links tables
-- Design doc: docs/plans/2026-02-15-image-augmentation-design.md (Section 4)

-- ============================================================
-- Table: source_images — extracted images from FAA source PDFs
-- ============================================================
CREATE TABLE source_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  figure_label TEXT,
  caption TEXT,
  image_category TEXT NOT NULL DEFAULT 'general'
    CHECK (image_category IN (
      'diagram', 'chart', 'table', 'instrument',
      'weather', 'performance', 'sectional', 'airport', 'general'
    )),
  storage_path TEXT NOT NULL
    CHECK (storage_path !~ '^/' AND storage_path NOT LIKE '%..%'
           AND storage_path ~ '^[a-z0-9/\-\.]+$'),
  width INT NOT NULL,
  height INT NOT NULL,
  file_size_bytes INT,
  content_hash TEXT,
  format TEXT NOT NULL DEFAULT 'png'
    CHECK (format IN ('png', 'jpeg', 'webp')),
  extraction_method TEXT NOT NULL
    CHECK (extraction_method IN ('embedded', 'page_render', 'region_crop')),
  bbox_x0 FLOAT,
  bbox_y0 FLOAT,
  bbox_x1 FLOAT,
  bbox_y1 FLOAT,
  quality_score FLOAT,
  is_oral_exam_relevant BOOLEAN DEFAULT TRUE,
  description TEXT,
  description_model TEXT,
  described_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Table: chunk_image_links — text chunk <-> image mapping
-- ============================================================
CREATE TABLE chunk_image_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES source_images(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL
    CHECK (link_type IN ('figure_ref', 'same_page', 'caption_match', 'manual')),
  relevance_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chunk_id, image_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_source_images_document ON source_images(document_id);
CREATE INDEX idx_source_images_category ON source_images(image_category);
CREATE INDEX idx_source_images_figure ON source_images(figure_label);
CREATE INDEX idx_source_images_page ON source_images(document_id, page_number);
CREATE INDEX idx_source_images_relevant ON source_images(is_oral_exam_relevant) WHERE is_oral_exam_relevant = TRUE;
CREATE INDEX idx_source_images_hash ON source_images(content_hash);

CREATE INDEX idx_chunk_image_links_chunk ON chunk_image_links(chunk_id);
CREATE INDEX idx_chunk_image_links_image ON chunk_image_links(image_id);
CREATE INDEX idx_chunk_image_links_type ON chunk_image_links(link_type);

-- ============================================================
-- RLS: Read-only for authenticated, service-role-only writes
-- ============================================================
ALTER TABLE source_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read images"
  ON source_images FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE chunk_image_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read chunk-image links"
  ON chunk_image_links FOR SELECT
  TO authenticated
  USING (true);

-- Defense-in-depth: explicitly revoke write privileges
REVOKE INSERT, UPDATE, DELETE ON source_images FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON chunk_image_links FROM authenticated, anon;

-- ============================================================
-- RPC: get_images_for_chunks — retrieve linked images for RAG chunks
-- ============================================================
CREATE OR REPLACE FUNCTION get_images_for_chunks(
  chunk_ids UUID[],
  supabase_url TEXT DEFAULT current_setting('app.settings.supabase_url', true)
)
RETURNS TABLE (
  image_id UUID,
  figure_label TEXT,
  caption TEXT,
  image_category TEXT,
  public_url TEXT,
  width INT,
  height INT,
  description TEXT,
  doc_abbreviation TEXT,
  page_number INT,
  link_type TEXT,
  relevance_score FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (si.id)
    si.id AS image_id,
    si.figure_label,
    si.caption,
    si.image_category,
    CASE
      WHEN coalesce(supabase_url, current_setting('app.settings.supabase_url', true)) IS NULL
        THEN NULL
      ELSE concat(
        coalesce(supabase_url, current_setting('app.settings.supabase_url', true)),
        '/storage/v1/object/public/source-images/',
        si.storage_path
      )
    END AS public_url,
    si.width,
    si.height,
    si.description,
    sd.abbreviation AS doc_abbreviation,
    si.page_number,
    cil.link_type,
    cil.relevance_score
  FROM chunk_image_links cil
  JOIN source_images si ON si.id = cil.image_id
  JOIN source_documents sd ON sd.id = si.document_id
  WHERE cil.chunk_id = ANY(chunk_ids)
    AND si.is_oral_exam_relevant = TRUE
  ORDER BY si.id,
    CASE cil.link_type
      WHEN 'figure_ref' THEN 3
      WHEN 'caption_match' THEN 2
      WHEN 'same_page' THEN 1
      WHEN 'manual' THEN 0
    END DESC,
    cil.relevance_score DESC,
    cil.created_at DESC;
$$;
