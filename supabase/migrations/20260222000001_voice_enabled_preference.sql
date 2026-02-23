-- Add persistent voice mode preference to user profiles.
-- Default TRUE preserves existing behavior (voice on by default).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT TRUE;
