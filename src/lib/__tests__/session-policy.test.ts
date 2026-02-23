import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----------------------------------------------------------------
// Hoisted mocks — declared before any module imports
// ----------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userFrom: vi.fn(),
  userRpc: vi.fn(),
  serviceFrom: vi.fn(),
  getUserTier: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.userFrom,
    rpc: mocks.userRpc,
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.serviceFrom,
  })),
}));

vi.mock('@/lib/voice/tier-lookup', () => ({
  getUserTier: mocks.getUserTier,
}));

vi.mock('@/lib/system-config', () => ({
  getSystemConfig: vi.fn(async () => ({
    'app.environment': { name: 'local' },
  })),
}));

vi.mock('@/lib/app-env', () => ({
  requireSafeDbTarget: vi.fn(),
}));


// Import route handler after mocks are in place
import { POST, GET } from '@/app/api/session/route';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const USER_ID = 'user-abc-123';

/**
 * Supabase-like fluent query builder mock.
 * All chain methods return the builder; awaiting resolves to { data, error, count }.
 */
function q(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count !== undefined ? result.count : null,
  };
  const builder: Record<string, any> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'is', 'insert', 'update', 'order', 'limit', 'single']) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.then = (resolve: (v: any) => any, reject?: (e: any) => any) =>
    Promise.resolve(resolved).then(resolve, reject);
  return builder;
}

function postReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}

function getReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/session');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: 'GET' }) as any;
}

// ----------------------------------------------------------------
// Setup
// ----------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mocks.getUserTier.mockResolvedValue('checkride_prep'); // free tier default
});

// ================================================================
// Auth guard
// ================================================================
describe('auth guard', () => {
  it('returns 401 when not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(401);
  });
});

// ================================================================
// Create — is_onboarding server-side validation
// ================================================================
describe('create — is_onboarding validation', () => {
  it('allows onboarding when profile not completed and no prior onboarding exams', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ data: { onboarding_completed: false } }))
      .mockReturnValueOnce(q({ count: 0 }));
    const insertQ = q({ data: { id: 's1' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    const res = await POST(postReq({ action: 'create', is_onboarding: true }));
    expect(res.status).toBe(200);
    expect(insertQ.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_onboarding: true,
      expires_at: null,
    }));
  });

  it('rejects onboarding when profile already completed', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ data: { onboarding_completed: true } }))
      .mockReturnValueOnce(q({ count: 0 }));
    const trialQ = q({ count: 0 });
    const insertQ = q({ data: { id: 's2' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(insertQ);

    const res = await POST(postReq({ action: 'create', is_onboarding: true }));
    expect(res.status).toBe(200);
    expect(insertQ.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_onboarding: false,
    }));
  });

  it('rejects onboarding when user already has an onboarding exam', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ data: { onboarding_completed: false } }))
      .mockReturnValueOnce(q({ count: 1 }));
    const trialQ = q({ count: 0 });
    const insertQ = q({ data: { id: 's3' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(insertQ);

    const res = await POST(postReq({ action: 'create', is_onboarding: true }));
    expect(res.status).toBe(200);
    expect(insertQ.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_onboarding: false,
    }));
  });

  it('never sets onboarding when client does not request it', async () => {
    const trialQ = q({ count: 0 });
    const insertQ = q({ data: { id: 's4' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create' }));
    expect(insertQ.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_onboarding: false,
    }));
  });
});

// ================================================================
// Create — trial limit enforcement
// ================================================================
describe('create — trial limits', () => {
  it('blocks free user at trial limit (3 exams)', async () => {
    mocks.serviceFrom.mockReturnValueOnce(q({ count: 3 }));

    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('trial_limit_reached');
    expect(body.limit).toBe(3);
  });

  it('allows free user under limit', async () => {
    const trialQ = q({ count: 2 });
    const insertQ = q({ data: { id: 's5' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(insertQ);

    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
  });

  it('skips trial check for paying user', async () => {
    mocks.getUserTier.mockResolvedValue('dpe_live');
    const insertQ = q({ data: { id: 's6' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
    expect(mocks.serviceFrom).toHaveBeenCalledTimes(1); // only insert
  });

  it('skips trial check for onboarding exams', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ data: { onboarding_completed: false } }))
      .mockReturnValueOnce(q({ count: 0 }));
    const insertQ = q({ data: { id: 's7' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create', is_onboarding: true }));
    expect(mocks.serviceFrom).toHaveBeenCalledTimes(3); // profile + onboarding count + insert
  });
});

// ================================================================
// Create — expires_at assignment
// ================================================================
describe('create — expires_at', () => {
  it('sets 7-day expiry for free non-onboarding exams', async () => {
    const trialQ = q({ count: 0 });
    const insertQ = q({ data: { id: 's8' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create' }));
    const arg = insertQ.insert.mock.calls[0][0];
    expect(arg.expires_at).toBeTruthy();
    const expires = new Date(arg.expires_at).getTime();
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expires - expected)).toBeLessThan(5000);
  });

  it('does not set expiry for paying users', async () => {
    mocks.getUserTier.mockResolvedValue('dpe_live');
    const insertQ = q({ data: { id: 's9' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create' }));
    expect(insertQ.insert.mock.calls[0][0].expires_at).toBeNull();
  });

  it('does not set expiry for onboarding exams', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ data: { onboarding_completed: false } }))
      .mockReturnValueOnce(q({ count: 0 }));
    const insertQ = q({ data: { id: 's10' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create', is_onboarding: true }));
    expect(insertQ.insert.mock.calls[0][0].expires_at).toBeNull();
  });
});

// ================================================================
// Create — default and passthrough values
// ================================================================
describe('create — field defaults', () => {
  it('uses sensible defaults for unspecified fields', async () => {
    mocks.getUserTier.mockResolvedValue('dpe_live');
    const insertQ = q({ data: { id: 's11' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create' }));
    const arg = insertQ.insert.mock.calls[0][0];
    expect(arg.rating).toBe('private');
    expect(arg.status).toBe('active');
    expect(arg.study_mode).toBe('cross_acs');
    expect(arg.difficulty_preference).toBe('mixed');
    expect(arg.selected_areas).toEqual([]);
    expect(arg.aircraft_class).toBe('ASEL');
    expect(arg.selected_tasks).toEqual([]);
  });

  it('passes through client-provided configuration', async () => {
    mocks.getUserTier.mockResolvedValue('dpe_live');
    const insertQ = q({ data: { id: 's12' } });
    mocks.serviceFrom.mockReturnValueOnce(insertQ);

    await POST(postReq({
      action: 'create',
      rating: 'instrument',
      study_mode: 'weak_areas',
      difficulty_preference: 'hard',
      selected_areas: ['I', 'III'],
      aircraft_class: 'AMEL',
      selected_tasks: ['IR.I.A'],
    }));

    const arg = insertQ.insert.mock.calls[0][0];
    expect(arg.rating).toBe('instrument');
    expect(arg.study_mode).toBe('weak_areas');
    expect(arg.difficulty_preference).toBe('hard');
    expect(arg.selected_areas).toEqual(['I', 'III']);
    expect(arg.aircraft_class).toBe('AMEL');
    expect(arg.selected_tasks).toEqual(['IR.I.A']);
  });
});

// ================================================================
// Create — error handling
// ================================================================
describe('create — error handling', () => {
  it('returns 500 when insert fails', async () => {
    mocks.getUserTier.mockResolvedValue('dpe_live');
    mocks.serviceFrom.mockReturnValueOnce(q({ error: { message: 'unique violation' } }));

    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(500);
  });
});

// ================================================================
// Update — grading on completion
// ================================================================
describe('update — grading', () => {
  it('computes and stores grade when status=completed', async () => {
    const attemptsQ = q({
      data: [
        { element_code: 'PA.I.A.K1', score: 'satisfactory' },
        { element_code: 'PA.I.A.K2', score: 'satisfactory' },
        { element_code: 'PA.I.A.R1', score: 'partial' },
      ],
    });
    const metaQ = q({
      data: { metadata: { plannerState: { queue: ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.A.R1'] } } },
    });
    const updateQ = q({ data: null });
    mocks.userFrom
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-1', status: 'completed' }));
    expect(res.status).toBe(200);
    const upd = updateQ.update.mock.calls[0][0];
    expect(upd.status).toBe('completed');
    expect(upd.ended_at).toBeTruthy();
    expect(upd.result.grade).toBe('satisfactory');
    expect(upd.result.score_percentage).toBe(0.9); // 2*1.0 + 1*0.7 = 2.7/3
    expect(upd.result.elements_satisfactory).toBe(2);
    expect(upd.result.elements_partial).toBe(1);
    expect(upd.result.completion_trigger).toBe('user_ended');

    // API response includes computed result
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.grade).toBe('satisfactory');
    expect(body.result.score_percentage).toBe(0.9);
  });

  it('grades as unsatisfactory when score < 70%', async () => {
    const attemptsQ = q({
      data: [
        { element_code: 'PA.I.A.K1', score: 'satisfactory' },
        { element_code: 'PA.I.A.K2', score: 'unsatisfactory' },
        { element_code: 'PA.I.A.R1', score: 'unsatisfactory' },
      ],
    });
    const metaQ = q({
      data: { metadata: { plannerState: { queue: ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.A.R1'] } } },
    });
    const updateQ = q({ data: null });
    mocks.userFrom
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-5', status: 'completed' }));
    const upd = updateQ.update.mock.calls[0][0];
    expect(upd.result.grade).toBe('unsatisfactory');
    expect(upd.result.score_percentage).toBeCloseTo(0.33, 2);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.grade).toBe('unsatisfactory');
  });

  it('grades user_ended against elements asked (satisfactory with partial coverage)', async () => {
    const attemptsQ = q({
      data: [{ element_code: 'PA.I.A.K1', score: 'satisfactory' }],
    });
    const metaQ = q({
      data: { metadata: { plannerState: { queue: ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.A.R1'] } } },
    });
    const updateQ = q({ data: null });
    mocks.userFrom
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-4', status: 'completed' }));
    const upd = updateQ.update.mock.calls[0][0];
    expect(upd.result.grade).toBe('satisfactory'); // 1/1 asked = 100% >= 70%
    expect(upd.result.elements_asked).toBe(1);
    expect(upd.result.elements_not_asked).toBe(2);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.grade).toBe('satisfactory');
  });

  it('skips grading when attempts query returns null', async () => {
    const attemptsQ = q({ data: null });
    const metaQ = q({
      data: { metadata: { plannerState: { queue: ['PA.I.A.K1'] } } },
    });
    const updateQ = q({ data: null });
    mocks.userFrom
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-2', status: 'completed' }));
    const upd = updateQ.update.mock.calls[0][0];
    expect(upd.ended_at).toBeTruthy();
    expect(upd.result).toBeUndefined();

    // API response returns null result when grading skipped
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeNull();
  });

  it('skips grading when planner state is missing', async () => {
    const attemptsQ = q({
      data: [{ element_code: 'PA.I.A.K1', score: 'satisfactory' }],
    });
    const metaQ = q({ data: { metadata: {} } });
    const updateQ = q({ data: null });
    mocks.userFrom
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-3', status: 'completed' }));
    const upd = updateQ.update.mock.calls[0][0];
    expect(upd.result).toBeUndefined();

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeNull();
  });

  it('returns result: null for non-completion updates', async () => {
    const updateQ = q({ data: null });
    mocks.userFrom.mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-6', status: 'paused' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeNull();
  });
});

// ================================================================
// Update — validation
// ================================================================
describe('update — validation', () => {
  it('returns 400 when sessionId is missing', async () => {
    const res = await POST(postReq({ action: 'update' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('sessionId required');
  });
});

// ================================================================
// Invalid action
// ================================================================
describe('invalid action', () => {
  it('returns 400', async () => {
    const res = await POST(postReq({ action: 'nonexistent' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid action');
  });
});

// ================================================================
// GET — get-all-resumable
// ================================================================
describe('GET — get-all-resumable', () => {
  it('returns 401 when not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(getReq({ action: 'get-all-resumable' }));
    expect(res.status).toBe(401);
  });

  it('returns all active/paused sessions', async () => {
    const sessions = [
      { id: 's1', rating: 'private', status: 'active', started_at: '2026-02-19T10:00:00Z' },
      { id: 's2', rating: 'instrument', status: 'paused', started_at: '2026-02-18T10:00:00Z' },
    ];
    mocks.userFrom.mockReturnValueOnce(q({ data: sessions }));

    const res = await GET(getReq({ action: 'get-all-resumable' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].id).toBe('s1');
    expect(body.sessions[1].id).toBe('s2');
  });

  it('returns empty array when no open exams', async () => {
    mocks.userFrom.mockReturnValueOnce(q({ data: [] }));

    const res = await GET(getReq({ action: 'get-all-resumable' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });
});
