import type { VoiceTier } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

/**
 * Look up a user's tier from the user_profiles table.
 * Uses the service-role Supabase client (server-side only).
 * Falls back to 'ground_school' if profile not found.
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
    return 'ground_school';
  }

  return data.tier as VoiceTier;
}
