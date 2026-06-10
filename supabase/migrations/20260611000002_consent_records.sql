-- ============================================================
-- Migration: consent_records (W6.5)
-- ============================================================
-- Server-side record of cookie-consent choices (GDPR accountability) and
-- the substrate for the disclaimer acknowledgment audit trail. localStorage
-- remains the client behavior for anonymous visitors; logged-in choices are
-- mirrored here.

CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'cookie' CHECK (kind IN ('cookie', 'disclaimer')),
  choices JSONB NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_records_user ON consent_records (user_id, kind, created_at DESC);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_records_read_own ON consent_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Writes: service role only (the API endpoint), so records cannot be forged
-- or backdated client-side.
