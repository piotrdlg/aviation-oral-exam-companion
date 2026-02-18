-- Add practice preference columns to user_profiles.
-- Users set these once in Settings; Practice page reads them.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_rating TEXT DEFAULT 'private'
    CHECK (preferred_rating IN ('private', 'commercial', 'instrument', 'atp')),
  ADD COLUMN IF NOT EXISTS preferred_aircraft_class TEXT DEFAULT 'ASEL'
    CHECK (preferred_aircraft_class IN ('ASEL', 'AMEL', 'ASES', 'AMES'));

-- Update trigger so new users get the defaults
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier, subscription_status, preferred_rating, preferred_aircraft_class)
  VALUES (NEW.id, 'checkride_prep', 'none', 'private', 'ASEL')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_profile() TO supabase_auth_admin;
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
