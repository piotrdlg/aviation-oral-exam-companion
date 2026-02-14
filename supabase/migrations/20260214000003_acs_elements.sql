-- ============================================================
-- Migration: acs_elements — normalized ACS element table
-- Extracts K/R/S elements from acs_tasks JSONB into first-class rows
-- ============================================================

CREATE TABLE acs_elements (
  code TEXT PRIMARY KEY,              -- e.g., "PA.I.A.K1"
  task_id TEXT NOT NULL REFERENCES acs_tasks(id),
  element_type TEXT NOT NULL CHECK (element_type IN ('knowledge','risk','skill')),
  short_code TEXT NOT NULL,           -- e.g., "K1", "R3"
  description TEXT NOT NULL,
  order_index INT NOT NULL,           -- preserves ACS ordering
  difficulty_default TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty_default IN ('easy','medium','hard')),
  weight REAL NOT NULL DEFAULT 1.0,   -- importance for scheduling/scoring
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_elements_task_type_order ON acs_elements (task_id, element_type, order_index);
CREATE INDEX idx_elements_difficulty ON acs_elements (difficulty_default);

-- RLS: readable by all authenticated
ALTER TABLE acs_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elements_read" ON acs_elements
  FOR SELECT TO authenticated USING (true);
