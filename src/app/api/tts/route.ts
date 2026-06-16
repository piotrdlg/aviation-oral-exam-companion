import { type NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getAuthedUser } from '@/lib/supabase/auth';
import { getUserTier, getUserPreferredVoice } from '@/lib/voice/tier-lookup';
import { createTTSProvider, getTTSProviderName } from '@/lib/voice/provider-factory';
import { checkQuota } from '@/lib/voice/usage';
import { isQuotaEnforced, getDailyHardCaps } from '@/lib/voice/quota-flags';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';
import { requireSafeDbTarget } from '@/lib/app-env';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';

// Service-role client for usage logging (bypasses RLS)
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// W4.1: cap function lifetime — synthesis (8s timeout + 1 retry per provider,
// 2-provider chain) worst-cases well under 30s (audit-62 WARN fix).
export const maxDuration = 30;

// W4.3: this route fires once PER SENTENCE during streaming TTS, so the
// monthly-usage RPC was a per-sentence DB round trip on the latency path.
// Cache the sum for 60s per user and advance it locally after each synthesis.
// Worst-case overshoot past the cap: one user's synthesis volume in 60s on a
// stale warm instance — negligible against a 35k/1M char budget, and the next
// refresh corrects it. Correctness never depends on a hit (cold start = miss).
import { TtlCache } from '@/lib/ttl-cache';
const ttsQuotaCache = new TtlCache<number>(60_000);

export async function POST(request: NextRequest) {
  after(() => flushPostHog());

  try {
    const authed = await getAuthedUser(request);
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user } = authed;

    const { text, voice: voiceOverride } = await request.json();
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

    // W3.2 / D1: voice is universal — no tier feature-gate. Theft is bounded
    // by the monthly char budget + 3-exam count limit below.

    // Kill switch check for TTS provider
    const ttsProviderName = getTTSProviderName(tier);
    const killResult = checkKillSwitch(config, ttsProviderName, tier);
    if (killResult.blocked) {
      return NextResponse.json(
        { error: 'service_unavailable', reason: killResult.reason },
        { status: 503 }
      );
    }

    requireSafeDbTarget(config, 'tts-api');

    // If kill switch suggests a fallback tier, we still proceed — the provider factory
    // has its own fallback chain. The kill switch fallback is informational here.

    // W3.2 #1: SUM the chars actually synthesized this month (the old check
    // counted log ROWS, so the cap was unreachable). get_monthly_usage is the
    // auth-guarded RPC; service-role bypasses the guard.
    // W4.3: cached 60s per user — see ttsQuotaCache above.
    let ttsCharsThisMonth = ttsQuotaCache.get(user.id);
    if (ttsCharsThisMonth === undefined) {
      const { data } = await serviceSupabase.rpc('get_monthly_usage', {
        p_user_id: user.id, p_event_type: 'tts_request',
      });
      ttsCharsThisMonth = (data as number) || 0;
      ttsQuotaCache.set(user.id, ttsCharsThisMonth);
    }

    const quotaResult = checkQuota(tier, {
      sessionsThisMonth: 0,
      ttsCharsThisMonth,
      sttSecondsThisMonth: 0,
      exchangesThisSession: 0,
    }, 'tts');

    if (!quotaResult.allowed) {
      // Soft launch: log-only unless quota.tts_hard_enforce is on.
      if (isQuotaEnforced(config, 'quota.tts_hard_enforce')) {
        captureServerEvent(user.id, 'tts_denied_by_tier', { tier, reason: 'quota_exceeded', enforced: true });
        return NextResponse.json(
          { error: 'quota_exceeded', limit: quotaResult.limit, upgrade_url: '/pricing' },
          { status: 429 }
        );
      }
      captureServerEvent(user.id, 'tts_quota_exceeded_logonly', { tier, used: ttsCharsThisMonth, limit: quotaResult.limit });
    }

    // Daily hard-cap backstop (only queried when the flag is on — zero overhead otherwise).
    if (isQuotaEnforced(config, 'quota.daily_caps_enforce')) {
      const caps = getDailyHardCaps(config);
      const { data: dailyTtsChars } = await serviceSupabase.rpc('get_daily_usage', {
        p_user_id: user.id, p_event_type: 'tts_request',
      });
      if (((dailyTtsChars as number) || 0) >= caps.daily_tts_chars) {
        captureServerEvent(user.id, 'tts_daily_cap_reached', { tier, used: dailyTtsChars, cap: caps.daily_tts_chars });
        return NextResponse.json(
          { error: 'daily_cap_reached', limit: 'daily_tts_chars', upgrade_url: '/pricing' },
          { status: 429 }
        );
      }
    }

    // Create provider for user's tier, pass system_config TTS settings
    const provider = await createTTSProvider(tier);
    const ttsConfigKey = `tts.${provider.name}`;
    const ttsConfig = config[ttsConfigKey] as Record<string, unknown> | undefined;
    // Voice priority: explicit override (preview) > user's saved preference > system default
    // Validate override against admin-curated voice list
    let activeVoice = preferredVoice;
    if (voiceOverride && typeof voiceOverride === 'string') {
      const voiceOptions = (config['voice.user_options'] as unknown as { model: string }[]) || [];
      const validModels = voiceOptions.map((o) => o.model);
      if (validModels.includes(voiceOverride)) {
        activeVoice = voiceOverride;
      } else if (/^aura-2-[a-z]+-en$/.test(voiceOverride)) {
        // Admin voice-lab preview: admins may audition ANY well-formed Aura-2
        // catalog voice, even ones not yet curated into voice.user_options.
        // The strict regex bounds what reaches Deepgram. One extra query, and
        // only on the rare non-curated-override path.
        const { data: adminRow } = await serviceSupabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (adminRow) activeVoice = voiceOverride;
      }
    }
    // Strip encoding from system_config to prevent overriding the provider's
    // hardcoded mp3 encoding. The PCM AudioWorklet pipeline is broken cross-browser.
    const { encoding: _stripEncoding, ...safeTtsConfig } = ttsConfig ?? {};
    const effectiveConfig = activeVoice
      ? { ...safeTtsConfig, model: activeVoice }
      : Object.keys(safeTtsConfig).length > 0 ? safeTtsConfig : undefined;
    const result = await provider.synthesize(truncated, { config: effectiveConfig });

    // Advance the cached month-sum so back-to-back sentences see fresh usage
    // without re-querying (W4.3).
    ttsQuotaCache.set(user.id, ttsCharsThisMonth + truncated.length);

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
