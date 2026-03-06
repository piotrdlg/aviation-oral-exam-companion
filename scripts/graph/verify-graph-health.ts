#!/usr/bin/env npx tsx
/**
 * verify-graph-health.ts -- Knowledge Graph Health Check
 *
 * Inspects the concepts, concept_relations, and concept_chunk_evidence
 * tables to verify data integrity and completeness.
 *
 * Usage:
 *   npx tsx scripts/verify-graph-health.ts
 *   npm run verify:graph
 *
 * Exit codes:
 *   0 = HEALTHY or NEEDS ATTENTION
 *   1 = CRITICAL (duplicate slugs or >50 concepts missing embeddings)
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
// Helpers
// ---------------------------------------------------------------------------

function pad(label: string, width: number): string {
  return label.padEnd(width, ' ');
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const CONCEPT_CATEGORIES = [
  'acs_area',
  'acs_task',
  'acs_element',
  'topic',
  'regulatory_claim',
  'definition',
  'procedure',
  'artifact',
] as const;

const RELATION_TYPES = [
  'is_component_of',
  'requires_knowledge_of',
  'leads_to_discussion_of',
  'contrasts_with',
  'mitigates_risk_of',
  'applies_in_scenario',
] as const;

async function countConceptsByCategory(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const cat of CONCEPT_CATEGORIES) {
    const { count, error } = await supabase
      .from('concepts')
      .select('id', { count: 'exact', head: true })
      .eq('category', cat);
    if (error) {
      console.error(`Error counting category ${cat}:`, error.message);
      counts[cat] = -1;
    } else {
      counts[cat] = count ?? 0;
    }
  }
  return counts;
}

async function countEdgesByType(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const rt of RELATION_TYPES) {
    const { count, error } = await supabase
      .from('concept_relations')
      .select('id', { count: 'exact', head: true })
      .eq('relation_type', rt);
    if (error) {
      console.error(`Error counting relation ${rt}:`, error.message);
      counts[rt] = -1;
    } else {
      counts[rt] = count ?? 0;
    }
  }
  return counts;
}

async function countEvidenceLinks(): Promise<number> {
  const { count, error } = await supabase
    .from('concept_chunk_evidence')
    .select('id', { count: 'exact', head: true });
  if (error) {
    console.error('Error counting evidence links:', error.message);
    return -1;
  }
  return count ?? 0;
}

async function conceptsWithoutEmbeddings(): Promise<{
  count: number;
  sample: Array<{ id: string; name: string; category: string }>;
}> {
  const { count, error: countErr } = await supabase
    .from('concepts')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  if (countErr) {
    console.error('Error counting concepts without embeddings:', countErr.message);
    return { count: -1, sample: [] };
  }

  const { data, error: fetchErr } = await supabase
    .from('concepts')
    .select('id, name, category')
    .is('embedding', null)
    .limit(10);

  if (fetchErr) {
    console.error('Error fetching sample concepts:', fetchErr.message);
    return { count: count ?? 0, sample: [] };
  }

  return { count: count ?? 0, sample: data ?? [] };
}

async function conceptsWithoutEvidence(): Promise<number> {
  // Get all concept IDs that DO have evidence
  const { data: withEvidence, error: evErr } = await supabase
    .from('concept_chunk_evidence')
    .select('concept_id');

  if (evErr) {
    console.error('Error fetching evidence concept IDs:', evErr.message);
    return -1;
  }

  const evidenceConceptIds = new Set((withEvidence ?? []).map((r) => r.concept_id));

  // Count total concepts
  const { count: totalCount, error: totalErr } = await supabase
    .from('concepts')
    .select('id', { count: 'exact', head: true });

  if (totalErr) {
    console.error('Error counting total concepts:', totalErr.message);
    return -1;
  }

  // Get all concept IDs and diff
  const { data: allConcepts, error: allErr } = await supabase
    .from('concepts')
    .select('id');

  if (allErr) {
    console.error('Error fetching all concept IDs:', allErr.message);
    return -1;
  }

  const without = (allConcepts ?? []).filter((c) => !evidenceConceptIds.has(c.id));
  return without.length;
}

async function orphanConcepts(): Promise<{
  count: number;
  sample: Array<{ id: string; name: string; category: string }>;
}> {
  // Get all concept IDs that appear in edges (source or target)
  const { data: sources, error: srcErr } = await supabase
    .from('concept_relations')
    .select('source_id');

  const { data: targets, error: tgtErr } = await supabase
    .from('concept_relations')
    .select('target_id');

  if (srcErr || tgtErr) {
    console.error('Error fetching edge participants');
    return { count: -1, sample: [] };
  }

  const connectedIds = new Set<string>();
  for (const r of sources ?? []) connectedIds.add(r.source_id);
  for (const r of targets ?? []) connectedIds.add(r.target_id);

  // Get all concepts
  const { data: allConcepts, error: allErr } = await supabase
    .from('concepts')
    .select('id, name, category');

  if (allErr) {
    console.error('Error fetching all concepts:', allErr.message);
    return { count: -1, sample: [] };
  }

  const orphans = (allConcepts ?? []).filter((c) => !connectedIds.has(c.id));
  return { count: orphans.length, sample: orphans.slice(0, 10) };
}

async function acsElementsWithNoExtraEdges(): Promise<{
  count: number;
  sample: Array<{ id: string; name: string }>;
}> {
  // Get all ACS element concepts
  const { data: elements, error: elemErr } = await supabase
    .from('concepts')
    .select('id, name')
    .eq('category', 'acs_element');

  if (elemErr) {
    console.error('Error fetching ACS elements:', elemErr.message);
    return { count: -1, sample: [] };
  }

  if (!elements || elements.length === 0) {
    return { count: 0, sample: [] };
  }

  // For each element, check if it has any outgoing edges beyond is_component_of
  const lacking: Array<{ id: string; name: string }> = [];

  for (const elem of elements) {
    const { count, error } = await supabase
      .from('concept_relations')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', elem.id)
      .neq('relation_type', 'is_component_of');

    if (error) {
      console.error(`Error checking edges for ${elem.name}:`, error.message);
      continue;
    }

    if ((count ?? 0) === 0) {
      lacking.push(elem);
    }
  }

  return { count: lacking.length, sample: lacking.slice(0, 10) };
}

async function findDuplicateSlugs(): Promise<{
  count: number;
  sample: Array<{ slug: string; occurrences: number }>;
}> {
  // Fetch all slugs and check for duplicates in memory
  const { data, error } = await supabase.from('concepts').select('slug');

  if (error) {
    console.error('Error fetching slugs:', error.message);
    return { count: -1, sample: [] };
  }

  const slugCounts = new Map<string, number>();
  for (const row of data ?? []) {
    slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
  }

  const duplicates: Array<{ slug: string; occurrences: number }> = [];
  slugCounts.forEach((count, slug) => {
    if (count > 1) {
      duplicates.push({ slug, occurrences: count });
    }
  });

  return { count: duplicates.length, sample: duplicates.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Knowledge Graph Health Check ===\n');

  // 1. Concepts by category
  const categoryCounts = await countConceptsByCategory();
  const totalConcepts = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  console.log('CONCEPTS BY CATEGORY:');
  for (const cat of CONCEPT_CATEGORIES) {
    console.log(`  ${pad(cat + ':', 22)} ${categoryCounts[cat]}`);
  }
  console.log(`  ${pad('TOTAL:', 22)} ${totalConcepts}`);

  // 2. Edges by relation type
  const edgeCounts = await countEdgesByType();
  const totalEdges = Object.values(edgeCounts).reduce((a, b) => a + b, 0);

  console.log('\nEDGES BY RELATION TYPE:');
  for (const rt of RELATION_TYPES) {
    console.log(`  ${pad(rt + ':', 30)} ${edgeCounts[rt]}`);
  }
  console.log(`  ${pad('TOTAL:', 30)} ${totalEdges}`);

  // 3. Evidence links
  const evidenceCount = await countEvidenceLinks();
  console.log(`\nEVIDENCE LINKS: ${evidenceCount}`);

  // 4-8. Warnings
  const noEmbeddings = await conceptsWithoutEmbeddings();
  const noEvidence = await conceptsWithoutEvidence();
  const orphans = await orphanConcepts();
  const noExtraEdges = await acsElementsWithNoExtraEdges();
  const dupSlugs = await findDuplicateSlugs();

  console.log('\nWARNINGS:');
  console.log(`  \u26A0 ${noEmbeddings.count} concepts without embeddings`);
  if (noEmbeddings.sample.length > 0) {
    for (const c of noEmbeddings.sample) {
      console.log(`    - [${c.category}] ${c.name}`);
    }
  }

  console.log(`  \u26A0 ${noEvidence} concepts without evidence links`);

  console.log(`  \u26A0 ${orphans.count} orphan concepts (no edges)`);
  if (orphans.sample.length > 0) {
    for (const c of orphans.sample) {
      console.log(`    - [${c.category}] ${c.name}`);
    }
  }

  console.log(`  \u26A0 ${noExtraEdges.count} ACS elements with no edges beyond is_component_of`);
  if (noExtraEdges.sample.length > 0) {
    for (const c of noExtraEdges.sample) {
      console.log(`    - ${c.name}`);
    }
  }

  console.log(`  \u26A0 ${dupSlugs.count} duplicate slugs found`);
  if (dupSlugs.sample.length > 0) {
    for (const d of dupSlugs.sample) {
      console.log(`    - "${d.slug}" (${d.occurrences}x)`);
    }
  }

  // Determine status
  const isCritical = dupSlugs.count > 0 || noEmbeddings.count > 50;
  const needsAttention = orphans.count > 50 || noEvidence > 100;

  let status: string;
  if (isCritical) {
    status = 'CRITICAL';
  } else if (needsAttention) {
    status = 'NEEDS ATTENTION';
  } else {
    status = 'HEALTHY';
  }

  console.log(`\nSTATUS: ${status}`);

  if (isCritical) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Health check error:', err);
  process.exit(1);
});
