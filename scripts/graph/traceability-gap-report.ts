#!/usr/bin/env npx tsx
/**
 * traceability-gap-report.ts — Diagnose why concepts are untraceable
 *
 * Read-only script. Identifies untraceable concepts and diagnoses:
 * - Do they have evidence in concept_chunk_evidence?
 * - If yes, are evidence chunks on triage taxonomy nodes?
 * - Do they have parseable CFR/AC/NOTAM references in key_facts/name?
 * - For artifacts: what slug/name patterns exist?
 *
 * Usage:
 *   npx tsx scripts/graph/traceability-gap-report.ts
 *   npm run graph:traceability:gaps
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// Paginated fetch helper
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
// CFR reference extraction (reusable pattern)
// ---------------------------------------------------------------------------

const CFR_SECTION_REGEX = /(?:14\s*CFR|§|[Ss]ec(?:tion)?\.?\s*)\s*(\d{1,3})\.(\d{1,4})(?:\(([a-z])\))?/g;
const CFR_PART_REGEX = /(?:14\s*CFR|[Pp]art)\s+(\d{1,3})\b/g;
const AC_REGEX = /\bAC\s+(\d{1,3}[-.][\d.]+[A-Z]?)\b/gi;
const NOTAM_REGEX = /\bNOTAM\b/gi;

function extractCFRReferences(text: string): { parts: Set<number>; sections: Set<string>; acs: Set<string>; hasNotam: boolean } {
  const parts = new Set<number>();
  const sections = new Set<string>();
  const acs = new Set<string>();

  let m: RegExpExecArray | null;

  // Reset regex state
  CFR_SECTION_REGEX.lastIndex = 0;
  while ((m = CFR_SECTION_REGEX.exec(text)) !== null) {
    const part = parseInt(m[1], 10);
    const sec = m[2];
    parts.add(part);
    sections.add(`${part}.${sec}`);
  }

  CFR_PART_REGEX.lastIndex = 0;
  while ((m = CFR_PART_REGEX.exec(text)) !== null) {
    parts.add(parseInt(m[1], 10));
  }

  AC_REGEX.lastIndex = 0;
  while ((m = AC_REGEX.exec(text)) !== null) {
    acs.add(m[1]);
  }

  NOTAM_REGEX.lastIndex = 0;
  const hasNotam = NOTAM_REGEX.test(text);

  return { parts, sections, acs, hasNotam };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Traceability Gap Report ===\n');

  // 1. Load all concepts
  console.log('Loading concepts...');
  const concepts = await fetchAll<{
    id: string; name: string; slug: string; category: string;
    key_facts: string[] | null; content: string | null;
  }>('concepts', 'id, name, slug, category, key_facts, content');

  // 2. Load all relations
  console.log('Loading relations...');
  const relations = await fetchAll<{
    source_id: string; target_id: string; relation_type: string;
  }>('concept_relations', 'source_id, target_id, relation_type');

  // 3. Compute traceable set (reverse BFS from hub roots via is_component_of)
  const HUB_ROOT_SLUGS = ['hub:knowledge', 'hub:acs', 'hub:regulations', 'hub:aircraft'];
  const hubRootIds = new Set(
    concepts.filter(c => HUB_ROOT_SLUGS.includes(c.slug)).map(c => c.id),
  );

  const reverseAdj = new Map<string, Set<string>>();
  for (const c of concepts) reverseAdj.set(c.id, new Set());
  for (const r of relations) {
    if (r.relation_type === 'is_component_of') {
      reverseAdj.get(r.target_id)?.add(r.source_id);
    }
  }

  const traceable = new Set<string>();
  const queue = [...hubRootIds];
  for (const id of queue) traceable.add(id);
  while (queue.length > 0) {
    const node = queue.shift()!;
    const children = reverseAdj.get(node);
    if (children) {
      for (const child of children) {
        if (!traceable.has(child)) {
          traceable.add(child);
          queue.push(child);
        }
      }
    }
  }

  // 4. Identify untraceable concepts
  const untraceable = concepts.filter(c => !traceable.has(c.id));
  const byCategory: Record<string, typeof untraceable> = {};
  for (const c of untraceable) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  console.log(`\nTotal concepts: ${concepts.length}`);
  console.log(`Traceable: ${traceable.size} (${(traceable.size / concepts.length * 100).toFixed(1)}%)`);
  console.log(`Untraceable: ${untraceable.length} (${(untraceable.length / concepts.length * 100).toFixed(1)}%)`);
  console.log('\n--- Untraceable by Category ---');
  for (const [cat, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    const total = concepts.filter(c => c.category === cat).length;
    console.log(`  ${cat.padEnd(20)} ${items.length.toLocaleString()} / ${total.toLocaleString()} untraceable (${(items.length / total * 100).toFixed(1)}%)`);
  }

  // 5. Load evidence data
  console.log('\nLoading evidence...');
  const evidence = await fetchAll<{ concept_id: string; chunk_id: string }>(
    'concept_chunk_evidence', 'concept_id, chunk_id',
  );
  const evidenceByConceptId = new Map<string, string[]>();
  for (const e of evidence) {
    if (!evidenceByConceptId.has(e.concept_id)) evidenceByConceptId.set(e.concept_id, []);
    evidenceByConceptId.get(e.concept_id)!.push(e.chunk_id);
  }

  // 6. Load chunk taxonomy assignments
  console.log('Loading chunk taxonomy...');
  const chunkTax = await fetchAll<{ chunk_id: string; taxonomy_node_id: string; hub_slug: string }>(
    'kb_chunk_taxonomy', 'chunk_id, taxonomy_node_id, hub_slug',
  );
  const chunkTaxMap = new Map<string, { taxonomy_node_id: string; hub_slug: string }>();
  for (const ct of chunkTax) {
    chunkTaxMap.set(ct.chunk_id, { taxonomy_node_id: ct.taxonomy_node_id, hub_slug: ct.hub_slug });
  }

  // Load triage node IDs
  const triageNodes = await fetchAll<{ id: string; slug: string }>(
    'kb_taxonomy_nodes', 'id, slug',
  );
  const triageNodeIds = new Set(
    triageNodes.filter(n => n.slug.endsWith(':triage-unclassified')).map(n => n.id),
  );

  // =========================================================================
  // REGULATORY CLAIM ANALYSIS
  // =========================================================================
  const regClaims = byCategory['regulatory_claim'] || [];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`REGULATORY CLAIM ANALYSIS (${regClaims.length} untraceable)`);
  console.log(`${'='.repeat(60)}`);

  let regNoEvidence = 0;
  let regTriageOnly = 0;
  let regNoChunkTax = 0;
  let regHasNonTriageEvidence = 0;

  for (const c of regClaims) {
    const chunks = evidenceByConceptId.get(c.id);
    if (!chunks || chunks.length === 0) {
      regNoEvidence++;
      continue;
    }

    let hasNonTriage = false;
    let hasTriageOnly = true;
    for (const chunkId of chunks) {
      const tax = chunkTaxMap.get(chunkId);
      if (!tax) {
        // Chunk has no taxonomy assignment at all
        continue;
      }
      if (!triageNodeIds.has(tax.taxonomy_node_id)) {
        hasNonTriage = true;
        hasTriageOnly = false;
      }
    }

    if (hasNonTriage) {
      regHasNonTriageEvidence++;
    } else if (hasTriageOnly) {
      regTriageOnly++;
    } else {
      regNoChunkTax++;
    }
  }

  console.log(`\n  Evidence diagnosis:`);
  console.log(`    No evidence rows at all:        ${regNoEvidence} (${(regNoEvidence / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    Evidence exists, all on triage:  ${regTriageOnly} (${(regTriageOnly / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    Evidence exists, no chunk tax:   ${regNoChunkTax} (${(regNoChunkTax / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    Has non-triage evidence (bug?):  ${regHasNonTriageEvidence}`);

  // CFR reference extraction from untraceable regulatory claims
  let hasCFRSection = 0;
  let hasCFRPartOnly = 0;
  let hasACRef = 0;
  let hasNotam = 0;
  let noRef = 0;

  const sampleWithRefs: Array<{ name: string; sections: string[]; parts: number[]; acs: string[] }> = [];

  for (const c of regClaims) {
    const text = [c.name, ...(c.key_facts || []), c.content || ''].join(' ');
    const refs = extractCFRReferences(text);

    if (refs.sections.size > 0) {
      hasCFRSection++;
      if (sampleWithRefs.length < 30) {
        sampleWithRefs.push({
          name: c.name.slice(0, 80),
          sections: [...refs.sections].slice(0, 3),
          parts: [...refs.parts].slice(0, 3),
          acs: [...refs.acs].slice(0, 3),
        });
      }
    } else if (refs.parts.size > 0) {
      hasCFRPartOnly++;
    } else if (refs.acs.size > 0) {
      hasACRef++;
    } else if (refs.hasNotam) {
      hasNotam++;
    } else {
      noRef++;
    }
  }

  console.log(`\n  CFR/AC/NOTAM reference extraction (from name + key_facts + content):`);
  console.log(`    Has CFR section ref (e.g. 91.155):  ${hasCFRSection} (${(hasCFRSection / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    Has CFR part only (e.g. Part 91):   ${hasCFRPartOnly} (${(hasCFRPartOnly / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    Has AC reference:                   ${hasACRef} (${(hasACRef / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    Has NOTAM mention:                  ${hasNotam} (${(hasNotam / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    No parseable reference:             ${noRef} (${(noRef / regClaims.length * 100).toFixed(1)}%)`);

  console.log(`\n  Sample untraceable regulatory_claims with CFR section refs (first 30):`);
  for (const s of sampleWithRefs) {
    console.log(`    "${s.name}" → sections=[${s.sections.join(', ')}] parts=[${s.parts.join(', ')}]`);
  }

  // =========================================================================
  // ARTIFACT ANALYSIS
  // =========================================================================
  const artifacts = byCategory['artifact'] || [];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ARTIFACT ANALYSIS (${artifacts.length} untraceable)`);
  console.log(`${'='.repeat(60)}`);

  let artNoEvidence = 0;
  let artTriageOnly = 0;
  let artHasEvidence = 0;

  for (const a of artifacts) {
    const chunks = evidenceByConceptId.get(a.id);
    if (!chunks || chunks.length === 0) {
      artNoEvidence++;
    } else {
      let allTriage = true;
      for (const chunkId of chunks) {
        const tax = chunkTaxMap.get(chunkId);
        if (tax && !triageNodeIds.has(tax.taxonomy_node_id)) allTriage = false;
      }
      if (allTriage) artTriageOnly++;
      else artHasEvidence++;
    }
  }

  console.log(`\n  Evidence diagnosis:`);
  console.log(`    No evidence:     ${artNoEvidence}`);
  console.log(`    Triage-only:     ${artTriageOnly}`);
  console.log(`    Has non-triage:  ${artHasEvidence}`);

  console.log(`\n  All untraceable artifacts:`);
  for (const a of artifacts.slice(0, 50)) {
    const chunks = evidenceByConceptId.get(a.id);
    console.log(`    [${chunks?.length || 0} evidence] ${a.slug} — "${a.name.slice(0, 80)}"`);
  }

  // =========================================================================
  // OTHER CATEGORIES
  // =========================================================================
  const otherCats = Object.entries(byCategory).filter(([cat]) => cat !== 'regulatory_claim' && cat !== 'artifact');
  if (otherCats.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`OTHER UNTRACEABLE CATEGORIES`);
    console.log(`${'='.repeat(60)}`);
    for (const [cat, items] of otherCats.sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n  ${cat} (${items.length}):`);
      for (const c of items.slice(0, 10)) {
        const chunks = evidenceByConceptId.get(c.id);
        console.log(`    [${chunks?.length || 0} evidence] ${c.slug} — "${c.name.slice(0, 60)}"`);
      }
      if (items.length > 10) console.log(`    ... and ${items.length - 10} more`);
    }
  }

  // =========================================================================
  // ACTION RECOMMENDATIONS
  // =========================================================================
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ACTION RECOMMENDATIONS`);
  console.log(`${'='.repeat(60)}`);

  const fixable = hasCFRSection + hasCFRPartOnly + hasACRef;
  console.log(`\n  regulatory_claim: ${fixable} of ${regClaims.length} have parseable refs (${(fixable / regClaims.length * 100).toFixed(1)}%)`);
  console.log(`    → Strategy 1: Expand regulations taxonomy to CFR section level`);
  console.log(`    → Strategy 2: Classify regulations chunks into section-level nodes`);
  console.log(`    → Strategy 3: Backfill evidence for ${regNoEvidence} claims with 0 evidence rows`);
  console.log(`    → Strategy 4: Re-run concept→taxonomy attachment for regulatory_claims`);
  console.log(`\n  artifact: ${artifacts.length} concepts, ${artNoEvidence} have no evidence`);
  console.log(`    → Strategy: Direct attachment to hub:knowledge root or a source-documents node`);

  const estimatedGain = fixable + artifacts.length;
  const newTraceable = traceable.size + estimatedGain;
  console.log(`\n  Estimated impact: +${estimatedGain} traceable → ${newTraceable}/${concepts.length} (${(newTraceable / concepts.length * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error('Gap report error:', err);
  process.exit(1);
});
