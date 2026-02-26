#!/usr/bin/env npx tsx
/**
 * expand_regulations_taxonomy.ts — Expand regulations taxonomy to CFR section level
 *
 * Phase 3 Step B: Reads regulatory_claim concepts and regulations-hub triage chunks,
 * extracts CFR section references, and creates L3 taxonomy nodes under existing
 * L2 part nodes (or new L2 nodes for undiscovered parts).
 *
 * Slug scheme:
 *   L1: regulations:title-14-cfr            (existing)
 *   L2: regulations:14cfr-part-91           (existing for 10 parts, new for others)
 *   L3: regulations:14cfr-part-91:sec-91-155 (NEW)
 *
 * Flags:
 *   --dry-run         Print plan but don't write to DB (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *
 * Usage:
 *   npx tsx scripts/taxonomy/expand_regulations_taxonomy.ts
 *   npx tsx scripts/taxonomy/expand_regulations_taxonomy.ts --write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/expand_regulations_taxonomy.ts --write
 *
 * npm: npm run taxonomy:expand:regulations
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { assertNotProduction } from '../../src/lib/app-env';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// CFR reference extraction (shared with traceability-gap-report.ts)
// ---------------------------------------------------------------------------

export const CFR_SECTION_REGEX = /(?:14\s*CFR|§|[Ss]ec(?:tion)?\.?\s*)\s*(\d{1,3})\.(\d{1,4})(?:\(([a-z])\))?/g;
export const CFR_PART_REGEX = /(?:14\s*CFR|[Pp]art)\s+(\d{1,3})\b/g;

export interface CfrRef {
  part: number;
  section: number;
}

/**
 * Extract unique CFR part.section references from text.
 * Returns deduplicated CfrRef array (part-level only if no section found).
 */
export function extractCfrSections(text: string): CfrRef[] {
  const seen = new Set<string>();
  const refs: CfrRef[] = [];

  CFR_SECTION_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CFR_SECTION_REGEX.exec(text)) !== null) {
    const part = parseInt(m[1], 10);
    const section = parseInt(m[2], 10);
    const key = `${part}.${section}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ part, section });
    }
  }

  return refs;
}

/**
 * Extract unique CFR part numbers from text (part-only, no section).
 */
export function extractCfrParts(text: string): number[] {
  const seen = new Set<number>();
  CFR_PART_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CFR_PART_REGEX.exec(text)) !== null) {
    seen.add(parseInt(m[1], 10));
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  if (args.includes('--write')) return { dryRun: false };
  return { dryRun: true };
}

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
// Known Part titles for human-readable L2 node names
// ---------------------------------------------------------------------------

const PART_TITLES: Record<number, string> = {
  1: 'Definitions and Abbreviations',
  23: 'Airworthiness Standards: Normal Category',
  25: 'Airworthiness Standards: Transport Category',
  27: 'Airworthiness Standards: Normal Category Rotorcraft',
  33: 'Airworthiness Standards: Aircraft Engines',
  34: 'Fuel Venting and Exhaust Emission Requirements',
  39: 'Airworthiness Directives',
  43: 'Maintenance, Preventive Maintenance, Rebuilding, and Alteration',
  45: 'Identification and Registration Marking',
  47: 'Aircraft Registration',
  61: 'Certification: Pilots, Flight Instructors, and Ground Instructors',
  63: 'Flight Crewmembers Other Than Pilots',
  65: 'Certification: Airmen Other Than Flight Crewmembers',
  67: 'Medical Standards and Certification',
  68: 'Requirements for Operating Certain Small Aircraft Without a Medical Certificate',
  71: 'Designation of Class A, B, C, D, and E Airspace Areas',
  73: 'Special Use Airspace',
  77: 'Safe, Efficient Use, and Preservation of the Navigable Airspace',
  91: 'General Operating and Flight Rules',
  93: 'Special Air Traffic Rules',
  95: 'IFR Altitudes',
  97: 'Standard Instrument Procedures',
  99: 'Security Control of Air Traffic',
  103: 'Ultralight Vehicles',
  105: 'Parachute Operations',
  107: 'Small Unmanned Aircraft Systems',
  110: 'General Requirements',
  117: 'Flight and Duty Limitations and Rest Requirements',
  119: 'Certification: Air Carriers and Commercial Operators',
  120: 'Drug and Alcohol Testing Program',
  121: 'Operating Requirements: Domestic, Flag, and Supplemental Operations',
  125: 'Certification and Operations: Airplanes Having a Seating Capacity of 20 or More Passengers',
  129: 'Operations: Foreign Air Carriers',
  133: 'Rotorcraft External-Load Operations',
  135: 'Operating Requirements: Commuter and On Demand Operations',
  136: 'Commercial Air Tours and National Parks Air Tour Management',
  137: 'Agricultural Aircraft Operations',
  141: 'Pilot Schools',
  142: 'Training Centers',
  145: 'Repair Stations',
  147: 'Aviation Maintenance Technician Schools',
  183: 'Representatives of the Administrator',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  if (!flags.dryRun) {
    assertNotProduction();
  }

  console.log('\n=== Expand Regulations Taxonomy to CFR Section Level ===');
  console.log(`Mode: ${flags.dryRun ? 'DRY-RUN' : 'WRITE'}\n`);

  // 1. Load existing regulations taxonomy nodes
  console.log('Loading existing regulations taxonomy nodes...');
  const existingNodes = await fetchAll<{
    id: string; slug: string; title: string; level: number; parent_id: string | null; hub_slug: string;
  }>('kb_taxonomy_nodes', 'id, slug, title, level, parent_id, hub_slug');

  const regNodes = existingNodes.filter(n => n.hub_slug === 'regulations');
  const existingSlugs = new Set(regNodes.map(n => n.slug));
  const slugToId = new Map(regNodes.map(n => [n.slug, n.id]));

  console.log(`  Existing regulations nodes: ${regNodes.length}`);
  console.log(`  L1: ${regNodes.filter(n => n.level === 1).length}`);
  console.log(`  L2: ${regNodes.filter(n => n.level === 2).length}`);
  console.log(`  L3: ${regNodes.filter(n => n.level === 3).length}`);

  // 2. Load regulatory_claim concepts and extract CFR refs
  console.log('\nLoading regulatory_claim concepts...');
  const claims = await fetchAll<{
    id: string; name: string; key_facts: string[] | null; content: string | null;
  }>('concepts', 'id, name, key_facts, content');

  // Filter to regulatory_claim category separately since we need the category filter
  // Supabase can't filter on an enum easily with fetchAll, so let's do it paginated
  const regClaims: Array<{ id: string; name: string; key_facts: string[] | null; content: string | null }> = [];
  let claimOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, name, key_facts, content')
      .eq('category', 'regulatory_claim')
      .range(claimOffset, claimOffset + 999);
    if (error) { console.error('Error fetching claims:', error.message); break; }
    if (!data || data.length === 0) break;
    regClaims.push(...data);
    if (data.length < 1000) break;
    claimOffset += 1000;
  }
  console.log(`  Regulatory claims loaded: ${regClaims.length}`);

  // 3. Extract CFR section refs from claims
  const sectionCounts = new Map<string, number>(); // "91.155" → count
  const partFromSections = new Set<number>(); // parts discovered via sections

  for (const claim of regClaims) {
    const text = [claim.name, ...(claim.key_facts || []), claim.content || ''].join(' ');
    const refs = extractCfrSections(text);
    for (const ref of refs) {
      const key = `${ref.part}.${ref.section}`;
      sectionCounts.set(key, (sectionCounts.get(key) || 0) + 1);
      partFromSections.add(ref.part);
    }
  }

  console.log(`  Unique CFR sections found in claims: ${sectionCounts.size}`);
  console.log(`  Unique parts referenced: ${partFromSections.size}`);

  // 4. Load regulations-hub triage chunks and extract refs from content
  console.log('\nLoading regulations-hub triage chunks...');
  const triageNode = regNodes.find(n => n.slug === 'regulations:triage-unclassified');
  let triageChunkCount = 0;

  if (triageNode) {
    let chunkOffset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('kb_chunk_taxonomy')
        .select('chunk_id')
        .eq('hub_slug', 'regulations')
        .eq('taxonomy_node_id', triageNode.id)
        .range(chunkOffset, chunkOffset + 999);
      if (error) { console.error('Error fetching triage chunks:', error.message); break; }
      if (!data || data.length === 0) break;
      triageChunkCount += data.length;

      // Fetch chunk content for these IDs
      const chunkIds = data.map(d => d.chunk_id);
      const { data: chunks } = await supabase
        .from('source_chunks')
        .select('id, content, heading')
        .in('id', chunkIds);

      if (chunks) {
        for (const chunk of chunks) {
          const text = [chunk.content || '', chunk.heading || ''].join(' ');
          const refs = extractCfrSections(text);
          for (const ref of refs) {
            const key = `${ref.part}.${ref.section}`;
            sectionCounts.set(key, (sectionCounts.get(key) || 0) + 1);
            partFromSections.add(ref.part);
          }
        }
      }

      if (data.length < 1000) break;
      chunkOffset += 1000;
    }
  }
  console.log(`  Triage chunks scanned: ${triageChunkCount}`);
  console.log(`  Total unique CFR sections (claims + chunks): ${sectionCounts.size}`);

  // 5. Build the expansion plan
  console.log('\n--- Expansion Plan ---');

  // Identify which parts need L2 creation
  const existingParts = new Set<number>();
  for (const node of regNodes) {
    const partMatch = node.slug.match(/^regulations:14cfr-part-(\d+)$/);
    if (partMatch) existingParts.add(parseInt(partMatch[1], 10));
  }

  const newParts = new Set<number>();
  for (const part of partFromSections) {
    if (!existingParts.has(part)) newParts.add(part);
  }

  // Build section entries sorted by part then section
  const sections = [...sectionCounts.entries()]
    .map(([key, count]) => {
      const [partStr, secStr] = key.split('.');
      return { part: parseInt(partStr, 10), section: parseInt(secStr, 10), count };
    })
    .sort((a, b) => a.part - b.part || a.section - b.section);

  console.log(`  New L2 part nodes needed: ${newParts.size} (${[...newParts].sort((a, b) => a - b).join(', ')})`);
  console.log(`  New L3 section nodes to create: ${sections.length}`);

  // Print top sections by reference count
  const topSections = [...sectionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  console.log(`\n  Top 30 referenced sections:`);
  for (const [key, count] of topSections) {
    console.log(`    §${key} — ${count} references`);
  }

  // Print sections per part
  const sectionsByPart = new Map<number, number>();
  for (const s of sections) {
    sectionsByPart.set(s.part, (sectionsByPart.get(s.part) || 0) + 1);
  }
  console.log(`\n  Sections per part:`);
  for (const [part, count] of [...sectionsByPart.entries()].sort((a, b) => b[1] - a[1])) {
    const exists = existingParts.has(part) ? '' : ' (NEW L2)';
    console.log(`    Part ${part}: ${count} sections${exists}`);
  }

  // 6. Get the L1 root for parenting
  const l1Root = regNodes.find(n => n.slug === 'regulations:title-14-cfr');
  if (!l1Root) {
    console.error('ERROR: Cannot find regulations:title-14-cfr L1 root. Aborting.');
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log(`\n[DRY-RUN] Would create ${newParts.size} new L2 nodes + ${sections.length} new L3 nodes`);
    console.log('[DRY-RUN] Run with --write to execute.');
    return;
  }

  // =========================================================================
  // WRITE MODE
  // =========================================================================

  // 7. Create new L2 part nodes
  console.log(`\nCreating ${newParts.size} new L2 part nodes...`);
  const sortedNewParts = [...newParts].sort((a, b) => a - b);

  for (const part of sortedNewParts) {
    const slug = `regulations:14cfr-part-${part}`;
    const title = PART_TITLES[part]
      ? `Part ${part} — ${PART_TITLES[part]}`
      : `Part ${part}`;

    const { data, error } = await supabase
      .from('kb_taxonomy_nodes')
      .upsert({
        slug,
        title,
        level: 2,
        parent_id: l1Root.id,
        hub_slug: 'regulations',
        taxonomy_slug: 'default',
        source_provenance: [{ doc_abbrev: 'cfr', toc_path: `Title 14 > Part ${part}` }],
        synonyms: [],
      }, { onConflict: 'slug' })
      .select('id, slug');

    if (error) {
      console.error(`  ERROR creating L2 node ${slug}: ${error.message}`);
    } else if (data && data.length > 0) {
      slugToId.set(slug, data[0].id);
      existingSlugs.add(slug);
      existingParts.add(part);
      console.log(`  Created L2: ${slug} — "${title}"`);
    }
  }

  // 8. Reload all regulations nodes (to get IDs for any that were upserted as no-ops)
  console.log('\nReloading regulations taxonomy nodes...');
  const reloadedNodes = await fetchAll<{
    id: string; slug: string; level: number;
  }>('kb_taxonomy_nodes', 'id, slug, level');
  const reloadedMap = new Map(reloadedNodes.map(n => [n.slug, n.id]));

  // 9. Create L3 section nodes in batches
  console.log(`\nCreating ${sections.length} L3 section nodes...`);
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const batchSize = 200;

  for (let i = 0; i < sections.length; i += batchSize) {
    const batch = sections.slice(i, i + batchSize);
    const rows = batch.map(s => {
      const sectionSlug = `regulations:14cfr-part-${s.part}:sec-${s.part}-${s.section}`;
      const parentSlug = `regulations:14cfr-part-${s.part}`;
      const parentId = reloadedMap.get(parentSlug);

      return {
        slug: sectionSlug,
        title: `§${s.part}.${s.section}`,
        level: 3,
        parent_id: parentId || null,
        hub_slug: 'regulations',
        taxonomy_slug: 'default',
        source_provenance: [{ doc_abbrev: 'cfr', toc_path: `Title 14 > Part ${s.part} > §${s.part}.${s.section}` }],
        synonyms: [],
      };
    }).filter(row => {
      if (!row.parent_id) {
        console.warn(`  WARN: No parent for ${row.slug}, skipping`);
        skipped++;
        return false;
      }
      return true;
    });

    const { data, error } = await supabase
      .from('kb_taxonomy_nodes')
      .upsert(rows, { onConflict: 'slug' })
      .select('id, slug');

    if (error) {
      console.error(`  ERROR batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      errors += batch.length;
    } else if (data) {
      created += data.length;
      for (const row of data) {
        reloadedMap.set(row.slug, row.id);
      }
    }

    if ((Math.floor(i / batchSize) + 1) % 5 === 0 || i + batchSize >= sections.length) {
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${created} created so far`);
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`  New L2 part nodes: ${sortedNewParts.length}`);
  console.log(`  New L3 section nodes: ${created}`);
  console.log(`  Skipped (no parent): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total regulations taxonomy nodes now: ${regNodes.length + sortedNewParts.length + created}`);
}

main().catch((err) => {
  console.error('Expand regulations taxonomy error:', err);
  process.exit(1);
});
