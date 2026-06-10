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
import { Trend, Rate } from 'k6/metrics';

const users = JSON.parse(open('./users.local.json'));
const BASE = __ENV.BASE_URL;
if (!BASE || BASE.includes('aviation-oral-exam-companion.vercel.app')) {
  throw new Error('BASE_URL must be a PREVIEW deployment, never production');
}

export const options = {
  scenarios: {
    exam: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const respondLatency = new Trend('respond_latency', true);
const startLatency = new Trend('start_latency', true);
const examErrors = new Rate('exam_errors');

const SESSION_CONFIG = {
  rating: 'private', studyMode: 'linear', difficulty: 'mixed',
  selectedAreas: [], selectedTasks: [], aircraftClass: 'ASEL', voiceEnabled: false,
};

export default function () {
  const u = users[(__VU - 1) % users.length];
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
  startLatency.add(Date.now() - t0);
  const taskData = startRes.json('taskData');
  if (!check(startRes, { 'exam started': (r) => r.status === 200 && !!taskData })) {
    examErrors.add(1); sleep(2); return;
  }

  // 3. five respond exchanges
  let history = [{ role: 'examiner', text: startRes.json('examinerMessage') || 'q' }];
  for (let i = 0; i < 5; i++) {
    const answer = `Load test answer ${i}: the regulations require a current medical, flight review, and the appropriate category and class ratings.`;
    const t1 = Date.now();
    const r = http.post(`${BASE}/api/exam`, JSON.stringify({
      action: 'respond', sessionId, sessionConfig: SESSION_CONFIG,
      taskData, history, studentAnswer: answer, stream: false,
    }), params);
    respondLatency.add(Date.now() - t1);
    const ok = check(r, { 'respond ok': (x) => x.status === 200 });
    examErrors.add(ok ? 0 : 1);
    if (!ok) break;
    history.push({ role: 'student', text: answer });
    history.push({ role: 'examiner', text: r.json('examinerMessage') || 'next q' });
    sleep(1);
  }

  // 4. discard (cleanup; also exercises the W3.2 discard path)
  http.post(`${BASE}/api/session`, JSON.stringify({ action: 'discard', sessionId }), params);
  sleep(1);
}
