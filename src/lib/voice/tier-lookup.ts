import type { VoiceTier } from './types';
import { TtlCache } from '../ttl-cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

// Module-level caches: survive across warm invocations (5-min TTL).
const tierCache = new TtlCache<VoiceTier>(5 * 60_000);
const voiceCache = new TtlCache<string | null>(5 * 60_000);

/**
 * Look up a user's tier from the user_profiles table.
 * Uses the service-role Supabase client (server-side only).
 * Falls back to 'checkride_prep' (Deepgram) — the universal base tier.
 * Cached per-user for 5 minutes.
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

  const tier = data.tier as VoiceTier;
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
