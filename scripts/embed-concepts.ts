#!/usr/bin/env npx tsx
/**
 * embed-concepts.ts — Generate embeddings for concept nodes
 *
 * Finds all concepts with NULL embeddings or stale embedding_status,
 * generates embeddings via OpenAI text-embedding-3-small, and updates
 * each concept row in Supabase.
 *
 * Usage:
 *   npx tsx scripts/embed-concepts.ts [--dry-run]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import OpenAI from 'openai';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the text string that will be sent to the embedding model.
 * Concatenates concept name, content, and key_facts JSON.
 */
export function buildEmbeddingText(concept: {
  name: string;
  content: string | null;
  key_facts: string[] | null;
}): string {
  const parts: string[] = [concept.name];

  if (concept.content && concept.content.trim().length > 0) {
    parts.push(concept.content.trim());
  }

  if (concept.key_facts && concept.key_facts.length > 0) {
    parts.push(JSON.stringify(concept.key_facts));
  }

  return parts.join(' ');
}

/**
 * Split an array into batches of a given size.
 */
export function batchArray<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConceptRow {
  id: string;
  name: string;
  content: string | null;
  key_facts: string[] | null;
  embedding_status: string;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

  // --- Environment safety guard ---
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('embed-concepts', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const openaiKey = process.env.OPENAI_API_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!openaiKey && !dryRun) {
    console.error('Missing OPENAI_API_KEY (required unless --dry-run)');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const openai = dryRun ? null : new OpenAI({ apiKey: openaiKey });

  console.log(`\nEmbed Concepts Pipeline`);
  console.log(`=======================`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no API calls)' : 'LIVE'}\n`);

  // --- Fetch concepts needing embeddings (paginated to handle >1000 rows) ---
  const concepts: ConceptRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: page, error: fetchError } = await supabase
      .from('concepts')
      .select('id, name, content, key_facts, embedding_status')
      .or('embedding.is.null,embedding_status.eq.stale')
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      console.error('Error fetching concepts:', fetchError.message);
      process.exit(1);
    }
    if (!page || page.length === 0) break;
    concepts.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Also count how many are already current
  const { count: currentCount, error: countError } = await supabase
    .from('concepts')
    .select('id', { count: 'exact', head: true })
    .eq('embedding_status', 'current')
    .not('embedding', 'is', null);

  if (countError) {
    console.error('Error counting current concepts:', countError.message);
    process.exit(1);
  }

  console.log(`Concepts needing embeddings: ${concepts.length}`);
  console.log(`Concepts already current:    ${currentCount ?? 0}`);

  if (concepts.length === 0) {
    console.log('\nNothing to do — all concepts have current embeddings.');
    return;
  }

  if (dryRun) {
    console.log('\n--- Dry Run Summary ---');
    console.log(`Would embed ${concepts.length} concepts`);
    console.log(`Batch size: 100`);
    console.log(`Batches needed: ${Math.ceil(concepts.length / 100)}`);
    console.log('\nSample embedding texts:');
    for (const concept of concepts.slice(0, 5)) {
      const text = buildEmbeddingText(concept);
      console.log(`  [${concept.id.slice(0, 8)}...] ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`);
    }
    return;
  }

  // --- Generate embeddings in batches ---
  const EMBEDDING_BATCH_SIZE = 100;
  const DB_CONCURRENCY = 10;
  const batches = batchArray(concepts, EMBEDDING_BATCH_SIZE);

  let totalProcessed = 0;
  let totalErrors = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const texts = batch.map((c) => buildEmbeddingText(c));

    console.log(`\nBatch ${batchIdx + 1}/${batches.length} (${batch.length} concepts)...`);

    try {
      const response = await openai!.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      const sorted = response.data.sort((a, b) => a.index - b.index);

      // Update DB with concurrency limit
      for (let start = 0; start < sorted.length; start += DB_CONCURRENCY) {
        const chunk = sorted.slice(start, start + DB_CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map((item, idx) => {
            const conceptId = batch[start + idx].id;
            return supabase
              .from('concepts')
              .update({
                embedding: item.embedding as unknown as string,
                embedding_status: 'current',
              })
              .eq('id', conceptId);
          })
        );

        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          console.log(`  DB UPDATE: ${failures.length}/${chunk.length} failed`);
          totalErrors += failures.length;
        }
      }

      totalProcessed += sorted.length;
      console.log(`  Embedded ${sorted.length} concepts`);
    } catch (err) {
      console.error(`  EMBED ERROR: ${err}`);
      totalErrors += batch.length;
    }
  }

  // --- Summary ---
  console.log(`\n=======================`);
  console.log(`Total processed:      ${totalProcessed}`);
  console.log(`Already current:      ${currentCount ?? 0}`);
  console.log(`Errors:               ${totalErrors}`);
  console.log(`Done!`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
