#!/usr/bin/env npx tsx
/**
 * infer-edges.ts — Infer knowledge graph edges between concepts.
 *
 * Three strategies for discovering relationships:
 *   A. LLM-based: Send concept batches to Claude for relationship inference
 *   B. Embedding similarity: Find concepts with high cosine similarity
 *   C. CFR cross-reference: Link topics/procedures to matching regulatory claims
 *
 * Usage:
 *   npx tsx scripts/infer-edges.ts                          # Run all strategies
 *   npx tsx scripts/infer-edges.ts --strategy llm           # LLM only
 *   npx tsx scripts/infer-edges.ts --strategy embedding     # Embedding similarity only
 *   npx tsx scripts/infer-edges.ts --strategy cfr           # CFR cross-reference only
 *   npx tsx scripts/infer-edges.ts --dry-run                # Preview without DB writes
 *   npx tsx scripts/infer-edges.ts --limit 50               # Limit concepts processed
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';
import { EDGE_INFERENCE_SYSTEM_PROMPT, EdgeInference } from './extraction-prompts';
import { batchArray } from './embed-concepts';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Extract CFR references from a text string.
 * Matches patterns like "14 CFR 91.155", "14 CFR 61.57(c)", "14 CFR §91.155(a)".
 * Returns deduplicated array of normalized references (without section symbols).
 */
export function extractCfrReferences(text: string): string[] {
  if (!text) return [];

  // Match "14 CFR" followed by optional "§" and a part.section pattern,
  // optionally followed by parenthetical subsections like (a), (a)(1), etc.
  const pattern = /14\s+CFR\s+§?\s*(\d+\.\d+(?:\([a-zA-Z0-9]+\))*)/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const normalized = `14 CFR ${match[1]}`;
    if (!matches.includes(normalized)) {
      matches.push(normalized);
    }
  }

  return matches;
}

/**
 * Parse an LLM response into EdgeInference objects.
 * Handles raw JSON arrays and markdown-fenced code blocks.
 * Filters out entries with missing required fields.
 */
export function parseEdgeResponse(text: string): EdgeInference[] {
  if (!text || text.trim().length === 0) return [];

  // Strip markdown code fences if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const REQUIRED_FIELDS = ['source_slug', 'target_slug', 'relation_type', 'weight', 'confidence'];

  return parsed.filter((item): item is EdgeInference => {
    if (typeof item !== 'object' || item === null) return false;
    for (const field of REQUIRED_FIELDS) {
      if (!(field in item) || item[field] === null || item[field] === undefined) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Build the user prompt for a batch of concepts to send to Claude
 * for edge inference. Truncates long content to keep within token limits.
 */
export function buildEdgeBatchPrompt(
  concepts: Array<{ slug: string; name: string; content: string; category: string }>,
): string {
  const MAX_CONTENT_LENGTH = 200;
  const lines: string[] = [
    'Analyze the following aviation concepts and identify meaningful relationships between them.',
    'Use the slug values as source_slug and target_slug in your response.',
    '',
    '---',
    '',
  ];

  for (const concept of concepts) {
    const truncatedContent =
      concept.content.length > MAX_CONTENT_LENGTH
        ? concept.content.slice(0, MAX_CONTENT_LENGTH) + '...'
        : concept.content;

    lines.push(`- **${concept.name}** [${concept.category}] (slug: ${concept.slug})`);
    lines.push(`  ${truncatedContent}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Identify all meaningful relationships between the concepts above.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConceptRow {
  id: string;
  name: string;
  slug: string;
  content: string;
  category: string;
  key_facts: string[] | null;
}

type Strategy = 'all' | 'llm' | 'embedding' | 'cfr';

interface EdgeInsert {
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number;
  examiner_transition: string | null;
  confidence: number;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { strategy: Strategy; dryRun: boolean; limit: number | null } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let strategy: Strategy = 'all';
  const strategyIdx = args.indexOf('--strategy');
  if (strategyIdx !== -1 && args[strategyIdx + 1]) {
    const val = args[strategyIdx + 1];
    if (['all', 'llm', 'embedding', 'cfr'].includes(val)) {
      strategy = val as Strategy;
    } else {
      console.error(`Invalid strategy: ${val}. Must be one of: all, llm, embedding, cfr`);
      process.exit(1);
    }
  }

  let limit: number | null = null;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    const parsed = parseInt(args[limitIdx + 1], 10);
    if (isNaN(parsed) || parsed <= 0) {
      console.error(`Invalid limit: ${args[limitIdx + 1]}. Must be a positive integer.`);
      process.exit(1);
    }
    limit = parsed;
  }

  return { strategy, dryRun, limit };
}

// ---------------------------------------------------------------------------
// Strategy A: LLM-based edge inference
// ---------------------------------------------------------------------------

async function runLlmStrategy(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  opts: { dryRun: boolean; limit: number | null },
): Promise<number> {
  console.log('\n--- Strategy A: LLM-based Edge Inference ---');

  const ELIGIBLE_CATEGORIES = ['topic', 'definition', 'procedure', 'regulatory_claim'];
  const BATCH_SIZE = 20;

  // Fetch eligible concepts
  let query = supabase
    .from('concepts')
    .select('id, name, slug, content, category, key_facts')
    .in('category', ELIGIBLE_CATEGORIES)
    .order('name');

  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data: concepts, error: fetchError } = await query;

  if (fetchError) {
    console.error('Error fetching concepts:', fetchError.message);
    return 0;
  }

  if (!concepts || concepts.length === 0) {
    console.log('No eligible concepts found for LLM inference.');
    return 0;
  }

  console.log(`Found ${concepts.length} eligible concepts`);

  // Build a slug -> id lookup map
  const slugToId = new Map<string, string>();
  for (const c of concepts) {
    slugToId.set(c.slug, c.id);
  }

  const batches = batchArray(concepts as ConceptRow[], BATCH_SIZE);
  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} concepts`);

  let totalEdges = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nBatch ${i + 1}/${batches.length} (${batch.length} concepts)...`);

    const userPrompt = buildEdgeBatchPrompt(batch);

    if (opts.dryRun) {
      console.log(`  [DRY RUN] Would send ${batch.length} concepts to Claude`);
      console.log(`  Sample concepts: ${batch.slice(0, 3).map((c) => c.name).join(', ')}...`);
      continue;
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: EDGE_INFERENCE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const responseText =
        response.content[0].type === 'text' ? response.content[0].text : '';
      const edges = parseEdgeResponse(responseText);

      console.log(`  Parsed ${edges.length} edges from response`);

      // Insert edges
      let batchInserted = 0;
      for (const edge of edges) {
        const sourceId = slugToId.get(edge.source_slug);
        const targetId = slugToId.get(edge.target_slug);

        if (!sourceId || !targetId) {
          continue; // Skip edges referencing unknown slugs
        }

        if (sourceId === targetId) {
          continue; // Skip self-references
        }

        const { error: insertError } = await supabase
          .from('concept_relations')
          .upsert(
            {
              source_id: sourceId,
              target_id: targetId,
              relation_type: edge.relation_type,
              weight: edge.weight,
              examiner_transition: edge.examiner_transition,
              confidence: edge.confidence,
            },
            { onConflict: 'source_id,target_id,relation_type' },
          );

        if (insertError) {
          // ON CONFLICT DO NOTHING equivalent — skip duplicates silently
          if (!insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
            console.warn(`  Insert error: ${insertError.message}`);
          }
        } else {
          batchInserted++;
        }
      }

      totalEdges += batchInserted;
      console.log(`  Inserted ${batchInserted} new edges`);
    } catch (err) {
      console.error(`  LLM ERROR: ${err}`);
    }

    // Small delay between batches to respect rate limits
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return totalEdges;
}

// ---------------------------------------------------------------------------
// Strategy B: Embedding similarity
// ---------------------------------------------------------------------------

/** Parse embedding from Supabase (may arrive as string or number[]). */
function parseEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

/** Compute cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface ConceptWithEmbedding {
  id: string;
  slug: string;
  name: string;
  category: string;
  embedding: number[];
}

async function runEmbeddingStrategy(
  supabase: ReturnType<typeof createClient>,
  opts: { dryRun: boolean; limit: number | null },
): Promise<number> {
  console.log('\n--- Strategy B: Embedding Similarity ---');

  const SIMILARITY_THRESHOLD = 0.75;
  const TOP_K = 3;
  const TARGET_CATEGORIES = ['topic', 'definition', 'procedure'];
  const PAGE_SIZE = 1000;

  // Fetch topic/definition/procedure concepts with embeddings (sources)
  const sources: ConceptWithEmbedding[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, slug, name, category, embedding')
      .in('category', TARGET_CATEGORIES)
      .not('embedding', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error fetching sources:', error.message); return 0; }
    if (!data || data.length === 0) break;
    sources.push(...data.map((d: Record<string, unknown>) => ({
      ...d,
      embedding: parseEmbedding(d.embedding),
    } as ConceptWithEmbedding)));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Apply limit
  const eligible = opts.limit ? sources.slice(0, opts.limit) : sources;
  console.log(`Found ${eligible.length} topic/definition/procedure concepts with embeddings`);

  if (opts.dryRun) {
    console.log(`[DRY RUN] Would compute pairwise similarity for ${eligible.length} concepts`);
    console.log(`  Threshold: ${SIMILARITY_THRESHOLD}, Top K: ${TOP_K}`);
    return 0;
  }

  // Compute pairwise cosine similarity and create edges for top matches
  let totalEdges = 0;
  const PROGRESS_INTERVAL = 50;

  for (let i = 0; i < eligible.length; i++) {
    const concept = eligible[i];

    if ((i + 1) % PROGRESS_INTERVAL === 0 || i === eligible.length - 1) {
      console.log(`  Processing ${i + 1}/${eligible.length}... (${totalEdges} edges so far)`);
    }

    // Find top-K similar concepts above threshold
    const scored: Array<{ target: ConceptWithEmbedding; similarity: number }> = [];
    for (let j = 0; j < eligible.length; j++) {
      if (i === j) continue;
      const sim = cosineSimilarity(concept.embedding, eligible[j].embedding);
      if (sim >= SIMILARITY_THRESHOLD) {
        scored.push({ target: eligible[j], similarity: sim });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    const topMatches = scored.slice(0, TOP_K);

    for (const match of topMatches) {
      const { error: insertError } = await supabase
        .from('concept_relations')
        .upsert(
          {
            source_id: concept.id,
            target_id: match.target.id,
            relation_type: 'leads_to_discussion_of',
            weight: match.similarity,
            examiner_transition: null,
            confidence: match.similarity,
          },
          { onConflict: 'source_id,target_id,relation_type' },
        );

      if (!insertError) {
        totalEdges++;
      }
    }
  }

  return totalEdges;
}

// ---------------------------------------------------------------------------
// Strategy C: CFR cross-reference
// ---------------------------------------------------------------------------

async function runCfrStrategy(
  supabase: ReturnType<typeof createClient>,
  opts: { dryRun: boolean; limit: number | null },
): Promise<number> {
  console.log('\n--- Strategy C: CFR Cross-Reference ---');

  const ELIGIBLE_CATEGORIES = ['topic', 'definition', 'procedure'];

  // Fetch non-regulatory concepts that might reference CFRs
  let query = supabase
    .from('concepts')
    .select('id, name, slug, content, category, key_facts')
    .in('category', ELIGIBLE_CATEGORIES)
    .order('name');

  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data: concepts, error: fetchError } = await query;

  if (fetchError) {
    console.error('Error fetching concepts:', fetchError.message);
    return 0;
  }

  if (!concepts || concepts.length === 0) {
    console.log('No eligible concepts found for CFR cross-referencing.');
    return 0;
  }

  // Fetch all regulatory_claim concepts for matching
  const { data: claims, error: claimsError } = await supabase
    .from('concepts')
    .select('id, name, slug, content, key_facts')
    .eq('category', 'regulatory_claim');

  if (claimsError) {
    console.error('Error fetching regulatory claims:', claimsError.message);
    return 0;
  }

  if (!claims || claims.length === 0) {
    console.log('No regulatory_claim concepts found. Run extract-regulatory-claims first.');
    return 0;
  }

  console.log(`Found ${concepts.length} eligible concepts and ${claims.length} regulatory claims`);

  // Build a map of CFR reference -> claim concept IDs
  // Regulatory claims store their CFR reference in the content or key_facts
  const cfrToClaimIds = new Map<string, string[]>();
  for (const claim of claims) {
    const textToSearch = [
      claim.content || '',
      ...(claim.key_facts || []),
      claim.name || '',
    ].join(' ');

    const refs = extractCfrReferences(textToSearch);
    for (const ref of refs) {
      // Normalize to just the part.section (e.g., "91.155")
      const partSection = ref.replace('14 CFR ', '');
      if (!cfrToClaimIds.has(partSection)) {
        cfrToClaimIds.set(partSection, []);
      }
      cfrToClaimIds.get(partSection)!.push(claim.id);
    }
  }

  console.log(`Indexed ${cfrToClaimIds.size} unique CFR references from regulatory claims`);

  if (opts.dryRun) {
    console.log(`[DRY RUN] Would check ${concepts.length} concepts for CFR references`);

    let conceptsWithRefs = 0;
    for (const concept of concepts) {
      const textToSearch = [
        concept.content || '',
        ...(concept.key_facts || []),
      ].join(' ');
      const refs = extractCfrReferences(textToSearch);
      if (refs.length > 0) {
        conceptsWithRefs++;
        if (conceptsWithRefs <= 5) {
          console.log(`  ${concept.name}: ${refs.join(', ')}`);
        }
      }
    }
    console.log(`  ${conceptsWithRefs} concepts have CFR references`);
    return 0;
  }

  let totalEdges = 0;

  for (const concept of concepts) {
    const textToSearch = [
      concept.content || '',
      ...(concept.key_facts || []),
    ].join(' ');

    const refs = extractCfrReferences(textToSearch);

    for (const ref of refs) {
      const partSection = ref.replace('14 CFR ', '');
      const claimIds = cfrToClaimIds.get(partSection);

      if (!claimIds) continue;

      for (const claimId of claimIds) {
        if (claimId === concept.id) continue; // Skip self-reference

        const { error: insertError } = await supabase
          .from('concept_relations')
          .upsert(
            {
              source_id: claimId,
              target_id: concept.id,
              relation_type: 'applies_in_scenario',
              weight: 0.8,
              examiner_transition: null,
              confidence: 0.9,
            },
            { onConflict: 'source_id,target_id,relation_type' },
          );

        if (!insertError) {
          totalEdges++;
        }
      }
    }
  }

  return totalEdges;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

  // --- Environment safety guard ---
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('infer-edges', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
  }

  const { strategy, dryRun, limit } = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic();

  console.log(`\nInfer Edges Pipeline`);
  console.log(`====================`);
  console.log(`Strategy: ${strategy}`);
  console.log(`Mode:     ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  if (limit) {
    console.log(`Limit:    ${limit} concepts per strategy`);
  }

  const results: Record<string, number> = {};

  // Run selected strategies
  if (strategy === 'all' || strategy === 'llm') {
    if (!process.env.ANTHROPIC_API_KEY && !dryRun) {
      console.warn('WARNING: ANTHROPIC_API_KEY not set — skipping LLM strategy');
    } else {
      results.llm = await runLlmStrategy(supabase, anthropic, { dryRun, limit });
    }
  }

  if (strategy === 'all' || strategy === 'embedding') {
    results.embedding = await runEmbeddingStrategy(supabase, { dryRun, limit });
  }

  if (strategy === 'all' || strategy === 'cfr') {
    results.cfr = await runCfrStrategy(supabase, { dryRun, limit });
  }

  // --- Summary ---
  console.log(`\n====================`);
  console.log(`Results:`);
  for (const [name, count] of Object.entries(results)) {
    console.log(`  ${name}: ${count} edges inserted`);
  }
  const totalEdges = Object.values(results).reduce((sum, n) => sum + n, 0);
  console.log(`  TOTAL: ${totalEdges} edges`);
  console.log(`Done!`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
