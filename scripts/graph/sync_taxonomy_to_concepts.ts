#!/usr/bin/env npx tsx
/**
 * sync_taxonomy_to_concepts.ts — Promote taxonomy nodes into the concept graph
 *
 * For each kb_taxonomy_nodes row, upsert a corresponding concept and create
 * is_component_of edges that mirror the taxonomy tree inside the concept graph.
 *
 * Steps:
 *   1. Fetch all kb_taxonomy_nodes (~1,900 rows)
 *   2. Upsert each node as a concept (slug, name, category=taxonomy_node)
 *   3. Create is_component_of edges from child concept → parent concept
 *   4. Create is_component_of edges from L1 concepts → hub root concepts
 *
 * Constraints:
 *   - Triage/unclassified nodes (slug LIKE '%:triage-unclassified') are skipped
 *   - Existing concepts with matching slugs are kept as-is (no overwrite)
 *   - All edges use context prefix 'phase2_taxonomy_tree:v1:' for rollback
 *   - Batch upserts in groups of 200
 *   - --dry-run is the default mode
 *   - --write requires ALLOW_PROD_WRITE=1 for production
 *
 * Usage:
 *   npx tsx scripts/graph/sync_taxonomy_to_concepts.ts              # dry-run
 *   npx tsx scripts/graph/sync_taxonomy_to_concepts.ts --write      # live write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/sync_taxonomy_to_concepts.ts --write  # production
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
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
// Types
// ---------------------------------------------------------------------------

interface TaxonomyNode {
  id: string;
  slug: string;
  title: string;
  level: number;
  parent_id: string | null;
  hub_slug: string;
}

interface ConceptRow {
  id: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean; contextPrefix: string } {
  const args = process.argv.slice(2);
  let contextPrefix = 'phase2_taxonomy_tree:v1';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' && args[i + 1]) {
      contextPrefix = args[++i];
    }
  }
  if (args.includes('--write')) return { dryRun: false, contextPrefix };
  return { dryRun: true, contextPrefix };
}

// ---------------------------------------------------------------------------
// Paginated fetch
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
// Helpers
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTriageNode(slug: string): boolean {
  return slug.endsWith(':triage-unclassified');
}

/** Split an array into chunks of a given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Hub root slug mapping
// ---------------------------------------------------------------------------

const HUB_ROOT_SLUGS: Record<string, string> = {
  knowledge: 'hub:knowledge',
  acs: 'hub:acs',
  regulations: 'hub:regulations',
  aircraft: 'hub:aircraft',
};

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

interface Stats {
  totalNodes: number;
  triageSkipped: number;
  conceptsCreated: number;
  conceptsExisting: number;
  conceptErrors: number;
  parentEdgesCreated: number;
  parentEdgesExisting: number;
  parentEdgeErrors: number;
  l1HubEdgesCreated: number;
  l1HubEdgesExisting: number;
  l1HubEdgeErrors: number;
  byHub: Record<string, { nodes: number; concepts: number; parentEdges: number; l1Edges: number }>;
}

function emptyStats(): Stats {
  return {
    totalNodes: 0,
    triageSkipped: 0,
    conceptsCreated: 0,
    conceptsExisting: 0,
    conceptErrors: 0,
    parentEdgesCreated: 0,
    parentEdgesExisting: 0,
    parentEdgeErrors: 0,
    l1HubEdgesCreated: 0,
    l1HubEdgesExisting: 0,
    l1HubEdgeErrors: 0,
    byHub: {},
  };
}

function ensureHub(stats: Stats, hub: string): void {
  if (!stats.byHub[hub]) {
    stats.byHub[hub] = { nodes: 0, concepts: 0, parentEdges: 0, l1Edges: 0 };
  }
}

// ---------------------------------------------------------------------------
// Step 1: Sync taxonomy nodes to concepts
// ---------------------------------------------------------------------------

async function syncConcepts(
  nodes: TaxonomyNode[],
  existingSlugs: Set<string>,
  dryRun: boolean,
  stats: Stats,
): Promise<Map<string, string>> {
  console.log('\nStep 1: Syncing taxonomy nodes to concepts...');
  console.log(`  Total taxonomy nodes: ${nodes.length}`);

  const slugToConceptId = new Map<string, string>();

  // First, load existing concepts whose slugs match any taxonomy node
  const matchingSlugs = nodes.map((n) => n.slug);
  // Fetch in batches to avoid URL length limits
  for (const slugBatch of chunk(matchingSlugs, 200)) {
    const { data } = await supabase
      .from('concepts')
      .select('id, slug')
      .in('slug', slugBatch);
    if (data) {
      for (const row of data as ConceptRow[]) {
        slugToConceptId.set(row.slug, row.id);
      }
    }
  }

  // Separate nodes into: triage (skip), existing (already in concepts), new (need creation)
  const triageNodes: TaxonomyNode[] = [];
  const existingNodes: TaxonomyNode[] = [];
  const newNodes: TaxonomyNode[] = [];

  for (const node of nodes) {
    ensureHub(stats, node.hub_slug);
    stats.byHub[node.hub_slug].nodes++;

    if (isTriageNode(node.slug)) {
      triageNodes.push(node);
      stats.triageSkipped++;
      continue;
    }

    if (slugToConceptId.has(node.slug)) {
      existingNodes.push(node);
      stats.conceptsExisting++;
      continue;
    }

    newNodes.push(node);
  }

  console.log(`  Skipping triage nodes: ${triageNodes.length}`);
  console.log(`  Already in concepts: ${existingNodes.length}`);

  if (dryRun) {
    console.log(`  [DRY-RUN] Would create: ${newNodes.length} new concepts, ${existingNodes.length} already exist`);
    // In dry-run, assign placeholder IDs for edge planning
    for (const node of newNodes) {
      slugToConceptId.set(node.slug, `dry-run-${node.slug}`);
      stats.conceptsCreated++;
      ensureHub(stats, node.hub_slug);
      stats.byHub[node.hub_slug].concepts++;
    }
    return slugToConceptId;
  }

  // Batch upsert new concepts in groups of 200
  const batches = chunk(newNodes, 200);
  let batchNum = 0;

  for (const batch of batches) {
    batchNum++;
    const rows = batch.map((node) => ({
      slug: node.slug,
      name: node.title,
      name_normalized: normalizeName(node.title),
      category: 'taxonomy_node',
      content: `Taxonomy node: ${node.title} (hub: ${node.hub_slug}, level: L${node.level})`,
      validation_status: 'validated',
      key_facts: [],
      common_misconceptions: [],
      aliases: [],
    }));

    const { data, error } = await supabase
      .from('concepts')
      .upsert(rows, { onConflict: 'slug' })
      .select('id, slug');

    if (error) {
      console.error(`  [ERROR] Batch ${batchNum}: ${error.message}`);
      stats.conceptErrors += batch.length;
    } else if (data) {
      for (const row of data as ConceptRow[]) {
        slugToConceptId.set(row.slug, row.id);
      }
      stats.conceptsCreated += data.length;
      for (const node of batch) {
        ensureHub(stats, node.hub_slug);
        stats.byHub[node.hub_slug].concepts++;
      }
      if (batchNum % 5 === 0 || batchNum === batches.length) {
        console.log(`  Batch ${batchNum}/${batches.length}: ${data.length} upserted`);
      }
    }
  }

  console.log(`  Concepts created: ${stats.conceptsCreated}, errors: ${stats.conceptErrors}`);

  return slugToConceptId;
}

// ---------------------------------------------------------------------------
// Step 2: Create parent->child edges
// ---------------------------------------------------------------------------

async function createParentEdges(
  nodes: TaxonomyNode[],
  nodeById: Map<string, TaxonomyNode>,
  slugToConceptId: Map<string, string>,
  dryRun: boolean,
  stats: Stats,
  contextPrefix = 'phase2_taxonomy_tree:v1',
): Promise<void> {
  console.log('\nStep 2: Creating parent->child edges...');

  // Collect edges to create
  interface EdgeRow {
    source_id: string;
    target_id: string;
    relation_type: string;
    weight: number;
    confidence: number;
    context: string;
  }

  const edgesToCreate: EdgeRow[] = [];
  let skippedTriage = 0;
  let skippedMissingParent = 0;
  let skippedMissingConcept = 0;

  for (const node of nodes) {
    if (isTriageNode(node.slug)) {
      skippedTriage++;
      continue;
    }
    if (!node.parent_id) continue;

    const parentNode = nodeById.get(node.parent_id);
    if (!parentNode) {
      skippedMissingParent++;
      continue;
    }
    if (isTriageNode(parentNode.slug)) {
      skippedTriage++;
      continue;
    }

    const childConceptId = slugToConceptId.get(node.slug);
    const parentConceptId = slugToConceptId.get(parentNode.slug);

    if (!childConceptId || !parentConceptId) {
      skippedMissingConcept++;
      continue;
    }

    edgesToCreate.push({
      source_id: childConceptId,
      target_id: parentConceptId,
      relation_type: 'is_component_of',
      weight: 1.0,
      confidence: 1.0,
      context: `${contextPrefix}:parent`,
    });
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Would create: ${edgesToCreate.length} edges (context: ${contextPrefix}:parent)`);
    stats.parentEdgesCreated = edgesToCreate.length;
    for (const node of nodes) {
      if (!isTriageNode(node.slug) && node.parent_id) {
        const parentNode = nodeById.get(node.parent_id);
        if (parentNode && !isTriageNode(parentNode.slug)) {
          ensureHub(stats, node.hub_slug);
          stats.byHub[node.hub_slug].parentEdges++;
        }
      }
    }
    return;
  }

  // Batch upsert edges
  const batches = chunk(edgesToCreate, 200);
  let batchNum = 0;

  for (const batch of batches) {
    batchNum++;
    const { data, error } = await supabase
      .from('concept_relations')
      .upsert(batch, { onConflict: 'source_id,target_id,relation_type' })
      .select('id');

    if (error) {
      console.error(`  [ERROR] Edge batch ${batchNum}: ${error.message}`);
      stats.parentEdgeErrors += batch.length;
    } else if (data) {
      stats.parentEdgesCreated += data.length;
      if (batchNum % 5 === 0 || batchNum === batches.length) {
        console.log(`  Edge batch ${batchNum}/${batches.length}: ${data.length} upserted`);
      }
    }
  }

  // Count by hub for reporting
  for (const node of nodes) {
    if (!isTriageNode(node.slug) && node.parent_id) {
      const parentNode = nodeById.get(node.parent_id);
      if (parentNode && !isTriageNode(parentNode.slug)) {
        ensureHub(stats, node.hub_slug);
        stats.byHub[node.hub_slug].parentEdges++;
      }
    }
  }

  console.log(`  Parent edges created: ${stats.parentEdgesCreated}, errors: ${stats.parentEdgeErrors}`);
  if (skippedMissingParent > 0) console.log(`  Skipped (missing parent node): ${skippedMissingParent}`);
  if (skippedMissingConcept > 0) console.log(`  Skipped (missing concept ID): ${skippedMissingConcept}`);
}

// ---------------------------------------------------------------------------
// Step 3: Create L1->hub root edges
// ---------------------------------------------------------------------------

async function createL1HubEdges(
  nodes: TaxonomyNode[],
  slugToConceptId: Map<string, string>,
  dryRun: boolean,
  stats: Stats,
  contextPrefix = 'phase2_taxonomy_tree:v1',
): Promise<void> {
  console.log('\nStep 3: Creating L1->hub root edges...');

  // Fetch hub root concept IDs
  const hubRootSlugs = Object.values(HUB_ROOT_SLUGS);
  const { data: hubConcepts } = await supabase
    .from('concepts')
    .select('id, slug')
    .in('slug', hubRootSlugs);

  const hubSlugToConceptId = new Map<string, string>();
  if (hubConcepts) {
    for (const row of hubConcepts as ConceptRow[]) {
      hubSlugToConceptId.set(row.slug, row.id);
    }
  }

  console.log(`  Hub root concepts found: ${hubSlugToConceptId.size}/${hubRootSlugs.length}`);

  // Find L1 nodes (level=1) that are not triage
  const l1Nodes = nodes.filter((n) => n.level === 1 && !isTriageNode(n.slug));
  console.log(`  L1 nodes to attach: ${l1Nodes.length}`);

  interface EdgeRow {
    source_id: string;
    target_id: string;
    relation_type: string;
    weight: number;
    confidence: number;
    context: string;
  }

  const edgesToCreate: EdgeRow[] = [];
  let skippedMissingHub = 0;
  let skippedMissingConcept = 0;

  for (const node of l1Nodes) {
    const hubRootSlug = HUB_ROOT_SLUGS[node.hub_slug];
    if (!hubRootSlug) {
      skippedMissingHub++;
      continue;
    }

    const hubConceptId = hubSlugToConceptId.get(hubRootSlug);
    const l1ConceptId = slugToConceptId.get(node.slug);

    if (!l1ConceptId || !hubConceptId) {
      skippedMissingConcept++;
      continue;
    }

    edgesToCreate.push({
      source_id: l1ConceptId,
      target_id: hubConceptId,
      relation_type: 'is_component_of',
      weight: 1.0,
      confidence: 1.0,
      context: `${contextPrefix}:l1-to-hub`,
    });

    ensureHub(stats, node.hub_slug);
    stats.byHub[node.hub_slug].l1Edges++;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Would create: ${edgesToCreate.length} edges (context: ${contextPrefix}:l1-to-hub)`);
    stats.l1HubEdgesCreated = edgesToCreate.length;
    return;
  }

  // Batch upsert
  const batches = chunk(edgesToCreate, 200);
  let batchNum = 0;

  for (const batch of batches) {
    batchNum++;
    const { data, error } = await supabase
      .from('concept_relations')
      .upsert(batch, { onConflict: 'source_id,target_id,relation_type' })
      .select('id');

    if (error) {
      console.error(`  [ERROR] L1-hub edge batch ${batchNum}: ${error.message}`);
      stats.l1HubEdgeErrors += batch.length;
    } else if (data) {
      stats.l1HubEdgesCreated += data.length;
    }
  }

  console.log(`  L1->hub edges created: ${stats.l1HubEdgesCreated}, errors: ${stats.l1HubEdgeErrors}`);
  if (skippedMissingHub > 0) console.log(`  Skipped (missing hub root): ${skippedMissingHub}`);
  if (skippedMissingConcept > 0) console.log(`  Skipped (missing concept ID): ${skippedMissingConcept}`);
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(stats: Stats, mode: string): string {
  const date = new Date().toISOString().slice(0, 10);

  const totalEdges =
    stats.parentEdgesCreated + stats.l1HubEdgesCreated;

  // Hub breakdown rows
  const hubRows = Object.entries(stats.byHub)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([hub, h]) =>
        `| ${hub} | ${h.nodes} | ${h.concepts} | ${h.parentEdges} | ${h.l1Edges} |`,
    )
    .join('\n');

  return `---
title: "Taxonomy Concept Sync \u2014 ${date}"
date: ${date}
type: graph-report
tags: [heydpe, knowledge-graph, taxonomy, concept-sync]
---

# Taxonomy \u2192 Concepts Sync \u2014 ${date}

**Mode:** ${mode}

## Summary

| Metric | Value |
|--------|-------|
| Total taxonomy nodes | ${stats.totalNodes} |
| Triage skipped | ${stats.triageSkipped} |
| Concepts created (new) | ${stats.conceptsCreated} |
| Concepts skipped (existing) | ${stats.conceptsExisting} |
| Concept errors | ${stats.conceptErrors} |
| Parent edges created | ${stats.parentEdgesCreated} |
| L1\u2192hub edges created | ${stats.l1HubEdgesCreated} |
| **Total edges** | **${totalEdges}** |

## Breakdown by Hub

| Hub | Nodes | New Concepts | Parent Edges | L1\u2192Hub Edges |
|-----|-------|-------------|-------------|----------------|
${hubRows}

## Context Tags

| Context | Purpose |
|---------|---------|
| \`phase2_taxonomy_tree:v1:parent\` | Child \u2192 parent taxonomy edges |
| \`phase2_taxonomy_tree:v1:l1-to-hub\` | L1 node \u2192 hub root edges |

*Generated by sync_taxonomy_to_concepts.ts*
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { dryRun, contextPrefix } = parseArgs();

  console.log('\n=== Taxonomy \u2192 Concepts Sync ===');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Context prefix: ${contextPrefix}`);

  // Safety check
  if (!dryRun) {
    assertNotProduction('sync-taxonomy-concepts', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn('WARNING: ALLOW_PROD_WRITE=1 \u2014 production write override active!\n');
    }
  }

  const stats = emptyStats();

  // Fetch all taxonomy nodes
  console.log('\nLoading taxonomy nodes...');
  const allNodes = await fetchAll<TaxonomyNode>(
    'kb_taxonomy_nodes',
    'id, slug, title, level, parent_id, hub_slug',
  );
  stats.totalNodes = allNodes.length;
  console.log(`  Loaded: ${allNodes.length} taxonomy nodes`);

  if (allNodes.length === 0) {
    console.log('No taxonomy nodes found. Nothing to do.');
    return;
  }

  // Build lookup by id
  const nodeById = new Map<string, TaxonomyNode>();
  for (const node of allNodes) {
    nodeById.set(node.id, node);
  }

  // Build set of existing concept slugs for quick lookup
  const existingSlugs = new Set<string>();
  const existingConcepts = await fetchAll<ConceptRow>('concepts', 'id, slug');
  for (const c of existingConcepts) {
    existingSlugs.add(c.slug);
  }
  console.log(`  Existing concepts in DB: ${existingSlugs.size}`);

  // Step 1: Sync taxonomy nodes to concepts
  const slugToConceptId = await syncConcepts(allNodes, existingSlugs, dryRun, stats);

  // Step 2: Create parent->child edges
  await createParentEdges(allNodes, nodeById, slugToConceptId, dryRun, stats, contextPrefix);

  // Step 3: Create L1->hub root edges
  await createL1HubEdges(allNodes, slugToConceptId, dryRun, stats, contextPrefix);

  // Summary
  const totalEdges = stats.parentEdgesCreated + stats.l1HubEdgesCreated;
  console.log('\nSummary:');
  console.log(`  Concepts: ${stats.conceptsCreated} new, ${stats.conceptsExisting} existing`);
  console.log(`  Edges: ${stats.parentEdgesCreated} parent + ${stats.l1HubEdgesCreated} L1\u2192hub = ${totalEdges}`);

  // Write report
  const mode = dryRun ? 'DRY-RUN' : 'WRITE';
  const reportContent = generateReport(stats, mode);
  const date = new Date().toISOString().slice(0, 10);
  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, `${date}-taxonomy-concept-sync.md`);
  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  console.log(`\nReport written to: ${reportPath}`);

  if (dryRun) {
    console.log('\nRun with --write to apply changes.');
    console.log(
      'For production: ALLOW_PROD_WRITE=1 npx tsx scripts/graph/sync_taxonomy_to_concepts.ts --write',
    );
  }
}

main().catch((err) => {
  console.error('Taxonomy concept sync error:', err);
  process.exit(1);
});
