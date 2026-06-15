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

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: vi.fn(), // no-op — don't execute callback in test env
  };
});

vi.mock('@/lib/posthog-server', () => ({
  captureServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
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
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'is', 'insert', 'update', 'order', 'limit', 'single', 'maybeSingle']) {
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
    const profileQ = q({ data: { created_at: new Date().toISOString(), stripe_customer_id: null } });
    const insertQ = q({ data: { id: 's2' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(profileQ)
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
    const profileQ = q({ data: { created_at: new Date().toISOString(), stripe_customer_id: null } });
    const insertQ = q({ data: { id: 's3' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(profileQ)
      .mockReturnValueOnce(insertQ);

    const res = await POST(postReq({ action: 'create', is_onboarding: true }));
    expect(res.status).toBe(200);
    expect(insertQ.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_onboarding: false,
    }));
  });

  it('never sets onboarding when client does not request it', async () => {
    const trialQ = q({ count: 0 });
    const profileQ = q({ data: { created_at: new Date().toISOString(), stripe_customer_id: null } });
    const insertQ = q({ data: { id: 's4' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(profileQ)
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

  it('allows free user under the cap and inside the 7-day window', async () => {
    const trialQ = q({ count: 2 });
    const profileQ = q({ data: { created_at: new Date().toISOString(), stripe_customer_id: null } });
    const insertQ = q({ data: { id: 's5' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(profileQ)
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
// Create — 7-day trial window + one-trial-per-account
// ================================================================
describe('create — trial window + resubscribe', () => {
  const recent = () => new Date().toISOString();
  const longAgo = () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  // A brand-new / never-subscribed account: subscription_status DEFAULTS to
  // 'active' in the DB (migration 20260214000008), and there is NO live
  // subscription id. This shape must NEVER be treated as churned/paid.
  const neverSubscribed = (created_at: string | null) => ({
    created_at,
    subscription_status: 'active',
    stripe_subscription_id: null,
    has_trialed: false,
  });

  it('blocks a free user past the 7-day window → trial_expired', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 1 })) // under the 3-exam cap
      .mockReturnValueOnce(q({ data: neverSubscribed(longAgo()) }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('trial_expired');
  });

  it('blocks a churned (canceled) user → resubscribe_required', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 0 }))
      .mockReturnValueOnce(q({ data: { created_at: recent(), subscription_status: 'canceled', stripe_subscription_id: null, has_trialed: false } }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('resubscribe_required');
  });

  it('blocks a legacy Stripe-trial cohort (has_trialed) → resubscribe_required', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 0 }))
      .mockReturnValueOnce(q({ data: { created_at: recent(), subscription_status: 'active', stripe_subscription_id: null, has_trialed: true } }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('resubscribe_required');
  });

  it('resubscribe_required wins over the window when a churned user is also past 7 days', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 0 }))
      .mockReturnValueOnce(q({ data: { created_at: longAgo(), subscription_status: 'canceled', stripe_subscription_id: null, has_trialed: false } }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('resubscribe_required');
  });

  // REGRESSION (critical): a Stripe customer id is written at checkout INITIATION
  // before payment, so a trial user who clicks Upgrade and ABANDONS Stripe checkout
  // must NOT be locked out. The gate keys on real subscription signals, not on the
  // bare customer id — so the default-'active'/no-sub-id shape is allowed.
  it('does NOT lock out an abandoned-checkout user (no live sub, default active)', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 2 })) // used 2 of 3, still under cap
      .mockReturnValueOnce(q({ data: neverSubscribed(recent()) }))
      .mockReturnValueOnce(q({ data: { id: 'sw-abandon' } }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
  });

  // REGRESSION (high): a freshly-upgraded user whose tier cache is stale
  // (getUserTier still says checkride_prep) is rescued by the read-through live
  // subscription check — even past the window — and is not blocked.
  it('a live stripe_subscription_id bypasses the window despite a stale tier cache', async () => {
    mocks.getUserTier.mockResolvedValue('checkride_prep'); // stale: real tier is dpe_live
    const insertQ = q({ data: { id: 'sw-live' } });
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 1 }))
      .mockReturnValueOnce(q({ data: { created_at: longAgo(), subscription_status: 'active', stripe_subscription_id: 'sub_live_123', has_trialed: false } }))
      .mockReturnValueOnce(insertQ);
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
    // treated as paying → no trial-window stamp
    expect((insertQ.insert.mock.calls[0][0] as { expires_at: string | null }).expires_at).toBeNull();
  });

  it('the 3-exam cap is checked first (count wins, no profile fetch)', async () => {
    mocks.serviceFrom.mockReturnValueOnce(q({ count: 3 }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('trial_limit_reached');
    expect(mocks.serviceFrom).toHaveBeenCalledTimes(1);
  });

  it('allows a free user inside the window with no prior subscription', async () => {
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 1 }))
      .mockReturnValueOnce(q({ data: neverSubscribed(recent()) }))
      .mockReturnValueOnce(q({ data: { id: 'sw1' } }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
  });

  // Boundary: the window uses a strict `>` so a user at exactly the edge is still in.
  it('allows just INSIDE the 7-day window and blocks just OUTSIDE it', async () => {
    const justInside = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000) + 60_000).toISOString();
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 0 }))
      .mockReturnValueOnce(q({ data: neverSubscribed(justInside) }))
      .mockReturnValueOnce(q({ data: { id: 'sw-edge-in' } }));
    expect((await POST(postReq({ action: 'create' }))).status).toBe(200);

    const justOutside = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000) - 60_000).toISOString();
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 0 }))
      .mockReturnValueOnce(q({ data: neverSubscribed(justOutside) }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('trial_expired');
  });

  it('fails OPEN on missing created_at (count cap still applies)', async () => {
    const insertQ = q({ data: { id: 'sw2' } });
    mocks.serviceFrom
      .mockReturnValueOnce(q({ count: 1 }))
      .mockReturnValueOnce(q({ data: neverSubscribed(null) }))
      .mockReturnValueOnce(insertQ);
    const before = Date.now();
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
    // The fail-open path must still stamp a REAL forward window (now + 7d), not
    // null (no mid-exam cap) and not a 1970 epoch (instant expiry from null→0).
    const arg = insertQ.insert.mock.calls[0][0] as { expires_at: string | null };
    expect(arg.expires_at).toBeTruthy();
    const stampedMs = new Date(arg.expires_at as string).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(stampedMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 5_000);
    expect(stampedMs).toBeLessThanOrEqual(Date.now() + sevenDaysMs + 5_000);
  });

  it('paid / tester-override users bypass BOTH the cap and the window', async () => {
    mocks.getUserTier.mockResolvedValue('dpe_live');
    mocks.serviceFrom.mockReturnValueOnce(q({ data: { id: 'sw3' } }));
    const res = await POST(postReq({ action: 'create' }));
    expect(res.status).toBe(200);
    expect(mocks.serviceFrom).toHaveBeenCalledTimes(1); // insert only
  });
});

// ================================================================
// Create — expires_at assignment
// ================================================================
describe('create — expires_at', () => {
  it('sets 7-day-from-signup expiry for free non-onboarding exams', async () => {
    const signup = new Date();
    const trialQ = q({ count: 0 });
    const profileQ = q({ data: { created_at: signup.toISOString(), stripe_customer_id: null } });
    const insertQ = q({ data: { id: 's8' } });
    mocks.serviceFrom
      .mockReturnValueOnce(trialQ)
      .mockReturnValueOnce(profileQ)
      .mockReturnValueOnce(insertQ);

    await POST(postReq({ action: 'create' }));
    const arg = insertQ.insert.mock.calls[0][0];
    expect(arg.expires_at).toBeTruthy();
    const expires = new Date(arg.expires_at).getTime();
    const expected = signup.getTime() + 7 * 24 * 60 * 60 * 1000; // window = signup + 7d
    expect(Math.abs(expires - expected)).toBeLessThan(2 * 60 * 60 * 1000);
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
    // W2.3: grading first checks the latest student transcript's assessment
    mocks.userFrom
      .mockReturnValueOnce(q({ data: { assessment: { score: 'satisfactory' } } }))
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
    // W2.3: grading first checks the latest student transcript's assessment
    mocks.userFrom
      .mockReturnValueOnce(q({ data: { assessment: { score: 'satisfactory' } } }))
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

  it('grades against elements asked when user ends exam early', async () => {
    const attemptsQ = q({
      data: [{ element_code: 'PA.I.A.K1', score: 'satisfactory' }],
    });
    const metaQ = q({
      data: { metadata: { plannerState: { queue: ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.A.R1'] } } },
    });
    const updateQ = q({ data: null });
    // W2.3: grading first checks the latest student transcript's assessment
    mocks.userFrom
      .mockReturnValueOnce(q({ data: { assessment: { score: 'satisfactory' } } }))
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-4', status: 'completed' }));
    const upd = updateQ.update.mock.calls[0][0];
    // User-ended exams grade against what was asked, not the full set
    expect(upd.result.grade).toBe('satisfactory');
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
    // W2.3: grading first checks the latest student transcript's assessment
    mocks.userFrom
      .mockReturnValueOnce(q({ data: { assessment: { score: 'satisfactory' } } }))
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

  it('grades using attempt count as fallback when planner state is missing', async () => {
    const attemptsQ = q({
      data: [{ element_code: 'PA.I.A.K1', score: 'satisfactory' }],
    });
    const metaQ = q({ data: { metadata: {} } });
    const updateQ = q({ data: null });
    // W2.3: grading first checks the latest student transcript's assessment
    mocks.userFrom
      .mockReturnValueOnce(q({ data: { assessment: { score: 'satisfactory' } } }))
      .mockReturnValueOnce(attemptsQ)
      .mockReturnValueOnce(metaQ)
      .mockReturnValueOnce(updateQ);

    const res = await POST(postReq({ action: 'update', sessionId: 'sess-3', status: 'completed' }));
    const upd = updateQ.update.mock.calls[0][0];
    // Falls back to attempts.length as totalElements
    expect(upd.result).toBeDefined();
    expect(upd.result.grade).toBe('satisfactory');
    expect(upd.result.elements_asked).toBe(1);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.grade).toBe('satisfactory');
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

  it('W2.4: MERGES acs_tasks_covered with the stored set — never shrinks it', async () => {
    // Stored session already covered two tasks; a resumed client reports only one
    const existingQ = q({
      data: {
        acs_tasks_covered: [
          { task_id: 'PA.I.A', status: 'satisfactory', attempts: 2 },
          { task_id: 'PA.II.B', status: 'partial', attempts: 1 },
        ],
      },
    });
    const updateQ = q({ data: null });
    mocks.userFrom.mockReturnValueOnce(existingQ).mockReturnValueOnce(updateQ);

    const res = await POST(postReq({
      action: 'update',
      sessionId: 'sess-7',
      acs_tasks_covered: [
        { task_id: 'PA.II.B', status: 'satisfactory', attempts: 2 }, // upgraded
        { task_id: 'PA.III.A', status: 'partial', attempts: 1 },     // new
      ],
    }));
    expect(res.status).toBe(200);
    const upd = updateQ.update.mock.calls[0][0];
    const covered = upd.acs_tasks_covered as Array<{ task_id: string; status: string }>;
    const byTask = Object.fromEntries(covered.map((c) => [c.task_id, c.status]));
    expect(Object.keys(byTask).sort()).toEqual(['PA.I.A', 'PA.II.B', 'PA.III.A']);
    expect(byTask['PA.I.A']).toBe('satisfactory');   // preserved from store
    expect(byTask['PA.II.B']).toBe('satisfactory');  // incoming wins
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

  it('W3.2: rejects client-set status=abandoned (server-only)', async () => {
    const res = await POST(postReq({ action: 'update', sessionId: 's1', status: 'abandoned' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('use_discard_action');
  });
});

// ================================================================
// Discard — server-controlled abandonment (W3.2)
// ================================================================
describe('discard', () => {
  it('marks the session abandoned via the dedicated action', async () => {
    const updateQ = q({ data: null });
    mocks.userFrom.mockReturnValueOnce(updateQ);
    const res = await POST(postReq({ action: 'discard', sessionId: 's1' }));
    expect(res.status).toBe(200);
    const upd = updateQ.update.mock.calls[0][0];
    expect(upd.status).toBe('abandoned');
    expect(upd.ended_at).toBeTruthy();
  });

  it('returns 400 without sessionId', async () => {
    const res = await POST(postReq({ action: 'discard' }));
    expect(res.status).toBe(400);
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
