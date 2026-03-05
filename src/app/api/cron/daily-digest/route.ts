import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildDailyDigest } from '@/lib/digest-builder';
import { sendLearningDigest } from '@/lib/email';
import { logEmailSent } from '@/lib/email-logging';
import { generateUnsubscribeUrl } from '@/lib/unsubscribe-token';
import { flushPostHog } from '@/lib/posthog-server';

export const maxDuration = 60; // Allow up to 60s for batch processing

/**
 * Vercel Cron: Daily Learning Digest
 * Schedule: 8:00 AM ET daily (13:00 UTC)
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron:digest] Starting...');
  const startTime = Date.now();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const stats = { eligible: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    // Get eligible users
    const { data: users, error } = await supabase.rpc('get_email_eligible_users', {
      p_category: 'learning_digest',
    });

    if (error || !users) {
      console.error('[cron:digest] Failed to get eligible users:', error);
      return NextResponse.json({ error: 'Failed to query users' }, { status: 500 });
    }

    stats.eligible = users.length;
    const today = new Date().toISOString().slice(0, 10);

    for (const user of users) {
      try {
        // Check if already sent today
        const { data: existing } = await supabase
          .from('email_logs')
          .select('id')
          .eq('user_id', user.user_id)
          .eq('template_id', 'learning-digest')
          .eq('status', 'sent')
          .gte('sent_at', `${today}T00:00:00Z`)
          .limit(1)
          .maybeSingle();

        if (existing) {
          stats.skipped++;
          continue;
        }

        // Build digest
        const unsubscribeUrl = generateUnsubscribeUrl(user.user_id, 'learning_digest');
        const digest = await buildDailyDigest(user.user_id, user.email, unsubscribeUrl);

        if (!digest) {
          stats.skipped++;
          continue;
        }

        // Send
        const resendId = await sendLearningDigest(user.email, digest);

        if (resendId) {
          stats.sent++;
          await logEmailSent({
            userId: user.user_id,
            category: 'learning_digest',
            templateId: 'learning-digest',
            resendId,
            recipient: user.email,
            subject: `Your HeyDPE study briefing`,
            status: 'sent',
          });
        } else {
          stats.failed++;
          await logEmailSent({
            userId: user.user_id,
            category: 'learning_digest',
            templateId: 'learning-digest',
            recipient: user.email,
            status: 'failed',
            error: 'sendLearningDigest returned null',
          });
        }
      } catch (err) {
        stats.failed++;
        console.error(`[cron:digest] Error for user ${user.user_id}:`, err);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[cron:digest] Complete in ${elapsed}ms — eligible: ${stats.eligible}, sent: ${stats.sent}, skipped: ${stats.skipped}, failed: ${stats.failed}`);
    await flushPostHog();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error('[cron:digest] Fatal error:', err);
    await flushPostHog();
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
