#!/usr/bin/env npx tsx
/**
 * attach_regulatory_claims_to_sections.ts — Direct-attach regulatory_claim
 * concepts to regulation section taxonomy nodes via CFR reference parsing.
 *
 * Phase 3 Step E (regulatory claims): Evidence-based attachment fails because
 * all evidence chunks are on knowledge:triage-unclassified, not regulations hub
 * nodes. This script bypasses evidence and directly parses CFR references from
 * each concept's name + key_facts + content, then creates is_component_of edges
 * to the matching regulation section (L3) or part (L2) taxonomy concept.
 *
 * Context: phase3_concept_taxonomy_attach:v1:cfr_parse
 *
 * Flags:
 *   --dry-run         Print plan but don't write to DB (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --limit N         Process at most N concepts
 *
 * Usage:
 *   npx tsx scripts/graph/attach_regulatory_claims_to_sections.ts
 *   npx tsx scripts/graph/attach_regulatory_claims_to_sections.ts --write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_regulatory_claims_to_sections.ts --write
 *
 * npm: npm run graph:attach:regulatory-claims
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { assertNotProduction } from '../../src/lib/app-env';
import { extractCfrSections, extractCfrParts } from '../taxonomy/expand_regulations_taxonomy';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const CONTEXT = 'phase3_concept_taxonomy_attach:v1:cfr_parse';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { dryRun: true, write: false, limit: 0 };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': flags.dryRun = true; flags.write = false; break;
      case '--write': flags.write = true; flags.dryRun = false; break;
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Paginated fetch
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

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  if (flags.write) {
    assertNotProduction();
  }

  console.log('\n=== Attach Regulatory Claims to Section Taxonomy Nodes ===');
  console.log(`Mode: ${flags.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  if (flags.limit > 0) console.log(`Limit: ${flags.limit}`);
  console.log(`Context: ${CONTEXT}\n`);

  // 1. Load regulation taxonomy concepts (section + part level)
  console.log('Loading regulation taxonomy concepts...');
  const taxConcepts = await fetchAll<{ id: string; slug: string; category: string }>(
    'concepts', 'id, slug, category',
  );

  const sectionSlugToId = new Map<string, string>(); // regulations:14cfr-part-91:sec-91-155 → id
  const partSlugToId = new Map<string, string>();     // regulations:14cfr-part-91 → id

  for (const c of taxConcepts) {
    if (c.slug.match(/^regulations:14cfr-part-\d+:sec-/)) {
      sectionSlugToId.set(c.slug, c.id);
    } else if (c.slug.match(/^regulations:14cfr-part-\d+$/) && c.category === 'taxonomy_node') {
      partSlugToId.set(c.slug, c.id);
    }
  }

  console.log(`  Section-level concepts (L3): ${sectionSlugToId.size}`);
  console.log(`  Part-level concepts (L2): ${partSlugToId.size}`);

  // 2. Load regulatory_claim concepts
  console.log('\nLoading regulatory_claim concepts...');
  const regClaims: Array<{
    id: string; name: string; slug: string;
    key_facts: string[] | null; content: string | null;
  }> = [];

  let claimOffset = 0;
  const maxClaims = flags.limit > 0 ? flags.limit : 100000;
  while (regClaims.length < maxClaims) {
    const fetchSize = Math.min(1000, maxClaims - regClaims.length);
    const { data, error } = await supabase
      .from('concepts')
      .select('id, name, slug, key_facts, content')
      .eq('category', 'regulatory_claim')
      .range(claimOffset, claimOffset + fetchSize - 1);
    if (error) { console.error('Error fetching claims:', error.message); break; }
    if (!data || data.length === 0) break;
    regClaims.push(...data);
    if (data.length < fetchSize) break;
    claimOffset += fetchSize;
  }

  console.log(`  Loaded: ${regClaims.length}`);

  // 3. Check which already have is_component_of edge to any taxonomy_node
  console.log('\nChecking existing attachments...');
  const existingEdges = await fetchAll<{ source_id: string }>(
    'concept_relations', 'source_id',
  );
  // We need to know which regulatory_claim concepts already have is_component_of to a taxonomy_node
  // Load ALL is_component_of edges and check target category
  const allComponentEdges: Array<{ source_id: string; target_id: string }> = [];
  let edgeOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('concept_relations')
      .select('source_id, target_id')
      .eq('relation_type', 'is_component_of')
      .range(edgeOffset, edgeOffset + 999);
    if (error) { console.error('Error:', error.message); break; }
    if (!data || data.length === 0) break;
    allComponentEdges.push(...data);
    if (data.length < 1000) break;
    edgeOffset += 1000;
  }

  // Build set of all taxonomy_node concept IDs
  const taxConceptIds = new Set<string>();
  for (const c of taxConcepts) {
    if (c.category === 'taxonomy_node') taxConceptIds.add(c.id);
  }

  // Find regulatory_claim concepts that already have is_component_of → taxonomy_node
  const alreadyAttached = new Set<string>();
  const claimIds = new Set(regClaims.map(c => c.id));
  for (const edge of allComponentEdges) {
    if (claimIds.has(edge.source_id) && taxConceptIds.has(edge.target_id)) {
      alreadyAttached.add(edge.source_id);
    }
  }

  const unattached = regClaims.filter(c => !alreadyAttached.has(c.id));
  console.log(`  Already attached: ${alreadyAttached.size}`);
  console.log(`  Unattached: ${unattached.length}`);

  // 4. Parse CFR references and create attachment plan
  console.log('\nParsing CFR references from unattached claims...');

  interface Attachment {
    source_id: string;
    target_id: string;
    target_slug: string;
    level: 'section' | 'part';
    confidence: number;
  }

  const attachments: Attachment[] = [];
  let matchedSection = 0;
  let matchedPart = 0;
  let noMatch = 0;
  const targetCounts = new Map<string, number>();

  for (const claim of unattached) {
    const text = [claim.name, ...(claim.key_facts || []), claim.content || ''].join(' ');

    // Try section-level match first
    const sections = extractCfrSections(text);
    let matched = false;

    if (sections.length > 0) {
      for (const ref of sections) {
        const sectionSlug = `regulations:14cfr-part-${ref.part}:sec-${ref.part}-${ref.section}`;
        const targetId = sectionSlugToId.get(sectionSlug);
        if (targetId) {
          attachments.push({
            source_id: claim.id,
            target_id: targetId,
            target_slug: sectionSlug,
            level: 'section',
            confidence: 0.95,
          });
          targetCounts.set(sectionSlug, (targetCounts.get(sectionSlug) || 0) + 1);
          matchedSection++;
          matched = true;
          break;
        }
      }

      // If section match failed (slug exists in taxonomy but not as concept), try part
      if (!matched) {
        for (const ref of sections) {
          const partSlug = `regulations:14cfr-part-${ref.part}`;
          const targetId = partSlugToId.get(partSlug);
          if (targetId) {
            attachments.push({
              source_id: claim.id,
              target_id: targetId,
              target_slug: partSlug,
              level: 'part',
              confidence: 0.8,
            });
            targetCounts.set(partSlug, (targetCounts.get(partSlug) || 0) + 1);
            matchedPart++;
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      // Try part-only references
      const parts = extractCfrParts(text);
      for (const part of parts) {
        const partSlug = `regulations:14cfr-part-${part}`;
        const targetId = partSlugToId.get(partSlug);
        if (targetId) {
          attachments.push({
            source_id: claim.id,
            target_id: targetId,
            target_slug: partSlug,
            level: 'part',
            confidence: 0.7,
          });
          targetCounts.set(partSlug, (targetCounts.get(partSlug) || 0) + 1);
          matchedPart++;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      noMatch++;
    }
  }

  // 5. Report
  console.log(`\n--- Attachment Plan ---`);
  console.log(`  Unattached regulatory_claims: ${unattached.length}`);
  console.log(`  Matched section-level (L3): ${matchedSection} (${(matchedSection / unattached.length * 100).toFixed(1)}%)`);
  console.log(`  Matched part-level (L2): ${matchedPart} (${(matchedPart / unattached.length * 100).toFixed(1)}%)`);
  console.log(`  No match: ${noMatch} (${(noMatch / unattached.length * 100).toFixed(1)}%)`);
  console.log(`  Total edges to create: ${attachments.length}`);

  // Top targets
  const topTargets = [...targetCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  console.log(`\n  Top 30 target nodes:`);
  for (const [slug, count] of topTargets) {
    console.log(`    ${slug}: ${count} claims`);
  }

  if (flags.dryRun) {
    console.log(`\n[DRY-RUN] Would create ${attachments.length} edges (context: ${CONTEXT})`);
    console.log('[DRY-RUN] Run with --write to execute.');
    return;
  }

  // 6. Write edges in batches
  console.log(`\nWriting ${attachments.length} edges...`);
  let written = 0;
  let errors = 0;

  const batches = chunk(attachments, 200);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const rows = batch.map(a => ({
      source_id: a.source_id,
      target_id: a.target_id,
      relation_type: 'is_component_of',
      weight: a.confidence,
      confidence: a.confidence,
      context: CONTEXT,
    }));

    const { data, error } = await supabase
      .from('concept_relations')
      .upsert(rows, { onConflict: 'source_id,target_id,relation_type' })
      .select('id');

    if (error) {
      console.error(`  ERROR batch ${i + 1}: ${error.message}`);
      errors += batch.length;
    } else if (data) {
      written += data.length;
    }

    if ((i + 1) % 5 === 0 || i + 1 === batches.length) {
      console.log(`  Batch ${i + 1}/${batches.length}: ${written} written so far`);
    }
  }

  console.log(`\n--- Write Results ---`);
  console.log(`  Edges created: ${written}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Still unattached: ${noMatch}`);
}

main().catch((err) => {
  console.error('Attach regulatory claims error:', err);
  process.exit(1);
});
