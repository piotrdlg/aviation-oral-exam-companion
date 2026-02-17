import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { checkRateLimit, getRateLimitConfig } from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limiting for API routes (Task 41)
  if (pathname.startsWith('/api/')) {
    const config = getRateLimitConfig(pathname);
    if (config) {
      // Determine identifier: use user ID from auth cookie if per-user, otherwise IP
      let identifier: string;
      if (config.keyType === 'ip') {
        identifier = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown';
      } else {
        // For per-user limits, extract user ID from Supabase auth cookie.
        // We parse the cookie directly to avoid a full Supabase client instantiation
        // in the hot path. If no auth cookie, fall back to IP-based limiting.
        const authCookie = request.cookies.getAll().find(c => c.name.includes('auth-token'));
        if (authCookie?.value) {
          try {
            // The Supabase auth cookie contains a base64-encoded JWT.
            // Extract the `sub` (user ID) from the JWT payload without full verification
            // (verification happens later in the route handler).
            const parts = authCookie.value.split('.');
            if (parts.length >= 2) {
              const payload = JSON.parse(atob(parts[1]));
              identifier = payload.sub || 'anon';
            } else {
              identifier = 'anon';
            }
          } catch {
            identifier = 'anon';
          }
        } else {
          // Fallback to IP for unauthenticated requests to user-limited routes
          identifier = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';
        }
      }

      const result = checkRateLimit(pathname, identifier);
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'rate_limited', message: 'Too many requests. Please try again shortly.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
              'X-RateLimit-Limit': String(result.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
            },
          }
        );
      }
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
