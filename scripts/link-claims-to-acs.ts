#!/usr/bin/env npx tsx
/**
 * link-claims-to-acs.ts — Link regulatory claim concepts to ACS elements via embedding similarity.
 *
 * For each regulatory_claim concept with an embedding, finds the top 3 most
 * similar acs_element concepts by cosine similarity and creates applies_in_scenario
 * edges in concept_relations.
 *
 * Pipeline:
 *   1. Fetch all regulatory_claim concepts with embeddings
 *   2. Fetch all acs_element concepts with embeddings (cached)
 *   3. For each claim, compute cosine similarity against all ACS elements
 *   4. Create applies_in_scenario edges for top 3 matches above threshold (0.4)
 *
 * Usage:
 *   npx tsx scripts/link-claims-to-acs.ts                   # Create edges
 *   npx tsx scripts/link-claims-to-acs.ts --dry-run          # Preview only
 *   npx tsx scripts/link-claims-to-acs.ts --limit 50         # Process first 50 claims
 *   npx tsx scripts/link-claims-to-acs.ts --dry-run --limit 10
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 *
 * Returns a value between -1 and 1, where 1 means identical direction,
 * 0 means orthogonal, and -1 means opposite direction.
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Cosine similarity score
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOP_K = 3;
const SIMILARITY_THRESHOLD = 0.3;
const PROGRESS_INTERVAL = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConceptWithEmbedding {
  id: string;
  slug: string;
  name: string;
  embedding: number[];
}

/** Parse embedding from Supabase (may arrive as string or number[]). */
function parseEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

  // --- Environment safety guard ---
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('link-claims-to-acs', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
  }

  // --- Parse CLI args ---
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let limit: number | null = null;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10);
    if (isNaN(limit) || limit <= 0) {
      console.error('Invalid --limit value. Must be a positive integer.');
      process.exit(1);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`\nLink Claims to ACS Pipeline`);
  console.log(`============================`);
  console.log(`Mode:      ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Threshold: ${SIMILARITY_THRESHOLD}`);
  console.log(`Top-K:     ${TOP_K}`);
  if (limit) console.log(`Limit:     ${limit}`);
  console.log();

  // --- Step 1: Fetch regulatory_claim concepts with embeddings ---
  console.log('Fetching regulatory_claim concepts with embeddings...');

  const claims: ConceptWithEmbedding[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, slug, name, embedding')
      .eq('category', 'regulatory_claim')
      .not('embedding', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching regulatory_claim concepts:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    claims.push(...data.map((d: Record<string, unknown>) => ({
      ...d,
      embedding: parseEmbedding(d.embedding),
    } as ConceptWithEmbedding)));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (claims.length === 0) {
    console.error(
      'No regulatory_claim concepts with embeddings found.\n' +
        'Run extract-regulatory-claims and embed-concepts scripts first.',
    );
    process.exit(1);
  }

  // Apply limit if specified
  const claimsToProcess = limit ? claims.slice(0, limit) : claims;
  console.log(`Found ${claims.length} regulatory_claim concepts with embeddings`);
  if (limit && limit < claims.length) {
    console.log(`Processing first ${limit} (--limit applied)`);
  }

  // --- Step 2: Fetch acs_element concepts with embeddings (cache) ---
  console.log('Fetching acs_element concepts with embeddings...');

  const elements: ConceptWithEmbedding[] = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, slug, name, embedding')
      .eq('category', 'acs_element')
      .not('embedding', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching acs_element concepts:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    elements.push(...data.map((d: Record<string, unknown>) => ({
      ...d,
      embedding: parseEmbedding(d.embedding),
    } as ConceptWithEmbedding)));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (elements.length === 0) {
    console.error(
      'No acs_element concepts with embeddings found.\n' +
        'Run seed-elements, embed-concepts scripts first.',
    );
    process.exit(1);
  }

  console.log(`Cached ${elements.length} acs_element concepts with embeddings\n`);

  // --- Step 3 & 4: For each claim, find top-K similar ACS elements ---
  let totalEdgesCreated = 0;
  let totalSkippedBelowThreshold = 0;
  let totalSkippedDuplicate = 0;

  for (let i = 0; i < claimsToProcess.length; i++) {
    const claim = claimsToProcess[i];

    // Compute similarities against all ACS elements
    const scored: Array<{ element: ConceptWithEmbedding; similarity: number }> = [];

    for (const element of elements) {
      const sim = cosineSimilarity(claim.embedding, element.embedding);
      if (sim > SIMILARITY_THRESHOLD) {
        scored.push({ element, similarity: sim });
      }
    }

    // Sort by similarity descending, take top K
    scored.sort((a, b) => b.similarity - a.similarity);
    const topMatches = scored.slice(0, TOP_K);

    totalSkippedBelowThreshold += elements.length - scored.length;

    for (const match of topMatches) {
      if (dryRun) {
        totalEdgesCreated++;
        continue;
      }

      // Check if edge already exists (no unique constraint assumption)
      const { data: existing } = await supabase
        .from('concept_relations')
        .select('id')
        .eq('source_id', claim.id)
        .eq('target_id', match.element.id)
        .eq('relation_type', 'applies_in_scenario')
        .limit(1);

      if (existing && existing.length > 0) {
        totalSkippedDuplicate++;
        continue;
      }

      const { error: insertError } = await supabase.from('concept_relations').insert({
        source_id: claim.id,
        target_id: match.element.id,
        relation_type: 'applies_in_scenario',
        weight: match.similarity,
        confidence: match.similarity,
      });

      if (insertError) {
        console.error(
          `  Error inserting edge ${claim.slug} -> ${match.element.slug}:`,
          insertError.message,
        );
        continue;
      }
      totalEdgesCreated++;
    }

    // Progress reporting
    if ((i + 1) % PROGRESS_INTERVAL === 0 || i === claimsToProcess.length - 1) {
      const topMatch = topMatches[0];
      const topSim = topMatch ? topMatch.similarity.toFixed(3) : 'N/A';
      const topSlug = topMatch ? topMatch.element.slug : 'none';
      console.log(
        `  [${i + 1}/${claimsToProcess.length}] "${claim.slug}" ` +
          `-> top match: ${topSlug} (${topSim}), ` +
          `${topMatches.length} edges${dryRun ? ' (dry run)' : ''}`,
      );
    }
  }

  // --- Summary ---
  console.log(`\n============================`);
  console.log(`Claims processed:           ${claimsToProcess.length}`);
  console.log(`ACS elements cached:        ${elements.length}`);
  console.log(`Edges created:              ${totalEdgesCreated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Skipped (below threshold):  ${totalSkippedBelowThreshold} comparisons`);
  console.log(`Skipped (duplicate edges):  ${totalSkippedDuplicate}`);
  console.log(`Similarity threshold:       ${SIMILARITY_THRESHOLD}`);
  console.log(`Done!`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
