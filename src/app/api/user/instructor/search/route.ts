import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import { searchInstructors } from '@/lib/instructor-connections';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const lastName = searchParams.get('lastName');
    if (!lastName || lastName.trim().length === 0) {
      return NextResponse.json({ error: 'lastName is required' }, { status: 400 });
    }
    const certNumber = searchParams.get('certNumber') || undefined;

    const results = await searchInstructors(serviceSupabase, lastName, certNumber);
    // PRIVACY: results do NOT contain certificate_number
    return NextResponse.json({ instructors: results });
  } catch (err) {
    console.error('[instructor-search] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
