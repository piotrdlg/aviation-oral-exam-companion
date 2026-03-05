#!/usr/bin/env npx tsx
/**
 * send-daily-digest.ts
 *
 * Cron-ready script that sends daily learning digest emails to eligible users.
 * Queries the `get_email_eligible_users('learning_digest')` RPC for recipients,
 * builds a personalized digest from their element scores, and sends via Resend.
 *
 * Idempotent — checks email_logs to skip users who already received a digest today.
 *
 * Usage: npx tsx scripts/email/send-daily-digest.ts
 * Or:    npm run email:daily-digest
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *              RESEND_API_KEY, UNSUBSCRIBE_HMAC_SECRET
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env

import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { Resend } from 'resend';

const TEMPLATE_ID = 'learning-digest';
const CATEGORY = 'learning_digest' as const;

interface EligibleUser {
  user_id: string;
  email: string;
  timezone: string;
  display_name: string | null;
}

// ============================================================
// Inline helpers (avoid importing server-only modules)
// ============================================================

/** Generate unsubscribe URL (mirrors src/lib/unsubscribe-token.ts) */
function makeUnsubscribeUrl(userId: string): string {
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET!;
  const payload = `${userId}:${CATEGORY}`;
  const token = createHmac('sha256', secret).update(payload).digest('hex');
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://aviation-oral-exam-companion.vercel.app';
  return `${base}/email/preferences?uid=${userId}&cat=${CATEGORY}&token=${token}`;
}

/** Insert a row into email_logs via the service-role supabase client */
async function logEmail(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    recipient: string;
    subject: string;
    status: 'sent' | 'failed' | 'skipped';
    resendId?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from('email_logs').insert({
      user_id: params.userId,
      category: CATEGORY,
      template_id: TEMPLATE_ID,
      resend_id: params.resendId || null,
      recipient: params.recipient,
      subject: params.subject,
      status: params.status,
      error: params.error || null,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error('[digest] Failed to write email_log:', err);
  }
}

async function main() {
  console.log('='.repeat(72));
  console.log('  DAILY LEARNING DIGEST — Send Script');
  console.log('  Date:', new Date().toISOString());
  console.log('='.repeat(72));
  console.log();

  // Validate env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const hmacSecret = process.env.UNSUBSCRIBE_HMAC_SECRET;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[digest] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    process.exit(1);
  }
  if (!resendKey) {
    console.error('[digest] Missing RESEND_API_KEY — cannot send emails');
    process.exit(1);
  }
  if (!hmacSecret) {
    console.error(
      '[digest] Missing UNSUBSCRIBE_HMAC_SECRET — cannot generate unsubscribe URLs',
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Query eligible users
  const { data: eligibleUsers, error: eligibleError } = await supabase.rpc(
    'get_email_eligible_users',
    { p_category: CATEGORY },
  );

  if (eligibleError) {
    console.error(
      '[digest] Failed to query eligible users:',
      eligibleError.message,
    );
    process.exit(1);
  }

  const users = (eligibleUsers || []) as EligibleUser[];
  console.log(`[digest] Found ${users.length} eligible user(s).`);

  if (users.length === 0) {
    console.log('[digest] No eligible users. Exiting.');
    process.exit(0);
  }

  // Dynamically import modules (tsx resolves path aliases via tsconfig)
  const { buildDailyDigest } = await import('../../src/lib/digest-builder');
  const { LearningDigestEmail } = await import(
    '../../src/emails/learning-digest'
  );

  const resend = new Resend(resendKey);

  // Today's date boundary for idempotency
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let sent = 0;
  let skipped = 0;
  let noData = 0;
  let failed = 0;

  for (const user of users) {
    const userId = user.user_id;
    const email = user.email;

    // 2. Check if digest was already sent today
    const { data: recentLog } = await supabase
      .from('email_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('template_id', TEMPLATE_ID)
      .eq('status', 'sent')
      .gte('sent_at', todayStart.toISOString())
      .limit(1)
      .maybeSingle();

    if (recentLog) {
      console.log(`[digest] Skipping ${email} — already sent today.`);
      skipped++;
      continue;
    }

    // 3. Build the digest
    const unsubscribeUrl = makeUnsubscribeUrl(userId);

    let digestData: Awaited<ReturnType<typeof buildDailyDigest>>;
    try {
      digestData = await buildDailyDigest(userId, email, unsubscribeUrl);
    } catch (err) {
      console.error(`[digest] Error building digest for ${email}:`, err);
      failed++;
      continue;
    }

    if (!digestData) {
      console.log(`[digest] Skipping ${email} — no practice data to report.`);
      noData++;
      continue;
    }

    // 4. Send the email
    const subject = `Your HeyDPE study briefing — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    try {
      const { data, error } = await resend.emails.send({
        from: 'HeyDPE <hello@heydpe.com>',
        to: email,
        subject,
        react: LearningDigestEmail(digestData),
        headers: {
          'List-Unsubscribe': `<${digestData.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (error) {
        console.error(`[digest] Resend error for ${email}:`, error.message);
        failed++;
        await logEmail(supabase, {
          userId,
          recipient: email,
          subject,
          status: 'failed',
          error: error.message,
        });
        continue;
      }

      const resendId = data?.id ?? undefined;
      console.log(`[digest] Sent to ${email} — Resend ID: ${resendId}`);
      sent++;

      // 5. Log to email_logs
      await logEmail(supabase, {
        userId,
        recipient: email,
        subject,
        status: 'sent',
        resendId,
        metadata: {
          rating: digestData.rating,
          weakAreaCount: digestData.weakAreas.length,
          strongAreaCount: digestData.strongAreas.length,
          recentSessionCount: digestData.recentSessionCount,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[digest] Error sending digest to ${email}:`, errMsg);
      failed++;
      await logEmail(supabase, {
        userId,
        recipient: email,
        subject,
        status: 'failed',
        error: errMsg,
      });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  // Print summary
  console.log();
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Eligible users:   ${users.length}`);
  console.log(`  Sent:             ${sent}`);
  console.log(`  Skipped (dupe):   ${skipped}`);
  console.log(`  Skipped (no data):${noData}`);
  console.log(`  Failed:           ${failed}`);
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error('[digest] Fatal error:', err);
  process.exit(1);
});
