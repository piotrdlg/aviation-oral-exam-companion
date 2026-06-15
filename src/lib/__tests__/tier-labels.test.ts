import { describe, it, expect } from 'vitest';
import type { VoiceTier } from '@/types/database';
import {
  TIER_LABEL,
  OVERRIDE_LABEL,
  tierBand,
  tierDisplay,
  subscriptionStatusLabel,
} from '../tier-labels';

const ALL_TIERS: VoiceTier[] = ['ground_school', 'checkride_prep', 'dpe_live'];

describe('TIER_LABEL', () => {
  it('maps the free tiers to "Trial" and the paid tier to "Paid"', () => {
    expect(TIER_LABEL.checkride_prep).toBe('Trial');
    expect(TIER_LABEL.ground_school).toBe('Trial'); // dead legacy value still renders safely
    expect(TIER_LABEL.dpe_live).toBe('Paid');
  });

  it('has a non-empty label for every VoiceTier (exhaustiveness guard)', () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_LABEL[tier]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(TIER_LABEL).sort()).toEqual([...ALL_TIERS].sort());
  });
});

describe('tierDisplay', () => {
  it('resolves Trial/Paid from the stored tier', () => {
    expect(tierDisplay('checkride_prep')).toBe('Trial');
    expect(tierDisplay('dpe_live')).toBe('Paid');
  });

  it('a paid_equivalent override always wins → "Tester"', () => {
    expect(tierDisplay('checkride_prep', true)).toBe(OVERRIDE_LABEL);
    expect(tierDisplay('dpe_live', true)).toBe('Tester');
  });
});

describe('tierBand', () => {
  it('bands by display, not raw tier', () => {
    expect(tierBand('checkride_prep')).toBe('trial');
    expect(tierBand('ground_school')).toBe('trial');
    expect(tierBand('dpe_live')).toBe('paid');
  });
  it('override → tester band regardless of stored tier', () => {
    expect(tierBand('checkride_prep', true)).toBe('tester');
    expect(tierBand('dpe_live', true)).toBe('tester');
  });
});

describe('subscriptionStatusLabel', () => {
  it('title-cases known Stripe statuses', () => {
    expect(subscriptionStatusLabel('active')).toBe('Active');
    expect(subscriptionStatusLabel('past_due')).toBe('Past Due');
    expect(subscriptionStatusLabel('trialing')).toBe('Trialing');
  });
  it('treats null/none as "Free" and passes through unknown values', () => {
    expect(subscriptionStatusLabel(null)).toBe('Free');
    expect(subscriptionStatusLabel(undefined)).toBe('Free');
    expect(subscriptionStatusLabel('none')).toBe('Free');
    expect(subscriptionStatusLabel('weird_status')).toBe('weird_status');
  });
});
