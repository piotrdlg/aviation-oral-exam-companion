/**
 * scripts/send-instructor-weekly.ts
 *
 * Send weekly instructor summary emails to all eligible instructors.
 * Run: npx tsx scripts/send-instructor-weekly.ts [--dry-run] [--review]
 *
 * --dry-run: Build summaries but don't send emails
 * --review: Print one sample summary to stdout for review
 */

import { createClient } from '@supabase/supabase-js';
import { buildInstructorWeeklySummary } from '../src/lib/instructor-summary-builder';
import type { InstructorForEmail } from '../src/lib/instructor-summary-builder';
import { sendInstructorWeeklySummary } from '../src/lib/email';
import { isEmailCategoryEnabled } from '../src/lib/email-preferences';
import { logEmailSent } from '../src/lib/email-logging';
import { getLastEmailSentAt } from '../src/lib/email-logging';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const isDryRun = process.argv.includes('--dry-run');
const isReview = process.argv.includes('--review');

async function main() {
  console.log(`[instructor-weekly] Starting${isDryRun ? ' (DRY RUN)' : ''}...`);

  // 1. Get all approved instructors with connected students
  const { data: instructors, error } = await supabase
    .from('instructor_profiles')
    .select('user_id, first_name, last_name, status')
    .eq('status', 'approved');

  if (error) {
    console.error('[instructor-weekly] Failed to fetch instructors:', error.message);
    process.exit(1);
  }

  if (!instructors || instructors.length === 0) {
    console.log('[instructor-weekly] No approved instructors found.');
    process.exit(0);
  }

  console.log(`[instructor-weekly] Found ${instructors.length} approved instructor(s).`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const instr of instructors) {
    const userId = instr.user_id as string;
    const displayName = [instr.first_name, instr.last_name].filter(Boolean).join(' ') || null;

    // Get email address
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    if (!authUser?.user?.email) {
      console.log(`[instructor-weekly] No email for instructor ${userId.slice(0, 8)}, skipping.`);
      skipped++;
      continue;
    }

    // Check email preference
    const enabled = await isEmailCategoryEnabled(supabase, userId, 'instructor_weekly_summary');
    if (!enabled) {
      console.log(`[instructor-weekly] ${userId.slice(0, 8)} opted out, skipping.`);
      skipped++;
      continue;
    }

    // Check cadence: don't send if sent in last 6 days
    const lastSent = await getLastEmailSentAt(userId, 'instructor-weekly-summary');
    if (lastSent) {
      const daysSince = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 6) {
        console.log(`[instructor-weekly] ${userId.slice(0, 8)} already received ${daysSince.toFixed(1)} days ago, skipping.`);
        skipped++;
        continue;
      }
    }

    // Build summary
    const instructor: InstructorForEmail = {
      userId,
      email: authUser.user.email,
      displayName,
    };

    const summaryData = await buildInstructorWeeklySummary(supabase, instructor);
    if (!summaryData) {
      console.log(`[instructor-weekly] ${userId.slice(0, 8)} has no connected students, skipping.`);
      skipped++;
      continue;
    }

    // Review mode: print one sample and exit
    if (isReview) {
      console.log('\n=== SAMPLE SUMMARY ===');
      console.log(JSON.stringify(summaryData, null, 2));
      console.log('=== END SAMPLE ===\n');
      process.exit(0);
    }

    // Dry run: log but don't send
    if (isDryRun) {
      console.log(`[instructor-weekly] Would send to ${authUser.user.email} (${summaryData.totalStudents} students, ${summaryData.needsAttentionCount} attention)`);
      sent++;
      continue;
    }

    // Send email
    const resendId = await sendInstructorWeeklySummary(authUser.user.email, summaryData);

    if (resendId) {
      console.log(`[instructor-weekly] Sent to ${authUser.user.email} (id: ${resendId})`);
      await logEmailSent({
        userId,
        category: 'instructor_weekly_summary',
        templateId: 'instructor-weekly-summary',
        resendId,
        recipient: authUser.user.email,
        subject: `Instructor Weekly Summary — ${summaryData.weekLabel}`,
        status: 'sent',
        metadata: {
          totalStudents: summaryData.totalStudents,
          activeStudents: summaryData.activeStudents,
          needsAttention: summaryData.needsAttentionCount,
        },
      });
      sent++;
    } else {
      console.error(`[instructor-weekly] Failed to send to ${authUser.user.email}`);
      await logEmailSent({
        userId,
        category: 'instructor_weekly_summary',
        templateId: 'instructor-weekly-summary',
        recipient: authUser.user.email,
        status: 'failed',
      });
      failed++;
    }
  }

  console.log(`\n[instructor-weekly] Done. Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error('[instructor-weekly] Fatal error:', err);
  process.exit(1);
});
