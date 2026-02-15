-- Fix user profile trigger: grant explicit INSERT permission
-- The trigger fires as SECURITY DEFINER but needs the function owner
-- (postgres) to have permission to insert into user_profiles.

-- Drop and recreate the trigger function with explicit search_path
-- and ensure it runs as the postgres superuser role
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS create_user_profile();

-- Recreate with SET search_path and explicit error handling
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'ground_school', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Grant execute to the auth service
GRANT EXECUTE ON FUNCTION public.create_user_profile() TO supabase_auth_admin;

-- Grant insert on user_profiles to the function's execution context
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();
