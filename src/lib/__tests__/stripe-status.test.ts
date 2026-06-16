import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ----------------------------------------------------------------
// Hoisted mocks (mirror stripe-checkout.test.ts)
// ----------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  serviceFrom: vi.fn(),
  subsList: vi.fn(),
  invalidateTierCache: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({ subscriptions: { list: mocks.subsList } })),
}));

vi.mock('@/lib/voice/tier-lookup', () => ({
  invalidateTierCache: mocks.invalidateTierCache,
}));

import { GET } from '@/app/api/stripe/status/route';

// GET now takes a request (Bearer-or-cookie dual-mode). No Authorization header →
// getAuthedUser falls through to the cookie path mocked above.
const req = () => new NextRequest('https://app.test/api/stripe/status');

// Fluent builder: select/eq/single/update → builder; await → {data}
function builder(result: { data?: unknown }) {
  const b: Record<string, any> = {};
  for (const m of ['select', 'eq', 'single', 'update']) b[m] = vi.fn().mockReturnValue(b);
  b.then = (resolve: (v: any) => any) =>
    Promise.resolve({ data: result.data ?? null, error: null }).then(resolve);
  return b;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('stripe status', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('surfaces cancel-grace fields for an active, cancel-at-period-end sub', async () => {
    const periodEnd = '2026-07-14T00:00:00.000Z';
    mocks.serviceFrom.mockReturnValueOnce(builder({
      data: {
        tier: 'dpe_live',
        subscription_status: 'active',
        stripe_customer_id: 'cus_1',
        cancel_at: periodEnd,
        cancel_at_period_end: true,
        current_period_end: periodEnd,
      },
    }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('dpe_live');
    expect(body.status).toBe('active');
    // the settings billing tile reads these to show "Cancels — full access until [date]"
    expect(body.cancelAtPeriodEnd).toBe(true);
    expect(body.currentPeriodEnd).toBe(periodEnd);
    // already-active → no Stripe round-trip
    expect(mocks.subsList).not.toHaveBeenCalled();
  });

  it('grants dpe_live + invalidates the tier cache when Stripe shows an active sub before the webhook', async () => {
    // profile not yet active locally → falls through to a direct Stripe check
    mocks.serviceFrom
      .mockReturnValueOnce(builder({ data: { tier: 'checkride_prep', subscription_status: 'free', stripe_customer_id: 'cus_1' } }))
      .mockReturnValueOnce(builder({ data: {} })); // the update().eq() write
    mocks.subsList.mockResolvedValue({
      data: [{
        id: 'sub_1',
        status: 'active',
        items: { data: [{ price: { id: 'price_m' }, current_period_start: 1, current_period_end: 2 }] },
      }],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('dpe_live');
    // critical: drop the stale free tier so the trial gate can't block a just-paid user
    expect(mocks.invalidateTierCache).toHaveBeenCalledWith('u1');
  });

  it('returns the free tier when there is no subscription', async () => {
    mocks.serviceFrom.mockReturnValueOnce(builder({
      data: { tier: 'checkride_prep', subscription_status: 'free', stripe_customer_id: null },
    }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('checkride_prep');
    expect(body.status).toBe('free');
    expect(mocks.invalidateTierCache).not.toHaveBeenCalled();
  });
});
