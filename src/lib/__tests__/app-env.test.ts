import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getAppEnv,
  isProduction,
  assertNotProduction,
  getDbEnvName,
  assertDbEnvMatchesAppEnv,
  requireSafeDbTarget,
} from '../app-env';

// Save originals so we can restore after each test
const origEnv = { ...process.env };

afterEach(() => {
  process.env = { ...origEnv };
});

// ---------------------------------------------------------------------------
// getAppEnv
// ---------------------------------------------------------------------------

describe('getAppEnv', () => {
  it('returns "local" when no env vars are set', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    expect(getAppEnv()).toBe('local');
  });

  it('returns NEXT_PUBLIC_APP_ENV when explicitly set to staging', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    process.env.VERCEL_ENV = 'production'; // should be overridden
    expect(getAppEnv()).toBe('staging');
  });

  it('returns NEXT_PUBLIC_APP_ENV when set to production', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    expect(getAppEnv()).toBe('production');
  });

  it('returns NEXT_PUBLIC_APP_ENV when set to local', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    expect(getAppEnv()).toBe('local');
  });

  it('ignores invalid NEXT_PUBLIC_APP_ENV and falls through to VERCEL_ENV', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'banana';
    process.env.VERCEL_ENV = 'preview';
    expect(getAppEnv()).toBe('staging');
  });

  it('maps VERCEL_ENV=production to production', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    process.env.VERCEL_ENV = 'production';
    expect(getAppEnv()).toBe('production');
  });

  it('maps VERCEL_ENV=preview to staging', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    process.env.VERCEL_ENV = 'preview';
    expect(getAppEnv()).toBe('staging');
  });

  it('maps VERCEL_ENV=development to local', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    process.env.VERCEL_ENV = 'development';
    expect(getAppEnv()).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// isProduction
// ---------------------------------------------------------------------------

describe('isProduction', () => {
  it('returns true when app env is production', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    expect(isProduction()).toBe(true);
  });

  it('returns false when app env is staging', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    expect(isProduction()).toBe(false);
  });

  it('returns false when app env is local', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    expect(isProduction()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertNotProduction
// ---------------------------------------------------------------------------

describe('assertNotProduction', () => {
  it('does not throw in local env', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    expect(() => assertNotProduction('test action')).not.toThrow();
  });

  it('does not throw in staging env', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    expect(() => assertNotProduction('test action')).not.toThrow();
  });

  it('throws in production env', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    expect(() => assertNotProduction('ingest data')).toThrowError(
      /BLOCKED.*ingest data.*cannot run against production/,
    );
  });

  it('does not throw in production when allow is true', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    expect(() =>
      assertNotProduction('ingest data', { allow: true }),
    ).not.toThrow();
  });

  it('includes env source in error message', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    try {
      assertNotProduction('seed data');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('NEXT_PUBLIC_APP_ENV');
    }
  });
});

// ---------------------------------------------------------------------------
// getDbEnvName
// ---------------------------------------------------------------------------

describe('getDbEnvName', () => {
  it('returns the name from app.environment config', () => {
    const config = { 'app.environment': { name: 'staging' } };
    expect(getDbEnvName(config)).toBe('staging');
  });

  it('returns null when key is missing', () => {
    expect(getDbEnvName({})).toBeNull();
  });

  it('returns null when name field is missing', () => {
    const config = { 'app.environment': { foo: 'bar' } };
    expect(getDbEnvName(config)).toBeNull();
  });

  it('returns null when name is not a string', () => {
    const config = { 'app.environment': { name: 42 } };
    expect(getDbEnvName(config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// assertDbEnvMatchesAppEnv
// ---------------------------------------------------------------------------

describe('assertDbEnvMatchesAppEnv', () => {
  it('does not throw when envs match', () => {
    expect(() =>
      assertDbEnvMatchesAppEnv({
        appEnv: 'staging',
        dbEnv: 'staging',
        actionName: 'test',
      }),
    ).not.toThrow();
  });

  it('throws on mismatch', () => {
    expect(() =>
      assertDbEnvMatchesAppEnv({
        appEnv: 'staging',
        dbEnv: 'production',
        actionName: 'verify staging',
      }),
    ).toThrowError(/ENVIRONMENT MISMATCH.*verify staging/);
  });

  it('warns but does not throw when dbEnv is null', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertDbEnvMatchesAppEnv({
        appEnv: 'staging',
        dbEnv: null,
        actionName: 'test',
      }),
    ).not.toThrow();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('app.environment'),
    );
    spy.mockRestore();
  });

  it('includes both env values in mismatch error', () => {
    try {
      assertDbEnvMatchesAppEnv({
        appEnv: 'local',
        dbEnv: 'production',
        actionName: 'ingest',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('local');
      expect(msg).toContain('production');
    }
  });
});

// ---------------------------------------------------------------------------
// requireSafeDbTarget
// ---------------------------------------------------------------------------

describe('requireSafeDbTarget', () => {
  // Helper to build a config with the given DB env name
  const cfg = (name: string) => ({ 'app.environment': { name } });
  const empty = {};

  // --- Staging (non-production) ---
  it('staging + staging marker → ok', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    expect(() => requireSafeDbTarget(cfg('staging'), 'test')).not.toThrow();
  });

  it('staging + production marker → throws', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    expect(() => requireSafeDbTarget(cfg('production'), 'test')).toThrowError(
      /DB_TARGET_UNSAFE/,
    );
  });

  it('staging + missing marker → throws', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    expect(() => requireSafeDbTarget(empty, 'test')).toThrowError(
      /DB_TARGET_UNSAFE/,
    );
  });

  // --- Local (non-production) ---
  it('local + local marker → ok', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    expect(() => requireSafeDbTarget(cfg('local'), 'test')).not.toThrow();
  });

  it('local + production marker → throws', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    expect(() => requireSafeDbTarget(cfg('production'), 'test')).toThrowError(
      /DB_TARGET_UNSAFE/,
    );
  });

  it('local + missing marker → throws', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    expect(() => requireSafeDbTarget(empty, 'test')).toThrowError(
      /DB_TARGET_UNSAFE/,
    );
  });

  // --- Production (lenient) ---
  it('production + production marker → ok', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    expect(() =>
      requireSafeDbTarget(cfg('production'), 'test'),
    ).not.toThrow();
  });

  it('production + missing marker → does NOT throw', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    expect(() => requireSafeDbTarget(empty, 'test')).not.toThrow();
  });

  it('production + staging marker → warns but does NOT throw', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => requireSafeDbTarget(cfg('staging'), 'test')).not.toThrow();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('DB env mismatch'),
    );
    spy.mockRestore();
  });

  it('includes action name in error', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    try {
      requireSafeDbTarget(empty, 'exam-api');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('exam-api');
    }
  });

  it('error message contains no secrets (keys, URLs)', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    try {
      requireSafeDbTarget(cfg('production'), 'exam-api');
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('supabase.co');
      expect(msg).not.toContain('service_role');
      expect(msg).not.toContain('anon_key');
    }
  });
});
