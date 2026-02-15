import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Concurrent STT session caps per tier
const CONCURRENT_CAPS: Record<string, number> = {
  ground_school: 0,
  checkride_prep: 1,
  dpe_live: 2,
};

/**
 * POST /api/stt/usage
 * Reports STT session start/end for quota tracking and concurrent session management.
 *
 * On 'start': Creates a usage_logs entry and checks concurrent session cap.
 * On 'end': Updates the usage_logs entry with final duration.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, action, durationSeconds } = body;

    if (!action || !['start', 'end'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "start" or "end".' },
        { status: 400 }
      );
    }

    const tier = await getUserTier(serviceSupabase, user.id);

    if (action === 'start') {
      // Check concurrent session cap
      const cap = CONCURRENT_CAPS[tier] || 0;
      if (cap === 0) {
        return NextResponse.json(
          { error: 'STT is not available for your tier.' },
          { status: 403 }
        );
      }

      // Count active STT sessions (started but not ended, within last 30 minutes)
      // Sessions older than 30 minutes without an end are considered stale
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000).toISOString();
      const { count: activeSessions } = await serviceSupabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'stt_session')
        .eq('status', 'ok')
        .eq('quantity', 0) // quantity=0 means session started but not ended
        .gte('created_at', thirtyMinutesAgo);

      if ((activeSessions || 0) >= cap) {
        return NextResponse.json(
          { error: 'Concurrent STT session limit reached.', limit: cap },
          { status: 429 }
        );
      }

      // Create usage log entry for session start
      const { error: insertError } = await serviceSupabase
        .from('usage_logs')
        .insert({
          user_id: user.id,
          session_id: sessionId || null,
          event_type: 'stt_session',
          provider: 'deepgram',
          tier,
          quantity: 0, // Will be updated on 'end'
          status: 'ok',
          metadata: { action: 'start' },
        });

      if (insertError) {
        console.error('STT usage log insert error:', insertError.message);
        return NextResponse.json(
          { error: 'Failed to log STT session start' },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'end') {
      const duration = typeof durationSeconds === 'number' ? durationSeconds : 0;

      // Find the most recent active STT session for this user and update it
      const { data: activeSession } = await serviceSupabase
        .from('usage_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_type', 'stt_session')
        .eq('quantity', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (activeSession) {
        const { error: updateError } = await serviceSupabase
          .from('usage_logs')
          .update({
            quantity: duration,
            metadata: { action: 'end', duration_seconds: duration },
          })
          .eq('id', activeSession.id);

        if (updateError) {
          console.error('STT usage log update error:', updateError.message);
          return NextResponse.json(
            { error: 'Failed to update STT session' },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('STT usage error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
