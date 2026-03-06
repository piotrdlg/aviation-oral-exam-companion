import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Default rate limits (configurable via system_config key 'instructor')
const DEFAULT_EMAIL_INVITE_LIMIT = 20; // per day
const DEFAULT_TOKEN_CREATION_LIMIT = 50; // per day
const RATE_LIMIT_WINDOW_HOURS = 24;

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  windowHours: number;
}

/**
 * Check if an instructor is within rate limits for a given event type.
 * Counts events in the last 24 hours from instructor_invite_events table.
 */
export async function checkInstructorRateLimit(
  supabase: SupabaseClient,
  instructorUserId: string,
  eventType: 'email_sent' | 'token_created',
  overrideLimit?: number,
): Promise<RateLimitResult> {
  const defaultLimit = eventType === 'email_sent'
    ? DEFAULT_EMAIL_INVITE_LIMIT
    : DEFAULT_TOKEN_CREATION_LIMIT;

  // Try to read limit from system_config
  let configLimit = defaultLimit;
  try {
    const { data: config } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'instructor')
      .single();

    if (config?.value) {
      const cfg = config.value as Record<string, unknown>;
      if (eventType === 'email_sent' && typeof cfg.email_invite_limit === 'number') {
        configLimit = cfg.email_invite_limit;
      }
      if (eventType === 'token_created' && typeof cfg.token_creation_limit === 'number') {
        configLimit = cfg.token_creation_limit;
      }
    }
  } catch { /* use default */ }

  const limit = overrideLimit ?? configLimit;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('instructor_invite_events')
    .select('id', { count: 'exact', head: true })
    .eq('instructor_user_id', instructorUserId)
    .eq('event_type', eventType)
    .gte('created_at', windowStart);

  const current = count || 0;

  return {
    allowed: current < limit,
    current,
    limit,
    windowHours: RATE_LIMIT_WINDOW_HOURS,
  };
}

/**
 * Log an invite event to the instructor_invite_events table.
 */
export async function logInviteEvent(
  supabase: SupabaseClient,
  instructorUserId: string,
  eventType: 'token_created' | 'email_sent' | 'claimed' | 'revoked' | 'rate_limited',
  metadata?: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('instructor_invite_events')
    .insert({
      instructor_user_id: instructorUserId,
      event_type: eventType,
      metadata: metadata ?? {},
    });
}

// Exported for testing
export const DEFAULTS = {
  EMAIL_INVITE_LIMIT: DEFAULT_EMAIL_INVITE_LIMIT,
  TOKEN_CREATION_LIMIT: DEFAULT_TOKEN_CREATION_LIMIT,
  RATE_LIMIT_WINDOW_HOURS,
} as const;
