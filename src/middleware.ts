import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { checkRateLimit, getRateLimitConfig } from '@/lib/rate-limit';
import { deriveRateIdentifier } from '@/lib/rate-identity';

export async function middleware(request: NextRequest) {
  // E2E test bypass: skip Supabase auth so Playwright can mock APIs client-side.
  // Only active when: (1) PLAYWRIGHT_TEST=1 AND (2) NOT in production environment
  // Prevents accidental bypass if env var leaks to production.
  const isProductionEnv = process.env.NEXT_PUBLIC_APP_ENV === 'production'
    || process.env.VERCEL_ENV === 'production';
  if (process.env.PLAYWRIGHT_TEST === '1' && !isProductionEnv) {
    return NextResponse.next({ request });
  }

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
        // Per-user limits: derive identity from the Bearer JWT (native clients) or
        // the Supabase auth cookie (web), falling back to IP. Decode-only — the
        // route handler's getUser() is the trust boundary (see lib/rate-identity.ts).
        // This is what gives mobile users behind one carrier NAT independent buckets
        // instead of sharing a single per-IP STT 4/min limit.
        identifier = deriveRateIdentifier(request);
      }

      const result = await checkRateLimit(pathname, identifier);
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
