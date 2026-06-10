import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * W6.3 — GDPR data export. Authenticated, 1/hour, returns the user's data
 * as a downloadable JSON file: profile, sessions, transcripts (Q/A +
 * assessment only — internal RAG chunks are not user data), element
 * attempts, email preferences.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRateLimit('/api/user/export', user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', detail: 'Data export is limited to once per hour.' },
      { status: 429 }
    );
  }

  const [profile, sessions, emailPrefs] = await Promise.all([
    serviceSupabase.from('user_profiles').select(
      'created_at, tier, subscription_status, display_name, preferred_rating, preferred_aircraft_class, preferred_voice, voice_enabled, examiner_profile, auth_method, last_login_at, disclaimer_acknowledged_at'
    ).eq('user_id', user.id).maybeSingle(),
    serviceSupabase.from('exam_sessions').select(
      'id, started_at, ended_at, status, rating, exchange_count, acs_tasks_covered, metadata->sessionConfig, metadata->examResultV2'
    ).eq('user_id', user.id).order('started_at', { ascending: true }),
    serviceSupabase.from('email_preferences').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  const sessionIds = (sessions.data ?? []).map((s) => s.id as string);
  const transcripts: unknown[] = [];
  const attempts: unknown[] = [];
  for (let i = 0; i < sessionIds.length; i += 50) {
    const batch = sessionIds.slice(i, i + 50);
    const [t, a] = await Promise.all([
      serviceSupabase.from('session_transcripts')
        .select('session_id, exchange_number, role, text, assessment, timestamp')
        .in('session_id', batch).order('timestamp', { ascending: true }),
      serviceSupabase.from('element_attempts')
        .select('session_id, element_code, score, tag_type, created_at')
        .in('session_id', batch),
    ]);
    transcripts.push(...(t.data ?? []));
    attempts.push(...(a.data ?? []));
  }

  const payload = {
    export_version: 1,
    generated_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data ?? null,
    email_preferences: emailPrefs.data ?? null,
    exam_sessions: sessions.data ?? [],
    session_transcripts: transcripts,
    element_attempts: attempts,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="heydpe-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
