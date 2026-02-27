-- Migration: Add 'quick_drill' to exam_sessions.study_mode CHECK constraint
-- Phase 5 (R10): Quick Drill mode targets weak elements with 10-20 focused questions
--
-- Background: study_mode is a TEXT column with a CHECK constraint (not a Postgres enum).
-- The existing constraint allows: 'linear', 'cross_acs', 'weak_areas'.
-- This migration adds 'quick_drill' to that list.

-- Drop the old constraint
ALTER TABLE exam_sessions
  DROP CONSTRAINT exam_sessions_study_mode_check;

-- Recreate with quick_drill included
ALTER TABLE exam_sessions
  ADD CONSTRAINT exam_sessions_study_mode_check
  CHECK (study_mode IN ('linear', 'cross_acs', 'weak_areas', 'quick_drill'));

-- Rollback SQL (if needed):
--   ALTER TABLE exam_sessions DROP CONSTRAINT exam_sessions_study_mode_check;
--   ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_study_mode_check
--     CHECK (study_mode IN ('linear', 'cross_acs', 'weak_areas'));
--   -- Note: Any rows with study_mode='quick_drill' must be updated first:
--   --   UPDATE exam_sessions SET study_mode = 'weak_areas' WHERE study_mode = 'quick_drill';
