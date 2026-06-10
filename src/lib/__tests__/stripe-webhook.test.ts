import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * W3.1 — Stripe webhook hardening. Drives the REAL webhook POST handler with
 * mocked Stripe + Supabase + email, plus unit tests for the pure tier mapping.
 */

const h = vi.hoisted(() => ({
  currentEvent: null as Record<string, unknown> | null,
  currentSubscription: null as Record<string, unknown> | null,
  currentCharge: null as Record<string, unknown> | null,
  insertConflict: false,
  existingEvent: null as { status: string; created_at: string } | null,
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }>,
  emails: [] as string[],
  alerts: [] as string[],
}));

vi.mock('server-only', () => ({}));
// invalidateTierCache (W3.3) pulls in tier-lookup → instructor-entitlements
// (server-only); stub it to keep the webhook unit test lean.
vi.mock('@/lib/voice/tier-lookup', () => ({ invalidateTierCache: vi.fn() }));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: () => h.currentEvent },
    subscriptions: { retrieve: async () => h.currentSubscription },
    charges: { retrieve: async () => h.currentCharge },
  }),
  STRIPE_PRICES: { monthly: 'price_monthly', annual: 'price_annual' },
}));

vi.mock('@/lib/email', () => ({
  sendSubscriptionConfirmed: vi.fn(() => h.emails.push('confirmed')),
  sendSubscriptionCancelled: vi.fn(() => h.emails.push('cancelled')),
  sendPaymentFailed: vi.fn(() => h.emails.push('payment_failed')),
  sendTrialEndingReminder: vi.fn(() => h.emails.push('trial_ending')),
  sendInternalAlert: vi.fn((subject: string) => h.alerts.push(subject)),
}));

vi.mock('@/lib/posthog-server', () => ({
  captureServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const orig = await importOriginal<typeof import('next/server')>();
  return { ...orig, after: vi.fn() };
});

function makeBuilder(table: string) {
  const ctx: { op: string; payload: Record<string, unknown>; cols: string; filters: Record<string, unknown> } =
    { op: 'select', payload: {}, cols: '', filters: {} };
  const resolve = () => {
    if (ctx.op === 'insert') {
      return h.insertConflict
        ? { data: null, error: { code: '23505', message: 'duplicate' } }
        : { data: { id: 'evt-row' }, error: null };
    }
    if (ctx.op === 'update') {
      h.updates.push({ table, payload: ctx.payload, filters: { ...ctx.filters } });
      return { data: null, error: null };
    }
    // select
    if (table === 'subscription_events') return { data: h.existingEvent, error: null };
    if (table === 'user_profiles') {
      return { data: { user_id: 'user-1', display_name: 'Pilot', has_trialed: false }, error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  b.insert = (p: Record<string, unknown>) => { ctx.op = 'insert'; ctx.payload = p; return b; };
  b.update = (p: Record<string, unknown>) => { ctx.op = 'update'; ctx.payload = p; return b; };
  b.select = (cols?: string) => { ctx.cols = cols ?? ''; return b; };
  b.eq = (c: string, v: unknown) => { ctx.filters[c] = v; return b; };
  b.or = (s: string) => { ctx.filters._or = s; return b; };
  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  (b as { then: unknown }).then = (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => makeBuilder(table),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'u@example.com' } } }) } },
  }),
}));

let POST: typeof import('../../app/api/stripe/webhook/route').POST;

beforeAll(async () => {
  process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
  process.env.STRIPE_PRICE_ANNUAL = 'price_annual';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  ({ POST } = await import('../../app/api/stripe/webhook/route'));
});

function req() {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'sig_test' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

// event.created = 2026-07-02T00:00:00Z (the canceling user's window)
const CREATED_EPOCH = Math.floor(Date.parse('2026-07-02T00:00:00Z') / 1000);
const CREATED_ISO = new Date(CREATED_EPOCH * 1000).toISOString();

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false,
    cancel_at: null, trial_end: null,
    items: { data: [{ id: 'si_1', price: { id: 'price_monthly', product: 'prod_1', recurring: { interval: 'month' } }, current_period_start: CREATED_EPOCH, current_period_end: CREATED_EPOCH + 2592000 }] },
    ...overrides,
  };
}

beforeEach(() => {
  h.currentEvent = null; h.currentSubscription = null; h.currentCharge = null;
  h.insertConflict = false; h.existingEvent = null;
  h.updates.length = 0; h.emails.length = 0; h.alerts.length = 0;
});

describe('stripe webhook hardening (W3.1)', () => {
  it('payment_failed keeps the paid tier (dunning grace) and marks past_due', async () => {
    h.currentEvent = { id: 'ev1', type: 'invoice.payment_failed', created: CREATED_EPOCH, data: { object: { customer: 'cus_1' } } };
    const res = await POST(req());
    expect(res.status).toBe(200);
    const upd = h.updates.find((u) => u.table === 'user_profiles')!;
    expect(upd.payload.tier).toBeUndefined();          // tier NOT downgraded
    expect(upd.payload.subscription_status).toBe('past_due');
    expect(upd.payload.latest_invoice_status).toBe('failed');
    expect(h.emails).toContain('payment_failed');
  });

  it('subscription.deleted downgrades to checkride_prep (the cancellation path)', async () => {
    h.currentEvent = { id: 'ev2', type: 'customer.subscription.deleted', created: CREATED_EPOCH, data: { object: sub({ status: 'canceled' }) } };
    const res = await POST(req());
    expect(res.status).toBe(200);
    const upd = h.updates.find((u) => u.table === 'user_profiles')!;
    expect(upd.payload.tier).toBe('checkride_prep');
    expect(upd.payload.subscription_status).toBe('canceled');
    expect(upd.payload.stripe_subscription_id).toBeNull();
    expect(h.emails).toContain('cancelled');
  });

  it('ordering guard compares event.created, not processing time', async () => {
    h.currentEvent = { id: 'ev3', type: 'customer.subscription.updated', created: CREATED_EPOCH, data: { object: sub() } };
    await POST(req());
    const upd = h.updates.find((u) => u.table === 'user_profiles')!;
    expect(upd.payload.last_stripe_event_created).toBe(CREATED_ISO);
    expect(upd.filters._or).toContain(`last_stripe_event_created.lt.${CREATED_ISO}`);
    expect(upd.payload).not.toHaveProperty('last_webhook_event_ts');
  });

  it('past_due subscription.updated keeps dpe_live (grace)', async () => {
    h.currentEvent = { id: 'ev4', type: 'customer.subscription.updated', created: CREATED_EPOCH, data: { object: sub({ status: 'past_due' }) } };
    await POST(req());
    const upd = h.updates.find((u) => u.table === 'user_profiles')!;
    expect(upd.payload.tier).toBe('dpe_live');
  });

  it('trial_will_end sends a pre-charge reminder', async () => {
    h.currentEvent = { id: 'ev5', type: 'customer.subscription.trial_will_end', created: CREATED_EPOCH, data: { object: sub({ trial_end: CREATED_EPOCH + 259200 }) } };
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.emails).toContain('trial_ending');
  });

  it('full charge.refunded downgrades + alerts; partial only alerts', async () => {
    h.currentEvent = { id: 'ev6', type: 'charge.refunded', created: CREATED_EPOCH, data: { object: { id: 'ch_1', customer: 'cus_1', amount: 3900, amount_refunded: 3900, currency: 'usd' } } };
    await POST(req());
    expect(h.updates.find((u) => u.table === 'user_profiles')?.payload.tier).toBe('checkride_prep');
    expect(h.alerts).toContain('Charge refunded');

    h.updates.length = 0; h.alerts.length = 0;
    h.currentEvent = { id: 'ev6b', type: 'charge.refunded', created: CREATED_EPOCH, data: { object: { id: 'ch_2', customer: 'cus_1', amount: 3900, amount_refunded: 1000, currency: 'usd' } } };
    await POST(req());
    expect(h.updates.find((u) => u.table === 'user_profiles')).toBeUndefined(); // partial: no downgrade
    expect(h.alerts).toContain('Charge refunded');
  });

  it('dispute.created downgrades + alerts', async () => {
    h.currentCharge = { id: 'ch_3', customer: 'cus_1' };
    h.currentEvent = { id: 'ev7', type: 'charge.dispute.created', created: CREATED_EPOCH, data: { object: { id: 'dp_1', charge: 'ch_3', amount: 3900, currency: 'usd', reason: 'fraudulent' } } };
    await POST(req());
    expect(h.updates.find((u) => u.table === 'user_profiles')?.payload.tier).toBe('checkride_prep');
    expect(h.alerts).toContain('Payment dispute opened');
  });

  it('idempotency: already-processed event is deduplicated (200, no update)', async () => {
    h.insertConflict = true;
    h.existingEvent = { status: 'processed', created_at: new Date().toISOString() };
    h.currentEvent = { id: 'ev8', type: 'customer.subscription.deleted', created: CREATED_EPOCH, data: { object: sub() } };
    const res = await POST(req());
    const json = await res.json();
    expect(json.deduplicated).toBe(true);
    expect(h.updates.find((u) => u.table === 'user_profiles')).toBeUndefined();
  });

  it('idempotency: concurrent in-flight (<60s processing) is not re-processed', async () => {
    h.insertConflict = true;
    h.existingEvent = { status: 'processing', created_at: new Date().toISOString() };
    h.currentEvent = { id: 'ev9', type: 'customer.subscription.deleted', created: CREATED_EPOCH, data: { object: sub() } };
    const res = await POST(req());
    const json = await res.json();
    expect(json.in_flight).toBe(true);
    expect(h.updates.find((u) => u.table === 'user_profiles')).toBeUndefined();
  });
});

describe('mapStripePriceToTier / tierForSubscription (W3.1)', () => {
  it('maps known prices to dpe_live and unknown to checkride_prep', async () => {
    const { mapStripePriceToTier, tierForSubscription } = await import('../stripe-tier');
    expect(mapStripePriceToTier('price_monthly')).toBe('dpe_live');
    expect(mapStripePriceToTier('price_annual')).toBe('dpe_live');
    expect(mapStripePriceToTier('price_unknown')).toBe('checkride_prep');
    // grace statuses grant the mapped tier; terminal statuses downgrade
    expect(tierForSubscription('active', 'price_monthly')).toBe('dpe_live');
    expect(tierForSubscription('past_due', 'price_monthly')).toBe('dpe_live');
    expect(tierForSubscription('canceled', 'price_monthly')).toBe('checkride_prep');
    expect(tierForSubscription('unpaid', 'price_monthly')).toBe('checkride_prep');
  });
});
