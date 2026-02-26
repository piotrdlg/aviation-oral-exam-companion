#!/usr/bin/env npx tsx
/**
 * READ-ONLY Database Snapshot Tool
 *
 * Collects system_config, schema info, row counts, RPC presence,
 * and latency stats from a Supabase database WITHOUT writing anything.
 *
 * Usage:
 *   npx tsx scripts/audit/db-snapshot.ts --env prod
 *   npx tsx scripts/audit/db-snapshot.ts --env staging
 *
 * Outputs:
 *   docs/system-audit/production-audit/artifacts/{env}-snapshot.json
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ============================================================
// SAFETY: This script contains NO .insert(), .update(), .delete(),
// or write-capable RPC calls. It is READ-ONLY by construction.
// ============================================================

console.log('╔══════════════════════════════════════════╗');
console.log('║      READ-ONLY DATABASE SNAPSHOT         ║');
console.log('║  No data will be modified in any table.   ║');
console.log('╚══════════════════════════════════════════╝');

const envArg = process.argv.find(a => a.startsWith('--env='))?.split('=')[1]
  || process.argv[process.argv.indexOf('--env') + 1]
  || 'staging';

if (!['prod', 'staging'].includes(envArg)) {
  console.error('Usage: npx tsx scripts/audit/db-snapshot.ts --env [prod|staging]');
  process.exit(1);
}

// Resolve credentials based on target environment
let supabaseUrl: string;
let supabaseKey: string;

if (envArg === 'prod') {
  supabaseUrl = process.env.PROD_SUPABASE_URL || 'https://pvuiwwqsumoqjepukjhz.supabase.co';
  supabaseKey = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseKey) {
    console.error('ERROR: PROD_SUPABASE_SERVICE_ROLE_KEY env var is required for prod snapshot.');
    console.error('Set it or run with: PROD_SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/audit/db-snapshot.ts --env prod');
    process.exit(1);
  }
} else {
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for staging.');
    process.exit(1);
  }
}

console.log(`\nTarget: ${envArg}`);
console.log(`URL: ${supabaseUrl}`);
console.log(`Project ref: ${supabaseUrl.match(/https:\/\/(\w+)\./)?.[1] || 'unknown'}\n`);

const supabase = createClient(supabaseUrl, supabaseKey);

interface SnapshotResult {
  meta: {
    environment: string;
    supabase_url: string;
    project_ref: string;
    snapshot_at: string;
  };
  system_config: Record<string, unknown>[];
  schema: Record<string, Array<{ column_name: string; data_type: string; is_nullable: string }>>;
  row_counts: Record<string, number | string>;
  coverage_metrics: Record<string, number | string>;
  rpc_presence: Record<string, boolean | string>;
  latency_stats: Record<string, unknown>;
  concepts_by_category: Record<string, number>;
  relations_by_type: Record<string, number>;
  errors: string[];
}

async function collectSnapshot(): Promise<SnapshotResult> {
  const errors: string[] = [];
  const result: SnapshotResult = {
    meta: {
      environment: envArg,
      supabase_url: supabaseUrl,
      project_ref: supabaseUrl.match(/https:\/\/(\w+)\./)?.[1] || 'unknown',
      snapshot_at: new Date().toISOString(),
    },
    system_config: [],
    schema: {},
    row_counts: {},
    coverage_metrics: {},
    rpc_presence: {},
    latency_stats: {},
    concepts_by_category: {},
    relations_by_type: {},
    errors: [],
  };

  // ── 1. System Config ──────────────────────────────────────
  console.log('Fetching system_config...');
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value, description, updated_at');
    if (error) {
      errors.push(`system_config: ${error.message}`);
    } else {
      result.system_config = data || [];
    }
  } catch (e) {
    errors.push(`system_config: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Schema Info (key tables) ───────────────────────────
  const keyTables = [
    'exam_sessions', 'session_transcripts', 'element_attempts',
    'prompt_versions', 'system_config', 'source_documents',
    'source_chunks', 'source_images', 'chunk_image_links',
    'embedding_cache', 'latency_logs', 'concepts',
    'concept_relations', 'concept_chunk_evidence',
    'acs_tasks', 'acs_elements', 'user_profiles',
    'usage_logs', 'transcript_citations', 'active_sessions',
    'moderation_queue', 'support_tickets',
  ];

  console.log('Fetching schema info...');
  for (const table of keyTables) {
    try {
      const { data, error } = await supabase
        .from('information_schema.columns' as any)
        .select('column_name, data_type, is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', table)
        .order('ordinal_position' as any);

      // Fallback: use raw SQL via RPC if information_schema isn't accessible via PostgREST
      if (error) {
        // information_schema not exposed — note this
        result.schema[table] = [{ column_name: '(schema query failed)', data_type: error.message, is_nullable: '' }];
      } else {
        result.schema[table] = (data || []) as any;
      }
    } catch (e) {
      result.schema[table] = [{ column_name: '(error)', data_type: String(e), is_nullable: '' }];
    }
  }

  // ── 3. Row Counts ─────────────────────────────────────────
  console.log('Fetching row counts...');
  const countTables = [
    'source_documents', 'source_chunks', 'source_images',
    'chunk_image_links', 'embedding_cache', 'latency_logs',
    'concepts', 'concept_relations', 'concept_chunk_evidence',
    'acs_tasks', 'acs_elements', 'exam_sessions',
    'session_transcripts', 'element_attempts', 'prompt_versions',
    'user_profiles', 'usage_logs', 'transcript_citations',
    'active_sessions', 'off_graph_mentions', 'admin_users',
  ];

  for (const table of countTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        result.row_counts[table] = `ERROR: ${error.message}`;
      } else {
        result.row_counts[table] = count ?? 0;
      }
    } catch (e) {
      result.row_counts[table] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ── 4. Coverage Metrics ───────────────────────────────────
  console.log('Fetching coverage metrics...');

  // Chunks with embeddings
  try {
    const { count } = await supabase
      .from('source_chunks')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    result.coverage_metrics['chunks_with_embedding'] = count ?? 0;
  } catch { result.coverage_metrics['chunks_with_embedding'] = 'ERROR'; }

  // Chunks with page_start
  try {
    const { count } = await supabase
      .from('source_chunks')
      .select('*', { count: 'exact', head: true })
      .not('page_start', 'is', null);
    result.coverage_metrics['chunks_with_page_start'] = count ?? 0;
  } catch { result.coverage_metrics['chunks_with_page_start'] = 'ERROR'; }

  // Embedding cache reuse (last_used_at > created_at)
  try {
    const { count } = await supabase
      .from('embedding_cache')
      .select('*', { count: 'exact', head: true })
      .gt('last_used_at', 'created_at');
    result.coverage_metrics['embedding_cache_reused'] = count ?? 0;
  } catch { result.coverage_metrics['embedding_cache_reused'] = 'ERROR'; }

  // Concepts with embeddings
  try {
    const { count } = await supabase
      .from('concepts')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    result.coverage_metrics['concepts_with_embedding'] = count ?? 0;
  } catch { result.coverage_metrics['concepts_with_embedding'] = 'ERROR'; }

  // Sessions by status
  for (const status of ['active', 'completed', 'paused', 'expired', 'abandoned']) {
    try {
      const { count } = await supabase
        .from('exam_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      result.coverage_metrics[`sessions_${status}`] = count ?? 0;
    } catch { result.coverage_metrics[`sessions_${status}`] = 'ERROR'; }
  }

  // ── 5. Concepts by Category ───────────────────────────────
  console.log('Fetching concept categories...');
  try {
    const { data } = await supabase
      .from('concepts')
      .select('category');
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.category] = (counts[row.category] || 0) + 1;
      }
      result.concepts_by_category = counts;
    }
  } catch (e) {
    errors.push(`concepts_by_category: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 6. Relations by Type ──────────────────────────────────
  console.log('Fetching relation types...');
  try {
    const { data } = await supabase
      .from('concept_relations')
      .select('relation_type');
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.relation_type] = (counts[row.relation_type] || 0) + 1;
      }
      result.relations_by_type = counts;
    }
  } catch (e) {
    errors.push(`relations_by_type: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 7. RPC Presence Check ─────────────────────────────────
  console.log('Checking RPC presence...');
  const rpcsToCheck = [
    'chunk_hybrid_search',
    'get_images_for_chunks',
    'get_element_scores',
    'get_session_element_scores',
    'get_related_concepts',
    'hybrid_search',
    'get_concept_bundle',
    'get_uncovered_acs_tasks',
    'get_orphan_concepts',
  ];

  for (const rpc of rpcsToCheck) {
    try {
      // Attempt to call with obviously-wrong types — if the RPC exists,
      // we get a "type mismatch" or "no rows" error, not "function not found"
      const { error } = await supabase.rpc(rpc, {});
      if (error) {
        if (error.message.includes('Could not find the function') ||
            error.message.includes('function') && error.message.includes('does not exist')) {
          result.rpc_presence[rpc] = false;
        } else {
          // RPC exists but returned an error (expected with empty params)
          result.rpc_presence[rpc] = `exists (${error.message.slice(0, 80)})`;
        }
      } else {
        result.rpc_presence[rpc] = true;
      }
    } catch (e) {
      result.rpc_presence[rpc] = `check_error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ── 8. Latency Stats ──────────────────────────────────────
  console.log('Fetching latency stats...');
  try {
    const { data: recentLogs, count } = await supabase
      .from('latency_logs')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .limit(20);

    result.latency_stats = {
      total_count: count ?? 0,
      recent_20: (recentLogs || []).map(r => ({
        session_id: r.session_id,
        exchange_number: r.exchange_number,
        timestamp: r.timestamp,
        timings: r.timings,
      })),
    };
  } catch (e) {
    errors.push(`latency_stats: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 9. Prompt versions summary ────────────────────────────
  console.log('Fetching prompt versions...');
  try {
    const { data } = await supabase
      .from('prompt_versions')
      .select('prompt_key, status, rating, study_mode, difficulty, version')
      .order('prompt_key')
      .order('version', { ascending: false });
    result.coverage_metrics['prompt_versions_detail'] = data as any;
  } catch { /* non-critical */ }

  result.errors = errors;
  return result;
}

async function main() {
  const snapshot = await collectSnapshot();

  // Write JSON
  const artifactsDir = resolve(__dirname, '../../docs/system-audit/production-audit/artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const jsonPath = resolve(artifactsDir, `${envArg}-snapshot.json`);
  writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nJSON written to: ${jsonPath}`);

  // Write Markdown summary
  const mdLines: string[] = [];
  mdLines.push(`# ${envArg.toUpperCase()} Database Snapshot`);
  mdLines.push(`\nTaken: ${snapshot.meta.snapshot_at}`);
  mdLines.push(`Project: ${snapshot.meta.project_ref}`);
  mdLines.push('');

  mdLines.push('## System Config Flags');
  mdLines.push('| Key | Value | Description |');
  mdLines.push('|-----|-------|-------------|');
  for (const cfg of snapshot.system_config as any[]) {
    mdLines.push(`| ${cfg.key} | \`${JSON.stringify(cfg.value).slice(0, 60)}\` | ${cfg.description || ''} |`);
  }
  mdLines.push('');

  mdLines.push('## Row Counts');
  mdLines.push('| Table | Count |');
  mdLines.push('|-------|-------|');
  for (const [table, count] of Object.entries(snapshot.row_counts)) {
    mdLines.push(`| ${table} | ${count} |`);
  }
  mdLines.push('');

  mdLines.push('## Coverage Metrics');
  mdLines.push('| Metric | Value |');
  mdLines.push('|--------|-------|');
  for (const [metric, value] of Object.entries(snapshot.coverage_metrics)) {
    if (metric === 'prompt_versions_detail') continue;
    mdLines.push(`| ${metric} | ${value} |`);
  }
  mdLines.push('');

  mdLines.push('## Concepts by Category');
  mdLines.push('| Category | Count |');
  mdLines.push('|----------|-------|');
  for (const [cat, count] of Object.entries(snapshot.concepts_by_category)) {
    mdLines.push(`| ${cat} | ${count} |`);
  }
  mdLines.push('');

  mdLines.push('## Relations by Type');
  mdLines.push('| Relation Type | Count |');
  mdLines.push('|---------------|-------|');
  for (const [type, count] of Object.entries(snapshot.relations_by_type)) {
    mdLines.push(`| ${type} | ${count} |`);
  }
  mdLines.push('');

  mdLines.push('## RPC Presence');
  mdLines.push('| Function | Status |');
  mdLines.push('|----------|--------|');
  for (const [rpc, status] of Object.entries(snapshot.rpc_presence)) {
    mdLines.push(`| ${rpc} | ${status} |`);
  }
  mdLines.push('');

  if (snapshot.errors.length > 0) {
    mdLines.push('## Errors During Snapshot');
    for (const err of snapshot.errors) {
      mdLines.push(`- ${err}`);
    }
  }

  const mdPath = resolve(artifactsDir, `${envArg}-snapshot-summary.md`);
  writeFileSync(mdPath, mdLines.join('\n'));
  console.log(`Markdown written to: ${mdPath}`);
}

main().catch(err => {
  console.error('Snapshot failed:', err);
  process.exit(1);
});
