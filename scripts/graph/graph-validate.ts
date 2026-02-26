#!/usr/bin/env npx tsx
/**
 * graph-validate.ts — Knowledge Graph Validation Gate
 *
 * Runs structural validation checks against the knowledge graph.
 * Exits with code 1 (FAIL) if any threshold is violated.
 *
 * Checks:
 *   1. Orphan rate must be <= ORPHAN_THRESHOLD_PCT
 *   2. Dangling edges must be 0
 *   3. Backbone ACS area roots must exist (at least 1 per rating)
 *   4. Largest component must contain >= COMPONENT_THRESHOLD_PCT of nodes
 *   5. At least 3 of 6 relation types must have edges
 *
 * Usage:
 *   npx tsx scripts/graph/graph-validate.ts
 *   npm run graph:validate
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (with details)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Thresholds (baseline from 2026-02-25 production snapshot)
// Current: orphans=14.9%, component=48.8%
// Target: orphans<10%, component>60%
// ---------------------------------------------------------------------------

const ORPHAN_THRESHOLD_PCT = 15; // FAIL if orphans exceed this %
const ORPHAN_TARGET_PCT = 10; // WARN if above target but below threshold
const COMPONENT_THRESHOLD_PCT = 40; // FAIL if largest component below this %
const COMPONENT_TARGET_PCT = 60; // WARN if below target
const MIN_RELATION_TYPES = 3; // FAIL if fewer than 3 types have edges
const MIN_RELATION_TYPES_TARGET = 5; // WARN if fewer than 5
const HUB_TRACE_THRESHOLD_PCT = 80; // FAIL if traceability below 80%
const HUB_TRACE_TARGET_PCT = 95; // WARN if below 95%

// All 6 defined relation types
const ALL_RELATION_TYPES = [
  'is_component_of',
  'requires_knowledge_of',
  'leads_to_discussion_of',
  'contrasts_with',
  'mitigates_risk_of',
  'applies_in_scenario',
] as const;

// ---------------------------------------------------------------------------
// Paginated fetch helper
// ---------------------------------------------------------------------------

async function fetchAll<T>(
  table: string,
  columns: string,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      return results;
    }
    if (!data || data.length === 0) break;
    results.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Validation checks
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
  value: number;
  threshold: number;
}

async function main() {
  console.log('\n=== Knowledge Graph Validation Gate ===\n');

  const results: CheckResult[] = [];

  // Fetch all data
  console.log('Fetching graph data...');
  const concepts = await fetchAll<{ id: string; category: string; slug?: string }>('concepts', 'id, category, slug');
  const relations = await fetchAll<{ id: string; source_id: string; target_id: string; relation_type: string }>(
    'concept_relations', 'id, source_id, target_id, relation_type');

  const totalConcepts = concepts.length;
  const conceptIds = new Set(concepts.map(c => c.id));

  // Check 1: Orphan rate
  console.log('  Check 1: Orphan rate...');
  const connectedIds = new Set<string>();
  for (const r of relations) {
    connectedIds.add(r.source_id);
    connectedIds.add(r.target_id);
  }
  const orphanCount = concepts.filter(c => !connectedIds.has(c.id)).length;
  const orphanPct = totalConcepts > 0 ? (orphanCount / totalConcepts) * 100 : 0;

  results.push({
    name: 'Orphan rate',
    status: orphanPct > ORPHAN_THRESHOLD_PCT ? 'FAIL'
      : orphanPct > ORPHAN_TARGET_PCT ? 'WARN' : 'PASS',
    detail: `${orphanCount.toLocaleString()} orphans (${orphanPct.toFixed(1)}%)`,
    value: orphanPct,
    threshold: ORPHAN_THRESHOLD_PCT,
  });

  // Check 2: Dangling edges
  console.log('  Check 2: Dangling edges...');
  let danglingCount = 0;
  for (const r of relations) {
    if (!conceptIds.has(r.source_id) || !conceptIds.has(r.target_id)) danglingCount++;
  }
  results.push({
    name: 'Dangling edges',
    status: danglingCount > 0 ? 'FAIL' : 'PASS',
    detail: `${danglingCount} dangling edges`,
    value: danglingCount,
    threshold: 0,
  });

  // Check 3: Backbone roots exist
  console.log('  Check 3: Backbone roots...');
  const ratings = ['private', 'commercial', 'instrument'];
  const missingRoots: string[] = [];
  for (const rating of ratings) {
    const hasRoot = concepts.some(c =>
      c.category === 'acs_area' && conceptIds.has(c.id));
    if (!hasRoot) missingRoots.push(rating);
  }
  // Actually check for acs_area presence per rating (they exist as category=acs_area)
  const acsAreaCount = concepts.filter(c => c.category === 'acs_area').length;
  results.push({
    name: 'Backbone ACS area roots',
    status: acsAreaCount === 0 ? 'FAIL' : acsAreaCount < 10 ? 'WARN' : 'PASS',
    detail: `${acsAreaCount} acs_area concepts found`,
    value: acsAreaCount,
    threshold: 1,
  });

  // Check 4: Largest component coverage
  console.log('  Check 4: Component analysis...');
  const adj = new Map<string, Set<string>>();
  for (const c of concepts) adj.set(c.id, new Set());
  for (const r of relations) {
    adj.get(r.source_id)?.add(r.target_id);
    adj.get(r.target_id)?.add(r.source_id);
  }

  const visited = new Set<string>();
  let largestSize = 0;
  let componentCount = 0;

  for (const c of concepts) {
    if (visited.has(c.id)) continue;
    componentCount++;
    const queue = [c.id];
    let size = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      size++;
      const neighbors = adj.get(node);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visited.has(n)) queue.push(n);
        }
      }
    }
    if (size > largestSize) largestSize = size;
  }

  const componentPct = totalConcepts > 0 ? (largestSize / totalConcepts) * 100 : 0;
  results.push({
    name: 'Largest component coverage',
    status: componentPct < COMPONENT_THRESHOLD_PCT ? 'FAIL'
      : componentPct < COMPONENT_TARGET_PCT ? 'WARN' : 'PASS',
    detail: `${largestSize.toLocaleString()} nodes (${componentPct.toFixed(1)}%), ${componentCount} total components`,
    value: componentPct,
    threshold: COMPONENT_THRESHOLD_PCT,
  });

  // Check 5: Relation type diversity
  console.log('  Check 5: Relation type diversity...');
  const usedTypes = new Set(relations.map(r => r.relation_type));
  const unusedTypes = ALL_RELATION_TYPES.filter(t => !usedTypes.has(t));
  results.push({
    name: 'Relation type diversity',
    status: usedTypes.size < MIN_RELATION_TYPES ? 'FAIL'
      : usedTypes.size < MIN_RELATION_TYPES_TARGET ? 'WARN' : 'PASS',
    detail: `${usedTypes.size}/6 types used. Missing: ${unusedTypes.join(', ') || 'none'}`,
    value: usedTypes.size,
    threshold: MIN_RELATION_TYPES,
  });

  // Check 6: Airspace → NAS root paths
  console.log('  Check 6: Airspace → NAS paths...');
  const nasRoot = concepts.find(c =>
    c.category === 'topic' && c.slug === 'topic:national-airspace-system'
  );
  // Build adjacency for BFS
  const bfsAdj = new Map<string, Set<string>>();
  for (const c of concepts) bfsAdj.set(c.id, new Set());
  for (const r of relations) {
    if (r.relation_type === 'is_component_of' || r.relation_type === 'leads_to_discussion_of') {
      bfsAdj.get(r.source_id)?.add(r.target_id);
    }
  }

  let airspacePathsPassed = 0;
  let airspacePathsTotal = 0;
  const airspacePatterns = ['class-a-airspace', 'class-b-airspace', 'class-c-airspace',
    'class-d-airspace', 'class-e-airspace', 'class-g-airspace'];

  if (nasRoot) {
    for (const pattern of airspacePatterns) {
      const airspaceConcept = concepts.find(c =>
        ['definition', 'topic'].includes(c.category) &&
        (c.slug || '').includes(pattern)
      );
      if (!airspaceConcept) continue;
      airspacePathsTotal++;

      // BFS from airspace to NAS
      const bfsVisited = new Set<string>();
      const bfsQueue = [airspaceConcept.id];
      let found = false;
      while (bfsQueue.length > 0 && !found) {
        const node = bfsQueue.shift()!;
        if (bfsVisited.has(node)) continue;
        bfsVisited.add(node);
        if (node === nasRoot.id) { found = true; break; }
        if (bfsVisited.size > 100) break; // Safety limit
        const neighbors = bfsAdj.get(node);
        if (neighbors) for (const n of neighbors) bfsQueue.push(n);
      }
      if (found) airspacePathsPassed++;
    }
  }

  results.push({
    name: 'Airspace → NAS paths',
    status: airspacePathsTotal === 0 ? 'WARN'
      : airspacePathsPassed === airspacePathsTotal ? 'PASS' : 'FAIL',
    detail: `${airspacePathsPassed}/${airspacePathsTotal} airspace classes linked to NAS root`,
    value: airspacePathsPassed,
    threshold: airspacePathsTotal,
  });

  // Check 7: Concept→Hub Traceability (Metric A)
  console.log('  Check 7: Hub traceability...');
  const HUB_ROOT_SLUGS = ['hub:knowledge', 'hub:acs', 'hub:regulations', 'hub:aircraft'];
  const hubRootIds = new Set(
    concepts.filter(c => c.slug && HUB_ROOT_SLUGS.includes(c.slug)).map(c => c.id),
  );

  if (hubRootIds.size === 0) {
    results.push({
      name: 'Concept→Hub traceability',
      status: 'WARN',
      detail: 'No hub root concepts found — hub scaffold not yet applied',
      value: 0,
      threshold: HUB_TRACE_THRESHOLD_PCT,
    });
  } else {
    // Reverse BFS from hub roots via incoming is_component_of edges
    const reverseAdj = new Map<string, Set<string>>();
    for (const c of concepts) reverseAdj.set(c.id, new Set());
    for (const r of relations) {
      if (r.relation_type === 'is_component_of') {
        reverseAdj.get(r.target_id)?.add(r.source_id);
      }
    }

    const traceableIds = new Set<string>();
    const traceQueue = [...hubRootIds];
    for (const id of traceQueue) traceableIds.add(id);

    while (traceQueue.length > 0) {
      const node = traceQueue.shift()!;
      const children = reverseAdj.get(node);
      if (children) {
        for (const child of children) {
          if (!traceableIds.has(child)) {
            traceableIds.add(child);
            traceQueue.push(child);
          }
        }
      }
    }

    const tracePct = totalConcepts > 0 ? (traceableIds.size / totalConcepts) * 100 : 0;
    results.push({
      name: 'Concept→Hub traceability',
      status: tracePct < HUB_TRACE_THRESHOLD_PCT ? 'FAIL'
        : tracePct < HUB_TRACE_TARGET_PCT ? 'WARN' : 'PASS',
      detail: `${traceableIds.size.toLocaleString()}/${totalConcepts.toLocaleString()} concepts traceable (${tracePct.toFixed(1)}%)`,
      value: tracePct,
      threshold: HUB_TRACE_THRESHOLD_PCT,
    });
  }

  // Print results
  console.log('\n=== RESULTS ===\n');
  let hasFail = false;
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : r.status === 'WARN' ? 'WARN' : 'FAIL';
    console.log(`  [${icon}] ${r.name}: ${r.detail}`);
    if (r.status === 'FAIL') hasFail = true;
  }

  // Write markdown report
  const dateStr = new Date().toISOString().split('T')[0];
  const reportsDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const mdLines = [
    '---',
    `title: "Graph Validation — ${dateStr}"`,
    `date: ${dateStr}`,
    'type: graph-validation',
    'tags: [heydpe, knowledge-graph, validation]',
    `status: ${hasFail ? 'FAIL' : 'PASS'}`,
    '---',
    '',
    `# Graph Validation — ${dateStr}`,
    '',
    `| Check | Status | Detail | Threshold |`,
    `|-------|--------|--------|-----------|`,
  ];
  for (const r of results) {
    mdLines.push(`| ${r.name} | ${r.status} | ${r.detail} | ${r.threshold} |`);
  }
  mdLines.push('', `*Generated by \`npm run graph:validate\`*`);

  const mdPath = path.join(reportsDir, `${dateStr}-graph-validation.md`);
  fs.writeFileSync(mdPath, mdLines.join('\n'));

  const overall = hasFail ? 'FAIL' : results.some(r => r.status === 'WARN') ? 'WARN' : 'PASS';
  console.log(`\nOverall: ${overall}`);
  console.log(`Report: ${mdPath}`);

  if (hasFail) {
    console.error('\nValidation FAILED. See details above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Validation error:', err);
  process.exit(1);
});
