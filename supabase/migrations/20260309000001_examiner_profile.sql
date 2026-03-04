-- Phase 12: Examiner Identity Unification
-- Add examiner_profile column to user_profiles for unified examiner selection.
-- Replaces split persona/voice selection with a single profile key.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS examiner_profile TEXT DEFAULT NULL;

-- Backfill from existing preferred_voice for users who already have a voice set.
-- Maps voice model persona_ids to examiner profile keys.
UPDATE user_profiles SET examiner_profile = CASE
  WHEN preferred_voice LIKE '%maria_torres%'    THEN 'maria_methodical'
  WHEN preferred_voice LIKE '%bob_mitchell%'     THEN 'bob_supportive'
  WHEN preferred_voice LIKE '%jim_hayes%'        THEN 'jim_strict'
  WHEN preferred_voice LIKE '%karen_sullivan%'   THEN 'karen_scenario'
  ELSE NULL
END
WHERE preferred_voice IS NOT NULL AND examiner_profile IS NULL;
