#!/usr/bin/env npx tsx
/**
 * verify-graph-e2e.ts -- Graph E2E Integration Test
 *
 * Simulates a mini exam flow by fetching concept bundles for 5 ACS elements
 * (one per area), formatting them, and verifying the resulting prompt fits
 * within Claude's context window.
 *
 * Usage:
 *   npx tsx scripts/verify-graph-e2e.ts
 *   npm run verify:graph-e2e
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (empty bundles or prompt exceeds limit)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BundleRow {
  concept_id: string;
  concept_name: string;
  concept_category: string;
  concept_content: string;
  key_facts: string[] | null;
  common_misconceptions: string[] | null;
  depth: number;
  relation_type: string | null;
  examiner_transition: string | null;
  evidence_chunks: Array<{
    chunk_id: string;
    content: string;
    doc_title: string;
    page_ref: string | null;
    confidence: number;
  }> | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Five ACS elements, one per area, for a representative test. */
const TEST_ELEMENTS = [
  'PA.I.A.K1',   // Area I: Preflight Preparation
  'PA.II.A.K1',  // Area II: Preflight Procedures
  'PA.III.A.K1', // Area III: Airport and Seaplane Base Operations
  'PA.VI.A.K1',  // Area VI: Navigation
  'PA.VII.A.K1', // Area VII: Slow Flight and Stalls
];

const TOKEN_LIMIT = 150_000;

// ---------------------------------------------------------------------------
// Bundle formatting (simplified version of graph-retrieval.ts)
// ---------------------------------------------------------------------------

function formatBundle(bundle: BundleRow[]): string {
  if (!bundle || bundle.length === 0) return '';

  const sections: string[] = [];

  const regulatoryClaims = bundle.filter((r) => r.concept_category === 'regulatory_claim');
  const topics = bundle.filter((r) => r.concept_category === 'topic');
  const definitions = bundle.filter((r) => r.concept_category === 'definition');
  const procedures = bundle.filter((r) => r.concept_category === 'procedure');

  // Collect misconceptions
  const allMisconceptions: string[] = [];
  for (const row of bundle) {
    if (row.common_misconceptions && Array.isArray(row.common_misconceptions)) {
      allMisconceptions.push(
        ...row.common_misconceptions.filter((m) => typeof m === 'string')
      );
    }
  }

  // Collect evidence citations
  const citations: string[] = [];
  for (const row of bundle) {
    if (row.evidence_chunks) {
      for (const chunk of row.evidence_chunks) {
        const ref = chunk.page_ref
          ? ` (${chunk.doc_title}, ${chunk.page_ref})`
          : ` (${chunk.doc_title})`;
        if (!citations.includes(ref)) citations.push(ref);
      }
    }
  }

  // Collect examiner transitions
  const transitions: string[] = [];
  for (const row of bundle) {
    if (row.examiner_transition && row.relation_type === 'leads_to_discussion_of') {
      transitions.push(row.examiner_transition);
    }
  }

  if (regulatoryClaims.length > 0) {
    sections.push('REGULATORY REQUIREMENTS:');
    for (const claim of regulatoryClaims) {
      sections.push(`- ${claim.concept_content}`);
    }
    sections.push('');
  }

  if (topics.length > 0 || definitions.length > 0 || procedures.length > 0) {
    sections.push('KEY CONCEPTS:');
    for (const concept of [...topics, ...definitions, ...procedures]) {
      sections.push(`- ${concept.concept_name}: ${concept.concept_content}`);
    }
    sections.push('');
  }

  if (allMisconceptions.length > 0) {
    sections.push('COMMON STUDENT ERRORS:');
    const unique = Array.from(new Set(allMisconceptions));
    for (const m of unique.slice(0, 10)) {
      sections.push(`- ${m}`);
    }
    sections.push('');
  }

  if (transitions.length > 0) {
    sections.push('SUGGESTED FOLLOW-UP DIRECTIONS:');
    for (const t of transitions.slice(0, 5)) {
      sections.push(`- ${t}`);
    }
    sections.push('');
  }

  if (citations.length > 0) {
    sections.push('REFERENCES:');
    for (const c of citations.slice(0, 10)) {
      sections.push(`- ${c}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Sample system prompt (simplified)
// ---------------------------------------------------------------------------

function buildSampleSystemPrompt(graphContext: string): string {
  const basePrompt = `You are a Designated Pilot Examiner (DPE) conducting an oral examination for a Private Pilot certificate. You follow the FAA Airman Certification Standards (ACS) to ask questions, assess answers, and naturally transition between topics.

CONDUCT GUIDELINES:
- Be professional but approachable
- Ask one question at a time
- Wait for the applicant's complete answer before assessing
- Use follow-up questions to probe deeper understanding
- Reference specific FARs, AIM sections, and advisory circulars
- If the applicant is struggling, use leading questions to guide them
- Track which ACS elements have been satisfactorily covered

CURRENT ACS TASK CONTEXT:
[Task details would be inserted here by the exam engine]

GRAPH-ENHANCED KNOWLEDGE CONTEXT:
${graphContext}

ASSESSMENT CRITERIA:
- Satisfactory: Demonstrates adequate knowledge per ACS standards
- Unsatisfactory: Fails to demonstrate required knowledge
- Partial: Shows some understanding but needs follow-up

Begin the examination by introducing yourself and asking your first question about the current ACS task.`;

  return basePrompt;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Graph E2E Integration Test ===\n');

  const results: Array<{
    element: string;
    bundleRows: number;
    uniqueConcepts: number;
    evidenceLinks: number;
    approxTokens: number;
    formattedText: string;
  }> = [];

  let allNonEmpty = true;

  for (const elementCode of TEST_ELEMENTS) {
    // Match runtime limit from src/lib/graph-retrieval.ts (maxRows=50)
    const { data, error } = await supabase.rpc('get_concept_bundle', {
      p_element_code: elementCode,
      p_max_depth: 2,
    }).limit(50);

    if (error) {
      console.error(`Error fetching bundle for ${elementCode}:`, error.message);
      results.push({
        element: elementCode,
        bundleRows: 0,
        uniqueConcepts: 0,
        evidenceLinks: 0,
        approxTokens: 0,
        formattedText: '',
      });
      allNonEmpty = false;
      continue;
    }

    const bundle: BundleRow[] = (data ?? []) as BundleRow[];

    if (bundle.length === 0) {
      allNonEmpty = false;
    }

    // Count unique concepts
    const uniqueConceptIds = new Set(bundle.map((r) => r.concept_id));

    // Count evidence links
    let evidenceCount = 0;
    for (const row of bundle) {
      if (row.evidence_chunks) {
        evidenceCount += row.evidence_chunks.length;
      }
    }

    const formatted = formatBundle(bundle);
    const tokens = estimateTokens(formatted);

    results.push({
      element: elementCode,
      bundleRows: bundle.length,
      uniqueConcepts: uniqueConceptIds.size,
      evidenceLinks: evidenceCount,
      approxTokens: tokens,
      formattedText: formatted,
    });
  }

  // Print individual results
  for (const r of results) {
    console.log(`Element ${r.element}:`);
    console.log(`  Bundle rows:     ${r.bundleRows}`);
    console.log(`  Unique concepts: ${r.uniqueConcepts}`);
    console.log(`  Evidence links:  ${r.evidenceLinks}`);
    console.log(`  Approx tokens:   ${r.approxTokens}`);
    console.log('');
  }

  // Build a sample system prompt with the largest bundle
  const largestBundle = results.reduce(
    (best, r) => (r.approxTokens > best.approxTokens ? r : best),
    results[0]
  );

  const samplePrompt = buildSampleSystemPrompt(largestBundle.formattedText);
  const basePromptTokens = estimateTokens(
    buildSampleSystemPrompt('')
  );
  const graphBundleTokens = largestBundle.approxTokens;
  const totalPromptTokens = estimateTokens(samplePrompt);
  const percentOfLimit = ((totalPromptTokens / TOKEN_LIMIT) * 100).toFixed(1);

  console.log('SYSTEM PROMPT SIZE (with graph context):');
  console.log(`  Base prompt:   ~${basePromptTokens} tokens`);
  console.log(`  Graph bundle:  ~${graphBundleTokens} tokens`);
  console.log(`  Total:         ~${totalPromptTokens} tokens (${percentOfLimit}% of 150k limit)`);

  const withinLimit = totalPromptTokens < TOKEN_LIMIT;

  // Result
  const pass = allNonEmpty && withinLimit;

  console.log(`\nRESULT: ${pass ? 'PASS' : 'FAIL'}`);

  if (allNonEmpty) {
    console.log('  \u2713 All 5 elements returned non-empty bundles');
  } else {
    const emptyElements = results
      .filter((r) => r.bundleRows === 0)
      .map((r) => r.element);
    console.log(`  \u2717 ${emptyElements.length} element(s) returned empty bundles: ${emptyElements.join(', ')}`);
  }

  if (withinLimit) {
    console.log('  \u2713 Prompt within token limit');
  } else {
    console.log('  \u2717 Prompt exceeds 150k token limit');
  }

  if (!pass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('E2E test error:', err);
  process.exit(1);
});
