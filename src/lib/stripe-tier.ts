import type { VoiceTier } from './voice/types';

/**
 * Stripe subscription statuses that keep a paying user on their paid tier.
 * `past_due` is included so a single failed renewal does NOT instantly cut
 * access — Stripe retries for ~2 weeks (dunning). Access is only revoked on
 * customer.subscription.deleted or a terminal status (review-05 #8).
 */
export const GRACE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Map a Stripe price id to the voice tier it grants (review-05 #14).
 *
 * Returns 'dpe_live' only for known paid price ids. An unknown price never
 * silently grants the top tier — it falls back to 'checkride_prep' and logs.
 *
 * Safety valve: if neither price env var is configured (misconfiguration),
 * preserve the legacy single-product behaviour (any subscription == dpe_live)
 * so we never mass-downgrade existing payers due to a deploy/env mistake.
 */
export function mapStripePriceToTier(priceId: string | undefined | null): VoiceTier {
  const monthly = process.env.STRIPE_PRICE_MONTHLY;
  const annual = process.env.STRIPE_PRICE_ANNUAL;
  if (!monthly && !annual) return 'dpe_live';
  if (priceId && (priceId === monthly || priceId === annual)) return 'dpe_live';
  console.error(`[stripe] Unknown price id "${priceId ?? '(none)'}" — not granting dpe_live`);
  return 'checkride_prep';
}

/**
 * Resolve the tier for a subscription given its status + price.
 * Grace statuses keep the mapped paid tier; everything else downgrades.
 */
export function tierForSubscription(
  status: string,
  priceId: string | undefined | null
): VoiceTier {
  return GRACE_STATUSES.has(status) ? mapStripePriceToTier(priceId) : 'checkride_prep';
}
