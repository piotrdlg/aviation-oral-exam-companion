#!/usr/bin/env npx tsx
/**
 * result-audit.ts — Audit exam results for grading consistency and V2 coverage.
 *
 * Loads recent completed exam sessions and reports:
 *   - V1 vs V2 grade comparison
 *   - Per-area gating results
 *   - Weak element counts and severity distribution
 *   - Citation grounding coverage
 *   - Plan-based vs asked-only score delta
 *
 * Usage:
 *   npx tsx scripts/exam/result-audit.ts
 *   npx tsx scripts/exam/result-audit.ts --limit 10
 *   npx tsx scripts/exam/result-audit.ts --session <session-id>
 *
 * npm: npm run exam:result-audit
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import type { ExamResult } from '../../src/types/database';
import type { ExamResultV2 } from '../../src/lib/exam-result';
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
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const sessionIdx = args.indexOf('--session');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 20;
const sessionFilter = sessionIdx >= 0 ? args[sessionIdx + 1] : null;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Exam Result Audit ===\n');

  let query = supabase
    .from('exam_sessions')
    .select('id, rating, status, result, metadata, started_at, ended_at, exchange_count')
    .eq('status', 'completed')
    .order('ended_at', { ascending: false });

  if (sessionFilter) {
    query = query.eq('id', sessionFilter);
  } else {
    query = query.limit(limit);
  }

  const { data: sessions, error } = await query;

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }

  if (!sessions || sessions.length === 0) {
    console.log('No completed sessions found.');
    return;
  }

  console.log(`Found ${sessions.length} completed session(s)\n`);

  // Aggregate stats
  let v1Only = 0;
  let v2Present = 0;
  let gradeMatch = 0;
  let gradeMismatch = 0;
  let totalWeakElements = 0;
  let totalFailedAreas = 0;

  for (const session of sessions) {
    const v1Result = session.result as ExamResult | null;
    const metadata = session.metadata as Record<string, unknown> | null;
    const v2Result = metadata?.examResultV2 as ExamResultV2 | undefined;
    const examPlan = metadata?.examPlan as ExamPlanV1 | undefined;

    console.log(`─── Session ${session.id.slice(0, 8)}... ───`);
    console.log(`  Rating: ${session.rating} | Exchanges: ${session.exchange_count}`);
    console.log(`  Started: ${session.started_at} | Ended: ${session.ended_at}`);

    if (v1Result) {
      console.log(`  V1 Grade: ${v1Result.grade} (${(v1Result.score_percentage * 100).toFixed(0)}%)`);
      console.log(`    Asked: ${v1Result.elements_asked}/${v1Result.total_elements_in_set} | Sat: ${v1Result.elements_satisfactory} Partial: ${v1Result.elements_partial} Unsat: ${v1Result.elements_unsatisfactory}`);
    } else {
      console.log('  V1 Result: MISSING');
    }

    if (v2Result) {
      v2Present++;
      console.log(`  V2 Status: ${v2Result.overall_status} (plan-score: ${(v2Result.overall_score * 100).toFixed(0)}%, asked-score: ${(v2Result.asked_score * 100).toFixed(0)}%)`);
      console.log(`    Plan: ${v2Result.total_in_plan} elements | Asked: ${v2Result.elements_asked} | Credited: ${v2Result.elements_credited} | Not asked: ${v2Result.elements_not_asked}`);
      console.log(`    Trigger: ${v2Result.completion_trigger} | Plan exhausted: ${v2Result.plan_exhausted}`);

      // Per-area breakdown
      if (v2Result.areas.length > 0) {
        console.log('    Areas:');
        for (const area of v2Result.areas) {
          const statusIcon = area.status === 'pass' ? '✓' : area.status === 'fail' ? '✗' : '?';
          console.log(`      ${statusIcon} Area ${area.area}: ${(area.score * 100).toFixed(0)}% (${area.asked}/${area.total_in_plan} asked, ${area.satisfactory}S/${area.partial}P/${area.unsatisfactory}U) — ${area.status}${area.status_reason ? ` (${area.status_reason})` : ''}`);
        }
      }

      // Failed areas
      if (v2Result.failed_areas.length > 0) {
        console.log(`    FAILED AREAS: ${v2Result.failed_areas.join(', ')}`);
        totalFailedAreas += v2Result.failed_areas.length;
      }

      // Weak elements
      if (v2Result.weak_elements.length > 0) {
        const unsatCount = v2Result.weak_elements.filter(w => w.severity === 'unsatisfactory').length;
        const partialCount = v2Result.weak_elements.filter(w => w.severity === 'partial').length;
        const notAskedCount = v2Result.weak_elements.filter(w => w.severity === 'not_asked').length;
        console.log(`    Weak elements: ${v2Result.weak_elements.length} (${unsatCount} unsat, ${partialCount} partial, ${notAskedCount} not asked)`);
        totalWeakElements += v2Result.weak_elements.length;
      }

      // Grade comparison
      if (v1Result) {
        const v1Pass = v1Result.grade === 'satisfactory';
        const v2Pass = v2Result.overall_status === 'pass';
        if (v1Pass === v2Pass) {
          gradeMatch++;
        } else {
          gradeMismatch++;
          console.log(`    ⚠️ GRADE MISMATCH: V1=${v1Result.grade} vs V2=${v2Result.overall_status}`);
        }
      }

      // Score delta (plan-based vs asked-only)
      const delta = v2Result.overall_score - v2Result.asked_score;
      if (Math.abs(delta) > 0.05) {
        console.log(`    Score delta (plan vs asked): ${(delta * 100).toFixed(1)}pp`);
      }
    } else {
      v1Only++;
      console.log('  V2 Result: NOT PRESENT (pre-Phase 5 session)');
    }

    if (examPlan) {
      const coverageStatuses = Object.values(examPlan.coverage);
      const asked = coverageStatuses.filter(s => s === 'asked').length;
      const credited = coverageStatuses.filter(s => s === 'credited_by_mention').length;
      const pending = coverageStatuses.filter(s => s === 'pending').length;
      console.log(`  Plan: ${asked} asked, ${credited} credited, ${pending} pending of ${coverageStatuses.length} total`);
    }

    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Total sessions: ${sessions.length}`);
  console.log(`V2 present: ${v2Present} | V1-only: ${v1Only}`);
  if (gradeMatch + gradeMismatch > 0) {
    console.log(`Grade V1↔V2: ${gradeMatch} match, ${gradeMismatch} mismatch`);
  }
  console.log(`Total weak elements: ${totalWeakElements}`);
  console.log(`Total failed areas: ${totalFailedAreas}`);
}

main().catch(console.error);
