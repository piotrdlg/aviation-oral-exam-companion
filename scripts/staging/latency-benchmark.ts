#!/usr/bin/env npx tsx
/**
 * latency-benchmark.ts — A/B latency comparison between staging and production.
 *
 * Hits /api/bench on both environments with Bearer token auth.
 * Each call runs: session create → planner init → Claude question → assess + followup → cleanup.
 *
 * Usage:
 *   npx tsx scripts/staging/latency-benchmark.ts [--answers 1]
 */

const NUM_ANSWERS = (() => {
  const idx = process.argv.indexOf('--answers');
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 1;
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

  const start = performance.now();
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
  const wallMs = Math.round(performance.now() - start);

  if (!res.ok) {
    return { timings: data.timings || [], totalMs: wallMs, error: data.error };
  }

  return {
    timings: data.timings,
    totalMs: data.totalMs,
    sessionId: data.sessionId,
  };
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   HeyDPE Latency Benchmark — Staging vs Prod    ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
  console.log(`Answers per run: ${NUM_ANSWERS}\n`);

  // Warm up check — is localhost running?
  try {
    await fetch(`${STAGING.appUrl}`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`ERROR: Local dev server not running at ${STAGING.appUrl}`);
    console.error(`Start it with: npm run dev`);
    process.exit(1);
  }

  // Get tokens for both environments
  console.log(`  Authenticating...`);
  let stagingToken: string;
  let prodToken: string;
  try {
    stagingToken = await getAccessToken(STAGING);
    console.log(`    ✓ Staging token obtained`);
  } catch (err) {
    console.error(`    ✗ Staging auth failed:`, err);
    process.exit(1);
  }
  try {
    prodToken = await getAccessToken(PRODUCTION);
    console.log(`    ✓ Production token obtained`);
  } catch (err) {
    console.error(`    ✗ Production auth failed:`, err);
    process.exit(1);
  }

  // Run staging
  console.log(`\n▶ Running STAGING benchmark...`);
  const stagingResult = await runBench(STAGING, stagingToken);
  if (stagingResult.error) {
    console.log(`  ✗ Error: ${stagingResult.error}`);
  } else {
    console.log(`  ✓ Done in ${formatMs(stagingResult.totalMs)}`);
  }

  // Run production
  console.log(`▶ Running PRODUCTION benchmark...`);
  const prodResult = await runBench(PRODUCTION, prodToken);
  if (prodResult.error) {
    console.log(`  ✗ Error: ${prodResult.error}`);
  } else {
    console.log(`  ✓ Done in ${formatMs(prodResult.totalMs)}`);
  }

  // Build comparison table
  const allSteps = new Set([
    ...stagingResult.timings.map((t) => t.step),
    ...prodResult.timings.map((t) => t.step),
  ]);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${'Step'.padEnd(22)} ${'Staging'.padStart(10)} ${'Prod'.padStart(10)} ${'Delta'.padStart(10)}  Winner`);
  console.log(`${'─'.repeat(70)}`);

  for (const step of allSteps) {
    const s = stagingResult.timings.find((t) => t.step === step);
    const p = prodResult.timings.find((t) => t.step === step);

    const sMs = s?.ms ?? -1;
    const pMs = p?.ms ?? -1;

    const sStr = sMs >= 0 ? formatMs(sMs) : '—';
    const pStr = pMs >= 0 ? formatMs(pMs) : '—';

    let delta = '';
    let winner = '';
    if (sMs >= 0 && pMs >= 0) {
      const diff = sMs - pMs;
      delta = diff > 0 ? `+${formatMs(diff)}` : `-${formatMs(Math.abs(diff))}`;
      winner = diff < 0 ? '← STG' : diff > 0 ? 'PRD →' : 'TIE';
    }

    console.log(`  ${step.padEnd(22)} ${sStr.padStart(10)} ${pStr.padStart(10)} ${delta.padStart(10)}  ${winner}`);
  }

  const sTotal = stagingResult.totalMs;
  const pTotal = prodResult.totalMs;
  const totalDiff = sTotal - pTotal;

  console.log(`${'─'.repeat(70)}`);
  console.log(`  ${'TOTAL (server-side)'.padEnd(22)} ${formatMs(sTotal).padStart(10)} ${formatMs(pTotal).padStart(10)} ${(totalDiff > 0 ? '+' : '-') + formatMs(Math.abs(totalDiff))}`.padStart(10) + `  ${totalDiff < 0 ? '← STG' : totalDiff > 0 ? 'PRD →' : 'TIE'}`);
  console.log(`${'─'.repeat(70)}\n`);

  // Print errors if any
  if (stagingResult.error || prodResult.error) {
    console.log(`⚠ Errors:`);
    if (stagingResult.error) console.log(`  STAGING: ${stagingResult.error}`);
    if (prodResult.error) console.log(`  PRODUCTION: ${prodResult.error}`);
    console.log('');
  }

  console.log(`Notes:`);
  console.log(`  • Staging: localhost app → staging Supabase (remote) → same Anthropic API`);
  console.log(`  • Production: Vercel edge → production Supabase (remote) → same Anthropic API`);
  console.log(`  • "TOTAL" is server-side time (excludes network latency to app)`);
  console.log(`  • Claude API calls dominate. DB ops are <300ms.`);
  console.log(`  • Run multiple times for consistent results.\n`);
}

main().catch(console.error);
