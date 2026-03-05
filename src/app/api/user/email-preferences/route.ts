import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserEmailPreferences, updateEmailPreference } from '@/lib/email-preferences';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';
import type { EmailCategory } from '@/types/database';
import { OPTIONAL_EMAIL_CATEGORIES } from '@/types/database';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/user/email-preferences
 * Returns the authenticated user's email preferences as a map of category -> enabled.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const preferences = await getUserEmailPreferences(serviceSupabase, user.id);

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('[email-preferences] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/email-preferences
 * Updates a single email preference for the authenticated user.
 * Body: { category: EmailCategory, enabled: boolean }
 */
export async function POST(request: NextRequest) {
  after(() => flushPostHog());

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { category, enabled } = body;

    // Validate category is present and is a string
    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid category' },
        { status: 400 },
      );
    }

    // Validate enabled is a boolean
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing or invalid enabled flag' },
        { status: 400 },
      );
    }

    // Only allow toggling optional categories
    if (!OPTIONAL_EMAIL_CATEGORIES.includes(category as EmailCategory)) {
      return NextResponse.json(
        { error: 'Cannot modify required email category' },
        { status: 400 },
      );
    }

    const result = await updateEmailPreference(
      serviceSupabase,
      user.id,
      category as EmailCategory,
      enabled,
      'user_settings',
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update preference' },
        { status: 400 },
      );
    }

    captureServerEvent(user.id, 'email_preference_changed', { category, enabled });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[email-preferences] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
