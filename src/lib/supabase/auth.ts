import 'server-only';
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { createClient } from './server';

export interface AuthedUser {
  user: User;
  /** The bearer JWT (native clients) OR the cookie session's `access_token`. */
  accessToken: string;
  transport: 'bearer' | 'cookie';
  /**
   * A Supabase client RLS-bound to `user` for this request's transport — use it
   * for the route's data queries exactly as the cookie client was used before.
   * Bearer: anon key + the user's JWT in the Authorization header (RLS applies as
   * the user). Cookie: the existing cookie-bound SSR client. Routes that only do
   * service-role data access can ignore this and destructure `{ user }`.
   */
  supabase: SupabaseClient;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Module-scoped service-role client used ONLY to verify a bearer JWT via
// auth.getUser(token) (mirrors src/app/api/bench/route.ts:13-16). Route data
// access uses the per-request RLS-bound client returned in AuthedUser.supabase —
// never this verifier.
let _verifier: SupabaseClient | null = null;
function verifier(): SupabaseClient {
  if (!_verifier) {
    _verifier = createSupabaseClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _verifier;
}

/**
 * Dual-mode auth. Prefers `Authorization: Bearer <supabase_jwt>` (native clients
 * that carry no cookies); otherwise falls back to the existing cookie session.
 * Returns `null` when neither yields a verified user — the caller returns its own
 * 401 shape.
 *
 * The cookie path is byte-for-byte the legacy `createClient()` + `getUser()` flow:
 * a cookie request carries no `Authorization` header, so the bearer branch is
 * skipped entirely and `src/lib/supabase/server.ts` is never modified. This keeps
 * the change purely additive for the ~40 existing cookie callers.
 */
export async function getAuthedUser(request: NextRequest): Promise<AuthedUser | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data, error } = await verifier().auth.getUser(token);
    if (error || !data?.user) return null;
    // RLS-bound data client: anon key + the verified user's JWT in the header.
    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { user: data.user, accessToken: token, transport: 'bearer', supabase };
  }

  const supabase = await createClient();
  // getSession is optional-chained so unit tests that mock the server client with
  // only `auth.getUser` keep working; real SSR clients always provide it.
  const sessionPromise =
    supabase.auth.getSession?.() ?? Promise.resolve({ data: { session: null } });
  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    sessionPromise,
    supabase.auth.getUser(),
  ]);
  if (!userData?.user) return null;
  return {
    user: userData.user,
    accessToken: sessionData?.session?.access_token ?? '',
    transport: 'cookie',
    supabase: supabase as unknown as SupabaseClient,
  };
}
