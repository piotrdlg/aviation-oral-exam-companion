import { NextResponse } from 'next/server';
import { getNudgeCandidates, getNudgeContent, nudgeTemplateId } from '@/lib/nudge-engine';
import { sendMotivationNudge } from '@/lib/email';
import { logEmailSent } from '@/lib/email-logging';
import { generateUnsubscribeUrl } from '@/lib/unsubscribe-token';
import { flushPostHog } from '@/lib/posthog-server';

export const maxDuration = 60; // Allow up to 60s for batch processing

/**
 * Vercel Cron: Motivation Nudges
 * Schedule: 10:00 AM ET daily (15:00 UTC)
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron:nudges] Starting...');
  const startTime = Date.now();

  const stats = { candidates: 0, sent: 0, failed: 0 };

  try {
    const candidates = await getNudgeCandidates();
    stats.candidates = candidates.length;

    for (const candidate of candidates) {
      try {
        const content = getNudgeContent(candidate.nudgeVariant);
        const unsubscribeUrl = generateUnsubscribeUrl(candidate.userId, 'motivation_nudges');
        const templateId = nudgeTemplateId(candidate.nudgeVariant);

        const resendId = await sendMotivationNudge(
          candidate.email,
          {
            name: candidate.displayName || undefined,
            variant: candidate.nudgeVariant,
            heading: content.heading,
            body: content.body,
            ctaText: content.ctaText,
            subject: content.subject,
            daysSinceLastSession: candidate.daysSinceLastSession,
            totalSessions: candidate.totalSessions,
            unsubscribeUrl,
          },
        );

        if (resendId) {
          stats.sent++;
          await logEmailSent({
            userId: candidate.userId,
            category: 'motivation_nudges',
            templateId,
            resendId,
            recipient: candidate.email,
            subject: content.subject,
            status: 'sent',
            metadata: { variant: candidate.nudgeVariant, daysSince: candidate.daysSinceLastSession },
          });
        } else {
          stats.failed++;
          await logEmailSent({
            userId: candidate.userId,
            category: 'motivation_nudges',
            templateId,
            recipient: candidate.email,
            status: 'failed',
            error: 'sendMotivationNudge returned null',
          });
        }
      } catch (err) {
        stats.failed++;
        console.error(`[cron:nudges] Error for user ${candidate.userId}:`, err);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[cron:nudges] Complete in ${elapsed}ms — candidates: ${stats.candidates}, sent: ${stats.sent}, failed: ${stats.failed}`);
    await flushPostHog();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error('[cron:nudges] Fatal error:', err);
    await flushPostHog();
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
