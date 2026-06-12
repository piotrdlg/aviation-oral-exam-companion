-- ============================================================
-- Migration: persona <-> voice coherence (post-launch-gate finding, 2026-06-12)
-- ============================================================
-- Two defects made the examiner shown in the UI not match the voice heard:
--   1. voice.user_options was missing Bob Mitchell (the 4th code-side examiner,
--      EXAMINER_PROFILES.bob_supportive) — in his place sat a bare
--      "Mars — Patient, baritone" entry with no persona_id/image/gender.
--   2. The settings examiner selector stored persona_ids ('karen_sullivan')
--      in user_profiles.preferred_voice; Deepgram rejects those as models and
--      every sentence silently fell back to the male OpenAI voice.
-- This migration fixes the config roster and repairs the stored rows. The
-- matching code change (same release) stores/resolves real Deepgram models.

-- 1. Canonical 4-examiner roster: persona_id + gender-consistent Aura-2 model
--    + avatar for every examiner. Mars (aura-2-mars-en, patient baritone)
--    becomes Bob Mitchell's voice — the Supportive Coach it was meant for.
UPDATE system_config
SET value = '[
  {"persona_id":"jim_hayes","label":"Jim Hayes","gender":"M","model":"aura-2-zeus-en","image":"/personas/jim-hayes.webp","desc":"Younger examiner, methodical"},
  {"persona_id":"karen_sullivan","label":"Karen Sullivan","gender":"F","model":"aura-2-athena-en","image":"/personas/karen-sullivan.webp","desc":"Warm but thorough, catches everything"},
  {"persona_id":"maria_torres","label":"Maria Torres","gender":"F","model":"aura-2-luna-en","image":"/personas/maria-torres.webp","desc":"Precise and efficient"},
  {"persona_id":"bob_mitchell","label":"Bob Mitchell","gender":"M","model":"aura-2-mars-en","image":"/personas/bob-mitchell.webp","desc":"Warm and patient, keeps you at ease"}
]'::jsonb,
    description = 'User-selectable examiner voices. Each entry MUST carry persona_id (matches EXAMINER_PROFILES[].voiceId), a Deepgram Aura-2 model gender-consistent with the persona, and an avatar image. The final-gate persona-voice check asserts this.'
WHERE key = 'voice.user_options';

-- 2. Repair rows that stored persona_ids instead of models (idempotent).
UPDATE user_profiles
SET preferred_voice = CASE preferred_voice
      WHEN 'maria_torres'   THEN 'aura-2-luna-en'
      WHEN 'bob_mitchell'   THEN 'aura-2-mars-en'
      WHEN 'jim_hayes'      THEN 'aura-2-zeus-en'
      WHEN 'karen_sullivan' THEN 'aura-2-athena-en'
    END,
    updated_at = now()
WHERE preferred_voice IN ('maria_torres', 'bob_mitchell', 'jim_hayes', 'karen_sullivan');
