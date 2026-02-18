-- Add onboarding and aircraft context columns to user_profiles.
-- Collected during the first-time onboarding wizard on the Practice page.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS aircraft_type TEXT,
  ADD COLUMN IF NOT EXISTS home_airport TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Backfill: existing users who have sessions should skip onboarding
UPDATE user_profiles
SET onboarding_completed = TRUE
WHERE user_id IN (SELECT DISTINCT user_id FROM exam_sessions);

-- Update trigger so new users start with onboarding_completed = false
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id, tier, subscription_status,
    preferred_rating, preferred_aircraft_class,
    onboarding_completed
  )
  VALUES (
    NEW.id, 'checkride_prep', 'none',
    'private', 'ASEL',
    FALSE
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_profile() TO supabase_auth_admin;
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
