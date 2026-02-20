#!/usr/bin/env npx tsx
/**
 * env-doctor.ts — Read-only diagnostic for environment configuration.
 *
 * Prints the detected app environment, DB environment marker,
 * Supabase project reference, and feature flag state.
 * Does NOT write anything. Safe to run against any environment.
 *
 * Usage: npm run env:doctor
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAppEnv, getDbEnvName } from '../../src/lib/app-env';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('╔══════════════════════════════════════════╗');
console.log('║          HeyDPE  Env Doctor              ║');
console.log('╚══════════════════════════════════════════╝\n');

// 1. App environment
const appEnv = getAppEnv();
console.log(`App Environment:  ${appEnv}`);
console.log(`  NEXT_PUBLIC_APP_ENV = ${process.env.NEXT_PUBLIC_APP_ENV || '(not set)'}`);
console.log(`  VERCEL_ENV          = ${process.env.VERCEL_ENV || '(not set)'}`);

// 2. Supabase connection
if (!supabaseUrl || !serviceRoleKey) {
  console.log('\n⚠  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.log('   Cannot check DB environment marker.');
  process.exit(0);
}

// Extract project ref from URL
const refMatch = supabaseUrl.match(/https:\/\/([a-z]+)\.supabase\.co/);
const projectRef = refMatch ? refMatch[1] : '(unknown)';
console.log(`\nSupabase Project:  ${projectRef}`);
console.log(`  URL: ${supabaseUrl}`);

async function main() {
  const supabase = createClient(supabaseUrl!, serviceRoleKey!);

  // 3. DB environment marker
  const { data: configRows, error } = await supabase
    .from('system_config')
    .select('key, value');

  if (error) {
    console.log(`\n⚠  Could not read system_config: ${error.message}`);
    return;
  }

  const configMap: Record<string, Record<string, unknown>> = {};
  for (const row of configRows || []) {
    configMap[row.key] = row.value as Record<string, unknown>;
  }

  const dbEnv = getDbEnvName(configMap);
  console.log(`\nDB Environment:   ${dbEnv ?? '(not set)'}`);

  // 4. Match check
  if (dbEnv === null) {
    console.log('  ⚠  system_config[\'app.environment\'] is not set in this database.');
  } else if (dbEnv === appEnv) {
    console.log('  ✓  App env matches DB env.');
  } else {
    console.log(`  ✗  MISMATCH: App env is "${appEnv}" but DB says "${dbEnv}".`);
  }

  // 5. Feature flags
  const flagKeys = Object.keys(configMap).filter(
    (k) => k.startsWith('kill_switch.') || k.startsWith('rag.') || k.startsWith('tts.')
  );
  if (flagKeys.length > 0) {
    console.log('\nFeature Flags / Kill Switches:');
    for (const key of flagKeys.sort()) {
      const val = configMap[key];
      const summary = JSON.stringify(val).slice(0, 80);
      console.log(`  ${key} = ${summary}`);
    }
  }

  // 6. Total config count
  console.log(`\nTotal system_config entries: ${(configRows || []).length}`);
  console.log('\nDone. (read-only — no data was modified)');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
