import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import {
  createInviteLink,
  listInstructorInvites,
  revokeInvite,
} from '@/lib/instructor-invites';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/user/instructor/invites
 * List the instructor's active invites.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await listInstructorInvites(serviceSupabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[instructor-invites] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/instructor/invites
 * Create a new invite or revoke an existing one.
 *
 * Body: { action: 'create' } or { action: 'revoke', inviteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const result = await createInviteLink(serviceSupabase, user.id, {
        targetEmail: body.targetEmail,
        targetName: body.targetName,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ invite: result.invite });
    }

    if (action === 'revoke') {
      const { inviteId } = body;
      if (!inviteId) {
        return NextResponse.json({ error: 'inviteId required' }, { status: 400 });
      }

      const result = await revokeInvite(serviceSupabase, inviteId, user.id);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[instructor-invites] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
