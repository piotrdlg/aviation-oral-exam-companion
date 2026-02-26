#!/usr/bin/env npx tsx
/**
 * attach_concepts_to_taxonomy.ts — Deterministic concept→taxonomy attachment
 *
 * For each concept with evidence chunks, look at the chunk classifications
 * and attach the concept to matching taxonomy nodes via keyword + evidence.
 *
 * Additionally, fix the "claims not linked to airspace" problem:
 * - For regulatory_claim concepts mentioning specific airspace classes,
 *   create applies_in_scenario edges to the matching airspace definition nodes.
 *
 * Flags:
 *   --dry-run       Print proposed edges but don't write (default)
 *   --write         Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --limit N       Process at most N concepts
 *   --category CAT  Only process concepts of this category
 *
 * Usage:
 *   npx tsx scripts/graph/attach_concepts_to_taxonomy.ts --dry-run
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_concepts_to_taxonomy.ts --write
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { assertNotProduction } from '../../src/lib/app-env';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { dryRun: true, write: false, limit: 0, category: '' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': flags.dryRun = true; flags.write = false; break;
      case '--write': flags.write = true; flags.dryRun = false; break;
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
      case '--category': flags.category = args[++i]; break;
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Airspace keyword patterns for claim→airspace attachment
// ---------------------------------------------------------------------------

const AIRSPACE_KEYWORDS = [
  { pattern: /\bclass\s+a\s+airspace\b/i, targetSlugPattern: 'definition:class-a-airspace' },
  { pattern: /\bclass\s+b\s+airspace\b/i, targetSlugPattern: 'definition:class-b-airspace' },
  { pattern: /\bclass\s+c\s+airspace\b/i, targetSlugPattern: 'definition:class-c-airspace' },
  { pattern: /\bclass\s+d\s+airspace\b/i, targetSlugPattern: 'definition:class-d-airspace' },
  { pattern: /\bclass\s+e\s+airspace\b/i, targetSlugPattern: 'definition:class-e-airspace' },
  { pattern: /\bclass\s+g\s+airspace\b/i, targetSlugPattern: 'definition:class-g-airspace' },
  { pattern: /\bspecial[\s-]+use\s+airspace\b/i, targetSlugPattern: 'definition:special-use-airspace' },
  { pattern: /\bcontrolled\s+airspace\b/i, targetSlugPattern: 'definition:controlled-airspace' },
  // Specific aviation topics
  { pattern: /\bholding\s+pattern\b/i, targetSlugPattern: 'procedure:holding-pattern' },
  { pattern: /\bprocedure\s+turn\b/i, targetSlugPattern: 'procedure:procedure-turn' },
  { pattern: /\bstall\b/i, targetSlugPattern: 'topic:stall' },
  { pattern: /\bicing\b.*\bcondition/i, targetSlugPattern: 'topic:icing' },
  { pattern: /\bthunderstorm/i, targetSlugPattern: 'topic:thunderstorm' },
  { pattern: /\btransponder\b/i, targetSlugPattern: 'topic:transponder' },
  { pattern: /\bads-b\b/i, targetSlugPattern: 'topic:ads-b' },
];

// ---------------------------------------------------------------------------
// Paginated fetch
// ---------------------------------------------------------------------------

async function fetchAll<T>(
  table: string,
  columns: string,
  filter?: { col: string; val: string },
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(columns).range(offset, offset + pageSize - 1);
    if (filter) q = q.eq(filter.col, filter.val);
    const { data, error } = await q;
    if (error) { console.error(`Error fetching ${table}:`, error.message); return results; }
    if (!data || data.length === 0) break;
    results.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  console.log('\n=== Concept → Taxonomy Attachment ===\n');
  console.log(`Mode: ${flags.write ? 'WRITE' : 'DRY-RUN'}`);

  if (flags.write) {
    assertNotProduction('attach-concepts-to-taxonomy', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!\n');
    }
  }

  // Step 1: Load existing concept → definition/topic slugs for airspace matching
  console.log('Loading concept lookup table...');
  const allConcepts = await fetchAll<{ id: string; slug: string; name: string; category: string }>(
    'concepts', 'id, slug, name, category',
  );
  const conceptBySlugPrefix = new Map<string, { id: string; slug: string; name: string }>();
  for (const c of allConcepts) {
    conceptBySlugPrefix.set(c.slug, { id: c.id, slug: c.slug, name: c.name });
  }

  // Build a best-match lookup for airspace target slugs
  const airspaceTargets = new Map<string, string>(); // slugPattern -> actual concept id
  for (const kw of AIRSPACE_KEYWORDS) {
    // Find best matching concept
    const matches = allConcepts.filter(c =>
      c.slug.includes(kw.targetSlugPattern) &&
      ['definition', 'topic', 'procedure'].includes(c.category)
    );
    if (matches.length > 0) {
      // Prefer the shortest slug (most general)
      matches.sort((a, b) => a.slug.length - b.slug.length);
      airspaceTargets.set(kw.targetSlugPattern, matches[0].id);
    }
  }

  console.log(`  Airspace target nodes found: ${airspaceTargets.size}/${AIRSPACE_KEYWORDS.length}`);

  // Step 2: Load existing edges to avoid duplicates
  console.log('Loading existing edges...');
  const existingEdges = new Set<string>();
  const edges = await fetchAll<{ source_id: string; target_id: string; relation_type: string }>(
    'concept_relations', 'source_id, target_id, relation_type',
  );
  for (const e of edges) {
    existingEdges.add(`${e.source_id}|${e.target_id}|${e.relation_type}`);
  }
  console.log(`  Existing edges: ${existingEdges.size}`);

  // Step 3: Process regulatory claims — attach to airspace concept nodes
  console.log('\nPhase 1: Regulatory claim → airspace concept attachment...');

  const claims = allConcepts.filter(c => c.category === 'regulatory_claim');
  const targetCategories = flags.category
    ? allConcepts.filter(c => c.category === flags.category)
    : claims;

  const proposedEdges: {
    source_id: string;
    target_id: string;
    relation_type: string;
    weight: number;
    confidence: number;
    context: string;
    source_name: string;
    target_name: string;
  }[] = [];

  let processed = 0;
  let skippedExisting = 0;
  let skippedSelfRef = 0;

  for (const concept of targetCategories) {
    if (flags.limit > 0 && processed >= flags.limit) break;

    // Check each keyword pattern
    for (const kw of AIRSPACE_KEYWORDS) {
      if (!kw.pattern.test(concept.name)) continue;

      const targetId = airspaceTargets.get(kw.targetSlugPattern);
      if (!targetId) continue;
      if (targetId === concept.id) { skippedSelfRef++; continue; }

      const edgeKey = `${concept.id}|${targetId}|applies_in_scenario`;
      if (existingEdges.has(edgeKey)) { skippedExisting++; continue; }

      const target = allConcepts.find(c => c.id === targetId);
      proposedEdges.push({
        source_id: concept.id,
        target_id: targetId,
        relation_type: 'applies_in_scenario',
        weight: 0.85,
        confidence: 0.90,
        context: `Keyword match: "${kw.targetSlugPattern}" in claim text`,
        source_name: concept.name.substring(0, 80),
        target_name: target?.name || 'unknown',
      });

      existingEdges.add(edgeKey); // Prevent duplicates within this run
    }

    processed++;
  }

  console.log(`  Claims checked: ${processed}`);
  console.log(`  Proposed new edges: ${proposedEdges.length}`);
  console.log(`  Skipped (existing): ${skippedExisting}`);
  console.log(`  Skipped (self-ref): ${skippedSelfRef}`);

  // Phase 2: Cross-topic attachment (topics/defs mentioning other topics)
  console.log('\nPhase 2: Cross-topic keyword attachment...');

  const topicsDefs = allConcepts.filter(c =>
    ['topic', 'definition', 'procedure'].includes(c.category)
  );

  let crossEdges = 0;
  for (const concept of topicsDefs) {
    for (const kw of AIRSPACE_KEYWORDS) {
      if (!kw.pattern.test(concept.name)) continue;

      const targetId = airspaceTargets.get(kw.targetSlugPattern);
      if (!targetId || targetId === concept.id) continue;

      const edgeKey = `${concept.id}|${targetId}|leads_to_discussion_of`;
      if (existingEdges.has(edgeKey)) continue;

      const target = allConcepts.find(c => c.id === targetId);
      proposedEdges.push({
        source_id: concept.id,
        target_id: targetId,
        relation_type: 'leads_to_discussion_of',
        weight: 0.7,
        confidence: 0.80,
        context: `Cross-topic keyword match: "${kw.targetSlugPattern}"`,
        source_name: concept.name.substring(0, 80),
        target_name: target?.name || 'unknown',
      });
      existingEdges.add(edgeKey);
      crossEdges++;
    }
  }

  console.log(`  Cross-topic edges proposed: ${crossEdges}`);
  console.log(`  Total proposed edges: ${proposedEdges.length}`);

  // Print sample
  console.log('\n  Sample proposed edges:');
  for (const e of proposedEdges.slice(0, 10)) {
    console.log(`    [${e.relation_type}] "${e.source_name}" → "${e.target_name}"`);
  }

  // Write edges
  if (flags.write && proposedEdges.length > 0) {
    console.log('\nWriting edges to database...');
    let written = 0;
    let errors = 0;

    for (const edge of proposedEdges) {
      const { error } = await supabase.from('concept_relations').upsert({
        source_id: edge.source_id,
        target_id: edge.target_id,
        relation_type: edge.relation_type,
        weight: edge.weight,
        confidence: edge.confidence,
        context: edge.context,
      }, { onConflict: 'source_id,target_id,relation_type' });

      if (error) {
        errors++;
        if (errors <= 3) console.error(`  Error: ${error.message}`);
      } else {
        written++;
      }
    }

    console.log(`  Written: ${written}, Errors: ${errors}`);
  }

  // Write report
  const dateStr = new Date().toISOString().split('T')[0];
  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const md = [
    '---',
    `title: "Concept Taxonomy Attachment — ${dateStr}"`,
    `date: ${dateStr}`,
    'type: graph-report',
    'tags: [heydpe, knowledge-graph, taxonomy, attachment]',
    '---',
    '',
    `# Concept → Taxonomy Attachment — ${dateStr}`,
    '',
    `**Mode:** ${flags.write ? 'WRITE' : 'DRY-RUN'}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Claims checked | ${processed} |`,
    `| Proposed new edges | ${proposedEdges.length} |`,
    `| Skipped (existing) | ${skippedExisting} |`,
    `| Cross-topic edges | ${crossEdges} |`,
    '',
    '## Edge Type Breakdown',
    '',
    `| Relation Type | Count |`,
    `|---------------|-------|`,
    `| applies_in_scenario | ${proposedEdges.filter(e => e.relation_type === 'applies_in_scenario').length} |`,
    `| leads_to_discussion_of | ${proposedEdges.filter(e => e.relation_type === 'leads_to_discussion_of').length} |`,
    '',
    '## Sample Proposed Edges',
    '',
    '| Source | Relation | Target |',
    '|--------|----------|--------|',
  ];

  for (const e of proposedEdges.slice(0, 30)) {
    md.push(`| ${e.source_name.substring(0, 60)} | ${e.relation_type} | ${e.target_name} |`);
  }

  md.push('', '*Generated by attach_concepts_to_taxonomy.ts*');

  const reportPath = path.join(reportDir, `${dateStr}-taxonomy-attachment.md`);
  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
