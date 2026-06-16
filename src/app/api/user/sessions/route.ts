import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/supabase/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getSessionTokenHash } from '@/lib/session-enforcement';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/user/sessions
 *
 * List the current user's active sessions from the active_sessions table.
 * Returns device label, approximate location, last activity, exam status,
 * and a "this_device" flag for the current session.
 */
export async function GET(request: NextRequest) {
  try {
    const authed = await getAuthedUser(request);
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user } = authed;

    // Current device token hash — transport-agnostic: the bearer JWT (native) or
    // the cookie session's access_token both carry the stable session_id claim.
    let currentTokenHash: string | null = null;
    if (authed.accessToken) {
      try {
        currentTokenHash = getSessionTokenHash({ access_token: authed.accessToken });
      } catch {
        // If JWT decoding fails, we just won't mark "this device"
      }
    }

    // Fetch all active sessions for this user
    const { data: sessions, error } = await serviceSupabase
      .from('active_sessions')
      .select('id, device_label, device_info, approximate_location, is_exam_active, last_activity_at, session_token_hash, created_at')
      .eq('user_id', user.id)
      .order('last_activity_at', { ascending: false });

    if (error) {
      console.error('Active sessions fetch error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // Map sessions, adding this_device flag and removing sensitive token hash
    const mapped = (sessions || []).map((s) => ({
      id: s.id,
      device_label: s.device_label || inferDeviceLabel(s.device_info as Record<string, unknown> | null),
      approximate_location: s.approximate_location,
      is_exam_active: s.is_exam_active,
      last_activity_at: s.last_activity_at,
      created_at: s.created_at,
      this_device: currentTokenHash ? s.session_token_hash === currentTokenHash : false,
    }));

    return NextResponse.json({ sessions: mapped });
  } catch (error) {
    console.error('Active sessions API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/user/sessions
 *
 * Sign out all OTHER sessions. This:
 * 1. Deletes all active_sessions rows except the current one
 * 2. Calls supabase.auth.signOut({ scope: 'others' }) to invalidate
 *    all other Supabase auth sessions
 *
 * MVP limitation: no per-session revocation (we only store session_token_hash,
 * not the raw session_id needed for targeted revocation).
 */
export async function DELETE(request: NextRequest) {
  try {
    const authed = await getAuthedUser(request);
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // `supabase` is the user-bound client (cookie or anon+bearer) — needed for
    // signOut({ scope: 'others' }), which acts on the caller's own session.
    const { user, supabase } = authed;

    // Current device token hash (transport-agnostic)
    let currentTokenHash: string | null = null;
    if (authed.accessToken) {
      try {
        currentTokenHash = getSessionTokenHash({ access_token: authed.accessToken });
      } catch {
        // Continue without token hash — we'll clear all sessions
      }
    }

    // Delete all active_sessions rows for this user EXCEPT the current one
    if (currentTokenHash) {
      await serviceSupabase
        .from('active_sessions')
        .delete()
        .eq('user_id', user.id)
        .neq('session_token_hash', currentTokenHash);
    } else {
      // If we can't identify current session, delete all
      await serviceSupabase
        .from('active_sessions')
        .delete()
        .eq('user_id', user.id);
    }

    // Invalidate all other Supabase auth sessions using the user's client
    // (This uses the user's own token, not the service role)
    await supabase.auth.signOut({ scope: 'others' });

    return NextResponse.json({ ok: true, message: 'All other sessions signed out.' });
  } catch (error) {
    console.error('Sign out other sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Infer a human-readable device label from stored device_info.
 */
function inferDeviceLabel(deviceInfo: Record<string, unknown> | null): string {
  if (!deviceInfo) return 'Unknown device';
  const ua = deviceInfo.user_agent as string | undefined;
  if (!ua) return 'Unknown device';

  // Simple UA parsing
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Mac OS')) return 'Mac';
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Chrome')) return 'Chrome browser';
  if (ua.includes('Safari')) return 'Safari browser';
  if (ua.includes('Firefox')) return 'Firefox browser';
  return 'Web browser';
}
