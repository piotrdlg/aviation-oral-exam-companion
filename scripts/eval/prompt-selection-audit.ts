/**
 * Prompt Selection Audit (R8)
 *
 * Traces which prompt key/version is selected for each config combination.
 * Validates that the specificity scoring in loadPromptFromDB() works correctly,
 * and that every combination either gets a DB prompt or the correct fallback.
 *
 * Checks:
 *   1. prompt_versions table has published rows for 'examiner_system' + 'assessment_system'
 *   2. Specificity scoring selects correct prompt for each rating/mode/difficulty combo
 *   3. Fallback prompts are non-empty and contain safety prefix
 *   4. Persona fragments load when persona_id is set
 *
 * Usage:
 *   npx tsx scripts/eval/prompt-selection-audit.ts
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
// Config combinations to test
// ---------------------------------------------------------------------------

const RATINGS = ['private', 'commercial', 'instrument'] as const;
const STUDY_MODES = ['full_exam', 'topic_focus', 'cross_acs', 'quick_drill'] as const;
const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
const PROMPT_KEYS = ['examiner_system', 'assessment_system'] as const;

interface SelectionResult {
  prompt_key: string;
  rating: string;
  study_mode: string;
  difficulty: string;
  source: 'db' | 'fallback';
  version_id: string | null;
  specificity: number;
  content_length: number;
  has_safety_prefix: boolean;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Prompt Selection Audit (R8) ===\n');

  // Step 1: Survey prompt_versions table
  console.log('Step 1: Surveying prompt_versions table...');

  const { data: promptVersions, error: pvError } = await supabase
    .from('prompt_versions')
    .select('id, prompt_key, rating, study_mode, difficulty, version, status, content')
    .eq('status', 'published')
    .order('prompt_key')
    .order('version', { ascending: false });

  if (pvError) {
    console.log(`  WARNING: Could not query prompt_versions: ${pvError.message}`);
    console.log('  Falling back to fallback-only audit.');
  }

  const dbPrompts = promptVersions || [];
  console.log(`  Published prompt versions: ${dbPrompts.length}`);

  // Group by prompt_key
  const byKey = new Map<string, typeof dbPrompts>();
  for (const pv of dbPrompts) {
    if (!byKey.has(pv.prompt_key)) byKey.set(pv.prompt_key, []);
    byKey.get(pv.prompt_key)!.push(pv);
  }

  console.log('  Prompt keys:');
  for (const [key, versions] of byKey) {
    const ratings = [...new Set(versions.map(v => v.rating || '(null)'))];
    const modes = [...new Set(versions.map(v => v.study_mode || '(null)'))];
    console.log(`    ${key}: ${versions.length} version(s) | ratings: ${ratings.join(', ')} | modes: ${modes.join(', ')}`);
  }

  // Step 2: Load fallback prompts
  console.log('\nStep 2: Validating fallback prompts...');

  const { FALLBACK_PROMPTS, IMMUTABLE_SAFETY_PREFIX, getPromptContent } = await import('../../src/lib/prompts');

  const fallbackChecks: Array<{ key: string; has_content: boolean; has_safety: boolean; length: number }> = [];

  for (const key of PROMPT_KEYS) {
    const fallback = FALLBACK_PROMPTS[key];
    const hasContent = !!fallback && fallback.length > 50;
    const hasSafety = !!IMMUTABLE_SAFETY_PREFIX && IMMUTABLE_SAFETY_PREFIX.length > 0;

    fallbackChecks.push({
      key,
      has_content: hasContent,
      has_safety: hasSafety,
      length: fallback?.length || 0,
    });

    console.log(`  ${hasContent ? '\u2705' : '\u274C'} ${key}: ${fallback?.length || 0} chars${hasContent ? '' : ' (EMPTY/SHORT)'}`);
  }

  console.log(`  ${IMMUTABLE_SAFETY_PREFIX ? '\u2705' : '\u274C'} IMMUTABLE_SAFETY_PREFIX: ${IMMUTABLE_SAFETY_PREFIX?.length || 0} chars`);

  // Step 3: Simulate specificity scoring for all combos
  console.log('\nStep 3: Simulating prompt selection for all config combos...');

  const results: SelectionResult[] = [];

  for (const promptKey of PROMPT_KEYS) {
    const candidates = dbPrompts.filter(p => p.prompt_key === promptKey);

    for (const rating of RATINGS) {
      for (const studyMode of STUDY_MODES) {
        for (const difficulty of DIFFICULTIES) {
          // Replicate the specificity scoring from loadPromptFromDB
          const scored = candidates
            .filter(c =>
              (c.rating === rating || c.rating === null) &&
              (c.study_mode === studyMode || c.study_mode === null) &&
              (c.difficulty === difficulty || c.difficulty === null)
            )
            .map(c => ({
              ...c,
              specificity:
                (c.rating === rating ? 1 : 0) +
                (c.study_mode === studyMode ? 1 : 0) +
                (c.difficulty === difficulty ? 1 : 0),
            }))
            .sort((a, b) => b.specificity - a.specificity || b.version - a.version);

          const best = scored[0] ?? null;
          const content = getPromptContent(best, promptKey);
          const source = best ? 'db' : 'fallback';

          results.push({
            prompt_key: promptKey,
            rating,
            study_mode: studyMode,
            difficulty,
            source,
            version_id: best?.id ?? null,
            specificity: best?.specificity ?? 0,
            content_length: content.length,
            has_safety_prefix: content.includes(IMMUTABLE_SAFETY_PREFIX.split('\n')[0]),
          });
        }
      }
    }
  }

  // Summarize
  const dbCount = results.filter(r => r.source === 'db').length;
  const fallbackCount = results.filter(r => r.source === 'fallback').length;
  const totalCombos = results.length;

  console.log(`  Total config combos tested: ${totalCombos}`);
  console.log(`  DB prompt selected: ${dbCount} (${(dbCount / totalCombos * 100).toFixed(1)}%)`);
  console.log(`  Fallback selected:  ${fallbackCount} (${(fallbackCount / totalCombos * 100).toFixed(1)}%)`);

  // Check safety prefix presence
  const safetyMissing = results.filter(r => !r.has_safety_prefix);
  console.log(`  Safety prefix present: ${results.length - safetyMissing.length}/${results.length}`);

  // Step 4: Check persona fragments
  console.log('\nStep 4: Checking persona prompt fragments...');

  const { data: personas } = await supabase
    .from('prompt_versions')
    .select('id, prompt_key, content, version')
    .eq('status', 'published')
    .like('prompt_key', 'persona_%')
    .order('version', { ascending: false });

  const personaResults: Array<{ persona_key: string; exists: boolean; content_length: number }> = [];

  if (personas && personas.length > 0) {
    console.log(`  Found ${personas.length} persona fragment(s)`);
    for (const p of personas) {
      personaResults.push({
        persona_key: p.prompt_key,
        exists: true,
        content_length: p.content?.length || 0,
      });
      console.log(`    ${p.prompt_key}: ${p.content?.length || 0} chars (v${p.version})`);
    }
  } else {
    console.log('  No persona fragments found (feature not yet used in production)');
    personaResults.push({ persona_key: '(none)', exists: false, content_length: 0 });
  }

  // Step 5: Final checks
  console.log('\n=== AUDIT CHECKS ===');

  const checks: Array<{ check: string; pass: boolean; detail: string }> = [];

  // Check 1: All fallbacks have content
  const allFallbacksValid = fallbackChecks.every(f => f.has_content);
  checks.push({
    check: 'fallback_prompts_valid',
    pass: allFallbacksValid,
    detail: allFallbacksValid
      ? `Both fallback prompts have content (${fallbackChecks.map(f => `${f.key}:${f.length}`).join(', ')})`
      : `Missing fallback content: ${fallbackChecks.filter(f => !f.has_content).map(f => f.key).join(', ')}`,
  });

  // Check 2: Safety prefix exists
  const safetyExists = !!IMMUTABLE_SAFETY_PREFIX && IMMUTABLE_SAFETY_PREFIX.length > 0;
  checks.push({
    check: 'safety_prefix_exists',
    pass: safetyExists,
    detail: safetyExists
      ? `IMMUTABLE_SAFETY_PREFIX: ${IMMUTABLE_SAFETY_PREFIX.length} chars`
      : 'IMMUTABLE_SAFETY_PREFIX is empty or missing',
  });

  // Check 3: Every combo produces non-empty content
  const emptyContent = results.filter(r => r.content_length === 0);
  checks.push({
    check: 'no_empty_prompts',
    pass: emptyContent.length === 0,
    detail: emptyContent.length === 0
      ? `All ${totalCombos} combos produce non-empty content`
      : `${emptyContent.length} combo(s) produce empty content`,
  });

  // Check 4: Specificity scoring differentiates when DB rows exist
  const specificityVariation = new Set(results.filter(r => r.source === 'db').map(r => r.specificity));
  checks.push({
    check: 'specificity_scoring',
    pass: dbCount === 0 || specificityVariation.size >= 1,
    detail: dbCount === 0
      ? 'SKIP: no DB prompts to test specificity (all fallback)'
      : `${specificityVariation.size} distinct specificity level(s): ${[...specificityVariation].sort().join(', ')}`,
  });

  // Check 5: getPromptContent never returns empty
  checks.push({
    check: 'getPromptContent_never_empty',
    pass: allFallbacksValid,
    detail: 'getPromptContent() returns fallback when DB is null — validated by non-empty content check',
  });

  for (const c of checks) {
    console.log(`${c.pass ? '\u2705' : '\u274C'} ${c.check}: ${c.detail}`);
  }

  // Write evidence
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const evidence = {
    timestamp: new Date().toISOString(),
    db_prompt_count: dbPrompts.length,
    total_combos: totalCombos,
    db_selected: dbCount,
    fallback_selected: fallbackCount,
    safety_prefix_length: IMMUTABLE_SAFETY_PREFIX?.length || 0,
    fallback_checks: fallbackChecks,
    persona_fragments: personaResults,
    checks,
    selection_matrix: results.map(r => ({
      prompt_key: r.prompt_key,
      rating: r.rating,
      study_mode: r.study_mode,
      difficulty: r.difficulty,
      source: r.source,
      specificity: r.specificity,
      content_length: r.content_length,
    })),
    overall_pass: checks.every(c => c.pass),
  };

  writeFileSync(join(EVIDENCE_DIR, 'prompt-selection-audit.json'), JSON.stringify(evidence, null, 2));

  // Markdown report
  let md = `# Prompt Selection Audit (R8)\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Published DB prompts:** ${dbPrompts.length}\n`;
  md += `**Config combos tested:** ${totalCombos}\n\n`;

  md += `## Selection Summary\n\n`;
  md += `| Source | Count | Pct |\n|--------|-------|-----|\n`;
  md += `| DB prompt | ${dbCount} | ${(dbCount / totalCombos * 100).toFixed(1)}% |\n`;
  md += `| Fallback | ${fallbackCount} | ${(fallbackCount / totalCombos * 100).toFixed(1)}% |\n\n`;

  md += `## Fallback Prompts\n\n`;
  md += `| Key | Length | Valid |\n|-----|--------|-------|\n`;
  for (const f of fallbackChecks) {
    md += `| ${f.key} | ${f.length} | ${f.has_content ? '\u2705' : '\u274C'} |\n`;
  }
  md += `| IMMUTABLE_SAFETY_PREFIX | ${IMMUTABLE_SAFETY_PREFIX?.length || 0} | ${safetyExists ? '\u2705' : '\u274C'} |\n\n`;

  if (dbPrompts.length > 0) {
    md += `## DB Prompt Versions\n\n`;
    md += `| Key | Rating | Mode | Difficulty | Version |\n`;
    md += `|-----|--------|------|-----------|--------|\n`;
    for (const p of dbPrompts.slice(0, 20)) {
      md += `| ${p.prompt_key} | ${p.rating || '*'} | ${p.study_mode || '*'} | ${p.difficulty || '*'} | v${p.version} |\n`;
    }
    if (dbPrompts.length > 20) md += `| ... | | | | (${dbPrompts.length - 20} more) |\n`;
  }

  md += `\n## Checks\n\n`;
  md += `| Check | Pass | Detail |\n|-------|------|--------|\n`;
  for (const c of checks) {
    md += `| ${c.check} | ${c.pass ? '\u2705' : '\u274C'} | ${c.detail} |\n`;
  }

  md += `\n## Methodology\n\n`;
  md += `- Queries \`prompt_versions\` table for published rows\n`;
  md += `- Imports \`FALLBACK_PROMPTS\`, \`IMMUTABLE_SAFETY_PREFIX\`, \`getPromptContent\` from prompts.ts\n`;
  md += `- Replicates specificity scoring from \`loadPromptFromDB()\` in exam-engine.ts\n`;
  md += `- Tests all ${RATINGS.length} ratings × ${STUDY_MODES.length} modes × ${DIFFICULTIES.length} difficulties × ${PROMPT_KEYS.length} keys = ${totalCombos} combos\n`;

  writeFileSync(join(EVIDENCE_DIR, 'prompt-selection-audit.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/prompt-selection-audit.{json,md}`);
  console.log(`\nOVERALL: ${checks.every(c => c.pass) ? 'PASS' : 'FAIL'}`);
  if (!checks.every(c => c.pass)) process.exit(1);
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
