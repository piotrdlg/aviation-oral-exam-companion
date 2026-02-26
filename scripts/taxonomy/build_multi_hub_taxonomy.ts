#!/usr/bin/env npx tsx
/**
 * build_multi_hub_taxonomy.ts — Populate taxonomy nodes for all 4 hubs
 *
 * Hubs:
 *   knowledge:   Import from data/taxonomy/unified-taxonomy.v0.json (1,700 nodes)
 *   acs:         Build from acs_tasks table (rating -> area -> task)
 *   regulations: CFR scaffold (Title 14 -> Parts)
 *   aircraft:    Minimal skeleton (systems/limitations/performance)
 *
 * Flags:
 *   --dry-run    Print planned inserts (default)
 *   --write      Write to DB (requires ALLOW_PROD_WRITE=1)
 *   --hub NAME   Only process one hub
 *
 * Usage:
 *   npx tsx scripts/taxonomy/build_multi_hub_taxonomy.ts
 *   npx tsx scripts/taxonomy/build_multi_hub_taxonomy.ts --hub acs
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/build_multi_hub_taxonomy.ts --write
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
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
// CLI flags
// ---------------------------------------------------------------------------

interface Flags {
  dryRun: boolean;
  write: boolean;
  hub: string;
}

function parseArgs(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { dryRun: true, write: false, hub: '' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        flags.dryRun = true;
        flags.write = false;
        break;
      case '--write':
        flags.write = true;
        flags.dryRun = false;
        break;
      case '--hub':
        flags.hub = args[++i];
        break;
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxonomyNodeRow {
  slug: string;
  title: string;
  level: number;
  parent_id: string | null;
  hub_slug: string;
  taxonomy_slug: string;
  source_provenance: unknown[];
  synonyms: string[];
}

interface HubStats {
  l1: number;
  l2: number;
  l3: number;
  inserted: number;
  skipped: number;
}

function emptyStats(): HubStats {
  return { l1: 0, l2: 0, l3: 0, inserted: 0, skipped: 0 };
}

// ---------------------------------------------------------------------------
// Paginated fetch helper (from build-backbone.ts)
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
// Upsert helper — batch upsert with progress logging
// ---------------------------------------------------------------------------

async function upsertNodes(
  nodes: TaxonomyNodeRow[],
  flags: Flags,
  stats: HubStats,
): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();

  if (nodes.length === 0) return slugToId;

  if (flags.dryRun) {
    for (const n of nodes) {
      console.log(`  [DRY-RUN] Would upsert: ${n.slug} (L${n.level}) "${n.title}"`);
      stats.inserted++;
      if (n.level === 1) stats.l1++;
      else if (n.level === 2) stats.l2++;
      else if (n.level === 3) stats.l3++;
    }
    return slugToId;
  }

  // Batch in groups of 200
  const batchSize = 200;
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('kb_taxonomy_nodes')
      .upsert(batch, { onConflict: 'slug' })
      .select('id, slug');

    if (error) {
      console.error(`  Upsert error (batch ${i}–${i + batch.length}): ${error.message}`);
    } else if (data) {
      for (const row of data) {
        slugToId.set(row.slug, row.id);
      }
      for (const n of batch) {
        stats.inserted++;
        if (n.level === 1) stats.l1++;
        else if (n.level === 2) stats.l2++;
        else if (n.level === 3) stats.l3++;
      }
    }

    if ((i + batchSize) % 1000 === 0 || i + batchSize >= nodes.length) {
      console.log(`  Upserted ${Math.min(i + batchSize, nodes.length)}/${nodes.length}`);
    }
  }

  return slugToId;
}

// ---------------------------------------------------------------------------
// Hub: Knowledge
// ---------------------------------------------------------------------------

interface TaxonomyJsonNode {
  slug: string;
  title: string;
  level: number;
  parent_slug: string | null;
  source_provenance: unknown[];
}

async function buildKnowledgeHub(flags: Flags, stats: HubStats): Promise<void> {
  console.log('\n--- Hub: knowledge ---');

  const jsonPath = path.resolve(__dirname, '../../data/taxonomy/unified-taxonomy.v0.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`  ERROR: Missing ${jsonPath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const jsonNodes: TaxonomyJsonNode[] = raw.nodes;
  console.log(`  Loaded ${jsonNodes.length} nodes from unified-taxonomy.v0.json`);

  // Pass 1: Insert all nodes with parent_id = NULL
  const pass1Rows: TaxonomyNodeRow[] = jsonNodes.map((n) => ({
    slug: n.slug,
    title: n.title,
    level: n.level,
    parent_id: null,
    hub_slug: 'knowledge',
    taxonomy_slug: 'default',
    source_provenance: n.source_provenance || [],
    synonyms: [],
  }));

  console.log('  Pass 1: Inserting all nodes (parent_id=NULL)...');
  const slugToId = await upsertNodes(pass1Rows, flags, stats);

  // If dry-run, we can't do pass 2
  if (flags.dryRun) {
    const withParent = jsonNodes.filter((n) => n.parent_slug);
    console.log(`  Pass 2: Would update ${withParent.length} parent_id references`);
    return;
  }

  // If we didn't get IDs back (shouldn't happen in write mode), fetch them
  if (slugToId.size === 0) {
    console.log('  Fetching inserted node IDs...');
    const existing = await fetchAll<{ id: string; slug: string }>(
      'kb_taxonomy_nodes',
      'id, slug',
    );
    for (const row of existing) {
      slugToId.set(row.slug, row.id);
    }
  }

  // Pass 2: Update parent_id for nodes that have parent_slug
  const nodesWithParent = jsonNodes.filter((n) => n.parent_slug);
  console.log(`  Pass 2: Updating ${nodesWithParent.length} parent_id references...`);

  let updatedCount = 0;
  const updateBatchSize = 50;

  for (let i = 0; i < nodesWithParent.length; i += updateBatchSize) {
    const batch = nodesWithParent.slice(i, i + updateBatchSize);

    for (const n of batch) {
      const parentId = slugToId.get(n.parent_slug!);
      const nodeId = slugToId.get(n.slug);

      if (!parentId) {
        console.warn(`  WARN: Parent slug not found: ${n.parent_slug} (for ${n.slug})`);
        continue;
      }
      if (!nodeId) {
        console.warn(`  WARN: Node slug not found: ${n.slug}`);
        continue;
      }

      const { error } = await supabase
        .from('kb_taxonomy_nodes')
        .update({ parent_id: parentId })
        .eq('id', nodeId);

      if (error) {
        console.error(`  Update error for ${n.slug}: ${error.message}`);
      } else {
        updatedCount++;
      }
    }

    if ((i + updateBatchSize) % 500 === 0 || i + updateBatchSize >= nodesWithParent.length) {
      console.log(`  Updated ${Math.min(i + updateBatchSize, nodesWithParent.length)}/${nodesWithParent.length} parent refs`);
    }
  }

  console.log(`  Pass 2 complete: ${updatedCount} parent_id values set`);
}

// ---------------------------------------------------------------------------
// Hub: ACS
// ---------------------------------------------------------------------------

interface AcsTask {
  id: string;
  rating: string;
  area: string;
  task: string;
}

const RATING_TITLES: Record<string, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial Pilot',
  instrument: 'Instrument Rating',
};

const RATING_PREFIXES: Record<string, string> = {
  private: 'PA',
  commercial: 'CA',
  instrument: 'IR',
};

async function buildAcsHub(flags: Flags, stats: HubStats): Promise<void> {
  console.log('\n--- Hub: acs ---');

  const tasks = await fetchAll<AcsTask>('acs_tasks', 'id, rating, area, task');
  console.log(`  Fetched ${tasks.length} ACS tasks`);

  if (tasks.length === 0) {
    console.log('  No ACS tasks found — skipping');
    return;
  }

  // Collect all nodes to insert
  const allNodes: TaxonomyNodeRow[] = [];

  // L1: Rating roots — derive from distinct ratings
  const distinctRatings = [...new Set(tasks.map((t) => t.rating))];
  console.log(`  Ratings: ${distinctRatings.join(', ')}`);

  for (const rating of distinctRatings) {
    allNodes.push({
      slug: `acs:${rating}`,
      title: RATING_TITLES[rating] || rating,
      level: 1,
      parent_id: null,
      hub_slug: 'acs',
      taxonomy_slug: 'default',
      source_provenance: [{ doc_abbrev: 'acs', toc_path: RATING_TITLES[rating] || rating }],
      synonyms: [],
    });
  }

  // L2: Area nodes — derive from distinct (rating, roman numeral, area name)
  const areaMap = new Map<string, { rating: string; roman: string; area: string }>();

  for (const t of tasks) {
    // Task ID format: PA.I.A — split on '.' to get [prefix, roman, letter]
    const parts = t.id.split('.');
    if (parts.length < 3) continue;
    const roman = parts[1]; // e.g., 'I', 'II', 'III'
    const key = `${t.rating}:${roman}`;
    if (!areaMap.has(key)) {
      areaMap.set(key, { rating: t.rating, roman, area: t.area });
    }
  }

  for (const [, entry] of areaMap) {
    const slug = `acs:${entry.rating}:${entry.roman}`;
    const parentSlug = `acs:${entry.rating}`;
    allNodes.push({
      slug,
      title: `Area ${entry.roman} — ${entry.area}`,
      level: 2,
      parent_id: null, // will be resolved after insert
      hub_slug: 'acs',
      taxonomy_slug: 'default',
      source_provenance: [{ doc_abbrev: 'acs', toc_path: `${RATING_TITLES[entry.rating] || entry.rating} > Area ${entry.roman}` }],
      synonyms: [],
    });
  }

  // L3: Task nodes
  for (const t of tasks) {
    const parts = t.id.split('.');
    if (parts.length < 3) continue;
    const roman = parts[1];
    allNodes.push({
      slug: `acs:${t.id}`,
      title: t.task,
      level: 3,
      parent_id: null, // will be resolved after insert
      hub_slug: 'acs',
      taxonomy_slug: 'default',
      source_provenance: [{ doc_abbrev: 'acs', toc_path: `${RATING_TITLES[t.rating] || t.rating} > Area ${roman} > ${t.task}` }],
      synonyms: [],
    });
  }

  console.log(`  Prepared: ${allNodes.filter((n) => n.level === 1).length} L1, ${allNodes.filter((n) => n.level === 2).length} L2, ${allNodes.filter((n) => n.level === 3).length} L3`);

  // Insert all nodes (pass 1)
  const slugToId = await upsertNodes(allNodes, flags, stats);

  if (flags.dryRun) {
    console.log(`  Would set parent_id on ${allNodes.filter((n) => n.level >= 2).length} nodes`);
    return;
  }

  // Fetch all IDs if needed
  if (slugToId.size < allNodes.length) {
    const existing = await fetchAll<{ id: string; slug: string }>(
      'kb_taxonomy_nodes',
      'id, slug',
    );
    for (const row of existing) {
      if (!slugToId.has(row.slug)) slugToId.set(row.slug, row.id);
    }
  }

  // Pass 2: Set parent_id for L2 nodes (parent = L1 rating root)
  console.log('  Setting parent_id for L2 area nodes...');
  for (const [, entry] of areaMap) {
    const nodeSlug = `acs:${entry.rating}:${entry.roman}`;
    const parentSlug = `acs:${entry.rating}`;
    const nodeId = slugToId.get(nodeSlug);
    const parentId = slugToId.get(parentSlug);
    if (nodeId && parentId) {
      await supabase.from('kb_taxonomy_nodes').update({ parent_id: parentId }).eq('id', nodeId);
    }
  }

  // Pass 3: Set parent_id for L3 nodes (parent = L2 area node)
  console.log('  Setting parent_id for L3 task nodes...');
  for (const t of tasks) {
    const parts = t.id.split('.');
    if (parts.length < 3) continue;
    const roman = parts[1];
    const nodeSlug = `acs:${t.id}`;
    const parentSlug = `acs:${t.rating}:${roman}`;
    const nodeId = slugToId.get(nodeSlug);
    const parentId = slugToId.get(parentSlug);
    if (nodeId && parentId) {
      await supabase.from('kb_taxonomy_nodes').update({ parent_id: parentId }).eq('id', nodeId);
    }
  }

  console.log('  Parent references set');
}

// ---------------------------------------------------------------------------
// Hub: Regulations
// ---------------------------------------------------------------------------

interface StaticNode {
  slug: string;
  title: string;
  level: number;
  parentSlug: string | null;
  provenance: unknown[];
}

const REGULATIONS_NODES: StaticNode[] = [
  {
    slug: 'regulations:title-14-cfr',
    title: 'Title 14 — Aeronautics and Space',
    level: 1,
    parentSlug: null,
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14' }],
  },
  {
    slug: 'regulations:14cfr-part-1',
    title: 'Part 1 — Definitions and Abbreviations',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 1' }],
  },
  {
    slug: 'regulations:14cfr-part-23',
    title: 'Part 23 — Airworthiness Standards: Normal Category',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 23' }],
  },
  {
    slug: 'regulations:14cfr-part-43',
    title: 'Part 43 — Maintenance, Preventive Maintenance, Rebuilding, and Alteration',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 43' }],
  },
  {
    slug: 'regulations:14cfr-part-61',
    title: 'Part 61 — Certification: Pilots, Flight Instructors, and Ground Instructors',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 61' }],
  },
  {
    slug: 'regulations:14cfr-part-67',
    title: 'Part 67 — Medical Standards and Certification',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 67' }],
  },
  {
    slug: 'regulations:14cfr-part-71',
    title: 'Part 71 — Designation of Class A, B, C, D, and E Airspace Areas',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 71' }],
  },
  {
    slug: 'regulations:14cfr-part-91',
    title: 'Part 91 — General Operating and Flight Rules',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 91' }],
  },
  {
    slug: 'regulations:14cfr-part-97',
    title: 'Part 97 — Standard Instrument Procedures',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 97' }],
  },
  {
    slug: 'regulations:14cfr-part-119',
    title: 'Part 119 — Certification: Air Carriers and Commercial Operators',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 119' }],
  },
  {
    slug: 'regulations:14cfr-part-135',
    title: 'Part 135 — Operating Requirements: Commuter and On Demand Operations',
    level: 2,
    parentSlug: 'regulations:title-14-cfr',
    provenance: [{ doc_abbrev: 'cfr', toc_path: 'Title 14 > Part 135' }],
  },
];

async function buildRegulationsHub(flags: Flags, stats: HubStats): Promise<void> {
  console.log('\n--- Hub: regulations ---');
  await buildStaticHub('regulations', REGULATIONS_NODES, flags, stats);
}

// ---------------------------------------------------------------------------
// Hub: Aircraft
// ---------------------------------------------------------------------------

const AIRCRAFT_NODES: StaticNode[] = [
  {
    slug: 'aircraft:general-aviation',
    title: 'General Aviation Airplane',
    level: 1,
    parentSlug: null,
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft' }],
  },
  {
    slug: 'aircraft:powerplant-and-propeller',
    title: 'Powerplant and Propeller',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Powerplant and Propeller' }],
  },
  {
    slug: 'aircraft:electrical-system',
    title: 'Electrical System',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Electrical System' }],
  },
  {
    slug: 'aircraft:fuel-system',
    title: 'Fuel System',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Fuel System' }],
  },
  {
    slug: 'aircraft:flight-instruments',
    title: 'Flight Instruments',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Flight Instruments' }],
  },
  {
    slug: 'aircraft:navigation-and-avionics',
    title: 'Navigation and Avionics',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Navigation and Avionics' }],
  },
  {
    slug: 'aircraft:flight-controls',
    title: 'Flight Controls',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Flight Controls' }],
  },
  {
    slug: 'aircraft:landing-gear-and-brakes',
    title: 'Landing Gear and Brakes',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Landing Gear and Brakes' }],
  },
  {
    slug: 'aircraft:environmental-systems',
    title: 'Environmental Systems',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Environmental Systems' }],
  },
  {
    slug: 'aircraft:limitations-and-performance',
    title: 'Limitations and Performance',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Limitations and Performance' }],
  },
  {
    slug: 'aircraft:normal-procedures',
    title: 'Normal Procedures',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Normal Procedures' }],
  },
  {
    slug: 'aircraft:abnormal-and-emergency',
    title: 'Abnormal and Emergency Procedures',
    level: 2,
    parentSlug: 'aircraft:general-aviation',
    provenance: [{ doc_abbrev: 'afh', toc_path: 'Aircraft > Abnormal and Emergency Procedures' }],
  },
];

async function buildAircraftHub(flags: Flags, stats: HubStats): Promise<void> {
  console.log('\n--- Hub: aircraft ---');
  await buildStaticHub('aircraft', AIRCRAFT_NODES, flags, stats);
}

// ---------------------------------------------------------------------------
// Shared builder for static hubs (regulations, aircraft)
// ---------------------------------------------------------------------------

async function buildStaticHub(
  hubSlug: string,
  staticNodes: StaticNode[],
  flags: Flags,
  stats: HubStats,
): Promise<void> {
  // Build parent slug -> node slug mapping for post-insert parent wiring
  const parentMap = new Map<string, string>();
  for (const n of staticNodes) {
    if (n.parentSlug) {
      parentMap.set(n.slug, n.parentSlug);
    }
  }

  // Pass 1: Insert all nodes with parent_id = NULL
  const rows: TaxonomyNodeRow[] = staticNodes.map((n) => ({
    slug: n.slug,
    title: n.title,
    level: n.level,
    parent_id: null,
    hub_slug: hubSlug,
    taxonomy_slug: 'default',
    source_provenance: n.provenance,
    synonyms: [],
  }));

  console.log(`  Prepared: ${rows.filter((r) => r.level === 1).length} L1, ${rows.filter((r) => r.level === 2).length} L2`);

  const slugToId = await upsertNodes(rows, flags, stats);

  if (flags.dryRun) {
    console.log(`  Would set parent_id on ${parentMap.size} nodes`);
    return;
  }

  // Fetch IDs if needed
  if (slugToId.size < rows.length) {
    const existing = await fetchAll<{ id: string; slug: string }>(
      'kb_taxonomy_nodes',
      'id, slug',
    );
    for (const row of existing) {
      if (!slugToId.has(row.slug)) slugToId.set(row.slug, row.id);
    }
  }

  // Pass 2: Wire parent_id
  console.log(`  Setting parent_id on ${parentMap.size} nodes...`);
  for (const [childSlug, parentSlugVal] of parentMap) {
    const childId = slugToId.get(childSlug);
    const parentId = slugToId.get(parentSlugVal);
    if (childId && parentId) {
      await supabase
        .from('kb_taxonomy_nodes')
        .update({ parent_id: parentId })
        .eq('id', childId);
    }
  }

  console.log('  Parent references set');
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

interface AllStats {
  knowledge: HubStats;
  acs: HubStats;
  regulations: HubStats;
  aircraft: HubStats;
}

function writeReport(flags: Flags, stats: AllStats): void {
  const dateStr = new Date().toISOString().split('T')[0];
  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const hubs = ['knowledge', 'acs', 'regulations', 'aircraft'] as const;

  let totalL1 = 0;
  let totalL2 = 0;
  let totalL3 = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const h of hubs) {
    totalL1 += stats[h].l1;
    totalL2 += stats[h].l2;
    totalL3 += stats[h].l3;
    totalInserted += stats[h].inserted;
    totalSkipped += stats[h].skipped;
  }

  const totalAll = totalL1 + totalL2 + totalL3;
  const mode = flags.write ? 'WRITE' : 'DRY-RUN';

  const md: string[] = [
    '---',
    `title: "Multi-Hub Taxonomy Build — ${dateStr}"`,
    `date: ${dateStr}`,
    'type: graph-report',
    'tags: [heydpe, knowledge-graph, taxonomy, multi-hub]',
    '---',
    '',
    `# Multi-Hub Taxonomy Build — ${dateStr}`,
    '',
    `**Mode:** ${mode}`,
    '',
    '## Summary',
    '',
    '| Hub | L1 | L2 | L3 | Total | Inserts | Skipped |',
    '|-----|----|----|-----|-------|---------|---------|',
  ];

  for (const h of hubs) {
    const s = stats[h];
    const total = s.l1 + s.l2 + s.l3;
    md.push(`| ${h} | ${s.l1} | ${s.l2} | ${s.l3} | ${total} | ${s.inserted} | ${s.skipped} |`);
  }

  md.push(`| **Total** | **${totalL1}** | **${totalL2}** | **${totalL3}** | **${totalAll}** | **${totalInserted}** | **${totalSkipped}** |`);

  md.push('', '## Hub Details', '');

  md.push('### Knowledge Hub');
  md.push(`- Source: \`data/taxonomy/unified-taxonomy.v0.json\``);
  md.push(`- ${stats.knowledge.l1} domain roots, ${stats.knowledge.l2} sections, ${stats.knowledge.l3} subsections`);
  md.push('');

  md.push('### ACS Hub');
  md.push('- Source: `acs_tasks` table (live query)');
  md.push(`- ${stats.acs.l1} rating roots, ${stats.acs.l2} area nodes, ${stats.acs.l3} task nodes`);
  md.push('');

  md.push('### Regulations Hub');
  md.push('- Source: hardcoded CFR scaffold');
  md.push(`- ${stats.regulations.l1} root, ${stats.regulations.l2} parts`);
  md.push('');

  md.push('### Aircraft Hub');
  md.push('- Source: hardcoded aircraft systems skeleton');
  md.push(`- ${stats.aircraft.l1} root, ${stats.aircraft.l2} system categories`);
  md.push('');

  md.push('---', '', `*Generated by build_multi_hub_taxonomy.ts on ${dateStr}*`);

  const reportPath = path.join(reportDir, `${dateStr}-multi-hub-taxonomy-build.md`);
  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`\n  Report: ${reportPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  console.log('\n=== Multi-Hub Taxonomy Build ===\n');
  console.log(`Mode: ${flags.write ? 'WRITE' : 'DRY-RUN'}`);
  if (flags.hub) {
    console.log(`Hub filter: ${flags.hub}`);
  }

  if (flags.write) {
    assertNotProduction('build-multi-hub-taxonomy', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
    if (process.env.ALLOW_PROD_WRITE === '1') {
      console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!\n');
    }
  }

  const stats: AllStats = {
    knowledge: emptyStats(),
    acs: emptyStats(),
    regulations: emptyStats(),
    aircraft: emptyStats(),
  };

  if (!flags.hub || flags.hub === 'knowledge') {
    await buildKnowledgeHub(flags, stats.knowledge);
  }

  if (!flags.hub || flags.hub === 'acs') {
    await buildAcsHub(flags, stats.acs);
  }

  if (!flags.hub || flags.hub === 'regulations') {
    await buildRegulationsHub(flags, stats.regulations);
  }

  if (!flags.hub || flags.hub === 'aircraft') {
    await buildAircraftHub(flags, stats.aircraft);
  }

  // Print console summary
  const hubs = ['knowledge', 'acs', 'regulations', 'aircraft'] as const;
  let grandTotal = 0;

  console.log('\n=== SUMMARY ===\n');
  console.log('  Hub            | L1  | L2  | L3   | Total | Inserts');
  console.log('  ---------------|-----|-----|------|-------|--------');

  for (const h of hubs) {
    const s = stats[h];
    const total = s.l1 + s.l2 + s.l3;
    grandTotal += total;
    console.log(`  ${h.padEnd(16)}| ${String(s.l1).padEnd(4)}| ${String(s.l2).padEnd(4)}| ${String(s.l3).padEnd(5)}| ${String(total).padEnd(6)}| ${s.inserted}`);
  }

  console.log(`  ${'TOTAL'.padEnd(16)}| ${grandTotal}`);

  // Write report
  writeReport(flags, stats);

  if (flags.dryRun) {
    console.log('\n  Run with --write to apply changes.');
    console.log('  For production: ALLOW_PROD_WRITE=1 npx tsx scripts/taxonomy/build_multi_hub_taxonomy.ts --write');
  }
}

main().catch((err) => {
  console.error('Multi-hub taxonomy build error:', err);
  process.exit(1);
});
