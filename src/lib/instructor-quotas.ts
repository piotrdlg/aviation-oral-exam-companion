// src/lib/instructor-quotas.ts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuotaOverride {
  emailInviteLimit: number | null;
  tokenCreationLimit: number | null;
  expiresAt: string | null; // ISO timestamp
  note: string | null;
}

export interface QuotaSystemConfig {
  email_invite_limit?: number;
  token_creation_limit?: number;
  adaptive_quotas?: {
    enabled: boolean;
    tier2_email_limit?: number;
    tier2_token_limit?: number;
    tier3_email_limit?: number;
    tier3_token_limit?: number;
    tier2_threshold?: number; // paid_students >= this → tier2
    tier3_threshold?: number; // paid_students >= this → tier3
  };
}

export interface EffectiveQuota {
  emailInviteLimit: number;
  tokenCreationLimit: number;
  source: 'default' | 'system_config' | 'override' | 'adaptive_tier2' | 'adaptive_tier3';
  adaptiveEnabled: boolean;
  overrideActive: boolean;
  overrideNote: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const QUOTA_DEFAULTS = {
  EMAIL_INVITE_LIMIT: 20,
  TOKEN_CREATION_LIMIT: 50,
  TIER2_EMAIL_LIMIT: 40,
  TIER2_TOKEN_LIMIT: 100,
  TIER3_EMAIL_LIMIT: 80,
  TIER3_TOKEN_LIMIT: 200,
  TIER2_THRESHOLD: 2,
  TIER3_THRESHOLD: 10,
} as const;

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Check if an override has expired.
 */
export function isOverrideExpired(override: QuotaOverride | null, now?: Date): boolean {
  if (!override) return true;
  if (!override.expiresAt) return false; // no expiry = permanent
  return new Date(override.expiresAt) <= (now ?? new Date());
}

/**
 * Resolve the effective quota for an instructor.
 *
 * Precedence (highest to lowest):
 * 1. Per-instructor override (if active and not expired)
 * 2. Adaptive tier (if enabled and instructor qualifies by paid student count)
 * 3. System config defaults
 * 4. Code defaults (QUOTA_DEFAULTS)
 *
 * @param paidStudentCount - Number of paid-active students for adaptive tiering
 * @param systemConfig - System config values for instructor quotas
 * @param override - Per-instructor override (from instructor_quota_overrides table)
 * @param now - Current time for expiry checks
 */
export function resolveEffectiveQuota(
  paidStudentCount: number,
  systemConfig: QuotaSystemConfig | null,
  override: QuotaOverride | null,
  now?: Date
): EffectiveQuota {
  const currentTime = now ?? new Date();

  // Start with code defaults
  let emailLimit: number = QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT;
  let tokenLimit: number = QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT;
  let source: EffectiveQuota['source'] = 'default';

  // Apply system_config if present
  if (systemConfig) {
    if (typeof systemConfig.email_invite_limit === 'number') {
      emailLimit = systemConfig.email_invite_limit;
      source = 'system_config';
    }
    if (typeof systemConfig.token_creation_limit === 'number') {
      tokenLimit = systemConfig.token_creation_limit;
      source = 'system_config';
    }
  }

  // Check adaptive quotas (behind flag)
  const adaptive = systemConfig?.adaptive_quotas;
  const adaptiveEnabled = adaptive?.enabled === true;

  if (adaptiveEnabled) {
    const tier3Threshold = adaptive?.tier3_threshold ?? QUOTA_DEFAULTS.TIER3_THRESHOLD;
    const tier2Threshold = adaptive?.tier2_threshold ?? QUOTA_DEFAULTS.TIER2_THRESHOLD;

    if (paidStudentCount >= tier3Threshold) {
      emailLimit = adaptive?.tier3_email_limit ?? QUOTA_DEFAULTS.TIER3_EMAIL_LIMIT;
      tokenLimit = adaptive?.tier3_token_limit ?? QUOTA_DEFAULTS.TIER3_TOKEN_LIMIT;
      source = 'adaptive_tier3';
    } else if (paidStudentCount >= tier2Threshold) {
      emailLimit = adaptive?.tier2_email_limit ?? QUOTA_DEFAULTS.TIER2_EMAIL_LIMIT;
      tokenLimit = adaptive?.tier2_token_limit ?? QUOTA_DEFAULTS.TIER2_TOKEN_LIMIT;
      source = 'adaptive_tier2';
    }
  }

  // Apply per-instructor override (highest priority)
  const overrideActive = override !== null && !isOverrideExpired(override, currentTime);

  if (overrideActive && override) {
    if (override.emailInviteLimit !== null) {
      emailLimit = override.emailInviteLimit;
    }
    if (override.tokenCreationLimit !== null) {
      tokenLimit = override.tokenCreationLimit;
    }
    source = 'override';
  }

  return {
    emailInviteLimit: emailLimit,
    tokenCreationLimit: tokenLimit,
    source,
    adaptiveEnabled,
    overrideActive,
    overrideNote: overrideActive && override ? override.note : null,
  };
}
