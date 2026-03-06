import { describe, it, expect } from 'vitest';

/**
 * Regression test: CSP must include the Supabase origin from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Root cause of admin-nav regression (2026-03-06):
 *   Production NEXT_PUBLIC_SUPABASE_URL was changed to custom domain (auth.heydpe.com)
 *   but CSP connect-src was hardcoded to pvuiwwqsumoqjepukjhz.supabase.co.
 *   This caused all client-side Supabase fetch() calls to be blocked by CSP,
 *   silently breaking the admin check (and email OTP login) in production.
 *
 * Fix: next.config.ts now derives the CSP Supabase origin dynamically from the env var.
 */

// Replicate the CSP origin derivation logic from next.config.ts
function deriveSupabaseOrigin(envUrl: string | undefined): string {
  const supabaseUrl = (envUrl ?? '').trim();
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : '';
  } catch {
    return '';
  }
}

describe('CSP Supabase origin derivation', () => {
  it('extracts origin from standard supabase.co URL', () => {
    expect(deriveSupabaseOrigin('https://pvuiwwqsumoqjepukjhz.supabase.co'))
      .toBe('https://pvuiwwqsumoqjepukjhz.supabase.co');
  });

  it('extracts origin from custom domain (regression case)', () => {
    expect(deriveSupabaseOrigin('https://auth.heydpe.com'))
      .toBe('https://auth.heydpe.com');
  });

  it('trims trailing whitespace/newlines from env var', () => {
    expect(deriveSupabaseOrigin('https://auth.heydpe.com\n'))
      .toBe('https://auth.heydpe.com');
    expect(deriveSupabaseOrigin('  https://auth.heydpe.com  '))
      .toBe('https://auth.heydpe.com');
  });

  it('returns empty string for undefined/empty', () => {
    expect(deriveSupabaseOrigin(undefined)).toBe('');
    expect(deriveSupabaseOrigin('')).toBe('');
  });

  it('returns empty string for invalid URL', () => {
    expect(deriveSupabaseOrigin('not-a-url')).toBe('');
  });

  it('strips path from URL (origin only)', () => {
    expect(deriveSupabaseOrigin('https://auth.heydpe.com/rest/v1/'))
      .toBe('https://auth.heydpe.com');
  });

  it('handles port in URL', () => {
    expect(deriveSupabaseOrigin('http://localhost:54321'))
      .toBe('http://localhost:54321');
  });
});
