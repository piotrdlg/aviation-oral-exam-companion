import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled, isInstructorApproved } from '@/lib/instructor-access';
import {
  getInstructorConnections,
  approveConnection,
  rejectConnection,
  instructorDisconnect,
} from '@/lib/instructor-connections';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const approved = await isInstructorApproved(serviceSupabase, user.id);
    if (!approved) return NextResponse.json({ error: 'Not an approved instructor' }, { status: 403 });

    const result = await getInstructorConnections(serviceSupabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[instructor-connections] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const approved = await isInstructorApproved(serviceSupabase, user.id);
    if (!approved) return NextResponse.json({ error: 'Not an approved instructor' }, { status: 403 });

    const body = await request.json();
    const { action, connection_id } = body;

    if (!connection_id || typeof connection_id !== 'string') {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
    }

    if (action === 'approve') {
      const result = await approveConnection(serviceSupabase, connection_id, user.id);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      captureServerEvent(user.id, 'instructor_connection_approved', { connection_id });
      await flushPostHog();
      return NextResponse.json({ success: true });
    }

    if (action === 'reject') {
      const result = await rejectConnection(serviceSupabase, connection_id, user.id);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      captureServerEvent(user.id, 'instructor_connection_rejected', { connection_id });
      await flushPostHog();
      return NextResponse.json({ success: true });
    }

    if (action === 'disconnect') {
      const result = await instructorDisconnect(serviceSupabase, connection_id, user.id);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      captureServerEvent(user.id, 'instructor_connection_disconnected', {
        connection_id,
        method: 'instructor_disconnect',
      });
      await flushPostHog();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[instructor-connections] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
