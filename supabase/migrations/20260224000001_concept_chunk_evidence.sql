-- concept_chunk_evidence: Links concept nodes to their source evidence chunks.
-- Critical for citation provenance in the GraphRAG pipeline.

CREATE TABLE IF NOT EXISTS concept_chunk_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('primary','secondary','example','counterexample')),
  quote TEXT,
  page_ref TEXT,
  confidence FLOAT NOT NULL DEFAULT 0.5,
  created_by TEXT NOT NULL DEFAULT 'pipeline',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (concept_id, chunk_id, evidence_type)
);

CREATE INDEX IF NOT EXISTS idx_cce_concept ON concept_chunk_evidence(concept_id);
CREATE INDEX IF NOT EXISTS idx_cce_chunk ON concept_chunk_evidence(chunk_id);

ALTER TABLE concept_chunk_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cce_read" ON concept_chunk_evidence
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cce_service_write" ON concept_chunk_evidence
  FOR ALL TO service_role USING (true);
