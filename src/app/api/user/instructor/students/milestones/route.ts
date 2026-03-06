import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import type { MilestoneKey, MilestoneStatus } from '@/types/database';
import { MILESTONE_KEYS } from '@/types/database';
import { getCurrentMilestones } from '@/lib/instructor-insights';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_MILESTONE_STATUSES: MilestoneStatus[] = ['not_set', 'in_progress', 'completed'];

async function verifyConnection(instructorUserId: string, studentUserId: string) {
  const { data: conn } = await serviceSupabase
    .from('student_instructor_connections')
    .select('id')
    .eq('instructor_user_id', instructorUserId)
    .eq('student_user_id', studentUserId)
    .eq('state', 'connected')
    .maybeSingle();
  return conn;
}

export async function GET(request: NextRequest) {
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

    const studentUserId = request.nextUrl.searchParams.get('studentUserId');
    if (!studentUserId) {
      return NextResponse.json({ error: 'studentUserId is required' }, { status: 400 });
    }

    const conn = await verifyConnection(user.id, studentUserId);
    if (!conn) {
      return NextResponse.json(
        { error: 'Student not found or not connected' },
        { status: 404 }
      );
    }

    const milestones = await getCurrentMilestones(serviceSupabase, studentUserId);
    return NextResponse.json({ milestones });
  } catch (err) {
    console.error('[instructor-milestones] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const { studentUserId, milestoneKey, status, notes } = body;

    // Validate studentUserId
    if (!studentUserId || typeof studentUserId !== 'string') {
      return NextResponse.json({ error: 'studentUserId is required' }, { status: 400 });
    }

    // Validate milestoneKey
    if (!milestoneKey || !MILESTONE_KEYS.includes(milestoneKey as MilestoneKey)) {
      return NextResponse.json(
        { error: `milestoneKey must be one of: ${MILESTONE_KEYS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate status
    if (!status || !VALID_MILESTONE_STATUSES.includes(status as MilestoneStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_MILESTONE_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate notes
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') {
        return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
      }
      if (notes.length > 500) {
        return NextResponse.json(
          { error: 'notes must be 500 characters or less' },
          { status: 400 }
        );
      }
    }

    // Verify instructor-student connection
    const conn = await verifyConnection(user.id, studentUserId);
    if (!conn) {
      return NextResponse.json(
        { error: 'Student not found or not connected' },
        { status: 404 }
      );
    }

    // Insert milestone
    const { error: insertError } = await serviceSupabase
      .from('student_milestones')
      .insert({
        student_user_id: studentUserId,
        milestone_key: milestoneKey,
        status: status,
        declared_by_user_id: user.id,
        declared_by_role: 'instructor',
        notes: notes || null,
      });

    if (insertError) {
      console.error('[instructor-milestones] Insert error:', insertError.message);
      return NextResponse.json({ error: 'Failed to save milestone' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[instructor-milestones] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
