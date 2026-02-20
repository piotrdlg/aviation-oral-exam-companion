/**
 * Application environment detection and safety guardrails.
 *
 * Determines the current environment from env vars and provides
 * guards to prevent accidental production writes from scripts.
 */

export type AppEnv = 'local' | 'staging' | 'production';

/**
 * Determine the current application environment.
 *
 * Priority:
 * 1. NEXT_PUBLIC_APP_ENV if explicitly set
 * 2. VERCEL_ENV mapping: production→production, preview→staging, development→local
 * 3. Fallback: 'local'
 */
export function getAppEnv(): AppEnv {
  const explicit = process.env.NEXT_PUBLIC_APP_ENV;
  if (explicit === 'production' || explicit === 'staging' || explicit === 'local') {
    return explicit;
  }

  const vercel = process.env.VERCEL_ENV;
  if (vercel === 'production') return 'production';
  if (vercel === 'preview') return 'staging';

  return 'local';
}

/** Returns true when running in the production environment. */
export function isProduction(): boolean {
  return getAppEnv() === 'production';
}

/**
 * Throws if the current app env is production and `allow` is not true.
 *
 * Use this at the top of any script or code path that should never
 * run against production by default.
 *
 * @param actionName — human-readable label for the error message
 * @param opts.allow — set to true to suppress the guard (escape hatch)
 */
export function assertNotProduction(
  actionName: string,
  opts?: { allow?: boolean },
): void {
  if (opts?.allow) return;
  if (isProduction()) {
    throw new Error(
      `BLOCKED: "${actionName}" cannot run against production.\n` +
        `  App env: production (from ${describeEnvSource()})\n` +
        `  Set NEXT_PUBLIC_APP_ENV=staging or NEXT_PUBLIC_APP_ENV=local to proceed.\n` +
        `  To force (dangerous): set ALLOW_PROD_WRITE=1`,
    );
  }
}

// ---------------------------------------------------------------------------
// DB environment signature
// ---------------------------------------------------------------------------

/**
 * Read the environment name stored in system_config['app.environment'].
 * Returns null if the key is missing or the value has no 'name' field.
 */
export function getDbEnvName(
  systemConfig: Record<string, Record<string, unknown>>,
): string | null {
  const entry = systemConfig['app.environment'];
  if (!entry || typeof entry.name !== 'string') return null;
  return entry.name;
}

/**
 * Assert that the DB-stored environment matches the app environment.
 * Throws on mismatch. Warns (but does not throw) if the DB key is missing.
 */
export function assertDbEnvMatchesAppEnv(opts: {
  appEnv: AppEnv;
  dbEnv: string | null;
  actionName: string;
}): void {
  const { appEnv, dbEnv, actionName } = opts;

  if (dbEnv === null) {
    console.warn(
      `⚠  system_config['app.environment'] is not set in this database.\n` +
        `   Recommended: INSERT INTO system_config (key, value) VALUES ` +
        `('app.environment', '{"name":"${appEnv}"}');\n`,
    );
    return;
  }

  if (dbEnv !== appEnv) {
    throw new Error(
      `ENVIRONMENT MISMATCH: "${actionName}" detected a mismatch.\n` +
        `  App env (process): ${appEnv}\n` +
        `  DB env (system_config): ${dbEnv}\n` +
        `  This usually means your .env.local points to the wrong Supabase project.\n` +
        `  Fix: update your env vars to match the target environment.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function describeEnvSource(): string {
  if (process.env.NEXT_PUBLIC_APP_ENV) return 'NEXT_PUBLIC_APP_ENV';
  if (process.env.VERCEL_ENV) return `VERCEL_ENV=${process.env.VERCEL_ENV}`;
  return 'default fallback';
}
