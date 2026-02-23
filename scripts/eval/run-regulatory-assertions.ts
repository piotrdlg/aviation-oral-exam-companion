#!/usr/bin/env npx tsx
/**
 * Regulatory Assertion Evaluator
 *
 * Tests RAG retrieval quality against known regulatory claims.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 *
 * Usage: npx tsx scripts/eval/run-regulatory-assertions.ts [--with-filters]
 *
 * NOTE: This script calls real Supabase + OpenAI APIs. It is NOT a unit test.
 * It is an offline evaluation script for measuring RAG retrieval quality.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  resolveChunkAuthority,
  matchesAuthority,
  type DocMeta,
} from '../../src/lib/eval-helpers';
import { inferRagFilters as inferRagFiltersShared } from '../../src/lib/rag-filters';

// Load env from project root .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Assertion {
  id: string;
  claim: string;
  domain: string;
  expected_doc_type: string | null;
  must_contain_any: string[];
  expected_abbreviation: string | null;
}

interface ChunkResult {
  id: string;
  document_id: string;
  heading: string | null;
  content: string;
  page_start: number | null;
  page_end: number | null;
  doc_title: string;
  doc_abbreviation: string;
  score: number;
}

interface EvalResult {
  id: string;
  domain: string;
  claim: string;
  pass: boolean;
  reason: string;
  topScore: number;
  chunksReturned: number;
  matchedAbbrev?: string;
  matchedDocType?: string;
  matchedToken?: string;
}

// ---------------------------------------------------------------------------
// Inline implementations (scripts/ is excluded from tsconfig, so we can't
// import from src/ directly; we duplicate the minimal logic here)
// ---------------------------------------------------------------------------

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function searchChunks(
  query: string,
  options: {
    matchCount?: number;
    similarityThreshold?: number;
    filterDocType?: string | null;
    filterAbbreviation?: string | null;
  } = {}
): Promise<ChunkResult[]> {
  const {
    matchCount = 6,
    similarityThreshold = 0.3,
    filterDocType = null,
    filterAbbreviation = null,
  } = options;

  if (query.trim().length < 3) return [];

  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('chunk_hybrid_search', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
    filter_doc_type: filterDocType,
    filter_abbreviation: filterAbbreviation,
  });

  if (error) {
    console.error(`  [searchChunks] RPC error: ${error.message}`);
    return [];
  }

  return (data ?? []) as ChunkResult[];
}

// ---------------------------------------------------------------------------
// Metadata filter inference (mirrors src/lib/rag-filters.ts)
// ---------------------------------------------------------------------------

// Uses shared inferRagFilters from src/lib/rag-filters.ts (imported above).
// Thin wrapper: eval harness passes claim text as examinerQuestion.
function inferRagFilters(text: string) {
  return inferRagFiltersShared({ examinerQuestion: text });
}

// ---------------------------------------------------------------------------
// Evaluation logic (uses doc map for authority resolution)
// ---------------------------------------------------------------------------

function evaluateChunks(
  assertion: Assertion,
  chunks: ChunkResult[],
  docMap: Map<string, DocMeta>
): EvalResult {
  const topScore = chunks[0]?.score ?? 0;
  const chunksReturned = chunks.length;

  if (chunks.length === 0) {
    return {
      id: assertion.id,
      domain: assertion.domain,
      claim: assertion.claim,
      pass: false,
      reason: 'No chunks returned',
      topScore,
      chunksReturned,
    };
  }

  // Check authority match across all returned chunks using resolved doc_type
  let matchedAbbrev: string | undefined;
  let matchedDocType: string | undefined;
  let docMatchFound = false;
  let unmappedCount = 0;

  for (const chunk of chunks) {
    const resolved = resolveChunkAuthority(chunk, docMap);
    const result = matchesAuthority(assertion, resolved, chunk.document_id);

    if (result.unmappedDocumentId) unmappedCount++;

    if (result.matched) {
      docMatchFound = true;
      if (result.matchedField === 'abbreviation') matchedAbbrev = result.matchedValue ?? undefined;
      if (result.matchedField === 'doc_type') matchedDocType = result.matchedValue ?? undefined;
      break;
    }
  }

  // Check must_contain_any tokens across all chunk contents (case-insensitive)
  let matchedToken: string | undefined;
  const allContent = chunks.map((c) => c.content).join('\n').toLowerCase();

  for (const token of assertion.must_contain_any) {
    if (allContent.includes(token.toLowerCase())) {
      matchedToken = token;
      break;
    }
  }

  const pass = docMatchFound && matchedToken !== undefined;

  let reason: string;
  if (pass) {
    reason = `doc match (${matchedAbbrev ?? matchedDocType ?? 'any'}), token "${matchedToken}"`;
  } else if (!docMatchFound) {
    const resolvedTypes = chunks.map((c) => {
      const r = resolveChunkAuthority(c, docMap);
      return r.docType ?? c.doc_abbreviation;
    });
    const expected = assertion.expected_abbreviation ?? assertion.expected_doc_type ?? 'any';
    reason = `doc mismatch — expected ${expected}, got [${resolvedTypes.join(', ')}]`;
    if (unmappedCount > 0) reason += ` (${unmappedCount} unmapped)`;
  } else {
    reason = `no must_contain_any token found in chunks`;
  }

  return {
    id: assertion.id,
    domain: assertion.domain,
    claim: assertion.claim,
    pass,
    reason,
    topScore,
    chunksReturned,
    matchedAbbrev,
    matchedDocType,
    matchedToken,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printResultsTable(results: EvalResult[], label: string): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(80));

  const colWidths = { id: 16, domain: 20, pass: 5, score: 6, reason: 40 };

  const header = [
    'ID'.padEnd(colWidths.id),
    'Domain'.padEnd(colWidths.domain),
    'Pass'.padEnd(colWidths.pass),
    'Score'.padEnd(colWidths.score),
    'Reason',
  ].join('  ');

  console.log(header);
  console.log('-'.repeat(80));

  for (const r of results) {
    const pass = r.pass ? 'PASS' : 'FAIL';
    const row = [
      r.id.padEnd(colWidths.id),
      r.domain.slice(0, colWidths.domain).padEnd(colWidths.domain),
      pass.padEnd(colWidths.pass),
      r.topScore.toFixed(3).padEnd(colWidths.score),
      r.reason.slice(0, colWidths.reason),
    ].join('  ');
    console.log(row);
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const pct = ((passed / total) * 100).toFixed(1);

  console.log('-'.repeat(80));
  console.log(`  Passed: ${passed}/${total} (${pct}%)`);
  console.log('='.repeat(80));
}

function printComparisonTable(
  baseResults: EvalResult[],
  filteredResults: EvalResult[]
): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log('  Comparison: Baseline vs With-Filters');
  console.log('='.repeat(80));

  const colWidths = { id: 16, base: 6, filtered: 8, delta: 10 };
  const header = [
    'ID'.padEnd(colWidths.id),
    'Base'.padEnd(colWidths.base),
    'Filtered'.padEnd(colWidths.filtered),
    'Change',
  ].join('  ');

  console.log(header);
  console.log('-'.repeat(80));

  for (let i = 0; i < baseResults.length; i++) {
    const base = baseResults[i];
    const filt = filteredResults[i];
    const baseLabel = base.pass ? 'PASS' : 'FAIL';
    const filtLabel = filt.pass ? 'PASS' : 'FAIL';
    let delta = '  (same)';
    if (!base.pass && filt.pass) delta = '  +IMPROVED';
    if (base.pass && !filt.pass) delta = '  -REGRESSED';

    const row = [
      base.id.padEnd(colWidths.id),
      baseLabel.padEnd(colWidths.base),
      filtLabel.padEnd(colWidths.filtered),
      delta,
    ].join('  ');
    console.log(row);
  }

  const basePassed = baseResults.filter((r) => r.pass).length;
  const filtPassed = filteredResults.filter((r) => r.pass).length;
  const total = baseResults.length;

  console.log('-'.repeat(80));
  console.log(
    `  Baseline: ${basePassed}/${total}  |  With Filters: ${filtPassed}/${total}  |  Delta: ${filtPassed - basePassed > 0 ? '+' : ''}${filtPassed - basePassed}`
  );
  console.log('='.repeat(80));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const withFilters = process.argv.includes('--with-filters');

  // Validate environment
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    console.error('Load them from .env.local or export them before running.');
    process.exit(1);
  }

  // Load assertions
  const assertionsPath = path.resolve(__dirname, 'regulatory-assertions.json');
  if (!fs.existsSync(assertionsPath)) {
    console.error(`Assertions file not found: ${assertionsPath}`);
    process.exit(1);
  }
  const assertions: Assertion[] = JSON.parse(fs.readFileSync(assertionsPath, 'utf-8'));

  console.log(`\nRegulatory Assertion Evaluator`);
  console.log(`Assertions: ${assertions.length}`);
  console.log(`Mode: ${withFilters ? 'Baseline + With-Filters comparison' : 'Baseline only'}`);
  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log();

  // Load source_documents for authority resolution (avoids N+1 per chunk)
  console.log('Loading source_documents map...');
  const { data: docs, error: docsErr } = await supabase
    .from('source_documents')
    .select('id, document_type, abbreviation');

  if (docsErr) {
    console.error(`Failed to load source_documents: ${docsErr.message}`);
    process.exit(1);
  }

  const docMap = new Map<string, DocMeta>();
  for (const doc of docs ?? []) {
    docMap.set(doc.id, {
      documentType: doc.document_type,
      abbreviation: doc.abbreviation,
    });
  }
  console.log(`  Loaded ${docMap.size} source documents.`);
  console.log();

  // --- Baseline run (no filters) ---
  console.log('Running baseline (no metadata filters)...');
  const baseResults: EvalResult[] = [];

  for (const assertion of assertions) {
    process.stdout.write(`  [${assertion.id}] `);
    try {
      const chunks = await searchChunks(assertion.claim, {
        matchCount: 6,
        similarityThreshold: 0.3,
        filterDocType: null,
        filterAbbreviation: null,
      });
      const result = evaluateChunks(assertion, chunks, docMap);
      baseResults.push(result);
      console.log(result.pass ? 'PASS' : `FAIL — ${result.reason}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR — ${msg}`);
      baseResults.push({
        id: assertion.id,
        domain: assertion.domain,
        claim: assertion.claim,
        pass: false,
        reason: `Exception: ${msg}`,
        topScore: 0,
        chunksReturned: 0,
      });
    }
  }

  printResultsTable(baseResults, 'Baseline Results (no metadata filters)');

  if (!withFilters) {
    process.exit(0);
  }

  // --- With-Filters run ---
  console.log('\nRunning with metadata filtering...');
  const filteredResults: EvalResult[] = [];

  for (const assertion of assertions) {
    process.stdout.write(`  [${assertion.id}] `);
    try {
      const filterHint = inferRagFilters(assertion.claim);
      let chunks: ChunkResult[];

      if (filterHint) {
        // Pass 1: filtered
        chunks = await searchChunks(assertion.claim, {
          matchCount: 6,
          similarityThreshold: 0.3,
          filterDocType: filterHint.filterDocType ?? null,
          filterAbbreviation: filterHint.filterAbbreviation ?? null,
        });

        const MIN_RESULTS = 2;
        const MIN_TOP_SCORE = 0.4;

        // Fallback if filtered results are inadequate
        if (chunks.length < MIN_RESULTS || (chunks[0]?.score ?? 0) < MIN_TOP_SCORE) {
          const unfiltered = await searchChunks(assertion.claim, {
            matchCount: 6,
            similarityThreshold: 0.3,
          });
          const seen = new Set(chunks.map((c) => c.id));
          const merged = [...chunks];
          for (const chunk of unfiltered) {
            if (!seen.has(chunk.id)) merged.push(chunk);
          }
          chunks = merged.sort((a, b) => b.score - a.score).slice(0, 6);
          process.stdout.write('[fallback] ');
        } else {
          process.stdout.write('[filtered] ');
        }
      } else {
        // No filter inferred — plain search
        chunks = await searchChunks(assertion.claim, {
          matchCount: 6,
          similarityThreshold: 0.3,
        });
        process.stdout.write('[no-hint] ');
      }

      const result = evaluateChunks(assertion, chunks, docMap);
      filteredResults.push(result);
      console.log(result.pass ? 'PASS' : `FAIL — ${result.reason}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR — ${msg}`);
      filteredResults.push({
        id: assertion.id,
        domain: assertion.domain,
        claim: assertion.claim,
        pass: false,
        reason: `Exception: ${msg}`,
        topScore: 0,
        chunksReturned: 0,
      });
    }
  }

  printResultsTable(filteredResults, 'With-Filters Results (metadata filtering + fallback)');
  printComparisonTable(baseResults, filteredResults);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
