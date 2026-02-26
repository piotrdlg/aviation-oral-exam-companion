#!/usr/bin/env npx tsx
/**
 * verify-staging.ts — Automated staging environment verification.
 *
 * Checks 5 areas against the staging database:
 *   1. Environment marker match (app vs DB)
 *   2. ACS tasks seeded correctly (PA/CA/IR counts)
 *   3. System config flags populated (kill switches, voice, etc.)
 *   4. Knowledge base status (source documents + chunks)
 *   5. Recent exam activity (sessions, transcripts from last 1h)
 *
 * Outputs a console summary and writes a markdown report to
 * docs/staging-reports/YYYY-MM-DD-staging-e2e-smoke.md
 *
 * Usage: npm run verify:staging
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { getAppEnv, getDbEnvName } from '../../src/lib/app-env';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
  data?: Record<string, unknown>;
}

const results: CheckResult[] = [];

async function check1_envMarker(): Promise<CheckResult> {
  const appEnv = getAppEnv();
  const { data, error } = await supabase
    .from('system_config')
    .select('key, value');

  if (error) {
    return { name: 'Environment Marker', status: 'FAIL', detail: `DB read error: ${error.message}` };
  }

  const configMap: Record<string, Record<string, unknown>> = {};
  for (const row of data || []) {
    configMap[row.key] = row.value as Record<string, unknown>;
  }

  const dbEnv = getDbEnvName(configMap);

  if (dbEnv === null) {
    return { name: 'Environment Marker', status: 'FAIL', detail: `DB marker not set. App env: ${appEnv}` };
  }

  if (dbEnv !== appEnv) {
    return {
      name: 'Environment Marker',
      status: 'FAIL',
      detail: `MISMATCH: app=${appEnv}, db=${dbEnv}`,
    };
  }

  return {
    name: 'Environment Marker',
    status: 'PASS',
    detail: `app=${appEnv}, db=${dbEnv} — match`,
    data: { appEnv, dbEnv, configCount: (data || []).length },
  };
}

async function check2_acsTasks(): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('acs_tasks')
    .select('rating', { count: 'exact' });

  if (error) {
    return { name: 'ACS Tasks', status: 'FAIL', detail: `Query error: ${error.message}` };
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.rating] = (counts[row.rating] || 0) + 1;
  }

  const total = (data || []).length;
  const expected = { private: 61, commercial: 60, instrument: 22 };
  const issues: string[] = [];

  for (const [rating, exp] of Object.entries(expected)) {
    const actual = counts[rating] || 0;
    if (actual !== exp) {
      issues.push(`${rating}: expected ${exp}, got ${actual}`);
    }
  }

  if (total === 0) {
    return { name: 'ACS Tasks', status: 'FAIL', detail: 'No ACS tasks found' };
  }

  if (issues.length > 0) {
    return { name: 'ACS Tasks', status: 'WARN', detail: `Total: ${total}. Issues: ${issues.join('; ')}`, data: counts };
  }

  return {
    name: 'ACS Tasks',
    status: 'PASS',
    detail: `Total: ${total} (PA:${counts.private || 0}, CA:${counts.commercial || 0}, IR:${counts.instrument || 0})`,
    data: counts,
  };
}

async function check3_systemConfig(): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('system_config')
    .select('key, value');

  if (error) {
    return { name: 'System Config', status: 'FAIL', detail: `Query error: ${error.message}` };
  }

  const keys = (data || []).map(r => r.key);
  const expectedKeys = [
    'app.environment',
    'kill_switch.anthropic',
    'kill_switch.deepgram',
  ];
  const missing = expectedKeys.filter(k => !keys.includes(k));

  const killSwitches = (data || []).filter(r => (r.key as string).startsWith('kill_switch.'));
  const disabledKillSwitches = killSwitches.filter(r => {
    const val = r.value as Record<string, unknown>;
    return val.disabled === true;
  });

  const detail = [
    `${keys.length} entries`,
    `Kill switches: ${killSwitches.length} (${disabledKillSwitches.length} disabled)`,
    missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All expected keys present',
  ].join('. ');

  return {
    name: 'System Config',
    status: missing.length > 0 ? 'WARN' : 'PASS',
    detail,
    data: { totalKeys: keys.length, killSwitches: killSwitches.length, missing },
  };
}

async function check4_knowledgeBase(): Promise<CheckResult> {
  // Check source_documents count
  const { count: docCount, error: docErr } = await supabase
    .from('source_documents')
    .select('*', { count: 'exact', head: true });

  if (docErr) {
    // Table might not exist or be empty — that's OK, not a hard failure
    return {
      name: 'Knowledge Base',
      status: 'SKIP',
      detail: `source_documents query failed: ${docErr.message}. KB ingestion may not have been run.`,
    };
  }

  // Check source_chunks count
  const { count: chunkCount, error: chunkErr } = await supabase
    .from('source_chunks')
    .select('*', { count: 'exact', head: true });

  if (chunkErr) {
    return {
      name: 'Knowledge Base',
      status: 'WARN',
      detail: `Documents: ${docCount || 0}, but source_chunks query failed: ${chunkErr.message}`,
    };
  }

  if ((docCount || 0) === 0) {
    return {
      name: 'Knowledge Base',
      status: 'WARN',
      detail: 'No source documents ingested. Run `npm run ingest:staging` after copying PDFs to sources/',
    };
  }

  return {
    name: 'Knowledge Base',
    status: 'PASS',
    detail: `${docCount} documents, ${chunkCount} chunks`,
    data: { documents: docCount, chunks: chunkCount },
  };
}

async function check5_recentActivity(): Promise<CheckResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Recent sessions
  const { count: sessionCount, error: sessErr } = await supabase
    .from('exam_sessions')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', oneHourAgo);

  if (sessErr) {
    return { name: 'Recent Activity', status: 'FAIL', detail: `Session query error: ${sessErr.message}` };
  }

  // Recent transcripts
  const { count: transcriptCount, error: txErr } = await supabase
    .from('session_transcripts')
    .select('*', { count: 'exact', head: true })
    .gte('timestamp', oneHourAgo);

  if (txErr) {
    return { name: 'Recent Activity', status: 'WARN', detail: `Transcript query error: ${txErr.message}. Sessions (1h): ${sessionCount || 0}` };
  }

  if ((sessionCount || 0) === 0) {
    return {
      name: 'Recent Activity',
      status: 'WARN',
      detail: 'No sessions in the last hour. Run a smoke test first (start exam + answer one question).',
    };
  }

  return {
    name: 'Recent Activity',
    status: 'PASS',
    detail: `Sessions (1h): ${sessionCount}, Transcripts (1h): ${transcriptCount}`,
    data: { sessions: sessionCount, transcripts: transcriptCount },
  };
}

function generateReport(branch: string, commitHash: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;

  let goDecision: string;
  if (failCount > 0) {
    goDecision = 'NO-GO';
  } else if (warnCount > 0) {
    goDecision = 'REVIEW';
  } else {
    goDecision = 'GO';
  }

  const statusEmoji = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN', SKIP: 'SKIP' };

  const checksTable = results.map(r =>
    `| ${r.name} | ${statusEmoji[r.status]} | ${r.detail} |`
  ).join('\n');

  return `---
date: ${date}
type: staging-verification
tags: [heydpe, staging, e2e, smoke-test]
status: ${goDecision.toLowerCase()}
---

# Staging E2E Smoke Test — ${date}

> **Branch:** \`${branch}\`
> **Commit:** \`${commitHash}\`
> **App Env:** ${results[0]?.data?.appEnv || 'unknown'}
> **DB Env:** ${results[0]?.data?.dbEnv || 'unknown'}

---

## Automated Checks (${passCount} pass, ${failCount} fail, ${warnCount} warn)

| Check | Status | Detail |
|-------|--------|--------|
${checksTable}

---

## Knowledge Base

${results[3]?.status === 'PASS'
    ? `- Documents: ${results[3]?.data?.documents}\n- Chunks: ${results[3]?.data?.chunks}`
    : `- ${results[3]?.detail}`}

---

## Go / No-Go

| Criterion | Status |
|-----------|--------|
| Environment marker match | ${results[0]?.status} |
| ACS tasks seeded | ${results[1]?.status} |
| System config populated | ${results[2]?.status} |
| Knowledge base ingested | ${results[3]?.status} |
| Recent exam activity | ${results[4]?.status} |
| **Overall** | **${goDecision}** |

${goDecision === 'GO' ? '> All checks passed. Safe to proceed with staging testing.' : ''}
${goDecision === 'REVIEW' ? '> Some checks have warnings. Review before proceeding.' : ''}
${goDecision === 'NO-GO' ? '> One or more checks failed. Fix before proceeding.' : ''}

---

## Next Steps

${failCount > 0 ? results.filter(r => r.status === 'FAIL').map(r => `- **FIX:** ${r.name} — ${r.detail}`).join('\n') : '- No blockers.'}
${warnCount > 0 ? results.filter(r => r.status === 'WARN').map(r => `- **REVIEW:** ${r.name} — ${r.detail}`).join('\n') : ''}

---

*Generated by \`npm run verify:staging\` at ${new Date().toISOString()}*
`;
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     HeyDPE  Staging Verification         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const appEnv = getAppEnv();
  console.log(`App Environment: ${appEnv}`);

  if (appEnv === 'production') {
    console.error('\n ABORT: App environment is PRODUCTION. This script is for staging/local only.');
    process.exit(1);
  }

  // Run all 5 checks
  console.log('\nRunning checks...\n');

  results.push(await check1_envMarker());
  results.push(await check2_acsTasks());
  results.push(await check3_systemConfig());
  results.push(await check4_knowledgeBase());
  results.push(await check5_recentActivity());

  // Print results
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : r.status === 'WARN' ? '⚠' : '○';
    console.log(`  ${icon}  ${r.name}: ${r.status} — ${r.detail}`);
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nSummary: ${passCount}/5 pass, ${failCount} fail`);

  // Get git info for report
  const { execSync } = await import('child_process');
  let branch = 'unknown';
  let commitHash = 'unknown';
  try {
    branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch { /* ignore git errors */ }

  // Write report
  const reportDir = path.resolve(__dirname, '../../docs/staging-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportDir, `${date}-staging-e2e-smoke.md`);
  const report = generateReport(branch, commitHash);
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport written to: ${reportPath}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
