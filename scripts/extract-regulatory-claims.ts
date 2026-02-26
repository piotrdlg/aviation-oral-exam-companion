#!/usr/bin/env npx tsx
/**
 * extract-regulatory-claims.ts — Extract atomic regulatory requirements from
 * CFR and AIM source chunks using Claude.
 *
 * Reads source_chunks belonging to CFR and AIM documents, sends each chunk
 * to Claude for regulatory claim extraction, and upserts the results into
 * the concepts table with concept_chunk_evidence links.
 *
 * Usage:
 *   npx tsx scripts/extract-regulatory-claims.ts
 *   npx tsx scripts/extract-regulatory-claims.ts --dry-run
 *   npx tsx scripts/extract-regulatory-claims.ts --limit 10
 *   npx tsx scripts/extract-regulatory-claims.ts --dry-run --limit 5
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';
import {
  REGULATORY_CLAIM_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  RegulatoryClaimExtraction,
} from './extraction-prompts';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Normalize a CFR reference string for use in slugs.
 * Lowercases, replaces spaces with underscores, strips section signs.
 *
 * Examples:
 *   "14 CFR 91.155"     -> "14_cfr_91.155"
 *   "14 CFR §91.155(a)" -> "14_cfr_91.155(a)"
 */
export function normalizeCfrReference(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/§/g, '')
    .replace(/\s+/g, '_');
}

/**
 * Generate a deterministic slug for a regulatory claim concept.
 *
 * Format:
 *   - With CFR reference: `regulatory_claim:{cfr_ref_normalized}:{conditions_hash_8}`
 *   - Without CFR reference: `regulatory_claim:unref:{claim_text_hash_8}`
 */
export function generateClaimSlug(claim: RegulatoryClaimExtraction): string {
  if (claim.cfr_reference) {
    const normalized = normalizeCfrReference(claim.cfr_reference);
    const conditionsHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(claim.conditions))
      .digest('hex')
      .slice(0, 8);
    return `regulatory_claim:${normalized}:${conditionsHash}`;
  }

  const textHash = crypto
    .createHash('sha256')
    .update(claim.claim_text)
    .digest('hex')
    .slice(0, 8);
  return `regulatory_claim:unref:${textHash}`;
}

/**
 * Parse the LLM response text into an array of RegulatoryClaimExtraction objects.
 * Handles raw JSON arrays, markdown-fenced JSON, and invalid responses.
 * Filters out claims missing required fields (claim_text, domain).
 */
export function parseClaimsResponse(text: string): RegulatoryClaimExtraction[] {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
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

  // Filter and validate required fields
  return parsed.filter(
    (item): item is RegulatoryClaimExtraction =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.claim_text === 'string' &&
      item.claim_text.length > 0 &&
      typeof item.domain === 'string' &&
      item.domain.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceDocRow {
  id: string;
  title: string;
  abbreviation: string;
}

interface SourceChunkRow {
  id: string;
  document_id: string;
  heading: string | null;
  content: string;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

  // --- Environment safety guard ---
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('extract-regulatory-claims', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
  }

  // --- Parse CLI flags ---
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

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
  const anthropic = dryRun ? null : new Anthropic();

  console.log(`\nExtract Regulatory Claims Pipeline`);
  console.log(`===================================`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no API calls, no DB writes)' : 'LIVE'}`);
  if (limit) console.log(`Limit: first ${limit} chunks`);
  console.log('');

  // --- Step 1: Fetch CFR and AIM source documents ---
  const { data: docs, error: docError } = await supabase
    .from('source_documents')
    .select('id, title, abbreviation')
    .in('abbreviation', ['cfr', 'aim']);

  if (docError) {
    console.error('Error fetching source documents:', docError.message);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log('No CFR or AIM documents found in source_documents. Run ingest-sources first.');
    process.exit(0);
  }

  const docMap = new Map<string, SourceDocRow>();
  for (const doc of docs as SourceDocRow[]) {
    docMap.set(doc.id, doc);
  }

  const docIds = docs.map((d) => d.id);
  console.log(`Found ${docs.length} CFR/AIM documents`);

  // --- Step 2: Fetch all chunks for those documents ---
  // Paginate to handle large result sets
  const allChunks: SourceChunkRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: chunkPage, error: chunkError } = await supabase
      .from('source_chunks')
      .select('id, document_id, heading, content')
      .in('document_id', docIds)
      .order('document_id')
      .order('chunk_index')
      .range(offset, offset + pageSize - 1);

    if (chunkError) {
      console.error('Error fetching source chunks:', chunkError.message);
      process.exit(1);
    }

    if (!chunkPage || chunkPage.length === 0) break;
    allChunks.push(...(chunkPage as SourceChunkRow[]));
    if (chunkPage.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Found ${allChunks.length} source chunks across those documents`);

  // Apply limit if specified
  const chunksToProcess = limit ? allChunks.slice(0, limit) : allChunks;
  if (limit && limit < allChunks.length) {
    console.log(`Processing first ${limit} chunks only (--limit flag)`);
  }

  // --- Step 3: Process chunks serially ---
  let totalClaimsExtracted = 0;
  let totalChunksProcessed = 0;
  let totalChunksSkipped = 0;
  let totalErrors = 0;

  // Per-document stats
  const docStats = new Map<string, { title: string; chunks: number; claims: number }>();

  for (let i = 0; i < chunksToProcess.length; i++) {
    const chunk = chunksToProcess[i];
    const doc = docMap.get(chunk.document_id);
    const docTitle = doc?.title ?? 'Unknown';
    const docAbbrev = doc?.abbreviation ?? 'unknown';

    // Initialize doc stats
    if (!docStats.has(chunk.document_id)) {
      docStats.set(chunk.document_id, { title: docTitle, chunks: 0, claims: 0 });
    }

    if (dryRun) {
      // In dry run, just count chunks
      docStats.get(chunk.document_id)!.chunks++;
      totalChunksProcessed++;
      continue;
    }

    // Call Claude for claim extraction
    let claims: RegulatoryClaimExtraction[];
    try {
      const userPrompt = buildExtractionUserPrompt(
        chunk.content,
        chunk.heading,
        docAbbrev,
      );

      const response = await anthropic!.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: REGULATORY_CLAIM_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const responseText =
        response.content[0].type === 'text' ? response.content[0].text : '';
      claims = parseClaimsResponse(responseText);
    } catch (err) {
      console.error(`  ERROR processing chunk ${chunk.id}: ${err}`);
      totalErrors++;
      continue;
    }

    // Upsert each claim into concepts + create evidence link
    for (const claim of claims) {
      const slug = generateClaimSlug(claim);
      const name = claim.claim_text.length > 200
        ? claim.claim_text.slice(0, 200)
        : claim.claim_text;

      const conceptRow = {
        name,
        slug,
        name_normalized: name.toLowerCase(),
        aliases: [] as string[],
        category: 'regulatory_claim',
        content: claim.claim_text,
        key_facts: [
          claim.cfr_reference,
          claim.domain,
          JSON.stringify(claim.conditions),
          JSON.stringify(claim.numeric_values),
        ].filter(Boolean) as string[],
        common_misconceptions: [] as string[],
        embedding: null,
        embedding_model: 'text-embedding-3-small',
        embedding_dim: 1536,
        embedding_status: 'stale',
        validation_status: 'pending',
      };

      // Upsert concept (idempotent on slug)
      const { data: upsertedConcept, error: conceptError } = await supabase
        .from('concepts')
        .upsert(conceptRow, { onConflict: 'slug' })
        .select('id')
        .single();

      if (conceptError) {
        console.error(`  ERROR upserting concept "${slug}": ${conceptError.message}`);
        totalErrors++;
        continue;
      }

      // Create evidence link
      const evidenceRow = {
        concept_id: upsertedConcept.id,
        chunk_id: chunk.id,
        evidence_type: 'primary',
        created_by: 'pipeline:extract-claims',
      };

      const { error: evidenceError } = await supabase
        .from('concept_chunk_evidence')
        .upsert(evidenceRow, { onConflict: 'concept_id,chunk_id,evidence_type' });

      if (evidenceError) {
        console.error(`  ERROR creating evidence link for "${slug}": ${evidenceError.message}`);
        totalErrors++;
      }
    }

    docStats.get(chunk.document_id)!.chunks++;
    docStats.get(chunk.document_id)!.claims += claims.length;
    totalClaimsExtracted += claims.length;
    totalChunksProcessed++;

    // Progress reporting every 10 chunks
    if ((i + 1) % 10 === 0 || i === chunksToProcess.length - 1) {
      console.log(
        `  [${i + 1}/${chunksToProcess.length}] ${docTitle} — ` +
          `${claims.length} claims from chunk ${chunk.id.slice(0, 8)}...`,
      );
    }
  }

  // --- Per-document stats ---
  console.log('\n--- Per-Document Stats ---');
  for (const [, stats] of docStats) {
    console.log(`  ${stats.title}: ${stats.chunks} chunks, ${stats.claims} claims`);
  }

  // --- Final summary ---
  console.log('\n===================================');
  console.log(`Mode:                 ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Chunks processed:     ${totalChunksProcessed}`);
  console.log(`Chunks skipped:       ${totalChunksSkipped}`);
  console.log(`Claims extracted:     ${totalClaimsExtracted}`);
  console.log(`Errors:               ${totalErrors}`);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
