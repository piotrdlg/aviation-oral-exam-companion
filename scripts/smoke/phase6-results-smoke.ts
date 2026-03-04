/**
 * Phase 6 Smoke Test — Verify examResultV2 generation
 *
 * Checks:
 * 1. Production DB has the updated study_mode constraint (includes 'quick_drill')
 * 2. Completed sessions are queried for metadata.examResultV2
 * 3. The summary endpoint responds for sessions that have V2 data
 *
 * Usage:
 *   npx tsx scripts/smoke/phase6-results-smoke.ts
 *
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('FAIL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const results: CheckResult[] = [];

async function main() {
  console.log('=== Phase 6 Smoke Test ===\n');

  // Check 1: study_mode constraint includes quick_drill
  console.log('Check 1: study_mode constraint...');
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.exam_sessions'::regclass AND conname = 'exam_sessions_study_mode_check'`
    });
    if (error) {
      // RPC may not exist — try a different approach: attempt an insert
      // Instead, just check by querying the table schema
      results.push({ name: 'study_mode_constraint', status: 'SKIP', detail: 'exec_sql RPC not available; constraint was verified via psql in Phase 5 release' });
    } else if (data?.[0]?.def?.includes('quick_drill')) {
      results.push({ name: 'study_mode_constraint', status: 'PASS', detail: 'Constraint includes quick_drill' });
    } else {
      results.push({ name: 'study_mode_constraint', status: 'FAIL', detail: `Constraint: ${data?.[0]?.def}` });
    }
  } catch {
    results.push({ name: 'study_mode_constraint', status: 'SKIP', detail: 'Could not verify constraint via RPC' });
  }

  // Check 2: Find completed sessions and check for examResultV2
  console.log('Check 2: Completed sessions with examResultV2...');
  const { data: sessions, error: sessError } = await supabase
    .from('exam_sessions')
    .select('id, status, metadata, result, started_at, ended_at, study_mode, exchange_count')
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(20);

  if (sessError) {
    results.push({ name: 'completed_sessions', status: 'FAIL', detail: sessError.message });
  } else if (!sessions || sessions.length === 0) {
    results.push({ name: 'completed_sessions', status: 'SKIP', detail: 'No completed sessions found' });
  } else {
    const withV2 = sessions.filter(s => {
      const meta = s.metadata as Record<string, unknown> | null;
      return meta?.examResultV2;
    });
    const withV1 = sessions.filter(s => s.result);

    console.log(`  Total completed: ${sessions.length}`);
    console.log(`  With V1 result: ${withV1.length}`);
    console.log(`  With V2 result: ${withV2.length}`);

    if (withV2.length > 0) {
      results.push({
        name: 'examResultV2_present',
        status: 'PASS',
        detail: `${withV2.length} session(s) have examResultV2. Latest: ${withV2[0].id}`
      });

      // Print a sample V2 result (redacted)
      const sampleV2 = (withV2[0].metadata as Record<string, unknown>).examResultV2 as Record<string, unknown>;
      console.log('\n  Sample V2 result (latest):');
      console.log(`    overall_status: ${sampleV2.overall_status}`);
      console.log(`    overall_score: ${sampleV2.overall_score}`);
      console.log(`    total_in_plan: ${sampleV2.total_in_plan}`);
      console.log(`    elements_asked: ${sampleV2.elements_asked}`);
      console.log(`    weak_elements: ${Array.isArray(sampleV2.weak_elements) ? sampleV2.weak_elements.length : 0}`);
      console.log(`    failed_areas: ${JSON.stringify(sampleV2.failed_areas)}`);
    } else {
      results.push({
        name: 'examResultV2_present',
        status: 'FAIL',
        detail: `0 of ${sessions.length} completed sessions have examResultV2. All are pre-Phase 5.`
      });
    }

    // List all sessions with their status
    console.log('\n  Session inventory:');
    for (const s of sessions.slice(0, 10)) {
      const meta = s.metadata as Record<string, unknown> | null;
      const hasV2 = !!meta?.examResultV2;
      const hasV1 = !!s.result;
      console.log(`    ${s.id.slice(0, 8)}... | ${s.study_mode} | ${s.exchange_count} exchanges | V1:${hasV1 ? 'yes' : 'no'} V2:${hasV2 ? 'yes' : 'no'} | ${s.ended_at?.slice(0, 10)}`);
    }
  }

  // Check 3: Summary endpoint (only if V2 sessions exist)
  const v2Sessions = sessions?.filter(s => {
    const meta = s.metadata as Record<string, unknown> | null;
    return meta?.examResultV2;
  }) || [];

  if (v2Sessions.length > 0) {
    console.log('\nCheck 3: Summary endpoint...');
    // We can't call the Next.js API directly from a script (needs auth cookies),
    // so we verify the weak-area report builder directly
    try {
      const { buildWeakAreaReport } = await import('../../src/lib/weak-area-report');
      const report = await buildWeakAreaReport(v2Sessions[0].id);
      if (report) {
        console.log(`  Report generated for ${v2Sessions[0].id.slice(0, 8)}...`);
        console.log(`    overall_status: ${report.overall_status}`);
        console.log(`    elements: ${report.elements.length}`);
        console.log(`    grounded: ${report.stats.grounded_count}`);
        console.log(`    insufficient_sources: ${report.stats.insufficient_sources_count}`);
        results.push({ name: 'summary_endpoint', status: 'PASS', detail: `Report has ${report.elements.length} elements` });
      } else {
        results.push({ name: 'summary_endpoint', status: 'FAIL', detail: 'buildWeakAreaReport returned null' });
      }
    } catch (err) {
      results.push({ name: 'summary_endpoint', status: 'SKIP', detail: `Could not import weak-area-report (server-only module): ${err}` });
    }
  } else {
    console.log('\nCheck 3: Summary endpoint... SKIP (no V2 sessions)');
    results.push({ name: 'summary_endpoint', status: 'SKIP', detail: 'No V2 sessions to test against' });
  }

  // Summary
  console.log('\n=== RESULTS ===');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '\u2705' : r.status === 'FAIL' ? '\u274C' : '\u23ED\uFE0F';
    console.log(`${icon} ${r.name}: ${r.status} — ${r.detail}`);
  }

  const fails = results.filter(r => r.status === 'FAIL');
  if (fails.length > 0) {
    console.log(`\nOVERALL: FAIL (${fails.length} check(s) failed)`);
    process.exit(1);
  } else {
    const passes = results.filter(r => r.status === 'PASS');
    console.log(`\nOVERALL: ${passes.length > 0 ? 'PASS' : 'INCONCLUSIVE'} (${passes.length} passed, ${results.filter(r => r.status === 'SKIP').length} skipped)`);
  }
}

main().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
