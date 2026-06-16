import 'server-only';
import { createClient as createServiceClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { createClient } from './server';

export interface AuthedUser {
  user: User;
  /** The bearer JWT (native clients) OR the cookie session's `access_token`. */
  accessToken: string;
  transport: 'bearer' | 'cookie';
}

// Module-scoped service-role client used ONLY to verify a bearer JWT via
// `auth.getUser(token)` (mirrors src/app/api/bench/route.ts:13-16). It performs no
// RLS-bypassing data reads here — data access still flows through each route's own
// (RLS-bound) client keyed to the verified user.
let _verifier: ReturnType<typeof createServiceClient> | null = null;
function verifier() {
  if (!_verifier) {
    _verifier = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
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
 * skipped entirely and `src/lib/supabase/server.ts` is never modified. This makes
 * the change purely additive for the ~40 existing cookie callers.
 */
export async function getAuthedUser(request: NextRequest): Promise<AuthedUser | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data, error } = await verifier().auth.getUser(token);
    if (error || !data?.user) return null;
    return { user: data.user, accessToken: token, transport: 'bearer' };
  }

  const supabase = await createClient();
  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);
  if (!userData?.user) return null;
  return {
    user: userData.user,
    accessToken: sessionData?.session?.access_token ?? '',
    transport: 'cookie',
  };
}
