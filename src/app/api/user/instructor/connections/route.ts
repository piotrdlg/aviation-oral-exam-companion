import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import {
  getStudentConnection,
  requestConnection,
  cancelConnectionRequest,
  studentDisconnect,
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

    const connection = await getStudentConnection(serviceSupabase, user.id);
    return NextResponse.json({ connection });
  } catch (err) {
    console.error('[student-connections] GET error:', err);
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

    const body = await request.json();
    const { action } = body;

    if (action === 'request_connection') {
      const { instructor_user_id } = body;
      if (!instructor_user_id || typeof instructor_user_id !== 'string') {
        return NextResponse.json({ error: 'instructor_user_id is required' }, { status: 400 });
      }
      const result = await requestConnection(serviceSupabase, user.id, instructor_user_id);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      captureServerEvent(user.id, 'instructor_connection_requested', {
        connection_id: result.connectionId,
        method: 'student',
        instructor_user_id,
      });
      await flushPostHog();
      return NextResponse.json({ success: true, connectionId: result.connectionId });
    }

    if (action === 'cancel_request') {
      const { connection_id } = body;
      if (!connection_id) return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
      const result = await cancelConnectionRequest(serviceSupabase, connection_id, user.id);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      captureServerEvent(user.id, 'instructor_connection_disconnected', {
        connection_id,
        method: 'student_cancel',
      });
      await flushPostHog();
      return NextResponse.json({ success: true });
    }

    if (action === 'disconnect') {
      const { connection_id } = body;
      if (!connection_id) return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
      const result = await studentDisconnect(serviceSupabase, connection_id, user.id);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      captureServerEvent(user.id, 'instructor_connection_disconnected', {
        connection_id,
        method: 'student_disconnect',
      });
      await flushPostHog();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[student-connections] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
