/**
 * W6.2 — k6 voice-path load test (TTS synthesis + STT token issuance).
 *   BASE_URL=https://<preview>.vercel.app k6 run scripts/load/k6-voice.js
 * NOTE: TTS hits the real Deepgram API (short sentences — pennies); the STT
 * token route hits real auth/grant. Rate limits (30 TTS/min, 4 tokens/min
 * per user) are part of what we're measuring — 429s are EXPECTED at the
 * high stages and are counted separately from errors.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const users = JSON.parse(open('./users.local.json'));
const BASE = __ENV.BASE_URL;
if (!BASE || BASE.includes('aviation-oral-exam-companion.vercel.app')) {
  throw new Error('BASE_URL must be a PREVIEW deployment, never production');
}

export const options = {
  scenarios: {
    voice: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '1m', target: 0 },
      ],
    },
  },
};

const ttsTtfb = new Trend('tts_ttfb', true);
const rateLimited = new Counter('rate_limited_429');

export default function () {
  const u = users[(__VU - 1) % users.length];
  const params = { headers: { 'Content-Type': 'application/json', Cookie: `${u.cookieName}=${u.cookieValue}` }, timeout: '30s' };

  const tts = http.post(`${BASE}/api/tts`, JSON.stringify({ text: 'Cleared for the option, runway two seven left.' }), params);
  if (tts.status === 429) rateLimited.add(1);
  else { check(tts, { 'tts ok': (r) => r.status === 200 }); ttsTtfb.add(tts.timings.waiting); }

  const tok = http.get(`${BASE}/api/stt/token`, params);
  if (tok.status === 429) rateLimited.add(1);
  else check(tok, { 'stt token ok': (r) => r.status === 200 });

  sleep(3);
}
