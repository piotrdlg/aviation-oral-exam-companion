-- Voice Tier System: user_profiles + usage_logs + auto-create trigger + backfill

-- 1. user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'ground_school'
    CHECK (tier IN ('ground_school', 'checkride_prep', 'dpe_live')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  stripe_subscription_item_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  last_webhook_event_id TEXT,
  last_webhook_event_ts TIMESTAMPTZ,
  latest_invoice_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE policies for authenticated users = prevents tier self-promotion

-- 2. usage_logs table
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_id UUID REFERENCES exam_sessions(id),
  request_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('tts_request', 'stt_session', 'llm_request', 'token_issued')),
  provider TEXT NOT NULL,
  tier TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  latency_ms INTEGER,
  status TEXT DEFAULT 'ok'
    CHECK (status IN ('ok', 'error', 'timeout')),
  error_code TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_date ON usage_logs (user_id, created_at);
CREATE INDEX idx_usage_logs_session ON usage_logs (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'ground_school', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- 4. Backfill existing users
INSERT INTO user_profiles (user_id, tier, subscription_status)
SELECT id, 'ground_school', 'active'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles);
