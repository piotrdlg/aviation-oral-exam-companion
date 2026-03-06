-- Migration: Instructor Partnership Phase 2 — Verification + FAA Data
-- Adds: verification fields on instructor_profiles, faa_airmen table
-- All additive. No existing columns altered or dropped.

-- ============================================================================
-- 1. Add verification fields to instructor_profiles
-- ============================================================================

ALTER TABLE instructor_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified_auto', 'needs_manual_review', 'verified_admin')),
  ADD COLUMN IF NOT EXISTS verification_source TEXT
    CHECK (verification_source IS NULL OR verification_source IN ('faa_database', 'admin_manual', 'faa_inquiry')),
  ADD COLUMN IF NOT EXISTS verification_confidence TEXT
    CHECK (verification_confidence IS NULL OR verification_confidence IN ('high', 'medium', 'low', 'none')),
  ADD COLUMN IF NOT EXISTS verification_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_instructor_profiles_verification
  ON instructor_profiles(verification_status);

-- ============================================================================
-- 2. FAA Airmen records table (imported from FAA Releasable Database)
-- ============================================================================

CREATE TABLE IF NOT EXISTS faa_airmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FAA UNIQUE ID from the downloadable dataset (not the certificate number)
  faa_unique_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  -- Normalized search fields (lowercase, trimmed)
  first_name_normalized TEXT NOT NULL,
  last_name_normalized TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT,
  region TEXT,
  med_class TEXT,
  med_date TEXT,
  med_exp_date TEXT,
  -- Source tracking
  source_file TEXT NOT NULL,         -- e.g., 'PILOT_BASIC_2026-03'
  source_date DATE NOT NULL,         -- Publication date of the FAA dataset
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per FAA ID + source date (allows re-import of same dataset safely)
CREATE UNIQUE INDEX IF NOT EXISTS idx_faa_airmen_unique
  ON faa_airmen(faa_unique_id, source_date);

-- Search indexes
CREATE INDEX IF NOT EXISTS idx_faa_airmen_last_name ON faa_airmen(last_name_normalized);
CREATE INDEX IF NOT EXISTS idx_faa_airmen_name ON faa_airmen(last_name_normalized, first_name_normalized);

-- ============================================================================
-- 3. FAA Airmen certificate records (one row per certificate per airman)
-- ============================================================================

CREATE TABLE IF NOT EXISTS faa_airmen_certs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faa_unique_id TEXT NOT NULL,
  -- FAA certificate fields
  cert_type TEXT NOT NULL,           -- e.g., 'P' (pilot), 'F' (flight instructor), 'G' (ground instructor)
  cert_level TEXT,                   -- e.g., 'AIRPLANE SINGLE ENGINE LAND'
  cert_expire_date TEXT,
  rating_text TEXT,                  -- Full rating string from FAA
  -- Source tracking
  source_file TEXT NOT NULL,
  source_date DATE NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_faa_certs_unique
  ON faa_airmen_certs(faa_unique_id, cert_type, COALESCE(cert_level, ''), source_date);

CREATE INDEX IF NOT EXISTS idx_faa_certs_faa_id ON faa_airmen_certs(faa_unique_id);
CREATE INDEX IF NOT EXISTS idx_faa_certs_type ON faa_airmen_certs(cert_type);

-- ============================================================================
-- 4. FAA import log (tracks import runs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS faa_import_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_date DATE NOT NULL,
  source_url TEXT,
  basic_rows_imported INTEGER NOT NULL DEFAULT 0,
  cert_rows_imported INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- No RLS on FAA tables — they are read-only reference data accessed via service role
-- faa_airmen, faa_airmen_certs, faa_import_log are not user-facing tables
