import type { SupabaseClient } from '@supabase/supabase-js';
import { TtlCache } from './ttl-cache';

/**
 * Simple key-value map of system config rows.
 * Each key maps to a JSON object from the system_config table.
 * This is the runtime type used by kill-switch and other consumers.
 */
export type SystemConfigMap = Record<string, Record<string, unknown>>;

/**
 * Module-level TTL cache for system config.
 * Warm serverless invocations reuse the cached config (saves a DB round-trip).
 * Cold starts begin with an empty cache and fetch from DB.
 * TTL: 60 seconds — a good balance between freshness and latency savings.
 */
const configCache = new TtlCache<SystemConfigMap>(60_000);
const CACHE_KEY = '__all__';

/**
 * Fetch all system config from DB, with a 60s in-memory cache.
 * Called once per API request — warm invocations hit the cache.
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
