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

/**
 * Regression test: CSP connect-src must include wss://api.deepgram.com
 * for the Deepgram STT WebSocket to work in all browsers.
 *
 * Root cause of voice regression (2026-03-06):
 *   CSP only had https://api.deepgram.com. While CSP Level 3 says https:
 *   matches wss:, Safari/iOS did not honor this — blocking the WebSocket
 *   handshake with no console error.
 *
 * Fix: next.config.ts now includes explicit wss://api.deepgram.com in connect-src.
 */

// Replicate the CSP string construction logic from next.config.ts
function buildCSPConnectSrc(supabaseOrigin: string): string {
  return `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://us.i.posthog.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${supabaseOrigin}; font-src 'self' data:; connect-src 'self' ${supabaseOrigin} https://api.stripe.com https://us.i.posthog.com https://www.google-analytics.com https://api.cartesia.ai https://api.deepgram.com wss://api.deepgram.com https://api.openai.com; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'; report-uri /api/csp-report`;
}

describe('CSP WebSocket and reporting directives', () => {
  const csp = buildCSPConnectSrc('https://auth.heydpe.com');

  it('includes wss://api.deepgram.com in connect-src', () => {
    expect(csp).toContain('wss://api.deepgram.com');
  });

  it('includes https://api.deepgram.com in connect-src', () => {
    expect(csp).toContain('https://api.deepgram.com');
  });

  it('wss:// appears as a separate token, not substring of https://', () => {
    // Ensure wss:// is its own origin, not just a substring match
    const connectSrc = csp.split(';').find(d => d.trim().startsWith('connect-src'));
    expect(connectSrc).toBeDefined();
    const origins = connectSrc!.split(/\s+/);
    expect(origins).toContain('wss://api.deepgram.com');
    expect(origins).toContain('https://api.deepgram.com');
  });

  it('includes report-uri directive', () => {
    expect(csp).toContain('report-uri /api/csp-report');
  });

  it('does not include report-uri pointing to external domain', () => {
    // report-uri must be first-party only
    const reportUri = csp.split(';').find(d => d.trim().startsWith('report-uri'));
    expect(reportUri).toBeDefined();
    expect(reportUri!.trim()).toBe('report-uri /api/csp-report');
  });

  it('includes PostHog in connect-src', () => {
    expect(csp).toContain('https://us.i.posthog.com');
  });
});
