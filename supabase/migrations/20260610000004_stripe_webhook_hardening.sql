-- ============================================================
-- Migration: Stripe webhook hardening (W3.1)
-- ============================================================
-- Additive + safe for the THREE existing paying users.
--
-- 1. Widen subscription_status CHECK to include the remaining Stripe enum
--    values ('paused', 'incomplete_expired') so a future event of that type
--    can no longer violate the constraint, get marked 'failed', and retry
--    forever without updating the user's tier (review-05 #13).
-- 2. Add last_stripe_event_created — the out-of-order delivery guard now
--    compares Stripe's event.created time, not the webhook's processing time
--    (review-05 #5). Brand-new column: NULL everywhere, so the FIRST real
--    event per customer always passes the guard. NO backfill needed.
-- 3. Add has_trialed — checkout omits the 7-day trial for returning
--    customers (review-05 #6). Backfilled true for anyone who has ever had a
--    Stripe customer record or a trial, so existing customers (incl. the 3
--    payers) cannot mint a fresh free trial by re-subscribing.
-- ============================================================

-- 1. Widen the subscription_status CHECK (additive — no data rewrite)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_subscription_status_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_subscription_status_check
  CHECK (subscription_status IN (
    'active', 'past_due', 'canceled', 'trialing',
    'incomplete', 'incomplete_expired', 'unpaid', 'paused', 'none'
  ));

-- 2. Event-creation-time ordering guard column
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_stripe_event_created TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.last_stripe_event_created IS
  'Stripe event.created time of the most recently APPLIED subscription webhook. '
  'Out-of-order guard: a webhook is applied only when its event.created is newer. '
  'Replaces last_webhook_event_ts (processing time), which was a no-op guard.';

-- 3. Trial-abuse guard column
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS has_trialed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.has_trialed IS
  'True once the user has consumed a Stripe free trial. Checkout omits '
  'trial_period_days when true to prevent infinite re-trialing (review-05 #6).';

-- Backfill: existing customers have already had their one trial.
UPDATE user_profiles
SET has_trialed = true
WHERE stripe_customer_id IS NOT NULL OR trial_end IS NOT NULL;
