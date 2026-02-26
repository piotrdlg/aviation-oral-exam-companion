#!/usr/bin/env npx tsx
/**
 * attach_concepts_to_taxonomy_from_evidence.ts
 *
 * Attaches existing ~22k concepts to taxonomy nodes via evidence-chunk
 * majority voting. For each concept, inspects its evidence chunks
 * (concept_chunk_evidence), looks up each chunk's taxonomy assignment
 * (kb_chunk_taxonomy), and votes on the best taxonomy node. Creates
 * is_component_of edges from each concept to the winning taxonomy
 * concept node.
 *
 * Flags:
 *   --dry-run        Print proposed edges but don't write (default)
 *   --write          Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *   --limit N        Process at most N concepts
 *   --category CAT   Only process concepts of this category
 *   --min-evidence N Minimum evidence chunks needed (default 1)
 *
 * Usage:
 *   npx tsx scripts/graph/attach_concepts_to_taxonomy_from_evidence.ts --dry-run
 *   npx tsx scripts/graph/attach_concepts_to_taxonomy_from_evidence.ts --dry-run --limit 100
 *   npx tsx scripts/graph/attach_concepts_to_taxonomy_from_evidence.ts --dry-run --category regulatory_claim
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_concepts_to_taxonomy_from_evidence.ts --write
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { assertNotProduction } from '../../src/lib/app-env';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { dryRun: true, write: false, limit: 0, category: '', minEvidence: 1, context: 'phase2_concept_taxonomy_attach:v1:evidence_vote' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': flags.dryRun = true; flags.write = false; break;
      case '--write': flags.write = true; flags.dryRun = false; break;
      case '--limit': flags.limit = parseInt(args[++i], 10); break;
      case '--category': flags.category = args[++i]; break;
      case '--min-evidence': flags.minEvidence = parseInt(args[++i], 10); break;
      case '--context': flags.context = args[++i]; break;
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConceptRow {
  id: string;
  slug: string;
  category: string;
}

interface EvidenceRow {
  concept_id: string;
  chunk_id: string;
  confidence: number;
}

interface ChunkTaxonomyRow {
  chunk_id: string;
  taxonomy_node_id: string;
  hub_slug: string;
}

interface TaxonomyNodeRow {
  id: string;
  slug: string;
  level: number;
}

interface VoteEntry {
  count: number;
  totalConfidence: number;
  level: number;
}

interface ProposedEdge {
  source_id: string;
  target_id: string;
  relation_type: 'is_component_of';
  weight: number;
  confidence: number;
  context: string;
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  console.log('\n=== Concept -> Taxonomy Attachment (Evidence Voting) ===');
  console.log(`Mode: ${flags.write ? 'WRITE' : 'DRY-RUN'}`);
  if (flags.limit > 0) console.log(`Limit: ${flags.limit}`);
  if (flags.category) console.log(`Category filter: ${flags.category}`);
  console.log(`Min evidence: ${flags.minEvidence}`);
  console.log(`Context: ${flags.context}`);

  if (flags.write) {
    assertNotProduction('attach-concepts-to-taxonomy-from-evidence', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn('WARNING: ALLOW_PROD_WRITE=1 -- production write override active!\n');
    }
  }

  // =========================================================================
  // Step 1: Load all data
  // =========================================================================
  console.log('\nLoading data...');

  const [concepts, evidenceRows, chunkTaxRows, taxonomyNodes] = await Promise.all([
    fetchAll<ConceptRow>('concepts', 'id, slug, category'),
    fetchAll<EvidenceRow>('concept_chunk_evidence', 'concept_id, chunk_id, confidence'),
    fetchAll<ChunkTaxonomyRow>('kb_chunk_taxonomy', 'chunk_id, taxonomy_node_id, hub_slug'),
    fetchAll<TaxonomyNodeRow>('kb_taxonomy_nodes', 'id, slug, level'),
  ]);

  console.log(`  Concepts: ${fmt(concepts.length)}`);
  console.log(`  Evidence links: ${fmt(evidenceRows.length)}`);
  console.log(`  Chunk taxonomy assignments: ${fmt(chunkTaxRows.length)}`);
  console.log(`  Taxonomy nodes: ${fmt(taxonomyNodes.length)}`);

  // =========================================================================
  // Step 2: Build indexes
  // =========================================================================

  // chunkToTaxonomy: Map<chunk_id, { taxonomy_node_id, taxonomy_slug, level, hub_slug }>
  const taxonomyNodeById = new Map<string, TaxonomyNodeRow>();
  for (const tn of taxonomyNodes) {
    taxonomyNodeById.set(tn.id, tn);
  }

  const chunkToTaxonomy = new Map<string, {
    taxonomy_node_id: string;
    taxonomy_slug: string;
    level: number;
    hub_slug: string;
  }>();
  for (const ct of chunkTaxRows) {
    const tn = taxonomyNodeById.get(ct.taxonomy_node_id);
    if (!tn) continue;
    chunkToTaxonomy.set(ct.chunk_id, {
      taxonomy_node_id: ct.taxonomy_node_id,
      taxonomy_slug: tn.slug,
      level: tn.level,
      hub_slug: ct.hub_slug,
    });
  }

  // taxonomySlugToConceptId: Map<taxonomy_slug, concept_id>
  // From concepts table: taxonomy_node category concepts + existing concepts with matching slugs
  const taxonomySlugToConceptId = new Map<string, string>();

  // First: concepts with category = 'taxonomy_node'
  for (const c of concepts) {
    if (c.category === 'taxonomy_node') {
      taxonomySlugToConceptId.set(c.slug, c.id);
    }
  }

  // Second: existing concepts whose slugs match taxonomy node slugs
  const taxonomyNodeSlugs = new Set(taxonomyNodes.map(tn => tn.slug));
  for (const c of concepts) {
    if (c.category !== 'taxonomy_node' && taxonomyNodeSlugs.has(c.slug)) {
      // Only set if not already claimed by a taxonomy_node concept
      if (!taxonomySlugToConceptId.has(c.slug)) {
        taxonomySlugToConceptId.set(c.slug, c.id);
      }
    }
  }

  console.log(`  Taxonomy slug -> concept ID mappings: ${fmt(taxonomySlugToConceptId.size)}`);

  // triageSlugs: Set of triage slugs to skip
  const triageSlugs = new Set<string>();
  for (const tn of taxonomyNodes) {
    if (tn.slug.includes('triage-unclassified')) {
      triageSlugs.add(tn.slug);
    }
  }
  console.log(`  Triage slugs to skip: ${triageSlugs.size}`);

  // Evidence index: concept_id -> array of { chunk_id, confidence }
  const evidenceByConceptId = new Map<string, Array<{ chunk_id: string; confidence: number }>>();
  for (const ev of evidenceRows) {
    let arr = evidenceByConceptId.get(ev.concept_id);
    if (!arr) {
      arr = [];
      evidenceByConceptId.set(ev.concept_id, arr);
    }
    arr.push({ chunk_id: ev.chunk_id, confidence: ev.confidence });
  }

  // Existing is_component_of edges to taxonomy_node concepts (to skip already attached)
  console.log('  Loading existing is_component_of edges...');
  const existingComponentEdges = await fetchAll<{ source_id: string; target_id: string }>(
    'concept_relations',
    'source_id, target_id',
  );

  // Build set of concept IDs that are taxonomy_node category
  const taxonomyNodeConceptIds = new Set<string>();
  for (const c of concepts) {
    if (c.category === 'taxonomy_node') {
      taxonomyNodeConceptIds.add(c.id);
    }
  }
  // Also include concepts that are targets in taxonomySlugToConceptId
  for (const cid of taxonomySlugToConceptId.values()) {
    taxonomyNodeConceptIds.add(cid);
  }

  // Set of source_ids that already have is_component_of edges to taxonomy node concepts
  // We need to load edges with relation_type filter for accuracy
  const existingComponentEdgesFiltered = await fetchAll<{ source_id: string; target_id: string; relation_type: string }>(
    'concept_relations',
    'source_id, target_id, relation_type',
  );

  const alreadyAttachedToTaxonomy = new Set<string>();
  for (const edge of existingComponentEdgesFiltered) {
    if (edge.relation_type === 'is_component_of' && taxonomyNodeConceptIds.has(edge.target_id)) {
      alreadyAttachedToTaxonomy.add(edge.source_id);
    }
  }
  console.log(`  Already attached to taxonomy: ${fmt(alreadyAttachedToTaxonomy.size)}`);

  // =========================================================================
  // Step 3: Filter concepts to process
  // =========================================================================

  let conceptsToProcess = concepts.filter(c => {
    // Skip taxonomy_node concepts (they ARE the taxonomy)
    if (c.category === 'taxonomy_node') return false;
    // Skip hub root concepts
    if (c.slug.startsWith('hub:')) return false;
    // Category filter
    if (flags.category && c.category !== flags.category) return false;
    return true;
  });

  if (flags.limit > 0) {
    conceptsToProcess = conceptsToProcess.slice(0, flags.limit);
  }

  // =========================================================================
  // Step 4: Process each concept — evidence voting
  // =========================================================================
  console.log(`\nProcessing concepts...`);

  const proposedEdges: ProposedEdge[] = [];
  let skippedTaxonomyNode = concepts.filter(c => c.category === 'taxonomy_node').length;
  let skippedHub = concepts.filter(c => c.slug.startsWith('hub:')).length;
  let skippedAlreadyAttached = 0;
  let unattachedNoEvidence = 0;
  let unattachedTriageOnly = 0;
  const attachedByCategory = new Map<string, number>();
  const unattachedByCategory = new Map<string, number>();
  const targetAttachmentCounts = new Map<string, { slug: string; count: number }>();

  const totalToProcess = conceptsToProcess.length;
  let lastProgress = 0;

  for (let idx = 0; idx < conceptsToProcess.length; idx++) {
    const concept = conceptsToProcess[idx];

    // Progress reporting at 10% intervals
    const pctDone = Math.floor(((idx + 1) / totalToProcess) * 10);
    if (pctDone > lastProgress) {
      lastProgress = pctDone;
      console.log(`  [${pctDone * 10}%] ${fmt(idx + 1)}/${fmt(totalToProcess)}`);
    }

    // Skip if already attached to a taxonomy node concept
    if (alreadyAttachedToTaxonomy.has(concept.id)) {
      skippedAlreadyAttached++;
      continue;
    }

    // a. Get all evidence chunk IDs for this concept
    const evidenceChunks = evidenceByConceptId.get(concept.id);
    if (!evidenceChunks || evidenceChunks.length < flags.minEvidence) {
      unattachedNoEvidence++;
      unattachedByCategory.set(concept.category, (unattachedByCategory.get(concept.category) || 0) + 1);
      continue;
    }

    // b-d. For each evidence chunk, look up taxonomy assignment and vote
    const votes = new Map<string, VoteEntry>();
    let totalVotes = 0;
    let allTriage = true;

    for (const ev of evidenceChunks) {
      const taxAssignment = chunkToTaxonomy.get(ev.chunk_id);
      if (!taxAssignment) continue; // chunk not classified

      const taxSlug = taxAssignment.taxonomy_slug;

      // c. Skip triage nodes
      if (triageSlugs.has(taxSlug)) continue;

      allTriage = false;
      totalVotes++;

      const existing = votes.get(taxSlug);
      if (existing) {
        existing.count++;
        existing.totalConfidence += ev.confidence;
        // Keep the deepest level seen
        if (taxAssignment.level > existing.level) {
          existing.level = taxAssignment.level;
        }
      } else {
        votes.set(taxSlug, {
          count: 1,
          totalConfidence: ev.confidence,
          level: taxAssignment.level,
        });
      }
    }

    // g. No non-triage evidence
    if (totalVotes === 0) {
      if (allTriage && evidenceChunks.length > 0) {
        unattachedTriageOnly++;
      } else {
        unattachedNoEvidence++;
      }
      unattachedByCategory.set(concept.category, (unattachedByCategory.get(concept.category) || 0) + 1);
      continue;
    }

    // e. Pick winner
    let winnerSlug: string | null = null;
    let winnerVote: VoteEntry | null = null;

    for (const [slug, vote] of votes) {
      if (!winnerVote) {
        winnerSlug = slug;
        winnerVote = vote;
        continue;
      }

      // Highest vote count wins
      if (vote.count > winnerVote.count) {
        winnerSlug = slug;
        winnerVote = vote;
      } else if (vote.count === winnerVote.count) {
        // Tie-break 1: prefer deeper node (L3 > L2 > L1)
        if (vote.level > winnerVote.level) {
          winnerSlug = slug;
          winnerVote = vote;
        } else if (vote.level === winnerVote.level) {
          // Tie-break 2: highest cumulative confidence sum
          if (vote.totalConfidence > winnerVote.totalConfidence) {
            winnerSlug = slug;
            winnerVote = vote;
          }
        }
      }
    }

    // f. If winner found and has a concept ID
    if (winnerSlug && winnerVote) {
      const winnerConceptId = taxonomySlugToConceptId.get(winnerSlug);
      if (!winnerConceptId) continue; // no concept node for this taxonomy slug

      // Prevent self-referencing edges (no_self_reference CHECK constraint)
      if (concept.id === winnerConceptId) continue;

      const weight = Math.min(winnerVote.count / totalVotes, 1.0);
      const avgConfidence = winnerVote.totalConfidence / winnerVote.count;

      proposedEdges.push({
        source_id: concept.id,
        target_id: winnerConceptId,
        relation_type: 'is_component_of',
        weight: Math.round(weight * 10000) / 10000, // 4 decimal places
        confidence: Math.round(avgConfidence * 10000) / 10000,
        context: flags.context,
      });

      // Track stats
      attachedByCategory.set(concept.category, (attachedByCategory.get(concept.category) || 0) + 1);

      const existing = targetAttachmentCounts.get(winnerConceptId);
      if (existing) {
        existing.count++;
      } else {
        targetAttachmentCounts.set(winnerConceptId, { slug: winnerSlug, count: 1 });
      }
    }
  }

  // Final progress
  if (lastProgress < 10) {
    console.log(`  [100%] ${fmt(totalToProcess)}/${fmt(totalToProcess)}`);
  }

  // =========================================================================
  // Step 5: Write edges (batch upserts of 200)
  // =========================================================================
  let writeErrors = 0;
  let writeSuccess = 0;

  if (flags.write && proposedEdges.length > 0) {
    console.log(`\nWriting ${fmt(proposedEdges.length)} edges to database...`);
    const batchSize = 200;

    for (let i = 0; i < proposedEdges.length; i += batchSize) {
      const batch = proposedEdges.slice(i, i + batchSize);

      const { error } = await supabase
        .from('concept_relations')
        .upsert(batch, { onConflict: 'source_id,target_id,relation_type' });

      if (error) {
        writeErrors++;
        if (writeErrors <= 5) {
          console.error(`  Batch error at offset ${i}: ${error.message}`);
        }
      } else {
        writeSuccess += batch.length;
      }

      // Progress every 1000
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= proposedEdges.length) {
        console.log(`  Written: ${fmt(Math.min(i + batchSize, proposedEdges.length))}/${fmt(proposedEdges.length)}`);
      }
    }

    console.log(`  Write complete: ${fmt(writeSuccess)} succeeded, ${writeErrors} batch errors`);
  }

  // =========================================================================
  // Step 6: Summary
  // =========================================================================
  const totalAttached = proposedEdges.length;
  const totalProcessed = totalToProcess;

  console.log('\nSummary:');
  console.log(`  Attached: ${fmt(totalAttached)} (${totalProcessed > 0 ? Math.round((totalAttached / totalProcessed) * 100) : 0}% of processed)`);
  console.log(`  Unattached (no evidence): ${fmt(unattachedNoEvidence)}`);
  console.log(`  Unattached (triage-only evidence): ${fmt(unattachedTriageOnly)}`);
  console.log(`  Skipped (taxonomy_node): ${fmt(skippedTaxonomyNode)}`);
  console.log(`  Skipped (hub root): ${fmt(skippedHub)}`);
  console.log(`  Skipped (already attached): ${fmt(skippedAlreadyAttached)}`);

  // Category breakdown
  console.log('\n  By category:');
  const allCategories = new Set([...attachedByCategory.keys(), ...unattachedByCategory.keys()]);
  for (const cat of [...allCategories].sort()) {
    const attached = attachedByCategory.get(cat) || 0;
    const unattached = unattachedByCategory.get(cat) || 0;
    console.log(`    ${cat}: ${fmt(attached)} attached, ${fmt(unattached)} unattached`);
  }

  // Top-30 target taxonomy nodes
  const sortedTargets = [...targetAttachmentCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  console.log('\nTop-30 target taxonomy nodes:');
  sortedTargets.forEach((t, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${t.slug} -- ${fmt(t.count)} concepts`);
  });

  // =========================================================================
  // Step 7: Write markdown report
  // =========================================================================
  const dateStr = new Date().toISOString().split('T')[0];
  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const categoryRows: string[] = [];
  for (const cat of [...allCategories].sort()) {
    const attached = attachedByCategory.get(cat) || 0;
    const unattached = unattachedByCategory.get(cat) || 0;
    categoryRows.push(`| ${cat} | ${fmt(attached)} | ${fmt(unattached)} |`);
  }

  const targetRows: string[] = [];
  sortedTargets.forEach((t, i) => {
    targetRows.push(`| ${i + 1} | ${t.slug} | ${fmt(t.count)} |`);
  });

  const md = [
    '---',
    `title: "Concept Taxonomy Attachment (Evidence Voting) -- ${dateStr}"`,
    `date: ${dateStr}`,
    'type: graph-report',
    'tags: [heydpe, knowledge-graph, taxonomy, evidence-voting, attachment]',
    '---',
    '',
    `# Concept -> Taxonomy Attachment (Evidence Voting) -- ${dateStr}`,
    '',
    `**Mode:** ${flags.write ? 'WRITE' : 'DRY-RUN'}`,
    flags.category ? `**Category filter:** ${flags.category}` : '',
    flags.limit > 0 ? `**Limit:** ${flags.limit}` : '',
    `**Min evidence:** ${flags.minEvidence}`,
    '',
    '## Data Loaded',
    '',
    '| Source | Count |',
    '|--------|-------|',
    `| Concepts | ${fmt(concepts.length)} |`,
    `| Evidence links | ${fmt(evidenceRows.length)} |`,
    `| Chunk taxonomy assignments | ${fmt(chunkTaxRows.length)} |`,
    `| Taxonomy nodes | ${fmt(taxonomyNodes.length)} |`,
    `| Taxonomy slug -> concept mappings | ${fmt(taxonomySlugToConceptId.size)} |`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Concepts processed | ${fmt(totalProcessed)} |`,
    `| Attached (new edges) | ${fmt(totalAttached)} |`,
    `| Unattached (no evidence) | ${fmt(unattachedNoEvidence)} |`,
    `| Unattached (triage-only) | ${fmt(unattachedTriageOnly)} |`,
    `| Skipped (taxonomy_node) | ${fmt(skippedTaxonomyNode)} |`,
    `| Skipped (hub root) | ${fmt(skippedHub)} |`,
    `| Skipped (already attached) | ${fmt(skippedAlreadyAttached)} |`,
    '',
    '## Breakdown by Category',
    '',
    '| Category | Attached | Unattached |',
    '|----------|----------|------------|',
    ...categoryRows,
    '',
    '## Top-30 Target Taxonomy Nodes',
    '',
    '| Rank | Taxonomy Slug | Concepts Attached |',
    '|------|---------------|-------------------|',
    ...targetRows,
    '',
    flags.write && writeErrors > 0 ? `## Write Errors\n\n${writeErrors} batch errors encountered during write.\n` : '',
    '*Generated by attach_concepts_to_taxonomy_from_evidence.ts*',
  ].filter(line => line !== undefined).join('\n');

  const reportPath = path.join(reportDir, `${dateStr}-concept-taxonomy-attachment.md`);
  fs.writeFileSync(reportPath, md);
  console.log(`\nReport: ${reportPath}`);

  if (!flags.write) {
    console.log('\nRun with --write to apply changes.');
    console.log('For production: ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_concepts_to_taxonomy_from_evidence.ts --write');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
