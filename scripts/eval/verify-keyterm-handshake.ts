/**
 * W4.3 — live verification that the Deepgram WebSocket handshake ACCEPTS the
 * exact URLs the token route now issues (nova-3 + keyterm list, and the Flux
 * pilot URL). History: a NOVA-2-era `keywords=` list broke the handshake in
 * production, so any param change to the STT URL must pass this before merge.
 *
 * Usage: npx tsx scripts/eval/verify-keyterm-handshake.ts
 * Requires DEEPGRAM_API_KEY in .env.local. Costs ~nothing (opens + closes).
 */
import dotenv from 'dotenv';
import { AVIATION_KEYTERMS, appendKeytermParams } from '../../src/lib/voice/aviation-keyterms';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) { console.error('DEEPGRAM_API_KEY missing'); process.exit(1); }

async function grantJwt(): Promise<string> {
  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  if (!res.ok) throw new Error(`auth/grant failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

function tryHandshake(label: string, url: string, jwt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, ['bearer', jwt]);
    const timer = setTimeout(() => {
      console.log(`✗ ${label}: TIMEOUT (no open within 8s)`);
      try { ws.close(); } catch { /* noop */ }
      resolve(false);
    }, 8000);
    ws.onopen = () => {
      clearTimeout(timer);
      console.log(`✓ ${label}: handshake ACCEPTED`);
      ws.send(JSON.stringify({ type: 'CloseStream' }));
      ws.close();
      resolve(true);
    };
    ws.onclose = (ev: { code: number; reason: string }) => {
      clearTimeout(timer);
      if (ev.code !== 1000 && ev.code !== 1005) {
        console.log(`✗ ${label}: closed pre-open code=${ev.code} reason=${ev.reason}`);
        resolve(false);
      }
    };
    ws.onerror = () => { /* onclose reports the code */ };
  });
}

async function main() {
  const jwt = await grantJwt();
  console.log(`JWT granted (${jwt.length} chars). Keyterms: ${AVIATION_KEYTERMS.length}`);

  // EXACT nova-3 URL the token route builds
  const novaParams = new URLSearchParams({
    model: 'nova-3', language: 'en-US', smart_format: 'true',
    interim_results: 'true', utterance_end_ms: '1500', vad_events: 'true',
  });
  appendKeytermParams(novaParams);
  const novaUrl = 'wss://api.deepgram.com/v1/listen?' + novaParams.toString();
  console.log(`nova-3 URL length: ${novaUrl.length}`);

  // EXACT Flux pilot URL
  const fluxParams = new URLSearchParams({ model: 'flux-general-en', eot_threshold: '0.7' });
  appendKeytermParams(fluxParams);
  const fluxUrl = 'wss://api.deepgram.com/v2/listen?' + fluxParams.toString();

  const r1 = await tryHandshake('nova-3 + keyterms', novaUrl, jwt);
  const r2 = await tryHandshake('flux pilot + keyterms', fluxUrl, jwt);

  if (!r1) { console.error('\nFAIL: nova-3 keyterm handshake rejected — DO NOT MERGE.'); process.exit(1); }
  if (!r2) console.warn('\nWARN: flux handshake rejected — pilot flag must stay OFF.');
  console.log('\nPASS: production STT URL verified against live Deepgram.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
