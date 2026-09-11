import type { SupabaseClient } from '@supabase/supabase-js';

export const FREE_TRIAL_EXAM_LIMIT = 3;
export const FREE_TRIAL_WINDOW_DAYS = 7;
const WINDOW_MS = FREE_TRIAL_WINDOW_DAYS * 86400000;
export type TrialBlock = 'trial_limit_reached' | 'trial_expired' | 'resubscribe_required';
export interface TrialStatus {
  examsUsed: number; examLimit: number; examsRemaining: number;
  expiresAt: string | null; serverNow: string; canStart: boolean; reason: TrialBlock | null;
}
interface Profile { created_at?: string | null; has_trialed?: boolean | null; subscription_status?: string | null; stripe_subscription_id?: string | null }

/** One decision function for session creation and the Home display. */
export function trialStatus(tier: string, profile: Profile | null, count: number, now = Date.now()): TrialStatus | null {
  // A live subscription also wins over the cached tier/count (decision D5).
  if (tier === 'dpe_live' || profile?.stripe_subscription_id) return null;
  const signup = profile?.created_at ? Date.parse(profile.created_at) : NaN;
  const expiry = Number.isFinite(signup) ? signup + WINDOW_MS : null;
  const churned = ['canceled', 'unpaid', 'past_due'].includes(profile?.subscription_status ?? '');
  const reason: TrialBlock | null = count >= FREE_TRIAL_EXAM_LIMIT ? 'trial_limit_reached'
    : profile?.has_trialed || churned ? 'resubscribe_required'
      : expiry !== null && now > expiry ? 'trial_expired' : null;
  return {
    examsUsed: count, examLimit: FREE_TRIAL_EXAM_LIMIT,
    examsRemaining: reason ? 0 : Math.max(0, FREE_TRIAL_EXAM_LIMIT - count),
    expiresAt: expiry === null ? null : new Date(expiry).toISOString(),
    serverNow: new Date(now).toISOString(), canStart: reason === null, reason,
  };
}

export async function readTrialStatus(db: SupabaseClient, userId: string, tier: string): Promise<TrialStatus | null> {
  if (tier === 'dpe_live') return null;
  const [profile, sessions] = await Promise.all([
    db.from('user_profiles').select('created_at, has_trialed, subscription_status, stripe_subscription_id').eq('user_id', userId).maybeSingle(),
    db.from('exam_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_onboarding', false),
  ]);
  if (profile.error || sessions.error || sessions.count === null) throw new Error('trial_status_unavailable');
  return trialStatus(tier, profile.data, sessions.count);
}
