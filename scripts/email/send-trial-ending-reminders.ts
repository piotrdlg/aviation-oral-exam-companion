#!/usr/bin/env npx tsx
/**
 * send-trial-ending-reminders.ts
 *
 * Cron-ready script that queries user_profiles for users whose Stripe trial
 * ends in 2 days, and sends a reminder email. Idempotent — records sent
 * reminders in user_profiles.metadata.trial_reminder_sent to prevent duplicates.
 *
 * Usage: npx tsx scripts/email/send-trial-ending-reminders.ts
 * Or:    npm run email:trial-reminders
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAYS_BEFORE_END = 2;

interface TrialUser {
  user_id: string;
  email: string;
  full_name: string | null;
  subscription_status: string;
  trial_end: string;
  stripe_plan_id: string | null;
  metadata: Record<string, unknown> | null;
}

async function main() {
  console.log('[trial-reminders] Starting trial ending reminder scan...');

  // Calculate the target date range: trials ending in DAYS_BEFORE_END days
  const now = new Date();
  const targetStart = new Date(now);
  targetStart.setDate(targetStart.getDate() + DAYS_BEFORE_END);
  targetStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetStart);
  targetEnd.setHours(23, 59, 59, 999);

  // Query user_profiles for trialing users whose trial_end falls in range
  const { data: users, error } = await supabase
    .from('user_profiles')
    .select('user_id, email, full_name, subscription_status, trial_end, stripe_plan_id, metadata')
    .eq('subscription_status', 'trialing')
    .gte('trial_end', targetStart.toISOString())
    .lte('trial_end', targetEnd.toISOString());

  if (error) {
    console.error('[trial-reminders] Query error:', error.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('[trial-reminders] No users with trials ending in', DAYS_BEFORE_END, 'days.');
    process.exit(0);
  }

  console.log(`[trial-reminders] Found ${users.length} user(s) with trials ending in ${DAYS_BEFORE_END} days.`);

  // Dynamically import the email function (uses Resend)
  const { sendTrialEndingReminder } = await import('../../src/lib/email');

  let sent = 0;
  let skipped = 0;

  for (const user of users as TrialUser[]) {
    // Idempotency: check if reminder already sent
    const metadata = user.metadata || {};
    if (metadata.trial_reminder_sent) {
      console.log(`[trial-reminders] Skipping ${user.email} — already sent.`);
      skipped++;
      continue;
    }

    // Determine plan from stripe_plan_id
    const plan: 'monthly' | 'annual' =
      user.stripe_plan_id?.includes('annual') ? 'annual' : 'monthly';

    await sendTrialEndingReminder(user.email, DAYS_BEFORE_END, plan, user.full_name || undefined);

    // Mark as sent in metadata (idempotency guard)
    await supabase
      .from('user_profiles')
      .update({
        metadata: { ...metadata, trial_reminder_sent: new Date().toISOString() },
      })
      .eq('user_id', user.user_id);

    console.log(`[trial-reminders] Sent to ${user.email} (${plan} plan)`);
    sent++;
  }

  console.log(`[trial-reminders] Done. Sent: ${sent}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('[trial-reminders] Fatal error:', err);
  process.exit(1);
});
