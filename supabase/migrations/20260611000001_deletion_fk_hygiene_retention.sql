-- ============================================================
-- Migration: deletion FK hygiene + telemetry retention (W6.3)
-- ============================================================
-- Account deletion (GDPR / Apple requirement) works via
-- auth.admin.deleteUser + FK cascades. The audit (docs/reviews .../06 D2-D4
-- + repo-wide FK inventory 2026-06-10) found 17 FKs to auth.users with NO
-- ACTION — any one of them BLOCKS user deletion.
--
-- Policy:
--   ownership data (the user's own rows)        → ON DELETE CASCADE
--   actor/audit columns (who approved/created)  → ON DELETE SET NULL
--     (the RECORD survives — audit trails and other users' data are never
--      destroyed by someone else's deletion; NOT NULL dropped where needed)

-- ---- ownership → CASCADE ------------------------------------
ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_user_id_fkey;
ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_session_id_fkey;
ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE SET NULL;

ALTER TABLE instructor_invite_events DROP CONSTRAINT IF EXISTS instructor_invite_events_instructor_user_id_fkey;
ALTER TABLE instructor_invite_events ADD CONSTRAINT instructor_invite_events_instructor_user_id_fkey
  FOREIGN KEY (instructor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---- actor/audit columns → SET NULL -------------------------
-- Drop NOT NULL where present so SET NULL can apply.
ALTER TABLE admin_audit_log ALTER COLUMN admin_user_id DROP NOT NULL;
ALTER TABLE admin_notes ALTER COLUMN admin_user_id DROP NOT NULL;
ALTER TABLE student_milestones ALTER COLUMN declared_by_user_id DROP NOT NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype = 'a'  -- NO ACTION
      AND (c.conrelid::regclass::text, a.attname) IN (
        ('admin_audit_log',               'admin_user_id'),
        ('admin_notes',                   'admin_user_id'),
        ('instructor_access_overrides',   'created_by'),
        ('instructor_access_overrides',   'revoked_by'),
        ('instructor_invites',            'claimed_by_user_id'),
        ('instructor_profiles',           'approved_by'),
        ('instructor_profiles',           'rejected_by'),
        ('instructor_profiles',           'suspended_by'),
        ('instructor_quota_overrides',    'created_by'),
        ('moderation_queue',              'reporter_user_id'),
        ('moderation_queue',              'resolved_by'),
        ('prompt_versions',               'created_by'),
        ('prompt_versions',               'published_by'),
        ('student_instructor_connections','approved_by'),
        ('student_instructor_connections','disconnected_by'),
        ('student_milestones',            'declared_by_user_id'),
        ('system_config',                 'updated_by'),
        ('user_entitlement_overrides',    'created_by')
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col
    );
  END LOOP;
END $$;

-- ---- GDPR consent acknowledgment (used by W6.5 too) ---------
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS disclaimer_acknowledged_at TIMESTAMPTZ;

-- ---- telemetry retention (pg_cron-guarded — see DATABASE.md) -
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN PERFORM cron.unschedule('purge-old-latency-logs'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('purge-old-latency-logs', '40 3 * * *',
      $job$ DELETE FROM latency_logs WHERE timestamp < NOW() - INTERVAL '90 days'; $job$);
    BEGIN PERFORM cron.unschedule('purge-old-usage-logs'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('purge-old-usage-logs', '50 3 * * *',
      $job$ DELETE FROM usage_logs WHERE created_at < NOW() - INTERVAL '13 months'; $job$);
  ELSE
    RAISE NOTICE 'pg_cron not enabled — retention jobs skipped. Enable pg_cron and re-run (DATABASE.md).';
  END IF;
END $$;
