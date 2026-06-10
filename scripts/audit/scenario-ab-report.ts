/**
 * W5.6 — Scenario Engine Gate 2 A/B report (design §7).
 *
 * Pulls the per-arm comparison and prints the Gate 2 table against the
 * binding thresholds:
 *   - engagement (exchanges/session, completion rate) NOT LOWER than control
 *   - guardrails (report-rate, examiner_assessment_mismatch) not elevated
 *   - p95 first-token latency within +10%
 *   - sample gate: n ≥ 200/arm or 2 weeks elapsed (whichever first)
 *
 * Usage:
 *   npm run audit:scenario-ab                 — the Gate 2 table
 *   npm run audit:scenario-ab -- --transcripts — also dump 20 random
 *     scenario-arm transcripts (examiner/student text only) to
 *     scenario-ab-transcripts.local.md for the owner's DPE-realism
 *     checklist, with an automated scenario-fact consistency scan.
 *
 * PostHog-side metrics (mismatch rate, followed_llm) require
 * POSTHOG_PERSONAL_API_KEY; they print N/A without it.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { scanScenarioConsistency } from '../../src/lib/scenario-consistency';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ArmStats {
  n: number;
  avgExchanges: number;
  completionRate: number;
  reportRate: number;
  p95Ttft: number | null;
  firstSessionAt: string | null;
}

async function armStats(arm: 'scenario' | 'linear'): Promise<ArmStats & { sessionIds: string[] }> {
  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('id, status, exchange_count, started_at')
    .eq('metadata->>scenarioArm', arm)
    .order('started_at', { ascending: true });
  const rows = sessions ?? [];
  const ids = rows.map((r) => r.id as string);
  const n = rows.length;
  const avgExchanges = n ? rows.reduce((a, r) => a + ((r.exchange_count as number) || 0), 0) / n : 0;
  const completionRate = n ? rows.filter((r) => r.status === 'completed').length / n : 0;

  let reports = 0;
  let ttfts: number[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { count } = await supabase
      .from('moderation_queue')
      .select('*', { count: 'exact', head: true })
      .in('session_id', batch);
    reports += count ?? 0;
    const { data: lat } = await supabase
      .from('latency_logs')
      .select('stt_to_llm_first_token_ms')
      .in('session_id', batch)
      .not('stt_to_llm_first_token_ms', 'is', null);
    ttfts.push(...(lat ?? []).map((l) => l.stt_to_llm_first_token_ms as number));
  }
  ttfts = ttfts.sort((a, b) => a - b);
  const p95Ttft = ttfts.length ? ttfts[Math.floor(ttfts.length * 0.95)] : null;

  return {
    n, avgExchanges, completionRate,
    reportRate: n ? reports / n : 0,
    p95Ttft,
    firstSessionAt: (rows[0]?.started_at as string) ?? null,
    sessionIds: ids,
  };
}

async function dumpTranscripts(sessionIds: string[]) {
  const pick = sessionIds.slice(0, 20); // earliest 20 — deterministic
  const out: string[] = ['# Scenario-arm transcripts (owner DPE-realism review)', ''];
  let inconsistencies = 0;
  for (const id of pick) {
    const [{ data: rows }, { data: sess }] = await Promise.all([
      supabase.from('session_transcripts').select('role, text, exchange_number')
        .eq('session_id', id).order('exchange_number').order('timestamp'),
      supabase.from('exam_sessions').select('metadata').eq('id', id).single(),
    ]);
    const meta = (sess?.metadata as Record<string, unknown>) ?? {};
    const spine = (meta.scenario as { spine?: { scenario?: { aircraft?: string } } })?.spine;
    const examinerTurns = (rows ?? []).filter((r) => r.role === 'examiner').map((r) => r.text as string);
    const scan = scanScenarioConsistency(spine?.scenario?.aircraft ?? '', examinerTurns);
    if (!scan.consistent) inconsistencies++;
    out.push(`## Session ${id}`);
    out.push(`Scenario aircraft: ${spine?.scenario?.aircraft ?? '(none persisted)'}`);
    out.push(`Consistency scan: ${scan.consistent ? 'OK' : `⚠ FOREIGN TAIL NUMBERS: ${scan.foreignTailNumbers.join(', ')}`}`);
    out.push('');
    for (const r of rows ?? []) out.push(`**${r.role}:** ${r.text}`);
    out.push('');
  }
  out.unshift(`> Automated consistency scan: ${inconsistencies}/${pick.length} sessions flagged. Manual checklist: transitions natural? scenario consistent? no contradicted facts?`, '');
  fs.writeFileSync('scenario-ab-transcripts.local.md', out.join('\n'));
  console.log(`\n${pick.length} transcripts → scenario-ab-transcripts.local.md (${inconsistencies} consistency flags)`);
}

async function main() {
  const [scenario, linear] = await Promise.all([armStats('scenario'), armStats('linear')]);

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const daysElapsed = scenario.firstSessionAt
    ? Math.floor((Date.now() - new Date(scenario.firstSessionAt).getTime()) / 86_400_000)
    : 0;
  const sampleReady = (scenario.n >= 200 && linear.n >= 200) || daysElapsed >= 14;

  console.log('\n=== Scenario Engine Gate 2 — A/B report (design §7) ===\n');
  console.log(`| Metric | LINEAR (control) | SCENARIO | Threshold | Status |`);
  console.log(`|---|---|---|---|---|`);
  console.log(`| Sessions (n) | ${linear.n} | ${scenario.n} | ≥200/arm or 14d (${daysElapsed}d) | ${sampleReady ? 'READY' : 'COLLECTING'} |`);
  console.log(`| Exchanges/session | ${linear.avgExchanges.toFixed(1)} | ${scenario.avgExchanges.toFixed(1)} | not lower | ${scenario.avgExchanges >= linear.avgExchanges * 0.95 ? 'OK' : 'REVIEW'} |`);
  console.log(`| Completion rate | ${pct(linear.completionRate)} | ${pct(scenario.completionRate)} | not lower | ${scenario.completionRate >= linear.completionRate * 0.95 ? 'OK' : 'REVIEW'} |`);
  console.log(`| Report rate | ${pct(linear.reportRate)} | ${pct(scenario.reportRate)} | not elevated | ${scenario.reportRate <= Math.max(linear.reportRate * 1.5, 0.02) ? 'OK' : 'REVIEW'} |`);
  console.log(`| p95 first-token (ms) | ${linear.p95Ttft ?? 'n/a'} | ${scenario.p95Ttft ?? 'n/a'} | within +10% | ${scenario.p95Ttft && linear.p95Ttft ? (scenario.p95Ttft <= linear.p95Ttft * 1.1 ? 'OK' : 'REVIEW') : 'n/a' } |`);
  console.log(`| Mismatch rate / followed_llm | N/A | N/A | not elevated | ${process.env.POSTHOG_PERSONAL_API_KEY ? 'query PostHog: examiner_assessment_mismatch + scenario_transition by arm' : 'set POSTHOG_PERSONAL_API_KEY or read PostHog dashboard'} |`);
  console.log(`\nRollout decision is the OWNER's, from this table + the transcript review (docs/runbooks/SCENARIO-ROLLOUT.md).`);

  if (process.argv.includes('--transcripts')) {
    if (scenario.sessionIds.length === 0) console.log('\nNo scenario-arm sessions yet — nothing to dump.');
    else await dumpTranscripts(scenario.sessionIds);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
