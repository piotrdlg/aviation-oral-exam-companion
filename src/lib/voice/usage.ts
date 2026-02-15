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
  quotaType?: 'session' | 'exchange' | 'tts'
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

  // TTS character limit
  if (!quotaType || quotaType === 'tts') {
    if (usage.ttsCharsThisMonth > features.maxTtsCharsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly TTS character limit reached (${features.maxTtsCharsPerMonth.toLocaleString()} chars).`,
        limit: 'tts_chars_per_month',
      };
    }
  }

  return { allowed: true, reason: null };
}
