#!/usr/bin/env npx tsx
/**
 * plan-audit.ts — Audit exam sessions for plan compliance.
 *
 * Loads recent exam sessions with ExamPlanV1 metadata and reports:
 *   - Planned vs actual question count
 *   - Bonus questions used
 *   - Element coverage breakdown (asked / credited_by_mention / pending / skipped)
 *   - Follow-up probe counts
 *   - Plan completion status
 *
 * Usage:
 *   npx tsx scripts/exam/plan-audit.ts
 *   npx tsx scripts/exam/plan-audit.ts --limit 5
 *   npx tsx scripts/exam/plan-audit.ts --session <session-id>
 *
 * npm: npm run exam:plan-audit
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import type { ExamPlanV1 } from '../../src/lib/exam-plan';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { limit: 10, sessionId: '' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
      case '--session': flags.sessionId = args[++i]; break;
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  console.log('\n=== Exam Plan Audit ===\n');

  let query = supabase
    .from('exam_sessions')
    .select('id, status, exchange_count, rating, study_mode, started_at, ended_at, metadata, result')
    .order('started_at', { ascending: false })
    .limit(flags.limit);

  if (flags.sessionId) {
    query = query.eq('id', flags.sessionId);
  }

  const { data: sessions, error } = await query;

  if (error) {
    console.error('Error fetching sessions:', error.message);
    process.exit(1);
  }

  if (!sessions || sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }

  let withPlan = 0;
  let withoutPlan = 0;

  for (const session of sessions) {
    const metadata = session.metadata as Record<string, unknown> | null;
    const examPlan = metadata?.examPlan as ExamPlanV1 | undefined;

    if (!examPlan) {
      withoutPlan++;
      continue;
    }
    withPlan++;

    const coverage = examPlan.coverage || {};
    const asked = Object.values(coverage).filter(s => s === 'asked').length;
    const credited = Object.values(coverage).filter(s => s === 'credited_by_mention').length;
    const pending = Object.values(coverage).filter(s => s === 'pending').length;
    const skipped = Object.values(coverage).filter(s => s === 'skipped').length;
    const totalElements = Object.keys(coverage).length;

    const planComplete = examPlan.asked_count >= examPlan.planned_question_count + examPlan.bonus_used;

    console.log(`--- Session: ${session.id} ---`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Rating: ${session.rating}, Mode: ${examPlan.mode}`);
    console.log(`  Started: ${session.started_at}`);
    console.log(`  Exchanges: ${session.exchange_count}`);
    console.log(`  Plan:`);
    console.log(`    Planned questions: ${examPlan.planned_question_count}`);
    console.log(`    Bonus budget: ${examPlan.bonus_question_max}`);
    console.log(`    Follow-up max/element: ${examPlan.follow_up_max_per_element}`);
    console.log(`  Actuals:`);
    console.log(`    Questions asked: ${examPlan.asked_count}`);
    console.log(`    Bonus used: ${examPlan.bonus_used}`);
    console.log(`    Plan complete: ${planComplete ? 'YES' : 'NO'}`);
    console.log(`  Coverage (${totalElements} elements):`);
    console.log(`    Asked:              ${asked}`);
    console.log(`    Credited by mention:${credited}`);
    console.log(`    Pending:            ${pending}`);
    console.log(`    Skipped:            ${skipped}`);

    if (session.result) {
      const result = session.result as Record<string, unknown>;
      console.log(`  Result: ${result.grade} (${((result.score_percentage as number) * 100).toFixed(0)}%)`);
    }

    console.log('');
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Sessions with ExamPlan: ${withPlan}`);
  console.log(`  Sessions without ExamPlan: ${withoutPlan} (legacy)`);
  console.log(`  Total scanned: ${sessions.length}`);
}

main().catch((err) => {
  console.error('Plan audit error:', err);
  process.exit(1);
});
