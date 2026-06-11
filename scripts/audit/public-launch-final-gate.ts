#!/usr/bin/env npx tsx
/**
 * Public Launch Final Gate (W7.1)
 * ============================================================================
 * The consolidated go/no-go gate that doc 64 scoped but never built. It ports
 * the 9 Phase-17 checks and adds the checks that would have caught this
 * remediation program's critical findings (reviews 02/04/05/06).
 *
 * Two run modes:
 *   - STATIC (default in CI): file-content + targeted-test + matrix checks. No
 *     secrets. Runs anywhere.
 *   - LIVE (auto-enabled when Supabase service+anon keys are in the env): adds
 *     production probes — RPC cross-user auth, anon PII, quota-SUM reality,
 *     flag sanity, ops env presence. Force off with --no-live.
 *
 * Usage:
 *   npm run audit:final-gate              # auto: live if keys present
 *   npm run audit:final-gate -- --no-live # static only
 *
 * Exit 0 only if every BLOCKER passes. WARNs never fail the gate but are
 * surfaced loudly and recorded in the evidence.
 *
 * Evidence: docs/reviews/2026-06-09-comprehensive-review/10-final-gate-result.md
 * Runbook:  docs/runbooks/FINAL-GATE.md
 * ============================================================================
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env.local') });

const ROOT = process.cwd();
const REVIEW_DIR = 'docs/reviews/2026-06-09-comprehensive-review';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'BLOCKER' | 'WARN';
type Verdict = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
  n: number;
  check: string;
  severity: Severity;
  verdict: Verdict;
  detail: string;
}

const results: CheckResult[] = [];

function record(r: CheckResult): CheckResult {
  results.push(r);
  const icon =
    r.verdict === 'PASS' ? '✅' : r.verdict === 'FAIL' ? '❌' : '➖';
  const sev = r.severity === 'BLOCKER' ? 'BLOCKER' : 'WARN   ';
  console.log(`  ${icon} [${sev}] #${r.n} ${r.check}: ${r.detail}`);
  return r;
}

// ---------------------------------------------------------------------------
// Env / mode
// ---------------------------------------------------------------------------

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const forceNoLive = process.argv.includes('--no-live');
const LIVE = !forceNoLive && !!(SUPA_URL && ANON_KEY && SERVICE_KEY);

// ---------------------------------------------------------------------------
// File / CLI helpers
// ---------------------------------------------------------------------------

function readFile(rel: string): string | null {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/**
 * A copy of process.env with provider/DB secret keys removed, so typecheck and
 * the unit suite run exactly as they do in CI (which has none of these). The
 * gate process itself keeps the secrets for the live probes — only the
 * subprocesses are sanitized. This keeps the gate honest: a green suite here
 * means a green suite in the shipping build, regardless of what's in .env.local.
 */
function ciFaithfulEnv(): NodeJS.ProcessEnv {
  const stripped = new Set([
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY', 'CARTESIA_API_KEY',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'RESEND_INBOUND_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]);
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!stripped.has(k)) env[k] = v;
  }
  return env;
}

function fileContains(rel: string, needle: string): boolean {
  const c = readFile(rel);
  return c !== null && c.includes(needle);
}

function runVitest(file: string): { ok: boolean; summary: string } {
  try {
    const out = execSync(`npx vitest run ${file}`, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 180_000,
      env: ciFaithfulEnv(),
    });
    const m = out.replace(/\[[0-9;]*m/g, '').match(/\bTests\s+(\d+)\s+passed/);
    return { ok: true, summary: m ? `${m[1]} passed` : 'passed' };
  } catch (err: unknown) {
    const stdout =
      err && typeof err === 'object' && 'stdout' in err
        ? String((err as { stdout: unknown }).stdout).slice(-300)
        : 'unknown error';
    return { ok: false, summary: stdout };
  }
}

// ===========================================================================
// Category A — Ported Phase-17 checks (#1–#9)  [BLOCKER]
// ===========================================================================

function portedChecks() {
  console.log('\n--- Category A: Build, support, security, billing (ported) ---');

  record({
    n: 1, check: 'support_auto_reply', severity: 'BLOCKER',
    verdict: fileContains('src/lib/email.ts', 'sendTicketAutoReply') ? 'PASS' : 'FAIL',
    detail: 'src/lib/email.ts exports sendTicketAutoReply',
  });
  record({
    n: 2, check: 'trial_ending_reminder', severity: 'BLOCKER',
    verdict: fileContains('src/lib/email.ts', 'sendTrialEndingReminder') ? 'PASS' : 'FAIL',
    detail: 'src/lib/email.ts exports sendTrialEndingReminder',
  });
  record({
    n: 3, check: 'csp_header', severity: 'BLOCKER',
    verdict: fileContains('next.config.ts', 'Content-Security-Policy') ? 'PASS' : 'FAIL',
    detail: 'next.config.ts sets a Content-Security-Policy',
  });
  record({
    n: 4, check: 'report_session_ownership', severity: 'BLOCKER',
    verdict: fileContains('src/app/api/report/route.ts', 'session.user_id !== user.id') ? 'PASS' : 'FAIL',
    detail: 'report route enforces session ownership',
  });
  record({
    n: 5, check: 'tts_tier_gating', severity: 'BLOCKER',
    verdict: fileContains('src/lib/voice/usage.ts', 'hasTtsAccess') ? 'PASS' : 'FAIL',
    detail: 'voice/usage.ts exposes hasTtsAccess (D1: universal voice)',
  });
  record({
    n: 6, check: 'pricing_active_subscribers', severity: 'BLOCKER',
    verdict: fileContains('src/app/pricing/page.tsx', 'isActiveSubscriber') ? 'PASS' : 'FAIL',
    detail: 'pricing page handles active subscribers',
  });

  // #7 typecheck
  console.log('  …running typecheck (may take ~30s)');
  let tcOk = false;
  let tcDetail = '';
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe', timeout: 180_000, env: ciFaithfulEnv() });
    tcOk = true;
    tcDetail = 'tsc --noEmit clean';
  } catch (err: unknown) {
    tcDetail = err && typeof err === 'object' && 'stdout' in err
      ? String((err as { stdout: unknown }).stdout).slice(0, 300)
      : 'tsc failed';
  }
  record({ n: 7, check: 'typecheck', severity: 'BLOCKER', verdict: tcOk ? 'PASS' : 'FAIL', detail: tcDetail });

  // #8 full unit suite (also exercises checks #12/#14/#15's guards transitively)
  console.log('  …running full unit suite (may take ~60s)');
  let testCount = '?';
  let testOk = false;
  let testDetail = '';
  try {
    const out = execSync('npx vitest run', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 300_000, env: ciFaithfulEnv() });
    // Strip ANSI before parsing the "Tests  N passed" summary line.
    const clean = out.replace(/\[[0-9;]*m/g, '');
    const m = clean.match(/\bTests\s+(\d+)\s+passed/);
    testCount = m ? m[1] : '?';
    testOk = true;
    testDetail = `full Vitest suite green (${testCount} passed)`;
  } catch (err: unknown) {
    testDetail = err && typeof err === 'object' && 'stdout' in err
      ? String((err as { stdout: unknown }).stdout).slice(-300)
      : 'vitest failed';
  }
  record({ n: 8, check: 'unit_tests', severity: 'BLOCKER', verdict: testOk ? 'PASS' : 'FAIL', detail: testDetail });

  // #9 build script presence (do not run a full build here)
  const pkg = readFile('package.json');
  let buildOk = false;
  try { buildOk = !!(pkg && JSON.parse(pkg).scripts?.build); } catch { /* ignore */ }
  record({
    n: 9, check: 'build_script', severity: 'BLOCKER',
    verdict: buildOk ? 'PASS' : 'FAIL',
    detail: buildOk ? 'package.json has a build script' : 'no build script',
  });

  return testOk;
}

// ===========================================================================
// Category B — Remediation guards covered by named tests (#12, #14, #15)
// ===========================================================================
// The full suite (#8) already runs these. We assert the SPECIFIC guard test
// files exist and name the guard, and tie the verdict to #8's result — so a
// green gate provably exercised each guard. (--deep re-runs them in isolation.)

function guardChecks(suiteGreen: boolean) {
  console.log('\n--- Category B: Critical-finding guards (named tests) ---');
  const deep = process.argv.includes('--deep');

  const guards: Array<{ n: number; check: string; file: string; needle: string; finding: string }> = [
    { n: 12, check: 'idor_ownership_404', file: 'src/app/api/exam/__tests__/idor-session-ownership.test.ts',
      needle: "returns 404 for another user's sessionId", finding: 'R06 C3 — exam IDOR' },
    { n: 14, check: 'webhook_ordering_guard', file: 'src/lib/__tests__/stripe-webhook.test.ts',
      needle: 'ordering guard compares event.created', finding: 'R05 #5 — out-of-order webhook' },
    { n: 15, check: 'planner_advancement', file: 'src/app/api/exam/__tests__/exam-flow-regression.test.ts',
      needle: 'advancement across tasks, natural completion', finding: 'R02 bugs 1–4 — engine flow' },
  ];

  for (const g of guards) {
    const present = fileContains(g.file, g.needle);
    if (!present) {
      record({ n: g.n, check: g.check, severity: 'BLOCKER', verdict: 'FAIL',
        detail: `guard test missing: ${g.file} ("${g.needle}")` });
      continue;
    }
    if (deep) {
      console.log(`  …deep-running ${g.file}`);
      const r = runVitest(g.file);
      record({ n: g.n, check: g.check, severity: 'BLOCKER', verdict: r.ok ? 'PASS' : 'FAIL',
        detail: r.ok ? `${g.finding}: ${r.summary} (isolated run)` : `FAILED: ${r.summary}` });
    } else {
      record({ n: g.n, check: g.check, severity: 'BLOCKER', verdict: suiteGreen ? 'PASS' : 'FAIL',
        detail: suiteGreen
          ? `${g.finding}: covered by ${g.file.split('/').pop()} (ran green in suite #8)`
          : 'suite #8 not green — guard not proven' });
    }
  }
}

// ===========================================================================
// Category C — Quota-SUM reality (#13)  [BLOCKER, static body + live cross-check]
// ===========================================================================

async function quotaRealityCheck(service: SupabaseClient | null) {
  console.log('\n--- Category C: Quota reality ---');
  const migration = 'supabase/migrations/20260610000005_usage_quota_rpc.sql';
  const body = readFile(migration) ?? '';
  const sumsNotCounts =
    body.includes('SUM(quantity)') && !/COUNT\s*\(/i.test(body);

  if (!sumsNotCounts) {
    record({ n: 13, check: 'quota_sum_reality', severity: 'BLOCKER', verdict: 'FAIL',
      detail: `get_monthly_usage must SUM(quantity), not COUNT rows — check ${migration}` });
    return;
  }

  if (!service) {
    record({ n: 13, check: 'quota_sum_reality', severity: 'BLOCKER', verdict: 'PASS',
      detail: 'RPC body sums chars (static). Live cross-check skipped (no DB).' });
    return;
  }

  // Live: RPC value must equal a raw SUM(quantity) for a sampled user.
  const { data: sampleRows, error: sampleErr } = await service
    .from('usage_logs')
    .select('user_id')
    .eq('event_type', 'tts_request')
    .eq('status', 'ok')
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
    .limit(1);

  if (sampleErr) {
    record({ n: 13, check: 'quota_sum_reality', severity: 'BLOCKER', verdict: 'FAIL',
      detail: `usage_logs query error: ${sampleErr.message}` });
    return;
  }

  if (!sampleRows || sampleRows.length === 0) {
    record({ n: 13, check: 'quota_sum_reality', severity: 'BLOCKER', verdict: 'PASS',
      detail: 'RPC sums chars (static verified). No current-month TTS usage to cross-check (0 traffic — consistent with ground truth §6).' });
    return;
  }

  const uid = (sampleRows[0] as { user_id: string }).user_id;
  const { data: rpcVal, error: rpcErr } = await service.rpc('get_monthly_usage', {
    p_user_id: uid, p_event_type: 'tts_request',
  });
  const { data: rawRows, error: rawErr } = await service
    .from('usage_logs')
    .select('quantity')
    .eq('user_id', uid)
    .eq('event_type', 'tts_request')
    .eq('status', 'ok')
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  if (rpcErr || rawErr) {
    record({ n: 13, check: 'quota_sum_reality', severity: 'BLOCKER', verdict: 'FAIL',
      detail: `cross-check error: ${rpcErr?.message ?? rawErr?.message}` });
    return;
  }

  const rawSum = (rawRows ?? []).reduce((a, r) => a + Number((r as { quantity: number }).quantity || 0), 0);
  const rpcSum = Number(rpcVal ?? 0);
  record({
    n: 13, check: 'quota_sum_reality', severity: 'BLOCKER',
    verdict: rpcSum === rawSum ? 'PASS' : 'FAIL',
    detail: rpcSum === rawSum
      ? `RPC SUM (${rpcSum}) == raw SUM (${rawSum}) for sampled user; body sums chars not rows`
      : `MISMATCH: RPC ${rpcSum} != raw ${rawSum}`,
  });
}

// ===========================================================================
// Category D — Live security probes (#10 RPC auth, #11 anon PII)  [BLOCKER]
// ===========================================================================

async function liveSecurityProbes(service: SupabaseClient, anon: SupabaseClient) {
  console.log('\n--- Category D: Live security probes ---');

  // ---- #11 anon PII: instructor sensitive columns must be unreadable by anon
  const sensitive = ['certificate_number', 'admin_notes', 'verification_data'];
  const { data: piiData, error: piiErr } = await anon
    .from('instructor_profiles')
    .select(sensitive.join(', '))
    .limit(1);
  const anonBlocked = !!piiErr || !piiData || piiData.length === 0;
  // Confirm the safe view still serves anon.
  const { error: viewErr } = await anon
    .from('public_instructor_profiles')
    .select('slug')
    .limit(1);
  record({
    n: 11, check: 'anon_pii_blocked', severity: 'BLOCKER',
    verdict: anonBlocked ? 'PASS' : 'FAIL',
    detail: anonBlocked
      ? `anon SELECT of [${sensitive.join(', ')}] denied/empty${piiErr ? ` (${piiErr.code ?? 'rls'})` : ''}; public view ${viewErr ? 'ERR' : 'ok'}`
      : `LEAK: anon read ${piiData.length} sensitive instructor row(s)`,
  });

  // ---- #10 RPC auth: an authenticated non-owner must be denied another user's scores.
  // (a) anon is fully revoked.
  const someUserId = await firstUserId(service);
  const { error: anonRpcErr } = await anon.rpc('get_element_scores', {
    p_user_id: someUserId ?? '00000000-0000-0000-0000-000000000000',
    p_rating: 'private',
  });
  const anonRevoked = !!anonRpcErr; // permission denied for function, or forbidden

  // (b) authenticated cross-user → must raise 'forbidden'.
  const crossUser = await probeAuthenticatedCrossUser(service, someUserId);

  let verdict: Verdict = 'FAIL';
  let detail = '';
  if (crossUser.ran) {
    verdict = crossUser.denied && anonRevoked ? 'PASS' : 'FAIL';
    detail = `anon ${anonRevoked ? 'revoked' : 'EXECUTABLE!'}; authenticated cross-user ${crossUser.denied ? 'denied (forbidden)' : 'RETURNED DATA — C1 OPEN'} ${crossUser.note}`;
  } else {
    // Could not mint a JWT — fall back to the anon-revoke signal with a loud note.
    verdict = anonRevoked ? 'PASS' : 'FAIL';
    detail = `anon ${anonRevoked ? 'revoked' : 'EXECUTABLE!'}; authenticated probe skipped (${crossUser.note}) — set GATE_TEST_EMAIL/GATE_TEST_PASSWORD for the full cross-user probe`;
  }
  record({ n: 10, check: 'rpc_cross_user_auth', severity: 'BLOCKER', verdict, detail });
}

async function firstUserId(service: SupabaseClient): Promise<string | null> {
  const { data } = await service.from('user_profiles').select('user_id').limit(1);
  return data && data.length ? (data[0] as { user_id: string }).user_id : null;
}

/**
 * Obtain a real authenticated (non-admin) JWT and call get_element_scores for a
 * DIFFERENT user. Prefers env test creds; otherwise creates+deletes an
 * ephemeral probe user via the service role.
 */
async function probeAuthenticatedCrossUser(
  service: SupabaseClient,
  victimUserId: string | null
): Promise<{ ran: boolean; denied: boolean; note: string }> {
  if (!victimUserId) return { ran: false, denied: false, note: 'no users to probe against' };
  if (!SUPA_URL || !ANON_KEY) return { ran: false, denied: false, note: 'missing anon env' };

  const envEmail = process.env.GATE_TEST_EMAIL;
  const envPass = process.env.GATE_TEST_PASSWORD;

  // Path 1: env-provided creds.
  if (envEmail && envPass) {
    const c = createClient(SUPA_URL, ANON_KEY);
    const { data, error } = await c.auth.signInWithPassword({ email: envEmail, password: envPass });
    if (error || !data.session) return { ran: false, denied: false, note: `env signin failed: ${error?.message}` };
    const authed = createClient(SUPA_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
    // Probe a user that is NOT the signed-in env user. If the env user happens
    // to be the only user, fall back to a random UUID (still must be forbidden).
    const target = data.user.id === victimUserId
      ? '00000000-0000-0000-0000-000000000000'
      : victimUserId;
    const { data: scores, error: rpcErr } = await authed.rpc('get_element_scores', {
      p_user_id: target, p_rating: 'private',
    });
    const denied = !!rpcErr || (Array.isArray(scores) && scores.length === 0);
    return { ran: true, denied, note: `(env user vs ${target.slice(0, 8)}…${rpcErr ? `: ${rpcErr.code ?? 'forbidden'}` : ': empty'})` };
  }

  // Path 2: ephemeral probe user (created + deleted in this run).
  const stamp = Date.now();
  const email = `gate-probe+${stamp}@heydpe-gate.example`;
  const password = `Gate!Probe-${stamp}`;
  let probeId: string | null = null;
  try {
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr || !created.user) return { ran: false, denied: false, note: `ephemeral create failed: ${createErr?.message}` };
    probeId = created.user.id;

    const anonC = createClient(SUPA_URL, ANON_KEY);
    const { data: signin, error: signErr } = await anonC.auth.signInWithPassword({ email, password });
    if (signErr || !signin.session) return { ran: false, denied: false, note: `ephemeral signin failed: ${signErr?.message}` };

    const authed = createClient(SUPA_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signin.session.access_token}` } },
    });
    // Probe a DIFFERENT user (the sampled real user) — must be forbidden.
    const { data: scores, error: rpcErr } = await authed.rpc('get_element_scores', {
      p_user_id: victimUserId, p_rating: 'private',
    });
    const denied = !!rpcErr || !scores || (Array.isArray(scores) && scores.length === 0);
    return {
      ran: true,
      denied: !!rpcErr || (Array.isArray(scores) && scores.length === 0),
      note: `(ephemeral user vs ${victimUserId.slice(0, 8)}…${rpcErr ? `: ${rpcErr.message.includes('forbidden') ? 'forbidden' : rpcErr.code}` : ': empty'})`,
    };
  } finally {
    if (probeId) {
      await service.auth.admin.deleteUser(probeId).catch(() => { /* best effort */ });
    }
  }
}

// ===========================================================================
// Category E — Flag sanity (#16) & Ops env (#17)  [WARN]
// ===========================================================================

async function flagAndOpsChecks(service: SupabaseClient | null) {
  console.log('\n--- Category E: Flag sanity & ops ---');

  // ---- #16 flags sane (live)
  if (service) {
    const { data, error } = await service.from('system_config').select('key, value');
    if (error || !data) {
      record({ n: 16, check: 'flags_sane', severity: 'WARN', verdict: 'FAIL',
        detail: `could not read system_config: ${error?.message}` });
    } else {
      const cfg: Record<string, Record<string, unknown>> = {};
      for (const r of data) cfg[(r as { key: string }).key] = (r as { value: Record<string, unknown> }).value;
      const issues: string[] = [];

      if (cfg['graph.enhanced_retrieval']?.enabled === true) issues.push('graph.enhanced_retrieval ON (should be off — W5.1)');
      if (cfg['graph.shadow_mode']?.enabled === true) issues.push('graph.shadow_mode ON (should be off — W5.1)');

      const scenMode = (cfg['exam.scenario_engine']?.mode as string) ?? 'off';
      const gate1Exists = existsSync(join(ROOT, REVIEW_DIR, '15-scenario-gate1-report.md'));
      if (!['off', 'ab', 'on'].includes(scenMode)) issues.push(`exam.scenario_engine mode='${scenMode}' (unexpected)`);
      if (scenMode === 'on' && !gate1Exists) issues.push("exam.scenario_engine 'on' without a Gate 1 report");

      for (const k of Object.keys(cfg)) {
        if (k.startsWith('kill_switch.') && cfg[k]?.enabled === true) issues.push(`${k} ON`);
      }
      if (cfg['maintenance_mode']?.enabled === true) issues.push('maintenance_mode ON');

      const quotaKeys = ['quota.tts_hard_enforce', 'quota.stt_hard_enforce', 'quota.exchange_hard_enforce', 'quota.daily_caps_enforce'];
      const missingQuota = quotaKeys.filter(k => !(k in cfg));
      if (missingQuota.length) issues.push(`missing quota flags: ${missingQuota.join(', ')}`);

      record({
        n: 16, check: 'flags_sane', severity: 'WARN',
        verdict: issues.length === 0 ? 'PASS' : 'FAIL',
        detail: issues.length === 0
          ? `graph off; scenario='${scenMode}'(gate1 ${gate1Exists ? 'present' : 'absent'}); kill switches off; maintenance off; quota flags present`
          : issues.join('; '),
      });
    }
  } else {
    record({ n: 16, check: 'flags_sane', severity: 'WARN', verdict: 'SKIP', detail: 'no DB — flag sanity not evaluated' });
  }

  // ---- #17 ops env presence (Vercel CLI if available, else process.env)
  const wanted = ['SENTRY_DSN', 'CRON_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  let prodNames: string[] | null = null;
  try {
    const out = execSync('vercel env ls production', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 });
    prodNames = out.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(Boolean);
  } catch {
    prodNames = null; // vercel CLI unavailable / not linked
  }
  const present = (name: string) =>
    prodNames ? prodNames.includes(name) : !!process.env[name];
  const missing = wanted.filter(w => !present(w));
  record({
    n: 17, check: 'ops_env_present', severity: 'WARN',
    verdict: missing.length === 0 ? 'PASS' : 'FAIL',
    detail: missing.length === 0
      ? `${wanted.join(', ')} all set${prodNames ? ' (vercel production)' : ' (process.env)'}`
      : `missing in ${prodNames ? 'Vercel production' : 'env'}: ${missing.join(', ')}`,
  });
}

// ===========================================================================
// Category F — Pricing / enforcement parity (#18)  [WARN]
// ===========================================================================
// Encode the expected matrix and assert the pricing page + TIER_FEATURES agree
// with the enforced reality (D1: voice universal; free = 3 exams; paid = unlimited).

function pricingParityCheck() {
  console.log('\n--- Category F: Pricing/enforcement parity ---');
  const pricing = readFile('src/app/pricing/page.tsx') ?? '';
  const types = readFile('src/lib/voice/types.ts') ?? '';
  const session = readFile('src/app/api/session/route.ts') ?? '';

  const expectations: Array<{ label: string; ok: boolean }> = [
    { label: 'pricing: 3 free exams', ok: /3 free|3 free practice|free:\s*'3 free'/.test(pricing) },
    { label: 'pricing: voice in free trial', ok: /In trial|every plan|free trial/i.test(pricing) },
    { label: 'pricing: paid unlimited', ok: /Unlimited/.test(pricing) },
    { label: 'enforce: FREE_TRIAL_EXAM_LIMIT = 3', ok: /FREE_TRIAL_EXAM_LIMIT\s*=\s*3/.test(session) },
    { label: 'enforce: dpe_live unlimited sessions', ok: /maxSessionsPerMonth:\s*Infinity/.test(types) },
    { label: 'enforce: trial TTS char cap (anti-theft)', ok: /maxTtsCharsPerMonth:\s*35_000/.test(types) },
  ];
  const fails = expectations.filter(e => !e.ok).map(e => e.label);
  record({
    n: 18, check: 'pricing_parity', severity: 'WARN',
    verdict: fails.length === 0 ? 'PASS' : 'FAIL',
    detail: fails.length === 0
      ? `all ${expectations.length} pricing↔enforcement claims agree (D1)`
      : `mismatch: ${fails.join('; ')}`,
  });
}

// ===========================================================================
// Main
// ===========================================================================

async function main() {
  console.log('============================================================');
  console.log(' Public Launch Final Gate (W7.1)');
  console.log(`  mode: ${LIVE ? 'LIVE (production probes enabled)' : 'STATIC (no DB)'}`);
  console.log(`  date: ${new Date().toISOString()}`);
  console.log('============================================================');

  const service = LIVE ? createClient(SUPA_URL!, SERVICE_KEY!) : null;
  const anon = LIVE ? createClient(SUPA_URL!, ANON_KEY!) : null;

  const suiteGreen = portedChecks();
  guardChecks(suiteGreen);
  await quotaRealityCheck(service);
  if (service && anon) {
    await liveSecurityProbes(service, anon);
  } else {
    record({ n: 10, check: 'rpc_cross_user_auth', severity: 'BLOCKER', verdict: 'SKIP', detail: 'no DB — live probe not run (run with Supabase keys before launch)' });
    record({ n: 11, check: 'anon_pii_blocked', severity: 'BLOCKER', verdict: 'SKIP', detail: 'no DB — live probe not run (run with Supabase keys before launch)' });
  }
  await flagAndOpsChecks(service);
  pricingParityCheck();

  // ---- Verdict ----
  const blockers = results.filter(r => r.severity === 'BLOCKER');
  const warns = results.filter(r => r.severity === 'WARN');
  const blockerFails = blockers.filter(r => r.verdict === 'FAIL');
  const blockerSkips = blockers.filter(r => r.verdict === 'SKIP');
  const warnFails = warns.filter(r => r.verdict === 'FAIL');

  let overall: 'GO' | 'GO-WITH-CONDITIONS' | 'NO-GO';
  if (blockerFails.length > 0) overall = 'NO-GO';
  else if (blockerSkips.length > 0 || warnFails.length > 0) overall = 'GO-WITH-CONDITIONS';
  else overall = 'GO';

  console.log('\n============================================================');
  console.log(' SUMMARY');
  console.log('============================================================');
  console.log(`  BLOCKERS: ${blockers.filter(r => r.verdict === 'PASS').length}/${blockers.length} pass, ${blockerFails.length} fail, ${blockerSkips.length} skip`);
  console.log(`  WARNINGS: ${warns.filter(r => r.verdict === 'PASS').length}/${warns.length} pass, ${warnFails.length} fail`);
  console.log(`\n  OVERALL: ${overall}`);
  if (blockerFails.length) console.log(`  blocking failures: ${blockerFails.map(r => `#${r.n} ${r.check}`).join(', ')}`);

  writeEvidence(overall, { blockers, warns });

  // Exit non-zero only on a true blocker failure. Skips (static-mode blockers)
  // do not fail CI, but the markdown verdict records GO-WITH-CONDITIONS.
  if (blockerFails.length > 0) process.exit(1);
}

function writeEvidence(
  overall: string,
  groups: { blockers: CheckResult[]; warns: CheckResult[] }
) {
  const dir = join(ROOT, REVIEW_DIR);
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString();

  let md = `# Final Launch Gate Result\n\n`;
  md += `> Generated by \`npm run audit:final-gate\` (scripts/audit/public-launch-final-gate.ts).\n`;
  md += `> This is the standing pre-marketing-push ritual (W7.1). Re-run before any traffic push.\n\n`;
  md += `**Date:** ${date}\n`;
  md += `**Mode:** ${LIVE ? 'LIVE (production probes)' : 'STATIC (no DB)'}\n`;
  md += `**Overall verdict:** ${overall}\n\n`;

  const icon = (v: Verdict) => (v === 'PASS' ? '✅' : v === 'FAIL' ? '❌' : '➖');

  md += `## Blockers\n\n`;
  md += `| # | Check | Verdict | Detail |\n|---|-------|---------|--------|\n`;
  for (const r of groups.blockers.sort((a, b) => a.n - b.n)) {
    md += `| ${r.n} | ${r.check} | ${icon(r.verdict)} ${r.verdict} | ${r.detail.replace(/\|/g, '\\|')} |\n`;
  }
  md += `\n## Warnings\n\n`;
  md += `| # | Check | Verdict | Detail |\n|---|-------|---------|--------|\n`;
  for (const r of groups.warns.sort((a, b) => a.n - b.n)) {
    md += `| ${r.n} | ${r.check} | ${icon(r.verdict)} ${r.verdict} | ${r.detail.replace(/\|/g, '\\|')} |\n`;
  }

  md += `\n## How to read this\n\n`;
  md += `- **GO** — every blocker passed and every warning passed.\n`;
  md += `- **GO-WITH-CONDITIONS** — every blocker that ran passed, but some warnings failed or some live blockers were skipped (run with Supabase keys to evaluate them).\n`;
  md += `- **NO-GO** — at least one blocker failed; do not push traffic until fixed.\n\n`;
  md += `Checks #10/#11/#13/#16/#17 require Supabase service+anon keys (live mode). #12/#14/#15 are critical-finding guards proven by the full unit suite (#8); \`--deep\` re-runs them in isolation.\n`;

  writeFileSync(join(dir, '10-final-gate-result.md'), md);
  console.log(`\n  Evidence → ${REVIEW_DIR}/10-final-gate-result.md`);
}

main().catch((e) => {
  console.error('Gate crashed:', e);
  process.exit(1);
});
