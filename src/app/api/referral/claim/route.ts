import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import { lookupByReferralCode } from '@/lib/instructor-identity';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/referral/claim
 *
 * Claim a referral code — auto-connects student to instructor.
 * Requires auth. Body: { code: string }
 *
 * Flow:
 *   1. Validate referral code → look up approved instructor
 *   2. Check "one instructor at a time" invariant
 *   3. Upsert connection with state='connected', connection_source='referral_link'
 *   4. Track PostHog event
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Please sign in to use this referral code' },
        { status: 401 }
      );
    }

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 });
    }

    // 1. Look up instructor by referral code
    const instructor = await lookupByReferralCode(serviceSupabase, code);
    if (!instructor) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
    }

    // 2. Prevent self-connection
    if (instructor.instructorUserId === user.id) {
      return NextResponse.json(
        { error: 'You cannot use your own referral code' },
        { status: 400 }
      );
    }

    // 3. Check for existing active connection with ANY instructor
    const { data: existingActive } = await serviceSupabase
      .from('student_instructor_connections')
      .select('id, instructor_user_id, state')
      .eq('student_user_id', user.id)
      .in('state', ['pending', 'connected', 'invited'])
      .limit(1)
      .maybeSingle();

    if (existingActive) {
      if (existingActive.instructor_user_id === instructor.instructorUserId) {
        // Already connected/pending with this instructor — idempotent success
        return NextResponse.json({
          ok: true,
          connectionId: existingActive.id,
          alreadyConnected: true,
        });
      }
      return NextResponse.json(
        { error: 'You are already connected to an instructor. Disconnect first to connect with a different one.' },
        { status: 409 }
      );
    }

    // 4. Upsert connection (handles reconnection after disconnect)
    const now = new Date().toISOString();
    const { data: connection, error: connError } = await serviceSupabase
      .from('student_instructor_connections')
      .upsert(
        {
          instructor_user_id: instructor.instructorUserId,
          student_user_id: user.id,
          state: 'connected',
          initiated_by: 'instructor',
          connection_source: 'referral_link',
          connected_at: now,
          requested_at: now,
          // Clear any previous disconnect state
          disconnected_at: null,
          disconnected_by: null,
          disconnect_reason: null,
          rejected_at: null,
        },
        { onConflict: 'instructor_user_id,student_user_id' },
      )
      .select('id')
      .single();

    if (connError) {
      console.error('[referral/claim] Connection upsert error:', connError.message);
      return NextResponse.json({ error: 'Failed to connect' }, { status: 500 });
    }

    // 5. Track event
    captureServerEvent(user.id, 'referral_code_claimed', {
      connection_id: connection?.id,
      instructor_user_id: instructor.instructorUserId,
      referral_code: code.toUpperCase(),
      connection_source: 'referral_link',
    });
    await flushPostHog();

    return NextResponse.json({
      ok: true,
      connectionId: connection?.id,
      instructorName: instructor.instructorName,
    });
  } catch (err) {
    console.error('[referral/claim] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
