#!/usr/bin/env npx tsx
/**
 * classify_chunks_knowledge.ts — Classify source_chunks from triage/unclassified
 * into real taxonomy nodes using LLM (knowledge hub) or regex (regulations hub).
 *
 * Knowledge hub: Uses Anthropic prompt caching — taxonomy + rubric in a cached
 * system block, per-chunk content as the variable user message.
 *
 * Regulations hub: Deterministic CFR regex matching on chunk content.
 *
 * Flags:
 *   --dry-run         Print classifications but don't write to DB (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --limit N         Process at most N chunks
 *   --offset N        Skip first N eligible chunks
 *   --since DATE      Only process chunks created after DATE
 *   --concurrency N   Parallel API calls (default: 5)
 *   --hub HUB         Hub to classify: knowledge (default) or regulations
 *
 * Usage:
 *   npx tsx scripts/taxonomy/classify_chunks_knowledge.ts --limit 100
 *   npx tsx scripts/taxonomy/classify_chunks_knowledge.ts --hub regulations --write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/classify_chunks_knowledge.ts --write
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
// Constants
// ---------------------------------------------------------------------------

const LLM_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 256;
const CONTENT_TRUNCATE_LENGTH = 800;
const CFR_REGEX = /\b(?:14\s*CFR|part)\s*(\d+)/i;

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    dryRun: true,
    write: false,
    limit: 0,
    offset: 0,
    since: '',
    concurrency: 5,
    hub: 'knowledge' as 'knowledge' | 'regulations',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': flags.dryRun = true; flags.write = false; break;
      case '--write': flags.write = true; flags.dryRun = false; break;
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
      case '--offset': flags.offset = parseInt(args[++i], 10); break;
      case '--since': flags.since = args[++i]; break;
      case '--concurrency': flags.concurrency = parseInt(args[++i], 10); break;
      case '--hub': {
        const hub = args[++i];
        if (hub !== 'knowledge' && hub !== 'regulations') {
          console.error(`Invalid hub: ${hub}. Must be 'knowledge' or 'regulations'.`);
          process.exit(1);
        }
        flags.hub = hub;
        break;
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxonomyNode {
  id: string;
  slug: string;
  title: string;
  level: number;
  hub_slug: string;
}

interface ChunkRow {
  id: string;
  content: string;
  heading: string;
  doc_abbrev: string;
}

interface ClassificationResult {
  chunk_id: string;
  primary_slug: string;
  confidence: number;
  notes: string;
  method: string;
  model: string | null;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

// ---------------------------------------------------------------------------
// Fetch all rows with pagination
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

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Fetch triage node ID for a hub
// ---------------------------------------------------------------------------

async function fetchTriageNodeId(hubSlug: string): Promise<string> {
  const triageSlug = `${hubSlug}:triage-unclassified`;
  const { data, error } = await supabase
    .from('kb_taxonomy_nodes')
    .select('id')
    .eq('slug', triageSlug)
    .single();

  if (error || !data) {
    console.error(`Cannot find triage node "${triageSlug}":`, error?.message);
    process.exit(1);
  }

  return data.id;
}

// ---------------------------------------------------------------------------
// Fetch triage chunks (those still on the triage node)
// ---------------------------------------------------------------------------

async function fetchTriageChunks(
  hubSlug: string,
  triageNodeId: string,
  opts: { limit: number; offset: number; since: string },
): Promise<ChunkRow[]> {
  // Get chunk IDs from kb_chunk_taxonomy that are on the triage node
  let chunkQuery = supabase
    .from('kb_chunk_taxonomy')
    .select('chunk_id')
    .eq('hub_slug', hubSlug)
    .eq('taxonomy_node_id', triageNodeId);

  if (opts.since) {
    chunkQuery = chunkQuery.gte('created_at', opts.since);
  }

  // Paginated fetch — Supabase caps .limit() at apiMaxRows (default 1000)
  const taxRows: { chunk_id: string }[] = [];
  const pageSize = 1000;
  let pageOffset = 0;
  const maxRows = opts.limit > 0 ? opts.limit + opts.offset : 100000;

  while (taxRows.length < maxRows) {
    const remaining = maxRows - taxRows.length;
    const fetchSize = Math.min(pageSize, remaining);
    const { data, error: taxError } = await chunkQuery
      .range(pageOffset, pageOffset + fetchSize - 1);

    if (taxError) {
      console.error('Error fetching triage chunk IDs:', taxError.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    taxRows.push(...(data as { chunk_id: string }[]));
    if (data.length < fetchSize) break;
    pageOffset += fetchSize;
  }

  if (taxRows.length === 0) {
    return [];
  }

  // Apply offset
  const sliced = taxRows.slice(opts.offset, opts.limit > 0 ? opts.offset + opts.limit : undefined);
  const chunkIds = sliced.map((r: { chunk_id: string }) => r.chunk_id);

  if (chunkIds.length === 0) return [];

  // Fetch chunk content + document abbreviation in batches (Supabase IN limit)
  const allChunks: ChunkRow[] = [];
  const batchSize = 200;

  for (let i = 0; i < chunkIds.length; i += batchSize) {
    const batch = chunkIds.slice(i, i + batchSize);
    const { data: chunkData, error: chunkError } = await supabase
      .from('source_chunks')
      .select('id, content, heading, source_documents(abbreviation)')
      .in('id', batch);

    if (chunkError) {
      console.error(`Error fetching chunks at offset ${i}:`, chunkError.message);
      continue;
    }

    for (const row of chunkData || []) {
      const r = row as Record<string, unknown>;
      allChunks.push({
        id: r.id as string,
        content: r.content as string,
        heading: (r.heading || '') as string,
        doc_abbrev: ((r.source_documents as Record<string, unknown>)?.abbreviation || 'unknown') as string,
      });
    }
  }

  return allChunks;
}

// ---------------------------------------------------------------------------
// Load taxonomy nodes for a hub (L1 + L2) from database
// ---------------------------------------------------------------------------

async function loadHubTaxonomyNodes(hubSlug: string): Promise<TaxonomyNode[]> {
  const nodes: TaxonomyNode[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('kb_taxonomy_nodes')
      .select('id, slug, title, level, hub_slug')
      .eq('hub_slug', hubSlug)
      .lte('level', 2)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching taxonomy nodes:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    nodes.push(...(data as TaxonomyNode[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Build taxonomy text for the system prompt
// ---------------------------------------------------------------------------

function buildTaxonomyText(nodes: TaxonomyNode[]): string {
  const lines: string[] = ['TAXONOMY (slug | title | level):'];
  for (const n of nodes) {
    lines.push(`${n.slug} | ${n.title} | L${n.level}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Build cached system prompt for knowledge hub
// ---------------------------------------------------------------------------

function buildSystemBlocks(
  taxonomyText: string,
): Anthropic.MessageCreateParams['system'] {
  const rubric = `You are a technical taxonomy classifier for FAA aviation education content.
Given a chunk of text from an FAA source document, classify it into the most appropriate taxonomy node.

RULES:
1. Always assign exactly ONE primary taxonomy node (the best fit).
2. Use the exact slug from the taxonomy list below.
3. If no taxonomy node fits well, respond with "unclassified".
4. Confidence: 0.9+ if strong keyword/topic match, 0.7-0.9 if reasonable, 0.5-0.7 if weak.
5. Prefer L2 nodes over L1 (more specific is better).
6. Consider both the content AND the source document abbreviation.

RESPOND WITH ONLY valid JSON (no markdown, no explanation):
{"primary_slug": "tax:...", "confidence": 0.85, "notes": "brief reason"}`;

  return [
    {
      type: 'text' as const,
      text: rubric + '\n\n' + taxonomyText,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

// ---------------------------------------------------------------------------
// Classify a single chunk via LLM (knowledge hub)
// ---------------------------------------------------------------------------

async function classifyChunkLLM(
  anthropic: Anthropic,
  systemBlocks: Anthropic.MessageCreateParams['system'],
  chunk: ChunkRow,
  validSlugs: Set<string>,
): Promise<ClassificationResult> {
  const truncatedContent = chunk.content.substring(0, CONTENT_TRUNCATE_LENGTH);
  const userMessage = `Document: ${chunk.doc_abbrev}\nHeading: ${chunk.heading}\nContent:\n${truncatedContent}`;

  const response = await anthropic.messages.create({
    model: LLM_MODEL,
    max_tokens: MAX_TOKENS,
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
  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';
  let parsed: { primary_slug: string; confidence: number; notes: string };

  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      primary_slug: 'unclassified',
      confidence: 0,
      notes: 'JSON parse error: ' + text.substring(0, 100),
    };
  }

  // Validate slug
  if (
    parsed.primary_slug !== 'unclassified' &&
    !validSlugs.has(parsed.primary_slug)
  ) {
    parsed.notes += ` (invalid slug: ${parsed.primary_slug})`;
    parsed.primary_slug = 'unclassified';
    parsed.confidence = 0;
  }

  return {
    chunk_id: chunk.id,
    primary_slug: parsed.primary_slug,
    confidence: parsed.confidence,
    notes: parsed.notes,
    method: 'llm',
    model: LLM_MODEL,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_creation_tokens: usage.cache_creation_input_tokens || 0,
  };
}

// ---------------------------------------------------------------------------
// Classify a single chunk via regex (regulations hub)
// ---------------------------------------------------------------------------

function classifyChunkRegex(
  chunk: ChunkRow,
  slugToNodeId: Map<string, string>,
): ClassificationResult {
  const match = CFR_REGEX.exec(chunk.content);

  if (match) {
    const partNumber = match[1];
    const targetSlug = `regulations:14cfr-part-${partNumber}`;

    if (slugToNodeId.has(targetSlug)) {
      return {
        chunk_id: chunk.id,
        primary_slug: targetSlug,
        confidence: 1.0,
        notes: `Matched CFR part ${partNumber}`,
        method: 'regex_cfr_match',
        model: null,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      };
    }
  }

  return {
    chunk_id: chunk.id,
    primary_slug: 'unclassified',
    confidence: 0,
    notes: 'No CFR part regex match',
    method: 'regex_cfr_match',
    model: null,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
  };
}

// ---------------------------------------------------------------------------
// Write classification to database
// ---------------------------------------------------------------------------

async function writeClassification(
  result: ClassificationResult,
  hubSlug: string,
  slugToNodeId: Map<string, string>,
): Promise<boolean> {
  if (result.primary_slug === 'unclassified') return false;

  const resolvedNodeId = slugToNodeId.get(result.primary_slug);
  if (!resolvedNodeId) return false;

  const { error } = await supabase.from('kb_chunk_taxonomy').upsert(
    {
      chunk_id: result.chunk_id,
      taxonomy_node_id: resolvedNodeId,
      hub_slug: hubSlug,
      taxonomy_slug: 'default',
      confidence: result.confidence,
      method: result.method,
      model: result.model,
    },
    { onConflict: 'chunk_id' },
  );

  if (error) {
    console.error(`  DB write error for chunk ${result.chunk_id}:`, error.message);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Write markdown report
// ---------------------------------------------------------------------------

function writeReport(opts: {
  hubSlug: string;
  mode: string;
  dateStr: string;
  total: number;
  classified: number;
  unclassified: number;
  totalCacheRead: number;
  totalCacheCreate: number;
  slugCounts: Record<string, number>;
  taxonomyNodes: TaxonomyNode[];
}) {
  const {
    hubSlug,
    mode,
    dateStr,
    total,
    classified,
    unclassified,
    totalCacheRead,
    totalCacheCreate,
    slugCounts,
    taxonomyNodes,
  } = opts;

  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const topSlugs = Object.entries(slugCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);

  const nodeMap = new Map(taxonomyNodes.map((n) => [n.slug, n]));

  const classifiedPct = total > 0 ? ((classified / total) * 100).toFixed(1) : '0.0';
  const unclassifiedPct = total > 0 ? ((unclassified / total) * 100).toFixed(1) : '0.0';

  const md: string[] = [
    '---',
    `title: "Chunk Classification — ${hubSlug} hub"`,
    `date: ${dateStr}`,
    'type: graph-report',
    `tags: [heydpe, taxonomy, classification, ${hubSlug}]`,
    '---',
    '',
    `# Chunk Classification Report: ${hubSlug} hub`,
    '',
    `**Date:** ${dateStr}`,
    `**Hub:** ${hubSlug}`,
    `**Mode:** ${mode}`,
    `**Model:** ${hubSlug === 'knowledge' ? LLM_MODEL : 'N/A (regex)'}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Chunks processed | ${total} |`,
    `| Classified | ${classified} (${classifiedPct}%) |`,
    `| Triage remaining | ${unclassified} (${unclassifiedPct}%) |`,
  ];

  if (hubSlug === 'knowledge') {
    md.push(`| Cache read tokens | ${totalCacheRead.toLocaleString()} |`);
    md.push(`| Cache creation tokens | ${totalCacheCreate.toLocaleString()} |`);
  }

  md.push('');
  md.push('## Top-30 Taxonomy Node Distribution');
  md.push('');
  md.push('| Rank | Slug | Title | Chunks |');
  md.push('|------|------|-------|--------|');

  for (const [i, [slug, count]] of topSlugs.entries()) {
    const node = nodeMap.get(slug);
    md.push(
      `| ${i + 1} | ${slug} | ${node?.title || ''} | ${count} |`,
    );
  }

  if (hubSlug === 'knowledge') {
    md.push('');
    md.push('## Cache Token Stats');
    md.push('');
    md.push(`- Cache creation tokens: ${totalCacheCreate.toLocaleString()}`);
    md.push(`- Cache read tokens: ${totalCacheRead.toLocaleString()}`);
    md.push(
      `- Estimated cache hit rate: ${total > 1 ? (((total - 1) / total) * 100).toFixed(0) : 0}%`,
    );
  }

  md.push('');
  md.push('---');
  md.push('');
  md.push('*Generated by classify_chunks_knowledge.ts*');

  const reportPath = path.join(
    reportDir,
    `${dateStr}-chunk-classification-${hubSlug}.md`,
  );
  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`\n  Report: ${reportPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const hubSlug = flags.hub;

  console.log(`\n=== Chunk Classification — ${hubSlug} hub ===\n`);
  console.log(`Mode: ${flags.write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`Hub: ${hubSlug}`);
  if (flags.limit) console.log(`Limit: ${flags.limit}`);
  if (flags.offset) console.log(`Offset: ${flags.offset}`);
  if (flags.since) console.log(`Since: ${flags.since}`);
  if (hubSlug === 'knowledge') console.log(`Concurrency: ${flags.concurrency}`);

  // Safety check for production writes
  if (flags.write) {
    assertNotProduction('classify-chunks-knowledge', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn(
        'WARNING: ALLOW_PROD_WRITE=1 — production write override active!\n',
      );
    }
  }

  // Step 1: Fetch triage node ID
  console.log('\nFetching triage node...');
  const triageNodeId = await fetchTriageNodeId(hubSlug);
  console.log(`  Triage node: ${hubSlug}:triage-unclassified -> ${triageNodeId}`);

  // Step 2: Fetch chunks on triage
  console.log('\nFetching triage chunks...');
  const chunks = await fetchTriageChunks(hubSlug, triageNodeId, {
    limit: flags.limit,
    offset: flags.offset,
    since: flags.since,
  });
  console.log(`  Chunks to classify: ${chunks.length}`);

  if (chunks.length === 0) {
    console.log('No chunks to process. All classified or none on triage.');
    return;
  }

  // Step 3: Load taxonomy nodes for the hub
  console.log('\nLoading taxonomy nodes...');
  const taxonomyNodes = await loadHubTaxonomyNodes(hubSlug);
  // Also load all hub nodes (including triage) for slug-to-ID mapping
  const allHubNodes = await fetchAll<TaxonomyNode>(
    'kb_taxonomy_nodes',
    'id, slug, title, level, hub_slug',
  );
  const slugToNodeId = new Map<string, string>();
  for (const n of allHubNodes) {
    slugToNodeId.set(n.slug, n.id);
  }

  const validSlugs = new Set(taxonomyNodes.map((n) => n.slug));
  console.log(
    `  Taxonomy nodes: ${taxonomyNodes.length} (L1+L2 for ${hubSlug})`,
  );

  // Step 4: Classify
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let classified = 0;
  let unclassified = 0;

  let results: ClassificationResult[];

  if (hubSlug === 'knowledge') {
    // LLM-based classification with prompt caching
    const anthropic = new Anthropic();
    const taxonomyText = buildTaxonomyText(taxonomyNodes);
    const systemBlocks = buildSystemBlocks(taxonomyText);

    console.log(`\nClassifying via LLM (model: ${LLM_MODEL}, concurrency: ${flags.concurrency})...\n`);

    results = await processBatch(
      chunks,
      flags.concurrency,
      async (chunk, i) => {
        const result = await classifyChunkLLM(
          anthropic,
          systemBlocks,
          chunk,
          validSlugs,
        );

        totalCacheRead += result.cache_read_tokens;
        totalCacheCreate += result.cache_creation_tokens;

        if (
          result.primary_slug === 'unclassified' ||
          result.confidence < 0.5
        ) {
          unclassified++;
          // Force to unclassified if confidence too low
          if (result.confidence < 0.5 && result.primary_slug !== 'unclassified') {
            result.notes += ` (confidence ${result.confidence} < 0.5 threshold)`;
            result.primary_slug = 'unclassified';
          }
        } else {
          classified++;
        }

        // Progress every 10%
        const step = Math.max(1, Math.floor(chunks.length / 10));
        if ((i + 1) % step === 0 || i === chunks.length - 1) {
          const pct = (((i + 1) / chunks.length) * 100).toFixed(0);
          console.log(
            `  [${pct}%] ${i + 1}/${chunks.length} — classified: ${classified}, triage: ${unclassified}, cache reads: ${totalCacheRead.toLocaleString()} tokens`,
          );
        }

        return result;
      },
    );
  } else {
    // Regulations hub: deterministic regex
    console.log('\nClassifying via CFR regex...\n');

    results = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = classifyChunkRegex(chunks[i], slugToNodeId);
      results.push(result);

      if (result.primary_slug === 'unclassified') {
        unclassified++;
      } else {
        classified++;
      }

      // Progress every 10%
      const step = Math.max(1, Math.floor(chunks.length / 10));
      if ((i + 1) % step === 0 || i === chunks.length - 1) {
        const pct = (((i + 1) / chunks.length) * 100).toFixed(0);
        console.log(
          `  [${pct}%] ${i + 1}/${chunks.length} — classified: ${classified}, triage: ${unclassified}`,
        );
      }
    }
  }

  // Step 5: Write to database (if --write)
  if (flags.write) {
    console.log('\nWriting to database...');
    let writeCount = 0;
    let writeErrors = 0;

    for (const result of results) {
      if (result.primary_slug === 'unclassified') continue;
      if (result.confidence < 0.5) continue;

      const ok = await writeClassification(result, hubSlug, slugToNodeId);
      if (ok) {
        writeCount++;
      } else {
        writeErrors++;
      }
    }

    console.log(
      `  Written: ${writeCount} classifications (${writeErrors} errors)`,
    );
  }

  // Step 6: Aggregate stats
  const slugCounts: Record<string, number> = {};
  for (const r of results) {
    slugCounts[r.primary_slug] = (slugCounts[r.primary_slug] || 0) + 1;
  }

  const topSlugs = Object.entries(slugCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);

  // Console summary
  console.log('\n=== Classification Complete ===\n');
  console.log(`  Hub: ${hubSlug}`);
  console.log(`  Total processed: ${results.length}`);
  console.log(
    `  Classified: ${classified}/${results.length} (${results.length > 0 ? ((classified / results.length) * 100).toFixed(1) : '0.0'}%)`,
  );
  console.log(`  Triage remaining: ${unclassified}`);

  if (hubSlug === 'knowledge') {
    console.log(`  Cache read tokens: ${totalCacheRead.toLocaleString()}`);
    console.log(
      `  Cache creation tokens: ${totalCacheCreate.toLocaleString()}`,
    );
  }

  console.log('\n  Top-30 taxonomy node distribution:');
  for (const [slug, count] of topSlugs) {
    const node = taxonomyNodes.find((n) => n.slug === slug);
    console.log(`    ${slug} (${node?.title || ''}): ${count} chunks`);
  }

  // Step 7: Write markdown report
  const dateStr = new Date().toISOString().split('T')[0];
  writeReport({
    hubSlug,
    mode: flags.write ? 'WRITE' : 'DRY-RUN',
    dateStr,
    total: results.length,
    classified,
    unclassified,
    totalCacheRead,
    totalCacheCreate,
    slugCounts,
    taxonomyNodes,
  });
}

main().catch((err) => {
  console.error('Classification error:', err);
  process.exit(1);
});
