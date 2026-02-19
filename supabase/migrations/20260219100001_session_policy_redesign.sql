-- Session Policy Redesign: schema changes and backfill
-- Design doc: docs/plans/2026-02-19-session-policy-redesign-design.md
-- NOTE: pg_cron jobs are in a separate migration (20260219100002) to allow
-- applying schema changes before the extension is enabled.

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
WHERE status IN ('active', 'paused')
  AND ended_at IS NULL
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
