import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOKEN_RATE_LIMIT = 4; // max tokens per minute per user
const TOKEN_TTL_SECONDS = 30;

/**
 * GET /api/stt/token
 * Issues a temporary Deepgram STT token for direct client-to-Deepgram WebSocket connection.
 * Only available to Tier 2 (checkride_prep) and Tier 3 (dpe_live) users.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify tier
    const tier = await getUserTier(serviceSupabase, user.id);
    if (tier === 'ground_school') {
      return NextResponse.json(
        { error: 'STT tokens are only available for Checkride Prep and DPE Live tiers.' },
        { status: 403 }
      );
    }

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

    // Request temporary token from Deepgram
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch('https://api.deepgram.com/v1/auth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text().catch(() => 'Unknown error');
      console.error('Deepgram token request failed:', tokenResponse.status, errorBody);
      return NextResponse.json(
        { error: 'Failed to obtain STT token' },
        { status: 502 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token || tokenData.token;
    const expiresIn = tokenData.expires_in || TOKEN_TTL_SECONDS;

    if (!accessToken) {
      console.error('Deepgram token response missing access_token:', tokenData);
      return NextResponse.json(
        { error: 'Invalid token response from STT provider' },
        { status: 502 }
      );
    }

    const expiresAt = Date.now() + expiresIn * 1000;

    // Build pre-configured WebSocket URL
    const wsUrl = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',
      vad_events: 'true',
    }).toString();

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
        metadata: { ttl_seconds: TOKEN_TTL_SECONDS },
      })
      .then(({ error }) => {
        if (error) console.error('Token issuance log error:', error.message);
      });

    return NextResponse.json({
      token: accessToken,
      url: wsUrl,
      expiresAt,
    });
  } catch (error) {
    console.error('STT token error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
