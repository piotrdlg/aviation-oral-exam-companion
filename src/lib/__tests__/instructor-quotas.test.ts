import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveQuota,
  isOverrideExpired,
  QUOTA_DEFAULTS,
  type QuotaOverride,
  type QuotaSystemConfig,
} from '../instructor-quotas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-03-06T12:00:00Z');
const FUTURE = '2026-12-31T23:59:59Z';
const PAST = '2026-01-01T00:00:00Z';

function makeOverride(partial: Partial<QuotaOverride> = {}): QuotaOverride {
  return {
    emailInviteLimit: null,
    tokenCreationLimit: null,
    expiresAt: null,
    note: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// 1. isOverrideExpired
// ---------------------------------------------------------------------------

describe('isOverrideExpired', () => {
  it('returns true for null override', () => {
    expect(isOverrideExpired(null, NOW)).toBe(true);
  });

  it('returns false when no expiry is set (permanent override)', () => {
    const override = makeOverride({ expiresAt: null });
    expect(isOverrideExpired(override, NOW)).toBe(false);
  });

  it('returns false when expiry is in the future', () => {
    const override = makeOverride({ expiresAt: FUTURE });
    expect(isOverrideExpired(override, NOW)).toBe(false);
  });

  it('returns true when expiry is in the past', () => {
    const override = makeOverride({ expiresAt: PAST });
    expect(isOverrideExpired(override, NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveEffectiveQuota - defaults
// ---------------------------------------------------------------------------

describe('resolveEffectiveQuota - defaults', () => {
  it('returns code defaults when no config and no override', () => {
    const result = resolveEffectiveQuota(0, null, null, NOW);
    expect(result).toEqual({
      emailInviteLimit: QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT,
      tokenCreationLimit: QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT,
      source: 'default',
      adaptiveEnabled: false,
      overrideActive: false,
      overrideNote: null,
    });
  });

  it('system config overrides code defaults', () => {
    const config: QuotaSystemConfig = {
      email_invite_limit: 30,
      token_creation_limit: 75,
    };
    const result = resolveEffectiveQuota(0, config, null, NOW);
    expect(result.emailInviteLimit).toBe(30);
    expect(result.tokenCreationLimit).toBe(75);
    expect(result.source).toBe('system_config');
  });

  it('partially overrides when only one field in system config', () => {
    const config: QuotaSystemConfig = {
      email_invite_limit: 25,
      // token_creation_limit not set
    };
    const result = resolveEffectiveQuota(0, config, null, NOW);
    expect(result.emailInviteLimit).toBe(25);
    expect(result.tokenCreationLimit).toBe(QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT);
    expect(result.source).toBe('system_config');
  });
});

// ---------------------------------------------------------------------------
// 3. resolveEffectiveQuota - adaptive
// ---------------------------------------------------------------------------

describe('resolveEffectiveQuota - adaptive', () => {
  const adaptiveConfig: QuotaSystemConfig = {
    email_invite_limit: 15,
    token_creation_limit: 40,
    adaptive_quotas: {
      enabled: true,
    },
  };

  it('does not upgrade tier when adaptive is disabled', () => {
    const config: QuotaSystemConfig = {
      email_invite_limit: 15,
      token_creation_limit: 40,
      adaptive_quotas: { enabled: false },
    };
    const result = resolveEffectiveQuota(100, config, null, NOW);
    expect(result.emailInviteLimit).toBe(15);
    expect(result.tokenCreationLimit).toBe(40);
    expect(result.source).toBe('system_config');
    expect(result.adaptiveEnabled).toBe(false);
  });

  it('upgrades to tier2 when paidStudents >= tier2 threshold', () => {
    const result = resolveEffectiveQuota(2, adaptiveConfig, null, NOW);
    expect(result.emailInviteLimit).toBe(QUOTA_DEFAULTS.TIER2_EMAIL_LIMIT);
    expect(result.tokenCreationLimit).toBe(QUOTA_DEFAULTS.TIER2_TOKEN_LIMIT);
    expect(result.source).toBe('adaptive_tier2');
    expect(result.adaptiveEnabled).toBe(true);
  });

  it('upgrades to tier3 when paidStudents >= tier3 threshold', () => {
    const result = resolveEffectiveQuota(10, adaptiveConfig, null, NOW);
    expect(result.emailInviteLimit).toBe(QUOTA_DEFAULTS.TIER3_EMAIL_LIMIT);
    expect(result.tokenCreationLimit).toBe(QUOTA_DEFAULTS.TIER3_TOKEN_LIMIT);
    expect(result.source).toBe('adaptive_tier3');
    expect(result.adaptiveEnabled).toBe(true);
  });

  it('stays at system_config level when paidStudents below tier2 threshold', () => {
    const result = resolveEffectiveQuota(1, adaptiveConfig, null, NOW);
    expect(result.emailInviteLimit).toBe(15);
    expect(result.tokenCreationLimit).toBe(40);
    expect(result.source).toBe('system_config');
    expect(result.adaptiveEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. resolveEffectiveQuota - overrides
// ---------------------------------------------------------------------------

describe('resolveEffectiveQuota - overrides', () => {
  const adaptiveConfig: QuotaSystemConfig = {
    adaptive_quotas: { enabled: true },
  };

  it('active override takes precedence over adaptive', () => {
    const override = makeOverride({
      emailInviteLimit: 999,
      tokenCreationLimit: 888,
      expiresAt: FUTURE,
      note: 'VIP instructor',
    });
    // paidStudents=10 would normally be tier3
    const result = resolveEffectiveQuota(10, adaptiveConfig, override, NOW);
    expect(result.emailInviteLimit).toBe(999);
    expect(result.tokenCreationLimit).toBe(888);
    expect(result.source).toBe('override');
    expect(result.overrideActive).toBe(true);
    expect(result.overrideNote).toBe('VIP instructor');
  });

  it('expired override is ignored and falls back to adaptive/default', () => {
    const override = makeOverride({
      emailInviteLimit: 999,
      tokenCreationLimit: 888,
      expiresAt: PAST,
    });
    const result = resolveEffectiveQuota(10, adaptiveConfig, override, NOW);
    expect(result.source).toBe('adaptive_tier3');
    expect(result.overrideActive).toBe(false);
    expect(result.emailInviteLimit).toBe(QUOTA_DEFAULTS.TIER3_EMAIL_LIMIT);
  });

  it('partial override applies only specified fields', () => {
    const override = makeOverride({
      emailInviteLimit: 500,
      // tokenCreationLimit is null → should come from lower priority
      expiresAt: FUTURE,
    });
    const result = resolveEffectiveQuota(10, adaptiveConfig, override, NOW);
    expect(result.emailInviteLimit).toBe(500);
    // tokenCreationLimit should come from adaptive tier3
    expect(result.tokenCreationLimit).toBe(QUOTA_DEFAULTS.TIER3_TOKEN_LIMIT);
    expect(result.source).toBe('override');
  });

  it('override note is passed through when override is active', () => {
    const override = makeOverride({
      emailInviteLimit: 100,
      expiresAt: FUTURE,
      note: 'Approved by admin for beta program',
    });
    const result = resolveEffectiveQuota(0, null, override, NOW);
    expect(result.overrideNote).toBe('Approved by admin for beta program');
    expect(result.overrideActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. resolveEffectiveQuota - precedence
// ---------------------------------------------------------------------------

describe('resolveEffectiveQuota - precedence', () => {
  it('override > adaptive > system_config > default (full chain)', () => {
    const config: QuotaSystemConfig = {
      email_invite_limit: 30,
      token_creation_limit: 60,
      adaptive_quotas: {
        enabled: true,
        tier3_email_limit: 90,
        tier3_token_limit: 180,
      },
    };
    const override = makeOverride({
      emailInviteLimit: 1000,
      tokenCreationLimit: 2000,
      expiresAt: FUTURE,
    });

    // Without override: tier3 would apply (paidStudents=10)
    const withoutOverride = resolveEffectiveQuota(10, config, null, NOW);
    expect(withoutOverride.emailInviteLimit).toBe(90);
    expect(withoutOverride.source).toBe('adaptive_tier3');

    // With override: override wins
    const withOverride = resolveEffectiveQuota(10, config, override, NOW);
    expect(withOverride.emailInviteLimit).toBe(1000);
    expect(withOverride.tokenCreationLimit).toBe(2000);
    expect(withOverride.source).toBe('override');
  });

  it('expired override + adaptive enabled → adaptive wins', () => {
    const config: QuotaSystemConfig = {
      email_invite_limit: 25,
      token_creation_limit: 55,
      adaptive_quotas: { enabled: true },
    };
    const expiredOverride = makeOverride({
      emailInviteLimit: 500,
      tokenCreationLimit: 500,
      expiresAt: PAST,
    });
    const result = resolveEffectiveQuota(5, config, expiredOverride, NOW);
    expect(result.source).toBe('adaptive_tier2');
    expect(result.emailInviteLimit).toBe(QUOTA_DEFAULTS.TIER2_EMAIL_LIMIT);
    expect(result.tokenCreationLimit).toBe(QUOTA_DEFAULTS.TIER2_TOKEN_LIMIT);
    expect(result.overrideActive).toBe(false);
  });

  it('respects custom tier thresholds from config', () => {
    const config: QuotaSystemConfig = {
      adaptive_quotas: {
        enabled: true,
        tier2_threshold: 5,
        tier3_threshold: 20,
        tier2_email_limit: 50,
        tier2_token_limit: 120,
        tier3_email_limit: 100,
        tier3_token_limit: 250,
      },
    };

    // paidStudents=3 → below custom tier2 threshold (5), stays at default
    const belowTier2 = resolveEffectiveQuota(3, config, null, NOW);
    expect(belowTier2.source).toBe('default');
    expect(belowTier2.emailInviteLimit).toBe(QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT);

    // paidStudents=5 → hits custom tier2 threshold
    const atTier2 = resolveEffectiveQuota(5, config, null, NOW);
    expect(atTier2.source).toBe('adaptive_tier2');
    expect(atTier2.emailInviteLimit).toBe(50);
    expect(atTier2.tokenCreationLimit).toBe(120);

    // paidStudents=20 → hits custom tier3 threshold
    const atTier3 = resolveEffectiveQuota(20, config, null, NOW);
    expect(atTier3.source).toBe('adaptive_tier3');
    expect(atTier3.emailInviteLimit).toBe(100);
    expect(atTier3.tokenCreationLimit).toBe(250);
  });
});
