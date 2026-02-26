#!/usr/bin/env npx tsx
/**
 * classify_chunks_regulations.ts — Reclassify regulations-hub triage chunks
 * into section-level taxonomy nodes using deterministic CFR regex.
 *
 * Phase 3 Step D: For each chunk on regulations:triage-unclassified, extract
 * CFR section references from content/heading and reassign to the most specific
 * matching taxonomy node (L3 section > L2 part > stay on triage).
 *
 * Flags:
 *   --dry-run         Print plan but don't write to DB (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --limit N         Process at most N chunks
 *
 * Usage:
 *   npx tsx scripts/taxonomy/classify_chunks_regulations.ts
 *   npx tsx scripts/taxonomy/classify_chunks_regulations.ts --write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/classify_chunks_regulations.ts --write
 *
 * npm: npm run taxonomy:classify:regulations
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { assertNotProduction } from '../../src/lib/app-env';
import { extractCfrSections, extractCfrParts } from './expand_regulations_taxonomy';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// CLI flags
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  if (flags.write) {
    assertNotProduction();
  }

  console.log('\n=== Classify Regulations-Hub Triage Chunks ===');
  console.log(`Mode: ${flags.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  if (flags.limit > 0) console.log(`Limit: ${flags.limit}`);
  console.log('');

  // 1. Load all regulations taxonomy nodes
  console.log('Loading regulations taxonomy nodes...');
  const allNodes = await fetchAll<{
    id: string; slug: string; title: string; level: number; hub_slug: string;
  }>('kb_taxonomy_nodes', 'id, slug, title, level, hub_slug');

  const regNodes = allNodes.filter(n => n.hub_slug === 'regulations');
  console.log(`  Total regulations nodes: ${regNodes.length}`);

  // Build lookup maps
  const sectionSlugToId = new Map<string, string>(); // "regulations:14cfr-part-91:sec-91-155" → id
  const partSlugToId = new Map<string, string>();     // "regulations:14cfr-part-91" → id

  for (const node of regNodes) {
    if (node.level === 3) {
      sectionSlugToId.set(node.slug, node.id);
    } else if (node.level === 2 && !node.slug.endsWith(':triage-unclassified')) {
      partSlugToId.set(node.slug, node.id);
    }
  }

  console.log(`  L3 section nodes available: ${sectionSlugToId.size}`);
  console.log(`  L2 part nodes available: ${partSlugToId.size}`);

  // 2. Find triage node
  const triageNode = regNodes.find(n => n.slug === 'regulations:triage-unclassified');
  if (!triageNode) {
    console.error('ERROR: Cannot find regulations:triage-unclassified node. Aborting.');
    process.exit(1);
  }
  console.log(`  Triage node ID: ${triageNode.id}`);

  // 3. Load triage chunks with their source content
  console.log('\nLoading triage chunks...');
  interface TriageChunk {
    chunk_id: string;
    content: string;
    heading: string;
  }

  const triageChunks: TriageChunk[] = [];
  let chunkOffset = 0;
  const maxChunks = flags.limit > 0 ? flags.limit : 100000;

  while (triageChunks.length < maxChunks) {
    const fetchSize = Math.min(1000, maxChunks - triageChunks.length);
    const { data: taxRows, error: taxError } = await supabase
      .from('kb_chunk_taxonomy')
      .select('chunk_id')
      .eq('hub_slug', 'regulations')
      .eq('taxonomy_node_id', triageNode.id)
      .range(chunkOffset, chunkOffset + fetchSize - 1);

    if (taxError) { console.error('Error fetching triage chunks:', taxError.message); break; }
    if (!taxRows || taxRows.length === 0) break;

    const chunkIds = taxRows.map(r => r.chunk_id);
    const { data: chunks } = await supabase
      .from('source_chunks')
      .select('id, content, heading')
      .in('id', chunkIds);

    if (chunks) {
      for (const c of chunks) {
        triageChunks.push({
          chunk_id: c.id,
          content: c.content || '',
          heading: c.heading || '',
        });
      }
    }

    if (taxRows.length < fetchSize) break;
    chunkOffset += fetchSize;
  }

  console.log(`  Triage chunks loaded: ${triageChunks.length}`);

  // 4. Classify each chunk
  console.log('\nClassifying chunks...');
  let classifiedSection = 0;
  let classifiedPart = 0;
  let unclassified = 0;

  interface Reclassification {
    chunk_id: string;
    taxonomy_node_id: string;
    confidence: number;
    method: string;
    notes: string;
  }

  const reclassifications: Reclassification[] = [];
  const targetDistribution = new Map<string, number>();

  for (const chunk of triageChunks) {
    const text = [chunk.content, chunk.heading].join(' ');

    // Try section-level match first (most specific)
    const sectionRefs = extractCfrSections(text);
    let matched = false;

    if (sectionRefs.length > 0) {
      // Pick the first valid section match
      for (const ref of sectionRefs) {
        const sectionSlug = `regulations:14cfr-part-${ref.part}:sec-${ref.part}-${ref.section}`;
        const nodeId = sectionSlugToId.get(sectionSlug);
        if (nodeId) {
          reclassifications.push({
            chunk_id: chunk.chunk_id,
            taxonomy_node_id: nodeId,
            confidence: 1.0,
            method: 'regex_cfr_section',
            notes: `§${ref.part}.${ref.section}`,
          });
          targetDistribution.set(sectionSlug, (targetDistribution.get(sectionSlug) || 0) + 1);
          classifiedSection++;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Fall back to part-level match
      const parts = extractCfrParts(text);
      // Also get parts from section refs (they contain part numbers too)
      for (const ref of sectionRefs) {
        if (!parts.includes(ref.part)) parts.push(ref.part);
      }

      for (const part of parts) {
        const partSlug = `regulations:14cfr-part-${part}`;
        const nodeId = partSlugToId.get(partSlug);
        if (nodeId) {
          reclassifications.push({
            chunk_id: chunk.chunk_id,
            taxonomy_node_id: nodeId,
            confidence: 0.8,
            method: 'regex_cfr_part',
            notes: `Part ${part}`,
          });
          targetDistribution.set(partSlug, (targetDistribution.get(partSlug) || 0) + 1);
          classifiedPart++;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      unclassified++;
    }
  }

  // 5. Report
  console.log(`\n--- Classification Results ---`);
  console.log(`  Total chunks: ${triageChunks.length}`);
  console.log(`  Section-level (L3): ${classifiedSection} (${(classifiedSection / triageChunks.length * 100).toFixed(1)}%)`);
  console.log(`  Part-level (L2): ${classifiedPart} (${(classifiedPart / triageChunks.length * 100).toFixed(1)}%)`);
  console.log(`  Unclassified: ${unclassified} (${(unclassified / triageChunks.length * 100).toFixed(1)}%)`);
  console.log(`  Total reclassified: ${reclassifications.length}`);

  // Top target nodes
  const topTargets = [...targetDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log(`\n  Top 20 target nodes:`);
  for (const [slug, count] of topTargets) {
    console.log(`    ${slug}: ${count}`);
  }

  if (flags.dryRun) {
    console.log(`\n[DRY-RUN] Would reclassify ${reclassifications.length} chunks`);
    console.log('[DRY-RUN] Run with --write to execute.');
    return;
  }

  // 6. Write reclassifications
  console.log(`\nWriting ${reclassifications.length} reclassifications...`);
  let written = 0;
  let writeErrors = 0;
  const batchSize = 200;

  for (let i = 0; i < reclassifications.length; i += batchSize) {
    const batch = reclassifications.slice(i, i + batchSize);
    const rows = batch.map(r => ({
      chunk_id: r.chunk_id,
      taxonomy_node_id: r.taxonomy_node_id,
      hub_slug: 'regulations',
      taxonomy_slug: 'default',
      confidence: r.confidence,
      method: r.method,
      model: null,
    }));

    const { data, error } = await supabase
      .from('kb_chunk_taxonomy')
      .upsert(rows, { onConflict: 'chunk_id' })
      .select('id');

    if (error) {
      console.error(`  ERROR batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      writeErrors += batch.length;
    } else if (data) {
      written += data.length;
    }

    if ((Math.floor(i / batchSize) + 1) % 5 === 0 || i + batchSize >= reclassifications.length) {
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${written} written so far`);
    }
  }

  console.log(`\n--- Write Results ---`);
  console.log(`  Written: ${written}`);
  console.log(`  Errors: ${writeErrors}`);
  console.log(`  Still on triage: ${triageChunks.length - written}`);
}

main().catch((err) => {
  console.error('Classify regulations chunks error:', err);
  process.exit(1);
});
