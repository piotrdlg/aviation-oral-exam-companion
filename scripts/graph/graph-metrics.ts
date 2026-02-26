#!/usr/bin/env npx tsx
/**
 * graph-metrics.ts — Production Knowledge Graph Metrics Snapshot
 *
 * Connects to Supabase (service role) and computes:
 * 1. Counts: concepts by category, relations by type, evidence coverage
 * 2. Orphan analysis: nodes with zero in-degree AND zero out-degree
 * 3. Component analysis: connected components via undirected BFS
 * 4. Root reachability: % of nodes reachable from backbone roots within N hops
 * 5. Edge sanity: dangling edges, self-loops, duplicates
 *
 * Output:
 *   - docs/graph-reports/YYYY-MM-DD-graph-metrics.json
 *   - docs/graph-reports/YYYY-MM-DD-graph-metrics.md
 *   - Console summary
 *
 * Usage:
 *   npx tsx scripts/graph/graph-metrics.ts
 *   npm run graph:metrics
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
// Types
// ---------------------------------------------------------------------------

interface ConceptRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  created_at: string;
}

interface RelationRow {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
}

interface MetricsReport {
  timestamp: string;
  environment: string;
  counts: {
    concepts_total: number;
    concepts_by_category: Record<string, number>;
    relations_total: number;
    relations_by_type: Record<string, number>;
    evidence_total: number;
    concepts_with_evidence: number;
    evidence_coverage_pct: number;
  };
  orphans: {
    total: number;
    by_category: Record<string, number>;
    top_50: Array<{ name: string; category: string; slug: string }>;
  };
  components: {
    total: number;
    largest_size: number;
    largest_pct: number;
    sizes: number[];
  };
  root_reachability: Array<{
    root_name: string;
    root_slug: string;
    reachable_count: number;
    reachable_pct: number;
    max_hops: number;
  }>;
  edge_sanity: {
    dangling_edges: number;
    self_loops: number;
    duplicate_edges: number;
    dangling_details: Array<{ id: string; source_id: string; target_id: string; issue: string }>;
  };
  hub_traceability: {
    traceable_count: number;
    total_count: number;
    traceable_pct: number;
    by_category: Record<string, { traceable: number; total: number; pct: number }>;
  };
  chunk_triage: {
    per_hub: Record<string, { triage: number; total: number; triage_pct: number }>;
  };
}

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
// 1. Counts
// ---------------------------------------------------------------------------

async function computeCounts() {
  console.log('  Computing counts...');

  const concepts = await fetchAll<ConceptRow>('concepts', 'id, name, slug, category, created_at');
  const relations = await fetchAll<RelationRow>('concept_relations', 'id, source_id, target_id, relation_type');

  const { count: evidenceTotal } = await supabase
    .from('concept_chunk_evidence')
    .select('id', { count: 'exact', head: true });

  // Concepts with evidence
  const evidenceConcepts = await fetchAll<{ concept_id: string }>('concept_chunk_evidence', 'concept_id');
  const uniqueEvidenceConcepts = new Set(evidenceConcepts.map(e => e.concept_id));

  const conceptsByCategory: Record<string, number> = {};
  for (const c of concepts) {
    conceptsByCategory[c.category] = (conceptsByCategory[c.category] ?? 0) + 1;
  }

  const relationsByType: Record<string, number> = {};
  for (const r of relations) {
    relationsByType[r.relation_type] = (relationsByType[r.relation_type] ?? 0) + 1;
  }

  return {
    concepts,
    relations,
    counts: {
      concepts_total: concepts.length,
      concepts_by_category: conceptsByCategory,
      relations_total: relations.length,
      relations_by_type: relationsByType,
      evidence_total: evidenceTotal ?? 0,
      concepts_with_evidence: uniqueEvidenceConcepts.size,
      evidence_coverage_pct:
        concepts.length > 0
          ? Math.round((uniqueEvidenceConcepts.size / concepts.length) * 10000) / 100
          : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Orphan analysis
// ---------------------------------------------------------------------------

function computeOrphans(
  concepts: ConceptRow[],
  relations: RelationRow[],
) {
  console.log('  Computing orphans...');

  const connectedIds = new Set<string>();
  for (const r of relations) {
    connectedIds.add(r.source_id);
    connectedIds.add(r.target_id);
  }

  const orphans = concepts.filter(c => !connectedIds.has(c.id));

  const orphansByCategory: Record<string, number> = {};
  for (const o of orphans) {
    orphansByCategory[o.category] = (orphansByCategory[o.category] ?? 0) + 1;
  }

  // Sort orphans by category then name for readability
  const sortedOrphans = orphans
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .slice(0, 50)
    .map(o => ({ name: o.name, category: o.category, slug: o.slug }));

  return {
    total: orphans.length,
    by_category: orphansByCategory,
    top_50: sortedOrphans,
  };
}

// ---------------------------------------------------------------------------
// 3. Component analysis (undirected BFS)
// ---------------------------------------------------------------------------

function computeComponents(
  concepts: ConceptRow[],
  relations: RelationRow[],
) {
  console.log('  Computing connected components...');

  // Build undirected adjacency list
  const adj = new Map<string, Set<string>>();
  for (const c of concepts) {
    adj.set(c.id, new Set());
  }
  for (const r of relations) {
    adj.get(r.source_id)?.add(r.target_id);
    adj.get(r.target_id)?.add(r.source_id);
  }

  const visited = new Set<string>();
  const componentSizes: number[] = [];

  for (const c of concepts) {
    if (visited.has(c.id)) continue;

    // BFS from this node
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
    componentSizes.push(size);
  }

  componentSizes.sort((a, b) => b - a);

  const largestSize = componentSizes[0] ?? 0;
  const totalNodes = concepts.length;

  return {
    total: componentSizes.length,
    largest_size: largestSize,
    largest_pct:
      totalNodes > 0 ? Math.round((largestSize / totalNodes) * 10000) / 100 : 0,
    sizes: componentSizes.slice(0, 20), // top 20 component sizes
  };
}

// ---------------------------------------------------------------------------
// 4. Root reachability
// ---------------------------------------------------------------------------

function computeRootReachability(
  concepts: ConceptRow[],
  relations: RelationRow[],
  maxHops = 6,
) {
  console.log('  Computing root reachability...');

  // Build directed adjacency (outgoing + incoming for undirected reachability)
  const adj = new Map<string, Set<string>>();
  for (const c of concepts) {
    adj.set(c.id, new Set());
  }
  for (const r of relations) {
    adj.get(r.source_id)?.add(r.target_id);
    adj.get(r.target_id)?.add(r.source_id);
  }

  // Candidate roots: detect by slug patterns
  const candidateRootPatterns = [
    // NAS / Airspace
    { pattern: /national-airspace-system|^topic:nas$/i, label: 'National Airspace System' },
    { pattern: /^topic:airspace$|^definition:airspace$/i, label: 'Airspace' },
    // ACS area roots (pick one per rating as representative)
    { pattern: /^acs_area:private:I$/i, label: 'PA Area I (Preflight)' },
    { pattern: /^acs_area:private:II$/i, label: 'PA Area II (Preflight Procedures)' },
    { pattern: /^acs_area:commercial:I$/i, label: 'CA Area I (Preflight)' },
    { pattern: /^acs_area:instrument:I$/i, label: 'IR Area I (Preflight)' },
    // Regulatory anchors
    { pattern: /^artifact:.*14-cfr-part-91|^artifact:.*14-cfr-61/i, label: '14 CFR Part 91/61' },
    { pattern: /^artifact:.*aim$/i, label: 'AIM' },
    // Hub roots (Metric C)
    { pattern: /^hub:knowledge$/i, label: 'Hub: Knowledge' },
    { pattern: /^hub:acs$/i, label: 'Hub: ACS' },
    { pattern: /^hub:regulations$/i, label: 'Hub: Regulations' },
    { pattern: /^hub:aircraft$/i, label: 'Hub: Aircraft' },
  ];

  const results: MetricsReport['root_reachability'] = [];
  const conceptMap = new Map(concepts.map(c => [c.id, c]));

  for (const candidate of candidateRootPatterns) {
    const root = concepts.find(c => candidate.pattern.test(c.slug));
    if (!root) continue;

    // BFS from root up to maxHops
    const visited = new Set<string>();
    let frontier = [root.id];
    let hop = 0;

    while (frontier.length > 0 && hop <= maxHops) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        const neighbors = adj.get(nodeId);
        if (neighbors) {
          for (const n of neighbors) {
            if (!visited.has(n)) nextFrontier.push(n);
          }
        }
      }
      frontier = nextFrontier;
      hop++;
    }

    results.push({
      root_name: root.name,
      root_slug: root.slug,
      reachable_count: visited.size,
      reachable_pct:
        concepts.length > 0
          ? Math.round((visited.size / concepts.length) * 10000) / 100
          : 0,
      max_hops: maxHops,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. Edge sanity
// ---------------------------------------------------------------------------

function computeEdgeSanity(
  concepts: ConceptRow[],
  relations: RelationRow[],
) {
  console.log('  Computing edge sanity...');

  const conceptIds = new Set(concepts.map(c => c.id));

  // Dangling edges: source or target not in concepts
  const danglingEdges: MetricsReport['edge_sanity']['dangling_details'] = [];
  for (const r of relations) {
    if (!conceptIds.has(r.source_id)) {
      danglingEdges.push({ id: r.id, source_id: r.source_id, target_id: r.target_id, issue: 'missing_source' });
    }
    if (!conceptIds.has(r.target_id)) {
      danglingEdges.push({ id: r.id, source_id: r.source_id, target_id: r.target_id, issue: 'missing_target' });
    }
  }

  // Self-loops
  let selfLoops = 0;
  for (const r of relations) {
    if (r.source_id === r.target_id) selfLoops++;
  }

  // Duplicate edges (same source, target, relation_type)
  const edgeKeys = new Set<string>();
  let duplicates = 0;
  for (const r of relations) {
    const key = `${r.source_id}:${r.target_id}:${r.relation_type}`;
    if (edgeKeys.has(key)) {
      duplicates++;
    } else {
      edgeKeys.add(key);
    }
  }

  return {
    dangling_edges: danglingEdges.length,
    self_loops: selfLoops,
    duplicate_edges: duplicates,
    dangling_details: danglingEdges.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// 6. Hub traceability (Metric A) — reverse BFS from hub roots via is_component_of
// ---------------------------------------------------------------------------

function computeHubTraceability(
  concepts: ConceptRow[],
  relations: RelationRow[],
) {
  console.log('  Computing hub traceability (Metric A)...');

  const HUB_ROOT_SLUGS = ['hub:knowledge', 'hub:acs', 'hub:regulations', 'hub:aircraft'];
  const hubRootIds = new Set(
    concepts.filter(c => HUB_ROOT_SLUGS.includes(c.slug)).map(c => c.id),
  );

  // Build reverse adjacency for is_component_of: target → [sources]
  // If A --is_component_of--> B, then B can reach A in reverse
  const reverseAdj = new Map<string, Set<string>>();
  for (const c of concepts) reverseAdj.set(c.id, new Set());
  for (const r of relations) {
    if (r.relation_type === 'is_component_of') {
      // r.source_id is_component_of r.target_id
      // In reverse: from r.target_id we can reach r.source_id
      reverseAdj.get(r.target_id)?.add(r.source_id);
    }
  }

  // BFS from all hub roots simultaneously following reverse is_component_of
  const traceable = new Set<string>();
  const queue = [...hubRootIds];
  for (const id of queue) traceable.add(id);

  while (queue.length > 0) {
    const node = queue.shift()!;
    const children = reverseAdj.get(node);
    if (children) {
      for (const child of children) {
        if (!traceable.has(child)) {
          traceable.add(child);
          queue.push(child);
        }
      }
    }
  }

  // Per-category breakdown
  const byCategory: Record<string, { traceable: number; total: number; pct: number }> = {};
  for (const c of concepts) {
    if (!byCategory[c.category]) {
      byCategory[c.category] = { traceable: 0, total: 0, pct: 0 };
    }
    byCategory[c.category].total++;
    if (traceable.has(c.id)) byCategory[c.category].traceable++;
  }
  for (const cat of Object.values(byCategory)) {
    cat.pct = cat.total > 0 ? Math.round((cat.traceable / cat.total) * 10000) / 100 : 0;
  }

  return {
    traceable_count: traceable.size,
    total_count: concepts.length,
    traceable_pct:
      concepts.length > 0
        ? Math.round((traceable.size / concepts.length) * 10000) / 100
        : 0,
    by_category: byCategory,
  };
}

// ---------------------------------------------------------------------------
// 7. Chunk triage rate (Metric B)
// ---------------------------------------------------------------------------

async function computeChunkTriage() {
  console.log('  Computing chunk triage rate (Metric B)...');

  const assignments = await fetchAll<{ chunk_id: string; hub_slug: string; taxonomy_node_id: string }>(
    'kb_chunk_taxonomy', 'chunk_id, hub_slug, taxonomy_node_id',
  );

  const triageNodes = await fetchAll<{ id: string; slug: string; hub_slug: string }>(
    'kb_taxonomy_nodes', 'id, slug, hub_slug',
  );

  const triageNodeIds = new Set(
    triageNodes.filter(n => n.slug.endsWith(':triage-unclassified')).map(n => n.id),
  );

  const perHub: Record<string, { triage: number; total: number; triage_pct: number }> = {};
  for (const a of assignments) {
    if (!perHub[a.hub_slug]) perHub[a.hub_slug] = { triage: 0, total: 0, triage_pct: 0 };
    perHub[a.hub_slug].total++;
    if (triageNodeIds.has(a.taxonomy_node_id)) perHub[a.hub_slug].triage++;
  }
  for (const hub of Object.values(perHub)) {
    hub.triage_pct = hub.total > 0 ? Math.round((hub.triage / hub.total) * 10000) / 100 : 0;
  }

  return { per_hub: perHub };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdown(report: MetricsReport): string {
  const lines: string[] = [
    '---',
    `title: "Knowledge Graph Metrics — ${report.timestamp.split('T')[0]}"`,
    `date: ${report.timestamp.split('T')[0]}`,
    'type: graph-metrics',
    'tags: [heydpe, knowledge-graph, metrics, audit]',
    `environment: ${report.environment}`,
    '---',
    '',
    `# Knowledge Graph Metrics — ${report.timestamp.split('T')[0]}`,
    '',
    `> Generated: ${report.timestamp}`,
    `> Environment: ${report.environment}`,
    '',
    '---',
    '',
    '## 1. Counts',
    '',
    '### Concepts by Category',
    '| Category | Count | % |',
    '|----------|-------|---|',
  ];

  const total = report.counts.concepts_total;
  const sortedCats = Object.entries(report.counts.concepts_by_category)
    .sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
    lines.push(`| ${cat} | ${count.toLocaleString()} | ${pct}% |`);
  }
  lines.push(`| **TOTAL** | **${total.toLocaleString()}** | |`);

  lines.push('', '### Relations by Type', '| Type | Count | % |', '|------|-------|---|');
  const relTotal = report.counts.relations_total;
  const sortedRels = Object.entries(report.counts.relations_by_type)
    .sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedRels) {
    const pct = relTotal > 0 ? ((count / relTotal) * 100).toFixed(1) : '0';
    lines.push(`| ${type} | ${count.toLocaleString()} | ${pct}% |`);
  }
  lines.push(`| **TOTAL** | **${relTotal.toLocaleString()}** | |`);

  lines.push(
    '',
    '### Evidence Coverage',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total evidence links | ${report.counts.evidence_total.toLocaleString()} |`,
    `| Concepts with evidence | ${report.counts.concepts_with_evidence.toLocaleString()} |`,
    `| Coverage ratio | ${report.counts.evidence_coverage_pct}% |`,
  );

  // Orphans
  lines.push(
    '', '---', '',
    '## 2. Orphan Analysis',
    '',
    `> [!risk] ${report.orphans.total.toLocaleString()} orphan concepts (${total > 0 ? ((report.orphans.total / total) * 100).toFixed(1) : 0}% of total)`,
    '',
    '### Orphans by Category',
    '| Category | Orphan Count |',
    '|----------|-------------|',
  );
  for (const [cat, count] of Object.entries(report.orphans.by_category).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${cat} | ${count.toLocaleString()} |`);
  }

  if (report.orphans.top_50.length > 0) {
    lines.push('', '### Sample Orphans (first 50)', '| Category | Name |', '|----------|------|');
    for (const o of report.orphans.top_50) {
      lines.push(`| ${o.category} | ${o.name.slice(0, 80)} |`);
    }
  }

  // Components
  lines.push(
    '', '---', '',
    '## 3. Connected Components',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total components | ${report.components.total} |`,
    `| Largest component | ${report.components.largest_size.toLocaleString()} nodes |`,
    `| Largest component % | ${report.components.largest_pct}% |`,
  );
  if (report.components.sizes.length > 1) {
    lines.push('', '### Top Component Sizes');
    lines.push('| Rank | Size |', '|------|------|');
    for (let i = 0; i < Math.min(10, report.components.sizes.length); i++) {
      lines.push(`| ${i + 1} | ${report.components.sizes[i].toLocaleString()} |`);
    }
  }

  // Root reachability
  lines.push(
    '', '---', '',
    '## 4. Root Reachability',
    '',
    '| Root | Reachable | % of Graph | Max Hops |',
    '|------|-----------|-----------|----------|',
  );
  for (const r of report.root_reachability) {
    lines.push(`| ${r.root_name} | ${r.reachable_count.toLocaleString()} | ${r.reachable_pct}% | ${r.max_hops} |`);
  }
  if (report.root_reachability.length === 0) {
    lines.push('| *(no roots found)* | — | — | — |');
  }

  // Edge sanity
  lines.push(
    '', '---', '',
    '## 5. Edge Sanity',
    '',
    `| Check | Count | Status |`,
    `|-------|-------|--------|`,
    `| Dangling edges | ${report.edge_sanity.dangling_edges} | ${report.edge_sanity.dangling_edges === 0 ? 'PASS' : 'FAIL'} |`,
    `| Self-loops | ${report.edge_sanity.self_loops} | ${report.edge_sanity.self_loops === 0 ? 'PASS' : 'WARN'} |`,
    `| Duplicate edges | ${report.edge_sanity.duplicate_edges} | ${report.edge_sanity.duplicate_edges === 0 ? 'PASS' : 'WARN'} |`,
  );

  // Hub traceability (Metric A)
  lines.push(
    '', '---', '',
    '## 6. Hub Traceability (Metric A)',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Traceable concepts | ${report.hub_traceability.traceable_count.toLocaleString()} / ${report.hub_traceability.total_count.toLocaleString()} |`,
    `| Traceability % | ${report.hub_traceability.traceable_pct}% |`,
    '',
    '### Traceability by Category',
    '| Category | Traceable | Total | % |',
    '|----------|-----------|-------|---|',
  );
  const sortedTraceCats = Object.entries(report.hub_traceability.by_category)
    .sort((a, b) => b[1].total - a[1].total);
  for (const [cat, data] of sortedTraceCats) {
    lines.push(`| ${cat} | ${data.traceable.toLocaleString()} | ${data.total.toLocaleString()} | ${data.pct}% |`);
  }

  // Chunk triage (Metric B)
  lines.push(
    '', '---', '',
    '## 7. Chunk Triage Rate (Metric B)',
    '',
    '| Hub | Triage | Total | Triage % |',
    '|-----|--------|-------|----------|',
  );
  for (const [hub, data] of Object.entries(report.chunk_triage.per_hub).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${hub} | ${data.triage.toLocaleString()} | ${data.total.toLocaleString()} | ${data.triage_pct}% |`);
  }

  lines.push(
    '', '---', '',
    `*Generated by \`npm run graph:metrics\` at ${report.timestamp}*`,
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Knowledge Graph Metrics Snapshot ===\n');

  // Confirm environment
  const { data: envRow } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'app.environment')
    .single();
  const envName = (envRow?.value as { name?: string })?.name ?? 'unknown';
  console.log(`Environment: ${envName}`);

  // 1. Counts
  const { concepts, relations, counts } = await computeCounts();

  // 2. Orphans
  const orphans = computeOrphans(concepts, relations);

  // 3. Components
  const components = computeComponents(concepts, relations);

  // 4. Root reachability
  const rootReachability = computeRootReachability(concepts, relations);

  // 5. Edge sanity
  const edgeSanity = computeEdgeSanity(concepts, relations);

  // 6. Hub traceability (Metric A)
  const hubTraceability = computeHubTraceability(concepts, relations);

  // 7. Chunk triage rate (Metric B)
  const chunkTriage = await computeChunkTriage();

  const report: MetricsReport = {
    timestamp: new Date().toISOString(),
    environment: envName,
    counts,
    orphans,
    components,
    root_reachability: rootReachability,
    edge_sanity: edgeSanity,
    hub_traceability: hubTraceability,
    chunk_triage: chunkTriage,
  };

  // Write outputs
  const dateStr = new Date().toISOString().split('T')[0];
  const reportsDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `${dateStr}-graph-metrics.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = path.join(reportsDir, `${dateStr}-graph-metrics.md`);
  fs.writeFileSync(mdPath, generateMarkdown(report));

  // Console summary
  console.log('\n=== SUMMARY ===\n');
  console.log(`Concepts:          ${counts.concepts_total.toLocaleString()}`);
  for (const [cat, count] of Object.entries(counts.concepts_by_category).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${count.toLocaleString()}`);
  }

  console.log(`\nRelations:         ${counts.relations_total.toLocaleString()}`);
  for (const [type, count] of Object.entries(counts.relations_by_type).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(30)} ${count.toLocaleString()}`);
  }

  console.log(`\nEvidence:          ${counts.evidence_total.toLocaleString()}`);
  console.log(`  Coverage:        ${counts.evidence_coverage_pct}% (${counts.concepts_with_evidence}/${counts.concepts_total})`);

  console.log(`\nOrphans:           ${orphans.total.toLocaleString()} (${counts.concepts_total > 0 ? ((orphans.total / counts.concepts_total) * 100).toFixed(1) : 0}%)`);
  for (const [cat, count] of Object.entries(orphans.by_category).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${count.toLocaleString()}`);
  }

  console.log(`\nComponents:        ${components.total}`);
  console.log(`  Largest:         ${components.largest_size.toLocaleString()} (${components.largest_pct}%)`);
  if (components.sizes.length > 1) {
    console.log(`  Top sizes:       [${components.sizes.slice(0, 5).join(', ')}...]`);
  }

  console.log(`\nRoot Reachability (${6} hops):`);
  for (const r of rootReachability) {
    console.log(`  ${r.root_name.padEnd(30)} ${r.reachable_count.toLocaleString()} (${r.reachable_pct}%)`);
  }
  if (rootReachability.length === 0) {
    console.log('  (no candidate roots found in graph)');
  }

  console.log(`\nEdge Sanity:`);
  console.log(`  Dangling:        ${edgeSanity.dangling_edges}`);
  console.log(`  Self-loops:      ${edgeSanity.self_loops}`);
  console.log(`  Duplicates:      ${edgeSanity.duplicate_edges}`);

  console.log(`\nHub Traceability (Metric A):`);
  console.log(`  Traceable:       ${hubTraceability.traceable_count.toLocaleString()} / ${hubTraceability.total_count.toLocaleString()} (${hubTraceability.traceable_pct}%)`);
  for (const [cat, data] of Object.entries(hubTraceability.by_category).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${cat.padEnd(20)} ${data.traceable}/${data.total} (${data.pct}%)`);
  }

  console.log(`\nChunk Triage (Metric B):`);
  for (const [hub, data] of Object.entries(chunkTriage.per_hub).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${hub.padEnd(15)} ${data.triage}/${data.total} triage (${data.triage_pct}%)`);
  }

  console.log(`\nReports written:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
}

main().catch((err) => {
  console.error('Graph metrics error:', err);
  process.exit(1);
});
