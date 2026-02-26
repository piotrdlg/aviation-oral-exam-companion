-- ============================================================
-- Migration: 20260226000001_multi_hub_taxonomy
-- Date: 2026-02-26
-- Purpose: Multi-Hub Knowledge Graph — Phase 1 structural scaffold
--
-- Changes:
--   1. Create kb_hubs registry table + seed 4 hubs
--   2. Add hub_slug, taxonomy_slug columns to kb_taxonomy_nodes
--   3. Add hub_slug, taxonomy_slug columns to kb_chunk_taxonomy
--   4. Replace uniqueness constraint on kb_chunk_taxonomy
--      (Phase 1: single-hub assignment per chunk)
--   5. Insert triage/unclassified taxonomy node per hub
--
-- Constraints:
--   - Phase 1 is structural only (no LLM calls, no edge type changes)
--   - Only is_component_of edges may be created in companion scripts
--   - All scaffold edges use context prefix 'hub_scaffold:v1:' for rollback
--
-- This migration is ADDITIVE — no existing data is modified or dropped.
-- Both kb_taxonomy_nodes and kb_chunk_taxonomy are empty in production
-- as of 2026-02-25 (classification pilot was dry-run only).
--
-- Rollback: see bottom of file
-- ============================================================

-- ============================================================
-- 1. Create kb_hubs registry
-- ============================================================
CREATE TABLE IF NOT EXISTS kb_hubs (
  hub_slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE kb_hubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hubs_read" ON kb_hubs
  FOR SELECT TO authenticated USING (true);

-- Grants
GRANT SELECT ON kb_hubs TO authenticated;
GRANT ALL ON kb_hubs TO service_role;

-- Seed 4 hubs
INSERT INTO kb_hubs (hub_slug, name, description) VALUES
  ('knowledge',   'Knowledge Hub',    'FAA handbooks, AIM, advisory circulars — general aviation knowledge'),
  ('acs',         'ACS Hub',          'Airman Certification Standards — structured exam requirements by rating/area/task'),
  ('regulations', 'Regulations Hub',  '14 CFR regulatory framework — federal aviation regulations'),
  ('aircraft',    'Aircraft Hub',     'Aircraft-specific systems, limitations, performance, and procedures')
ON CONFLICT (hub_slug) DO NOTHING;

COMMENT ON TABLE kb_hubs IS 'Registry of knowledge hubs for multi-hub taxonomy. Each hub owns a tree of taxonomy nodes and a set of source chunks.';

-- ============================================================
-- 2. Extend kb_taxonomy_nodes with hub support
-- ============================================================
ALTER TABLE kb_taxonomy_nodes
  ADD COLUMN IF NOT EXISTS hub_slug TEXT NOT NULL DEFAULT 'knowledge';

ALTER TABLE kb_taxonomy_nodes
  ADD COLUMN IF NOT EXISTS taxonomy_slug TEXT NOT NULL DEFAULT 'default';

-- FK to kb_hubs (only add if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_taxonomy_nodes_hub'
  ) THEN
    ALTER TABLE kb_taxonomy_nodes
      ADD CONSTRAINT fk_taxonomy_nodes_hub
      FOREIGN KEY (hub_slug) REFERENCES kb_hubs(hub_slug);
  END IF;
END$$;

-- Composite indexes for hub-scoped queries
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_hub_parent
  ON kb_taxonomy_nodes(hub_slug, taxonomy_slug, parent_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_hub_slug_composite
  ON kb_taxonomy_nodes(hub_slug, taxonomy_slug, slug);

-- ============================================================
-- 3. Extend kb_chunk_taxonomy with hub support
-- ============================================================
ALTER TABLE kb_chunk_taxonomy
  ADD COLUMN IF NOT EXISTS hub_slug TEXT NOT NULL DEFAULT 'knowledge';

ALTER TABLE kb_chunk_taxonomy
  ADD COLUMN IF NOT EXISTS taxonomy_slug TEXT NOT NULL DEFAULT 'default';

-- FK to kb_hubs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_chunk_taxonomy_hub'
  ) THEN
    ALTER TABLE kb_chunk_taxonomy
      ADD CONSTRAINT fk_chunk_taxonomy_hub
      FOREIGN KEY (hub_slug) REFERENCES kb_hubs(hub_slug);
  END IF;
END$$;

-- ============================================================
-- 4. Replace uniqueness constraint for Phase 1
--    Phase 1: each chunk assigned to exactly one hub (single row)
--    The old constraint UNIQUE(chunk_id, taxonomy_node_id) allowed
--    multi-label; Phase 1 enforces single assignment.
-- ============================================================
ALTER TABLE kb_chunk_taxonomy
  DROP CONSTRAINT IF EXISTS kb_chunk_taxonomy_chunk_id_taxonomy_node_id_key;

-- Single-assignment constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_chunk_single_hub'
  ) THEN
    ALTER TABLE kb_chunk_taxonomy
      ADD CONSTRAINT uq_chunk_single_hub UNIQUE(chunk_id);
  END IF;
END$$;

-- Index for hub filtering
CREATE INDEX IF NOT EXISTS idx_chunk_taxonomy_hub
  ON kb_chunk_taxonomy(hub_slug);

-- ============================================================
-- 5. Seed triage/unclassified nodes per hub
--    These are the fallback assignment targets for chunks that
--    cannot be granularly classified in Phase 1.
-- ============================================================
INSERT INTO kb_taxonomy_nodes (slug, title, level, parent_id, hub_slug, taxonomy_slug, source_provenance, synonyms)
VALUES
  ('knowledge:triage-unclassified', 'Triage / Unclassified (Knowledge)',    1, NULL, 'knowledge',   'default', '[]'::jsonb, '{}'),
  ('acs:triage-unclassified',       'Triage / Unclassified (ACS)',          1, NULL, 'acs',         'default', '[]'::jsonb, '{}'),
  ('regulations:triage-unclassified','Triage / Unclassified (Regulations)', 1, NULL, 'regulations', 'default', '[]'::jsonb, '{}'),
  ('aircraft:triage-unclassified',   'Triage / Unclassified (Aircraft)',    1, NULL, 'aircraft',    'default', '[]'::jsonb, '{}')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON COLUMN kb_taxonomy_nodes.hub_slug IS 'Which hub this taxonomy node belongs to. Phase 1 hubs: knowledge, acs, regulations, aircraft.';
COMMENT ON COLUMN kb_taxonomy_nodes.taxonomy_slug IS 'Which taxonomy within the hub. Phase 1: always default. Future: multiple taxonomies per hub.';
COMMENT ON COLUMN kb_chunk_taxonomy.hub_slug IS 'Which hub owns this chunk. Phase 1: single-hub assignment enforced by UNIQUE(chunk_id).';
COMMENT ON COLUMN kb_chunk_taxonomy.taxonomy_slug IS 'Which taxonomy within the hub. Phase 1: always default.';

-- ============================================================
-- ROLLBACK (manual — run these statements in order):
--
-- DELETE FROM kb_taxonomy_nodes WHERE slug LIKE '%:triage-unclassified';
-- ALTER TABLE kb_chunk_taxonomy DROP CONSTRAINT IF EXISTS uq_chunk_single_hub;
-- ALTER TABLE kb_chunk_taxonomy DROP CONSTRAINT IF EXISTS fk_chunk_taxonomy_hub;
-- ALTER TABLE kb_chunk_taxonomy DROP COLUMN IF EXISTS taxonomy_slug;
-- ALTER TABLE kb_chunk_taxonomy DROP COLUMN IF EXISTS hub_slug;
-- -- Re-add original constraint if desired:
-- -- ALTER TABLE kb_chunk_taxonomy ADD CONSTRAINT kb_chunk_taxonomy_chunk_id_taxonomy_node_id_key UNIQUE(chunk_id, taxonomy_node_id);
-- ALTER TABLE kb_taxonomy_nodes DROP CONSTRAINT IF EXISTS fk_taxonomy_nodes_hub;
-- DROP INDEX IF EXISTS idx_taxonomy_nodes_hub_parent;
-- DROP INDEX IF EXISTS idx_taxonomy_nodes_hub_slug_composite;
-- ALTER TABLE kb_taxonomy_nodes DROP COLUMN IF EXISTS taxonomy_slug;
-- ALTER TABLE kb_taxonomy_nodes DROP COLUMN IF EXISTS hub_slug;
-- DROP TABLE IF EXISTS kb_hubs;
-- ============================================================
