#!/usr/bin/env npx tsx
/**
 * assign_chunks_to_hubs.ts — Assign every source_chunk to exactly one hub
 *
 * Uses the source_documents.abbreviation field to deterministically map each
 * chunk to one of four hubs: knowledge, acs, regulations, aircraft.
 * Each chunk is placed into the hub's triage-unclassified node for later
 * fine-grained classification.
 *
 * Non-negotiable constraints:
 *   - --dry-run mode is default
 *   - --write mode requires ALLOW_PROD_WRITE=1
 *   - 100% of source_chunks must be assigned (no nulls)
 *   - Idempotent (upsert with onConflict: 'chunk_id')
 *   - Produces a coverage report to docs/graph-reports/
 *
 * Flags:
 *   --dry-run         Preview assignments without writing (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --limit N         Process at most N chunks
 *
 * Usage:
 *   npx tsx scripts/taxonomy/assign_chunks_to_hubs.ts
 *   npx tsx scripts/taxonomy/assign_chunks_to_hubs.ts --limit 100
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/assign_chunks_to_hubs.ts --write
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
  const flags = { dryRun: true, write: false, limit: 0 };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': flags.dryRun = true; flags.write = false; break;
      case '--write': flags.write = true; flags.dryRun = false; break;
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Abbreviation-to-hub mapping
// ---------------------------------------------------------------------------

const ABBREVIATION_TO_HUB: Record<string, string> = {
  acs: 'acs',
  cfr: 'regulations',
  poh: 'aircraft',
  afm: 'aircraft',
};

function getHubForAbbreviation(abbrev: string): string {
  return ABBREVIATION_TO_HUB[abbrev] || 'knowledge';
}

// ---------------------------------------------------------------------------
// Hub triage node slugs
// ---------------------------------------------------------------------------

const HUB_TRIAGE_SLUGS: Record<string, string> = {
  knowledge: 'knowledge:triage-unclassified',
  acs: 'acs:triage-unclassified',
  regulations: 'regulations:triage-unclassified',
  aircraft: 'aircraft:triage-unclassified',
};

// ---------------------------------------------------------------------------
// Fetch triage node IDs from kb_taxonomy_nodes
// ---------------------------------------------------------------------------

async function fetchTriageNodes(): Promise<Map<string, string>> {
  const slugs = Object.values(HUB_TRIAGE_SLUGS);
  const { data, error } = await supabase
    .from('kb_taxonomy_nodes')
    .select('id, slug')
    .in('slug', slugs);

  if (error) {
    console.error('Error fetching triage nodes:', error.message);
    process.exit(1);
  }

  const nodeMap = new Map<string, string>();
  for (const row of data || []) {
    // Reverse-lookup: which hub does this slug belong to?
    for (const [hub, slug] of Object.entries(HUB_TRIAGE_SLUGS)) {
      if (slug === row.slug) {
        nodeMap.set(hub, row.id);
        break;
      }
    }
  }

  return nodeMap;
}

// ---------------------------------------------------------------------------
// Fetch all source_chunks with document abbreviation (paginated)
// ---------------------------------------------------------------------------

async function fetchChunksWithAbbrev(limit?: number): Promise<{ id: string; abbreviation: string }[]> {
  const results: { id: string; abbreviation: string }[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from('source_chunks')
      .select('id, source_documents(abbreviation)')
      .range(offset, offset + pageSize - 1);

    if (limit && offset + pageSize >= limit) {
      query = query.limit(limit - offset);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const abbrev = ((row as Record<string, unknown>).source_documents as Record<string, unknown>)?.abbreviation as string || 'unknown';
      results.push({ id: row.id as string, abbreviation: abbrev });
    }

    if (data.length < pageSize) break;
    if (limit && results.length >= limit) break;
    offset += pageSize;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  console.log('\n=== Multi-Hub Chunk Assignment ===\n');
  console.log(`Mode: ${flags.write ? 'WRITE' : 'DRY-RUN'}`);

  // Safety check for production writes
  if (flags.write) {
    assertNotProduction('assign-chunks-to-hubs', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!\n');
    }
  }

  // Step 1: Fetch triage node IDs per hub
  console.log('Loading triage nodes...');
  const triageNodes = await fetchTriageNodes();

  const allHubs = Object.keys(HUB_TRIAGE_SLUGS);
  const missingHubs = allHubs.filter(h => !triageNodes.has(h));

  if (missingHubs.length > 0) {
    console.error(`ERROR: Missing triage nodes for hubs: ${missingHubs.join(', ')}`);
    console.error('  Required slugs:');
    for (const hub of missingHubs) {
      console.error(`    ${HUB_TRIAGE_SLUGS[hub]}`);
    }
    console.error('\n  Run the multi-hub taxonomy migration first.');
    process.exit(1);
  }

  for (const [hub, nodeId] of triageNodes.entries()) {
    console.log(`  ${HUB_TRIAGE_SLUGS[hub]} -> ${nodeId}`);
  }

  // Step 2: Fetch all source_chunks with abbreviation
  console.log('\nFetching source chunks...');
  const chunks = await fetchChunksWithAbbrev(flags.limit || undefined);
  console.log(`  Found ${chunks.length.toLocaleString()} chunks`);

  if (chunks.length === 0) {
    console.log('No chunks to process.');
    return;
  }

  // Step 3: Assign each chunk to a hub
  console.log('\nAssigning chunks to hubs...');

  interface Assignment {
    chunk_id: string;
    taxonomy_node_id: string;
    hub_slug: string;
    taxonomy_slug: string;
    confidence: number;
    method: string;
    model: string | null;
  }

  const assignments: Assignment[] = [];
  const hubCounts: Record<string, number> = { knowledge: 0, acs: 0, regulations: 0, aircraft: 0 };
  const abbrevHubCounts: Record<string, { hub: string; count: number }> = {};

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const hub = getHubForAbbreviation(chunk.abbreviation);
    const triageNodeId = triageNodes.get(hub);

    if (!triageNodeId) {
      console.error(`No triage node for hub ${hub} (abbreviation: ${chunk.abbreviation})`);
      continue;
    }

    assignments.push({
      chunk_id: chunk.id,
      taxonomy_node_id: triageNodeId,
      hub_slug: hub,
      taxonomy_slug: 'default',
      confidence: 1.0,
      method: 'doc_abbreviation_rule',
      model: null,
    });

    hubCounts[hub] = (hubCounts[hub] || 0) + 1;

    // Track per-abbreviation counts
    const key = chunk.abbreviation;
    if (!abbrevHubCounts[key]) {
      abbrevHubCounts[key] = { hub, count: 0 };
    }
    abbrevHubCounts[key].count++;

    // Progress reporting at 10% intervals
    const pctStep = Math.max(1, Math.floor(chunks.length / 10));
    if ((i + 1) % pctStep === 0 || i === chunks.length - 1) {
      const pct = Math.round(((i + 1) / chunks.length) * 100);
      console.log(`  [${pct}%] ${(i + 1).toLocaleString()}/${chunks.length.toLocaleString()}`);
    }
  }

  // Verify 100% coverage
  if (assignments.length !== chunks.length) {
    console.error(`ERROR: Only ${assignments.length}/${chunks.length} chunks assigned. Expected 100% coverage.`);
    process.exit(1);
  }

  // Step 4: Batch upsert (write mode only)
  let written = 0;
  let errors = 0;

  if (flags.write) {
    console.log('\nWriting to database...');
    const batchSize = 500;

    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize).map(a => ({
        chunk_id: a.chunk_id,
        taxonomy_node_id: a.taxonomy_node_id,
        taxonomy_slug: a.taxonomy_slug,
        confidence: a.confidence,
        method: a.method,
        model: a.model,
      }));

      const { error } = await supabase
        .from('kb_chunk_taxonomy')
        .upsert(batch, { onConflict: 'chunk_id' });

      if (error) {
        errors++;
        console.error(`  Batch error at offset ${i}: ${error.message}`);
      } else {
        written += batch.length;
      }

      // Progress for writes
      if ((i + batchSize) % 2000 === 0 || i + batchSize >= assignments.length) {
        console.log(`  Written ${written.toLocaleString()}/${assignments.length.toLocaleString()} (${errors} errors)`);
      }
    }
  }

  // Step 5: Coverage report
  console.log('\nCoverage:');
  for (const hub of allHubs) {
    const count = hubCounts[hub] || 0;
    const pct = ((count / chunks.length) * 100).toFixed(1);
    console.log(`  ${hub}: ${count.toLocaleString()} (${pct}%)`);
  }
  console.log(`  Total: ${chunks.length.toLocaleString()} (100%)`);

  if (flags.write) {
    console.log(`\n  Written: ${written.toLocaleString()} rows (${errors} batch errors)`);
  }

  // Build sorted abbreviation table
  const sortedAbbrevs = Object.entries(abbrevHubCounts)
    .sort(([, a], [, b]) => b.count - a.count);

  // Write markdown report
  const dateStr = new Date().toISOString().split('T')[0];
  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const md: string[] = [
    '---',
    `title: "Multi-Hub Chunk Assignment — ${dateStr}"`,
    `date: ${dateStr}`,
    'type: graph-report',
    'tags: [heydpe, knowledge-graph, multi-hub, chunk-assignment]',
    '---',
    '',
    `# Multi-Hub Chunk Assignment — ${dateStr}`,
    '',
    `**Mode:** ${flags.write ? 'WRITE' : 'DRY-RUN'}`,
    '',
    '## Coverage',
    '',
    '| Hub | Chunks | % of Total |',
    '|-----|--------|-----------|',
  ];

  for (const hub of allHubs) {
    const count = hubCounts[hub] || 0;
    const pct = ((count / chunks.length) * 100).toFixed(1);
    md.push(`| ${hub} | ${count.toLocaleString()} | ${pct}% |`);
  }
  md.push(`| **Total** | **${chunks.length.toLocaleString()}** | **100%** |`);

  md.push('');
  md.push('## Assignment Method');
  md.push('');
  md.push('All chunks assigned via `doc_abbreviation_rule` (deterministic, no LLM).');
  md.push('');
  md.push('| Abbreviation | Hub | Rule |');
  md.push('|---|---|---|');
  md.push('| acs | acs | Explicit mapping |');
  md.push('| cfr | regulations | Explicit mapping |');
  md.push('| poh | aircraft | Explicit mapping |');
  md.push('| afm | aircraft | Explicit mapping |');
  md.push('| Everything else | knowledge | Default fallback |');

  md.push('');
  md.push('## Top Document Sources per Hub');
  md.push('');
  md.push('| Abbreviation | Hub | Chunk Count |');
  md.push('|---|---|---|');

  for (const [abbrev, info] of sortedAbbrevs) {
    md.push(`| ${abbrev} | ${info.hub} | ${info.count.toLocaleString()} |`);
  }

  if (flags.write) {
    md.push('');
    md.push('## Write Summary');
    md.push('');
    md.push(`- Rows upserted: ${written.toLocaleString()}`);
    md.push(`- Batch errors: ${errors}`);
    md.push(`- On conflict: \`chunk_id\` (idempotent upsert)`);
  }

  md.push('');
  md.push('---');
  md.push('');
  md.push('*Generated by assign_chunks_to_hubs.ts*');

  const reportPath = path.join(reportDir, `${dateStr}-multi-hub-chunk-assignment.md`);
  fs.writeFileSync(reportPath, md.join('\n'));

  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error('Assignment error:', err);
  process.exit(1);
});
