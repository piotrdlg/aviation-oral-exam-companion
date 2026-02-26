-- ============================================================
-- Migration: Taxonomy Scaffold Tables
-- Date: 2026-02-25
-- Purpose: Add kb_taxonomy_nodes and kb_chunk_taxonomy tables
--          for deterministic chunk/concept classification.
--
-- This is ADDITIVE — no existing tables are modified or dropped.
-- Rollback: DROP TABLE kb_chunk_taxonomy; DROP TABLE kb_taxonomy_nodes;
-- ============================================================

-- ---------------------------------------------------------------------------
-- kb_taxonomy_nodes: 3-level topic taxonomy derived from FAA source documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_taxonomy_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  parent_id uuid REFERENCES kb_taxonomy_nodes(id) ON DELETE SET NULL,
  source_provenance jsonb DEFAULT '[]'::jsonb,
  synonyms text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_slug ON kb_taxonomy_nodes(slug);
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_level ON kb_taxonomy_nodes(level);
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_parent ON kb_taxonomy_nodes(parent_id);

-- ---------------------------------------------------------------------------
-- kb_chunk_taxonomy: classification of source_chunks into taxonomy nodes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_chunk_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
  taxonomy_node_id uuid NOT NULL REFERENCES kb_taxonomy_nodes(id) ON DELETE CASCADE,
  confidence float NOT NULL DEFAULT 0.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
  method text NOT NULL DEFAULT 'llm',
  model text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(chunk_id, taxonomy_node_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chunk_taxonomy_chunk ON kb_chunk_taxonomy(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_taxonomy_node ON kb_chunk_taxonomy(taxonomy_node_id);
CREATE INDEX IF NOT EXISTS idx_chunk_taxonomy_confidence ON kb_chunk_taxonomy(confidence);

-- ---------------------------------------------------------------------------
-- RLS: Read for authenticated, write for service role
-- ---------------------------------------------------------------------------
ALTER TABLE kb_taxonomy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunk_taxonomy ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "taxonomy_nodes_read" ON kb_taxonomy_nodes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chunk_taxonomy_read" ON kb_chunk_taxonomy
  FOR SELECT TO authenticated USING (true);

-- Write access for service role (scripts use service_role key)
-- Service role bypasses RLS by default, so no explicit write policy needed.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON kb_taxonomy_nodes TO authenticated;
GRANT SELECT ON kb_chunk_taxonomy TO authenticated;
GRANT ALL ON kb_taxonomy_nodes TO service_role;
GRANT ALL ON kb_chunk_taxonomy TO service_role;

-- ---------------------------------------------------------------------------
-- Comment
-- ---------------------------------------------------------------------------
COMMENT ON TABLE kb_taxonomy_nodes IS 'Unified 3-level topic taxonomy derived from FAA source document TOCs. Nodes: L1=domain roots, L2=chapters/sections, L3=subsections.';
COMMENT ON TABLE kb_chunk_taxonomy IS 'Classification of source_chunks into taxonomy nodes. Supports LLM-based and deterministic classification methods.';
