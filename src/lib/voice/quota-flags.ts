import type { SystemConfigMap } from '../system-config';

/** Quota enforcement flags. All default OFF (log-only soft launch, W3.2). */
export type QuotaFlag =
  | 'quota.tts_hard_enforce'
  | 'quota.stt_hard_enforce'
  | 'quota.exchange_hard_enforce'
  | 'quota.daily_caps_enforce';

/** Read a quota enforcement flag from system_config (default false). */
export function isQuotaEnforced(config: SystemConfigMap, flag: QuotaFlag): boolean {
  const v = config[flag] as { enabled?: boolean } | undefined;
  return v?.enabled === true;
}

/** Daily hard caps (user_hard_caps in system_config). */
export interface DailyHardCaps {
  daily_llm_tokens: number;
  daily_tts_chars: number;
  daily_stt_seconds: number;
}

export function getDailyHardCaps(config: SystemConfigMap): DailyHardCaps {
  const v = (config['user_hard_caps'] as Partial<DailyHardCaps> | undefined) ?? {};
  return {
    daily_llm_tokens: v.daily_llm_tokens ?? 100_000,
    daily_tts_chars: v.daily_tts_chars ?? 50_000,
    daily_stt_seconds: v.daily_stt_seconds ?? 3_600,
  };
}
