import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getInstructorStudentList } from '@/lib/instructor-student-summary';
import { getStudentInsights } from '@/lib/instructor-insights';
import { generateUnsubscribeUrl } from '@/lib/unsubscribe-token';
import type { InstructorWeeklySummaryProps, StudentEmailSummary } from '@/emails/instructor-weekly-summary';

export interface InstructorForEmail {
  userId: string;
  email: string;
  displayName: string | null;
  referralCode?: string;
}

/**
 * Build referral link and QR URL from an instructor's referral code.
 */
function buildReferralUrls(referralCode: string | undefined): {
  referralCode?: string;
  referralLink?: string;
  qrUrl?: string;
} {
  if (!referralCode) return {};
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://aviation-oral-exam-companion.vercel.app';
  return {
    referralCode,
    referralLink: `${base}/ref/${referralCode}`,
    qrUrl: `${base}/api/public/qr/referral/${referralCode}`,
  };
}

/**
 * Build the weekly summary data for a single instructor.
 * When instructor has 0 connected students, returns a referral-nudge variant.
 * Returns null only if unsubscribe URL generation fails (should never happen).
 */
export async function buildInstructorWeeklySummary(
  supabase: ReturnType<typeof createClient>,
  instructor: InstructorForEmail,
): Promise<InstructorWeeklySummaryProps | null> {
  // Calculate week label (shared by both variants)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const unsubscribeUrl = generateUnsubscribeUrl(instructor.userId, 'instructor_weekly_summary');

  // Get student list
  const students = await getInstructorStudentList(supabase, instructor.userId);

  // 0-students variant: return referral nudge email props
  if (students.length === 0) {
    const referralUrls = buildReferralUrls(instructor.referralCode);
    return {
      instructorName: instructor.displayName || 'Instructor',
      weekLabel,
      totalStudents: 0,
      activeStudents: 0,
      needsAttentionCount: 0,
      students: [],
      unsubscribeUrl,
      ...referralUrls,
    };
  }

  // Build per-student summaries with insights
  const studentSummaries: StudentEmailSummary[] = [];

  for (const student of students) {
    // Get full insights (includes milestones, trends, attention flags)
    const insights = await getStudentInsights(supabase, instructor.userId, student.studentUserId);

    let milestoneCompleted: string | null = null;
    if (insights) {
      // Find most recently completed milestone
      const completedMilestones = insights.milestones.filter(m => m.status === 'completed' && m.declaredAt);
      if (completedMilestones.length > 0) {
        const sorted = [...completedMilestones].sort(
          (a, b) => new Date(b.declaredAt!).getTime() - new Date(a.declaredAt!).getTime()
        );
        const LABELS: Record<string, string> = {
          knowledge_test_passed: 'FAA Knowledge Test',
          mock_oral_completed: 'Mock Oral Exam',
          checkride_scheduled: 'Checkride Scheduled',
          oral_passed: 'Oral Exam Passed',
        };
        milestoneCompleted = LABELS[sorted[0].key] || sorted[0].key;
      }
    }

    studentSummaries.push({
      displayName: student.displayName || 'Student',
      readinessScore: insights?.readinessScore ?? student.readinessScore,
      readinessTrend: insights?.readinessTrend ?? 'insufficient_data',
      sessionsThisWeek: student.sessionsLast7Days,
      needsAttention: insights?.needsAttention ?? false,
      needsAttentionReasons: insights?.needsAttentionReasons ?? [],
      milestoneCompleted,
    });
  }

  const activeStudents = studentSummaries.filter(s => s.sessionsThisWeek > 0).length;
  const needsAttentionCount = studentSummaries.filter(s => s.needsAttention).length;

  return {
    instructorName: instructor.displayName || 'Instructor',
    weekLabel,
    totalStudents: students.length,
    activeStudents,
    needsAttentionCount,
    students: studentSummaries,
    unsubscribeUrl,
  };
}
