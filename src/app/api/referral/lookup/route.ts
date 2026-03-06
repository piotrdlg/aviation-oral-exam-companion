import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import { lookupByReferralCode, lookupBySlug } from '@/lib/instructor-identity';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/referral/lookup?code=ABCD1234
 * GET /api/referral/lookup?slug=john-smith
 *
 * Public endpoint — no auth required. Returns display-safe instructor info.
 * NEVER returns certificate_number or email.
 */
export async function GET(request: NextRequest) {
  try {
    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const slug = searchParams.get('slug');

    if (code) {
      const instructor = await lookupByReferralCode(serviceSupabase, code);
      if (!instructor) {
        return NextResponse.json({ error: 'Referral code not found' }, { status: 404 });
      }
      return NextResponse.json({ instructor });
    }

    if (slug) {
      const instructor = await lookupBySlug(serviceSupabase, slug);
      if (!instructor) {
        return NextResponse.json({ error: 'Instructor not found' }, { status: 404 });
      }
      return NextResponse.json({ instructor });
    }

    return NextResponse.json(
      { error: 'Either code or slug query parameter is required' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[referral/lookup] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
