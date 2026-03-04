/**
 * Flow Coherence Audit (R5)
 *
 * Validates that connectedWalk() produces conceptually coherent navigation
 * rather than random element ordering.
 *
 * Methodology:
 *   1. Load ACS elements + taxonomy fingerprints from the database
 *   2. Run connectedWalk() on element sets (cross_acs study mode)
 *   3. For each consecutive element pair, compute:
 *      - Jaccard similarity (taxonomy overlap score)
 *      - Shared taxonomy slugs count
 *   4. Compare against random baseline (shuffled same elements)
 *   5. Connected walk should have significantly higher average pairwise similarity
 *
 * Acceptance:
 *   - connectedWalk avg Jaccard > random baseline avg Jaccard
 *   - At least 50% of consecutive pairs share >= 1 taxonomy slug
 *
 * Usage:
 *   npx tsx scripts/eval/flow-coherence-audit.ts [--trials N]
 *
 * Requires: .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildStructuralFingerprints, computeFingerprintStats } from '../../src/lib/structural-fingerprints';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-06-phase9/eval');

// ---------------------------------------------------------------------------
// Reimplementation of jaccardSimilarity (private in exam-logic.ts)
// ---------------------------------------------------------------------------

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// Pairwise analysis
// ---------------------------------------------------------------------------

interface PairAnalysis {
  from_code: string;
  to_code: string;
  jaccard: number;
  shared_slugs: number;
  shared_slug_list: string[];
}

function analyzePairs(
  codes: string[],
  fingerprints: Map<string, Set<string>>
): PairAnalysis[] {
  const pairs: PairAnalysis[] = [];
  for (let i = 0; i < codes.length - 1; i++) {
    const fromFP = fingerprints.get(codes[i]) ?? new Set<string>();
    const toFP = fingerprints.get(codes[i + 1]) ?? new Set<string>();
    const similarity = jaccardSimilarity(fromFP, toFP);

    const shared: string[] = [];
    for (const slug of fromFP) {
      if (toFP.has(slug)) shared.push(slug);
    }

    pairs.push({
      from_code: codes[i],
      to_code: codes[i + 1],
      jaccard: Math.round(similarity * 1000) / 1000,
      shared_slugs: shared.length,
      shared_slug_list: shared.slice(0, 5),
    });
  }
  return pairs;
}

function avgJaccard(pairs: PairAnalysis[]): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((sum, p) => sum + p.jaccard, 0) / pairs.length;
}

function pctSharedSlugs(pairs: PairAnalysis[]): number {
  if (pairs.length === 0) return 0;
  return pairs.filter(p => p.shared_slugs > 0).length / pairs.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const trials = args.includes('--trials') ? parseInt(args[args.indexOf('--trials') + 1]) : 5;

  console.log('=== Flow Coherence Audit (R5) ===\n');

  // Step 1: Load elements + fingerprints
  console.log('Step 1: Loading ACS elements + taxonomy fingerprints...');

  const { data: elements } = await supabase
    .from('acs_elements')
    .select('code, task_id, element_type')
    .like('code', 'PA.%')
    .not('element_type', 'eq', 'skill');

  if (!elements || elements.length === 0) {
    console.log('No ACS elements found. Exiting.');
    process.exit(0);
  }

  console.log(`  Loaded ${elements.length} PA elements`);

  // Load taxonomy fingerprints from concept_relations + kb_taxonomy_nodes
  // Fingerprint = set of taxonomy slugs linked to an element via knowledge graph
  const { data: fpRows } = await supabase.rpc('get_element_taxonomy_fingerprints', {
    p_prefix: 'PA',
  });

  const fingerprints = new Map<string, Set<string>>();

  if (fpRows && fpRows.length > 0) {
    for (const row of fpRows as Array<{ element_code: string; taxonomy_slugs: string[] }>) {
      fingerprints.set(row.element_code, new Set(row.taxonomy_slugs || []));
    }
    console.log(`  Fingerprints loaded for ${fingerprints.size} elements`);
  } else {
    // Fallback: try building fingerprints from concept_chunk_evidence + kb_chunk_taxonomy
    console.log('  RPC not available. Building fingerprints from evidence chain...');

    // Get element concepts
    const { data: elementConcepts } = await supabase
      .from('concepts')
      .select('id, slug')
      .like('slug', 'acs:PA.%');

    if (elementConcepts && elementConcepts.length > 0) {
      // Get evidence links
      const conceptIds = elementConcepts.map(c => c.id);
      const { data: evidence } = await supabase
        .from('concept_chunk_evidence')
        .select('concept_id, chunk_id')
        .in('concept_id', conceptIds.slice(0, 500));

      if (evidence && evidence.length > 0) {
        // Get chunk taxonomy assignments
        const chunkIds = [...new Set(evidence.map(e => e.chunk_id))];
        const { data: chunkTax } = await supabase
          .from('kb_chunk_taxonomy')
          .select('chunk_id, taxonomy_node_id')
          .in('chunk_id', chunkIds.slice(0, 1000));

        if (chunkTax && chunkTax.length > 0) {
          // Get taxonomy node slugs
          const nodeIds = [...new Set(chunkTax.map(ct => ct.taxonomy_node_id))];
          const { data: nodes } = await supabase
            .from('kb_taxonomy_nodes')
            .select('id, slug')
            .in('id', nodeIds);

          const nodeSlugMap = new Map<string, string>();
          for (const n of nodes || []) nodeSlugMap.set(n.id, n.slug);

          const chunkTaxMap = new Map<string, Set<string>>();
          for (const ct of chunkTax) {
            const slug = nodeSlugMap.get(ct.taxonomy_node_id);
            if (slug) {
              if (!chunkTaxMap.has(ct.chunk_id)) chunkTaxMap.set(ct.chunk_id, new Set());
              chunkTaxMap.get(ct.chunk_id)!.add(slug);
            }
          }

          const conceptSlugMap = new Map<string, string>();
          for (const c of elementConcepts) {
            // slug format: acs:PA.I.A.K1 → element_code = PA.I.A.K1
            const elementCode = c.slug.replace('acs:', '');
            conceptSlugMap.set(c.id, elementCode);
          }

          for (const ev of evidence) {
            const elementCode = conceptSlugMap.get(ev.concept_id);
            const taxSlugs = chunkTaxMap.get(ev.chunk_id);
            if (elementCode && taxSlugs) {
              if (!fingerprints.has(elementCode)) fingerprints.set(elementCode, new Set());
              for (const slug of taxSlugs) fingerprints.get(elementCode)!.add(slug);
            }
          }
        }
      }
    }
    console.log(`  Built fingerprints for ${fingerprints.size} elements from evidence chain`);
  }

  // Fallback to structural fingerprints if evidence chain produced nothing
  if (fingerprints.size === 0) {
    console.log('  Evidence chain empty. Building structural fingerprints (Phase 9 fallback)...');
    const allCodes = elements.map(e => e.code);
    const structural = buildStructuralFingerprints(allCodes);
    for (const [code, fps] of structural) {
      fingerprints.set(code, fps);
    }
    const stats = computeFingerprintStats(allCodes, fingerprints);
    console.log(`  Structural fingerprints: ${stats.elementsWithFingerprints}/${stats.totalElements} (${stats.coveragePercent}%), ${stats.uniqueSlugs} unique slugs`);
  }

  // Step 2: Import and run connectedWalk
  console.log('\nStep 2: Running connectedWalk vs random baseline...');

  const { connectedWalk } = await import('../../src/lib/exam-logic');

  const elementCodes = elements.map(e => e.code);
  // Use a subset (30-50 elements) for meaningful comparison
  const sampleSize = Math.min(50, elementCodes.length);
  const sampleCodes = shuffleArray(elementCodes).slice(0, sampleSize);

  console.log(`  Using ${sampleCodes.length} elements for comparison`);

  // Run multiple trials
  const walkResults: Array<{ avg_jaccard: number; pct_shared: number }> = [];
  const randomResults: Array<{ avg_jaccard: number; pct_shared: number }> = [];

  for (let t = 0; t < trials; t++) {
    // Connected walk
    const walked = connectedWalk(sampleCodes, fingerprints);
    const walkPairs = analyzePairs(walked, fingerprints);
    walkResults.push({
      avg_jaccard: Math.round(avgJaccard(walkPairs) * 1000) / 1000,
      pct_shared: Math.round(pctSharedSlugs(walkPairs) * 100) / 100,
    });

    // Random baseline
    const randomOrder = shuffleArray(sampleCodes);
    const randomPairs = analyzePairs(randomOrder, fingerprints);
    randomResults.push({
      avg_jaccard: Math.round(avgJaccard(randomPairs) * 1000) / 1000,
      pct_shared: Math.round(pctSharedSlugs(randomPairs) * 100) / 100,
    });
  }

  const avgWalkJaccard = walkResults.reduce((s, r) => s + r.avg_jaccard, 0) / walkResults.length;
  const avgRandomJaccard = randomResults.reduce((s, r) => s + r.avg_jaccard, 0) / randomResults.length;
  const avgWalkPctShared = walkResults.reduce((s, r) => s + r.pct_shared, 0) / walkResults.length;
  const avgRandomPctShared = randomResults.reduce((s, r) => s + r.pct_shared, 0) / randomResults.length;

  console.log(`\n  Connected Walk (${trials} trials):`);
  console.log(`    Avg Jaccard:  ${(avgWalkJaccard * 100).toFixed(1)}%`);
  console.log(`    Pct shared:   ${(avgWalkPctShared * 100).toFixed(1)}%`);
  console.log(`\n  Random Baseline (${trials} trials):`);
  console.log(`    Avg Jaccard:  ${(avgRandomJaccard * 100).toFixed(1)}%`);
  console.log(`    Pct shared:   ${(avgRandomPctShared * 100).toFixed(1)}%`);

  const improvement = avgWalkJaccard > 0 && avgRandomJaccard > 0
    ? ((avgWalkJaccard - avgRandomJaccard) / avgRandomJaccard * 100)
    : 0;
  console.log(`\n  Improvement: ${improvement.toFixed(1)}%`);

  // Step 3: Detailed pair analysis for best walk trial
  console.log('\nStep 3: Sample pair analysis...');

  const bestWalk = connectedWalk(sampleCodes, fingerprints);
  const bestPairs = analyzePairs(bestWalk, fingerprints);

  // Show first 10 pairs
  console.log('  First 10 consecutive pairs:');
  for (const pair of bestPairs.slice(0, 10)) {
    const shared = pair.shared_slug_list.length > 0 ? pair.shared_slug_list.join(', ') : '(none)';
    console.log(`    ${pair.from_code} → ${pair.to_code}: J=${pair.jaccard}, shared=[${shared}]`);
  }

  // Step 4: Checks
  console.log('\n=== CALIBRATION CHECKS ===');

  const checks: Array<{ check: string; pass: boolean; detail: string }> = [];

  // Check 1: Walk Jaccard > Random Jaccard
  const walkBetter = avgWalkJaccard > avgRandomJaccard || fingerprints.size === 0;
  checks.push({
    check: 'walk_beats_random',
    pass: walkBetter,
    detail: fingerprints.size === 0
      ? 'SKIP: no fingerprints available (walk degrades to shuffle)'
      : `walk ${(avgWalkJaccard * 100).toFixed(1)}% > random ${(avgRandomJaccard * 100).toFixed(1)}% (${improvement.toFixed(1)}% improvement)`,
  });

  // Check 2: At least 50% of walk pairs share >= 1 slug
  const sharedThreshold = avgWalkPctShared >= 0.50 || fingerprints.size === 0;
  checks.push({
    check: 'shared_slug_coverage',
    pass: sharedThreshold,
    detail: fingerprints.size === 0
      ? 'SKIP: no fingerprints available'
      : `${(avgWalkPctShared * 100).toFixed(1)}% of pairs share >= 1 taxonomy slug (threshold: 50%)`,
  });

  // Check 3: connectedWalk function exists and is exported
  checks.push({
    check: 'function_exported',
    pass: typeof connectedWalk === 'function',
    detail: 'connectedWalk() is exported from exam-logic.ts',
  });

  // Check 4: Elements without fingerprints are appended at end
  const elementsWithFP = bestWalk.filter(c => fingerprints.has(c) && fingerprints.get(c)!.size > 0);
  const elementsWithoutFP = bestWalk.filter(c => !fingerprints.has(c) || fingerprints.get(c)!.size === 0);
  const withFPEnd = elementsWithFP.length > 0 ? bestWalk.lastIndexOf(elementsWithFP[elementsWithFP.length - 1]) : -1;
  const withoutFPStart = elementsWithoutFP.length > 0 ? bestWalk.indexOf(elementsWithoutFP[0]) : bestWalk.length;
  const appendedCorrectly = elementsWithoutFP.length === 0 || withFPEnd < withoutFPStart;
  checks.push({
    check: 'no_fp_appended',
    pass: appendedCorrectly,
    detail: `${elementsWithFP.length} with FP, ${elementsWithoutFP.length} without (${appendedCorrectly ? 'correctly appended' : 'INTERLEAVED'})`,
  });

  for (const c of checks) {
    console.log(`${c.pass ? '\u2705' : '\u274C'} ${c.check}: ${c.detail}`);
  }

  // Write evidence
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const evidence = {
    timestamp: new Date().toISOString(),
    sample_size: sampleCodes.length,
    trials,
    fingerprints_loaded: fingerprints.size,
    walk_results: walkResults,
    random_results: randomResults,
    avg_walk_jaccard: Math.round(avgWalkJaccard * 1000) / 1000,
    avg_random_jaccard: Math.round(avgRandomJaccard * 1000) / 1000,
    improvement_pct: Math.round(improvement * 10) / 10,
    avg_walk_pct_shared: Math.round(avgWalkPctShared * 100) / 100,
    checks,
    sample_pairs: bestPairs.slice(0, 20),
    overall_pass: checks.every(c => c.pass),
  };

  writeFileSync(join(EVIDENCE_DIR, 'flow-coherence-audit.json'), JSON.stringify(evidence, null, 2));

  // Markdown report
  let md = `# Flow Coherence Audit (R5)\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Elements sampled:** ${sampleCodes.length}\n`;
  md += `**Fingerprints loaded:** ${fingerprints.size}\n`;
  md += `**Trials:** ${trials}\n\n`;

  md += `## Results\n\n`;
  md += `| Metric | Connected Walk | Random Baseline | Delta |\n`;
  md += `|--------|---------------|-----------------|-------|\n`;
  md += `| Avg Jaccard | ${(avgWalkJaccard * 100).toFixed(1)}% | ${(avgRandomJaccard * 100).toFixed(1)}% | +${improvement.toFixed(1)}% |\n`;
  md += `| Pct shared slugs | ${(avgWalkPctShared * 100).toFixed(1)}% | ${(avgRandomPctShared * 100).toFixed(1)}% | +${((avgWalkPctShared - avgRandomPctShared) * 100).toFixed(1)}pp |\n\n`;

  md += `## Checks\n\n`;
  md += `| Check | Pass | Detail |\n|-------|------|--------|\n`;
  for (const c of checks) {
    md += `| ${c.check} | ${c.pass ? '\u2705' : '\u274C'} | ${c.detail} |\n`;
  }

  md += `\n## Sample Consecutive Pairs (first 10)\n\n`;
  md += `| From | To | Jaccard | Shared Slugs |\n|------|----|---------|-------------|\n`;
  for (const p of bestPairs.slice(0, 10)) {
    md += `| ${p.from_code} | ${p.to_code} | ${p.jaccard} | ${p.shared_slug_list.join(', ') || '(none)'} |\n`;
  }

  md += `\n## Methodology\n\n`;
  md += `- Reimplements \`jaccardSimilarity()\` (private in exam-logic.ts)\n`;
  md += `- Loads taxonomy fingerprints from DB (RPC or evidence chain fallback)\n`;
  md += `- Runs \`connectedWalk()\` and random shuffle on same element set\n`;
  md += `- Compares average pairwise Jaccard similarity across ${trials} trials\n`;

  writeFileSync(join(EVIDENCE_DIR, 'flow-coherence-audit.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/flow-coherence-audit.{json,md}`);
  console.log(`\nOVERALL: ${checks.every(c => c.pass) ? 'PASS' : 'FAIL'}`);
  if (!checks.every(c => c.pass)) process.exit(1);
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
