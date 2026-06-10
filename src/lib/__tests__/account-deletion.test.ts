import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  calls: [] as string[],
  stripeCancel: vi.fn(),
  adminDelete: vi.fn(),
  db: { profile: { stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' } as Record<string, unknown> | null, tickets: [{ id: 't1' }] },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'user@example.com' } } }) },
  })),
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { cancel: h.stripeCancel.mockImplementation(async () => { h.calls.push('stripe.cancel'); }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      const api: Record<string, unknown> = {};
      const chain = () => api;
      api.select = chain; api.eq = chain; api.in = chain;
      api.maybeSingle = async () => ({ data: table === 'user_profiles' ? h.db.profile : null });
      api.delete = () => { h.calls.push(`delete:${table}`); return api; };
      (api as { then: unknown }).then = (res: (v: unknown) => void) =>
        Promise.resolve({ data: table === 'support_tickets' ? h.db.tickets : [], error: null }).then(res);
      return api;
    },
    auth: { admin: { deleteUser: h.adminDelete.mockImplementation(async () => { h.calls.push('auth.deleteUser'); return { error: null }; }) } },
  })),
}));
vi.mock('@/lib/email', () => ({ sendAccountDeleted: vi.fn() }));
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent: vi.fn(), flushPostHog: vi.fn() }));

import { POST } from '../../app/api/user/delete/route';

function req(body: unknown) {
  return new Request('http://x/api/user/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  h.calls.length = 0;
  h.stripeCancel.mockClear();
  h.adminDelete.mockClear();
  h.db.profile = { stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' };
});

describe('POST /api/user/delete (W6.3)', () => {
  it('requires the type-to-confirm token', async () => {
    const res = await POST(req({ confirm: 'nope' }));
    expect(res.status).toBe(400);
    expect(h.adminDelete).not.toHaveBeenCalled();
  });

  it('cancels Stripe FIRST, deletes explicit tables, then the auth user', async () => {
    const res = await POST(req({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(h.calls[0]).toBe('stripe.cancel');
    expect(h.calls).toContain('delete:subscription_events');
    expect(h.calls).toContain('delete:ticket_replies');
    expect(h.calls).toContain('delete:support_tickets');
    expect(h.calls[h.calls.length - 1]).toBe('auth.deleteUser');
  });

  it('ABORTS deletion when the Stripe cancel fails (never strand a paid sub)', async () => {
    h.stripeCancel.mockRejectedValueOnce(new Error('stripe down'));
    const res = await POST(req({ confirm: 'DELETE' }));
    expect(res.status).toBe(502);
    expect(h.adminDelete).not.toHaveBeenCalled();
  });

  it('proceeds when there is no subscription to cancel', async () => {
    h.db.profile = { stripe_subscription_id: null, stripe_customer_id: null };
    const res = await POST(req({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(h.stripeCancel).not.toHaveBeenCalled();
    expect(h.adminDelete).toHaveBeenCalled();
  });
});
