/**
 * Fingerprint Coverage Audit
 *
 * Reports how many ACS elements have taxonomy fingerprints available
 * and the quality of those fingerprints (slug count, cross-area bridges).
 *
 * Checks:
 *   1. Evidence chain fingerprints (concept → evidence → chunk → taxonomy)
 *   2. Structural fingerprints (area keyword fallback)
 *   3. Combined coverage
 *
 * Usage:
 *   npx tsx scripts/eval/fingerprint-coverage.ts [--rating private|commercial|instrument]
 *
 * Requires: .env.local
 *
 * Phase 9 — Flow Coherence Activation
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildStructuralFingerprints, computeFingerprintStats, parseElementCode } from '../../src/lib/structural-fingerprints';
import { getAreaKeywords } from '../../src/lib/citation-relevance';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-06-phase9/eval');

// ---------------------------------------------------------------------------
// Evidence chain fingerprint loader (matches exam-planner.ts logic)
// ---------------------------------------------------------------------------

async function loadEvidenceChainFingerprints(
  elementCodes: string[]
): Promise<Map<string, Set<string>>> {
  const fingerprints = new Map<string, Set<string>>();
  if (elementCodes.length === 0) return fingerprints;

  try {
    const slugPatterns = elementCodes.map(code =>
      `acs:element:${code.toLowerCase().replace(/\./g, '-')}`
    );

    const { data: concepts } = await supabase
      .from('concepts')
      .select('id, slug')
      .in('slug', slugPatterns);

    if (!concepts || concepts.length === 0) return fingerprints;

    const slugToCode = new Map<string, string>();
    for (const code of elementCodes) {
      const slug = `acs:element:${code.toLowerCase().replace(/\./g, '-')}`;
      slugToCode.set(slug, code);
    }

    const conceptIdToCode = new Map<string, string>();
    for (const c of concepts) {
      const code = slugToCode.get(c.slug);
      if (code) conceptIdToCode.set(c.id, code);
    }

    if (conceptIdToCode.size === 0) return fingerprints;

    const conceptIds = [...conceptIdToCode.keys()];
    const { data: evidence } = await supabase
      .from('concept_chunk_evidence')
      .select('concept_id, chunk_id')
      .in('concept_id', conceptIds);

    if (!evidence || evidence.length === 0) return fingerprints;

    const conceptChunks = new Map<string, string[]>();
    for (const ev of evidence) {
      const chunks = conceptChunks.get(ev.concept_id) || [];
      chunks.push(ev.chunk_id);
      conceptChunks.set(ev.concept_id, chunks);
    }

    const allChunkIds = [...new Set(evidence.map(e => e.chunk_id))];
    const taxonomyMap = new Map<string, string>();
    for (let i = 0; i < allChunkIds.length; i += 500) {
      const batch = allChunkIds.slice(i, i + 500);
      const { data: taxRows } = await supabase
        .from('kb_chunk_taxonomy')
        .select('chunk_id, taxonomy_node_id')
        .in('chunk_id', batch);

      if (taxRows) {
        for (const row of taxRows) {
          taxonomyMap.set(row.chunk_id, row.taxonomy_node_id);
        }
      }
    }

    const taxNodeIds = [...new Set(taxonomyMap.values())];
    const taxSlugMap = new Map<string, string>();
    if (taxNodeIds.length > 0) {
      for (let i = 0; i < taxNodeIds.length; i += 500) {
        const batch = taxNodeIds.slice(i, i + 500);
        const { data: nodes } = await supabase
          .from('kb_taxonomy_nodes')
          .select('id, slug')
          .in('id', batch);

        if (nodes) {
          for (const node of nodes) {
            taxSlugMap.set(node.id, node.slug);
          }
        }
      }
    }

    for (const [conceptId, code] of conceptIdToCode) {
      const chunkIds = conceptChunks.get(conceptId) || [];
      const slugs = new Set<string>();
      for (const chunkId of chunkIds) {
        const taxNodeId = taxonomyMap.get(chunkId);
        if (taxNodeId) {
          const taxSlug = taxSlugMap.get(taxNodeId);
          if (taxSlug && !taxSlug.includes('triage-unclassified')) {
            slugs.add(taxSlug);
          }
        }
      }
      if (slugs.size > 0) {
        fingerprints.set(code, slugs);
      }
    }
  } catch (err) {
    console.error('Evidence chain loading failed:', err instanceof Error ? err.message : err);
  }

  return fingerprints;
}

// ---------------------------------------------------------------------------
// Cross-area bridge analysis
// ---------------------------------------------------------------------------

interface BridgeAnalysis {
  keyword: string;
  areas: string[];
  elementCount: number;
}

function analyzeCrossAreaBridges(
  fingerprints: Map<string, Set<string>>,
  elementCodes: string[]
): BridgeAnalysis[] {
  // Find topic: slugs that appear in multiple areas
  const slugToAreas = new Map<string, Set<string>>();

  for (const code of elementCodes) {
    const fp = fingerprints.get(code);
    if (!fp) continue;

    const parsed = parseElementCode(code);
    if (!parsed) continue;

    for (const slug of fp) {
      if (!slug.startsWith('topic:')) continue;
      if (!slugToAreas.has(slug)) slugToAreas.set(slug, new Set());
      slugToAreas.get(slug)!.add(parsed.area);
    }
  }

  // Only keep keywords that bridge 2+ areas
  const bridges: BridgeAnalysis[] = [];
  for (const [slug, areas] of slugToAreas) {
    if (areas.size >= 2) {
      const keyword = slug.replace('topic:', '');
      const areaList = [...areas].sort();
      const count = elementCodes.filter(c => fingerprints.get(c)?.has(slug)).length;
      bridges.push({ keyword, areas: areaList, elementCount: count });
    }
  }

  // Sort by number of areas bridged (desc), then by element count (desc)
  bridges.sort((a, b) => b.areas.length - a.areas.length || b.elementCount - a.elementCount);
  return bridges;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const ratingArg = args.includes('--rating')
    ? args[args.indexOf('--rating') + 1]
    : null;
  const ratings = ratingArg ? [ratingArg] : ['private', 'commercial', 'instrument'];

  const RATING_PREFIX: Record<string, string> = {
    private: 'PA.', commercial: 'CA.', instrument: 'IR.',
  };

  console.log('=== Fingerprint Coverage Audit (Phase 9) ===\n');

  const allResults: Array<{
    rating: string;
    evidenceStats: ReturnType<typeof computeFingerprintStats>;
    structuralStats: ReturnType<typeof computeFingerprintStats>;
    combinedStats: ReturnType<typeof computeFingerprintStats>;
    bridges: BridgeAnalysis[];
    areaBreakdown: Record<string, { total: number; withFP: number }>;
  }> = [];

  for (const rating of ratings) {
    const prefix = RATING_PREFIX[rating] || 'PA.';
    console.log(`--- Rating: ${rating} (${prefix}) ---\n`);

    // Load ACS elements
    const { data: elements } = await supabase
      .from('acs_elements')
      .select('code, task_id, element_type')
      .like('code', `${prefix}%`)
      .not('element_type', 'eq', 'skill');

    if (!elements || elements.length === 0) {
      console.log(`  No elements found for ${rating}. Skipping.\n`);
      continue;
    }

    const codes = elements.map(e => e.code);
    console.log(`  Total oral elements: ${codes.length}`);

    // 1. Evidence chain fingerprints
    console.log('  Loading evidence chain fingerprints...');
    const evidenceFPs = await loadEvidenceChainFingerprints(codes);
    const evidenceStats = computeFingerprintStats(codes, evidenceFPs);
    console.log(`    Evidence chain: ${evidenceStats.elementsWithFingerprints}/${evidenceStats.totalElements} (${evidenceStats.coveragePercent}%)`);

    // 2. Structural fingerprints
    console.log('  Building structural fingerprints...');
    const structuralFPs = buildStructuralFingerprints(codes);
    const structuralStats = computeFingerprintStats(codes, structuralFPs);
    console.log(`    Structural: ${structuralStats.elementsWithFingerprints}/${structuralStats.totalElements} (${structuralStats.coveragePercent}%)`);

    // 3. Combined (evidence overrides structural where available)
    const combinedFPs = new Map(structuralFPs);
    for (const [code, fp] of evidenceFPs) {
      // Merge: evidence slugs supplement structural slugs
      const existing = combinedFPs.get(code) ?? new Set();
      for (const slug of fp) existing.add(slug);
      combinedFPs.set(code, existing);
    }
    const combinedStats = computeFingerprintStats(codes, combinedFPs);
    console.log(`    Combined: ${combinedStats.elementsWithFingerprints}/${combinedStats.totalElements} (${combinedStats.coveragePercent}%)`);

    // 4. Cross-area bridge analysis
    const bridges = analyzeCrossAreaBridges(combinedFPs, codes);
    console.log(`    Cross-area bridges: ${bridges.length} keywords bridge 2+ areas`);

    // 5. Area breakdown
    const areaBreakdown: Record<string, { total: number; withFP: number }> = {};
    for (const code of codes) {
      const parsed = parseElementCode(code);
      if (!parsed) continue;
      if (!areaBreakdown[parsed.area]) areaBreakdown[parsed.area] = { total: 0, withFP: 0 };
      areaBreakdown[parsed.area].total++;
      if (combinedFPs.has(code) && combinedFPs.get(code)!.size > 0) {
        areaBreakdown[parsed.area].withFP++;
      }
    }

    console.log('\n  Area breakdown:');
    for (const [area, data] of Object.entries(areaBreakdown).sort()) {
      const pct = Math.round((data.withFP / data.total) * 100);
      const keywords = getAreaKeywords(area, rating);
      console.log(`    Area ${area}: ${data.withFP}/${data.total} (${pct}%) — ${keywords.length} keywords`);
    }

    // Top bridges
    console.log('\n  Top 10 cross-area bridges:');
    for (const b of bridges.slice(0, 10)) {
      console.log(`    "${b.keyword}" → areas [${b.areas.join(', ')}] (${b.elementCount} elements)`);
    }

    allResults.push({
      rating,
      evidenceStats,
      structuralStats,
      combinedStats,
      bridges,
      areaBreakdown,
    });
    console.log('');
  }

  // Write evidence
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const evidence = {
    timestamp: new Date().toISOString(),
    ratings_audited: ratings,
    results: allResults.map(r => ({
      rating: r.rating,
      evidence_chain: {
        coverage_pct: r.evidenceStats.coveragePercent,
        elements_with_fp: r.evidenceStats.elementsWithFingerprints,
        total_elements: r.evidenceStats.totalElements,
        unique_slugs: r.evidenceStats.uniqueSlugs,
      },
      structural: {
        coverage_pct: r.structuralStats.coveragePercent,
        elements_with_fp: r.structuralStats.elementsWithFingerprints,
        total_elements: r.structuralStats.totalElements,
        unique_slugs: r.structuralStats.uniqueSlugs,
        avg_fp_size: r.structuralStats.avgFingerprintSize,
      },
      combined: {
        coverage_pct: r.combinedStats.coveragePercent,
        elements_with_fp: r.combinedStats.elementsWithFingerprints,
        total_elements: r.combinedStats.totalElements,
        unique_slugs: r.combinedStats.uniqueSlugs,
      },
      cross_area_bridges: r.bridges.length,
      top_bridges: r.bridges.slice(0, 20),
      area_breakdown: r.areaBreakdown,
    })),
  };

  writeFileSync(join(EVIDENCE_DIR, 'fingerprint-coverage.json'), JSON.stringify(evidence, null, 2));

  // Markdown report
  let md = `# Fingerprint Coverage Audit\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Phase:** 9 — Flow Coherence Activation\n\n`;

  for (const r of allResults) {
    md += `## ${r.rating.charAt(0).toUpperCase() + r.rating.slice(1)} Pilot\n\n`;
    md += `| Source | Coverage | Elements | Unique Slugs | Avg FP Size |\n`;
    md += `|--------|----------|----------|-------------|-------------|\n`;
    md += `| Evidence chain | ${r.evidenceStats.coveragePercent}% | ${r.evidenceStats.elementsWithFingerprints}/${r.evidenceStats.totalElements} | ${r.evidenceStats.uniqueSlugs} | ${r.evidenceStats.avgFingerprintSize} |\n`;
    md += `| Structural | ${r.structuralStats.coveragePercent}% | ${r.structuralStats.elementsWithFingerprints}/${r.structuralStats.totalElements} | ${r.structuralStats.uniqueSlugs} | ${r.structuralStats.avgFingerprintSize} |\n`;
    md += `| **Combined** | **${r.combinedStats.coveragePercent}%** | **${r.combinedStats.elementsWithFingerprints}/${r.combinedStats.totalElements}** | ${r.combinedStats.uniqueSlugs} | — |\n\n`;

    md += `### Area Breakdown\n\n`;
    md += `| Area | Elements | Coverage | Keywords |\n`;
    md += `|------|----------|----------|----------|\n`;
    for (const [area, data] of Object.entries(r.areaBreakdown).sort()) {
      const pct = Math.round((data.withFP / data.total) * 100);
      const keywords = getAreaKeywords(area, r.rating);
      md += `| ${area} | ${data.total} | ${pct}% | ${keywords.length} |\n`;
    }

    md += `\n### Top Cross-Area Bridges\n\n`;
    md += `| Keyword | Areas | Elements |\n`;
    md += `|---------|-------|----------|\n`;
    for (const b of r.bridges.slice(0, 15)) {
      md += `| ${b.keyword} | ${b.areas.join(', ')} | ${b.elementCount} |\n`;
    }
    md += '\n';
  }

  // Summary checks
  md += `## Checks\n\n`;
  const allPass = allResults.every(r => r.combinedStats.coveragePercent >= 90);
  md += `| Check | Result | Detail |\n`;
  md += `|-------|--------|--------|\n`;
  for (const r of allResults) {
    const pass = r.combinedStats.coveragePercent >= 90;
    md += `| ${r.rating} coverage >= 90% | ${pass ? '✅' : '❌'} | ${r.combinedStats.coveragePercent}% |\n`;
    const bridgePass = r.bridges.length >= 5;
    md += `| ${r.rating} bridges >= 5 | ${bridgePass ? '✅' : '❌'} | ${r.bridges.length} bridges |\n`;
  }
  md += `\n**OVERALL: ${allPass ? 'PASS' : 'FAIL'}**\n`;

  writeFileSync(join(EVIDENCE_DIR, 'fingerprint-coverage.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/fingerprint-coverage.{json,md}`);

  // Overall pass/fail
  const pass = allResults.every(r => r.combinedStats.coveragePercent >= 90);
  console.log(`\nOVERALL: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exit(1);
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
