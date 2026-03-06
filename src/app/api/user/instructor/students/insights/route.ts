import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import { getStudentInsights } from '@/lib/instructor-insights';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const insights = await getStudentInsights(serviceSupabase, user.id, studentUserId);
    if (!insights) {
      return NextResponse.json(
        { error: 'Student not found or not connected' },
        { status: 404 }
      );
    }

    return NextResponse.json({ insights });
  } catch (err) {
    console.error('[instructor-insights] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
