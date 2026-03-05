-- Phase 20: Email Preferences + Email Logs
-- Adds email preference management, audit logging, and timezone support.

-- 1. Email category enum
CREATE TYPE email_category AS ENUM (
  'account_security',
  'billing_transactional',
  'support_transactional',
  'learning_digest',
  'motivation_nudges',
  'product_updates',
  'marketing'
);

-- 2. Email preferences table
CREATE TABLE email_preferences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category   email_category NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  source     text NOT NULL DEFAULT 'default',  -- 'default', 'user_settings', 'unsubscribe_link', 'admin'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

CREATE INDEX idx_email_preferences_user ON email_preferences(user_id);

-- RLS: users can read/update their own preferences
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own email preferences"
  ON email_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email preferences"
  ON email_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email preferences"
  ON email_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass for cron scripts
CREATE POLICY "Service role full access to email_preferences"
  ON email_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Email logs table (audit trail)
CREATE TABLE email_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category    email_category NOT NULL,
  template_id text NOT NULL,          -- e.g., 'welcome', 'learning-digest', 'nudge-day-3'
  resend_id   text,                   -- Resend API response ID
  recipient   text NOT NULL,          -- email address
  subject     text,
  status      text NOT NULL DEFAULT 'sent',  -- 'sent', 'failed', 'skipped'
  error       text,
  metadata    jsonb DEFAULT '{}',
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_user ON email_logs(user_id);
CREATE INDEX idx_email_logs_category ON email_logs(category);
CREATE INDEX idx_email_logs_template ON email_logs(template_id);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at DESC);
-- For cadence checks: "when was the last nudge sent to this user?"
CREATE INDEX idx_email_logs_user_template ON email_logs(user_id, template_id, sent_at DESC);

-- RLS: users can read their own email logs; service role has full access
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own email logs"
  ON email_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to email_logs"
  ON email_logs FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Add timezone column to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

-- 5. RPC: Get users eligible for a specific email category
-- Used by digest/nudge cron scripts to batch-query eligible recipients.
CREATE OR REPLACE FUNCTION get_email_eligible_users(
  p_category email_category
)
RETURNS TABLE (
  user_id    uuid,
  email      text,
  timezone   text,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.user_id,
    au.email,
    up.timezone,
    up.display_name
  FROM user_profiles up
  JOIN auth.users au ON au.id = up.user_id
  LEFT JOIN email_preferences ep
    ON ep.user_id = up.user_id AND ep.category = p_category
  WHERE up.account_status = 'active'
    AND COALESCE(ep.enabled, true) = true  -- default to enabled if no row
$$;

-- 6. RPC: Initialize default preferences for a user
-- Called on signup or first preference page visit.
CREATE OR REPLACE FUNCTION init_email_preferences(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO email_preferences (user_id, category, enabled, source)
  VALUES
    (p_user_id, 'account_security',       true,  'default'),
    (p_user_id, 'billing_transactional',   true,  'default'),
    (p_user_id, 'support_transactional',   true,  'default'),
    (p_user_id, 'learning_digest',         true,  'default'),
    (p_user_id, 'motivation_nudges',       true,  'default'),
    (p_user_id, 'product_updates',         true,  'default'),
    (p_user_id, 'marketing',              false,  'default')
  ON CONFLICT (user_id, category) DO NOTHING;
END;
$$;
