-- Phase 8: Instructor quota overrides
-- Allows admins to set per-instructor rate limit overrides

CREATE TABLE IF NOT EXISTS instructor_quota_overrides (
  instructor_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_invite_limit INT,
  token_creation_limit INT,
  expires_at TIMESTAMPTZ,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: admin-only access
ALTER TABLE instructor_quota_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to quota overrides"
  ON instructor_quota_overrides
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- Update trigger
CREATE OR REPLACE FUNCTION update_quota_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_quota_overrides_updated_at
  BEFORE UPDATE ON instructor_quota_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_quota_overrides_updated_at();
