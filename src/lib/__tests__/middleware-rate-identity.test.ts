import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { deriveRateIdentifier } from '../rate-identity';

// Build a JWT-shaped string `header.payload.sig` (base64url payload, as real
// Supabase tokens are). Only the payload is read; signature is irrelevant here.
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

function req(init: { bearer?: string; cookie?: string; ip?: string }): NextRequest {
  const headers = new Headers();
  if (init.bearer) headers.set('authorization', `Bearer ${init.bearer}`);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.ip) headers.set('x-forwarded-for', init.ip);
  return new NextRequest('https://app.test/api/exam', { headers });
}

describe('deriveRateIdentifier', () => {
  it('keys off the Bearer JWT sub (native clients behind one NAT get separate buckets)', () => {
    expect(deriveRateIdentifier(req({ bearer: jwt({ sub: 'A' }) }))).toBe('A');
    expect(deriveRateIdentifier(req({ bearer: jwt({ sub: 'B' }) }))).toBe('B');
  });

  it('returns "anon" for a malformed or sub-less Bearer token', () => {
    expect(deriveRateIdentifier(req({ bearer: 'not-a-jwt' }))).toBe('anon');
    expect(deriveRateIdentifier(req({ bearer: jwt({ no_sub: true }) }))).toBe('anon');
  });

  it('keys off the Supabase auth cookie sub (web, unchanged)', () => {
    const cookie = `sb-pvuiwwqsumoqjepukjhz-auth-token=${jwt({ sub: 'C' })}`;
    expect(deriveRateIdentifier(req({ cookie }))).toBe('C');
  });

  it('prefers the Bearer token over a cookie when both are present', () => {
    const cookie = `sb-x-auth-token=${jwt({ sub: 'cookie-user' })}`;
    expect(
      deriveRateIdentifier(req({ bearer: jwt({ sub: 'bearer-user' }), cookie }))
    ).toBe('bearer-user');
  });

  it('falls back to the client IP when neither bearer nor cookie is present', () => {
    expect(deriveRateIdentifier(req({ ip: '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('falls back to "unknown" when there is no identity signal at all', () => {
    expect(deriveRateIdentifier(req({}))).toBe('unknown');
  });
});
