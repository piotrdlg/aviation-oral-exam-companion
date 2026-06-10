-- ============================================================
-- Migration: subscription_events retention (W3.4)
-- ============================================================
-- subscription_events stores the full Stripe event payload (incl. customer
-- email / PII) for idempotency + audit. Without retention it grows forever
-- and accumulates PII indefinitely. This pg_cron job purges rows older than
-- 18 months (well past any Stripe retry / dispute window).
--
-- Requires pg_cron (already enabled — other cron jobs exist).
-- ============================================================

DO $$ BEGIN PERFORM cron.unschedule('purge-old-subscription-events'); EXCEPTION WHEN OTHERS THEN NULL; END; $$;
SELECT cron.schedule(
  'purge-old-subscription-events',
  '30 3 * * *', -- daily at 03:30 UTC
  $$ DELETE FROM subscription_events WHERE created_at < NOW() - INTERVAL '18 months'; $$
);
