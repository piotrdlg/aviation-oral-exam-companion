import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOKEN_RATE_LIMIT = 4; // max tokens per minute per user
const TOKEN_TTL_SECONDS = 600; // 10 minutes — enough for a full exam session

// Cache project ID to avoid repeated lookups
let cachedProjectId: string | null = null;

/**
 * Discover the Deepgram project ID from the API key.
 * Most accounts have a single project. Cached for the lifetime of the server.
 */
async function getProjectId(apiKey: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId;

  const res = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { 'Authorization': `Token ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Deepgram projects (${res.status}): ${body}`);
  }

  const data = await res.json();
  const projects = data.projects;
  if (!projects || projects.length === 0) {
    throw new Error('No Deepgram projects found for this API key');
  }

  cachedProjectId = projects[0].project_id;
  return cachedProjectId!;
}

/**
 * GET /api/stt/token
 * Issues a temporary Deepgram API key for direct client-to-Deepgram WebSocket connection.
 * Uses the Keys API (not auth/grant) to create a real API key that works with
 * Sec-WebSocket-Protocol auth in browsers.
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

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    // Discover project ID (cached after first call)
    const projectId = await getProjectId(deepgramApiKey);

    // Create a temporary API key using the Keys API
    // This returns a REAL API key (not a JWT) that works with Sec-WebSocket-Protocol
    const keyResponse = await fetch(
      `https://api.deepgram.com/v1/projects/${projectId}/keys`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: `Browser STT key for user ${user.id.slice(0, 8)}`,
          scopes: ['usage:write'],
          time_to_live_in_seconds: TOKEN_TTL_SECONDS,
        }),
      }
    );

    if (!keyResponse.ok) {
      const errorBody = await keyResponse.text().catch(() => 'Unknown error');
      console.error('Deepgram key creation failed:', keyResponse.status, errorBody);
      return NextResponse.json(
        { error: 'Failed to create STT key' },
        { status: 502 }
      );
    }

    const keyData = await keyResponse.json();
    const tempKey = keyData.key;
    const apiKeyId = keyData.api_key_id;

    if (!tempKey) {
      console.error('Deepgram key response — no key found. Fields:', Object.keys(keyData));
      return NextResponse.json(
        { error: 'Invalid key response from STT provider' },
        { status: 502 }
      );
    }

    const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;

    // Build pre-configured WebSocket URL with all params including keywords
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',
      vad_events: 'true',
    });
    // Aviation vocabulary keywords for recognition accuracy
    const keywords = [
      'METAR', 'TAF', 'NOTAM', 'PIREP', 'SIGMET', 'AIRMET',
      'VOR', 'NDB', 'ILS', 'RNAV', 'GPS', 'DME',
      'ACS', 'DPE', 'ASEL', 'AMEL', 'ASES', 'AMES',
      'Cessna', 'Piper', 'Beechcraft', 'Cirrus',
      'CTAF', 'ATIS', 'AWOS', 'ASOS',
      'FAR', 'AIM', 'POH', 'AFM',
      'ADM', 'CRM', 'SRM', 'IMSAFE', 'PAVE', 'DECIDE',
      'sectional', 'checkride', 'logbook', 'endorsement',
    ];
    for (const kw of keywords) {
      params.append('keywords', kw);
    }
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
        metadata: {
          ttl_seconds: TOKEN_TTL_SECONDS,
          api_key_id: apiKeyId,
          method: 'keys_api',
        },
      })
      .then(({ error }) => {
        if (error) console.error('Token issuance log error:', error.message);
      });

    return NextResponse.json({
      token: tempKey,
      url: wsUrl,
      expiresAt,
      _debug: {
        method: 'keys_api',
        projectId: projectId.slice(0, 8) + '...',
        apiKeyId,
        tokenLen: tempKey.length,
        tokenPrefix: tempKey.slice(0, 10) + '...',
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
