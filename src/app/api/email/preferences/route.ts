import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserEmailPreferences, updateEmailPreference } from '@/lib/email-preferences';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';
import type { EmailCategory } from '@/types/database';
import { OPTIONAL_EMAIL_CATEGORIES } from '@/types/database';

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/email/preferences
 * Public endpoint (no auth required). Verifies unsubscribe token and returns preferences.
 * Query params: uid, cat (EmailCategory), token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const uid = searchParams.get('uid');
    const cat = searchParams.get('cat') as EmailCategory | null;
    const token = searchParams.get('token');

    if (!uid || !cat || !token) {
      return NextResponse.json(
        { error: 'Missing required parameters: uid, cat, token' },
        { status: 400 },
      );
    }

    // Verify the HMAC token
    const isValid = verifyUnsubscribeToken(uid, cat, token);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 403 },
      );
    }

    const preferences = await getUserEmailPreferences(serviceSupabase, uid);

    return NextResponse.json({
      preferences,
      userId: uid,
      category: cat,
    });
  } catch (error) {
    console.error('[email-preferences-public] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/email/preferences
 * Public endpoint (no auth required). One-click unsubscribe via token verification.
 * Body: { uid, category, token, enabled: boolean }
 */
export async function POST(request: NextRequest) {
  after(() => flushPostHog());

  try {
    const body = await request.json();
    const { uid, category, token, enabled } = body;

    // Validate required fields
    if (!uid || typeof uid !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid uid' },
        { status: 400 },
      );
    }

    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid category' },
        { status: 400 },
      );
    }

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid token' },
        { status: 400 },
      );
    }

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

    // Verify the HMAC token
    const isValid = verifyUnsubscribeToken(uid, category as EmailCategory, token);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 403 },
      );
    }

    const result = await updateEmailPreference(
      serviceSupabase,
      uid,
      category as EmailCategory,
      enabled,
      'unsubscribe_link',
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update preference' },
        { status: 400 },
      );
    }

    captureServerEvent(uid, 'email_unsubscribed', { category });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[email-preferences-public] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
