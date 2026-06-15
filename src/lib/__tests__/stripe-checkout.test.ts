import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----------------------------------------------------------------
// Hoisted mocks
// ----------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  serviceFrom: vi.fn(),
  customersCreate: vi.fn(),
  sessionsCreate: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    customers: { create: mocks.customersCreate },
    checkout: { sessions: { create: mocks.sessionsCreate } },
  })),
  STRIPE_PRICES: { monthly: 'price_monthly', annual: 'price_annual' },
}));

import { POST } from '@/app/api/stripe/checkout/route';

// Fluent supabase builder mock (select/eq/single/update → builder; await → {data})
function builder(result: { data?: unknown }) {
  const b: Record<string, any> = {};
  for (const m of ['select', 'eq', 'single', 'update']) b[m] = vi.fn().mockReturnValue(b);
  b.then = (resolve: (v: any) => any) => Promise.resolve({ data: result.data ?? null, error: null }).then(resolve);
  return b;
}

function postReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/stripe/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
  // existing customer → skips customers.create
  mocks.serviceFrom.mockReturnValue(builder({ data: { stripe_customer_id: 'cus_x' } }));
  mocks.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
});

describe('stripe checkout — no Stripe trial (immediate-pay paid)', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(postReq({ plan: 'monthly' }));
    expect(res.status).toBe(401);
  });

  it('defaults any non-annual plan to the monthly price', async () => {
    // The route does not reject unknown plans — it treats anything that is
    // not 'annual' as monthly. Guards the "no silent 500 on odd input" path.
    const res = await POST(postReq({ plan: 'lifetime' }));
    expect(res.status).toBe(200);
    expect(mocks.sessionsCreate.mock.calls[0][0].line_items[0].price).toBe('price_monthly');
  });

  it('creates a subscription with NO trial_period_days', async () => {
    await POST(postReq({ plan: 'monthly' }));
    expect(mocks.sessionsCreate).toHaveBeenCalledTimes(1);
    const arg = mocks.sessionsCreate.mock.calls[0][0];
    expect(arg.mode).toBe('subscription');
    // the whole point of the refactor — no Stripe trial
    expect(arg.subscription_data).not.toHaveProperty('trial_period_days');
  });

  it('the submit copy no longer promises a "7-day free trial"', async () => {
    await POST(postReq({ plan: 'monthly' }));
    const msg = mocks.sessionsCreate.mock.calls[0][0].custom_text.submit.message as string;
    expect(msg).not.toMatch(/7-day free trial/i);
    expect(msg).toMatch(/subscribe/i);
  });

  it('does not opt into payment_method_collection: "if_required" (card required)', async () => {
    await POST(postReq({ plan: 'monthly' }));
    const arg = mocks.sessionsCreate.mock.calls[0][0];
    expect(arg.payment_method_collection).not.toBe('if_required');
  });

  it('selects the monthly vs annual price id by plan', async () => {
    await POST(postReq({ plan: 'monthly' }));
    expect(mocks.sessionsCreate.mock.calls[0][0].line_items[0].price).toBe('price_monthly');

    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
    mocks.serviceFrom.mockReturnValue(builder({ data: { stripe_customer_id: 'cus_x' } }));
    mocks.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
    await POST(postReq({ plan: 'annual' }));
    expect(mocks.sessionsCreate.mock.calls[0][0].line_items[0].price).toBe('price_annual');
  });
});
