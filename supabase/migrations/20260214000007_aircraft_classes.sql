-- Aircraft class filtering for ACS tasks and sessions
-- Classes (per 14 CFR 61.5): ASEL (Single-Engine Land), AMEL (Multi-Engine Land),
--                             ASES (Single-Engine Sea), AMES (Multi-Engine Sea)

BEGIN;

-- ============================================================
-- Step 1: Add applicable_classes to acs_tasks
-- Default: all four classes (universal tasks)
-- ============================================================

ALTER TABLE acs_tasks
  ADD COLUMN applicable_classes TEXT[] NOT NULL DEFAULT '{ASEL,AMEL,ASES,AMES}';

CREATE INDEX idx_acs_tasks_classes ON acs_tasks USING GIN (applicable_classes);

-- ============================================================
-- Step 2: Set class-specific tasks deterministically by ID
-- Source: FAA-S-ACS-6C task designations in parentheses
-- ============================================================

-- Sea-only tasks (ASES, AMES)
UPDATE acs_tasks SET applicable_classes = '{ASES,AMES}'
  WHERE id IN (
    'PA.I.I',    -- Water and Seaplane Characteristics (ASES, AMES)
    'PA.II.E',   -- Taxiing and Sailing (ASES, AMES)
    'PA.IV.G',   -- Confined Area Takeoff (ASES, AMES)
    'PA.IV.H',   -- Confined Area Approach (ASES, AMES)
    'PA.IV.I',   -- Glassy Water Takeoff (ASES, AMES)
    'PA.IV.J',   -- Glassy Water Approach (ASES, AMES)
    'PA.IV.K',   -- Rough Water Takeoff (ASES, AMES)
    'PA.IV.L',   -- Rough Water Approach (ASES, AMES)
    'PA.XII.B'   -- Seaplane Post-Landing (ASES, AMES)
  );

-- Land-only tasks (ASEL, AMEL)
UPDATE acs_tasks SET applicable_classes = '{ASEL,AMEL}'
  WHERE id IN (
    'PA.II.D',   -- Taxiing (ASEL, AMEL)
    'PA.IV.E',   -- Short-Field Takeoff (ASEL, AMEL)
    'PA.IV.F',   -- Short-Field Approach (ASEL, AMEL)
    'PA.XII.A'   -- After Landing, Parking, Securing (ASEL, AMEL)
  );

-- ASEL-only tasks
UPDATE acs_tasks SET applicable_classes = '{ASEL}'
  WHERE id IN (
    'PA.IV.C',   -- Soft-Field Takeoff (ASEL)
    'PA.IV.D'    -- Soft-Field Approach (ASEL)
  );

-- Single-engine tasks — both land and sea (ASEL, ASES)
UPDATE acs_tasks SET applicable_classes = '{ASEL,ASES}'
  WHERE id IN (
    'PA.IV.M',   -- Forward Slip to a Landing (ASEL, ASES)
    'PA.IX.B'    -- Emergency Approach and Landing (ASEL, ASES)
  );

-- Multi-engine-only tasks (AMEL, AMES)
UPDATE acs_tasks SET applicable_classes = '{AMEL,AMES}'
  WHERE id IN (
    'PA.IX.E',   -- Engine Failure Before Vmc (AMEL, AMES)
    'PA.IX.F',   -- Engine Failure After Liftoff (AMEL, AMES)
    'PA.IX.G',   -- Approach with Inoperative Engine (AMEL, AMES)
    'PA.X.A',    -- Maneuvering with One Engine Inoperative (AMEL, AMES)
    'PA.X.B',    -- Vmc Demonstration (AMEL, AMES)
    'PA.X.C',    -- One Engine Inoperative Straight-and-Level (AMEL, AMES)
    'PA.X.D'     -- Instrument Approach with Inoperative Engine (AMEL, AMES)
  );

-- All other tasks keep the default {ASEL,AMEL,ASES,AMES}

-- ============================================================
-- Step 3: Add session-level class and task selection columns
-- ============================================================

ALTER TABLE exam_sessions
  ADD COLUMN aircraft_class TEXT NOT NULL DEFAULT 'ASEL'
    CHECK (aircraft_class IN ('ASEL','AMEL','ASES','AMES')),
  ADD COLUMN selected_tasks TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
