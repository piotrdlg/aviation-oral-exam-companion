/**
 * Public client config. `EXPO_PUBLIC_*` vars are inlined into the JS bundle at
 * build time (Expo). The Supabase anon key is client-safe (RLS-protected); the
 * API origin defaults to production and can be overridden for local/staging.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (__DEV__ && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.warn(
    '[config] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy apps/mobile/.env.example to .env and fill them in.'
  );
}

export const config = {
  /** Supabase project (ref pvuiwwqsumoqjepukjhz). */
  supabaseUrl: SUPABASE_URL ?? '',
  supabaseAnonKey: SUPABASE_ANON_KEY ?? '',
  /** HeyDPE API the native client calls with `Authorization: Bearer <jwt>` (M1 contract). */
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://aviation-oral-exam-companion.vercel.app',
} as const;
