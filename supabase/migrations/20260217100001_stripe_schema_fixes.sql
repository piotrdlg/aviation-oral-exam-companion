-- Fix Stripe-related schema gaps in user_profiles

-- 1. Add cancel_at column (Stripe uses this instead of cancel_at_period_end for trial cancellations)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;

-- 2. Expand subscription_status CHECK to include 'unpaid' (Stripe sends this after all retries fail)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_subscription_status_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_subscription_status_check
  CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'unpaid', 'none'));

-- 3. Fix signup trigger: new free users should get 'none', not 'active'
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'ground_school', 'none');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Backfill existing free users who have 'active' but no Stripe subscription
UPDATE user_profiles
  SET subscription_status = 'none'
  WHERE stripe_subscription_id IS NULL
    AND subscription_status = 'active';
