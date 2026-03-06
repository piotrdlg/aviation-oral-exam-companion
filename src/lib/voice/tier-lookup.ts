import type { VoiceTier } from './types';
import { TtlCache } from '../ttl-cache';
import {
  resolveInstructorEntitlements,
  COURTESY_TIER,
} from '../instructor-entitlements';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

// Module-level caches: survive across warm invocations (5-min TTL).
const tierCache = new TtlCache<VoiceTier>(5 * 60_000);
const voiceCache = new TtlCache<string | null>(5 * 60_000);

/** Tier ordering for comparison. Higher index = more permissive. */
const TIER_ORDER: Record<VoiceTier, number> = {
  ground_school: 0,
  checkride_prep: 1,
  dpe_live: 2,
};

/**
 * Look up a user's effective tier, considering:
 * 1. Base tier from user_profiles
 * 2. Instructor courtesy access (if feature enabled and eligible)
 *
 * The higher of (base tier, courtesy tier) wins — courtesy never downgrades.
 * Falls back to 'checkride_prep' on DB error.
 * Cached per-user for 5 minutes (base tier) / 60 seconds (entitlements).
 */
export async function getUserTier(
  supabase: SupabaseClientLike,
  userId: string
): Promise<VoiceTier> {
  const cached = tierCache.get(userId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return 'checkride_prep';
  }

  let tier = data.tier as VoiceTier;

  // Check instructor courtesy access — only if base tier could benefit
  if (TIER_ORDER[tier] < TIER_ORDER[COURTESY_TIER]) {
    try {
      const entitlements = await resolveInstructorEntitlements(userId, {
        supabaseClient: supabase,
      });
      if (entitlements.hasCourtesyAccess && entitlements.effectiveTierOverride) {
        tier = entitlements.effectiveTierOverride;
      }
    } catch {
      // Entitlement check failure should not block tier resolution
    }
  }

  tierCache.set(userId, tier);
  return tier;
}

/**
 * Look up a user's preferred Deepgram voice model from user_profiles.
 * Returns null if no preference set (system default will be used).
 * Cached per-user for 5 minutes.
 */
export async function getUserPreferredVoice(
  supabase: SupabaseClientLike,
  userId: string
): Promise<string | null> {
  const cacheKey = `voice:${userId}`;
  const cached = voiceCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferred_voice')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  const voice = data.preferred_voice as string | null;
  voiceCache.set(cacheKey, voice);
  return voice;
}

/** Invalidate tier cache for a user (call after tier changes). */
export function invalidateTierCache(userId: string): void {
  tierCache.delete(userId);
}
