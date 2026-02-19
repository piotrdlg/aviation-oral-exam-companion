-- Session Policy Redesign: pg_cron scheduled jobs
-- Requires pg_cron extension enabled in Supabase dashboard BEFORE applying:
--   Dashboard > Database > Extensions > search "pg_cron" > Enable

-- Job 1: Clear stale activity windows (every 15 minutes)
-- Clears is_exam_active on devices idle for 2+ hours.
-- Does NOT change the exam's status -- exam stays resumable.
DO $$ BEGIN PERFORM cron.unschedule('clear-stale-activity-windows'); EXCEPTION WHEN OTHERS THEN NULL; END; $$;
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
DO $$ BEGIN PERFORM cron.unschedule('expire-trial-exams'); EXCEPTION WHEN OTHERS THEN NULL; END; $$;
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
-- Also covers paused sessions with 0 exchanges (started on one device, abandoned)
DO $$ BEGIN PERFORM cron.unschedule('cleanup-orphaned-exams'); EXCEPTION WHEN OTHERS THEN NULL; END; $$;
SELECT cron.schedule(
  'cleanup-orphaned-exams',
  '0 3 * * *',
  $$
    UPDATE exam_sessions
    SET status = 'abandoned', ended_at = NOW()
    WHERE status IN ('active', 'paused')
      AND exchange_count = 0
      AND started_at < NOW() - INTERVAL '24 hours';
  $$
);
