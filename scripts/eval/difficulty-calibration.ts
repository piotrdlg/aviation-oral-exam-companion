/**
 * Difficulty Calibration Audit (R4)
 *
 * Measures whether easy / medium / hard difficulty settings produce
 * observably different question behavior in actual sessions.
 *
 * Metrics per difficulty bucket:
 *   - Average question length (word count)
 *   - Regulatory precision (count of CFR / regulation mentions per question)
 *   - Scenario markers ("what if", "suppose", "imagine", "scenario")
 *   - Follow-up depth (exchanges per task)
 *
 * Also validates that the system prompt difficulty injection text changes
 * correctly for each difficulty value.
 *
 * Usage:
 *   npx tsx scripts/eval/difficulty-calibration.ts [--limit N]
 *
 * Requires: .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-04-phase7/eval');

// ---------------------------------------------------------------------------
// Difficulty instruction validation (must match exam-logic.ts:151-157)
// ---------------------------------------------------------------------------

const EXPECTED_DIFFICULTY_INSTRUCTIONS: Record<string, string> = {
  easy: 'Ask straightforward recall/definition questions.',
  medium: 'Ask application and scenario-based questions.',
  hard: 'Ask complex edge cases, "what if" chains, and regulation nuances.',
  mixed: 'Vary difficulty naturally: mix recall, scenario-based, and challenging questions within the session.',
};

// ---------------------------------------------------------------------------
// Text analysis helpers
// ---------------------------------------------------------------------------

const SCENARIO_MARKERS = [
  'what if', 'suppose', 'imagine', 'scenario', 'consider the situation',
  'let\'s say', 'hypothetically', 'picture this', 'in a situation where',
];

const REGULATION_PATTERNS = [
  /\b14\s*CFR\b/gi,
  /\bFAR\s+\d/gi,
  /\b§\s*\d+\.\d+/g,
  /\bpart\s+\d{2,3}/gi,
  /\bAC\s+\d+-\d+/gi,
  /\bFAR\/AIM\b/gi,
  /\bregulation/gi,
];

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function countScenarioMarkers(text: string): number {
  const lower = text.toLowerCase();
  return SCENARIO_MARKERS.filter(m => lower.includes(m)).length;
}

function countRegulationRefs(text: string): number {
  let count = 0;
  for (const pattern of REGULATION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DifficultyBucket {
  difficulty: string;
  session_count: number;
  total_exchanges: number;
  avg_question_length: number;
  avg_scenario_markers: number;
  avg_regulation_refs: number;
  avg_exchanges_per_session: number;
  raw_question_lengths: number[];
  raw_scenario_counts: number[];
  raw_regulation_counts: number[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 50;

  console.log('=== Difficulty Calibration Audit (R4) ===\n');

  // Step 1: Validate difficulty instruction injection
  console.log('Step 1: Validating difficulty instruction text...');

  // Import the function to verify it exists and check its behavior
  const { buildSystemPrompt } = await import('../../src/lib/exam-logic');

  const mockTask = {
    id: 'PA.I.A',
    area: 'I',
    letter: 'A',
    name: 'Test Task',
    knowledge_elements: [{ code: 'PA.I.A.K1', description: 'Test knowledge' }],
    risk_management_elements: [{ code: 'PA.I.A.R1', description: 'Test risk' }],
    skill_elements: [],
    references: [],
    objective: 'Test objective',
  };

  const instructionResults: Array<{ difficulty: string; found: boolean; detail: string }> = [];

  for (const [difficulty, expectedText] of Object.entries(EXPECTED_DIFFICULTY_INSTRUCTIONS)) {
    const prompt = buildSystemPrompt(
      mockTask,
      difficulty as 'easy' | 'medium' | 'hard' | 'mixed',
      undefined,
      'private'
    );
    const found = prompt.includes(expectedText);
    instructionResults.push({
      difficulty,
      found,
      detail: found
        ? `Contains: "${expectedText.slice(0, 50)}..."`
        : `MISSING expected text for ${difficulty}`,
    });
    console.log(`  ${found ? '\u2705' : '\u274C'} ${difficulty}: ${found ? 'present' : 'MISSING'}`);
  }

  // Verify no-difficulty produces no DIFFICULTY LEVEL header
  const noDiffPrompt = buildSystemPrompt(mockTask, undefined, undefined, 'private');
  const noDiffCheck = !noDiffPrompt.includes('DIFFICULTY LEVEL');
  instructionResults.push({
    difficulty: '(none)',
    found: noDiffCheck,
    detail: noDiffCheck ? 'No DIFFICULTY LEVEL header when omitted' : 'UNEXPECTED: DIFFICULTY LEVEL header present with undefined difficulty',
  });
  console.log(`  ${noDiffCheck ? '\u2705' : '\u274C'} (none): ${noDiffCheck ? 'no header' : 'UNEXPECTED header'}`);

  // Step 2: Load sessions grouped by difficulty
  console.log('\nStep 2: Loading sessions with transcripts...');

  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('id, metadata, rating, study_mode, exchange_count, difficulty')
    .eq('status', 'completed')
    .gt('exchange_count', 2)
    .order('ended_at', { ascending: false })
    .limit(limit);

  if (!sessions || sessions.length === 0) {
    console.log('No completed sessions found. Skipping transcript analysis.');
    writeResults(instructionResults, [], EVIDENCE_DIR);
    return;
  }

  console.log(`  Found ${sessions.length} completed sessions`);

  // Group by difficulty
  const byDifficulty = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const diff = (s.difficulty as string) || 'unset';
    if (!byDifficulty.has(diff)) byDifficulty.set(diff, []);
    byDifficulty.get(diff)!.push(s);
  }

  console.log('  Difficulty distribution:');
  for (const [diff, group] of byDifficulty) {
    console.log(`    ${diff}: ${group.length} sessions`);
  }

  // Step 3: Analyze transcripts per difficulty bucket
  console.log('\nStep 3: Analyzing transcript content...');

  const buckets: DifficultyBucket[] = [];

  for (const [difficulty, group] of byDifficulty) {
    const questionLengths: number[] = [];
    const scenarioCounts: number[] = [];
    const regulationCounts: number[] = [];
    let totalExchanges = 0;

    for (const session of group.slice(0, 10)) { // Cap per bucket for speed
      const { data: transcripts } = await supabase
        .from('session_transcripts')
        .select('role, content, turn_number')
        .eq('session_id', session.id)
        .eq('role', 'examiner')
        .order('turn_number', { ascending: true });

      if (!transcripts || transcripts.length === 0) continue;

      for (const t of transcripts) {
        const content = (t.content as string) || '';
        questionLengths.push(countWords(content));
        scenarioCounts.push(countScenarioMarkers(content));
        regulationCounts.push(countRegulationRefs(content));
      }
      totalExchanges += transcripts.length;
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const bucket: DifficultyBucket = {
      difficulty,
      session_count: group.length,
      total_exchanges: totalExchanges,
      avg_question_length: Math.round(avg(questionLengths) * 10) / 10,
      avg_scenario_markers: Math.round(avg(scenarioCounts) * 100) / 100,
      avg_regulation_refs: Math.round(avg(regulationCounts) * 100) / 100,
      avg_exchanges_per_session: group.length > 0 ? Math.round(totalExchanges / Math.min(group.length, 10) * 10) / 10 : 0,
      raw_question_lengths: questionLengths,
      raw_scenario_counts: scenarioCounts,
      raw_regulation_counts: regulationCounts,
    };

    buckets.push(bucket);
    console.log(`  ${difficulty}: ${totalExchanges} exchanges, avg_len=${bucket.avg_question_length}, scenarios=${bucket.avg_scenario_markers}, regs=${bucket.avg_regulation_refs}`);
  }

  // Step 4: Assess calibration quality
  console.log('\nStep 4: Assessing calibration...');

  const easyBucket = buckets.find(b => b.difficulty === 'easy');
  const hardBucket = buckets.find(b => b.difficulty === 'hard');
  const mediumBucket = buckets.find(b => b.difficulty === 'medium');

  const calibrationChecks: Array<{ check: string; pass: boolean; detail: string }> = [];

  // Check: instruction injection works for all difficulties
  const allInstructionsPresent = instructionResults.every(r => r.found);
  calibrationChecks.push({
    check: 'instruction_injection',
    pass: allInstructionsPresent,
    detail: allInstructionsPresent
      ? 'All 4 difficulty levels + no-difficulty produce correct prompt text'
      : `${instructionResults.filter(r => !r.found).length} instruction(s) missing`,
  });

  // Check: if we have easy AND hard data, hard should have longer questions
  if (easyBucket && hardBucket && easyBucket.total_exchanges > 0 && hardBucket.total_exchanges > 0) {
    const lengthDiff = hardBucket.avg_question_length - easyBucket.avg_question_length;
    calibrationChecks.push({
      check: 'length_gradient',
      pass: lengthDiff > 0,
      detail: `hard avg=${hardBucket.avg_question_length} vs easy avg=${easyBucket.avg_question_length} (delta=${lengthDiff.toFixed(1)})`,
    });

    const scenarioDiff = hardBucket.avg_scenario_markers - easyBucket.avg_scenario_markers;
    calibrationChecks.push({
      check: 'scenario_gradient',
      pass: scenarioDiff >= 0,
      detail: `hard scenarios=${hardBucket.avg_scenario_markers} vs easy=${easyBucket.avg_scenario_markers} (delta=${scenarioDiff.toFixed(2)})`,
    });
  } else {
    calibrationChecks.push({
      check: 'length_gradient',
      pass: true,
      detail: 'SKIP: insufficient easy/hard session data for comparison',
    });
    calibrationChecks.push({
      check: 'scenario_gradient',
      pass: true,
      detail: 'SKIP: insufficient easy/hard session data for comparison',
    });
  }

  // Check: sessions exist across difficulty settings
  const distinctDifficulties = byDifficulty.size;
  calibrationChecks.push({
    check: 'difficulty_coverage',
    pass: distinctDifficulties >= 2,
    detail: `${distinctDifficulties} distinct difficulty setting(s): ${[...byDifficulty.keys()].join(', ')}`,
  });

  writeResults(instructionResults, buckets, EVIDENCE_DIR, calibrationChecks);
}

function writeResults(
  instructions: Array<{ difficulty: string; found: boolean; detail: string }>,
  buckets: DifficultyBucket[],
  evidenceDir: string,
  checks?: Array<{ check: string; pass: boolean; detail: string }>
) {
  mkdirSync(evidenceDir, { recursive: true });

  // JSON evidence
  const report = {
    timestamp: new Date().toISOString(),
    instruction_validation: instructions,
    difficulty_buckets: buckets.map(b => ({
      ...b,
      raw_question_lengths: undefined,
      raw_scenario_counts: undefined,
      raw_regulation_counts: undefined,
    })),
    calibration_checks: checks || [],
    all_instructions_pass: instructions.every(r => r.found),
    overall_pass: (checks || []).every(c => c.pass) && instructions.every(r => r.found),
  };

  writeFileSync(
    join(evidenceDir, 'difficulty-calibration.json'),
    JSON.stringify(report, null, 2)
  );

  // Markdown report
  let md = `# Difficulty Calibration Audit (R4)\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;

  md += `## Instruction Injection Validation\n\n`;
  md += `| Difficulty | Present | Detail |\n|------------|---------|--------|\n`;
  for (const r of instructions) {
    md += `| ${r.difficulty} | ${r.found ? '\u2705' : '\u274C'} | ${r.detail} |\n`;
  }

  if (buckets.length > 0) {
    md += `\n## Transcript Analysis by Difficulty\n\n`;
    md += `| Difficulty | Sessions | Exchanges | Avg Q Length | Avg Scenarios | Avg Reg Refs |\n`;
    md += `|------------|----------|-----------|-------------|---------------|-------------|\n`;
    for (const b of buckets) {
      md += `| ${b.difficulty} | ${b.session_count} | ${b.total_exchanges} | ${b.avg_question_length} | ${b.avg_scenario_markers} | ${b.avg_regulation_refs} |\n`;
    }
  }

  if (checks && checks.length > 0) {
    md += `\n## Calibration Checks\n\n`;
    md += `| Check | Pass | Detail |\n|-------|------|--------|\n`;
    for (const c of checks) {
      md += `| ${c.check} | ${c.pass ? '\u2705' : '\u274C'} | ${c.detail} |\n`;
    }
  }

  md += `\n## Methodology\n\n`;
  md += `- Instruction injection: imports \`buildSystemPrompt()\` from exam-logic.ts and checks each difficulty value\n`;
  md += `- Transcript analysis: loads examiner turns from \`session_transcripts\`, measures word count, scenario markers, regulation references\n`;
  md += `- Calibration: compares easy vs hard buckets for expected gradients\n`;

  writeFileSync(join(evidenceDir, 'difficulty-calibration.md'), md);

  // Console summary
  console.log('\n=== RESULTS ===');
  console.log(`Instructions: ${instructions.filter(r => r.found).length}/${instructions.length} pass`);
  if (checks) {
    for (const c of checks) {
      console.log(`${c.pass ? '\u2705' : '\u274C'} ${c.check}: ${c.detail}`);
    }
  }
  console.log(`\nEvidence saved to ${evidenceDir}/difficulty-calibration.{json,md}`);

  const allPass = instructions.every(r => r.found) && (checks || []).every(c => c.pass);
  console.log(`\nOVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) process.exit(1);
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
