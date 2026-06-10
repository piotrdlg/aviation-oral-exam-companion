import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';
import { requireSafeDbTarget } from '@/lib/app-env';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';
import { checkQuota } from '@/lib/voice/usage';
import { isQuotaEnforced } from '@/lib/voice/quota-flags';
import { appendKeytermParams } from '@/lib/voice/aviation-keyterms';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOKEN_RATE_LIMIT = 4; // max tokens per minute per user
const TOKEN_TTL_SECONDS = 600; // 10 minutes — enough for a full exam session

/**
 * GET /api/stt/token
 * Issues a temporary Deepgram JWT for direct client-to-Deepgram WebSocket connection.
 * Uses /v1/auth/grant which returns a JWT that works with Sec-WebSocket-Protocol auth.
 * W3.2 / D1: voice is universal — available on every tier, bounded by the
 * monthly STT-seconds budget (free tier ~70 min) rather than feature-gated.
 */
export async function GET() {
  after(() => flushPostHog());

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify tier + load config in parallel
    const [tier, config] = await Promise.all([
      getUserTier(serviceSupabase, user.id),
      getSystemConfig(serviceSupabase),
    ]);

    // Kill switch check for Deepgram
    const killResult = checkKillSwitch(config, 'deepgram', tier);
    if (killResult.blocked) {
      return NextResponse.json(
        { error: 'service_unavailable', reason: killResult.reason },
        { status: 503 }
      );
    }

    requireSafeDbTarget(config, 'stt-token-api');

    // Rate limit: check token issuance in the last minute
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentTokens } = await serviceSupabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'token_issued')
      .gte('created_at', oneMinuteAgo);

    if ((recentTokens || 0) >= TOKEN_RATE_LIMIT) {
      return NextResponse.json(
        { error: 'Token rate limit exceeded. Max 4 tokens per minute.' },
        { status: 429 }
      );
    }

    // W3.2 #9: monthly STT-seconds budget. Deny new tokens once the user is
    // over their cap (free ~70 min). Soft launch: log-only unless
    // quota.stt_hard_enforce is on. Service-role bypasses the RPC auth guard.
    const { data: sttSecondsThisMonth } = await serviceSupabase.rpc('get_monthly_usage', {
      p_user_id: user.id, p_event_type: 'stt_session',
    });
    const sttQuota = checkQuota(tier, {
      sessionsThisMonth: 0, ttsCharsThisMonth: 0,
      sttSecondsThisMonth: (sttSecondsThisMonth as number) || 0, exchangesThisSession: 0,
    }, 'stt');
    if (!sttQuota.allowed) {
      if (isQuotaEnforced(config, 'quota.stt_hard_enforce')) {
        captureServerEvent(user.id, 'stt_denied_quota', { tier, used: sttSecondsThisMonth, enforced: true });
        return NextResponse.json(
          { error: 'quota_exceeded', limit: sttQuota.limit, upgrade_url: '/pricing' },
          { status: 429 }
        );
      }
      captureServerEvent(user.id, 'stt_quota_exceeded_logonly', { tier, used: (sttSecondsThisMonth as number) || 0, limit: sttQuota.limit });
    }

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    // Request temporary JWT from Deepgram auth/grant
    // The JWT works with Sec-WebSocket-Protocol: ['token', jwt] in browsers
    const tokenResponse = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text().catch(() => 'Unknown error');
      console.error('Deepgram auth/grant failed:', tokenResponse.status, errorBody);
      captureServerEvent(user.id, 'stt_token_request_failed', {
        tier, status: tokenResponse.status, stage: 'deepgram_auth_grant',
      });
      return NextResponse.json(
        { error: 'Failed to obtain STT token' },
        { status: 502 }
      );
    }

    const tokenData = await tokenResponse.json();
    // auth/grant returns { access_token: "eyJ...", expires_in: N }
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || TOKEN_TTL_SECONDS;

    if (!accessToken) {
      console.error('Deepgram auth/grant — no access_token. Fields:', Object.keys(tokenData));
      return NextResponse.json(
        { error: 'Invalid token response from STT provider' },
        { status: 502 }
      );
    }

    const expiresAt = Date.now() + expiresIn * 1000;

    // W4.3: Flux pilot — model-based end-of-turn detection (/v2/listen).
    // Default OFF via stt.flux_pilot; Flux accepts MediaRecorder webm/opus
    // containers directly, so the client capture path is unchanged.
    const fluxEnabled = (config['stt.flux_pilot'] as { enabled?: boolean } | undefined)?.enabled === true;

    let wsUrl: string;
    let keytermCount = 0;
    if (fluxEnabled) {
      const params = new URLSearchParams({
        model: 'flux-general-en',
        eot_threshold: '0.7',
      });
      keytermCount = appendKeytermParams(params, config['stt.keyterms']).length;
      wsUrl = 'wss://api.deepgram.com/v2/listen?' + params.toString();
    } else {
      // Nova-3 (default). History: the NOVA-2-era `keywords=` param (30
      // repeats) broke the WS handshake — removed after a GPT-5.2/Gemini
      // consensus. Nova-3's `keyterm=` is its replacement (W4.3) and the
      // handshake was live-verified with the full list before shipping.
      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'en-US',
        smart_format: 'true',
        interim_results: 'true',
        utterance_end_ms: '1500',
        vad_events: 'true',
      });
      keytermCount = appendKeytermParams(params, config['stt.keyterms']).length;
      wsUrl = 'wss://api.deepgram.com/v1/listen?' + params.toString();
    }

    // Log token issuance (non-blocking)
    serviceSupabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        event_type: 'token_issued',
        provider: 'deepgram',
        tier,
        quantity: 1,
        status: 'ok',
        metadata: { ttl_seconds: TOKEN_TTL_SECONDS, method: 'auth_grant' },
      })
      .then(({ error }) => {
        if (error) console.error('Token issuance log error:', error.message);
      });

    captureServerEvent(user.id, 'stt_token_request_succeeded', {
      tier, token_len: accessToken.length, ttl_seconds: TOKEN_TTL_SECONDS,
    });

    return NextResponse.json({
      token: accessToken,
      url: wsUrl,
      expiresAt,
      flux: fluxEnabled,
      _debug: {
        method: 'auth_grant',
        tokenLen: accessToken.length,
        tokenPrefix: accessToken.slice(0, 12) + '...',
        expiresIn,
        ttlSeconds: TOKEN_TTL_SECONDS,
        keytermCount,
      },
    });
  } catch (error) {
    console.error('STT token error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
