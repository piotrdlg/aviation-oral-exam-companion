#!/usr/bin/env npx tsx
/**
 * Phase 1 Staging Verification Runner
 *
 * Connects to Supabase and runs SQL verification checks from
 * docs/system-audit/09 - Staging Verification.md.
 *
 * Prints a console summary and writes a markdown report to
 * docs/staging-reports/YYYY-MM-DD-phase1-verification.md.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npx tsx scripts/staging/verify-phase1.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '❌ Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY\n' +
      '   Create a .env.local file at the project root with both values.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  section: string;
  passed: boolean;
  summary: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Check: a) Latency logs in the last hour
// ---------------------------------------------------------------------------

async function checkLatencyLogs(sb: SupabaseClient): Promise<CheckResult> {
  const { data, error } = await sb.rpc('sql', {
    query: `SELECT count(*) AS cnt FROM latency_logs WHERE created_at > now() - interval '1 hour'`,
  }).maybeSingle();

  // If RPC "sql" doesn't exist, fall back to direct query
  if (error) {
    // Try direct query
    const { count, error: e2 } = await sb
      .from('latency_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString());

    if (e2) {
      return {
        name: 'Latency Logs (1h)',
        section: 'a',
        passed: false,
        summary: `Query error: ${e2.message}`,
        detail: `Table may not exist yet. Apply migration 20260220100001 first.`,
      };
    }

    const cnt = count ?? 0;
    return {
      name: 'Latency Logs (1h)',
      section: 'a',
      passed: cnt > 0,
      summary: `${cnt} rows in last hour`,
      detail:
        cnt > 0
          ? `Found ${cnt} latency_logs rows from the last hour.`
          : `No latency_logs rows found. Run at least one exam exchange first.`,
    };
  }

  const cnt = Number(data?.cnt ?? 0);
  return {
    name: 'Latency Logs (1h)',
    section: 'a',
    passed: cnt > 0,
    summary: `${cnt} rows in last hour`,
    detail:
      cnt > 0
        ? `Found ${cnt} latency_logs rows from the last hour.`
        : `No latency_logs rows found. Run at least one exam exchange first.`,
  };
}

// ---------------------------------------------------------------------------
// Check: b) Timing spans P50/P95
// ---------------------------------------------------------------------------

async function checkTimingSpans(sb: SupabaseClient): Promise<CheckResult> {
  // Fetch recent latency_logs with timings
  const { data, error } = await sb
    .from('latency_logs')
    .select('timings')
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
    .not('timings', 'is', null)
    .limit(100);

  if (error) {
    return {
      name: 'Timing Spans',
      section: 'b',
      passed: false,
      summary: `Query error: ${error.message}`,
      detail: `Could not read latency_logs.timings.`,
    };
  }

  if (!data || data.length === 0) {
    return {
      name: 'Timing Spans',
      section: 'b',
      passed: false,
      summary: 'No rows with timings found',
      detail:
        'No latency_logs rows with populated timings JSONB in the last hour. Run an exam exchange with the instrumented code.',
    };
  }

  // Aggregate spans across all rows
  const spanValues: Record<string, number[]> = {};
  for (const row of data) {
    const timings = row.timings as Record<string, unknown> | null;
    if (!timings) continue;
    for (const [key, val] of Object.entries(timings)) {
      const num = Number(val);
      if (!isNaN(num)) {
        if (!spanValues[key]) spanValues[key] = [];
        spanValues[key].push(num);
      }
    }
  }

  const spanNames = Object.keys(spanValues).sort();
  if (spanNames.length === 0) {
    return {
      name: 'Timing Spans',
      section: 'b',
      passed: false,
      summary: 'Timings JSONB present but no numeric spans found',
      detail: 'Rows have timings but no extractable numeric span values.',
    };
  }

  const lines: string[] = [];
  for (const span of spanNames) {
    const vals = spanValues[span].sort((a, b) => a - b);
    const p50 = percentile(vals, 0.5);
    const p95 = percentile(vals, 0.95);
    lines.push(`| ${span} | ${p50.toFixed(0)} | ${p95.toFixed(0)} | ${vals.length} |`);
  }

  const detail =
    `| Span | P50 (ms) | P95 (ms) | Samples |\n| --- | --- | --- | --- |\n` +
    lines.join('\n');

  return {
    name: 'Timing Spans',
    section: 'b',
    passed: true,
    summary: `${spanNames.length} span(s) found across ${data.length} row(s)`,
    detail,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---------------------------------------------------------------------------
// Check: c) Embedding Cache Stats
// ---------------------------------------------------------------------------

async function checkEmbeddingCache(sb: SupabaseClient): Promise<CheckResult> {
  const { count, error } = await sb
    .from('embedding_cache')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return {
      name: 'Embedding Cache',
      section: 'c',
      passed: false,
      summary: `Query error: ${error.message}`,
      detail: `Table may not exist yet. Apply migration 20260220100001 first.`,
    };
  }

  const total = count ?? 0;

  // Check reuse rate
  const { data: reuse, error: e2 } = await sb
    .from('embedding_cache')
    .select('created_at, last_used_at');

  let reused = 0;
  if (!e2 && reuse) {
    for (const row of reuse) {
      const created = new Date(row.created_at).getTime();
      const lastUsed = new Date(row.last_used_at).getTime();
      if (lastUsed > created + 1000) reused++;
    }
  }

  const reuseRate = total > 0 ? ((reused / total) * 100).toFixed(1) : '0.0';

  return {
    name: 'Embedding Cache',
    section: 'c',
    passed: total > 0,
    summary: `${total} cached embeddings, ${reuseRate}% reuse rate`,
    detail:
      `Total cached: ${total}\n` +
      `Reused (last_used_at > created_at + 1s): ${reused}\n` +
      `Reuse rate: ${reuseRate}%`,
  };
}

// ---------------------------------------------------------------------------
// Check: d) ACS Graph
// ---------------------------------------------------------------------------

async function checkAcsGraph(sb: SupabaseClient): Promise<CheckResult> {
  // Count concepts by category
  const categories = ['acs_area', 'acs_task', 'acs_element'];
  const counts: Record<string, number> = {};

  for (const cat of categories) {
    const { count, error } = await sb
      .from('concepts')
      .select('*', { count: 'exact', head: true })
      .eq('category', cat);

    if (error) {
      return {
        name: 'ACS Graph',
        section: 'd',
        passed: false,
        summary: `Query error on concepts: ${error.message}`,
        detail: `Failed to query concepts table for category ${cat}.`,
      };
    }
    counts[cat] = count ?? 0;
  }

  // Count relations
  const { data: relData, error: relErr } = await sb
    .from('concept_relations')
    .select('relation_type');

  if (relErr) {
    return {
      name: 'ACS Graph',
      section: 'd',
      passed: false,
      summary: `Query error on concept_relations: ${relErr.message}`,
      detail: `Failed to query concept_relations table.`,
    };
  }

  const relCounts: Record<string, number> = {};
  if (relData) {
    for (const row of relData) {
      relCounts[row.relation_type] = (relCounts[row.relation_type] || 0) + 1;
    }
  }

  const totalConcepts = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalRelations = Object.values(relCounts).reduce((a, b) => a + b, 0);
  const passed = totalConcepts > 0 && totalRelations > 0;

  const conceptLines = categories
    .map((c) => `| ${c} | ${counts[c]} |`)
    .join('\n');
  const relLines = Object.entries(relCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([r, c]) => `| ${r} | ${c} |`)
    .join('\n');

  const detail =
    `**Concepts:**\n| Category | Count |\n| --- | --- |\n${conceptLines}\n\n` +
    `**Relations:**\n| Type | Count |\n| --- | --- |\n${relLines || '| (none) | 0 |'}`;

  return {
    name: 'ACS Graph',
    section: 'd',
    passed,
    summary: `${totalConcepts} concepts, ${totalRelations} relations`,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Check: e) Metadata filter flag status
// ---------------------------------------------------------------------------

async function checkMetadataFilterFlag(sb: SupabaseClient): Promise<CheckResult> {
  const { data, error } = await sb
    .from('system_config')
    .select('key, value')
    .eq('key', 'rag.metadata_filter')
    .maybeSingle();

  if (error) {
    return {
      name: 'Metadata Filter Flag',
      section: 'e',
      passed: true, // absence is fine; default is OFF
      summary: `Query error: ${error.message}`,
      detail: `Could not read system_config. Table may not exist.`,
    };
  }

  if (!data) {
    return {
      name: 'Metadata Filter Flag',
      section: 'e',
      passed: true,
      summary: 'Not set (default: OFF)',
      detail: 'No `rag.metadata_filter` key in system_config. Filter is OFF by default.',
    };
  }

  const val = data.value as Record<string, unknown> | null;
  const enabled = !!(val && val.enabled);
  return {
    name: 'Metadata Filter Flag',
    section: 'e',
    passed: true,
    summary: enabled ? 'ENABLED' : 'DISABLED',
    detail: `system_config['rag.metadata_filter'] = ${JSON.stringify(val)}`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`\n🔍 Phase 1 Staging Verification — ${timestamp}\n`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log('');

  const checks: CheckResult[] = [];

  const runners: Array<[string, (sb: SupabaseClient) => Promise<CheckResult>]> = [
    ['a) Latency Logs', checkLatencyLogs],
    ['b) Timing Spans', checkTimingSpans],
    ['c) Embedding Cache', checkEmbeddingCache],
    ['d) ACS Graph', checkAcsGraph],
    ['e) Metadata Filter Flag', checkMetadataFilterFlag],
  ];

  for (const [label, fn] of runners) {
    process.stdout.write(`  ${label}... `);
    try {
      const result = await fn(supabase);
      checks.push(result);
      const icon = result.passed ? '✅' : '⚠️';
      console.log(`${icon}  ${result.summary}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({
        name: label,
        section: '?',
        passed: false,
        summary: `Exception: ${msg}`,
        detail: `Unexpected error during check: ${msg}`,
      });
      console.log(`❌  Exception: ${msg}`);
    }
  }

  // Summary
  const passCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const allPassed = passCount === totalCount;

  console.log('');
  console.log('─'.repeat(50));
  console.log(
    `  Result: ${passCount}/${totalCount} checks passed  ${allPassed ? '✅ GO' : '⚠️ REVIEW REQUIRED'}`
  );
  console.log('─'.repeat(50));
  console.log('');

  // Write markdown report
  const date = new Date().toISOString().slice(0, 10);
  const reportDir = path.resolve(__dirname, '../../docs/staging-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${date}-phase1-verification.md`);

  const md = buildMarkdownReport(timestamp, checks, passCount, totalCount);
  fs.writeFileSync(reportPath, md, 'utf-8');
  console.log(`  📝 Report written to: ${reportPath}`);
  console.log('');

  process.exit(allPassed ? 0 : 1);
}

function buildMarkdownReport(
  timestamp: string,
  checks: CheckResult[],
  passCount: number,
  totalCount: number
): string {
  const date = timestamp.slice(0, 10);
  const allPassed = passCount === totalCount;

  let md = `---
date: ${date}
type: staging-verification
tags: [aviation-oral-exam, staging, phase1, verification]
status: ${allPassed ? 'pass' : 'review'}
---

# Phase 1 Staging Verification — ${date}

> Auto-generated by \`scripts/staging/verify-phase1.ts\` at ${timestamp}
>
> Supabase: \`${SUPABASE_URL}\`

---

## Summary

| Check | Status | Result |
| --- | --- | --- |
`;

  for (const c of checks) {
    const icon = c.passed ? 'PASS' : 'WARN';
    md += `| ${c.section}) ${c.name} | ${icon} | ${c.summary} |\n`;
  }

  md += `\n**Overall: ${passCount}/${totalCount} — ${allPassed ? 'GO' : 'REVIEW REQUIRED'}**\n\n---\n\n`;

  // Detail sections
  for (const c of checks) {
    md += `## ${c.section}) ${c.name}\n\n${c.detail}\n\n---\n\n`;
  }

  // Migrations checklist
  md += `## Migrations Checklist

- [ ] \`20260220100001_embedding_cache_and_latency_timings.sql\` applied
- [ ] \`20260220100002_acs_skeleton_graph.sql\` applied

## Metadata Filter Test

- [ ] Enable: \`INSERT INTO system_config (key, value) VALUES ('rag.metadata_filter', '{"enabled": true}') ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';\`
- [ ] Verify \`rag.filters.infer\` span in timings
- [ ] CFR question → \`rag.search.filtered\` span present
- [ ] Generic question → no \`rag.search.filtered\` span
- [ ] Disable: \`UPDATE system_config SET value = '{"enabled": false}' WHERE key = 'rag.metadata_filter';\`

## Go / No-Go

| Criterion | Status |
| --- | --- |
| Latency logs populated | ${checks[0]?.passed ? 'GO' : 'NO-GO'} |
| Timing spans present | ${checks[1]?.passed ? 'GO' : 'NO-GO'} |
| Embedding cache active | ${checks[2]?.passed ? 'GO' : 'NO-GO'} |
| ACS graph populated | ${checks[3]?.passed ? 'GO' : 'NO-GO'} |
| Metadata filter flag | ${checks[4]?.passed ? 'GO' : 'N/A'} |
| **Overall** | **${allPassed ? 'GO' : 'NO-GO'}** |

---

## Notes / Anomalies

_Add observations here after manual review._

---

*Generated by verify-phase1.ts — see [[09 - Staging Verification]] for full checklist*
`;

  return md;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
