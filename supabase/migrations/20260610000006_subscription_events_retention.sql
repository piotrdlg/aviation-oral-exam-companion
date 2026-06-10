-- ============================================================
-- Migration: subscription_events retention (W3.4)
-- ============================================================
-- subscription_events stores the full Stripe event payload (incl. customer
-- email / PII) for idempotency + audit. Without retention it grows forever
-- and accumulates PII indefinitely. This pg_cron job purges rows older than
-- 18 months (well past any Stripe retry / dispute window).
--
-- NOTE (W3.4 finding): pg_cron is NOT currently enabled on this project — the
-- `cron` schema does not exist, so this migration is guarded to apply as a
-- NO-OP rather than fail the whole push. The same is true of the session
-- lifecycle jobs in 20260219100002 (trial expiry / stale activity / orphan
-- cleanup): they are NOT running in production until pg_cron is enabled.
--
-- TO ACTIVATE: Dashboard → Database → Extensions → enable `pg_cron`, then
-- re-run the schedule blocks (this migration + 20260219100002).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule('purge-old-subscription-events');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'purge-old-subscription-events',
      '30 3 * * *', -- daily at 03:30 UTC
      $job$ DELETE FROM subscription_events WHERE created_at < NOW() - INTERVAL '18 months'; $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping purge-old-subscription-events. Enable pg_cron and re-run.';
  END IF;
END $$;
