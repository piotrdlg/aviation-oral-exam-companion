-- Migration: Student Milestones — Phase 5
-- Append-only milestone declarations for audit trail.
-- Safe: CREATE only; no destructive changes.

-- ============================================================================
-- Table: student_milestones
-- Append-only audit trail of milestone declarations.
-- Current state is computed by taking the latest row per (student, key).
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL CHECK (milestone_key IN (
    'knowledge_test_passed',
    'mock_oral_completed',
    'checkride_scheduled',
    'oral_passed'
  )),
  status TEXT NOT NULL CHECK (status IN ('not_set', 'in_progress', 'completed')),
  declared_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  declared_by_role TEXT NOT NULL CHECK (declared_by_role IN ('student', 'instructor', 'admin')),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for resolving current state: latest row per student + key
CREATE INDEX IF NOT EXISTS idx_sm_student_key_declared
  ON student_milestones(student_user_id, milestone_key, declared_at DESC);

-- Index for instructor queries across students
CREATE INDEX IF NOT EXISTS idx_sm_declared_by
  ON student_milestones(declared_by_user_id);

ALTER TABLE student_milestones ENABLE ROW LEVEL SECURITY;

-- Students can read their own milestones
CREATE POLICY "Students can read own milestones"
  ON student_milestones FOR SELECT
  TO authenticated
  USING (student_user_id = auth.uid());

-- Students can insert their own milestones (declared_by_role='student')
CREATE POLICY "Students can declare own milestones"
  ON student_milestones FOR INSERT
  TO authenticated
  WITH CHECK (
    student_user_id = auth.uid()
    AND declared_by_user_id = auth.uid()
    AND declared_by_role = 'student'
  );

-- Instructors can read milestones for connected students (via service role)
-- Instructor write access handled via service role in API

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_student_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER student_milestones_updated_at
  BEFORE UPDATE ON student_milestones
  FOR EACH ROW EXECUTE FUNCTION update_student_milestones_updated_at();

-- ============================================================================
-- Add instructor_weekly_summary to email category options
-- (email_preferences table already exists with category TEXT column)
-- ============================================================================

-- No schema change needed: email_preferences.category is a TEXT column
-- without a CHECK constraint. The category is enforced at app level via
-- EmailCategory type in src/types/database.ts.
