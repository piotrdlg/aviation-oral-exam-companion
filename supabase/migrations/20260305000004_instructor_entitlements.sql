-- Migration: Instructor Entitlements — Phase 4
-- Adds general-purpose user entitlement overrides table.
-- Safe: CREATE only; no destructive changes.

-- ============================================================================
-- Table: user_entitlement_overrides
-- General-purpose override for granting paid-equivalent access to any user
-- (students, demo accounts, beta testers, partnerships, etc.)
-- When a student has paid_equivalent, their connected instructor
-- qualifies for courtesy access.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL CHECK (entitlement_key IN ('paid_equivalent')),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS idx_ueo_user_id ON user_entitlement_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_ueo_active ON user_entitlement_overrides(active) WHERE active = true;

ALTER TABLE user_entitlement_overrides ENABLE ROW LEVEL SECURITY;

-- Admin-only: no direct user access (service role bypasses RLS)
-- No policies = default deny for all authenticated users

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_user_entitlement_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_entitlement_overrides_updated_at
  BEFORE UPDATE ON user_entitlement_overrides
  FOR EACH ROW EXECUTE FUNCTION update_user_entitlement_overrides_updated_at();
