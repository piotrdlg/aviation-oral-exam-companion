import type { VoiceTier } from '@/lib/voice/types';

export type SystemConfigMap = Record<string, Record<string, unknown>>;

export interface KillSwitchResult {
  blocked: boolean;
  reason?: string;
  fallbackTier?: VoiceTier;
}

/**
 * Check kill switches against loaded system config.
 * Pure function — no DB calls. Config fetching is handled separately.
 */
export function checkKillSwitch(
  config: SystemConfigMap,
  provider: string,
  tier: VoiceTier
): KillSwitchResult {
  // Check maintenance mode first
  const maintenance = config['maintenance_mode'] as { enabled: boolean; message: string } | undefined;
  if (maintenance?.enabled) {
    return {
      blocked: true,
      reason: maintenance.message || 'Maintenance in progress',
    };
  }

  // Check provider kill switch
  const providerSwitch = config[`kill_switch.${provider}`] as { enabled: boolean } | undefined;
  if (providerSwitch?.enabled) {
    return { blocked: true, reason: `Provider ${provider} is temporarily disabled` };
  }

  // Check tier kill switch
  const tierSwitch = config[`kill_switch.tier.${tier}`] as { enabled: boolean } | undefined;
  if (tierSwitch?.enabled) {
    // Try to degrade dpe_live -> checkride_prep
    if (tier === 'dpe_live') {
      const t2Switch = config['kill_switch.tier.checkride_prep'] as { enabled: boolean } | undefined;
      if (!t2Switch?.enabled) {
        return { blocked: false, fallbackTier: 'checkride_prep' };
      }
    }
    return { blocked: true, reason: `Tier ${tier} is temporarily disabled` };
  }

  return { blocked: false };
}
