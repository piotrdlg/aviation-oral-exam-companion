-- Add preferred_theme column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_theme TEXT DEFAULT 'cockpit';

-- Backfill existing users
UPDATE user_profiles SET preferred_theme = 'cockpit' WHERE preferred_theme IS NULL;

-- Add 4th voice option: Luna
UPDATE system_config
SET value = value || '[{"model": "aura-2-luna-en", "label": "Luna"}]'::jsonb
WHERE key = 'voice.user_options';
