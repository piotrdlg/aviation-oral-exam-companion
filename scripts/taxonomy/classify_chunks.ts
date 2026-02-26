#!/usr/bin/env npx tsx
/**
 * classify_chunks.ts — Classify source_chunks into taxonomy nodes
 *
 * Uses Anthropic prompt caching: taxonomy + rubric in a cached system block,
 * per-chunk content as the variable user message.
 *
 * Flags:
 *   --limit N         Process at most N chunks (default: all)
 *   --since DATE      Only process chunks created after DATE
 *   --chunk-ids IDS   Comma-separated chunk IDs
 *   --dry-run         Print classifications but don't write to DB (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --concurrency N   Parallel API calls (default: 5)
 *   --sample N        Random sample of N chunks (for pilot runs)
 *
 * Usage:
 *   npx tsx scripts/taxonomy/classify_chunks.ts --sample 200 --dry-run
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/classify_chunks.ts --write
 */

import Anthropic from '@anthropic-ai/sdk';
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
  const flags = {
    limit: 0,
    since: '',
    chunkIds: [] as string[],
    dryRun: true,
    write: false,
    concurrency: 5,
    sample: 0,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
      case '--since': flags.since = args[++i]; break;
      case '--chunk-ids': flags.chunkIds = args[++i].split(','); break;
      case '--dry-run': flags.dryRun = true; flags.write = false; break;
      case '--write': flags.write = true; flags.dryRun = false; break;
      case '--concurrency': flags.concurrency = parseInt(args[++i], 10); break;
      case '--sample': flags.sample = parseInt(args[++i], 10); break;
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Load taxonomy
// ---------------------------------------------------------------------------

interface TaxonomyNode {
  slug: string;
  title: string;
  level: number;
  parent_slug: string | null;
}

function loadTaxonomy(): TaxonomyNode[] {
  const jsonPath = path.resolve(__dirname, '../../data/taxonomy/unified-taxonomy.v0.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return raw.nodes as TaxonomyNode[];
}

function buildTaxonomyText(nodes: TaxonomyNode[]): string {
  const lines: string[] = ['TAXONOMY (slug | title | level | parent):'];
  // Only include L1 and L2 for classification (L3 is too granular for chunk-level)
  const filtered = nodes.filter(n => n.level <= 2);
  for (const n of filtered) {
    lines.push(`${n.slug} | ${n.title} | L${n.level} | ${n.parent_slug || 'root'}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Build cached system prompt
// ---------------------------------------------------------------------------

function buildSystemBlocks(taxonomyText: string): Anthropic.MessageCreateParams['system'] {
  const rubric = `You are a technical taxonomy classifier for aviation education content.

Given a chunk of text from an FAA source document, classify it into the most appropriate taxonomy node(s).

RULES:
1. Always assign a PRIMARY taxonomy node (the best fit).
2. Optionally assign up to 2 SECONDARY nodes if the chunk genuinely spans multiple topics.
3. Use the exact slug from the taxonomy list.
4. If no taxonomy node fits well, set primary_slug to "unclassified".
5. Confidence: 0.9+ if strong keyword/topic match, 0.7-0.9 if reasonable, 0.5-0.7 if weak.
6. Prefer L2 nodes over L1 (more specific is better).
7. Consider both the content AND the source document abbreviation when classifying.

RESPOND WITH ONLY valid JSON (no markdown, no explanation):
{
  "primary_slug": "tax:...",
  "secondary_slugs": ["tax:...", ...],
  "confidence": 0.85,
  "notes": "brief reason"
}`;

  return [
    {
      type: 'text' as const,
      text: rubric + '\n\n' + taxonomyText,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

// ---------------------------------------------------------------------------
// Classify a single chunk
// ---------------------------------------------------------------------------

interface ClassificationResult {
  chunk_id: string;
  primary_slug: string;
  secondary_slugs: string[];
  confidence: number;
  notes: string;
  model: string;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

async function classifyChunk(
  anthropic: Anthropic,
  systemBlocks: Anthropic.MessageCreateParams['system'],
  chunk: { id: string; content: string; heading: string; doc_abbrev: string },
  validSlugs: Set<string>,
): Promise<ClassificationResult> {
  const truncatedContent = chunk.content.substring(0, 800);
  const userMessage = `Document: ${chunk.doc_abbrev}\nHeading: ${chunk.heading}\nContent:\n${truncatedContent}`;

  const model = 'claude-sonnet-4-20250514';

  const response = await anthropic.messages.create({
    model,
    max_tokens: 256,
    system: systemBlocks,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Extract cache usage
  const usage = response.usage as {
    input_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };

  // Parse JSON response
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  let parsed: { primary_slug: string; secondary_slugs: string[]; confidence: number; notes: string };

  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { primary_slug: 'unclassified', secondary_slugs: [], confidence: 0, notes: 'JSON parse error: ' + text.substring(0, 100) };
  }

  // Validate slugs
  if (!validSlugs.has(parsed.primary_slug) && parsed.primary_slug !== 'unclassified') {
    parsed.notes += ` (invalid slug: ${parsed.primary_slug})`;
    parsed.primary_slug = 'unclassified';
    parsed.confidence = 0;
  }
  parsed.secondary_slugs = (parsed.secondary_slugs || []).filter(s => validSlugs.has(s));

  return {
    chunk_id: chunk.id,
    primary_slug: parsed.primary_slug,
    secondary_slugs: parsed.secondary_slugs,
    confidence: parsed.confidence,
    notes: parsed.notes,
    model,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_creation_tokens: usage.cache_creation_input_tokens || 0,
  };
}

// ---------------------------------------------------------------------------
// Batch with concurrency control
// ---------------------------------------------------------------------------

async function processBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        console.error(`  Error on item ${i}:`, (err as Error).message);
        results[i] = null as unknown as R;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  console.log('\n=== Chunk → Taxonomy Classification ===\n');
  console.log(`Mode: ${flags.write ? 'WRITE' : 'DRY-RUN'}`);

  // Safety check
  if (flags.write) {
    assertNotProduction('classify-chunks', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!\n');
    }
  }

  // Load taxonomy
  const taxonomyNodes = loadTaxonomy();
  const taxonomyText = buildTaxonomyText(taxonomyNodes);
  const validSlugs = new Set(taxonomyNodes.map(n => n.slug));
  console.log(`Taxonomy: ${taxonomyNodes.length} nodes (${taxonomyNodes.filter(n => n.level <= 2).length} used for classification)`);

  // Build cached system prompt
  const systemBlocks = buildSystemBlocks(taxonomyText);

  // Fetch chunks (join with source_documents for abbreviation)
  let query = supabase.from('source_chunks')
    .select('id, content, heading, document_id, source_documents(abbreviation)')
    .order('created_at', { ascending: true });

  if (flags.chunkIds.length > 0) {
    query = query.in('id', flags.chunkIds);
  }
  if (flags.since) {
    query = query.gte('created_at', flags.since);
  }

  const { data: rawChunks, error } = await query.limit(flags.limit || 10000);
  if (error) {
    console.error('Error fetching chunks:', error.message);
    process.exit(1);
  }

  // Flatten the joined data
  let chunks = (rawChunks || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    content: c.content as string,
    heading: (c.heading || '') as string,
    doc_abbrev: ((c.source_documents as Record<string, unknown>)?.abbreviation || 'unknown') as string,
  }));

  // Random sample if requested
  if (flags.sample > 0 && chunks.length > flags.sample) {
    // Fisher-Yates shuffle then take first N
    for (let i = chunks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    chunks = chunks.slice(0, flags.sample);
  }

  console.log(`Chunks to classify: ${chunks.length}`);

  if (chunks.length === 0) {
    console.log('No chunks to process.');
    return;
  }

  // Initialize Anthropic client
  const anthropic = new Anthropic();

  // Classify
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let classified = 0;
  let unclassified = 0;

  const results = await processBatch(chunks, flags.concurrency, async (chunk, i) => {
    const result = await classifyChunk(anthropic, systemBlocks, chunk, validSlugs);
    totalCacheRead += result.cache_read_tokens;
    totalCacheCreate += result.cache_creation_tokens;

    if (result.primary_slug === 'unclassified') {
      unclassified++;
    } else {
      classified++;
    }

    if (i % 20 === 0 || i === chunks.length - 1) {
      const pct = ((i + 1) / chunks.length * 100).toFixed(0);
      console.log(`  [${pct}%] ${i + 1}/${chunks.length} — cache reads: ${totalCacheRead.toLocaleString()} tokens`);
    }

    return result;
  });

  // Write results
  if (flags.write) {
    console.log('\nWriting to database...');

    // First, ensure taxonomy nodes exist in DB
    // Load taxonomy node slugs from DB
    const { data: existingNodes } = await supabase.from('kb_taxonomy_nodes').select('slug, id');
    const nodeSlugToId = new Map<string, string>();
    for (const n of existingNodes || []) {
      nodeSlugToId.set(n.slug, n.id);
    }

    // If no taxonomy nodes in DB, seed them first
    if (nodeSlugToId.size === 0) {
      console.log('  Seeding taxonomy nodes into DB...');
      for (const node of taxonomyNodes) {
        const { data, error } = await supabase.from('kb_taxonomy_nodes')
          .upsert({
            slug: node.slug,
            title: node.title,
            level: node.level,
            source_provenance: [],
            synonyms: [],
          }, { onConflict: 'slug' })
          .select('id, slug')
          .single();
        if (data) nodeSlugToId.set(data.slug, data.id);
      }

      // Set parent_ids in a second pass
      for (const node of taxonomyNodes) {
        if (node.parent_slug) {
          const parentId = nodeSlugToId.get(node.parent_slug);
          const nodeId = nodeSlugToId.get(node.slug);
          if (parentId && nodeId) {
            await supabase.from('kb_taxonomy_nodes')
              .update({ parent_id: parentId })
              .eq('id', nodeId);
          }
        }
      }
      console.log(`  Seeded ${nodeSlugToId.size} taxonomy nodes`);
    }

    // Write classifications
    let writeCount = 0;
    for (const r of results) {
      if (r.primary_slug === 'unclassified') continue;

      const nodeId = nodeSlugToId.get(r.primary_slug);
      if (!nodeId) continue;

      const { error } = await supabase.from('kb_chunk_taxonomy').upsert({
        chunk_id: r.chunk_id,
        taxonomy_node_id: nodeId,
        confidence: r.confidence,
        method: 'llm',
        model: r.model,
      }, { onConflict: 'chunk_id,taxonomy_node_id' });

      if (!error) writeCount++;

      // Also write secondary classifications
      for (const secSlug of r.secondary_slugs) {
        const secNodeId = nodeSlugToId.get(secSlug);
        if (secNodeId) {
          await supabase.from('kb_chunk_taxonomy').upsert({
            chunk_id: r.chunk_id,
            taxonomy_node_id: secNodeId,
            confidence: r.confidence * 0.8,
            method: 'llm',
            model: r.model,
          }, { onConflict: 'chunk_id,taxonomy_node_id' });
        }
      }
    }
    console.log(`  Written ${writeCount} primary classifications`);
  }

  // Aggregate stats
  const slugCounts: Record<string, number> = {};
  for (const r of results) {
    slugCounts[r.primary_slug] = (slugCounts[r.primary_slug] || 0) + 1;
  }

  const topSlugs = Object.entries(slugCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  // Write report
  const dateStr = new Date().toISOString().split('T')[0];
  const reportDir = path.resolve(__dirname, '../../docs/system-audit');
  fs.mkdirSync(reportDir, { recursive: true });

  const md: string[] = [
    '---',
    'title: "Chunk Taxonomy Classification Pilot"',
    `date: ${dateStr}`,
    'type: system-audit',
    'tags: [heydpe, taxonomy, classification, pilot]',
    'status: draft',
    'evidence_level: medium',
    '---',
    '',
    '# 15 — Chunk Taxonomy Classification Pilot',
    '',
    `**Date:** ${dateStr}`,
    `**Mode:** ${flags.write ? 'WRITE' : 'DRY-RUN'}`,
    `**Chunks classified:** ${results.length}`,
    `**Model:** claude-sonnet-4-20250514`,
    '',
    '---',
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Chunks processed | ${results.length} |`,
    `| Classified | ${classified} (${(classified / results.length * 100).toFixed(1)}%) |`,
    `| Unclassified | ${unclassified} (${(unclassified / results.length * 100).toFixed(1)}%) |`,
    `| Cache read tokens | ${totalCacheRead.toLocaleString()} |`,
    `| Cache creation tokens | ${totalCacheCreate.toLocaleString()} |`,
    '',
    '## Top 20 Taxonomy Nodes by Chunk Count',
    '',
    '| Rank | Slug | Chunks |',
    '|------|------|--------|',
  ];

  for (const [i, [slug, count]] of topSlugs.entries()) {
    const node = taxonomyNodes.find(n => n.slug === slug);
    md.push(`| ${i + 1} | ${slug} (${node?.title || ''}) | ${count} |`);
  }

  md.push('', '## Sample Classifications (first 20)', '');
  md.push('| Chunk ID | Doc | Primary Slug | Confidence | Notes |');
  md.push('|----------|-----|-------------|------------|-------|');

  for (const r of results.slice(0, 20)) {
    const chunk = chunks.find(c => c.id === r.chunk_id);
    md.push(`| ${r.chunk_id.substring(0, 8)}... | ${chunk?.doc_abbrev || '?'} | ${r.primary_slug} | ${r.confidence} | ${r.notes?.substring(0, 60) || ''} |`);
  }

  md.push('', '## Prompt Caching Analysis', '');
  md.push(`- First request creates the cache: ~${totalCacheCreate.toLocaleString()} tokens`);
  md.push(`- Subsequent requests read from cache: ~${totalCacheRead.toLocaleString()} tokens saved`);
  md.push(`- Cache hit rate: ${results.length > 1 ? ((results.length - 1) / results.length * 100).toFixed(0) : 0}% (all but first request)`);

  md.push('', '---', '', '*Generated by classify_chunks.ts*');

  const reportPath = path.join(reportDir, '15 - Chunk Taxonomy Classification Pilot.md');
  fs.writeFileSync(reportPath, md.join('\n'));

  // Also write raw results JSON for analysis
  const resultsPath = path.join(path.resolve(__dirname, '../../data/taxonomy'), `classification-results-${dateStr}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify({
    date: dateStr,
    mode: flags.write ? 'write' : 'dry-run',
    total: results.length,
    classified,
    unclassified,
    cache_read_tokens: totalCacheRead,
    cache_creation_tokens: totalCacheCreate,
    slug_counts: slugCounts,
    results: results.map(r => ({
      chunk_id: r.chunk_id,
      primary_slug: r.primary_slug,
      secondary_slugs: r.secondary_slugs,
      confidence: r.confidence,
      notes: r.notes,
    })),
  }, null, 2));

  // Console summary
  console.log('\n=== Classification Complete ===\n');
  console.log(`  Classified: ${classified}/${results.length} (${(classified / results.length * 100).toFixed(1)}%)`);
  console.log(`  Unclassified: ${unclassified}`);
  console.log(`  Cache read: ${totalCacheRead.toLocaleString()} tokens`);
  console.log(`  Cache create: ${totalCacheCreate.toLocaleString()} tokens`);
  console.log(`\n  Report: ${reportPath}`);
  console.log(`  Data: ${resultsPath}`);

  console.log('\n  Top 5 taxonomy nodes:');
  for (const [slug, count] of topSlugs.slice(0, 5)) {
    console.log(`    ${slug}: ${count} chunks`);
  }
}

main().catch((err) => {
  console.error('Classification error:', err);
  process.exit(1);
});
