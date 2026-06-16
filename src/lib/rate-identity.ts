import type { NextRequest } from 'next/server';

/**
 * Per-user rate-limit identity, derived WITHOUT booting a Supabase client (this
 * runs in the middleware hot path on the Edge runtime — no `Buffer`, only Web APIs
 * like `atob`).
 *
 * Order of precedence: Bearer JWT `sub` (native clients) → Supabase auth-cookie
 * `sub` (web) → client IP.
 *
 * Decode-only / signature-unverified BY DESIGN — consistent with the existing
 * middleware comment "verification happens later in the route handler". The route
 * handler's `getUser()` is the trust boundary. A forged `sub` only changes which
 * rate-limit bucket a request lands in; it never escalates identity, because the
 * handler re-derives the real user from the verified token.
 */
export function deriveRateIdentifier(request: NextRequest): string {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return subFromJwt(auth.slice(7)) ?? 'anon';
  }

  const authCookie = request.cookies.getAll().find((c) => c.name.includes('auth-token'));
  if (authCookie?.value) {
    return subFromJwt(authCookie.value) ?? 'anon';
  }

  return ipFallback(request);
}

function subFromJwt(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    // base64url → base64 so `atob` (the only base64 decoder available on the Edge
    // runtime) handles real Supabase tokens, which are base64url-encoded.
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

function ipFallback(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
