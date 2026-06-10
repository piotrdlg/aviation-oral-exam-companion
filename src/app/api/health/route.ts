import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * W6.1: enriched health check — the external uptime monitor's target.
 * Verifies DB reachability (cheap HEAD-count select) and the presence of the
 * critical service keys. Returns 503 with per-check detail on failure so the
 * monitor alert says WHAT is down, not just "down".
 */
export async function GET() {
  const checks: Record<string, boolean> = {
    db: false,
    anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    deepgram_key: !!process.env.DEEPGRAM_API_KEY,
    supabase_env: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (checks.supabase_env) {
    try {
      const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { error } = await supabase
        .from('system_config')
        .select('key', { count: 'exact', head: true })
        .limit(1);
      checks.db = !error;
    } catch {
      checks.db = false;
    }
  }

  const healthy = checks.db && checks.anthropic_key && checks.supabase_env;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
