/**
 * W6.2 — k6 exam-loop load test. Target a PREVIEW deployment only.
 *
 *   BASE_URL=https://<preview>.vercel.app k6 run scripts/load/k6-exam.js
 *
 * Each VU: create session → start → 5 respond exchanges → discard.
 * Requires users.local.json (setup-loadtest-users.ts) and the preview env
 * to have LOAD_TEST_MOCK_LLM=1 (LLM calls mocked at ~800ms; everything
 * else — auth, session policy, quota checks, RAG retrieval, DB writes —
 * is the real path).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const users = JSON.parse(open('./users.local.json'));
const BASE = __ENV.BASE_URL;
if (!BASE || BASE.includes('aviation-oral-exam-companion.vercel.app')) {
  throw new Error('BASE_URL must be a PREVIEW deployment, never production');
}

export const options = {
  scenarios: {
    // Ramp concurrency in stages to find the latency ceiling; each VU is a
    // distinct user running complete exams sequentially (no retry storm).
    exam: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '90s', target: 10 },
        { duration: '90s', target: 25 },
        { duration: '120s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // Successful-request latency is the capacity signal we gate on.
    http_req_duration: ['p(95)<2000'],
    // 429s are EXPECTED and graceful; we track them separately and only fail
    // on genuine server errors (5xx / timeouts).
    server_errors: ['count<10'],
  },
};

const respondLatency = new Trend('respond_latency', true);
const startLatency = new Trend('start_latency', true);
const examErrors = new Rate('exam_errors');
const serverErrors = new Counter('server_errors'); // 5xx / network only
const rateLimited = new Counter('rate_limited_429');

function classify(res) {
  if (res.status >= 500 || res.status === 0) { serverErrors.add(1); return 'server_error'; }
  if (res.status === 429) { rateLimited.add(1); return 'rate_limited'; }
  return res.status === 200 ? 'ok' : 'other';
}

const SESSION_CONFIG = {
  rating: 'private', studyMode: 'linear', difficulty: 'mixed',
  selectedAreas: [], selectedTasks: [], aircraftClass: 'ASEL', voiceEnabled: false,
};

export default function () {
  const u = users[(__VU - 1) % users.length]; // 50 VUs ≤ 50 users → effectively 1:1
  const params = {
    headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': __ENV.BYPASS || '', Cookie: u.cookieValue },
    timeout: '60s',
  };

  // 1. create session
  const createRes = http.post(`${BASE}/api/session`, JSON.stringify({
    action: 'create', rating: 'private', metadata: { sessionConfig: SESSION_CONFIG, loadtest: true },
  }), params);
  const sessionId = createRes.json('sessionId') || createRes.json('id') || (createRes.json('session') || {}).id;
  if (!check(createRes, { 'session created': (r) => r.status === 200 && !!sessionId })) {
    examErrors.add(1); sleep(2); return;
  }

  // 2. start
  const t0 = Date.now();
  const startRes = http.post(`${BASE}/api/exam`, JSON.stringify({
    action: 'start', sessionId, sessionConfig: SESSION_CONFIG, stream: false,
  }), params);
  const startClass = classify(startRes);
  if (startClass === 'ok') startLatency.add(Date.now() - t0);
  const taskData = startRes.json('taskData');
  check(startRes, { 'start ok or rate-limited (no 5xx)': () => startClass !== 'server_error' });
  if (startClass !== 'ok' || !taskData) {
    examErrors.add(startClass === 'server_error' ? 1 : 0); // 429 is not an error
    sleep(8); return; // back off a full window rather than retry-storm
  }
  examErrors.add(0);

  // 3. five respond exchanges
  let history = [{ role: 'examiner', text: startRes.json('examinerMessage') || 'q' }];
  for (let i = 0; i < 5; i++) {
    const answer = `Load test answer ${i}: the regulations require a current medical, flight review, and the appropriate category and class ratings.`;
    const t1 = Date.now();
    const r = http.post(`${BASE}/api/exam`, JSON.stringify({
      action: 'respond', sessionId, sessionConfig: SESSION_CONFIG,
      taskData, history, studentAnswer: answer, stream: false,
    }), params);
    const rClass = classify(r);
    if (rClass === 'ok') respondLatency.add(Date.now() - t1);
    check(r, { 'respond no 5xx': () => rClass !== 'server_error' });
    examErrors.add(rClass === 'server_error' ? 1 : 0);
    if (rClass !== 'ok') { sleep(8); break; }
    history.push({ role: 'student', text: answer });
    history.push({ role: 'examiner', text: r.json('examinerMessage') || 'next q' });
    // Realistic pacing: students think/speak for tens of seconds between
    // answers. 6s here is ~4x FASTER than real usage, leaving headroom, and
    // stays under the per-user rate limit (20 exam calls/min) — which an
    // unpaced loop trips by design (the limiter IS the first protection).
    sleep(6);
  }

  // 4. discard (cleanup; also exercises the W3.2 discard path)
  http.post(`${BASE}/api/session`, JSON.stringify({ action: 'discard', sessionId }), params);
  sleep(3);
}
