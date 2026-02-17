import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTier, getUserPreferredVoice } from '@/lib/voice/tier-lookup';
import { createTTSProvider, getTTSProviderName } from '@/lib/voice/provider-factory';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';

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

    // Look up user's tier, system config, and preferred voice in parallel
    const [tier, config, preferredVoice] = await Promise.all([
      getUserTier(serviceSupabase, user.id),
      getSystemConfig(serviceSupabase),
      getUserPreferredVoice(serviceSupabase, user.id),
    ]);

    // Kill switch check for TTS provider
    const ttsProviderName = getTTSProviderName(tier);
    const killResult = checkKillSwitch(config, ttsProviderName, tier);
    if (killResult.blocked) {
      return NextResponse.json(
        { error: 'service_unavailable', reason: killResult.reason },
        { status: 503 }
      );
    }

    // If kill switch suggests a fallback tier, we still proceed — the provider factory
    // has its own fallback chain. The kill switch fallback is informational here.

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

    // Create provider for user's tier, pass system_config TTS settings
    const provider = await createTTSProvider(tier);
    const ttsConfigKey = `tts.${provider.name}`;
    const ttsConfig = config[ttsConfigKey] as Record<string, unknown> | undefined;
    // Override with user's preferred voice if set (applies to Deepgram model selection)
    const effectiveConfig = preferredVoice
      ? { ...ttsConfig, model: preferredVoice }
      : ttsConfig;
    const result = await provider.synthesize(truncated, { config: effectiveConfig });

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
