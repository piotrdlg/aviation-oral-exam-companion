import type { VoiceTier } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

/**
 * Look up a user's tier from the user_profiles table.
 * Uses the service-role Supabase client (server-side only).
 * Falls back to 'checkride_prep' (Deepgram) — the universal base tier.
 */
export async function getUserTier(
  supabase: SupabaseClientLike,
  userId: string
): Promise<VoiceTier> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return 'checkride_prep';
  }

  return data.tier as VoiceTier;
}

/**
 * Look up a user's preferred Deepgram voice model from user_profiles.
 * Returns null if no preference set (system default will be used).
 */
export async function getUserPreferredVoice(
  supabase: SupabaseClientLike,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferred_voice')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.preferred_voice as string | null;
}
