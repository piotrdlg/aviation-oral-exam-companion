#!/usr/bin/env npx tsx
/**
 * link-acs-to-chunks.ts — Link ACS element concepts to source evidence chunks.
 *
 * For each concept with category='acs_element', performs a hybrid search against
 * source_chunks using the concept's content and embedding, then inserts the top
 * matches into concept_chunk_evidence for citation provenance.
 *
 * Prerequisites:
 *   - ACS skeleton graph populated (migration 20260220100002)
 *   - Embeddings generated (scripts/embed-concepts.ts)
 *   - Source chunks ingested with embeddings (scripts/ingest-sources.ts)
 *   - concept_chunk_evidence table created (migration 20260224000001)
 *
 * Usage:
 *   npx tsx scripts/link-acs-to-chunks.ts            # Insert evidence links
 *   npx tsx scripts/link-acs-to-chunks.ts --dry-run   # Count only, no inserts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const MATCH_COUNT = 5;
const SIMILARITY_THRESHOLD = 0.3;
const PROGRESS_INTERVAL = 10;

// ---------------------------------------------------------------------------
// Environment safety guard
// ---------------------------------------------------------------------------

const appEnv = getAppEnv();
console.log(`\nEnvironment: ${appEnv}`);
assertNotProduction('link-acs-to-chunks', {
  allow: process.env.ALLOW_PROD_WRITE === '1',
});
if (process.env.ALLOW_PROD_WRITE === '1') {
  console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
}

if (DRY_RUN) {
  console.log('DRY RUN — no data will be written\n');
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  content: string;
  embedding: number[] | null;
}

interface ChunkSearchResult {
  id: string;
  document_id: string;
  heading: string;
  content: string;
  page_start: number;
  page_end: number;
  doc_title: string;
  doc_abbreviation: string;
  score: number;
}

interface EvidenceInsert {
  concept_id: string;
  chunk_id: string;
  evidence_type: 'primary';
  confidence: number;
  created_by: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching ACS element concepts...');

  // Paginate through all acs_element concepts (Supabase default limit is 1000)
  const concepts: ConceptRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, name, slug, content, embedding')
      .eq('category', 'acs_element')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching concepts:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    concepts.push(...(data as ConceptRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (concepts.length === 0) {
    console.error(
      'No acs_element concepts found. Ensure the ACS skeleton graph migration has been applied.',
    );
    process.exit(1);
  }

  console.log(`Found ${concepts.length} ACS element concepts\n`);

  let totalProcessed = 0;
  let totalLinksCreated = 0;
  let skippedNoEmbedding = 0;
  let skippedNoResults = 0;

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];

    // Skip concepts without embeddings
    if (!concept.embedding) {
      skippedNoEmbedding++;
      console.warn(
        `WARNING: Concept "${concept.slug}" has no embedding — skipping. ` +
          'Run embed-concepts script first.',
      );
      continue;
    }

    // Call chunk_hybrid_search RPC
    const { data: results, error: searchError } = await supabase.rpc('chunk_hybrid_search', {
      query_text: concept.content,
      query_embedding: concept.embedding,
      match_count: MATCH_COUNT,
      similarity_threshold: SIMILARITY_THRESHOLD,
    });

    if (searchError) {
      console.error(
        `Error searching for concept "${concept.slug}":`,
        searchError.message,
      );
      continue;
    }

    const chunks = (results ?? []) as ChunkSearchResult[];

    if (chunks.length === 0) {
      skippedNoResults++;
      continue;
    }

    // Build evidence rows
    const evidenceRows: EvidenceInsert[] = chunks.map((chunk) => ({
      concept_id: concept.id,
      chunk_id: chunk.id,
      evidence_type: 'primary' as const,
      confidence: chunk.score,
      created_by: 'pipeline:link-acs',
    }));

    if (!DRY_RUN) {
      const { error: upsertError } = await supabase
        .from('concept_chunk_evidence')
        .upsert(evidenceRows, { onConflict: 'concept_id,chunk_id,evidence_type' });

      if (upsertError) {
        console.error(
          `Error upserting evidence for "${concept.slug}":`,
          upsertError.message,
        );
        continue;
      }
    }

    totalLinksCreated += evidenceRows.length;
    totalProcessed++;

    // Progress reporting
    if ((i + 1) % PROGRESS_INTERVAL === 0 || i === concepts.length - 1) {
      console.log(
        `  [${i + 1}/${concepts.length}] Processed "${concept.slug}" — ` +
          `${chunks.length} evidence links${DRY_RUN ? ' (dry run)' : ''}`,
      );
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Total ACS element concepts: ${concepts.length}`);
  console.log(`Processed:                  ${totalProcessed}`);
  console.log(`Evidence links created:     ${totalLinksCreated}${DRY_RUN ? ' (dry run — not inserted)' : ''}`);
  console.log(`Skipped (no embedding):     ${skippedNoEmbedding}`);
  console.log(`Skipped (no search results): ${skippedNoResults}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
