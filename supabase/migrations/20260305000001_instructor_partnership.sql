-- Migration: Instructor Partnership System - Phase 1 Foundation
-- Creates: instructor_profiles, instructor_invites, student_instructor_connections, instructor_access_overrides
-- Feature flag: instructor_partnership_v1 (default OFF)

-- ============================================================================
-- Table 1: instructor_profiles
-- ============================================================================

CREATE TABLE instructor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  first_name TEXT,
  last_name TEXT,
  certificate_number TEXT,
  certificate_type TEXT CHECK (certificate_type IS NULL OR certificate_type IN ('CFI', 'CFII', 'MEI', 'AGI', 'IGI')),
  bio TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  suspended_at TIMESTAMPTZ,
  suspended_by UUID REFERENCES auth.users(id),
  suspension_reason TEXT,
  admin_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instructor_profiles_user_id ON instructor_profiles(user_id);
CREATE INDEX idx_instructor_profiles_status ON instructor_profiles(status);

ALTER TABLE instructor_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own instructor profile"
  ON instructor_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own profile (one per user, enforced by UNIQUE)
CREATE POLICY "Users can create own instructor profile"
  ON instructor_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own profile ONLY when in draft status
CREATE POLICY "Users can update own draft instructor profile"
  ON instructor_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'draft')
  WITH CHECK (user_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_instructor_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instructor_profiles_updated_at
  BEFORE UPDATE ON instructor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_instructor_profiles_updated_at();

-- ============================================================================
-- Table 2: instructor_invites (must precede student_instructor_connections)
-- ============================================================================

CREATE TABLE instructor_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_type TEXT NOT NULL CHECK (invite_type IN ('link', 'email', 'qr')),
  token TEXT NOT NULL UNIQUE,
  target_email TEXT,
  target_name TEXT,
  claimed_by_user_id UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instructor_invites_token ON instructor_invites(token);
CREATE INDEX idx_instructor_invites_instructor ON instructor_invites(instructor_user_id);

ALTER TABLE instructor_invites ENABLE ROW LEVEL SECURITY;

-- Instructors can read their own invites
CREATE POLICY "Instructors can read own invites"
  ON instructor_invites FOR SELECT
  TO authenticated
  USING (instructor_user_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_instructor_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instructor_invites_updated_at
  BEFORE UPDATE ON instructor_invites
  FOR EACH ROW EXECUTE FUNCTION update_instructor_invites_updated_at();

-- ============================================================================
-- Table 3: student_instructor_connections (depends on instructor_invites)
-- ============================================================================

CREATE TABLE student_instructor_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'invited' CHECK (state IN ('invited', 'pending', 'connected', 'inactive', 'rejected', 'disconnected')),
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('student', 'instructor', 'system')),
  invite_id UUID REFERENCES instructor_invites(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  disconnected_by UUID REFERENCES auth.users(id),
  disconnect_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instructor_user_id, student_user_id)
);

CREATE INDEX idx_sic_instructor ON student_instructor_connections(instructor_user_id);
CREATE INDEX idx_sic_student ON student_instructor_connections(student_user_id);
CREATE INDEX idx_sic_state ON student_instructor_connections(state);

ALTER TABLE student_instructor_connections ENABLE ROW LEVEL SECURITY;

-- Participants can read their own connections
CREATE POLICY "Users can read own connections"
  ON student_instructor_connections FOR SELECT
  TO authenticated
  USING (instructor_user_id = auth.uid() OR student_user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE by users (service role only for Phase 1)

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_student_instructor_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER student_instructor_connections_updated_at
  BEFORE UPDATE ON student_instructor_connections
  FOR EACH ROW EXECUTE FUNCTION update_student_instructor_connections_updated_at();

-- ============================================================================
-- Table 4: instructor_access_overrides
-- ============================================================================

CREATE TABLE instructor_access_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN ('courtesy_access', 'beta_tester', 'partnership', 'manual')),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_iao_instructor ON instructor_access_overrides(instructor_user_id);

ALTER TABLE instructor_access_overrides ENABLE ROW LEVEL SECURITY;

-- No direct access by users (admin/service role only)

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_instructor_access_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instructor_access_overrides_updated_at
  BEFORE UPDATE ON instructor_access_overrides
  FOR EACH ROW EXECUTE FUNCTION update_instructor_access_overrides_updated_at();

-- ============================================================================
-- Feature flag: instructor partnership (default OFF)
-- ============================================================================

INSERT INTO system_config (key, value, description)
VALUES (
  'instructor_partnership_v1',
  '{"enabled": false}'::jsonb,
  'Feature flag for Instructor Partnership system. When disabled, instructor UI and API endpoints are hidden/blocked.'
)
ON CONFLICT (key) DO NOTHING;
