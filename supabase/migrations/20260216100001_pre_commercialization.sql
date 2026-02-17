-- Pre-Commercialization Schema: Admin, Auth, Billing, Session Enforcement
-- Dependencies: 20260214000001_initial_schema.sql (admin_users, exam_sessions, session_transcripts)
--               20260214000008_voice_tiers.sql (user_profiles, usage_logs)

-- ============================================================
-- 1. system_config — runtime configuration store
-- ============================================================
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO system_config (key, value, description) VALUES
  ('kill_switch.anthropic', '{"enabled": false}', 'Disable Anthropic API calls'),
  ('kill_switch.openai', '{"enabled": false}', 'Disable OpenAI API calls'),
  ('kill_switch.deepgram', '{"enabled": false}', 'Disable Deepgram API calls'),
  ('kill_switch.cartesia', '{"enabled": false}', 'Disable Cartesia API calls'),
  ('kill_switch.tier.ground_school', '{"enabled": false}', 'Disable ground_school tier'),
  ('kill_switch.tier.checkride_prep', '{"enabled": false}', 'Disable checkride_prep tier'),
  ('kill_switch.tier.dpe_live', '{"enabled": false}', 'Disable dpe_live tier'),
  ('maintenance_mode', '{"enabled": false, "message": ""}', 'Global maintenance mode'),
  ('user_hard_caps', '{"daily_llm_tokens": 100000, "daily_tts_chars": 50000, "daily_stt_seconds": 3600}', 'Per-user daily hard caps');

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read config" ON system_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin update config" ON system_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
-- Note: No INSERT policy — config keys are seeded in migration only.
-- Admin UI can UPDATE existing keys but not add new ones (use service role for that).

-- ============================================================
-- 2. admin_devices — trusted device registry (FUTURE: not enforced in MVP)
-- ============================================================
CREATE TABLE admin_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_label TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE admin_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage devices" ON admin_devices FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================================
-- 3. admin_audit_log — immutable audit trail
-- ============================================================
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  device_fingerprint TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX idx_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX idx_audit_created ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read audit" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin insert audit" ON admin_audit_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================================
-- 4. prompt_versions — versioned system prompts
-- ============================================================
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key TEXT NOT NULL,
  rating TEXT,
  study_mode TEXT,
  version INT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  change_summary TEXT,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Expression-based uniqueness requires CREATE UNIQUE INDEX, not inline UNIQUE constraint
CREATE UNIQUE INDEX idx_prompt_versions_unique
  ON prompt_versions (prompt_key, COALESCE(rating, '__all__'), COALESCE(study_mode, '__all__'), version);

CREATE INDEX idx_prompt_versions_key_status ON prompt_versions(prompt_key, status);
CREATE INDEX idx_prompt_versions_published ON prompt_versions(prompt_key, published_at DESC)
  WHERE status = 'published';

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage prompts" ON prompt_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
-- Runtime must read published prompts (non-admin authenticated users)
CREATE POLICY "Auth read published prompts" ON prompt_versions FOR SELECT
  USING (status = 'published' AND auth.uid() IS NOT NULL);

-- ============================================================
-- 5. moderation_queue — user reports and safety incidents
-- ============================================================
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('inaccurate_answer', 'safety_incident', 'bug_report', 'content_error')),
  reporter_user_id UUID REFERENCES auth.users(id),
  session_id UUID REFERENCES exam_sessions(id),
  transcript_id UUID REFERENCES session_transcripts(id),
  prompt_version_id UUID REFERENCES prompt_versions(id),
  details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_status ON moderation_queue(status, created_at DESC);
CREATE INDEX idx_moderation_reporter ON moderation_queue(reporter_user_id);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User submit report" ON moderation_queue FOR INSERT
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()
    ))
  );
CREATE POLICY "Admin manage moderation" ON moderation_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================================
-- 6. admin_notes — internal notes on users
-- ============================================================
CREATE TABLE admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_notes_target ON admin_notes(target_user_id, created_at DESC);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage notes" ON admin_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================================
-- 7. active_sessions — login session tracking
-- ============================================================
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL, -- SHA-256 of JWT session_id claim (stable per login session)
  device_info JSONB NOT NULL DEFAULT '{}',
  device_label TEXT,
  ip_address INET,
  approximate_location TEXT,
  is_exam_active BOOLEAN NOT NULL DEFAULT FALSE,
  exam_session_id UUID REFERENCES exam_sessions(id),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_token_hash)
);

CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_exam ON active_sessions(user_id, is_exam_active)
  WHERE is_exam_active = TRUE;

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User read own sessions" ON active_sessions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "User delete own sessions" ON active_sessions FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 8. subscription_events — idempotent Stripe event log
-- ============================================================
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
-- No user access — service role only

-- ============================================================
-- 9. Schema modifications to existing tables
-- ============================================================

-- Track which prompt version generated each transcript
ALTER TABLE session_transcripts
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES prompt_versions(id);

-- Expand exam_sessions status CHECK to allow new statuses
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_status_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'abandoned', 'errored'));

-- Account status management (new columns on user_profiles)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'banned')),
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_method TEXT;

-- Expand subscription_status CHECK to include 'none' for free-tier users
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_subscription_status_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_subscription_status_check
  CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'none'));

-- Index for Stripe customer lookups (only if not already present)
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
  ON user_profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
