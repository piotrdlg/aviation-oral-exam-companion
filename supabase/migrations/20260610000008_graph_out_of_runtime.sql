-- ============================================================
-- Migration: graph out of the exam runtime (W5.1, decision D4)
-- ============================================================
-- The knowledge graph leaves the exam path. The Scenario Engine
-- (docs/plans/2026-06-09-scenario-engine-design.md) is its replacement for
-- non-linear exams, gated behind its own proof gates.
--
-- This migration:
--   1. Drops the two DEAD RPCs (zero app callers — verified by grep; only
--      scripts/audit/db-snapshot.ts listed them, updated in this PR):
--      hybrid_search (concept search) and get_related_concepts (traversal).
--   2. Forces the graph runtime flags off.
--
-- It does NOT touch: concepts / concept_relations / concept_chunk_evidence
-- tables, or get_concept_bundle (the admin graph explorer and the weak-area
-- report still read them). They remain as a read-only archive.

DROP FUNCTION IF EXISTS hybrid_search(TEXT, VECTOR(1536), INT, FLOAT);
DROP FUNCTION IF EXISTS get_related_concepts(UUID, INT);

UPDATE system_config
SET value = '{"enabled": false}',
    description = COALESCE(description, '') || ' [Archived by W5.1/D4 2026-06-10: graph removed from exam runtime — superseded by the Scenario Engine.]'
WHERE key IN ('graph.enhanced_retrieval', 'graph.shadow_mode')
  AND value IS DISTINCT FROM '{"enabled": false}'::jsonb;
