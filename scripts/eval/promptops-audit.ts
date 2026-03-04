/**
 * PromptOps Governance Audit
 *
 * Phase 14 — verifies prompt version inventory, coverage matrix,
 * version ambiguity, and required key presence.
 *
 * Usage: npx tsx scripts/eval/promptops-audit.ts
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

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-11-phase14/eval');

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const RATINGS = ['private', 'commercial', 'instrument'] as const;
const STUDY_MODES = ['full_exam', 'topic_focus', 'cross_acs', 'quick_drill'] as const;
const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
const PROMPT_KEYS = ['examiner_system', 'assessment_system'] as const;

const REQUIRED_KEYS = [
  'examiner_system',
  'assessment_system',
  'persona_maria_torres',
  'persona_bob_mitchell',
  'persona_jim_hayes',
  'persona_karen_sullivan',
] as const;

const REQUIRED_PERSONAS = [
  'persona_maria_torres',
  'persona_bob_mitchell',
  'persona_jim_hayes',
  'persona_karen_sullivan',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromptRow {
  id: string;
  prompt_key: string;
  rating: string | null;
  study_mode: string | null;
  difficulty: string | null;
  version: number;
  status: string;
  content: string;
}

interface CheckResult {
  check: string;
  pass: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== PromptOps Governance Audit (Phase 14) ===\n');

  // Fetch ALL rows from prompt_versions (not just published)
  const { data: allRows, error } = await supabase
    .from('prompt_versions')
    .select('id, prompt_key, rating, study_mode, difficulty, version, status, content')
    .order('prompt_key')
    .order('version', { ascending: false });

  if (error) {
    console.error(`FATAL: Could not query prompt_versions: ${error.message}`);
    process.exit(1);
  }

  const rows: PromptRow[] = allRows || [];
  console.log(`Total prompt_versions rows: ${rows.length}\n`);

  const checks: CheckResult[] = [];

  // =========================================================================
  // Check 1: Row counts by prompt_key
  // =========================================================================
  console.log('--- Check 1: Row counts by prompt_key ---');

  const countsByKeyStatus = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!countsByKeyStatus.has(row.prompt_key)) {
      countsByKeyStatus.set(row.prompt_key, new Map());
    }
    const statusMap = countsByKeyStatus.get(row.prompt_key)!;
    statusMap.set(row.status, (statusMap.get(row.status) || 0) + 1);
  }

  const keyCountLines: string[] = [];
  for (const [key, statusMap] of [...countsByKeyStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const parts: string[] = [];
    for (const [status, count] of [...statusMap.entries()].sort()) {
      parts.push(`${status}=${count}`);
    }
    const line = `  ${key}: ${parts.join(', ')}`;
    keyCountLines.push(line);
    console.log(line);
  }

  const totalKeys = countsByKeyStatus.size;
  checks.push({
    check: 'row_counts_by_key',
    pass: totalKeys > 0,
    detail: totalKeys > 0
      ? `${totalKeys} distinct prompt_key(s) found across ${rows.length} total rows`
      : 'No rows found in prompt_versions table',
  });

  // =========================================================================
  // Check 2: Coverage matrix
  // =========================================================================
  console.log('\n--- Check 2: Coverage matrix ---');

  const publishedRows = rows.filter(r => r.status === 'published');

  // For each combo of (rating x study_mode x difficulty x prompt_key),
  // check if there's a published row with specificity > 0
  let totalCombos = 0;
  let wildcardOnlyCombos = 0;
  const wildcardComboDetails: string[] = [];

  for (const promptKey of PROMPT_KEYS) {
    const candidates = publishedRows.filter(r => r.prompt_key === promptKey);

    for (const rating of RATINGS) {
      for (const studyMode of STUDY_MODES) {
        for (const difficulty of DIFFICULTIES) {
          totalCombos++;

          // Find matching candidates (same logic as loadPromptFromDB)
          const matching = candidates.filter(c =>
            (c.rating === rating || c.rating === null) &&
            (c.study_mode === studyMode || c.study_mode === null) &&
            (c.difficulty === difficulty || c.difficulty === null)
          );

          // Check if any match has specificity > 0 (at least one exact dimension match)
          const hasSpecific = matching.some(c => {
            const specificity =
              (c.rating === rating ? 1 : 0) +
              (c.study_mode === studyMode ? 1 : 0) +
              (c.difficulty === difficulty ? 1 : 0);
            return specificity > 0;
          });

          if (!hasSpecific) {
            wildcardOnlyCombos++;
            wildcardComboDetails.push(`${promptKey}/${rating}/${studyMode}/${difficulty}`);
          }
        }
      }
    }
  }

  const coveredCombos = totalCombos - wildcardOnlyCombos;
  const coveragePct = totalCombos > 0 ? ((coveredCombos / totalCombos) * 100).toFixed(1) : '0.0';

  console.log(`  Total combos: ${totalCombos}`);
  console.log(`  Covered (specificity > 0): ${coveredCombos} (${coveragePct}%)`);
  console.log(`  Wildcard/fallback only: ${wildcardOnlyCombos}`);
  if (wildcardOnlyCombos > 0 && wildcardOnlyCombos <= 10) {
    for (const detail of wildcardComboDetails) {
      console.log(`    - ${detail}`);
    }
  } else if (wildcardOnlyCombos > 10) {
    for (const detail of wildcardComboDetails.slice(0, 5)) {
      console.log(`    - ${detail}`);
    }
    console.log(`    ... and ${wildcardOnlyCombos - 5} more`);
  }

  checks.push({
    check: 'coverage_matrix',
    pass: true, // Informational — wildcard fallback is acceptable
    detail: `${coveredCombos}/${totalCombos} combos have specificity > 0; ${wildcardOnlyCombos} rely on wildcard/fallback`,
  });

  // =========================================================================
  // Check 3: Version ambiguity
  // =========================================================================
  console.log('\n--- Check 3: Version ambiguity ---');

  // Group published rows by (prompt_key, rating, study_mode, difficulty)
  const publishedGroups = new Map<string, PromptRow[]>();
  for (const row of publishedRows) {
    const groupKey = `${row.prompt_key}|${row.rating ?? '*'}|${row.study_mode ?? '*'}|${row.difficulty ?? '*'}`;
    if (!publishedGroups.has(groupKey)) {
      publishedGroups.set(groupKey, []);
    }
    publishedGroups.get(groupKey)!.push(row);
  }

  const ambiguousGroups: Array<{ groupKey: string; count: number; versions: number[] }> = [];
  for (const [groupKey, groupRows] of publishedGroups) {
    if (groupRows.length > 1) {
      ambiguousGroups.push({
        groupKey,
        count: groupRows.length,
        versions: groupRows.map(r => r.version).sort((a, b) => b - a),
      });
    }
  }

  if (ambiguousGroups.length === 0) {
    console.log('  No ambiguous groups found.');
  } else {
    console.log(`  WARNING: ${ambiguousGroups.length} ambiguous group(s) found:`);
    for (const ag of ambiguousGroups) {
      console.log(`    ${ag.groupKey}: ${ag.count} published rows (versions: ${ag.versions.join(', ')})`);
    }
  }

  checks.push({
    check: 'version_ambiguity',
    pass: ambiguousGroups.length === 0,
    detail: ambiguousGroups.length === 0
      ? 'No (prompt_key, rating, study_mode, difficulty) groups have multiple published rows'
      : `${ambiguousGroups.length} group(s) have multiple published rows: ${ambiguousGroups.map(ag => ag.groupKey).join('; ')}`,
  });

  // =========================================================================
  // Check 4: Required prompt keys
  // =========================================================================
  console.log('\n--- Check 4: Required prompt keys ---');

  const publishedKeySet = new Set(publishedRows.map(r => r.prompt_key));
  const missingKeys: string[] = [];

  for (const reqKey of REQUIRED_KEYS) {
    const hasPublished = publishedKeySet.has(reqKey);
    const status = hasPublished ? 'PASS' : 'FAIL';
    console.log(`  ${hasPublished ? '\u2705' : '\u274C'} ${reqKey}: ${status}`);
    if (!hasPublished) missingKeys.push(reqKey);
  }

  checks.push({
    check: 'required_prompt_keys',
    pass: missingKeys.length === 0,
    detail: missingKeys.length === 0
      ? `All ${REQUIRED_KEYS.length} required prompt keys have at least 1 published row`
      : `Missing published rows for: ${missingKeys.join(', ')}`,
  });

  // =========================================================================
  // Check 5: Persona coverage
  // =========================================================================
  console.log('\n--- Check 5: Persona coverage ---');

  const publishedPersonas = publishedRows.filter(r => r.prompt_key.startsWith('persona_'));
  const publishedPersonaKeys = new Set(publishedPersonas.map(r => r.prompt_key));
  const missingPersonas: string[] = [];

  for (const personaKey of REQUIRED_PERSONAS) {
    const exists = publishedPersonaKeys.has(personaKey);
    console.log(`  ${exists ? '\u2705' : '\u274C'} ${personaKey}: ${exists ? 'present' : 'MISSING'}`);
    if (!exists) missingPersonas.push(personaKey);
  }

  console.log(`  Published persona prompts: ${publishedPersonas.length}`);

  checks.push({
    check: 'persona_coverage',
    pass: missingPersonas.length === 0,
    detail: missingPersonas.length === 0
      ? `All ${REQUIRED_PERSONAS.length} persona prompts found (${publishedPersonas.length} total published persona rows)`
      : `Missing persona(s): ${missingPersonas.join(', ')} (${publishedPersonas.length} published persona rows found)`,
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n=== AUDIT CHECKS ===');

  for (const c of checks) {
    console.log(`${c.pass ? '\u2705' : '\u274C'} ${c.check}: ${c.detail}`);
  }

  const overallPass = checks.every(c => c.pass);

  // =========================================================================
  // Write evidence files
  // =========================================================================
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // --- JSON ---
  const evidence = {
    timestamp: new Date().toISOString(),
    total_rows: rows.length,
    row_counts_by_key: Object.fromEntries(
      [...countsByKeyStatus.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, statusMap]) => [
        key,
        Object.fromEntries([...statusMap.entries()].sort()),
      ])
    ),
    coverage_matrix: {
      total_combos: totalCombos,
      covered_combos: coveredCombos,
      wildcard_only_combos: wildcardOnlyCombos,
      wildcard_combo_details: wildcardComboDetails,
    },
    version_ambiguity: {
      ambiguous_group_count: ambiguousGroups.length,
      groups: ambiguousGroups,
    },
    required_keys: {
      required: [...REQUIRED_KEYS],
      missing: missingKeys,
    },
    persona_coverage: {
      required: [...REQUIRED_PERSONAS],
      missing: missingPersonas,
      published_count: publishedPersonas.length,
    },
    checks,
    overall_pass: overallPass,
  };

  writeFileSync(join(EVIDENCE_DIR, 'promptops-audit.json'), JSON.stringify(evidence, null, 2));

  // --- Markdown ---
  let md = `# PromptOps Governance Audit (Phase 14)\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Total prompt_versions rows:** ${rows.length}\n`;
  md += `**Overall result:** ${overallPass ? 'PASS' : 'FAIL'}\n\n`;

  md += `## Check 1: Row Counts by prompt_key\n\n`;
  md += `| prompt_key | draft | published | archived |\n`;
  md += `|------------|-------|-----------|----------|\n`;
  for (const [key, statusMap] of [...countsByKeyStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| ${key} | ${statusMap.get('draft') || 0} | ${statusMap.get('published') || 0} | ${statusMap.get('archived') || 0} |\n`;
  }

  md += `\n## Check 2: Coverage Matrix\n\n`;
  md += `Dimensions: ${RATINGS.length} ratings x ${STUDY_MODES.length} modes x ${DIFFICULTIES.length} difficulties x ${PROMPT_KEYS.length} keys = ${totalCombos} combos\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total combos | ${totalCombos} |\n`;
  md += `| Covered (specificity > 0) | ${coveredCombos} (${coveragePct}%) |\n`;
  md += `| Wildcard/fallback only | ${wildcardOnlyCombos} |\n`;
  if (wildcardOnlyCombos > 0) {
    md += `\n<details><summary>Wildcard-only combos (${wildcardOnlyCombos})</summary>\n\n`;
    for (const detail of wildcardComboDetails) {
      md += `- \`${detail}\`\n`;
    }
    md += `\n</details>\n`;
  }

  md += `\n## Check 3: Version Ambiguity\n\n`;
  if (ambiguousGroups.length === 0) {
    md += `No ambiguous groups found.\n`;
  } else {
    md += `**WARNING:** ${ambiguousGroups.length} group(s) have multiple published rows:\n\n`;
    md += `| Group Key | Published Count | Versions |\n`;
    md += `|-----------|-----------------|----------|\n`;
    for (const ag of ambiguousGroups) {
      md += `| \`${ag.groupKey}\` | ${ag.count} | ${ag.versions.join(', ')} |\n`;
    }
  }

  md += `\n## Check 4: Required Prompt Keys\n\n`;
  md += `| Key | Status |\n`;
  md += `|-----|--------|\n`;
  for (const reqKey of REQUIRED_KEYS) {
    const present = publishedKeySet.has(reqKey);
    md += `| ${reqKey} | ${present ? '\u2705 Present' : '\u274C Missing'} |\n`;
  }

  md += `\n## Check 5: Persona Coverage\n\n`;
  md += `Published persona prompts: ${publishedPersonas.length}\n\n`;
  md += `| Persona | Status |\n`;
  md += `|---------|--------|\n`;
  for (const personaKey of REQUIRED_PERSONAS) {
    const present = publishedPersonaKeys.has(personaKey);
    md += `| ${personaKey} | ${present ? '\u2705 Present' : '\u274C Missing'} |\n`;
  }

  md += `\n## Summary\n\n`;
  md += `| Check | Pass | Detail |\n`;
  md += `|-------|------|--------|\n`;
  for (const c of checks) {
    md += `| ${c.check} | ${c.pass ? '\u2705' : '\u274C'} | ${c.detail} |\n`;
  }

  md += `\n## Methodology\n\n`;
  md += `- Queries all rows from \`prompt_versions\` table (draft, published, archived)\n`;
  md += `- Check 1: Counts rows by \`prompt_key\` and \`status\`\n`;
  md += `- Check 2: Tests ${totalCombos} combos (${RATINGS.length} ratings x ${STUDY_MODES.length} modes x ${DIFFICULTIES.length} difficulties x ${PROMPT_KEYS.length} keys) for published rows with specificity > 0\n`;
  md += `- Check 3: Finds (prompt_key, rating, study_mode, difficulty) groups with multiple published rows\n`;
  md += `- Check 4: Verifies ${REQUIRED_KEYS.length} required keys each have at least 1 published row\n`;
  md += `- Check 5: Verifies all ${REQUIRED_PERSONAS.length} persona prompts exist as published\n`;

  writeFileSync(join(EVIDENCE_DIR, 'promptops-audit.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/promptops-audit.{json,md}`);
  console.log(`\nOVERALL: ${overallPass ? 'PASS' : 'FAIL'}`);

  if (!overallPass) process.exit(1);
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
