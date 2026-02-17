-- Fix create_user_profile trigger: restore ON CONFLICT safety and SET search_path.
-- The Stripe migration (20260217100001) overwrote this function without these guards.

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'ground_school', 'none')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Ensure grants are in place for auth trigger context
GRANT EXECUTE ON FUNCTION public.create_user_profile() TO supabase_auth_admin;
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
