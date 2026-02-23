#!/usr/bin/env npx tsx
/**
 * latency-benchmark.ts — Multi-run A/B latency comparison between staging and production.
 *
 * Hits /api/bench on both environments with Bearer token auth.
 * Collects N samples per environment, computes p50/p95/mean/stdev.
 *
 * Usage:
 *   npx tsx scripts/staging/latency-benchmark.ts [--runs 5] [--answers 1] [--json out.json]
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeStepStats, formatMs, generateMarkdownReport, type StepStats } from './bench-stats';

const NUM_RUNS = (() => {
  const idx = process.argv.indexOf('--runs');
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 5;
})();

const NUM_ANSWERS = (() => {
  const idx = process.argv.indexOf('--answers');
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 1;
})();

const JSON_OUT = (() => {
  const idx = process.argv.indexOf('--json');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const STUDENT_ANSWERS = [
  "The four forces acting on an airplane in flight are lift, weight, thrust, and drag. Lift opposes weight and thrust opposes drag.",
  "Angle of attack is the angle between the chord line of the wing and the relative wind. It's different from pitch attitude because pitch is measured relative to the horizon.",
  "A stall occurs when the critical angle of attack is exceeded, typically around 18 degrees for most airfoils. The boundary layer separates from the upper surface of the wing.",
];

interface EnvConfig {
  name: string;
  appUrl: string;
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
}

const STAGING: EnvConfig = {
  name: 'STAGING',
  appUrl: 'http://localhost:3000',
  supabaseUrl: 'https://curpdzczzawpnniaujgq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cnBkemN6emF3cG5uaWF1amdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjAwMjEsImV4cCI6MjA4NzEzNjAyMX0.EzFcB-FO_ZflZ77Kd9HxyrnpZg_axyofH8WUAmBxefQ',
  email: 'bench2@heydpe.com',
  password: 'Bench2Test2026x',
};

const PRODUCTION: EnvConfig = {
  name: 'PRODUCTION',
  appUrl: 'https://aviation-oral-exam-companion.vercel.app',
  supabaseUrl: 'https://pvuiwwqsumoqjepukjhz.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWl3d3FzdW1vcWplcHVramh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzY0ODAsImV4cCI6MjA4NjYxMjQ4MH0.Xwxt2EVC8aiAiLBJZzx87gCjIOgiHLwM_EQFUBuNbx4',
  email: 'bench2@heydpe.com',
  password: 'Bench2Test2026x',
};

interface BenchTiming {
  step: string;
  ms: number;
}

interface BenchResult {
  timings: BenchTiming[];
  totalMs: number;
  sessionId?: string;
  error?: string;
}

async function getAccessToken(env: EnvConfig): Promise<string> {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': env.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: env.email, password: env.password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Auth failed for ${env.name}: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function runBench(env: EnvConfig, token: string): Promise<BenchResult> {
  const answers = STUDENT_ANSWERS.slice(0, NUM_ANSWERS);

  const res = await fetch(`${env.appUrl}/api/bench`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ answers }),
    signal: AbortSignal.timeout(180_000),
  });

  const data = await res.json();

  if (!res.ok) {
    return { timings: data.timings || [], totalMs: 0, error: data.error };
  }

  return {
    timings: data.timings,
    totalMs: data.totalMs,
    sessionId: data.sessionId,
  };
}

function collectStepSamples(results: BenchResult[]): Map<string, number[]> {
  const samples = new Map<string, number[]>();
  for (const result of results) {
    if (result.error) continue;
    for (const t of result.timings) {
      if (!samples.has(t.step)) samples.set(t.step, []);
      samples.get(t.step)!.push(t.ms);
    }
    // Add TOTAL pseudo-step
    if (!samples.has('TOTAL')) samples.set('TOTAL', []);
    samples.get('TOTAL')!.push(result.totalMs);
  }
  return samples;
}

function samplesToStats(samples: Map<string, number[]>): StepStats[] {
  const stats: StepStats[] = [];
  for (const [step, values] of samples) {
    stats.push(computeStepStats(step, values));
  }
  return stats;
}

async function main() {
  const commandUsed = `npx tsx scripts/staging/latency-benchmark.ts --runs ${NUM_RUNS} --answers ${NUM_ANSWERS}${JSON_OUT ? ` --json ${JSON_OUT}` : ''}`;

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║   HeyDPE Latency Benchmark — Multi-Run Comparison   ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
  console.log(`  Runs: ${NUM_RUNS} | Answers per run: ${NUM_ANSWERS}\n`);

  // Warm up check
  try {
    await fetch(`${STAGING.appUrl}`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`ERROR: Local dev server not running at ${STAGING.appUrl}`);
    console.error(`Start it with: npm run dev`);
    process.exit(1);
  }

  // Authenticate
  console.log(`  Authenticating...`);
  let stagingToken: string;
  let prodToken: string;
  try {
    stagingToken = await getAccessToken(STAGING);
    console.log(`    ✓ Staging token`);
  } catch (err) {
    console.error(`    ✗ Staging auth failed:`, err);
    process.exit(1);
  }
  try {
    prodToken = await getAccessToken(PRODUCTION);
    console.log(`    ✓ Production token`);
  } catch (err) {
    console.error(`    ✗ Production auth failed:`, err);
    process.exit(1);
  }

  // Collect samples
  const stagingResults: BenchResult[] = [];
  const prodResults: BenchResult[] = [];

  for (let i = 0; i < NUM_RUNS; i++) {
    // Alternate: staging then production each round (reduces ordering bias)
    console.log(`\n  Run ${i + 1}/${NUM_RUNS}:`);

    console.log(`    ▶ Staging...`);
    const sResult = await runBench(STAGING, stagingToken);
    stagingResults.push(sResult);
    if (sResult.error) {
      console.log(`      ✗ Error: ${sResult.error}`);
    } else {
      console.log(`      ✓ ${formatMs(sResult.totalMs)}`);
    }

    console.log(`    ▶ Production...`);
    const pResult = await runBench(PRODUCTION, prodToken);
    prodResults.push(pResult);
    if (pResult.error) {
      console.log(`      ✗ Error: ${pResult.error}`);
    } else {
      console.log(`      ✓ ${formatMs(pResult.totalMs)}`);
    }
  }

  // Compute stats
  const stagingSamples = collectStepSamples(stagingResults);
  const prodSamples = collectStepSamples(prodResults);
  const stagingStats = samplesToStats(stagingSamples);
  const prodStats = samplesToStats(prodSamples);

  const successfulStaging = stagingResults.filter((r) => !r.error).length;
  const successfulProd = prodResults.filter((r) => !r.error).length;

  // Print stats table
  const allSteps = [...new Set([...stagingStats.map((s) => s.step), ...prodStats.map((s) => s.step)])];

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  Results: ${successfulStaging}/${NUM_RUNS} staging OK, ${successfulProd}/${NUM_RUNS} production OK`);
  console.log(`${'═'.repeat(90)}`);
  console.log(`  ${'Step'.padEnd(22)} ${'STG p50'.padStart(9)} ${'STG p95'.padStart(9)} ${'PRD p50'.padStart(9)} ${'PRD p95'.padStart(9)} ${'Delta p50'.padStart(10)}  Winner`);
  console.log(`${'─'.repeat(90)}`);

  for (const step of allSteps) {
    const s = stagingStats.find((x) => x.step === step);
    const p = prodStats.find((x) => x.step === step);

    const sp50 = s ? formatMs(s.p50).padStart(9) : '       —';
    const sp95 = s ? formatMs(s.p95).padStart(9) : '       —';
    const pp50 = p ? formatMs(p.p50).padStart(9) : '       —';
    const pp95 = p ? formatMs(p.p95).padStart(9) : '       —';

    let delta = '         —';
    let winner = '';
    if (s && p) {
      const diff = s.p50 - p.p50;
      delta = (diff > 0 ? '+' : '-') + formatMs(Math.abs(diff));
      delta = delta.padStart(10);
      winner = diff < 0 ? '← STG' : diff > 0 ? 'PRD →' : 'TIE';
    }

    const name = step === 'TOTAL' ? '▸ TOTAL' : step;
    console.log(`  ${name.padEnd(22)} ${sp50} ${sp95} ${pp50} ${pp95} ${delta}  ${winner}`);
  }
  console.log(`${'═'.repeat(90)}\n`);

  // Print errors if any
  const allErrors = [
    ...stagingResults.filter((r) => r.error).map((r) => `STAGING: ${r.error}`),
    ...prodResults.filter((r) => r.error).map((r) => `PRODUCTION: ${r.error}`),
  ];
  if (allErrors.length > 0) {
    console.log(`⚠ Errors (${allErrors.length}):`);
    allErrors.forEach((e) => console.log(`  ${e}`));
    console.log('');
  }

  console.log(`Notes:`);
  console.log(`  • Staging: localhost app → staging Supabase (remote) → Anthropic API`);
  console.log(`  • Production: Vercel edge → production Supabase (remote) → Anthropic API`);
  console.log(`  • Claude API calls dominate. DB ops are <500ms.`);
  console.log(`  • p50 = median, p95 = tail latency.\n`);

  // Write JSON if requested
  if (JSON_OUT) {
    const jsonData = {
      date: new Date().toISOString(),
      runs: NUM_RUNS,
      answers: NUM_ANSWERS,
      staging: { results: stagingResults, stats: stagingStats },
      production: { results: prodResults, stats: prodStats },
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(jsonData, null, 2));
    console.log(`  Raw data written to ${JSON_OUT}\n`);
  }

  // Write markdown report
  const today = new Date().toISOString().slice(0, 10);
  const reportDir = path.resolve(__dirname, '../../docs/staging-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${today}-latency-benchmark.md`);

  const markdown = generateMarkdownReport({
    date: today,
    command: commandUsed,
    runs: NUM_RUNS,
    answers: NUM_ANSWERS,
    stagingStats,
    prodStats,
  });
  fs.writeFileSync(reportPath, markdown);
  console.log(`  Markdown report written to ${reportPath}\n`);
}

main().catch(console.error);
