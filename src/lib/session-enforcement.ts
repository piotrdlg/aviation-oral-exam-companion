import 'server-only';
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Decode a JWT payload without verification (we trust Supabase's token).
 * We only need the session_id claim, which is stable across token refreshes.
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

/**
 * Extract the stable session_id from a Supabase access token and hash it.
 * session_id is assigned at login time and does NOT rotate on token refresh
 * (unlike refresh_token which may rotate if refresh token rotation is enabled).
 */
export function getSessionTokenHash(session: { access_token: string }): string {
  const jwtPayload = decodeJwtPayload(session.access_token);
  const sessionId = jwtPayload.session_id as string;
  if (!sessionId) throw new Error('JWT missing session_id claim');
  return createHash('sha256').update(sessionId).digest('hex');
}

export interface EnforcementResult {
  /** The exam_session_id that was paused (if any) */
  pausedSessionId?: string;
}

/**
 * Enforce that only one exam session is active per user at a time.
 *
 * For the `start` action:
 * 1. Check for other active exam sessions for this user
 * 2. If found: pause the other exam, clear its active flag
 * 3. Set current session as the active exam
 * 4. Return { pausedSessionId? }
 *
 * For `respond` and `next-task` actions:
 * - Verify the calling session is the active one
 * - If not, return an error (the caller should end this session)
 */
export async function enforceOneActiveExam(
  serviceSupabase: SupabaseClient,
  userId: string,
  examSessionId: string,
  tokenHash: string,
  action: 'start' | 'respond' | 'next-task'
): Promise<EnforcementResult & { rejected?: boolean }> {
  // Upsert the current session's active_sessions row (device tracking)
  // The UNIQUE constraint is on (user_id, session_token_hash), so onConflict must match
  await serviceSupabase
    .from('active_sessions')
    .upsert(
      {
        user_id: userId,
        session_token_hash: tokenHash,
        is_exam_active: true,
        exam_session_id: examSessionId,
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_token_hash' }
    );

  if (action === 'start') {
    // Find ALL other active exam sessions for this user (not the current device)
    const { data: otherActives } = await serviceSupabase
      .from('active_sessions')
      .select('id, exam_session_id')
      .eq('user_id', userId)
      .eq('is_exam_active', true)
      .neq('session_token_hash', tokenHash);

    let pausedSessionId: string | undefined;

    if (otherActives && otherActives.length > 0) {
      // Pause the most recently active exam (return it to the client)
      pausedSessionId = otherActives[0].exam_session_id ?? undefined;

      // Pause all other active exam sessions
      const examIds = otherActives
        .map((s) => s.exam_session_id)
        .filter((id): id is string => !!id);

      if (examIds.length > 0) {
        await serviceSupabase
          .from('exam_sessions')
          .update({ status: 'paused' })
          .in('id', examIds)
          .eq('user_id', userId);
      }

      // Clear the active flag on all other devices
      const activeIds = otherActives.map((s) => s.id);
      await serviceSupabase
        .from('active_sessions')
        .update({
          is_exam_active: false,
          exam_session_id: null,
        })
        .in('id', activeIds);
    }

    return { pausedSessionId };
  }

  // For respond / next-task: verify this session is the active one
  const { data: currentActive } = await serviceSupabase
    .from('active_sessions')
    .select('exam_session_id')
    .eq('user_id', userId)
    .eq('session_token_hash', tokenHash)
    .eq('is_exam_active', true)
    .maybeSingle();

  if (!currentActive || currentActive.exam_session_id !== examSessionId) {
    // This session was superseded by another device
    return { rejected: true };
  }

  return {};
}
