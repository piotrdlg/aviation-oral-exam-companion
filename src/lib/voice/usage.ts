import { TIER_FEATURES, type VoiceTier } from './types';

export interface UsageSummary {
  sessionsThisMonth: number;
  ttsCharsThisMonth: number;
  sttSecondsThisMonth: number;
  exchangesThisSession: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason: string | null;
  limit?: string;
}

export function checkQuota(
  tier: VoiceTier,
  usage: UsageSummary,
  quotaType?: 'session' | 'exchange' | 'tts' | 'stt'
): QuotaCheckResult {
  const features = TIER_FEATURES[tier];

  // Session limit (skip if checking a specific other quota)
  if (!quotaType || quotaType === 'session') {
    if (usage.sessionsThisMonth >= features.maxSessionsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly session limit reached (${features.maxSessionsPerMonth} sessions).`,
        limit: 'sessions_per_month',
      };
    }
  }

  // Exchange limit
  if (!quotaType || quotaType === 'exchange') {
    if (usage.exchangesThisSession >= features.maxExchangesPerSession) {
      return {
        allowed: false,
        reason: `Per-session exchange limit reached (${features.maxExchangesPerSession} exchanges).`,
        limit: 'exchanges_per_session',
      };
    }
  }

  // TTS character limit (W3.2 #1: was `>` — off-by-one let one extra request
  // through at the cap; now blocks at-or-over).
  if (!quotaType || quotaType === 'tts') {
    if (usage.ttsCharsThisMonth >= features.maxTtsCharsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly TTS character limit reached (${features.maxTtsCharsPerMonth.toLocaleString()} chars).`,
        limit: 'tts_chars_per_month',
      };
    }
  }

  // STT seconds limit (W3.2 #9)
  if (!quotaType || quotaType === 'stt') {
    if (usage.sttSecondsThisMonth >= features.maxSttSecondsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly voice (STT) limit reached (${Math.round(features.maxSttSecondsPerMonth / 60)} min).`,
        limit: 'stt_seconds_per_month',
      };
    }
  }

  return { allowed: true, reason: null };
}

/**
 * Whether a tier includes TTS. W3.2 / decision D1: voice is universal — every
 * tier (including the free trial) has TTS access. Theft is prevented by the
 * monthly char/second budgets and the 3-exam count limit, not by feature-gating.
 */
export function hasTtsAccess(_tier: VoiceTier): boolean {
  return true;
}
