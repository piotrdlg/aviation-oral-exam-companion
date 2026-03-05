#!/usr/bin/env npx tsx
/**
 * send-nudges.ts
 *
 * Cron-ready script that sends motivation nudge emails to inactive users.
 * Uses the nudge engine to find candidates at inactivity milestones
 * (1, 3, 7, 14, 30 days) and sends variant-specific encouragement emails.
 *
 * Idempotent — checks email_logs to skip users who already received
 * the nudge for their current milestone.
 *
 * Usage: npx tsx scripts/email/send-nudges.ts
 * Or:    npm run email:nudges
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

const CATEGORY = 'motivation_nudges' as const;

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
    templateId: string;
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
      template_id: params.templateId,
      resend_id: params.resendId || null,
      recipient: params.recipient,
      subject: params.subject,
      status: params.status,
      error: params.error || null,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error('[nudge] Failed to write email_log:', err);
  }
}

async function main() {
  console.log('='.repeat(72));
  console.log('  MOTIVATION NUDGE — Send Script');
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
      '[nudge] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    process.exit(1);
  }
  if (!resendKey) {
    console.error('[nudge] Missing RESEND_API_KEY — cannot send emails');
    process.exit(1);
  }
  if (!hmacSecret) {
    console.error(
      '[nudge] Missing UNSUBSCRIBE_HMAC_SECRET — cannot generate unsubscribe URLs',
    );
    process.exit(1);
  }

  // Set env vars so nudge-engine can create its own supabase client
  // (they're already set from dotenv, just confirming they exist)

  // Dynamically import nudge engine (tsx resolves path aliases via tsconfig)
  const { getNudgeCandidates, getNudgeContent, nudgeTemplateId } = await import(
    '../../src/lib/nudge-engine'
  );
  const { MotivationNudgeEmail } = await import(
    '../../src/emails/motivation-nudge'
  );

  const supabase = createClient(supabaseUrl, supabaseKey);
  const resend = new Resend(resendKey);

  // 1. Get nudge candidates
  console.log('[nudge] Querying nudge candidates...');
  const candidates = await getNudgeCandidates();
  console.log(`[nudge] Found ${candidates.length} candidate(s).`);

  if (candidates.length === 0) {
    console.log('[nudge] No candidates. Exiting.');
    process.exit(0);
  }

  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const { userId, email, displayName, daysSinceLastSession, totalSessions, nudgeVariant } = candidate;
    const content = getNudgeContent(nudgeVariant);
    const templateId = nudgeTemplateId(nudgeVariant);
    const unsubscribeUrl = makeUnsubscribeUrl(userId);

    console.log(
      `[nudge] Sending ${nudgeVariant} to ${email} (${daysSinceLastSession} days inactive)...`,
    );

    try {
      const { data, error } = await resend.emails.send({
        from: 'HeyDPE <hello@heydpe.com>',
        to: email,
        subject: content.subject,
        react: MotivationNudgeEmail({
          name: displayName ?? undefined,
          heading: content.heading,
          body: content.body,
          ctaText: content.ctaText,
          daysSinceLastSession,
          totalSessions,
          unsubscribeUrl,
        }),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (error) {
        console.error(`[nudge] Resend error for ${email}:`, error.message);
        failed++;
        await logEmail(supabase, {
          userId,
          recipient: email,
          subject: content.subject,
          templateId,
          status: 'failed',
          error: error.message,
          metadata: { variant: nudgeVariant, daysSinceLastSession },
        });
        continue;
      }

      const resendId = data?.id ?? undefined;
      console.log(`[nudge] Sent to ${email} — Resend ID: ${resendId}`);
      sent++;

      // Log to email_logs
      await logEmail(supabase, {
        userId,
        recipient: email,
        subject: content.subject,
        templateId,
        status: 'sent',
        resendId,
        metadata: {
          variant: nudgeVariant,
          daysSinceLastSession,
          totalSessions,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[nudge] Error sending nudge to ${email}:`, errMsg);
      failed++;
      await logEmail(supabase, {
        userId,
        recipient: email,
        subject: content.subject,
        templateId,
        status: 'failed',
        error: errMsg,
        metadata: { variant: nudgeVariant, daysSinceLastSession },
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
  console.log(`  Candidates:  ${candidates.length}`);
  console.log(`  Sent:        ${sent}`);
  console.log(`  Failed:      ${failed}`);
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error('[nudge] Fatal error:', err);
  process.exit(1);
});
