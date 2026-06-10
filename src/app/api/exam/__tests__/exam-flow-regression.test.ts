import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * W2.6 — Exam-flow regression harness.
 *
 * Drives the REAL exam + session route handlers and the REAL planner against
 * an in-memory database fake, with the LLM mocked deterministically. Locks in
 * the Phase 2 wins:
 *   1. planner advancement: a live exam visits multiple ACS tasks
 *   2. natural completion: plan budget exhausts -> sessionComplete + pass grade
 *   3. write integrity: every assessed exchange has transcript + assessment +
 *      exactly one primary element_attempt
 *   4. resume-current returns the PENDING element (recent last)
 */

// ---------------------------------------------------------------------------
// In-memory database fake (hoisted for vi.mock factories)
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const db: Record<string, Row[]> = {};
  let idSeq = 1;

  function reset() {
    idSeq = 1;
    db.acs_elements = [
      { code: 'PA.I.A.K1', task_id: 'PA.I.A', element_type: 'knowledge', description: 'Certification requirements', order_index: 1, difficulty_default: 'medium', weight: 1, created_at: 'x' },
      { code: 'PA.I.A.K2', task_id: 'PA.I.A', element_type: 'knowledge', description: 'Currency requirements', order_index: 2, difficulty_default: 'medium', weight: 1, created_at: 'x' },
      { code: 'PA.II.A.K1', task_id: 'PA.II.A', element_type: 'knowledge', description: 'Weather information', order_index: 1, difficulty_default: 'medium', weight: 1, created_at: 'x' },
      { code: 'PA.II.A.K2', task_id: 'PA.II.A', element_type: 'knowledge', description: 'Weather products', order_index: 2, difficulty_default: 'medium', weight: 1, created_at: 'x' },
      // Flight-only area: must be excluded by the W2.5 oral-area filter
      { code: 'PA.IV.A.K1', task_id: 'PA.IV.A', element_type: 'knowledge', description: 'Takeoff knowledge', order_index: 1, difficulty_default: 'medium', weight: 1, created_at: 'x' },
    ];
    db.acs_tasks = [
      { id: 'PA.I.A', rating: 'private', area: 'I', task: 'Pilot Qualifications', knowledge_elements: [{ code: 'PA.I.A.K1', description: 'Certification requirements' }, { code: 'PA.I.A.K2', description: 'Currency requirements' }], risk_management_elements: [], skill_elements: [], applicable_classes: ['ASEL'] },
      { id: 'PA.II.A', rating: 'private', area: 'II', task: 'Weather Information', knowledge_elements: [{ code: 'PA.II.A.K1', description: 'Weather information' }, { code: 'PA.II.A.K2', description: 'Weather products' }], risk_management_elements: [], skill_elements: [], applicable_classes: ['ASEL'] },
      { id: 'PA.IV.A', rating: 'private', area: 'IV', task: 'Takeoffs', knowledge_elements: [{ code: 'PA.IV.A.K1', description: 'Takeoff knowledge' }], risk_management_elements: [], skill_elements: [], applicable_classes: ['ASEL'] },
    ];
    db.exam_sessions = [
      { id: 'sess-1', user_id: 'user-1', rating: 'private', status: 'active', metadata: {}, acs_tasks_covered: [], exchange_count: 0 },
    ];
    db.session_transcripts = [];
    db.element_attempts = [];
    db.user_profiles = [{ user_id: 'user-1', display_name: 'Test Pilot', preferred_voice: null, examiner_profile: null }];
    db.active_sessions = [];
    db.usage_logs = [];
    db.system_config = [];
    db.transcript_citations = [];
  }
  reset();

  // --- minimal supabase query builder over the in-memory db ---
  function builder(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update' | 'upsert' | 'delete',
      payload: null as Row | Row[] | null,
      filters: [] as Array<(r: Row) => boolean>,
      order: null as { col: string; asc: boolean } | null,
      limitN: null as number | null,
      single: false,
      maybe: false,
      head: false,
      count: false,
    };
    const api: Record<string, unknown> = {};
    const chain = (fn: () => void) => { fn(); return api; };
    api.select = (_cols?: string, opts?: { count?: string; head?: boolean }) =>
      chain(() => { if (opts?.head) state.head = true; if (opts?.count) state.count = true; });
    api.insert = (payload: Row | Row[]) => chain(() => { state.op = 'insert'; state.payload = payload; });
    api.update = (payload: Row) => chain(() => { state.op = 'update'; state.payload = payload; });
    api.upsert = (payload: Row, _opts?: unknown) => chain(() => { state.op = 'upsert'; state.payload = payload; });
    api.eq = (col: string, v: unknown) => chain(() => state.filters.push((r) => r[col] === v));
    api.neq = (col: string, v: unknown) => chain(() => state.filters.push((r) => r[col] !== v));
    api.like = (col: string, pat: string) => chain(() => {
      const prefix = pat.replace(/%$/, '');
      state.filters.push((r) => String(r[col]).startsWith(prefix));
    });
    api.in = (col: string, arr: unknown[]) => chain(() => state.filters.push((r) => arr.includes(r[col])));
    api.not = (col: string, op: string, v: unknown) => chain(() => {
      if (op === 'is' && v === null) state.filters.push((r) => r[col] !== null && r[col] !== undefined);
    });
    api.is = (col: string, v: unknown) => chain(() => state.filters.push((r) => r[col] === v));
    api.contains = (col: string, arr: unknown[]) => chain(() =>
      state.filters.push((r) => Array.isArray(r[col]) && (arr as unknown[]).every((v) => (r[col] as unknown[]).includes(v))));
    api.or = (expr: string) => chain(() => {
      // supports "code.like.PA.I.%,code.like.PA.II.%" form
      const clauses = expr.split(',').map((c) => {
        const m = c.match(/^(\w+)\.like\.(.+)$/);
        return m ? { col: m[1], prefix: m[2].replace(/%$/, '') } : null;
      }).filter(Boolean) as Array<{ col: string; prefix: string }>;
      state.filters.push((r) => clauses.some((cl) => String(r[cl.col]).startsWith(cl.prefix)));
    });
    api.order = (col: string, opts?: { ascending?: boolean }) =>
      chain(() => { state.order = { col, asc: opts?.ascending !== false }; });
    api.limit = (n: number) => chain(() => { state.limitN = n; });
    api.single = () => chain(() => { state.single = true; });
    api.maybeSingle = () => chain(() => { state.maybe = true; });

    const exec = () => {
      const rows = db[table] || (db[table] = []);
      if (state.op === 'insert') {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload!];
        const inserted = list.map((p) => ({ id: `row-${idSeq++}`, created_at: new Date(2026, 5, 10, 0, 0, idSeq).toISOString(), timestamp: new Date().toISOString(), ...p }));
        rows.push(...inserted);
        const data = state.single ? inserted[0] : inserted;
        return { data, error: null, count: null };
      }
      if (state.op === 'update') {
        const matched = rows.filter((r) => state.filters.every((f) => f(r)));
        for (const r of matched) Object.assign(r, state.payload);
        return { data: matched, error: null, count: null };
      }
      if (state.op === 'upsert') {
        const p = state.payload as Row;
        const key = rows.find((r) => r.user_id === p.user_id && r.session_token_hash === p.session_token_hash);
        if (key) Object.assign(key, p); else rows.push({ id: `row-${idSeq++}`, ...p });
        return { data: null, error: null, count: null };
      }
      let out = rows.filter((r) => state.filters.every((f) => f(r)));
      if (state.order) {
        const { col, asc } = state.order;
        out = [...out].sort((a, b) => (a[col]! < b[col]! ? -1 : a[col]! > b[col]! ? 1 : 0) * (asc ? 1 : -1));
      }
      if (state.limitN !== null) out = out.slice(0, state.limitN);
      if (state.head) return { data: null, error: null, count: out.length };
      if (state.single || state.maybe) {
        return { data: out[0] ?? null, error: out[0] || state.maybe ? null : { code: 'PGRST116', message: 'no rows' }, count: null };
      }
      return { data: out, error: null, count: state.count ? out.length : null };
    };

    (api as { then: unknown }).then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(exec()).then(resolve, reject);
    return api;
  }

  // fake JWT with a session_id claim (for getSessionTokenHash)
  const jwt = ['x', Buffer.from(JSON.stringify({ session_id: 'login-1' })).toString('base64url'), 'y'].join('.');

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 't@example.com' } } }),
      getSession: async () => ({ data: { session: { access_token: jwt } } }),
    },
    from: (table: string) => builder(table),
    rpc: async () => ({ data: [], error: null }),
  };

  const pendingAfters: Promise<unknown>[] = [];
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];

  return { db, reset, client, pendingAfters, events, tier: 'dpe_live', config: {} as Record<string, unknown> };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => {
  const orig = await importOriginal<typeof import('next/server')>();
  return { ...orig, after: vi.fn((fn: () => Promise<unknown>) => { h.pendingAfters.push(Promise.resolve().then(fn)); }) };
});
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.client) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => h.client) }));
vi.mock('@/lib/system-config', () => ({ getSystemConfig: vi.fn(async () => h.config) }));
vi.mock('@/lib/kill-switch', () => ({ checkKillSwitch: vi.fn(() => ({ blocked: false })) }));
vi.mock('@/lib/app-env', () => ({ requireSafeDbTarget: vi.fn() }));
vi.mock('@/lib/voice/tier-lookup', () => ({ getUserTier: vi.fn(async () => h.tier) }));
vi.mock('@/lib/timing', () => {
  const permissive = new Proxy({}, { get: () => vi.fn(() => ({})) });
  return { createTimingContext: vi.fn(() => permissive), writeTimings: vi.fn() };
});
vi.mock('@/lib/posthog-server', () => ({
  captureServerEvent: vi.fn((_uid: string, name: string, props: Record<string, unknown>) => h.events.push({ name, props })),
  flushPostHog: vi.fn(),
}));
vi.mock('@/lib/rag-retrieval', () => ({
  searchChunks: vi.fn(async () => []),
  formatChunksForPrompt: vi.fn(() => ''),
  getImagesForChunks: vi.fn(async () => []),
}));
// Deterministic LLM: assessAnswer scores the CURRENT planner element
// satisfactory; the examiner replies with a fixed question.
vi.mock('@/lib/exam-engine', () => ({
  pickStartingTask: vi.fn(),
  pickNextTask: vi.fn(),
  generateExaminerTurn: vi.fn(async () => ({
    examinerMessage: 'Good. Tell me more about the next topic.',
    usage: { input_tokens: 10, output_tokens: 10, latency_ms: 5 },
  })),
  generateExaminerTurnStreaming: vi.fn(),
  assessAnswer: vi.fn(async () => {
    const session = h.db.exam_sessions[0];
    const meta = (session.metadata as Record<string, unknown>) || {};
    const planner = meta.plannerState as { recent?: string[] } | undefined;
    const current = planner?.recent?.length ? planner.recent[planner.recent.length - 1] : null;
    return {
      score: 'satisfactory' as const,
      feedback: 'correct',
      misconceptions: [],
      follow_up_needed: false,
      primary_element: current,
      mentioned_elements: [],
      source_summary: 'ok',
      usage: { input_tokens: 10, output_tokens: 10, latency_ms: 5 },
    };
  }),
  fetchRagContext: vi.fn(async () => ({ ragContext: '', ragChunks: [], ragImages: [] })),
  loadPromptFromDB: vi.fn(async () => ({ content: '', versionId: null })),
}));

import { POST as examPost } from '../route';

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/exam', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function flushAfters() {
  await Promise.all(h.pendingAfters.splice(0));
}

const SESSION_CONFIG = {
  rating: 'private',
  aircraftClass: undefined,
  studyMode: 'linear',
  difficulty: 'medium',
  selectedAreas: [],
  selectedTasks: [],
};

describe('exam-flow regression (W2.6)', () => {
  beforeEach(() => {
    h.reset();
    h.pendingAfters.length = 0;
    h.events.length = 0;
    h.tier = 'dpe_live';
    h.config = {};
  });

  it('runs a full exam: advancement across tasks, natural completion, write integrity', async () => {
    // --- start ---
    const startRes = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG }));
    expect(startRes.status).toBe(200);
    const start = await startRes.json();
    expect(start.taskData?.id).toBe('PA.I.A');
    expect(start.examPlan?.planned_question_count).toBe(4); // 4 oral elements (PA.IV excluded)
    await flushAfters();

    // Oral-area filter (W2.5): PA.IV never enters the queue
    const meta0 = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    const queue = (meta0.plannerState as { queue: string[] }).queue;
    expect(queue).not.toContain('PA.IV.A.K1');

    // --- answer/advance loop ---
    const visitedTasks = new Set<string>([start.taskData.id]);
    let history: Array<{ role: string; text: string }> = [
      { role: 'examiner', text: start.examinerMessage },
    ];
    let sessionComplete = false;
    let currentTask = start.taskData;

    for (let i = 0; i < 10 && !sessionComplete; i++) {
      const answer = `Answer number ${i + 1}`;
      const respondRes = await examPost(req({
        action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
        taskData: currentTask, history, studentAnswer: answer, stream: false,
      }));
      expect(respondRes.status).toBe(200);
      const respond = await respondRes.json();
      await flushAfters();

      history = [...history, { role: 'student', text: answer }, { role: 'examiner', text: respond.examinerMessage }];
      expect(respond.assessment.score).toBe('satisfactory');
      // 1. ADVANCEMENT: satisfactory answers always advance
      expect(respond.advance).toBe(true);

      const nextRes = await examPost(req({ action: 'next-task', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG }));
      expect(nextRes.status).toBe(200);
      const next = await nextRes.json();
      await flushAfters();

      if (next.sessionComplete) {
        sessionComplete = true;
        break;
      }
      visitedTasks.add(next.taskData.id);
      currentTask = next.taskData;
      history = [...history, { role: 'examiner', text: next.examinerMessage }];
    }

    // 2. NATURAL COMPLETION: 4-question budget exhausts after the 4th answer
    expect(sessionComplete).toBe(true);
    const session = h.db.exam_sessions[0];
    expect(session.status).toBe('completed');
    const result = session.result as { grade: string };
    // All-satisfactory exam grades PASS (W2.3 bug 9: never 'incomplete')
    expect(result.grade).toBe('satisfactory');
    const v2 = (session.metadata as Record<string, unknown>).examResultV2 as { overall_status: string; overall_score: number };
    expect(v2.overall_status).toBe('pass');
    expect(v2.overall_score).toBeLessThanOrEqual(1);

    // ADVANCEMENT across multiple ACS tasks (the headline Phase 2 fix)
    expect(visitedTasks.size).toBeGreaterThanOrEqual(2);

    // 3. WRITE INTEGRITY
    const students = h.db.session_transcripts.filter((t) => t.role === 'student');
    expect(students.length).toBe(4);
    for (const s of students) {
      expect(s.assessment).toBeTruthy(); // every student row assessed
    }
    const primaries = h.db.element_attempts.filter((a) => a.is_primary);
    expect(primaries.length).toBe(4); // exactly one primary per exchange
    const attemptedElements = new Set(primaries.map((a) => a.element_code));
    expect(attemptedElements.size).toBe(4); // each plan element scored once
    // examiner transcripts: opening + 4 feedback + 3 transitions (4th next-task completes)
    const examiners = h.db.session_transcripts.filter((t) => t.role === 'examiner');
    expect(examiners.length).toBe(8);
  });

  it('resume-current returns the PENDING element (recent last), not queue[cursor]', async () => {
    await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG }));
    await flushAfters();

    const res = await examPost(req({ action: 'resume-current', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG }));
    expect(res.status).toBe(200);
    const data = await res.json();
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    const planner = meta.plannerState as { recent: string[]; queue: string[]; cursor: number };
    const pending = planner.recent[planner.recent.length - 1];
    expect(data.elementCode).toBe(pending);
    // and with cursor advanced past the pending element, queue[cursor] differs
    expect(planner.queue[planner.cursor]).not.toBe(pending);
  });

  it('keeps a non-satisfactory element for ONE follow-up, then advances', async () => {
    const { assessAnswer } = await import('@/lib/exam-engine');
    (assessAnswer as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      const meta = (h.db.exam_sessions[0].metadata as Record<string, unknown>) || {};
      const planner = meta.plannerState as { recent?: string[] } | undefined;
      const current = planner?.recent?.length ? planner.recent[planner.recent.length - 1] : null;
      return {
        score: 'partial' as const, feedback: 'half right', misconceptions: [],
        follow_up_needed: true, primary_element: current, mentioned_elements: [],
        source_summary: 'ok', usage: { input_tokens: 1, output_tokens: 1, latency_ms: 1 },
      };
    });

    const startRes = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG }));
    const start = await startRes.json();
    await flushAfters();

    // First partial answer: stay on the element (follow-up)
    const r1 = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: start.taskData, history: [{ role: 'examiner', text: 'q' }], studentAnswer: 'meh', stream: false,
    }));
    const d1 = await r1.json();
    await flushAfters();
    expect(d1.advance).toBe(false);

    // Second partial answer on the same element: follow-up budget used -> advance
    const r2 = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: start.taskData,
      history: [{ role: 'examiner', text: 'q' }, { role: 'student', text: 'meh' }, { role: 'examiner', text: 'follow-up q' }],
      studentAnswer: 'meh again', stream: false,
    }));
    const d2 = await r2.json();
    await flushAfters();
    expect(d2.advance).toBe(true);
  });
});

describe('exam quota enforcement (W3.2)', () => {
  beforeEach(() => {
    h.reset();
    h.pendingAfters.length = 0;
    h.events.length = 0;
    h.tier = 'dpe_live';
    h.config = {};
  });

  it('rejects respond on a non-active session (409)', async () => {
    h.db.exam_sessions[0].status = 'paused';
    const res = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: { id: 'PA.I.A' }, history: [{ role: 'examiner', text: 'q' }], studentAnswer: 'a', stream: false,
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('session_not_active');
  });

  it('rejects respond on an expired session (403)', async () => {
    h.db.exam_sessions[0].expires_at = new Date(Date.now() - 86_400_000).toISOString();
    const res = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: { id: 'PA.I.A' }, history: [{ role: 'examiner', text: 'q' }], studentAnswer: 'a', stream: false,
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('session_expired');
  });

  it('rejects respond when sessionId is missing (400)', async () => {
    const res = await examPost(req({
      action: 'respond', sessionConfig: SESSION_CONFIG,
      taskData: { id: 'PA.I.A' }, history: [], studentAnswer: 'a', stream: false,
    }));
    expect(res.status).toBe(400);
  });

  it('FREE tier is hard-capped at the exchange limit regardless of flags (429)', async () => {
    h.tier = 'checkride_prep';            // free
    h.db.exam_sessions[0].exchange_count = 30; // cap for free
    const res = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: { id: 'PA.I.A' }, history: [], studentAnswer: 'a', stream: false,
    }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('quota_exceeded');
  });

  it('PAID tier at the exchange cap is log-only until the flag is set', async () => {
    h.tier = 'dpe_live';
    h.db.exam_sessions[0].exchange_count = 50; // cap for paid
    // flag OFF: log-only → not 429 (proceeds into the exam loop)
    const off = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: { id: 'PA.I.A' }, history: [], studentAnswer: 'a', stream: false,
    }));
    expect(off.status).not.toBe(429);
    expect(h.events.some((e) => e.name === 'exam_exchange_cap_logonly')).toBe(true);
    await flushAfters();

    // flag ON: hard 429
    h.reset();
    h.tier = 'dpe_live';
    h.config = { 'quota.exchange_hard_enforce': { enabled: true } };
    h.db.exam_sessions[0].exchange_count = 50;
    const on = await examPost(req({
      action: 'respond', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG,
      taskData: { id: 'PA.I.A' }, history: [], studentAnswer: 'a', stream: false,
    }));
    expect(on.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// W5.4 Scenario Engine — flag-gated transition policy through the full route
// ---------------------------------------------------------------------------
import { buildExamPlan } from '@/lib/exam-plan';
import { generateExaminerTurn as mockedTurn } from '@/lib/exam-engine';

function seedScenarioSession() {
  const queue = ['PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.K2'];
  const plan = buildExamPlan(queue, 'cross_acs', queue.length);
  // current element answered satisfactorily; transition due
  plan.coverage['PA.I.A.K1'] = 'asked_satisfactory' as never;
  const scenario = {
    spine: {
      scenario: { aircraft: 'C172S N735KT', mission: 'KCRG-KOCF', conditions: 'July, buildups west', pilot: 'You', constraints: ['back by 6'] },
      hooks: [{ element_code: 'PA.II.A.K1', hook: 'the buildups west of the route' }],
      events: [],
    },
    usedHooks: [],
    firedEvents: [],
    source: 'generated',
  };
  h.db.exam_sessions[0].metadata = {
    plannerState: { version: 1, queue, cursor: 1, recent: ['PA.I.A.K1'], attempts: { 'PA.I.A.K1': 1 } },
    sessionConfig: SESSION_CONFIG,
    examPlan: plan,
    scenario,
    scenarioAdjacency: {
      'PA.I.A.K1': [
        { code: 'PA.II.A.K1', score: 0.9 },
        { code: 'PA.I.A.K2', score: 0.6 },
      ],
    },
    scenarioDescriptions: {
      'PA.I.A.K2': 'Currency requirements',
      'PA.II.A.K1': 'Weather information',
      'PA.II.A.K2': 'Weather products',
    },
    scenarioWeakElements: [],
  };
}

describe('scenario engine transitions (W5.4)', () => {
  beforeEach(() => {
    h.reset();
    h.pendingAfters.length = 0;
    h.events.length = 0;
    h.tier = 'dpe_live';
    h.config = { 'exam.scenario_engine': { mode: 'on' } };
  });

  it('falls back to top-ranked when the examiner omits the tag, burns the hook, and advances the planner', async () => {
    seedScenarioSession();
    const res = await examPost(req({ action: 'next-task', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG, stream: false }));
    const data = await res.json();
    await flushAfters();

    // Top-ranked = PA.II.A.K1 (adjacency 0.9 + unused hook bonus)
    expect(data.elementCode).toBe('PA.II.A.K1');
    expect(data.taskData.id).toBe('PA.II.A');
    // Tag-less mock reply is delivered verbatim as the bridge text
    expect(data.examinerMessage).toContain('Good.');
    // Planner advanced server-side to the chosen element
    const meta = h.db.exam_sessions[0].metadata as Record<string, never>;
    expect((meta.plannerState as { recent: string[] }).recent.slice(-1)[0]).toBe('PA.II.A.K1');
    // Hook burned exactly once
    expect((meta.scenario as { usedHooks: string[] }).usedHooks).toEqual(['PA.II.A.K1']);
    // Plan recorded the question
    expect((meta.examPlan as { asked_count: number }).asked_count).toBeGreaterThanOrEqual(1);
    // Transition telemetry emitted with followed_llm=false
    const t = h.events.find((e) => e.name === 'scenario_transition');
    expect(t?.props.followed_llm).toBe(false);
    expect(t?.props.top_ranked).toBe('PA.II.A.K1');
    // Examiner transcript persisted with the clean text
    expect(h.db.session_transcripts.some((r) => r.role === 'examiner' && String(r.text).includes('Good.'))).toBe(true);
  });

  it('follows a VALID emitted <next_element> tag and strips it from the reply', async () => {
    seedScenarioSession();
    vi.mocked(mockedTurn).mockResolvedValueOnce({
      examinerMessage: '<next_element>PA.I.A.K2</next_element>\nSpeaking of staying legal — how current are you tonight?',
      usage: { input_tokens: 10, output_tokens: 10, latency_ms: 5 },
    });
    const res = await examPost(req({ action: 'next-task', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG, stream: false }));
    const data = await res.json();
    await flushAfters();

    expect(data.elementCode).toBe('PA.I.A.K2');
    expect(data.examinerMessage).not.toContain('<next_element>');
    expect(data.examinerMessage).toContain('Speaking of staying legal');
    const t = h.events.find((e) => e.name === 'scenario_transition');
    expect(t?.props.followed_llm).toBe(true);
  });

  it('rejects an out-of-shortlist tag and falls back to top-ranked', async () => {
    seedScenarioSession();
    vi.mocked(mockedTurn).mockResolvedValueOnce({
      examinerMessage: '<next_element>PA.IX.Z.K9</next_element>\nLet me take you somewhere illegal.',
      usage: { input_tokens: 10, output_tokens: 10, latency_ms: 5 },
    });
    const res = await examPost(req({ action: 'next-task', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG, stream: false }));
    const data = await res.json();
    await flushAfters();
    expect(data.elementCode).toBe('PA.II.A.K1'); // server says no
    const t = h.events.find((e) => e.name === 'scenario_transition');
    expect(t?.props.followed_llm).toBe(false);
  });

  it('FLAG OFF: identical metadata, no scenario branch — linear advance, no telemetry', async () => {
    seedScenarioSession();
    h.config = {}; // flag off
    const res = await examPost(req({ action: 'next-task', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG, stream: false }));
    const data = await res.json();
    await flushAfters();
    // Linear queue walk picks the next non-recent element (PA.I.A.K2 at cursor)
    expect(data.elementCode).toBe('PA.I.A.K2');
    expect(h.events.find((e) => e.name === 'scenario_transition')).toBeUndefined();
    // Scenario state untouched
    const meta = h.db.exam_sessions[0].metadata as Record<string, never>;
    expect((meta.scenario as { usedHooks: string[] }).usedHooks).toEqual([]);
  });

  it("start with flag ON + studyMode 'scenario' persists a spine via after() (template fallback offline)", async () => {
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: { ...SESSION_CONFIG, studyMode: 'scenario' }, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters(); // spine generation runs post-response
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    const scenario = meta.scenario as { source: string; spine: { scenario: { aircraft: string } } } | undefined;
    expect(scenario).toBeDefined();
    // No ANTHROPIC key in tests → the engine degrades to a template spine
    expect(scenario!.source).toBe('template');
    expect(scenario!.spine.scenario.aircraft.length).toBeGreaterThan(5);
    expect(meta.scenarioDescriptions).toBeDefined();
    expect(h.events.some((e) => e.name === 'scenario_spine_generated')).toBe(true);
  });
});

describe('mode × flag matrix — scenario is ONE option; every other mode is preserved', () => {
  beforeEach(() => {
    h.reset();
    h.pendingAfters.length = 0;
    h.events.length = 0;
    h.tier = 'dpe_live';
  });

  function expectedArm(userId: string): 'scenario' | 'linear' {
    let hh = 2166136261;
    for (let i = 0; i < userId.length; i++) { hh ^= userId.charCodeAt(i); hh = Math.imul(hh, 16777619); }
    return (hh >>> 0) % 2 === 0 ? 'scenario' : 'linear';
  }
  const CROSS_CONFIG = { ...SESSION_CONFIG, studyMode: 'cross_acs' };
  const SCENARIO_CONFIG = { ...SESSION_CONFIG, studyMode: 'scenario' };

  it("flag 'on' + LINEAR mode: exact ACS order, no spine, no arm, no event", async () => {
    h.config = { 'exam.scenario_engine': { mode: 'on' } };
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters();
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    // Linear queue = exact ACS document order of the oral-eligible elements
    expect((meta.plannerState as { queue: string[] }).queue).toEqual([
      'PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.K2',
    ]);
    expect(meta.scenario).toBeUndefined();
    expect(meta.scenarioArm).toBeUndefined();
    expect(h.events.find((e) => e.name === 'exam_arm_assigned')).toBeUndefined();
    expect(h.events.find((e) => e.name === 'scenario_spine_generated')).toBeUndefined();
  });

  it("flag 'on' + WEAK_AREAS mode: no spine, same element set", async () => {
    h.config = { 'exam.scenario_engine': { mode: 'on' } };
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: { ...SESSION_CONFIG, studyMode: 'weak_areas' }, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters();
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    expect(meta.scenario).toBeUndefined();
    expect([...(meta.plannerState as { queue: string[] }).queue].sort()).toEqual([
      'PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.K2',
    ]);
  });

  it("flag 'on' + SCENARIO mode: spine persisted; same element SET as linear", async () => {
    h.config = { 'exam.scenario_engine': { mode: 'on' } };
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SCENARIO_CONFIG, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters();
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    expect(meta.scenario).toBeDefined();
    // The non-linear mode reorders but NEVER changes the set
    expect([...(meta.plannerState as { queue: string[] }).queue].sort()).toEqual([
      'PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.K2',
    ]);
    // Explicit choice under 'on' is not an experiment — no arm event
    expect(h.events.find((e) => e.name === 'exam_arm_assigned')).toBeUndefined();
  });

  it("flag 'ab' + CROSS_ACS: sticky arm assigned + persisted; spine only for the scenario arm", async () => {
    h.config = { 'exam.scenario_engine': { mode: 'ab' } };
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: CROSS_CONFIG, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters();
    const arm = expectedArm('user-1');
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    expect(meta.scenarioArm).toBe(arm);
    const ev = h.events.find((e) => e.name === 'exam_arm_assigned');
    expect(ev?.props.arm).toBe(arm);
    expect(ev?.props.mode).toBe('ab');
    expect(!!meta.scenario).toBe(arm === 'scenario');
  });

  it("flag 'ab' + LINEAR mode is NEVER in the experiment: no arm, no event, no spine", async () => {
    h.config = { 'exam.scenario_engine': { mode: 'ab' } };
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SESSION_CONFIG, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters();
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    expect(meta.scenarioArm).toBeUndefined();
    expect(meta.scenario).toBeUndefined();
    expect(h.events.find((e) => e.name === 'exam_arm_assigned')).toBeUndefined();
    expect((meta.plannerState as { queue: string[] }).queue).toEqual([
      'PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.K2',
    ]);
  });

  it("flag 'off' + a stray SCENARIO request degrades gracefully (no spine, walk-style queue, exam starts)", async () => {
    h.config = {};
    h.db.exam_sessions[0].metadata = {};
    const res = await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: SCENARIO_CONFIG, stream: false }));
    expect(res.status).toBe(200);
    await flushAfters();
    const meta = h.db.exam_sessions[0].metadata as Record<string, unknown>;
    expect(meta.scenario).toBeUndefined();
    expect([...(meta.plannerState as { queue: string[] }).queue].sort()).toEqual([
      'PA.I.A.K1', 'PA.I.A.K2', 'PA.II.A.K1', 'PA.II.A.K2',
    ]);
  });

  it('DIFFICULTY is enforced in scenario mode exactly as in linear: easy filters the set', async () => {
    // Make two elements easy; the rest stay medium
    for (const el of h.db.acs_elements) {
      el.difficulty_default = (el.code === 'PA.I.A.K1' || el.code === 'PA.II.A.K1') ? 'easy' : 'medium';
    }
    h.config = { 'exam.scenario_engine': { mode: 'on' } };

    // Scenario mode, easy
    h.db.exam_sessions[0].metadata = {};
    await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: { ...SCENARIO_CONFIG, difficulty: 'easy' }, stream: false }));
    await flushAfters();
    const scenarioQueue = ((h.db.exam_sessions[0].metadata as Record<string, unknown>).plannerState as { queue: string[] }).queue;
    expect([...scenarioQueue].sort()).toEqual(['PA.I.A.K1', 'PA.II.A.K1']);

    // Linear mode, easy — identical SET
    h.reset();
    for (const el of h.db.acs_elements) {
      el.difficulty_default = (el.code === 'PA.I.A.K1' || el.code === 'PA.II.A.K1') ? 'easy' : 'medium';
    }
    h.config = { 'exam.scenario_engine': { mode: 'on' } };
    h.db.exam_sessions[0].metadata = {};
    await examPost(req({ action: 'start', sessionId: 'sess-1', sessionConfig: { ...SESSION_CONFIG, difficulty: 'easy' }, stream: false }));
    await flushAfters();
    const linearQueue = ((h.db.exam_sessions[0].metadata as Record<string, unknown>).plannerState as { queue: string[] }).queue;
    expect(linearQueue).toEqual(['PA.I.A.K1', 'PA.II.A.K1']); // linear keeps ACS order too
  });
});
