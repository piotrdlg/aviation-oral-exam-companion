/**
 * nudge-engine.ts
 *
 * Determines which users should receive a motivation nudge based on
 * inactivity cadence. Queries last session date and email_logs to
 * avoid duplicate sends, respects email_preferences opt-outs.
 *
 * Does NOT import 'server-only' so it can be used from tsx scripts.
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// Types
// ============================================================

export type NudgeVariant = 'day_1' | 'day_3' | 'day_7' | 'day_14' | 'day_30';

export interface NudgeCandidate {
  userId: string;
  email: string;
  displayName: string | null;
  timezone: string;
  daysSinceLastSession: number;
  totalSessions: number;
  nudgeVariant: NudgeVariant;
}

export interface NudgeContent {
  subject: string;
  heading: string;
  body: string;
  ctaText: string;
}

// ============================================================
// Cadence milestones
// ============================================================

const NUDGE_MILESTONES: { days: number; variant: NudgeVariant }[] = [
  { days: 1, variant: 'day_1' },
  { days: 3, variant: 'day_3' },
  { days: 7, variant: 'day_7' },
  { days: 14, variant: 'day_14' },
  { days: 30, variant: 'day_30' },
];

const TEMPLATE_PREFIX = 'motivation-nudge';
const CATEGORY = 'motivation_nudges' as const;

// ============================================================
// Service client (lazy, same pattern as email-logging.ts)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;

function getServiceClient() {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Match days-since-last-session to the nearest nudge milestone.
 * Only matches if the user is AT or just PAST the milestone
 * (within a 1-day window for milestones 1-7, 2-day window for 14+).
 */
function matchMilestone(daysSince: number): NudgeVariant | null {
  // Walk milestones from largest to smallest
  for (let i = NUDGE_MILESTONES.length - 1; i >= 0; i--) {
    const { days, variant } = NUDGE_MILESTONES[i];
    const tolerance = days >= 14 ? 2 : 1;
    if (daysSince >= days && daysSince < days + tolerance) {
      return variant;
    }
  }
  return null;
}

/**
 * Template ID for a given nudge variant (used in email_logs).
 */
export function nudgeTemplateId(variant: NudgeVariant): string {
  return `${TEMPLATE_PREFIX}-${variant}`;
}

// ============================================================
// getNudgeCandidates
// ============================================================

/**
 * Query all active users who should receive a motivation nudge.
 *
 * For each user:
 * 1. Get their most recent exam_session started_at
 * 2. Compute days since last session
 * 3. Match to a nudge milestone
 * 4. Check email_logs — skip if nudge for this milestone already sent
 * 5. Check email_preferences — skip if motivation_nudges disabled
 *
 * Returns list of NudgeCandidates ready for sending.
 */
export async function getNudgeCandidates(): Promise<NudgeCandidate[]> {
  const supabase = getServiceClient();
  if (!supabase) {
    console.error('[nudge] No supabase client — missing env vars');
    return [];
  }

  // 1. Get eligible users via the same RPC used by other email scripts
  const { data: eligibleUsers, error: eligibleError } = await supabase.rpc(
    'get_email_eligible_users',
    { p_category: CATEGORY },
  );

  if (eligibleError) {
    console.error('[nudge] Failed to query eligible users:', eligibleError.message);
    return [];
  }

  if (!eligibleUsers || eligibleUsers.length === 0) {
    return [];
  }

  const candidates: NudgeCandidate[] = [];
  const now = new Date();

  for (const user of eligibleUsers) {
    const userId: string = user.user_id;
    const email: string = user.email;
    const displayName: string | null = user.display_name || null;
    const timezone: string = user.timezone || 'America/New_York';

    // 2. Get most recent session
    const { data: lastSession } = await supabase
      .from('exam_sessions')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastSession) {
      // No sessions at all — they might have signed up but never practiced.
      // Treat signup date as the anchor point (but we don't have it here easily).
      // Skip for now — nudges are for returning users.
      continue;
    }

    // 3. Compute days since last session
    const lastSessionDate = new Date(lastSession.started_at);
    const daysSince = Math.floor(
      (now.getTime() - lastSessionDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSince < 1) {
      // Active today — no nudge needed
      continue;
    }

    // 4. Match to a nudge milestone
    const variant = matchMilestone(daysSince);
    if (!variant) {
      // Not at any milestone boundary
      continue;
    }

    // 5. Check email_logs — was this nudge variant already sent?
    const templateId = nudgeTemplateId(variant);
    const { data: existingLog } = await supabase
      .from('email_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle();

    if (existingLog) {
      // Already sent this milestone nudge — skip
      continue;
    }

    // 6. Get total sessions count
    const { count: totalSessions } = await supabase
      .from('exam_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    candidates.push({
      userId,
      email,
      displayName,
      timezone,
      daysSinceLastSession: daysSince,
      totalSessions: totalSessions ?? 0,
      nudgeVariant: variant,
    });
  }

  return candidates;
}

// ============================================================
// getNudgeContent
// ============================================================

const NUDGE_COPY: Record<NudgeVariant, NudgeContent> = {
  day_1: {
    subject: 'Miss you already! Quick 5-minute practice?',
    heading: 'Miss you already!',
    body: "Even a short 5-minute session keeps your knowledge fresh. Your DPE examiner is ready when you are — just one click to jump back in.",
    ctaText: 'QUICK 5-MINUTE SESSION',
  },
  day_3: {
    subject: 'Your weak areas are waiting. Review them today?',
    heading: 'Your weak areas are waiting',
    body: "It's been 3 days since your last session. The areas you struggled with won't improve on their own — but a focused review session can make a real difference.",
    ctaText: 'REVIEW WEAK AREAS',
  },
  day_7: {
    subject: "A week away? Your DPE won't wait.",
    heading: "A week away? Your DPE won't wait.",
    body: "Knowledge fades faster than you think. After a week, studies show you've already forgotten a significant portion of what you learned. A quick session today will help you retain what matters for your checkride.",
    ctaText: 'GET BACK ON TRACK',
  },
  day_14: {
    subject: "Don't lose your progress. Even 10 minutes helps.",
    heading: "Don't lose your progress",
    body: "Two weeks is a long gap in your checkride preparation. The good news? Even 10 minutes of focused practice can reactivate the knowledge you've built. Your previous sessions aren't lost — but they need reinforcement.",
    ctaText: 'PRACTICE FOR 10 MINUTES',
  },
  day_30: {
    subject: '30 days is a long time. Your checkride is still ahead.',
    heading: '30 days is a long time',
    body: "It's been a month since your last practice session. Your checkride is still ahead of you, and your AI examiner is still ready. Whether life got busy or motivation dipped — today is a great day to restart. No judgment, just preparation.",
    ctaText: 'RESTART YOUR PREP',
  },
};

/**
 * Get the email copy for a given nudge variant.
 */
export function getNudgeContent(variant: NudgeVariant): NudgeContent {
  return NUDGE_COPY[variant];
}
