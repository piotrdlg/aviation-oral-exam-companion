import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Test: Exam Route Session Ownership (IDOR Prevention — W1.3)
 *
 * Actually invokes the POST handler (heavy collaborators mocked) and asserts:
 * - cross-user sessionId → 404 before ANY service-role access
 * - own sessionId → passes the ownership gate (response is not 404)
 */

// ---- Shared mock state (hoisted so vi.mock factories can reference it) ----
const h = vi.hoisted(() => {
  const userA = { id: 'user-a-uuid', email: 'alice@example.com' };

  // Permissive thenable chain: any method call returns the same chain,
  // awaiting it resolves to { data, error } — good enough for incidental
  // supabase calls on the owned-session path.
  function chain(result: unknown = { data: null, error: null }) {
    const target: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(target, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    });
    return proxy;
  }

  // Ownership-check query chain with spies; resolves per `ownershipResult`.
  const state = {
    ownershipResult: { data: null as unknown, error: null as unknown },
    selectSpy: vi.fn(),
    eqSpy: vi.fn(),
    serviceFromSpy: vi.fn(),
  };

  function ownershipChain() {
    const c: Record<string, unknown> = {};
    c.select = (...args: unknown[]) => { state.selectSpy(...args); return c; };
    c.eq = (...args: unknown[]) => { state.eqSpy(...args); return c; };
    c.single = () => Promise.resolve(state.ownershipResult);
    return c;
  }

  const rlsClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: userA } })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
    },
    from: vi.fn((table: string) => (table === 'exam_sessions' ? ownershipChain() : chain())),
    rpc: vi.fn(() => chain()),
  };

  const serviceClient = {
    from: (...args: unknown[]) => { state.serviceFromSpy(...args); return chain(); },
    rpc: vi.fn(() => chain()),
  };

  return { userA, state, rlsClient, serviceClient, chain };
});

// ---- Module mocks ----
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => {
  const orig = await importOriginal<typeof import('next/server')>();
  return { ...orig, after: vi.fn() };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => h.rlsClient),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => h.serviceClient),
}));
vi.mock('@/lib/exam-engine', () => ({
  pickStartingTask: vi.fn(),
  pickNextTask: vi.fn(),
  generateExaminerTurn: vi.fn(),
  generateExaminerTurnStreaming: vi.fn(),
  assessAnswer: vi.fn(),
  fetchRagContext: vi.fn(async () => ({ chunks: [], images: [] })),
  loadPromptFromDB: vi.fn(async () => null),
}));
vi.mock('@/lib/system-config', () => ({ getSystemConfig: vi.fn(async () => ({})) }));
vi.mock('@/lib/kill-switch', () => ({ checkKillSwitch: vi.fn(() => ({ blocked: false })) }));
vi.mock('@/lib/app-env', () => ({ requireSafeDbTarget: vi.fn() }));
vi.mock('@/lib/voice/tier-lookup', () => ({ getUserTier: vi.fn(async () => 'checkride_prep') }));
vi.mock('@/lib/session-enforcement', () => ({
  enforceOneActiveExam: vi.fn(async () => ({ rejected: false })),
  getSessionTokenHash: vi.fn(async () => 'hash'),
}));
vi.mock('@/lib/timing', () => {
  const permissive = new Proxy({}, { get: () => vi.fn(() => ({})) });
  return { createTimingContext: vi.fn(() => permissive), writeTimings: vi.fn() };
});
vi.mock('@/lib/posthog-server', () => ({
  flushPostHog: vi.fn(),
  capturePostHogEvent: vi.fn(),
  captureServerEvent: vi.fn(),
}));

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/exam', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/exam POST — Session Ownership Verification (W1.3)', () => {
  beforeEach(() => {
    h.state.selectSpy.mockClear();
    h.state.eqSpy.mockClear();
    h.state.serviceFromSpy.mockClear();
  });

  it("returns 404 for another user's sessionId, before any service-role access", async () => {
    h.state.ownershipResult = { data: null, error: { code: 'PGRST116' } };
    const { POST } = await import('../route');

    const res = await POST(makeRequest({
      action: 'respond',
      sessionId: 'session-of-user-b',
      history: [],
      studentAnswer: 'answer',
    }));

    expect(res.status).toBe(404);
    // Ownership query used both filters
    expect(h.state.eqSpy).toHaveBeenCalledWith('id', 'session-of-user-b');
    expect(h.state.eqSpy).toHaveBeenCalledWith('user_id', h.userA.id);
    // No service-role table access happened after the gate
    expect(h.state.serviceFromSpy.mock.calls.filter(
      (c) => !['user_profiles'].includes(String(c[0]))
    ).length).toBe(0);
  });

  it('passes the ownership gate for the caller-owned sessionId', async () => {
    h.state.ownershipResult = { data: { id: 'session-of-user-a' }, error: null };
    const { POST } = await import('../route');

    const res = await POST(makeRequest({
      action: 'respond',
      sessionId: 'session-of-user-a',
      history: [],
      studentAnswer: 'answer',
    }));

    // Downstream collaborators are mocked shallowly, so the handler may fail
    // later — the assertion is only that the ownership gate did NOT fire.
    expect(res.status).not.toBe(404);
    expect(h.state.eqSpy).toHaveBeenCalledWith('id', 'session-of-user-a');
    expect(h.state.eqSpy).toHaveBeenCalledWith('user_id', h.userA.id);
  });
});
