#!/usr/bin/env npx tsx
/**
 * build_unified_taxonomy.ts — Merge PDF TOCs + domain roots into a unified taxonomy
 *
 * Inputs:
 *   - data/taxonomy/toc/*.json (from extract_pdf_toc.py)
 *   - 9 domain roots (hardcoded, matching build-backbone.ts)
 *
 * Outputs:
 *   - data/taxonomy/unified-taxonomy.v0.json
 *   - docs/system-audit/13 - Unified Topic Taxonomy v0.md
 *
 * Usage:
 *   npx tsx scripts/taxonomy/build_unified_taxonomy.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TOC_DIR = path.join(PROJECT_ROOT, 'data/taxonomy/toc');
const OUTPUT_JSON = path.join(PROJECT_ROOT, 'data/taxonomy/unified-taxonomy.v0.json');
const OUTPUT_DOC = path.join(PROJECT_ROOT, 'docs/system-audit/13 - Unified Topic Taxonomy v0.md');

// ---------------------------------------------------------------------------
// Domain roots (must match build-backbone.ts)
// ---------------------------------------------------------------------------

const DOMAIN_ROOTS = [
  { slug: 'tax:national-airspace-system', title: 'National Airspace System', keywords: ['airspace', 'nas', 'atc', 'air traffic', 'transponder', 'radar', 'mode c', 'ads-b', 'tfr', 'notam', 'sua', 'special use'] },
  { slug: 'tax:aviation-weather', title: 'Aviation Weather', keywords: ['weather', 'metar', 'taf', 'icing', 'turbulence', 'thunderstorm', 'visibility', 'ceiling', 'wind', 'fog', 'cloud', 'convective', 'frontal', 'pressure', 'temperature', 'dewpoint', 'pirep', 'sigmet', 'airmet'] },
  { slug: 'tax:aircraft-systems', title: 'Aircraft Systems and Performance', keywords: ['engine', 'fuel', 'electrical', 'hydraulic', 'landing gear', 'propeller', 'vacuum', 'pitot', 'static', 'gyro', 'performance', 'v-speed', 'manifold', 'carburetor', 'magneto', 'oil', 'battery', 'alternator'] },
  { slug: 'tax:navigation', title: 'Navigation and Flight Planning', keywords: ['navigation', 'vor', 'gps', 'rnav', 'ils', 'ndb', 'dme', 'chart', 'sectional', 'approach plate', 'flight plan', 'waypoint', 'route', 'airway', 'departure', 'arrival', 'sid', 'star', 'weight', 'balance', 'fuel planning', 'cross-country'] },
  { slug: 'tax:regulations', title: 'Regulations and Compliance', keywords: ['cfr', 'regulation', 'far', 'certificate', 'medical', 'endorsement', 'logbook', 'currency', 'recency', 'biennial', 'flight review', 'exemption', 'waiver', 'ntsb', 'enforcement', 'pilot in command', 'responsibility'] },
  { slug: 'tax:flight-operations', title: 'Flight Operations and Procedures', keywords: ['takeoff', 'landing', 'taxi', 'pattern', 'approach', 'go-around', 'emergency', 'checklist', 'preflight', 'postflight', 'night', 'cross-country', 'solo', 'passenger', 'cargo', 'cruise', 'climb', 'descent'] },
  { slug: 'tax:aerodynamics', title: 'Aerodynamics and Principles of Flight', keywords: ['lift', 'drag', 'thrust', 'angle of attack', 'stall', 'spin', 'load factor', 'stability', 'wing', 'airfoil', 'bernoulli', 'induced', 'parasite', 'maneuvering speed', 'center of gravity', 'center of pressure', 'adverse yaw', 'p-factor'] },
  { slug: 'tax:human-factors', title: 'Human Factors and ADM', keywords: ['human factors', 'adm', 'aeronautical decision', 'risk', 'hazard', 'crm', 'crew resource', 'fatigue', 'hypoxia', 'spatial disorientation', 'illusion', 'stress', 'imsafe', 'pave', 'decide', 'fitness', 'alcohol', 'medication'] },
  { slug: 'tax:instrument-flying', title: 'Instrument Flying', keywords: ['instrument', 'ifr', 'imc', 'approach', 'holding', 'procedure turn', 'missed approach', 'alternate', 'clearance', 'scan', 'partial panel', 'unusual attitude', 'minimums', 'decision altitude', 'mda', 'precision', 'non-precision'] },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TocEntry {
  toc_level: number;
  title: string;
  page: number | null;
  raw_title: string;
  source_file: string;
  parent_title: string | null;
}

interface TocFile {
  doc_abbrev: string;
  doc_title: string;
  faa_number: string;
  files_processed: string[];
  total_entries: number;
  entries: TocEntry[];
}

interface TaxonomyNode {
  slug: string;
  title: string;
  level: 1 | 2 | 3;
  parent_slug: string | null;
  source_provenance: { doc_abbrev: string; toc_path: string; page: number | null }[];
  synonyms: string[];
  children?: TaxonomyNode[];
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// ---------------------------------------------------------------------------
// Keyword matching
// ---------------------------------------------------------------------------

function scoreDomainRoot(title: string, root: typeof DOMAIN_ROOTS[0]): number {
  const lower = title.toLowerCase();
  let score = 0;
  for (const kw of root.keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function findBestDomainRoot(title: string): string {
  let bestSlug = DOMAIN_ROOTS[0].slug;
  let bestScore = 0;
  for (const root of DOMAIN_ROOTS) {
    const score = scoreDomainRoot(title, root);
    if (score > bestScore) {
      bestScore = score;
      bestSlug = root.slug;
    }
  }
  return bestSlug;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function normalizeForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/chapter\d+/g, '')
    .replace(/section\d+/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Building unified taxonomy v0...\n');

  // Load all TOC files
  const tocFiles: TocFile[] = [];
  const tocDir = fs.readdirSync(TOC_DIR).filter(f => f.endsWith('.json'));

  for (const filename of tocDir) {
    const content = fs.readFileSync(path.join(TOC_DIR, filename), 'utf-8');
    const parsed = JSON.parse(content) as TocFile;
    if (parsed.total_entries > 0) {
      tocFiles.push(parsed);
    }
  }

  console.log(`Loaded ${tocFiles.length} TOC files with entries`);

  // Step 1: Create level-1 nodes from domain roots
  const taxonomy: TaxonomyNode[] = DOMAIN_ROOTS.map(root => ({
    slug: root.slug,
    title: root.title,
    level: 1 as const,
    parent_slug: null,
    source_provenance: [],
    synonyms: [],
    children: [],
  }));

  const nodeMap = new Map<string, TaxonomyNode>();
  for (const node of taxonomy) {
    nodeMap.set(node.slug, node);
  }

  // Step 2: Process L1 TOC entries — merge into domain roots or create new L1 nodes
  const l1Entries: { entry: TocEntry; doc: string }[] = [];
  const l2Entries: { entry: TocEntry; doc: string }[] = [];
  const l3Entries: { entry: TocEntry; doc: string }[] = [];

  for (const toc of tocFiles) {
    for (const entry of toc.entries) {
      const rec = { entry, doc: toc.doc_abbrev };
      if (entry.toc_level === 1) l1Entries.push(rec);
      else if (entry.toc_level === 2) l2Entries.push(rec);
      else if (entry.toc_level === 3) l3Entries.push(rec);
    }
  }

  console.log(`  L1 entries: ${l1Entries.length}`);
  console.log(`  L2 entries: ${l2Entries.length}`);
  console.log(`  L3 entries: ${l3Entries.length}`);

  // Map L1 entries to domain roots (don't create new L1 nodes — keep it simple)
  const l1Mapping: Map<string, string> = new Map(); // normalized_title -> domain_root_slug

  for (const { entry, doc } of l1Entries) {
    const bestRoot = findBestDomainRoot(entry.title);
    l1Mapping.set(normalizeForDedup(entry.title), bestRoot);

    // Add provenance to the root
    const rootNode = nodeMap.get(bestRoot);
    if (rootNode) {
      rootNode.source_provenance.push({
        doc_abbrev: doc,
        toc_path: entry.title,
        page: entry.page,
      });
    }
  }

  // Step 3: Create L2 nodes from TOC entries
  const dedupL2 = new Map<string, TaxonomyNode>();

  for (const { entry, doc } of l2Entries) {
    const dedupKey = normalizeForDedup(entry.title);

    if (dedupL2.has(dedupKey)) {
      // Merge provenance
      const existing = dedupL2.get(dedupKey);
      existing?.source_provenance.push({
        doc_abbrev: doc,
        toc_path: entry.parent_title ? `${entry.parent_title} > ${entry.title}` : entry.title,
        page: entry.page,
      });
      continue;
    }

    // Find parent domain root
    let parentSlug: string;
    if (entry.parent_title) {
      const parentKey = normalizeForDedup(entry.parent_title);
      parentSlug = l1Mapping.get(parentKey) || findBestDomainRoot(entry.title);
    } else {
      parentSlug = findBestDomainRoot(entry.title);
    }

    const slug = `tax:${slugify(entry.title)}`;
    const node: TaxonomyNode = {
      slug,
      title: entry.title,
      level: 2,
      parent_slug: parentSlug,
      source_provenance: [{
        doc_abbrev: doc,
        toc_path: entry.parent_title ? `${entry.parent_title} > ${entry.title}` : entry.title,
        page: entry.page,
      }],
      synonyms: [],
      children: [],
    };

    dedupL2.set(dedupKey, node);
    nodeMap.set(slug, node);

    // Add as child of parent
    const parent = nodeMap.get(parentSlug);
    if (parent?.children) {
      parent.children.push(node);
    }
  }

  console.log(`  L2 nodes after dedup: ${dedupL2.size}`);

  // Step 4: Create L3 nodes from TOC entries
  const dedupL3 = new Map<string, TaxonomyNode>();

  for (const { entry, doc } of l3Entries) {
    const dedupKey = normalizeForDedup(entry.title);

    if (dedupL3.has(dedupKey)) {
      const existing = dedupL3.get(dedupKey);
      existing?.source_provenance.push({
        doc_abbrev: doc,
        toc_path: entry.parent_title ? `${entry.parent_title} > ${entry.title}` : entry.title,
        page: entry.page,
      });
      continue;
    }

    // Find parent L2 node
    let parentSlug: string | null = null;
    if (entry.parent_title) {
      const parentKey = normalizeForDedup(entry.parent_title);
      const parentNode = dedupL2.get(parentKey);
      parentSlug = parentNode?.slug || null;
    }

    // If no L2 parent found, skip or attach to best domain root as L2
    if (!parentSlug) {
      parentSlug = findBestDomainRoot(entry.title);
    }

    const slug = `tax:${slugify(entry.title)}`;
    const node: TaxonomyNode = {
      slug,
      title: entry.title,
      level: 3,
      parent_slug: parentSlug,
      source_provenance: [{
        doc_abbrev: doc,
        toc_path: entry.parent_title ? `${entry.parent_title} > ${entry.title}` : entry.title,
        page: entry.page,
      }],
      synonyms: [],
    };

    dedupL3.set(dedupKey, node);
    nodeMap.set(slug, node);

    // Add as child of parent
    const parent = nodeMap.get(parentSlug);
    if (parent?.children) {
      parent.children.push(node);
    }
  }

  console.log(`  L3 nodes after dedup: ${dedupL3.size}`);

  // Step 5: Compute stats
  const allNodes = Array.from(nodeMap.values());
  const l1Count = allNodes.filter(n => n.level === 1).length;
  const l2Count = allNodes.filter(n => n.level === 2).length;
  const l3Count = allNodes.filter(n => n.level === 3).length;
  const totalNodes = allNodes.length;

  // Duplicate clusters (same dedup key appearing in multiple docs)
  const multiDocEntries: { title: string; docs: string[] }[] = [];
  for (const [key, node] of dedupL2) {
    const docs = [...new Set(node.source_provenance.map(p => p.doc_abbrev))];
    if (docs.length > 1) {
      multiDocEntries.push({ title: node.title, docs });
    }
  }
  for (const [key, node] of dedupL3) {
    const docs = [...new Set(node.source_provenance.map(p => p.doc_abbrev))];
    if (docs.length > 1) {
      multiDocEntries.push({ title: node.title, docs });
    }
  }

  // Doc contribution
  const docContrib: Record<string, number> = {};
  for (const node of allNodes) {
    for (const prov of node.source_provenance) {
      docContrib[prov.doc_abbrev] = (docContrib[prov.doc_abbrev] || 0) + 1;
    }
  }

  // Step 6: Write JSON
  const flatNodes = allNodes.map(n => ({
    slug: n.slug,
    title: n.title,
    level: n.level,
    parent_slug: n.parent_slug,
    source_provenance: n.source_provenance,
    synonyms: n.synonyms,
  }));

  const output = {
    version: 'v0',
    generated: new Date().toISOString(),
    stats: { total: totalNodes, l1: l1Count, l2: l2Count, l3: l3Count },
    domain_roots: DOMAIN_ROOTS.map(r => r.slug),
    nodes: flatNodes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
  console.log(`\nJSON: ${OUTPUT_JSON}`);

  // Step 7: Write markdown report
  const dateStr = new Date().toISOString().split('T')[0];
  const md: string[] = [
    '---',
    'title: "Unified Topic Taxonomy v0"',
    `date: ${dateStr}`,
    'type: system-audit',
    'tags: [heydpe, taxonomy, knowledge-graph, audit]',
    'status: draft',
    'evidence_level: medium',
    '---',
    '',
    '# 13 — Unified Topic Taxonomy v0',
    '',
    `**Generated:** ${dateStr}`,
    '**Source:** PDF TOC extraction via PyMuPDF + 9 domain root anchors',
    '',
    '---',
    '',
    '## Stats',
    '',
    '| Level | Count |',
    '|-------|-------|',
    `| L1 (Domain Roots) | ${l1Count} |`,
    `| L2 (Sections) | ${l2Count} |`,
    `| L3 (Subsections) | ${l3Count} |`,
    `| **Total** | **${totalNodes}** |`,
    '',
    '## Document Contributions',
    '',
    '| Document | Nodes Contributed |',
    '|----------|-------------------|',
  ];

  for (const [doc, count] of Object.entries(docContrib).sort((a, b) => b[1] - a[1])) {
    const tocFile = tocFiles.find(t => t.doc_abbrev === doc);
    md.push(`| ${doc} — ${tocFile?.doc_title || doc} | ${count} |`);
  }

  md.push('', '## Domain Root Distribution', '');
  md.push('| Domain Root | L2 Children | L3 Children |');
  md.push('|-------------|-------------|-------------|');

  for (const root of taxonomy) {
    const l2Children = root.children?.length || 0;
    const l3Children = root.children?.reduce((sum, c) => sum + (c.children?.length || 0), 0) || 0;
    md.push(`| ${root.title} | ${l2Children} | ${l3Children} |`);
  }

  md.push('', '## Duplicate Clusters (same topic across multiple documents)', '');
  if (multiDocEntries.length > 0) {
    md.push(`Found ${multiDocEntries.length} topics appearing in multiple documents:`, '');
    md.push('| Topic | Documents |');
    md.push('|-------|-----------|');
    for (const { title, docs } of multiDocEntries.slice(0, 30)) {
      md.push(`| ${title} | ${docs.join(', ')} |`);
    }
    if (multiDocEntries.length > 30) {
      md.push(`| *(${multiDocEntries.length - 30} more)* | |`);
    }
  } else {
    md.push('No duplicate clusters detected.');
  }

  md.push('', '## Missing Coverage ("Doesn\'t Fit" Bucket)', '');
  md.push('The following document groups had **zero TOC entries** extracted:', '');
  const missingDocs = ['ifh', 'cfr'].filter(d => {
    const toc = tocFiles.find(t => t.doc_abbrev === d);
    return !toc || toc.total_entries === 0;
  });
  for (const doc of missingDocs) {
    md.push(`- **${doc}**: PDF has no bookmarks/TOC. Will need manual chapter headings or LLM extraction.`);
  }
  md.push('');
  md.push('Topics that may not fit existing domain roots:');
  md.push('- Canadian airspace rules');
  md.push('- UAS/drone regulations (Part 107)');
  md.push('- Sport pilot / recreational pilot specifics');
  md.push('- Ground instructor topics');
  md.push('');
  md.push('These should be added as the taxonomy is refined.');

  md.push('', '## Sample L2 Nodes', '');
  md.push('| Slug | Title | Parent |');
  md.push('|------|-------|--------|');
  const sampleL2 = Array.from(dedupL2.values()).slice(0, 25);
  for (const node of sampleL2) {
    md.push(`| ${node.slug} | ${node.title} | ${node.parent_slug} |`);
  }

  md.push('', '---', '', `*Generated by build_unified_taxonomy.ts*`);

  fs.mkdirSync(path.dirname(OUTPUT_DOC), { recursive: true });
  fs.writeFileSync(OUTPUT_DOC, md.join('\n'));
  console.log(`Doc: ${OUTPUT_DOC}`);

  // Console summary
  console.log(`\n=== Taxonomy v0 Summary ===`);
  console.log(`  Total nodes: ${totalNodes} (L1: ${l1Count}, L2: ${l2Count}, L3: ${l3Count})`);
  console.log(`  Duplicate clusters: ${multiDocEntries.length}`);
  console.log(`  Missing docs (no TOC): ${missingDocs.join(', ') || 'none'}`);
}

main();
