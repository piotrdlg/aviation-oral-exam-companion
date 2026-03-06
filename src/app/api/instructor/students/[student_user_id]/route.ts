import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled, isInstructorApproved } from '@/lib/instructor-access';
import { getStudentDetail } from '@/lib/instructor-student-summary';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ student_user_id: string }> }
) {
  try {
    const { student_user_id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const approved = await isInstructorApproved(serviceSupabase, user.id);
    if (!approved) return NextResponse.json({ error: 'Not an approved instructor' }, { status: 403 });

    const detail = await getStudentDetail(serviceSupabase, user.id, student_user_id);
    if (!detail) {
      return NextResponse.json({ error: 'Student not found or not connected' }, { status: 404 });
    }

    return NextResponse.json({ student: detail });
  } catch (err) {
    console.error('[instructor-student-detail] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
