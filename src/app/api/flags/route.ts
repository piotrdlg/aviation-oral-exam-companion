import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getSystemConfig } from '@/lib/system-config';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Lightweight endpoint returning client-relevant feature flags from system_config. */
export async function GET() {
  try {
    const config = await getSystemConfig(serviceSupabase);

    const ttsSentenceStream = config['tts_sentence_stream'] as { enabled?: boolean } | undefined;

    return NextResponse.json({
      tts_sentence_stream: ttsSentenceStream?.enabled ?? false,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch {
    // Fail open: return defaults
    return NextResponse.json({
      tts_sentence_stream: false,
    });
  }
}
