-- Migration: Instructor Connections MVP - Phase 3
-- Adds columns and indexes for connection lifecycle management.
-- Safe: ALTER + CREATE INDEX only; no destructive changes.

-- ============================================================================
-- Add missing columns to student_instructor_connections
-- ============================================================================

-- Who approved the connection (instructor user_id)
ALTER TABLE student_instructor_connections
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- When the connection was rejected
ALTER TABLE student_instructor_connections
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- ============================================================================
-- Composite indexes for list queries
-- ============================================================================

-- Instructor listing their students (filter by state, sort by updated_at)
CREATE INDEX IF NOT EXISTS idx_sic_instructor_state_updated
  ON student_instructor_connections(instructor_user_id, state, updated_at DESC);

-- Student viewing their connections (filter by state, sort by updated_at)
CREATE INDEX IF NOT EXISTS idx_sic_student_state_updated
  ON student_instructor_connections(student_user_id, state, updated_at DESC);
