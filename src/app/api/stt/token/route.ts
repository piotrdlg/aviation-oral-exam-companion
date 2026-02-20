import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';
import { requireSafeDbTarget } from '@/lib/app-env';

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
 * Only available to Tier 2 (checkride_prep) and Tier 3 (dpe_live) users.
 */
export async function GET() {
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

    // Build pre-configured WebSocket URL (minimal params — keywords removed
    // per GPT-5.2/Gemini consensus: 30 repeated keywords= params caused
    // Deepgram to reject the WebSocket handshake)
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',
      vad_events: 'true',
    });
    const wsUrl = 'wss://api.deepgram.com/v1/listen?' + params.toString();

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

    return NextResponse.json({
      token: accessToken,
      url: wsUrl,
      expiresAt,
      _debug: {
        method: 'auth_grant',
        tokenLen: accessToken.length,
        tokenPrefix: accessToken.slice(0, 12) + '...',
        expiresIn,
        ttlSeconds: TOKEN_TTL_SECONDS,
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
