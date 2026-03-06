-- Migration: Instructor Partnership Phase 6 — Referrals & Attribution
-- Adds: slug, referral_code to instructor_profiles
-- Adds: connection_source to student_instructor_connections
-- Adds: RLS policy for public slug/referral lookup

-- ============================================================================
-- 1. Add slug + referral_code to instructor_profiles
-- ============================================================================

ALTER TABLE instructor_profiles
  ADD COLUMN slug TEXT UNIQUE,
  ADD COLUMN referral_code TEXT UNIQUE;

CREATE INDEX idx_instructor_profiles_slug ON instructor_profiles(slug);
CREATE INDEX idx_instructor_profiles_referral_code ON instructor_profiles(referral_code);

-- Public read policy for slug/referral lookups (approved instructors only)
-- Allows unauthenticated access to display-safe fields via slug or referral_code.
-- Only exposes: first_name, last_name, certificate_type, bio, slug, referral_code.
-- Certificate_number is excluded by the SELECT in the application layer.
CREATE POLICY "Public can read approved instructor profiles by slug"
  ON instructor_profiles FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND slug IS NOT NULL);

-- ============================================================================
-- 2. Add connection_source to student_instructor_connections
-- ============================================================================

ALTER TABLE student_instructor_connections
  ADD COLUMN connection_source TEXT CHECK (
    connection_source IS NULL OR connection_source IN (
      'referral_link', 'invite_link', 'student_search', 'admin'
    )
  );

-- Backfill existing connections: invite_id present → invite_link, else student_search
UPDATE student_instructor_connections
SET connection_source = CASE
  WHEN invite_id IS NOT NULL THEN 'invite_link'
  ELSE 'student_search'
END
WHERE connection_source IS NULL;
