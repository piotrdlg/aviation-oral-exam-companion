import { type NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/supabase/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * W6.5 — server-side consent persistence.
 * kind 'cookie': mirrors the CookieConsent choices for logged-in users.
 * kind 'disclaimer': records the first-exam FAA-disclaimer acknowledgment
 * (also stamps user_profiles.disclaimer_acknowledged_at, which gates exams).
 * kind 'ai_data_processing': records the native onboarding third-party-AI
 * data-processing consent (Anthropic/Deepgram/OpenAI named in the UI; Apple
 * 5.1.1/5.1.2). Writes a consent_records row only — NO disclaimer stamp.
 * Anonymous cookie choices stay localStorage-only (no user to key on).
 */
const VALID_KINDS = ['cookie', 'disclaimer', 'ai_data_processing'] as const;

export async function POST(request: NextRequest) {
  const authed = await getAuthedUser(request);
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = authed;

  const body = await request.json().catch(() => null) as { kind?: string; choices?: Record<string, unknown> } | null;
  // Allow-list the kind (unknown values fall back to 'cookie', the least-privileged
  // record — never silently coerce ai_data_processing/disclaimer to each other).
  const kind = (VALID_KINDS as readonly string[]).includes(body?.kind ?? '')
    ? (body!.kind as string)
    : 'cookie';
  const choices = body?.choices && typeof body.choices === 'object' ? body.choices : null;
  if (!choices) return NextResponse.json({ error: 'choices required' }, { status: 400 });

  const { error } = await serviceSupabase.from('consent_records').insert({
    user_id: user.id,
    kind,
    choices,
    user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  if (error) return NextResponse.json({ error: 'persist_failed' }, { status: 500 });

  if (kind === 'disclaimer') {
    await serviceSupabase
      .from('user_profiles')
      .update({ disclaimer_acknowledged_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }
  return NextResponse.json({ ok: true });
}
