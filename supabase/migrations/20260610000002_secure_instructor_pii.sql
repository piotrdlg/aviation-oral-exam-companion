-- ============================================================
-- Migration: Secure Instructor PII Exposure (W1.2 Security Fix)
-- ============================================================
-- CRITICAL FIX: Close exposure of FAA certificate numbers,
-- admin notes, verification data via anonymous instructor_profiles
-- table reads.
--
-- VULNERABILITY (C2):
-- Policy "Public can read approved instructor profiles by slug"
-- (20260306000006:21-24) grants anon SELECT on instructor_profiles
-- with no column filtering. RLS is row-level only, so all columns
-- are readable: certificate_number, admin_notes, verification_data,
-- rejection_reason, email, quotas.
--
-- FIX:
-- 1. DROP the blanket anon/authenticated policy on table
-- 2. CREATE public_instructor_profiles view (safe columns only)
-- 3. GRANT SELECT on view to anon, authenticated
-- 4. Keep own-profile and admin access intact
-- ============================================================

-- ============================================================
-- 1. DROP THE VULNERABLE POLICY
-- ============================================================
DROP POLICY IF EXISTS "Public can read approved instructor profiles by slug"
  ON instructor_profiles;

-- ============================================================
-- 2. CREATE RESTRICTED VIEW FOR PUBLIC ACCESS
-- Only exposes display-safe columns for approved instructors.
-- ============================================================
CREATE OR REPLACE VIEW public_instructor_profiles AS
  SELECT
    id,
    first_name,
    last_name,
    certificate_type,
    bio,
    slug,
    referral_code,
    created_at,
    updated_at
  FROM instructor_profiles
  WHERE status = 'approved'
    AND slug IS NOT NULL;

-- ============================================================
-- 3. GRANT PUBLIC READ ACCESS TO VIEW (not table)
-- ============================================================
GRANT SELECT ON public_instructor_profiles TO anon, authenticated;

-- ============================================================
-- 4. VERIFY: Table itself no longer grants anon/authenticated
-- Only the view does, with restricted columns.
--
-- Existing policies remain intact:
-- - "Users can read own instructor profile" (own data)
-- - Admin policies (for admin routes)
-- ============================================================

-- NOTE: The lookupBySlug and lookupByReferralCode functions
-- in src/lib/instructor-identity.ts already explicitly select
-- only safe columns, so they continue to work unchanged.
-- Direct table access by anon key now fails (policy removed).
