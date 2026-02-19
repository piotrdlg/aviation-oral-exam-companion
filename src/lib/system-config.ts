import type { SupabaseClient } from '@supabase/supabase-js';
import { TtlCache } from './ttl-cache';

/**
 * Simple key-value map of system config rows.
 * Each key maps to a JSON object from the system_config table.
 * This is the runtime type used by kill-switch and other consumers.
 */
export type SystemConfigMap = Record<string, Record<string, unknown>>;

// Module-level cache: warm Lambda invocations reuse cached config for up to 60 s.
// Cold starts begin empty; correctness never depends on a hit.
const configCache = new TtlCache<SystemConfigMap>(60_000);
const CACHE_KEY = 'system_config';

/**
 * Fetch all system config from DB. Uses a 60 s in-memory TTL cache
 * so repeated calls within the same warm invocation skip the DB round-trip.
 */
export async function getSystemConfig(
  serviceSupabase: SupabaseClient
): Promise<SystemConfigMap> {
  const cached = configCache.get(CACHE_KEY);
  if (cached) return cached;

  const { data, error } = await serviceSupabase
    .from('system_config')
    .select('key, value');

  if (error || !data) {
    console.warn('Failed to fetch system config, returning empty (fail-open for config)');
    return {};
  }

  const config: SystemConfigMap = {};
  for (const row of data) {
    config[row.key] = row.value as Record<string, unknown>;
  }
  configCache.set(CACHE_KEY, config);
  return config;
}
