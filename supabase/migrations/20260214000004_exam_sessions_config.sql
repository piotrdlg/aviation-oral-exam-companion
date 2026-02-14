-- ============================================================
-- Migration: Add study configuration columns to exam_sessions
-- Supports study mode selection, difficulty preference, and area filtering
-- ============================================================

ALTER TABLE exam_sessions
  ADD COLUMN study_mode TEXT NOT NULL DEFAULT 'cross_acs'
    CHECK (study_mode IN ('linear','cross_acs','weak_areas')),
  ADD COLUMN difficulty_preference TEXT NOT NULL DEFAULT 'mixed'
    CHECK (difficulty_preference IN ('easy','medium','hard','mixed')),
  ADD COLUMN selected_areas TEXT[] NOT NULL DEFAULT '{}';
