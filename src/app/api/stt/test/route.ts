import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createDeepgramClient, LiveTranscriptionEvents } from '@deepgram/sdk';

/**
 * GET /api/stt/test
 * Server-side diagnostic: tests Deepgram WebSocket connectivity from Node.js.
 * Returns the actual connection result (success/failure with real error codes)
 * that Chrome hides from browser WebSocket connections.
 *
 * This endpoint is for debugging only — remove after STT is working.
 */
export async function GET() {
  const results: Record<string, unknown> = {};
  const t0 = Date.now();

  try {
    // 1. Auth check (lightweight)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json({ error: 'DEEPGRAM_API_KEY not set' }, { status: 500 });
    }

    results.apiKeyPrefix = deepgramApiKey.slice(0, 8) + '...';
    results.apiKeyLen = deepgramApiKey.length;

    // 2. Test auth/grant token generation
    const grantT0 = Date.now();
    let accessToken: string | null = null;
    try {
      const grantRes = await fetch('https://api.deepgram.com/v1/auth/grant', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl_seconds: 30 }),
      });
      const grantBody = await grantRes.text();
      results.authGrant = {
        status: grantRes.status,
        ms: Date.now() - grantT0,
        body: grantBody.slice(0, 500),
      };
      if (grantRes.ok) {
        const parsed = JSON.parse(grantBody);
        accessToken = parsed.access_token;
        results.authGrant = {
          ...results.authGrant as Record<string, unknown>,
          tokenLen: accessToken?.length,
          tokenPrefix: accessToken?.slice(0, 20) + '...',
          expiresIn: parsed.expires_in,
        };
      }
    } catch (err) {
      results.authGrant = { error: err instanceof Error ? err.message : String(err) };
    }

    // 3. Test direct API key with Deepgram SDK (server-side, no browser limitations)
    const sdkT0 = Date.now();
    try {
      const sdkResult = await new Promise<{ connected: boolean; error?: string; events: string[] }>((resolve) => {
        const events: string[] = [];
        const timeout = setTimeout(() => {
          resolve({ connected: false, error: 'Timeout (10s)', events });
        }, 10000);

        try {
          const deepgram = createDeepgramClient(deepgramApiKey);
          const connection = deepgram.listen.live({
            model: 'nova-3',
            language: 'en-US',
            smart_format: true,
            interim_results: true,
            utterance_end_ms: 1500,
            vad_events: true,
          });

          connection.on(LiveTranscriptionEvents.Open, () => {
            events.push('open');
            clearTimeout(timeout);
            connection.requestClose();
            resolve({ connected: true, events });
          });

          connection.on(LiveTranscriptionEvents.Error, (err) => {
            events.push(`error: ${err?.message || JSON.stringify(err)}`);
            clearTimeout(timeout);
            resolve({ connected: false, error: err?.message || JSON.stringify(err), events });
          });

          connection.on(LiveTranscriptionEvents.Close, () => {
            events.push('close');
          });
        } catch (err) {
          clearTimeout(timeout);
          events.push(`constructor_error: ${err instanceof Error ? err.message : String(err)}`);
          resolve({ connected: false, error: err instanceof Error ? err.message : String(err), events });
        }
      });

      results.sdkDirectKey = {
        ...sdkResult,
        ms: Date.now() - sdkT0,
      };
    } catch (err) {
      results.sdkDirectKey = { error: err instanceof Error ? err.message : String(err) };
    }

    // 4. Test with auth/grant token via SDK using accessToken option
    // SDK source: AbstractLiveClient uses ["bearer", accessToken] for JWTs
    // vs ["token", apiKey] for API keys — this is the critical difference
    if (accessToken) {
      const sdkTokenT0 = Date.now();
      try {
        const sdkTokenResult = await new Promise<{ connected: boolean; error?: string; events: string[] }>((resolve) => {
          const events: string[] = [];
          const timeout = setTimeout(() => {
            resolve({ connected: false, error: 'Timeout (10s)', events });
          }, 10000);

          try {
            // accessToken option uses Bearer auth (correct for JWTs)
            // key option uses Token auth (only for raw API keys)
            const deepgram = createDeepgramClient({ accessToken: accessToken! });
            const connection = deepgram.listen.live({
              model: 'nova-3',
              language: 'en-US',
              smart_format: true,
            });

            connection.on(LiveTranscriptionEvents.Open, () => {
              events.push('open');
              clearTimeout(timeout);
              connection.requestClose();
              resolve({ connected: true, events });
            });

            connection.on(LiveTranscriptionEvents.Error, (err) => {
              events.push(`error: ${err?.message || JSON.stringify(err)}`);
              clearTimeout(timeout);
              resolve({ connected: false, error: err?.message || JSON.stringify(err), events });
            });

            connection.on(LiveTranscriptionEvents.Close, () => {
              events.push('close');
            });
          } catch (err) {
            clearTimeout(timeout);
            events.push(`constructor_error: ${err instanceof Error ? err.message : String(err)}`);
            resolve({ connected: false, error: err instanceof Error ? err.message : String(err), events });
          }
        });

        results.sdkWithAccessToken = {
          ...sdkTokenResult,
          ms: Date.now() - sdkTokenT0,
          note: 'Uses ["bearer", jwt] protocol (correct for auth/grant JWTs)',
        };
      } catch (err) {
        results.sdkWithAccessToken = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    results.totalMs = Date.now() - t0;
    results.sdkProtocolNote = 'SDK uses ["bearer", jwt] for accessToken, ["token", key] for API keys';
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error', results },
      { status: 500 }
    );
  }
}
