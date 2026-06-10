import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const ent = vi.hoisted(() => ({
  resolveInstructorEntitlements: vi.fn(async () => ({ hasCourtesyAccess: false, effectiveTierOverride: null })),
  hasPaidEquivalentOverride: vi.fn(async () => false),
}));

vi.mock('../instructor-entitlements', () => ({
  resolveInstructorEntitlements: ent.resolveInstructorEntitlements,
  hasPaidEquivalentOverride: ent.hasPaidEquivalentOverride,
  COURTESY_TIER: 'checkride_prep',
}));

import { getUserTier } from '../voice/tier-lookup';

function clientWithTier(tier: string) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { tier }, error: null }) }) }),
    }),
  };
}

beforeEach(() => {
  ent.resolveInstructorEntitlements.mockClear();
  ent.hasPaidEquivalentOverride.mockReset();
  ent.hasPaidEquivalentOverride.mockResolvedValue(false);
});

describe('getUserTier (W3.3 #16: paid_equivalent override grants dpe_live)', () => {
  it('grants dpe_live to a free user with an active paid_equivalent override', async () => {
    ent.hasPaidEquivalentOverride.mockResolvedValue(true);
    const tier = await getUserTier(clientWithTier('checkride_prep'), 'u-override-1');
    expect(tier).toBe('dpe_live');
  });

  it('leaves a free user as-is when no override exists', async () => {
    const tier = await getUserTier(clientWithTier('checkride_prep'), 'u-no-override-2');
    expect(tier).toBe('checkride_prep');
  });

  it('does not query the override for an already-dpe_live user', async () => {
    const tier = await getUserTier(clientWithTier('dpe_live'), 'u-paid-3');
    expect(tier).toBe('dpe_live');
    expect(ent.hasPaidEquivalentOverride).not.toHaveBeenCalled();
  });
});
