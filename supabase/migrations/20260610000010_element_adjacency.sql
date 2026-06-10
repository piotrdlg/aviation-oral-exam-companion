-- ============================================================
-- Migration: element_adjacency (W5.3 — Scenario Engine layer 1)
-- ============================================================
-- Precomputed, inspectable relatedness between ACS elements, per design §3
-- (docs/plans/2026-06-09-scenario-engine-design.md). Built offline by
-- scripts/pipeline/build-element-adjacency.ts; consumed by the planner's
-- adjacency ordering (flag exam.adjacency_ordering) and the W5.4 transition
-- policy. Signals jsonb keeps every score explainable for CFI audit.

CREATE TABLE element_adjacency (
  element_code TEXT NOT NULL REFERENCES acs_elements(code) ON DELETE CASCADE,
  related_code TEXT NOT NULL REFERENCES acs_elements(code) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  signals JSONB NOT NULL,           -- {embedding: x, cooccurrence: y, structural: z}
  built_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (element_code, related_code)
);

CREATE INDEX idx_element_adjacency_element ON element_adjacency (element_code);

ALTER TABLE element_adjacency ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (the planner runs server-side but the table
-- holds no sensitive data — it is ACS-derived reference material).
CREATE POLICY element_adjacency_read ON element_adjacency
  FOR SELECT TO authenticated USING (true);

-- Writes: service role only (the offline build script).
-- (No INSERT/UPDATE/DELETE policies — service role bypasses RLS.)

-- Planner flag: adjacency-based cross_acs ordering, default OFF.
INSERT INTO system_config (key, value, description)
VALUES ('exam.adjacency_ordering', '{"enabled": false}',
        'W5.3: order cross_acs exam queues by element_adjacency walk instead of structural-fingerprint Jaccard. Default OFF.')
ON CONFLICT (key) DO NOTHING;
