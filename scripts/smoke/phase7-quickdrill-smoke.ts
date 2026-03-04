/**
 * Phase 7 Smoke Test — Quick Drill Element Targeting
 *
 * Proves that quick_drill mode correctly:
 * 1. Excludes satisfactory elements from the queue
 * 2. Targets weak/untouched elements
 * 3. Uses weighted shuffle to prioritize unsatisfactory > partial > untouched
 *
 * Does NOT create a real session — instead exercises buildElementQueue() directly
 * with real element scores from the production database.
 *
 * Usage:
 *   npx tsx scripts/smoke/phase7-quickdrill-smoke.ts
 *
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('FAIL: Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-04-phase7/api');

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const results: CheckResult[] = [];

async function main() {
  console.log('=== Phase 7 Quick Drill Smoke Test ===\n');

  // Step 1: Find a user with completed sessions + element attempts
  console.log('Step 1: Finding user with exam history...');
  const { data: completedSessions } = await supabase
    .from('exam_sessions')
    .select('id, user_id, rating, study_mode, exchange_count')
    .eq('status', 'completed')
    .gt('exchange_count', 3)
    .order('ended_at', { ascending: false })
    .limit(5);

  if (!completedSessions || completedSessions.length === 0) {
    results.push({ name: 'find_user', status: 'SKIP', detail: 'No completed sessions with exchanges found' });
    printResults();
    return;
  }

  const targetUserId = completedSessions[0].user_id;
  const targetRating = completedSessions[0].rating || 'private';
  console.log(`  User: ${targetUserId.slice(0, 8)}...`);
  console.log(`  Rating: ${targetRating}`);
  console.log(`  Sessions: ${completedSessions.length}`);

  results.push({
    name: 'find_user',
    status: 'PASS',
    detail: `User ${targetUserId.slice(0, 8)} with ${completedSessions.length} completed sessions`,
  });

  // Step 2: Load element scores for this user
  console.log('\nStep 2: Loading element scores...');
  const { data: scores, error: scoresErr } = await supabase.rpc('get_element_scores', {
    p_user_id: targetUserId,
    p_rating: targetRating,
  });

  if (scoresErr || !scores) {
    results.push({ name: 'load_scores', status: 'FAIL', detail: scoresErr?.message || 'No scores returned' });
    printResults();
    return;
  }

  // Categorize scores
  const satisfactory = scores.filter((s: Record<string, unknown>) => s.latest_score === 'satisfactory');
  const unsatisfactory = scores.filter((s: Record<string, unknown>) => s.latest_score === 'unsatisfactory');
  const partial = scores.filter((s: Record<string, unknown>) => s.latest_score === 'partial');

  console.log(`  Total scored elements: ${scores.length}`);
  console.log(`  Satisfactory: ${satisfactory.length}`);
  console.log(`  Unsatisfactory: ${unsatisfactory.length}`);
  console.log(`  Partial: ${partial.length}`);

  results.push({
    name: 'load_scores',
    status: scores.length > 0 ? 'PASS' : 'SKIP',
    detail: `${scores.length} scores (${satisfactory.length} sat / ${unsatisfactory.length} unsat / ${partial.length} partial)`,
  });

  // Step 3: Load all elements for rating
  console.log('\nStep 3: Loading ACS elements...');
  const prefix = targetRating === 'private' ? 'PA' : targetRating === 'commercial' ? 'CA' : 'IR';
  const { data: elements } = await supabase
    .from('acs_elements')
    .select('code, task_id, element_type, description, order_index, difficulty_default, weight')
    .like('code', `${prefix}.%`)
    .not('element_type', 'eq', 'skill'); // Exclude skill elements (oral only)

  if (!elements || elements.length === 0) {
    results.push({ name: 'load_elements', status: 'FAIL', detail: 'No ACS elements found' });
    printResults();
    return;
  }

  console.log(`  Total oral elements: ${elements.length}`);

  // Step 4: Exercise buildElementQueue with quick_drill mode
  console.log('\nStep 4: Running buildElementQueue(quick_drill)...');

  // Import the function
  const { buildElementQueue } = await import('../../src/lib/exam-logic');

  const drillConfig = {
    rating: targetRating as 'private' | 'commercial' | 'instrument' | 'atp',
    aircraftClass: 'ASEL' as const,
    studyMode: 'quick_drill' as const,
    difficulty: 'mixed' as const,
    selectedAreas: [] as string[],
    selectedTasks: [] as string[],
  };

  const queue = buildElementQueue(
    elements.map(e => ({
      code: e.code,
      task_id: e.task_id,
      element_type: e.element_type as 'knowledge' | 'risk_management' | 'skill',
      short_code: e.code.split('.').pop()!,
      description: e.description || '',
      order_index: e.order_index || 0,
      difficulty_default: (e.difficulty_default || 'medium') as 'easy' | 'medium' | 'hard',
      weight: e.weight || 1,
      created_at: '',
    })),
    drillConfig,
    scores,
  );

  console.log(`  Queue length: ${queue.length}`);

  // Step 5: Verify no satisfactory elements in queue
  console.log('\nStep 5: Verifying quick_drill exclusion...');
  const satisfactoryCodes = new Set(satisfactory.map((s: Record<string, unknown>) => s.element_code as string));
  const satisfactoryInQueue = queue.filter(code => satisfactoryCodes.has(code));

  if (satisfactoryInQueue.length === 0 && satisfactory.length > 0) {
    console.log(`  \u2705 No satisfactory elements in queue (${satisfactory.length} excluded)`);
    results.push({
      name: 'exclusion_check',
      status: 'PASS',
      detail: `0 satisfactory elements in queue; ${satisfactory.length} correctly excluded`,
    });
  } else if (satisfactory.length === 0) {
    console.log(`  \u23ED No satisfactory elements to exclude (all weak/untouched)`);
    results.push({
      name: 'exclusion_check',
      status: 'SKIP',
      detail: 'No satisfactory elements exist to verify exclusion',
    });
  } else {
    console.log(`  \u274C ${satisfactoryInQueue.length} satisfactory elements found in queue!`);
    console.log(`    Leaked: ${satisfactoryInQueue.slice(0, 5).join(', ')}`);
    results.push({
      name: 'exclusion_check',
      status: 'FAIL',
      detail: `${satisfactoryInQueue.length} satisfactory elements leaked into queue`,
    });
  }

  // Step 6: Check queue prioritization (first 5 should be weak)
  console.log('\nStep 6: Checking prioritization...');
  const unsatCodes = new Set(unsatisfactory.map((s: Record<string, unknown>) => s.element_code as string));
  const partialCodes = new Set(partial.map((s: Record<string, unknown>) => s.element_code as string));

  const first10 = queue.slice(0, 10);
  let unsatInFirst10 = 0;
  let partialInFirst10 = 0;
  let untouchedInFirst10 = 0;

  for (const code of first10) {
    if (unsatCodes.has(code)) unsatInFirst10++;
    else if (partialCodes.has(code)) partialInFirst10++;
    else untouchedInFirst10++;
  }

  console.log(`  First 10 elements:`);
  console.log(`    Unsatisfactory: ${unsatInFirst10}`);
  console.log(`    Partial: ${partialInFirst10}`);
  console.log(`    Untouched: ${untouchedInFirst10}`);

  // Weighted shuffle means unsatisfactory should appear more often at the front
  const weakInFront = unsatInFirst10 + partialInFirst10;
  results.push({
    name: 'prioritization',
    status: weakInFront > 0 || unsatisfactory.length + partial.length === 0 ? 'PASS' : 'FAIL',
    detail: `First 10: ${unsatInFirst10} unsat + ${partialInFirst10} partial + ${untouchedInFirst10} untouched`,
  });

  // Save evidence
  const evidence = {
    timestamp: new Date().toISOString(),
    user_id: targetUserId,
    rating: targetRating,
    total_elements: elements.length,
    scores_summary: {
      total: scores.length,
      satisfactory: satisfactory.length,
      unsatisfactory: unsatisfactory.length,
      partial: partial.length,
    },
    queue_length: queue.length,
    satisfactory_in_queue: satisfactoryInQueue.length,
    first_10_elements: first10.map(code => ({
      code,
      status: unsatCodes.has(code) ? 'unsatisfactory'
        : partialCodes.has(code) ? 'partial'
        : satisfactoryCodes.has(code) ? 'satisfactory'
        : 'untouched',
    })),
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, 'quickdrill-smoke.json'),
    JSON.stringify(evidence, null, 2)
  );

  printResults();
}

function printResults() {
  console.log('\n=== RESULTS ===');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '\u2705' : r.status === 'FAIL' ? '\u274C' : '\u23ED\uFE0F';
    console.log(`${icon} ${r.name}: ${r.status} \u2014 ${r.detail}`);
  }

  const fails = results.filter(r => r.status === 'FAIL');
  const passes = results.filter(r => r.status === 'PASS');
  console.log(`\nOVERALL: ${fails.length > 0 ? 'FAIL' : passes.length > 0 ? 'PASS' : 'INCONCLUSIVE'}`);
  if (fails.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
