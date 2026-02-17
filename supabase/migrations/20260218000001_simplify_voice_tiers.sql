-- Simplify voice tiers: Deepgram is the universal voice engine for all users.
-- No voice quality differentiation between trial/monthly/annual subscriptions.
-- OpenAI and Cartesia remain as admin-only backup/dev options.

-- 1. Add preferred_voice column (nullable = use system default)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_voice TEXT;

-- 2. Change column default from ground_school to checkride_prep
ALTER TABLE user_profiles
  ALTER COLUMN tier SET DEFAULT 'checkride_prep';

-- 3. Migrate existing ground_school users to checkride_prep
UPDATE user_profiles
  SET tier = 'checkride_prep', updated_at = NOW()
  WHERE tier = 'ground_school';

-- 4. Update trigger to create profiles with checkride_prep
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'checkride_prep', 'none')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_profile() TO supabase_auth_admin;
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- 5. Seed admin-curated voice options for users
INSERT INTO system_config (key, value, description) VALUES
  ('voice.user_options', '[
    {"model": "aura-2-orion-en", "label": "Orion — Calm, polite (M, American)"},
    {"model": "aura-2-zeus-en", "label": "Zeus — Deep, trustworthy (M, American)"},
    {"model": "aura-2-athena-en", "label": "Athena — Calm, professional (F, American)"}
  ]', 'Admin-curated Deepgram voice options shown to users. Array of {model, label}.')
ON CONFLICT (key) DO NOTHING;
