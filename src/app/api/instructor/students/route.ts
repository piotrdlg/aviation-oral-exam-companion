import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled, isInstructorApproved } from '@/lib/instructor-access';
import { getInstructorStudentList } from '@/lib/instructor-student-summary';

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

    const students = await getInstructorStudentList(serviceSupabase, user.id);
    return NextResponse.json({ students });
  } catch (err) {
    console.error('[instructor-students] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
