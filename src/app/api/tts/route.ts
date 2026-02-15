import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { createTTSProvider } from '@/lib/voice/provider-factory';

// Service-role client for usage logging (bypasses RLS)
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // Enforce max text length
    const truncated = text.slice(0, 2000);

    // Look up user's tier
    const tier = await getUserTier(serviceSupabase, user.id);

    // Check TTS quota
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: ttsCharsThisMonth } = await serviceSupabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'tts_request')
      .eq('status', 'ok')
      .gte('created_at', monthStart);

    // Import quota check
    const { checkQuota } = await import('@/lib/voice/usage');
    const quotaResult = checkQuota(tier, {
      sessionsThisMonth: 0, // Not checked here
      ttsCharsThisMonth: ttsCharsThisMonth || 0,
      sttSecondsThisMonth: 0,
      exchangesThisSession: 0,
    }, 'tts');

    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: 'quota_exceeded', limit: quotaResult.limit, upgrade_url: '/pricing' },
        { status: 429 }
      );
    }

    // Create provider for user's tier
    const provider = await createTTSProvider(tier);
    const result = await provider.synthesize(truncated);

    // Log usage (non-blocking)
    serviceSupabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        event_type: 'tts_request',
        provider: provider.name,
        tier,
        quantity: truncated.length,
        latency_ms: result.ttfbMs,
        status: 'ok',
        metadata: { encoding: result.encoding, sample_rate: result.sampleRate },
      })
      .then(({ error }) => {
        if (error) console.error('Usage log error:', error.message);
      });

    // Stream the response
    return new Response(result.audio, {
      headers: {
        'Content-Type': result.contentType,
        'X-Audio-Encoding': result.encoding,
        'X-Audio-Sample-Rate': String(result.sampleRate),
        'X-Audio-Channels': String(result.channels),
        'X-TTS-Provider': provider.name,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('TTS error:', msg);
    return NextResponse.json(
      { error: 'TTS generation failed', detail: msg },
      { status: 500 }
    );
  }
}
