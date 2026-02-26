#!/usr/bin/env npx tsx
/**
 * extract-topics.ts — Extract topic/definition/procedure concepts from handbook source chunks.
 *
 * Reads source_chunks from handbook-type documents, calls Claude to extract
 * atomic knowledge concepts, deduplicates via fuzzy matching, and upserts
 * into the concepts table with concept_chunk_evidence links.
 *
 * Prerequisites:
 *   - Source documents and chunks ingested (scripts/ingest-sources.ts)
 *   - concept_chunk_evidence table created (migration 20260224000001)
 *
 * Usage:
 *   npx tsx scripts/extract-topics.ts                     # Full run on handbooks
 *   npx tsx scripts/extract-topics.ts --dry-run            # Parse but don't write
 *   npx tsx scripts/extract-topics.ts --limit 10           # Only process first 10 chunks
 *   npx tsx scripts/extract-topics.ts --doc-type handbook  # Filter by document_type (default: handbook)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';
import {
  TOPIC_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  TopicExtraction,
} from './extraction-prompts';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Convert a string to kebab-case.
 * Strips non-alphanumeric characters (except hyphens/spaces),
 * collapses whitespace, lowercases, and joins with hyphens.
 */
export function toKebabCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Generate a slug for a concept: `{category}:{kebab-case-name}`.
 * Total slug length is capped at 100 characters.
 */
export function generateTopicSlug(name: string, category: string): string {
  const prefix = category.toLowerCase() + ':';
  const maxNameLen = 100 - prefix.length;
  const kebab = toKebabCase(name).slice(0, maxNameLen);
  return prefix + kebab;
}

/**
 * Compute the Levenshtein edit distance between two strings.
 * Operates on lowercased inputs for case-insensitive comparison.
 */
export function computeLevenshtein(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();

  if (al === bl) return 0;
  if (al.length === 0) return bl.length;
  if (bl.length === 0) return al.length;

  // Use two-row DP to save memory
  let prev = Array.from({ length: bl.length + 1 }, (_, i) => i);
  let curr = new Array<number>(bl.length + 1);

  for (let i = 1; i <= al.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl.length; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[bl.length];
}

/**
 * Search a set of existing concept names for a fuzzy match within threshold.
 * Returns the matching name if found, or null if no match is close enough.
 * Comparison is case-insensitive.
 */
export function findFuzzyMatch(
  name: string,
  existingNames: Set<string>,
  threshold: number = 3,
): string | null {
  const lower = name.toLowerCase();
  let bestMatch: string | null = null;
  let bestDistance = threshold; // Only consider distances strictly less than threshold

  for (const existing of existingNames) {
    const distance = computeLevenshtein(lower, existing.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = existing;
    }
  }

  return bestMatch;
}

/**
 * Parse Claude's JSON response into TopicExtraction[].
 * Handles raw JSON arrays, markdown-fenced JSON, and invalid responses.
 * Filters out items missing required fields (name, category, content).
 */
export function parseTopicsResponse(text: string): TopicExtraction[] {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const validCategories = new Set(['topic', 'definition', 'procedure']);

  return parsed.filter((item: unknown): item is TopicExtraction => {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;

    // Required fields: name, category, content
    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) return false;
    if (typeof obj.category !== 'string' || !validCategories.has(obj.category)) return false;
    if (typeof obj.content !== 'string' || obj.content.trim().length === 0) return false;

    return true;
  }).map((item) => ({
    name: item.name,
    category: item.category,
    content: item.content,
    key_facts: Array.isArray(item.key_facts)
      ? item.key_facts.filter((f: unknown) => typeof f === 'string')
      : [],
    common_misconceptions: Array.isArray(item.common_misconceptions)
      ? item.common_misconceptions.filter((m: unknown) => typeof m === 'string')
      : [],
    related_cfr: Array.isArray(item.related_cfr)
      ? item.related_cfr.filter((r: unknown) => typeof r === 'string')
      : [],
    aliases: Array.isArray(item.aliases)
      ? item.aliases.filter((a: unknown) => typeof a === 'string')
      : [],
  }));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkRow {
  id: string;
  document_id: string;
  heading: string | null;
  content: string;
}

interface DocumentRow {
  id: string;
  document_type: string;
  abbreviation: string;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

  // --- Environment safety guard ---
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('extract-topics', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
  }

  // --- Parse CLI flags ---
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx !== -1 ? parseInt(args[offsetIdx + 1], 10) : 0;
  const docTypeIdx = args.indexOf('--doc-type');
  const docType = docTypeIdx !== -1 ? args[docTypeIdx + 1] : 'handbook';

  // --- Validate env vars ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY && !dryRun) {
    console.error('Missing ANTHROPIC_API_KEY (required unless --dry-run)');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = dryRun ? null : new Anthropic({ timeout: 45_000, maxRetries: 0 });

  console.log(`\nTopic Extraction Pipeline`);
  console.log(`=========================`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Document type: ${docType}`);
  console.log(`Chunk limit: ${limit === Infinity ? 'none' : limit}`);
  if (startOffset > 0) console.log(`Chunk offset: ${startOffset} (skipping first ${startOffset})`);
  console.log();

  // --- Step 1: Fetch handbook document IDs ---
  console.log(`Fetching ${docType} documents...`);

  const documents: DocumentRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('source_documents')
      .select('id, document_type, abbreviation')
      .eq('document_type', docType)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching documents:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    documents.push(...(data as DocumentRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (documents.length === 0) {
    console.error(`No documents found with document_type="${docType}".`);
    process.exit(1);
  }

  const docIds = documents.map((d) => d.id);
  console.log(`Found ${documents.length} ${docType} documents\n`);

  // --- Step 2: Fetch source chunks ---
  console.log('Fetching source chunks...');

  const allChunks: ChunkRow[] = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('source_chunks')
      .select('id, document_id, heading, content')
      .in('document_id', docIds)
      .order('document_id')
      .order('chunk_index')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching chunks:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allChunks.push(...(data as ChunkRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Filter out TOC/index chunks: heading IS NULL AND content length < 200
  const chunks = allChunks.filter(
    (chunk) => !(chunk.heading === null && chunk.content.length < 200),
  );

  console.log(`Total chunks fetched: ${allChunks.length}`);
  console.log(`After filtering TOC/index: ${chunks.length}`);

  // Apply offset and limit
  const chunksToProcess = chunks.slice(startOffset, startOffset + limit);
  console.log(`Chunks to process: ${chunksToProcess.length}\n`);

  // --- Step 3: Load existing concept names for dedup ---
  console.log('Loading existing concept names...');

  const existingNames = new Set<string>();
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('concepts')
      .select('name')
      .in('category', ['topic', 'definition', 'procedure'])
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching existing concepts:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      existingNames.add(row.name);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Existing topic/definition/procedure concepts: ${existingNames.size}\n`);

  // Build doc ID -> abbreviation lookup
  const docAbbrevMap = new Map<string, string>();
  for (const doc of documents) {
    docAbbrevMap.set(doc.id, doc.abbreviation);
  }

  // --- Step 4: Process chunks serially ---
  let totalExtracted = 0;
  let totalCreated = 0;
  let totalMerged = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Track slugs used in this run for collision detection
  const usedSlugs = new Set<string>();

  for (let i = 0; i < chunksToProcess.length; i++) {
    const chunk = chunksToProcess[i];
    const docAbbrev = docAbbrevMap.get(chunk.document_id) ?? docType;

    // Progress: use \r for TTY (overwrites line), \n for pipes (flushes each line)
    const isTTY = process.stdout.isTTY;
    const prefix = isTTY ? '\r' : '\n';
    process.stdout.write(
      `${prefix}  [${i + 1}/${chunksToProcess.length}] extracted=${totalExtracted} created=${totalCreated} merged=${totalMerged} errors=${totalErrors}`,
    );

    if (dryRun) {
      // In dry-run mode, skip Claude calls
      totalSkipped++;
      continue;
    }

    // Build user prompt
    const recentConcepts = Array.from(existingNames).slice(-50);
    const userPrompt = buildExtractionUserPrompt(
      chunk.content,
      chunk.heading,
      docAbbrev,
      recentConcepts,
    );

    // Call Claude with SDK timeout + maxRetries: 0 for reliable timeout behavior
    let responseText: string;
    try {
      const response = await anthropic!.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: TOPIC_EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        totalErrors++;
        continue;
      }
      responseText = textBlock.text;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('timed out') || errMsg.includes('abort') || errMsg.includes('timeout')) {
        console.error(`\n  Timeout (45s) on chunk ${chunk.id?.slice(0, 8)}, skipping`);
      } else {
        console.error(`\n  API error on chunk ${chunk.id?.slice(0, 8)}: ${errMsg.slice(0, 120)}`);
      }
      totalErrors++;
      continue;
    }

    // Parse response
    const extractions = parseTopicsResponse(responseText);
    totalExtracted += extractions.length;

    if (extractions.length === 0) continue;

    // Process each extracted concept
    for (const extraction of extractions) {
      // Fuzzy match against existing names
      const fuzzyMatch = findFuzzyMatch(extraction.name, existingNames);

      if (fuzzyMatch) {
        // Merge: concept already exists (or close enough) — skip creation
        totalMerged++;
        continue;
      }

      // Generate slug with collision avoidance
      let slug = generateTopicSlug(extraction.name, extraction.category);
      if (usedSlugs.has(slug)) {
        let suffix = 2;
        while (usedSlugs.has(`${slug}-${suffix}`)) {
          suffix++;
        }
        slug = `${slug}-${suffix}`;
      }
      usedSlugs.add(slug);

      // Upsert concept
      const { data: conceptData, error: upsertError } = await supabase
        .from('concepts')
        .upsert(
          {
            name: extraction.name,
            slug,
            name_normalized: extraction.name.toLowerCase(),
            aliases: extraction.aliases,
            category: extraction.category,
            content: extraction.content,
            key_facts: extraction.key_facts,
            common_misconceptions: extraction.common_misconceptions,
            embedding: null,
            embedding_status: 'stale',
            validation_status: 'pending',
          },
          { onConflict: 'slug' },
        )
        .select('id')
        .single();

      if (upsertError) {
        console.error(`\n  Upsert error for "${extraction.name}": ${upsertError.message}`);
        totalErrors++;
        continue;
      }

      // Create evidence link
      if (conceptData) {
        const { error: linkError } = await supabase
          .from('concept_chunk_evidence')
          .upsert(
            {
              concept_id: conceptData.id,
              chunk_id: chunk.id,
              evidence_type: 'primary',
              confidence: 0.8,
              created_by: 'pipeline:extract-topics',
            },
            { onConflict: 'concept_id,chunk_id,evidence_type' },
          );

        if (linkError) {
          console.error(
            `\n  Evidence link error for "${extraction.name}": ${linkError.message}`,
          );
        }
      }

      existingNames.add(extraction.name);
      totalCreated++;
    }
  }

  // --- Summary ---
  console.log(`\n\n=========================`);
  console.log(`Topic Extraction Summary`);
  console.log(`=========================`);
  console.log(`Chunks processed:      ${chunksToProcess.length}`);
  console.log(`Total concepts found:  ${totalExtracted}`);
  console.log(`New concepts created:  ${totalCreated}${dryRun ? ' (dry run — not written)' : ''}`);
  console.log(`Merged (fuzzy dedup):  ${totalMerged}`);
  console.log(`Skipped (dry run):     ${totalSkipped}`);
  console.log(`Errors:                ${totalErrors}`);
  console.log(`Final concept set:     ${existingNames.size}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
