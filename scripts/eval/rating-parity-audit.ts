/**
 * Rating Parity Audit
 *
 * Queries production DB to verify equal support for all 3 active ratings:
 * private, commercial, instrument.
 *
 * Checks:
 *   1. ACS coverage by rating (areas, tasks, elements)
 *   2. Session counts by rating
 *   3. examResultV2 counts by rating
 *   4. Quick drill support by rating
 *   5. Prompt coverage by rating
 *   6. System config by rating
 *
 * Usage:
 *   npx tsx scripts/eval/rating-parity-audit.ts
 *
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

config({ path: resolve(__dirname, '../../.env.local') });

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-08-parity/sql');

const RATINGS = ['private', 'commercial', 'instrument'] as const;
type ActiveRating = typeof RATINGS[number];

interface RatingDBMetrics {
  rating: string;
  acs: {
    tasks: number;
    elements: number;
    areas: string[];
  };
  sessions: {
    total: number;
    completed: number;
    withResultV2: number;
    quickDrill: number;
  };
  prompts: {
    examiner: number;
    assessment: number;
    total: number;
  };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceKey) {
    console.error('FAIL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log('=== Rating Parity Audit — Database ===\n');

  const results: Record<string, RatingDBMetrics> = {};

  // -----------------------------------------------------------------------
  // 1. ACS Coverage by Rating
  // -----------------------------------------------------------------------
  console.log('1. ACS Coverage by Rating...');

  const RATING_PREFIXES: Record<string, string> = {
    private: 'PA.', commercial: 'CA.', instrument: 'IR.',
  };

  for (const rating of RATINGS) {
    const prefix = RATING_PREFIXES[rating];

    // Count tasks
    const { count: taskCount } = await supabase
      .from('acs_tasks')
      .select('*', { count: 'exact', head: true })
      .like('id', `${prefix}%`);

    // Count elements
    const { count: elementCount } = await supabase
      .from('acs_elements')
      .select('*', { count: 'exact', head: true })
      .like('code', `${prefix}%`);

    // Get distinct areas
    const { data: tasks } = await supabase
      .from('acs_tasks')
      .select('area')
      .like('id', `${prefix}%`);

    const areas = [...new Set((tasks || []).map(t => t.area as string))].sort();

    results[rating] = {
      rating,
      acs: { tasks: taskCount || 0, elements: elementCount || 0, areas },
      sessions: { total: 0, completed: 0, withResultV2: 0, quickDrill: 0 },
      prompts: { examiner: 0, assessment: 0, total: 0 },
    };

    console.log(`  ${rating}: ${taskCount} tasks, ${elementCount} elements, areas: [${areas.join(', ')}]`);
  }

  // -----------------------------------------------------------------------
  // 2. Session Counts by Rating
  // -----------------------------------------------------------------------
  console.log('\n2. Session Counts by Rating...');

  for (const rating of RATINGS) {
    // Total sessions
    const { count: total } = await supabase
      .from('exam_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('rating', rating);

    // Completed sessions
    const { count: completed } = await supabase
      .from('exam_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('rating', rating)
      .eq('status', 'completed');

    // Sessions with resultV2
    const { data: v2Sessions } = await supabase
      .from('exam_sessions')
      .select('id, metadata')
      .eq('rating', rating)
      .eq('status', 'completed');

    const withV2 = (v2Sessions || []).filter(s => {
      const meta = s.metadata as Record<string, unknown> | null;
      return meta?.examResultV2 != null;
    }).length;

    // Quick drill sessions
    const { data: qdSessions } = await supabase
      .from('exam_sessions')
      .select('id, metadata')
      .eq('rating', rating);

    const quickDrill = (qdSessions || []).filter(s => {
      const meta = s.metadata as Record<string, unknown> | null;
      const config = meta?.sessionConfig as Record<string, unknown> | undefined;
      return config?.studyMode === 'quick_drill';
    }).length;

    results[rating].sessions = { total: total || 0, completed: completed || 0, withResultV2: withV2, quickDrill };
    console.log(`  ${rating}: total=${total || 0}, completed=${completed || 0}, v2=${withV2}, quick_drill=${quickDrill}`);
  }

  // -----------------------------------------------------------------------
  // 3. Prompt Coverage by Rating
  // -----------------------------------------------------------------------
  console.log('\n3. Prompt Coverage...');

  const { data: prompts } = await supabase
    .from('prompt_versions')
    .select('prompt_key, rating, study_mode, difficulty, status')
    .eq('status', 'published');

  for (const rating of RATINGS) {
    const forRating = (prompts || []).filter(p =>
      p.rating === rating || p.rating === null || p.rating === ''
    );
    const examiner = forRating.filter(p => p.prompt_key === 'examiner_system').length;
    const assessment = forRating.filter(p => p.prompt_key === 'assessment_system').length;
    results[rating].prompts = { examiner, assessment, total: forRating.length };
    console.log(`  ${rating}: examiner=${examiner}, assessment=${assessment}, total=${forRating.length}`);
  }

  // -----------------------------------------------------------------------
  // 4. System Config Check
  // -----------------------------------------------------------------------
  console.log('\n4. System Config...');

  const { data: configRows } = await supabase
    .from('system_config')
    .select('key, value');

  const configKeys = (configRows || []).map(r => r.key);
  console.log(`  Config keys: [${configKeys.join(', ')}]`);
  const ratingSpecific = configKeys.filter(k =>
    k.includes('private') || k.includes('commercial') || k.includes('instrument')
  );
  console.log(`  Rating-specific config keys: [${ratingSpecific.join(', ') || 'none'}]`);

  // -----------------------------------------------------------------------
  // Summary Table
  // -----------------------------------------------------------------------
  console.log('\n=== PARITY SUMMARY TABLE ===\n');
  console.log('| Rating | Tasks | Elements | Areas | Sessions | Completed | V2 | QuickDrill | Prompts |');
  console.log('|--------|-------|----------|-------|----------|-----------|----|-----------:|---------|');

  for (const rating of RATINGS) {
    const r = results[rating];
    console.log(
      `| ${rating} | ${r.acs.tasks} | ${r.acs.elements} | ${r.acs.areas.length} | ${r.sessions.total} | ${r.sessions.completed} | ${r.sessions.withResultV2} | ${r.sessions.quickDrill} | ${r.prompts.total} |`
    );
  }

  // -----------------------------------------------------------------------
  // Parity Checks
  // -----------------------------------------------------------------------
  console.log('\n=== PARITY CHECKS ===\n');

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // Check: all ratings have ACS tasks
  const allHaveTasks = RATINGS.every(r => results[r].acs.tasks > 0);
  checks.push({
    name: 'acs_tasks_populated',
    pass: allHaveTasks,
    detail: RATINGS.map(r => `${r}=${results[r].acs.tasks}`).join(', '),
  });

  // Check: all ratings have ACS elements
  const allHaveElements = RATINGS.every(r => results[r].acs.elements > 0);
  checks.push({
    name: 'acs_elements_populated',
    pass: allHaveElements,
    detail: RATINGS.map(r => `${r}=${results[r].acs.elements}`).join(', '),
  });

  // Check: prompts serve all ratings (via null/wildcard matching)
  const allHavePrompts = RATINGS.every(r => results[r].prompts.total > 0);
  checks.push({
    name: 'prompts_serve_all',
    pass: allHavePrompts,
    detail: RATINGS.map(r => `${r}=${results[r].prompts.total}`).join(', '),
  });

  // Check: no rating has zero sessions (usage evidence)
  const allHaveSessions = RATINGS.every(r => results[r].sessions.total > 0);
  checks.push({
    name: 'sessions_exist_all',
    pass: allHaveSessions,
    detail: RATINGS.map(r => `${r}=${results[r].sessions.total}`).join(', '),
  });

  for (const c of checks) {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  const allPass = checks.every(c => c.pass);
  console.log(`\nOVERALL DB PARITY: ${allPass ? 'PASS' : 'ISSUES FOUND'}`);

  // -----------------------------------------------------------------------
  // Save Evidence
  // -----------------------------------------------------------------------
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    ratings: results,
    checks,
    overall_pass: allPass,
    config_keys: configKeys,
    rating_specific_config: ratingSpecific,
  };

  writeFileSync(join(EVIDENCE_DIR, 'rating-parity-db.json'), JSON.stringify(report, null, 2));

  // Markdown
  let md = `# Rating Parity — Database Audit\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
  md += `## Parity Table\n\n`;
  md += `| Rating | Tasks | Elements | Areas | Sessions | Completed | V2 | QuickDrill | Prompts |\n`;
  md += `|--------|-------|----------|-------|----------|-----------|----|-----------:|--------|\n`;
  for (const rating of RATINGS) {
    const r = results[rating];
    md += `| ${rating} | ${r.acs.tasks} | ${r.acs.elements} | ${r.acs.areas.length} | ${r.sessions.total} | ${r.sessions.completed} | ${r.sessions.withResultV2} | ${r.sessions.quickDrill} | ${r.prompts.total} |\n`;
  }
  md += `\n## Checks\n\n`;
  for (const c of checks) {
    md += `- ${c.pass ? '✅' : '❌'} **${c.name}**: ${c.detail}\n`;
  }
  md += `\n## Overall: ${allPass ? 'PASS' : 'ISSUES FOUND'}\n`;

  writeFileSync(join(EVIDENCE_DIR, 'rating-parity-db.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/rating-parity-db.{json,md}`);

  if (!allPass) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
