-- Session Policy Redesign: schema changes, pg_cron jobs, and backfill
-- Design doc: docs/plans/2026-02-19-session-policy-redesign-design.md

-- 1. Add new columns
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS is_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS result JSONB;

-- 2. Update status constraint: replace 'errored' with 'expired'
-- Migrate any existing 'errored' rows before applying new constraint
UPDATE exam_sessions SET status = 'abandoned' WHERE status = 'errored';
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_status_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'expired', 'abandoned'));

-- 3. Index for trial limit counting (fast count of non-onboarding exams per user)
CREATE INDEX IF NOT EXISTS idx_exam_sessions_trial_count
  ON exam_sessions(user_id, is_onboarding, status)
  WHERE is_onboarding = FALSE AND status != 'abandoned';

-- 4. Index for expiry cron job
CREATE INDEX IF NOT EXISTS idx_exam_sessions_expires
  ON exam_sessions(expires_at)
  WHERE expires_at IS NOT NULL AND status IN ('active', 'paused');

-- 5. Backfill: mark stale active sessions as abandoned
-- Note: 24-hour buffer on 0-exchange condition to avoid destroying fresh sessions
UPDATE exam_sessions
SET status = 'abandoned', ended_at = NOW()
WHERE status = 'active'
  AND (
    (exchange_count = 0 AND started_at < NOW() - INTERVAL '24 hours')
    OR started_at < NOW() - INTERVAL '7 days'
  );

-- 6. Backfill: set expires_at for existing free-trial active/paused exams
UPDATE exam_sessions e
SET expires_at = e.started_at + INTERVAL '7 days'
FROM user_profiles p
WHERE e.user_id = p.user_id
  AND p.subscription_status = 'none'
  AND e.status IN ('active', 'paused')
  AND e.expires_at IS NULL;

-- 7. pg_cron jobs (requires pg_cron extension enabled in Supabase dashboard)
-- NOTE: If pg_cron is not yet enabled, these will fail. Enable it first:
--   Supabase Dashboard > Database > Extensions > search "pg_cron" > Enable

-- Job 1: Clear stale activity windows (every 15 minutes)
-- Clears is_exam_active on devices idle for 2+ hours.
-- Does NOT change the exam's status -- exam stays resumable.
SELECT cron.unschedule('clear-stale-activity-windows');
SELECT cron.schedule(
  'clear-stale-activity-windows',
  '*/15 * * * *',
  $$
    UPDATE active_sessions
    SET is_exam_active = FALSE, exam_session_id = NULL
    WHERE is_exam_active = TRUE
      AND last_activity_at < NOW() - INTERVAL '2 hours';
  $$
);

-- Job 2: Expire free trial exams past their 7-day window (every hour)
SELECT cron.unschedule('expire-trial-exams');
SELECT cron.schedule(
  'expire-trial-exams',
  '0 * * * *',
  $$
    UPDATE exam_sessions
    SET status = 'expired', ended_at = NOW()
    WHERE status IN ('active', 'paused')
      AND expires_at IS NOT NULL
      AND expires_at < NOW();
  $$
);

-- Job 3: Clean up orphaned exams with 0 exchanges (daily at 3 AM UTC)
SELECT cron.unschedule('cleanup-orphaned-exams');
SELECT cron.schedule(
  'cleanup-orphaned-exams',
  '0 3 * * *',
  $$
    UPDATE exam_sessions
    SET status = 'abandoned', ended_at = NOW()
    WHERE status = 'active'
      AND exchange_count = 0
      AND started_at < NOW() - INTERVAL '24 hours';
  $$
);
