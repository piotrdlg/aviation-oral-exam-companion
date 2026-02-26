#!/usr/bin/env npx tsx
/**
 * expected-path-audit.ts — Verify expected logical paths in the knowledge graph
 *
 * READ-ONLY script. Safe to run on production without ALLOW_PROD_WRITE.
 *
 * Checks:
 *   1. NAS root concept exists
 *   2. Airspace class concepts (A-G, special use) exist
 *   3. Each airspace class concept has a path to NAS root via is_component_of
 *   4. Regulatory claims mentioning specific airspace classes have applies_in_scenario
 *      or leads_to_discussion_of edges to the matching airspace concept
 *   5. Output markdown report with PASS/FAIL counts + missing-edge examples
 *
 * Usage:
 *   npx tsx scripts/graph/expected-path-audit.ts
 *   npm run graph:audit:paths
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Expected airspace class patterns
// ---------------------------------------------------------------------------

const AIRSPACE_CLASSES = [
  { label: 'Class A', slugPatterns: ['class-a-airspace', 'class-a'], namePattern: /class\s+a\s+airspace/i },
  { label: 'Class B', slugPatterns: ['class-b-airspace', 'class-b'], namePattern: /class\s+b\s+airspace/i },
  { label: 'Class C', slugPatterns: ['class-c-airspace', 'class-c'], namePattern: /class\s+c\s+airspace/i },
  { label: 'Class D', slugPatterns: ['class-d-airspace', 'class-d'], namePattern: /class\s+d\s+airspace/i },
  { label: 'Class E', slugPatterns: ['class-e-airspace', 'class-e'], namePattern: /class\s+e\s+airspace/i },
  { label: 'Class G', slugPatterns: ['class-g-airspace', 'class-g'], namePattern: /class\s+g\s+airspace/i },
];

const SPECIAL_AIRSPACE = [
  { label: 'Special Use Airspace', slugPatterns: ['special-use-airspace'], namePattern: /special\s+use\s+airspace/i },
  { label: 'Controlled Airspace', slugPatterns: ['controlled-airspace'], namePattern: /controlled\s+airspace/i },
];

interface PathResult {
  label: string;
  conceptId: string | null;
  conceptSlug: string | null;
  conceptName: string | null;
  hasPathToNAS: boolean;
  pathLength: number;
  pathDescription: string;
}

interface ClaimLinkResult {
  claimId: string;
  claimName: string;
  expectedAirspaceLabel: string;
  linkedToCorrectAirspace: boolean;
  linkedToNAS: boolean;
  linkedToAnyTopic: boolean;
  outgoingEdges: { targetSlug: string; relationType: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAll<T>(table: string, columns: string, filter?: { col: string; val: string }): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase.from(table).select(columns).range(offset, offset + pageSize - 1);
    if (filter) query = query.eq(filter.col, filter.val);
    const { data, error } = await query;
    if (error) { console.error(`Error fetching ${table}:`, error.message); return results; }
    if (!data || data.length === 0) break;
    results.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

async function findBestConceptMatch(
  slugPatterns: string[],
  namePattern: RegExp,
  categories: string[],
): Promise<{ id: string; slug: string; name: string; category: string } | null> {
  // Try slug match first (prefer definition, then topic, then procedure)
  for (const cat of ['definition', 'topic', 'procedure']) {
    for (const pattern of slugPatterns) {
      const { data } = await supabase.from('concepts')
        .select('id, slug, name, category')
        .eq('category', cat)
        .ilike('slug', `%${pattern}%`)
        .limit(5);
      if (data && data.length > 0) {
        // Prefer exact-ish matches
        const exact = data.find(d => d.slug.includes(pattern + '-'));
        return exact || data[0];
      }
    }
  }
  return null;
}

async function checkPathToNAS(
  conceptId: string,
  nasId: string,
  maxDepth: number = 6,
): Promise<{ found: boolean; depth: number; path: string[] }> {
  const visited = new Set<string>();
  const queue: { id: string; depth: number; path: string[] }[] = [
    { id: conceptId, depth: 0, path: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) continue;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.id === nasId) {
      return { found: true, depth: current.depth, path: current.path };
    }

    // Follow is_component_of and leads_to_discussion_of edges outward
    const { data: edges } = await supabase.from('concept_relations')
      .select('target_id, relation_type')
      .eq('source_id', current.id)
      .in('relation_type', ['is_component_of', 'leads_to_discussion_of']);

    for (const edge of edges || []) {
      if (!visited.has(edge.target_id)) {
        queue.push({
          id: edge.target_id,
          depth: current.depth + 1,
          path: [...current.path, `--[${edge.relation_type}]-->`],
        });
      }
    }

    // Also follow incoming is_component_of (child -> this -> NAS)
    // Actually, is_component_of goes child -> parent, so we follow outgoing only
  }

  return { found: false, depth: -1, path: [] };
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Expected Path Audit ===\n');

  // Step 1: Find NAS root
  const { data: nasNodes } = await supabase.from('concepts')
    .select('id, slug, name, category')
    .eq('slug', 'topic:national-airspace-system')
    .single();

  if (!nasNodes) {
    console.error('FAIL: NAS root concept (topic:national-airspace-system) not found');
    process.exit(1);
  }
  const nasId = nasNodes.id;
  console.log(`NAS root: ${nasNodes.slug} (${nasId})`);

  // Step 2: Find airspace class concepts
  const pathResults: PathResult[] = [];
  const allChecks = [...AIRSPACE_CLASSES, ...SPECIAL_AIRSPACE];

  for (const ac of allChecks) {
    console.log(`  Checking: ${ac.label}...`);
    const concept = await findBestConceptMatch(ac.slugPatterns, ac.namePattern, ['definition', 'topic', 'procedure']);

    if (!concept) {
      pathResults.push({
        label: ac.label,
        conceptId: null,
        conceptSlug: null,
        conceptName: null,
        hasPathToNAS: false,
        pathLength: -1,
        pathDescription: 'No matching concept found',
      });
      continue;
    }

    // Step 3: Check path to NAS
    const pathCheck = await checkPathToNAS(concept.id, nasId);
    pathResults.push({
      label: ac.label,
      conceptId: concept.id,
      conceptSlug: concept.slug,
      conceptName: concept.name,
      hasPathToNAS: pathCheck.found,
      pathLength: pathCheck.depth,
      pathDescription: pathCheck.found
        ? `Path found (depth ${pathCheck.depth})`
        : 'No path to NAS within 6 hops',
    });
  }

  // Step 4: Check regulatory claims -> airspace concept links
  console.log('\n  Checking regulatory claim linkage...');
  const claimResults: ClaimLinkResult[] = [];

  for (const ac of AIRSPACE_CLASSES) {
    // Find claims mentioning this airspace class
    const { data: claims } = await supabase.from('concepts')
      .select('id, slug, name')
      .eq('category', 'regulatory_claim')
      .ilike('name', `%${ac.label.toLowerCase()}%`)
      .limit(20);

    const concept = await findBestConceptMatch(ac.slugPatterns, ac.namePattern, ['definition', 'topic']);

    for (const claim of claims || []) {
      // Get all outgoing edges from this claim
      const { data: edges } = await supabase.from('concept_relations')
        .select('target_id, relation_type')
        .eq('source_id', claim.id);

      const edgeTargets: { targetSlug: string; relationType: string }[] = [];
      let linkedToCorrectAirspace = false;
      let linkedToNAS = false;
      let linkedToAnyTopic = false;

      for (const edge of edges || []) {
        const { data: target } = await supabase.from('concepts')
          .select('slug, category').eq('id', edge.target_id).single();
        if (target) {
          edgeTargets.push({ targetSlug: target.slug, relationType: edge.relation_type });
          if (concept && edge.target_id === concept.id) linkedToCorrectAirspace = true;
          if (edge.target_id === nasId) linkedToNAS = true;
          if (['topic', 'definition', 'procedure'].includes(target.category)) linkedToAnyTopic = true;
        }
      }

      claimResults.push({
        claimId: claim.id,
        claimName: claim.name.substring(0, 120),
        expectedAirspaceLabel: ac.label,
        linkedToCorrectAirspace,
        linkedToNAS,
        linkedToAnyTopic,
        outgoingEdges: edgeTargets,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Generate report
  // ---------------------------------------------------------------------------

  const dateStr = new Date().toISOString().split('T')[0];
  const reportsDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const passedPaths = pathResults.filter(r => r.hasPathToNAS).length;
  const totalPaths = pathResults.length;
  const claimsLinkedToAirspace = claimResults.filter(r => r.linkedToCorrectAirspace).length;
  const claimsLinkedToAnyTopic = claimResults.filter(r => r.linkedToAnyTopic).length;
  const claimsLinkedToNAS = claimResults.filter(r => r.linkedToNAS).length;
  const totalClaims = claimResults.length;

  const md: string[] = [
    '---',
    `title: "Expected Path Audit — ${dateStr}"`,
    `date: ${dateStr}`,
    'type: graph-audit',
    'tags: [heydpe, knowledge-graph, audit, paths]',
    '---',
    '',
    `# Expected Path Audit — ${dateStr}`,
    '',
    '## Summary',
    '',
    `| Metric | Count | Rate |`,
    `|--------|-------|------|`,
    `| Airspace → NAS path exists | ${passedPaths}/${totalPaths} | ${(passedPaths / totalPaths * 100).toFixed(0)}% |`,
    `| Claims → correct airspace concept | ${claimsLinkedToAirspace}/${totalClaims} | ${totalClaims > 0 ? (claimsLinkedToAirspace / totalClaims * 100).toFixed(1) : 0}% |`,
    `| Claims → any topic/def/proc | ${claimsLinkedToAnyTopic}/${totalClaims} | ${totalClaims > 0 ? (claimsLinkedToAnyTopic / totalClaims * 100).toFixed(1) : 0}% |`,
    `| Claims → NAS root directly | ${claimsLinkedToNAS}/${totalClaims} | ${totalClaims > 0 ? (claimsLinkedToNAS / totalClaims * 100).toFixed(1) : 0}% |`,
    '',
    '## Airspace → NAS Path Check',
    '',
    '| Airspace | Concept Found | Path to NAS | Depth | Details |',
    '|----------|---------------|-------------|-------|---------|',
  ];

  for (const r of pathResults) {
    const found = r.conceptSlug ? 'Yes' : '**No**';
    const hasPath = r.hasPathToNAS ? 'PASS' : '**FAIL**';
    md.push(`| ${r.label} | ${found} | ${hasPath} | ${r.pathLength} | ${r.conceptSlug || 'N/A'} |`);
  }

  md.push('', '## Regulatory Claim → Airspace Concept Linkage', '');
  md.push('### Aggregate by airspace class', '');
  md.push('| Airspace Class | Claims Sampled | Linked to Airspace Concept | Linked to Any Topic | Linked to NAS |');
  md.push('|----------------|----------------|---------------------------|---------------------|---------------|');

  for (const ac of AIRSPACE_CLASSES) {
    const subset = claimResults.filter(r => r.expectedAirspaceLabel === ac.label);
    const linked = subset.filter(r => r.linkedToCorrectAirspace).length;
    const anyTopic = subset.filter(r => r.linkedToAnyTopic).length;
    const toNas = subset.filter(r => r.linkedToNAS).length;
    md.push(`| ${ac.label} | ${subset.length} | ${linked} (${subset.length > 0 ? (linked / subset.length * 100).toFixed(0) : 0}%) | ${anyTopic} (${subset.length > 0 ? (anyTopic / subset.length * 100).toFixed(0) : 0}%) | ${toNas} |`);
  }

  // Missing edge examples
  md.push('', '### Missing Edge Examples (claims NOT linked to expected airspace concept)', '');
  md.push('| Claim | Expected Airspace | Actual Targets |');
  md.push('|-------|-------------------|----------------|');

  const missingExamples = claimResults.filter(r => !r.linkedToCorrectAirspace).slice(0, 20);
  for (const r of missingExamples) {
    const targets = r.outgoingEdges.map(e => `${e.relationType}→${e.targetSlug.substring(0, 50)}`).join(', ');
    md.push(`| ${r.claimName.substring(0, 80)}... | ${r.expectedAirspaceLabel} | ${targets || 'none'} |`);
  }

  md.push('', '## Suggested Auto-Fix Strategy', '');
  md.push('The core problem: **regulatory claims link to ACS elements and the NAS root, but NOT to the specific airspace class topic/definition nodes they reference.**');
  md.push('');
  md.push('### Fix pattern 1: Claim → Airspace concept (deterministic)');
  md.push('For each regulatory claim whose name mentions "Class X airspace":');
  md.push('- Find the definition/topic node for that airspace class');
  md.push('- Create `applies_in_scenario` edge from claim → airspace concept');
  md.push('- Confidence: 0.95 (keyword match on claim text)');
  md.push('');
  md.push('### Fix pattern 2: Taxonomy-based attachment');
  md.push('Classify source chunks into a topic taxonomy, then attach concepts to taxonomy nodes based on their evidence chunks.');
  md.push('');
  md.push('### Fix pattern 3: LLM edge inference with focused batches');
  md.push('Re-run `infer-edges.ts --strategy llm` with batches organized by topic (all airspace concepts together) instead of random sampling.');
  md.push('');
  md.push('*Generated by `npm run graph:audit:paths`*');

  const mdPath = path.join(reportsDir, `${dateStr}-expected-path-audit.md`);
  fs.writeFileSync(mdPath, md.join('\n'));

  // Console summary
  console.log('\n=== RESULTS ===\n');
  console.log(`  Airspace → NAS paths: ${passedPaths}/${totalPaths} (${(passedPaths / totalPaths * 100).toFixed(0)}%)`);
  console.log(`  Claims → correct airspace: ${claimsLinkedToAirspace}/${totalClaims} (${totalClaims > 0 ? (claimsLinkedToAirspace / totalClaims * 100).toFixed(1) : 0}%)`);
  console.log(`  Claims → any topic/def: ${claimsLinkedToAnyTopic}/${totalClaims} (${totalClaims > 0 ? (claimsLinkedToAnyTopic / totalClaims * 100).toFixed(1) : 0}%)`);
  console.log(`  Claims → NAS root: ${claimsLinkedToNAS}/${totalClaims} (${totalClaims > 0 ? (claimsLinkedToNAS / totalClaims * 100).toFixed(1) : 0}%)`);
  console.log(`\nReport: ${mdPath}`);

  const overallPass = passedPaths === totalPaths && claimsLinkedToAirspace / totalClaims > 0.5;
  console.log(`\nOverall: ${overallPass ? 'PASS' : 'FAIL'}`);
  if (!overallPass) process.exit(1);
}

main().catch((err) => {
  console.error('Audit error:', err);
  process.exit(1);
});
