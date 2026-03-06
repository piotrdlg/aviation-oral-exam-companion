import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { MilestoneKey, MilestoneStatus } from '@/types/database';
import { MILESTONE_KEYS } from '@/types/database';
import { getCurrentMilestones } from '@/lib/instructor-insights';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUSES: MilestoneStatus[] = ['not_set', 'in_progress', 'completed'];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const milestones = await getCurrentMilestones(serviceSupabase, user.id);

    return NextResponse.json({ milestones });
  } catch (err) {
    console.error('[milestones] GET error:', err);
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

    const body = await request.json();
    const { milestoneKey, status, notes } = body;

    // Validate milestoneKey
    if (!milestoneKey || !MILESTONE_KEYS.includes(milestoneKey as MilestoneKey)) {
      return NextResponse.json(
        { error: `milestoneKey must be one of: ${MILESTONE_KEYS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate status
    if (!status || !VALID_STATUSES.includes(status as MilestoneStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate notes (optional, max 500 chars)
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

    const { data: milestone, error } = await serviceSupabase
      .from('student_milestones')
      .insert({
        student_user_id: user.id,
        milestone_key: milestoneKey,
        status: status,
        declared_by_user_id: user.id,
        declared_by_role: 'student',
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[milestones] Insert error:', error.message);
      return NextResponse.json({ error: 'Failed to save milestone' }, { status: 500 });
    }

    return NextResponse.json({ success: true, milestone });
  } catch (err) {
    console.error('[milestones] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
