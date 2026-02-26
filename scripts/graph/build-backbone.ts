#!/usr/bin/env npx tsx
/**
 * build-backbone.ts — Backbone Seeding & Orphan Attachment
 *
 * Ensures the knowledge graph has a connected hierarchical backbone by:
 *
 * 1. Seeding domain root concepts (NAS, Weather, Regulations, etc.)
 * 2. Creating is_component_of edges from topic/definition nodes to domain roots
 * 3. Attaching orphan concepts to the nearest domain root based on content/key_facts
 * 4. Creating requires_knowledge_of edges for obvious prerequisites
 *
 * All operations are idempotent (upsert via ON CONFLICT).
 * Write operations require ALLOW_PROD_WRITE=1 for production environments.
 *
 * Usage:
 *   npx tsx scripts/graph/build-backbone.ts                # Full run
 *   npx tsx scripts/graph/build-backbone.ts --dry-run      # Preview without writes
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/build-backbone.ts  # Production write
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
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
// Environment safety
// ---------------------------------------------------------------------------

async function checkEnvironment(dryRun: boolean) {
  const { data } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'app.environment')
    .single();

  const envName = (data?.value as { name?: string })?.name ?? 'unknown';
  console.log(`Environment: ${envName}`);

  if (envName === 'production' && !dryRun) {
    if (process.env.ALLOW_PROD_WRITE !== '1') {
      console.error('ERROR: Production writes require ALLOW_PROD_WRITE=1');
      console.error('  Set: ALLOW_PROD_WRITE=1 npx tsx scripts/graph/build-backbone.ts');
      process.exit(1);
    }
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production writes enabled!');
  }

  return envName;
}

// ---------------------------------------------------------------------------
// Domain backbone definitions
// ---------------------------------------------------------------------------

interface DomainRoot {
  name: string;
  slug: string;
  content: string;
  keywords: string[]; // Used to match orphans to this domain
}

const DOMAIN_ROOTS: DomainRoot[] = [
  {
    name: 'National Airspace System',
    slug: 'topic:national-airspace-system',
    content: 'The National Airspace System (NAS) encompasses all US airspace, navigation facilities, equipment, services, airports, aeronautical charts, rules, regulations, procedures, technical information, and manpower.',
    keywords: ['airspace', 'class a', 'class b', 'class c', 'class d', 'class e', 'class g', 'controlled airspace', 'uncontrolled', 'special use', 'tfr', 'notam', 'sua', 'moa', 'restricted area', 'prohibited area'],
  },
  {
    name: 'Aviation Weather',
    slug: 'topic:aviation-weather',
    content: 'Aviation weather encompasses meteorological phenomena, weather products, and forecasting services relevant to flight safety including METARs, TAFs, AIRMETs, SIGMETs, and pilot weather reports.',
    keywords: ['weather', 'metar', 'taf', 'sigmet', 'airmet', 'pirep', 'icing', 'turbulence', 'thunderstorm', 'fog', 'visibility', 'ceiling', 'wind shear', 'convective', 'frontal', 'pressure', 'temperature', 'dew point', 'cloud', 'precipitation'],
  },
  {
    name: 'Aircraft Systems and Performance',
    slug: 'topic:aircraft-systems-and-performance',
    content: 'Aircraft systems include powerplant, electrical, fuel, hydraulic, flight control, and avionics systems. Performance encompasses takeoff, climb, cruise, and landing performance calculations.',
    keywords: ['engine', 'propeller', 'fuel system', 'electrical', 'hydraulic', 'flight controls', 'avionics', 'performance', 'takeoff', 'landing', 'climb rate', 'density altitude', 'weight and balance', 'v-speed', 'manifold pressure', 'rpm', 'mixture'],
  },
  {
    name: 'Navigation and Flight Planning',
    slug: 'topic:navigation-and-flight-planning',
    content: 'Navigation methods and flight planning procedures including pilotage, dead reckoning, VOR, GPS, ILS, and cross-country flight planning requirements.',
    keywords: ['navigation', 'vor', 'gps', 'ils', 'ndb', 'waypoint', 'flight plan', 'cross-country', 'pilotage', 'dead reckoning', 'chart', 'sectional', 'enroute', 'approach plate', 'departure procedure', 'arrival'],
  },
  {
    name: 'Regulations and Compliance',
    slug: 'topic:regulations-and-compliance',
    content: 'Federal Aviation Regulations (14 CFR), AIM procedures, and compliance requirements for pilots, aircraft, and operations.',
    keywords: ['cfr', 'regulation', 'far', 'requirement', 'certificate', 'medical', 'currency', 'logbook', 'inspection', 'airworthiness', 'ad', 'type certificate', 'registration', 'operating limitation'],
  },
  {
    name: 'Flight Operations and Procedures',
    slug: 'topic:flight-operations-and-procedures',
    content: 'Standard operating procedures for all phases of flight including preflight, taxi, takeoff, enroute, approach, and landing operations.',
    keywords: ['preflight', 'taxi', 'takeoff', 'landing', 'approach', 'departure', 'pattern', 'go-around', 'missed approach', 'holding', 'emergency', 'checklist', 'atc', 'clearance', 'communication'],
  },
  {
    name: 'Aerodynamics and Principles of Flight',
    slug: 'topic:aerodynamics-and-principles-of-flight',
    content: 'Fundamental aerodynamic principles including lift, drag, thrust, weight, angle of attack, stalls, spins, and stability.',
    keywords: ['lift', 'drag', 'thrust', 'weight', 'angle of attack', 'stall', 'spin', 'stability', 'load factor', 'maneuvering speed', 'aerodynamic', 'bernoulli', 'airfoil', 'induced drag', 'parasite drag', 'ground effect'],
  },
  {
    name: 'Human Factors and Aeronautical Decision Making',
    slug: 'topic:human-factors-and-adm',
    content: 'Aeronautical Decision Making (ADM), Crew Resource Management (CRM), hazardous attitudes, IMSAFE checklist, and physiological factors affecting flight safety.',
    keywords: ['adm', 'decision making', 'crm', 'hazardous attitude', 'imsafe', 'hypoxia', 'spatial disorientation', 'fatigue', 'stress', 'risk management', 'personal minimums', 'pave', 'decide', 'human factors'],
  },
  {
    name: 'Instrument Flying',
    slug: 'topic:instrument-flying',
    content: 'Instrument flight rules (IFR) operations, instrument approaches, holding patterns, and instrument navigation including partial panel procedures.',
    keywords: ['ifr', 'instrument', 'approach', 'holding', 'procedure turn', 'missed approach', 'partial panel', 'unusual attitude', 'scan', 'attitude indicator', 'heading indicator', 'altimeter', 'airspeed indicator'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
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

function matchesDomain(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Step 1: Seed domain root concepts
// ---------------------------------------------------------------------------

async function seedDomainRoots(dryRun: boolean): Promise<Map<string, string>> {
  console.log('\n--- Step 1: Seed Domain Root Concepts ---');
  const slugToId = new Map<string, string>();

  for (const domain of DOMAIN_ROOTS) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('concepts')
      .select('id')
      .eq('slug', domain.slug)
      .maybeSingle();

    if (existing) {
      slugToId.set(domain.slug, existing.id);
      console.log(`  [EXISTS] ${domain.name} (${domain.slug})`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would create: ${domain.name} (${domain.slug})`);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('concepts')
      .insert({
        name: domain.name,
        slug: domain.slug,
        name_normalized: domain.name.toLowerCase(),
        aliases: [],
        category: 'topic',
        content: domain.content,
        key_facts: JSON.stringify(domain.keywords.slice(0, 5)),
        common_misconceptions: JSON.stringify([]),
        validation_status: 'validated',
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  [ERROR] ${domain.name}: ${error.message}`);
    } else if (inserted) {
      slugToId.set(domain.slug, inserted.id);
      console.log(`  [CREATED] ${domain.name} (${domain.slug})`);
    }
  }

  return slugToId;
}

// ---------------------------------------------------------------------------
// Step 2: Attach orphan concepts to domain roots
// ---------------------------------------------------------------------------

async function attachOrphans(
  domainRootIds: Map<string, string>,
  dryRun: boolean,
): Promise<number> {
  console.log('\n--- Step 2: Attach Orphan Concepts ---');

  // Fetch all concepts
  const concepts = await fetchAll<{
    id: string; name: string; slug: string; category: string;
    content: string; key_facts: string[] | null;
  }>('concepts', 'id, name, slug, category, content, key_facts');

  // Fetch all edges to find orphans
  const relations = await fetchAll<{ source_id: string; target_id: string }>(
    'concept_relations', 'source_id, target_id');

  const connectedIds = new Set<string>();
  for (const r of relations) {
    connectedIds.add(r.source_id);
    connectedIds.add(r.target_id);
  }

  const orphans = concepts.filter(c =>
    !connectedIds.has(c.id) &&
    ['topic', 'definition', 'procedure'].includes(c.category)
  );

  console.log(`  Found ${orphans.length} orphan topic/definition/procedure concepts`);

  // Resolve domain root IDs (fetch from DB if not provided)
  const domainRoots: Array<{ id: string; slug: string; keywords: string[] }> = [];
  for (const domain of DOMAIN_ROOTS) {
    const id = domainRootIds.get(domain.slug);
    if (id) {
      domainRoots.push({ id, slug: domain.slug, keywords: domain.keywords });
    } else {
      const { data } = await supabase
        .from('concepts')
        .select('id')
        .eq('slug', domain.slug)
        .maybeSingle();
      if (data) {
        domainRoots.push({ id: data.id, slug: domain.slug, keywords: domain.keywords });
      }
    }
  }

  if (domainRoots.length === 0) {
    console.log('  No domain roots found — run with --seed first');
    return 0;
  }

  let attachedCount = 0;
  const batchSize = 50;

  for (let i = 0; i < orphans.length; i += batchSize) {
    const batch = orphans.slice(i, i + batchSize);
    const edgesToInsert: Array<{
      source_id: string;
      target_id: string;
      relation_type: string;
      weight: number;
      confidence: number;
    }> = [];

    for (const orphan of batch) {
      // Build text to match against keywords
      const textToMatch = [
        orphan.name,
        orphan.content || '',
        ...(orphan.key_facts ?? []),
      ].join(' ');

      // Score against each domain
      let bestDomain: typeof domainRoots[0] | null = null;
      let bestScore = 0;

      for (const domain of domainRoots) {
        const score = matchesDomain(textToMatch, domain.keywords);
        if (score > bestScore) {
          bestScore = score;
          bestDomain = domain;
        }
      }

      if (bestDomain && bestScore >= 1) {
        edgesToInsert.push({
          source_id: orphan.id,
          target_id: bestDomain.id,
          relation_type: 'leads_to_discussion_of',
          weight: Math.min(bestScore / 3, 1.0),
          confidence: Math.min(bestScore / 5, 0.9),
        });
      }
    }

    if (dryRun) {
      attachedCount += edgesToInsert.length;
      if (i === 0) {
        console.log(`  [DRY RUN] Sample attachments:`);
        for (const e of edgesToInsert.slice(0, 5)) {
          const orphan = batch.find(o => o.id === e.source_id);
          const domain = domainRoots.find(d => d.id === e.target_id);
          console.log(`    ${orphan?.name?.slice(0, 50)} -> ${domain?.slug}`);
        }
      }
      continue;
    }

    // Batch upsert
    if (edgesToInsert.length > 0) {
      const { error } = await supabase
        .from('concept_relations')
        .upsert(edgesToInsert, { onConflict: 'source_id,target_id,relation_type' });

      if (error) {
        console.error(`  Batch upsert error: ${error.message}`);
      } else {
        attachedCount += edgesToInsert.length;
      }
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= orphans.length) {
      console.log(`  Processed ${Math.min(i + batchSize, orphans.length)}/${orphans.length}, attached ${attachedCount}`);
    }
  }

  console.log(`  Total attached: ${attachedCount}`);
  return attachedCount;
}

// ---------------------------------------------------------------------------
// Step 3: Create airspace hierarchy edges
// ---------------------------------------------------------------------------

async function buildAirspaceHierarchy(dryRun: boolean): Promise<number> {
  console.log('\n--- Step 3: Build Airspace Hierarchy ---');

  // Find the NAS root
  const { data: nasRoot } = await supabase
    .from('concepts')
    .select('id')
    .eq('slug', 'topic:national-airspace-system')
    .maybeSingle();

  if (!nasRoot) {
    console.log('  NAS root not found — skip');
    return 0;
  }

  // Find airspace-related concepts
  const airspacePatterns = [
    { pattern: /class[- ]?a/i, name: 'Class A Airspace' },
    { pattern: /class[- ]?b/i, name: 'Class B Airspace' },
    { pattern: /class[- ]?c/i, name: 'Class C Airspace' },
    { pattern: /class[- ]?d/i, name: 'Class D Airspace' },
    { pattern: /class[- ]?e/i, name: 'Class E Airspace' },
    { pattern: /class[- ]?g/i, name: 'Class G Airspace' },
    { pattern: /special use airspace/i, name: 'Special Use Airspace' },
    { pattern: /temporary flight restriction|tfr/i, name: 'TFR' },
  ];

  const concepts = await fetchAll<{
    id: string; name: string; slug: string; category: string; content: string;
  }>('concepts', 'id, name, slug, category, content');

  let edgesCreated = 0;

  for (const ap of airspacePatterns) {
    // Find concepts whose name or content mentions this airspace class
    const matching = concepts.filter(c =>
      ['topic', 'definition', 'procedure', 'regulatory_claim'].includes(c.category) &&
      (ap.pattern.test(c.name) || ap.pattern.test(c.content?.slice(0, 200) ?? ''))
    );

    if (matching.length === 0) continue;

    console.log(`  ${ap.name}: ${matching.length} matching concepts`);

    if (dryRun) {
      for (const m of matching.slice(0, 3)) {
        console.log(`    [DRY RUN] ${m.name.slice(0, 60)} -> NAS root`);
      }
      edgesCreated += matching.length;
      continue;
    }

    // Create edges from matching concepts to NAS root
    const edges = matching.map(m => ({
      source_id: m.id,
      target_id: nasRoot.id,
      relation_type: 'is_component_of' as const,
      weight: 0.9,
      confidence: 0.85,
    }));

    for (let i = 0; i < edges.length; i += 50) {
      const batch = edges.slice(i, i + 50);
      const { error } = await supabase
        .from('concept_relations')
        .upsert(batch, { onConflict: 'source_id,target_id,relation_type' });

      if (error) {
        // Some may fail on unique constraint — that's fine
        if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
          console.error(`  Upsert error: ${error.message}`);
        }
      } else {
        edgesCreated += batch.length;
      }
    }
  }

  console.log(`  Total airspace edges: ${edgesCreated}`);
  return edgesCreated;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n=== Knowledge Graph Backbone Builder ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  const envName = await checkEnvironment(dryRun);

  // Step 1: Seed domain roots
  const domainRootIds = await seedDomainRoots(dryRun);

  // Step 2: Attach orphans to domain roots
  const attached = await attachOrphans(domainRootIds, dryRun);

  // Step 3: Build airspace hierarchy
  const airspaceEdges = await buildAirspaceHierarchy(dryRun);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`  Environment:    ${envName}`);
  console.log(`  Mode:           ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Domain roots:   ${domainRootIds.size} seeded/verified`);
  console.log(`  Orphans attached: ${attached}`);
  console.log(`  Airspace edges: ${airspaceEdges}`);

  if (dryRun) {
    console.log('\n  Run without --dry-run to apply changes.');
    console.log('  For production: ALLOW_PROD_WRITE=1 npx tsx scripts/graph/build-backbone.ts');
  }
}

main().catch((err) => {
  console.error('Backbone builder error:', err);
  process.exit(1);
});
