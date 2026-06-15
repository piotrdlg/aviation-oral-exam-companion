import type { VoiceTier } from '@/types/database';

/**
 * Human-facing display labels for the stored access tiers. This is a PRESENTATION
 * layer only — the stored `VoiceTier` values (`checkride_prep` / `dpe_live`) and
 * every access-gate comparison are UNCHANGED. Renaming the stored enum would be a
 * risky data migration (see docs/2026-06-14-tier-trial-terminology-audit.html);
 * routing display through this module gives the clear vocabulary with zero risk.
 *
 *  - ground_school  → "Trial"  (dead legacy value, migrated away 2026-02-18; mapped
 *                               so a stray row never renders a raw enum string)
 *  - checkride_prep → "Trial"  (the free trial tier)
 *  - dpe_live       → "Paid"   (the paid subscription tier)
 */
export const TIER_LABEL: Record<VoiceTier, string> = {
  ground_school: 'Trial',
  checkride_prep: 'Trial',
  dpe_live: 'Paid',
};

/** Label for an admin-granted `user_entitlement_overrides.paid_equivalent`
 *  (free, admin-managed access). Surfaced in ADMIN UI only. */
export const OVERRIDE_LABEL = 'Tester' as const;

/** Visual band for a label — drives badge colours without leaking raw tiers. */
export type TierBand = 'trial' | 'paid' | 'tester';

export function tierBand(tier: VoiceTier, hasPaidOverride = false): TierBand {
  if (hasPaidOverride) return 'tester';
  return tier === 'dpe_live' ? 'paid' : 'trial';
}

/** Primary display helper. A Tester override always wins the label (it matches the
 *  effective access `getUserTier` grants); otherwise resolves Trial/Paid from the
 *  stored tier. */
export function tierDisplay(tier: VoiceTier, hasPaidOverride = false): string {
  if (hasPaidOverride) return OVERRIDE_LABEL;
  return TIER_LABEL[tier] ?? TIER_LABEL.checkride_prep;
}

/** Stripe subscription status → short human label (admin "Sub:" chip). Keeps the
 *  raw status meaning but title-cased; no gating implications. */
const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  unpaid: 'Unpaid',
  paused: 'Paused',
  none: 'Free',
};

export function subscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABEL.none;
  return STATUS_LABEL[status] ?? status;
}
