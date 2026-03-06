import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import { lookupInvite, claimInvite } from '@/lib/instructor-invites';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/invite/[token]
 * Look up invite info (public — no auth required for viewing).
 * Returns instructor name, cert type, and invite status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const info = await lookupInvite(serviceSupabase, token);
    if (!info) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    return NextResponse.json({ invite: info });
  } catch (err) {
    console.error('[invite] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/invite/[token]
 * Claim an invite. Requires auth (student must be logged in).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to accept this invite' }, { status: 401 });
    }

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await claimInvite(serviceSupabase, token, user.id);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, connectionId: result.connectionId });
  } catch (err) {
    console.error('[invite] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
