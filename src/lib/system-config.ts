import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Simple key-value map of system config rows.
 * Each key maps to a JSON object from the system_config table.
 * This is the runtime type used by kill-switch and other consumers.
 */
export type SystemConfigMap = Record<string, Record<string, unknown>>;

/**
 * Fetch all system config from DB. Called once per API request.
 * No in-memory cache — serverless Lambda instances don't share memory.
 */
export async function getSystemConfig(
  serviceSupabase: SupabaseClient
): Promise<SystemConfigMap> {
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
  return config;
}
