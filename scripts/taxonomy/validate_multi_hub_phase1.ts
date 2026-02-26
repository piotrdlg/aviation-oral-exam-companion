#!/usr/bin/env npx tsx
/**
 * validate_multi_hub_phase1.ts — Multi-Hub Knowledge Graph Phase 1 Validation Gate
 *
 * Runs structural invariant checks against the multi-hub taxonomy scaffold.
 * Exits with code 1 (FAIL) if any check fails; WARN does not cause exit 1.
 *
 * Checks:
 *   1. All source_chunks must be assigned to kb_chunk_taxonomy
 *   2. Every hub must have taxonomy nodes
 *   3. No taxonomy cycles (parent_id chain must be acyclic, max 10 hops)
 *   4. Triage rate per hub (WARN-only for Phase 1 — 100% triage is expected)
 *   5. Hub root concepts must exist in concepts table
 *   6. Scaffold edges must exist in concept_relations
 *
 * Usage:
 *   npx tsx scripts/taxonomy/validate_multi_hub_phase1.ts
 *
 * Exit codes:
 *   0 = PASS (or WARN only)
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
// Hub constants
// ---------------------------------------------------------------------------

const ALL_HUBS = ['knowledge', 'acs', 'regulations', 'aircraft'] as const;
type HubSlug = (typeof ALL_HUBS)[number];

const HUB_ROOT_CONCEPT_SLUGS: Record<HubSlug, string> = {
  knowledge: 'hub:knowledge',
  acs: 'hub:acs',
  regulations: 'hub:regulations',
  aircraft: 'hub:aircraft',
};

// ---------------------------------------------------------------------------
// Paginated fetch helper (matches graph-validate.ts pattern)
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
// CheckResult interface (matches graph-validate.ts)
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
  value: number;
  threshold: number;
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Multi-Hub Phase 1 Validation ===\n');

  const results: CheckResult[] = [];

  // =========================================================================
  // Check 1: All source_chunks assigned
  // =========================================================================
  console.log('  Check 1: Chunk assignment...');

  const { count: totalChunks, error: totalErr } = await supabase
    .from('source_chunks')
    .select('id', { count: 'exact', head: true });

  if (totalErr) {
    console.error('  Error counting source_chunks:', totalErr.message);
  }

  const { count: assignedChunks, error: assignedErr } = await supabase
    .from('kb_chunk_taxonomy')
    .select('id', { count: 'exact', head: true });

  if (assignedErr) {
    console.error('  Error counting kb_chunk_taxonomy:', assignedErr.message);
  }

  const total = totalChunks || 0;
  const assigned = assignedChunks || 0;
  const unassigned = total - assigned;

  results.push({
    name: 'Chunk assignment',
    status: unassigned > 0 ? 'FAIL' : 'PASS',
    detail: `${assigned.toLocaleString()}/${total.toLocaleString()} chunks assigned (${unassigned.toLocaleString()} unassigned)`,
    value: assigned,
    threshold: total,
  });

  // =========================================================================
  // Check 2: Every hub has taxonomy nodes
  // =========================================================================
  console.log('  Check 2: Hub taxonomy nodes...');

  const taxonomyNodes = await fetchAll<{
    id: string;
    slug: string;
    hub_slug: string;
    parent_id: string | null;
  }>('kb_taxonomy_nodes', 'id, slug, hub_slug, parent_id');

  const hubNodeCounts: Record<string, number> = {};
  for (const hub of ALL_HUBS) {
    hubNodeCounts[hub] = 0;
  }
  for (const node of taxonomyNodes) {
    if (node.hub_slug in hubNodeCounts) {
      hubNodeCounts[node.hub_slug]++;
    }
  }

  const missingHubs = ALL_HUBS.filter((h) => hubNodeCounts[h] === 0);
  const hubCountDetail = ALL_HUBS.map((h) => `${h}:${hubNodeCounts[h]}`).join(', ');

  results.push({
    name: 'Hub taxonomy nodes',
    status: missingHubs.length > 0 ? 'FAIL' : 'PASS',
    detail: hubCountDetail,
    value: ALL_HUBS.length - missingHubs.length,
    threshold: ALL_HUBS.length,
  });

  // =========================================================================
  // Check 3: No taxonomy cycles
  // =========================================================================
  console.log('  Check 3: Taxonomy cycles...');

  const nodeById = new Map<string, { slug: string; parent_id: string | null }>();
  for (const node of taxonomyNodes) {
    nodeById.set(node.id, { slug: node.slug, parent_id: node.parent_id });
  }

  let cycleCount = 0;
  let cycleDetail = '0 cycles detected';
  const MAX_DEPTH = 10;

  for (const node of taxonomyNodes) {
    const visited = new Set<string>();
    let current: string | null = node.id;
    let hops = 0;

    while (current !== null && hops <= MAX_DEPTH) {
      if (visited.has(current)) {
        cycleCount++;
        // Build cycle path for detail
        const cyclePath: string[] = [];
        let walk: string | null = node.id;
        const walkVisited = new Set<string>();
        while (walk !== null && !walkVisited.has(walk)) {
          const walkNode = nodeById.get(walk);
          cyclePath.push(walkNode?.slug || walk);
          walkVisited.add(walk);
          walk = walkNode?.parent_id || null;
        }
        if (walk) {
          const walkNode = nodeById.get(walk);
          cyclePath.push(walkNode?.slug || walk);
        }
        cycleDetail = `Cycle detected: ${cyclePath.join(' -> ')}`;
        break;
      }
      visited.add(current);
      const parentNode = nodeById.get(current);
      current = parentNode?.parent_id || null;
      hops++;
    }

    if (hops > MAX_DEPTH) {
      cycleCount++;
      cycleDetail = `Chain exceeds ${MAX_DEPTH} hops starting from ${nodeById.get(node.id)?.slug || node.id}`;
    }

    // Stop after first cycle found (enough to FAIL)
    if (cycleCount > 0) break;
  }

  results.push({
    name: 'No taxonomy cycles',
    status: cycleCount > 0 ? 'FAIL' : 'PASS',
    detail: cycleDetail,
    value: cycleCount,
    threshold: 0,
  });

  // =========================================================================
  // Check 4: Triage rate per hub
  // =========================================================================
  console.log('  Check 4: Triage rates...');

  // Fetch chunk taxonomy assignments with hub_slug and taxonomy_node_id
  const chunkAssignments = await fetchAll<{
    id: string;
    hub_slug: string;
    taxonomy_node_id: string;
  }>('kb_chunk_taxonomy', 'id, hub_slug, taxonomy_node_id');

  // Build a set of triage node IDs
  const triageNodeIds = new Set<string>();
  for (const node of taxonomyNodes) {
    if (node.slug.endsWith(':triage-unclassified')) {
      triageNodeIds.add(node.id);
    }
  }

  const hubTriageRates: Record<string, string> = {};
  let hasTriageWarn = false;

  for (const hub of ALL_HUBS) {
    const hubChunks = chunkAssignments.filter((c) => c.hub_slug === hub);
    const totalInHub = hubChunks.length;

    if (totalInHub === 0) {
      hubTriageRates[hub] = 'N/A';
      continue;
    }

    const triageInHub = hubChunks.filter((c) => triageNodeIds.has(c.taxonomy_node_id)).length;
    const triagePct = Math.round((triageInHub / totalInHub) * 100);
    hubTriageRates[hub] = `${triagePct}%`;

    // Phase 1: WARN if knowledge triage > 90%, never FAIL
    if (hub === 'knowledge' && triagePct > 90) {
      hasTriageWarn = true;
    }
  }

  const triageDetail = ALL_HUBS.map((h) => `${h}:${hubTriageRates[h] || 'N/A'}`).join(', ');

  results.push({
    name: 'Triage rates',
    status: hasTriageWarn ? 'WARN' : 'PASS',
    detail: triageDetail,
    value: 0,
    threshold: 0,
  });

  // =========================================================================
  // Check 5: Hub root concepts exist
  // =========================================================================
  console.log('  Check 5: Hub root concepts...');

  const hubRootSlugs = Object.values(HUB_ROOT_CONCEPT_SLUGS);
  const hubRootConcepts = await fetchAll<{ id: string; slug: string }>(
    'concepts',
    'id, slug',
  );

  const existingSlugs = new Set(hubRootConcepts.map((c) => c.slug));
  const foundRoots: string[] = [];
  const missingRoots: string[] = [];

  for (const hub of ALL_HUBS) {
    const slug = HUB_ROOT_CONCEPT_SLUGS[hub];
    if (existingSlugs.has(slug)) {
      foundRoots.push(slug);
    } else {
      missingRoots.push(slug);
    }
  }

  results.push({
    name: 'Hub root concepts',
    status: missingRoots.length > 0 ? 'FAIL' : 'PASS',
    detail:
      missingRoots.length === 0
        ? `${foundRoots.length}/${ALL_HUBS.length} hub roots found`
        : `Missing: ${missingRoots.join(', ')}`,
    value: foundRoots.length,
    threshold: ALL_HUBS.length,
  });

  // =========================================================================
  // Check 6: Scaffold edges exist
  // =========================================================================
  console.log('  Check 6: Scaffold edges...');

  const relations = await fetchAll<{
    id: string;
    source_id: string;
    target_id: string;
    relation_type: string;
    context: string | null;
  }>('concept_relations', 'id, source_id, target_id, relation_type, context');

  const scaffoldEdges = relations.filter(
    (r) => r.context && r.context.startsWith('hub_scaffold:v1:'),
  );

  const domainEdges = scaffoldEdges.filter(
    (r) => r.context === 'hub_scaffold:v1:domain-root-to-hub',
  );
  const acsEdges = scaffoldEdges.filter(
    (r) => r.context === 'hub_scaffold:v1:acs-area-to-hub',
  );

  const scaffoldTotal = scaffoldEdges.length;
  const MIN_SCAFFOLD_EDGES = 30;

  results.push({
    name: 'Scaffold edges',
    status:
      scaffoldTotal === 0
        ? 'FAIL'
        : scaffoldTotal < MIN_SCAFFOLD_EDGES
          ? 'WARN'
          : 'PASS',
    detail: `${scaffoldTotal} edges (${domainEdges.length} domain->knowledge, ${acsEdges.length} acs->acs)`,
    value: scaffoldTotal,
    threshold: MIN_SCAFFOLD_EDGES,
  });

  // =========================================================================
  // Print results
  // =========================================================================
  console.log('\n=== RESULTS ===\n');
  let hasFail = false;

  for (const r of results) {
    const icon = r.status;
    console.log(`  [${icon}] ${r.name}: ${r.detail}`);
    if (r.status === 'FAIL') hasFail = true;
  }

  const overall = hasFail ? 'FAIL' : results.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // =========================================================================
  // Write markdown report
  // =========================================================================
  const dateStr = new Date().toISOString().split('T')[0];
  const reportsDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const mdLines = [
    '---',
    `title: "Multi-Hub Phase 1 Validation — ${dateStr}"`,
    `date: ${dateStr}`,
    'type: multi-hub-validation',
    'tags: [heydpe, knowledge-graph, multi-hub, validation]',
    `status: ${overall}`,
    '---',
    '',
    `# Multi-Hub Phase 1 Validation — ${dateStr}`,
    '',
    '| Check | Status | Detail | Threshold |',
    '|-------|--------|--------|-----------|',
  ];

  for (const r of results) {
    mdLines.push(`| ${r.name} | ${r.status} | ${r.detail} | ${r.threshold} |`);
  }

  mdLines.push('');
  mdLines.push(`**Overall: ${overall}**`);
  mdLines.push('');
  mdLines.push('*Generated by `npx tsx scripts/taxonomy/validate_multi_hub_phase1.ts`*');

  const mdPath = path.join(reportsDir, `${dateStr}-multi-hub-phase1-validation.md`);
  fs.writeFileSync(mdPath, mdLines.join('\n'));

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
