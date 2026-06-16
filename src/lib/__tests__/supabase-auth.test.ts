import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// server-only throws outside an RSC/route context.
vi.mock('server-only', () => ({}));

// Bearer path: the module-scoped service-role client (from @supabase/supabase-js).
const getUserBearer = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserBearer } })),
}));

// Cookie path: the SSR client from src/lib/supabase/server.
const getUserCookie = vi.fn();
const getSessionCookie = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserCookie, getSession: getSessionCookie },
  })),
}));

import { getAuthedUser } from '@/lib/supabase/auth';

const USER = { id: 'user-123', email: 'pilot@example.com' };

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://app.test/api/exam', { headers: new Headers(headers) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAuthedUser', () => {
  it('authenticates a valid Bearer token (native client, no cookies)', async () => {
    getUserBearer.mockResolvedValue({ data: { user: USER }, error: null });
    const authed = await getAuthedUser(req({ authorization: 'Bearer good-jwt' }));
    expect(authed).toEqual({ user: USER, accessToken: 'good-jwt', transport: 'bearer' });
    expect(getUserBearer).toHaveBeenCalledWith('good-jwt');
  });

  it('returns null for a malformed/expired Bearer token', async () => {
    getUserBearer.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    expect(await getAuthedUser(req({ authorization: 'Bearer bad' }))).toBeNull();
  });

  it('falls back to the cookie session and returns its access_token (web, unchanged)', async () => {
    getSessionCookie.mockResolvedValue({ data: { session: { access_token: 'cookie-jwt' } } });
    getUserCookie.mockResolvedValue({ data: { user: USER } });
    const authed = await getAuthedUser(req()); // no Authorization header
    expect(authed).toEqual({ user: USER, accessToken: 'cookie-jwt', transport: 'cookie' });
    expect(getUserBearer).not.toHaveBeenCalled(); // bearer branch fully skipped
  });

  it('returns null when neither transport yields a verified user', async () => {
    getSessionCookie.mockResolvedValue({ data: { session: null } });
    getUserCookie.mockResolvedValue({ data: { user: null } });
    expect(await getAuthedUser(req())).toBeNull();
  });
});
