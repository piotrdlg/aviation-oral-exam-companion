#!/usr/bin/env npx tsx
/**
 * attach_hub_scaffold.ts — Hub Root Scaffold
 *
 * Creates 4 hub root concept nodes and attaches existing domain roots
 * and ACS areas to them via is_component_of edges.
 *
 * Constraints:
 * - ONLY is_component_of edges are created
 * - Every edge context starts with hub_scaffold:v1: for rollback
 * - --dry-run is the default mode
 * - --write mode requires ALLOW_PROD_WRITE=1 for production
 * - Idempotent: upserts concepts by slug, upserts edges by unique constraint
 *
 * Usage:
 *   npx tsx scripts/graph/attach_hub_scaffold.ts              # dry-run (default)
 *   npx tsx scripts/graph/attach_hub_scaffold.ts --write      # live write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_hub_scaffold.ts --write  # production
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
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
// Environment safety
// ---------------------------------------------------------------------------

async function checkEnvironment(dryRun: boolean): Promise<string> {
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
      console.error(
        '  Set: ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_hub_scaffold.ts --write',
      );
      process.exit(1);
    }
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production writes enabled!');
  }

  return envName;
}

// ---------------------------------------------------------------------------
// Hub root definitions
// ---------------------------------------------------------------------------

interface HubRoot {
  slug: string;
  name: string;
  content: string;
}

const HUB_ROOTS: HubRoot[] = [
  {
    slug: 'hub:knowledge',
    name: 'Knowledge Hub',
    content:
      'FAA handbooks, AIM, advisory circulars — the core aviation knowledge base covering aerodynamics, weather, navigation, regulations, flight operations, human factors, and instrument flying.',
  },
  {
    slug: 'hub:acs',
    name: 'ACS Hub',
    content:
      'Airman Certification Standards — the structured FAA exam requirements organized by rating (Private, Commercial, Instrument), area of operation, task, and testable element.',
  },
  {
    slug: 'hub:regulations',
    name: 'Regulations Hub',
    content:
      '14 CFR regulatory framework — Title 14 of the Code of Federal Regulations covering pilot certification, operating rules, airworthiness standards, and airspace designations.',
  },
  {
    slug: 'hub:aircraft',
    name: 'Aircraft Hub',
    content:
      'Aircraft-specific knowledge — systems, limitations, performance data, normal procedures, and abnormal/emergency procedures for general aviation airplanes.',
  },
];

// ---------------------------------------------------------------------------
// Domain root slugs (9 existing domain roots)
// ---------------------------------------------------------------------------

const DOMAIN_ROOT_SLUGS = [
  'topic:national-airspace-system',
  'topic:aviation-weather',
  'topic:aircraft-systems-and-performance',
  'topic:navigation-and-flight-planning',
  'topic:regulations-and-compliance',
  'topic:flight-operations-and-procedures',
  'topic:aerodynamics-and-principles-of-flight',
  'topic:human-factors-and-adm',
  'topic:instrument-flying',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAll<T>(
  table: string,
  columns: string,
  filter?: { column: string; value: string },
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    let query = supabase.from(table).select(columns);
    if (filter) {
      query = query.eq(filter.column, filter.value);
    }
    const { data, error } = await query.range(offset, offset + pageSize - 1);
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
// Tracking
// ---------------------------------------------------------------------------

interface EdgeRecord {
  sourceSlug: string;
  targetSlug: string;
  context: string;
  status: 'created' | 'exists' | 'error' | 'dry-run';
}

interface ConceptRecord {
  slug: string;
  name: string;
  status: 'created' | 'exists' | 'error' | 'dry-run';
}

const conceptResults: ConceptRecord[] = [];
const edgeResults: EdgeRecord[] = [];

// ---------------------------------------------------------------------------
// Step 1: Create 4 hub root concept nodes
// ---------------------------------------------------------------------------

async function seedHubRoots(dryRun: boolean): Promise<Map<string, string>> {
  console.log('\nStep 1: Hub root concepts...');
  const slugToId = new Map<string, string>();

  for (const hub of HUB_ROOTS) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('concepts')
      .select('id')
      .eq('slug', hub.slug)
      .maybeSingle();

    if (existing) {
      slugToId.set(hub.slug, existing.id);
      console.log(`  [EXISTS] ${hub.slug} — ${hub.name}`);
      conceptResults.push({ slug: hub.slug, name: hub.name, status: 'exists' });
      continue;
    }

    if (dryRun) {
      console.log(`  [CREATE] ${hub.slug} — ${hub.name}`);
      conceptResults.push({ slug: hub.slug, name: hub.name, status: 'dry-run' });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('concepts')
      .upsert(
        {
          name: hub.name,
          slug: hub.slug,
          name_normalized: hub.name.toLowerCase(),
          aliases: [],
          category: 'topic',
          content: hub.content,
          key_facts: JSON.stringify([]),
          common_misconceptions: JSON.stringify([]),
          validation_status: 'validated',
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single();

    if (error) {
      console.error(`  [ERROR] ${hub.slug}: ${error.message}`);
      conceptResults.push({ slug: hub.slug, name: hub.name, status: 'error' });
    } else if (inserted) {
      slugToId.set(hub.slug, inserted.id);
      console.log(`  [CREATE] ${hub.slug} — ${hub.name}`);
      conceptResults.push({ slug: hub.slug, name: hub.name, status: 'created' });
    }
  }

  return slugToId;
}

// ---------------------------------------------------------------------------
// Step 2: Domain root -> hub:knowledge edges
// ---------------------------------------------------------------------------

async function attachDomainRootsToKnowledgeHub(
  hubIds: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  console.log('\nStep 2: Domain root -> hub:knowledge edges...');

  const knowledgeHubId = hubIds.get('hub:knowledge');

  // Fetch domain root concepts
  for (const slug of DOMAIN_ROOT_SLUGS) {
    const { data: concept } = await supabase
      .from('concepts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!concept) {
      console.error(`  [ERROR] Domain root not found: ${slug}`);
      edgeResults.push({
        sourceSlug: slug,
        targetSlug: 'hub:knowledge',
        context: 'hub_scaffold:v1:domain-root-to-hub',
        status: 'error',
      });
      continue;
    }

    if (!knowledgeHubId && !dryRun) {
      console.error(`  [ERROR] hub:knowledge not found — cannot create edges`);
      edgeResults.push({
        sourceSlug: slug,
        targetSlug: 'hub:knowledge',
        context: 'hub_scaffold:v1:domain-root-to-hub',
        status: 'error',
      });
      continue;
    }

    // Check if edge already exists
    if (knowledgeHubId) {
      const { data: existingEdge } = await supabase
        .from('concept_relations')
        .select('id')
        .eq('source_id', concept.id)
        .eq('target_id', knowledgeHubId)
        .eq('relation_type', 'is_component_of')
        .maybeSingle();

      if (existingEdge) {
        console.log(`  [EXISTS] ${slug} -> hub:knowledge (is_component_of)`);
        edgeResults.push({
          sourceSlug: slug,
          targetSlug: 'hub:knowledge',
          context: 'hub_scaffold:v1:domain-root-to-hub',
          status: 'exists',
        });
        continue;
      }
    }

    if (dryRun) {
      console.log(`  [CREATE] ${slug} -> hub:knowledge (is_component_of)`);
      edgeResults.push({
        sourceSlug: slug,
        targetSlug: 'hub:knowledge',
        context: 'hub_scaffold:v1:domain-root-to-hub',
        status: 'dry-run',
      });
      continue;
    }

    const { error } = await supabase
      .from('concept_relations')
      .upsert(
        {
          source_id: concept.id,
          target_id: knowledgeHubId,
          relation_type: 'is_component_of',
          weight: 1.0,
          confidence: 1.0,
          context: 'hub_scaffold:v1:domain-root-to-hub',
        },
        { onConflict: 'source_id,target_id,relation_type' },
      );

    if (error) {
      console.error(`  [ERROR] ${slug} -> hub:knowledge: ${error.message}`);
      edgeResults.push({
        sourceSlug: slug,
        targetSlug: 'hub:knowledge',
        context: 'hub_scaffold:v1:domain-root-to-hub',
        status: 'error',
      });
    } else {
      console.log(`  [CREATE] ${slug} -> hub:knowledge (is_component_of)`);
      edgeResults.push({
        sourceSlug: slug,
        targetSlug: 'hub:knowledge',
        context: 'hub_scaffold:v1:domain-root-to-hub',
        status: 'created',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3: ACS area -> hub:acs edges
// ---------------------------------------------------------------------------

async function attachAcsAreasToAcsHub(
  hubIds: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  console.log('\nStep 3: ACS area -> hub:acs edges...');

  const acsHubId = hubIds.get('hub:acs');

  // Fetch all acs_area concepts
  const acsAreas = await fetchAll<{ id: string; name: string; slug: string }>(
    'concepts',
    'id, name, slug',
    { column: 'category', value: 'acs_area' },
  );

  console.log(`  Found ${acsAreas.length} ACS area concepts`);

  if (acsAreas.length === 0) {
    console.log('  No ACS area concepts found — skipping');
    return;
  }

  for (const area of acsAreas) {
    if (!acsHubId && !dryRun) {
      console.error(`  [ERROR] hub:acs not found — cannot create edges`);
      edgeResults.push({
        sourceSlug: area.slug,
        targetSlug: 'hub:acs',
        context: 'hub_scaffold:v1:acs-area-to-hub',
        status: 'error',
      });
      continue;
    }

    // Check if edge already exists
    if (acsHubId) {
      const { data: existingEdge } = await supabase
        .from('concept_relations')
        .select('id')
        .eq('source_id', area.id)
        .eq('target_id', acsHubId)
        .eq('relation_type', 'is_component_of')
        .maybeSingle();

      if (existingEdge) {
        console.log(`  [EXISTS] ${area.slug} -> hub:acs (is_component_of)`);
        edgeResults.push({
          sourceSlug: area.slug,
          targetSlug: 'hub:acs',
          context: 'hub_scaffold:v1:acs-area-to-hub',
          status: 'exists',
        });
        continue;
      }
    }

    if (dryRun) {
      console.log(`  [CREATE] ${area.slug} -> hub:acs (is_component_of)`);
      edgeResults.push({
        sourceSlug: area.slug,
        targetSlug: 'hub:acs',
        context: 'hub_scaffold:v1:acs-area-to-hub',
        status: 'dry-run',
      });
      continue;
    }

    const { error } = await supabase
      .from('concept_relations')
      .upsert(
        {
          source_id: area.id,
          target_id: acsHubId,
          relation_type: 'is_component_of',
          weight: 1.0,
          confidence: 1.0,
          context: 'hub_scaffold:v1:acs-area-to-hub',
        },
        { onConflict: 'source_id,target_id,relation_type' },
      );

    if (error) {
      console.error(`  [ERROR] ${area.slug} -> hub:acs: ${error.message}`);
      edgeResults.push({
        sourceSlug: area.slug,
        targetSlug: 'hub:acs',
        context: 'hub_scaffold:v1:acs-area-to-hub',
        status: 'error',
      });
    } else {
      console.log(`  [CREATE] ${area.slug} -> hub:acs (is_component_of)`);
      edgeResults.push({
        sourceSlug: area.slug,
        targetSlug: 'hub:acs',
        context: 'hub_scaffold:v1:acs-area-to-hub',
        status: 'created',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(mode: string): string {
  const date = new Date().toISOString().slice(0, 10);

  // Concept stats
  const conceptsNew = conceptResults.filter(
    (c) => c.status === 'created' || c.status === 'dry-run',
  ).length;
  const conceptsExisting = conceptResults.filter(
    (c) => c.status === 'exists',
  ).length;

  // Edge stats by context
  const domainEdges = edgeResults.filter((e) =>
    e.context === 'hub_scaffold:v1:domain-root-to-hub',
  );
  const acsEdges = edgeResults.filter((e) =>
    e.context === 'hub_scaffold:v1:acs-area-to-hub',
  );

  const domainNew = domainEdges.filter(
    (e) => e.status === 'created' || e.status === 'dry-run',
  ).length;
  const domainExisting = domainEdges.filter(
    (e) => e.status === 'exists',
  ).length;

  const acsNew = acsEdges.filter(
    (e) => e.status === 'created' || e.status === 'dry-run',
  ).length;
  const acsExisting = acsEdges.filter(
    (e) => e.status === 'exists',
  ).length;

  const totalNewEdges = domainNew + acsNew;

  // Build concept rows
  const conceptRows = conceptResults
    .map((c) => `| ${c.slug} | ${c.status} |`)
    .join('\n');

  // Build edge rows
  const edgeRows = edgeResults
    .map(
      (e) =>
        `| ${e.sourceSlug} -> ${e.targetSlug} | is_component_of | ${e.context} | ${e.status} |`,
    )
    .join('\n');

  return `---
title: "Hub Scaffold — ${date}"
date: ${date}
type: graph-report
tags: [heydpe, knowledge-graph, multi-hub, scaffold]
---

# Hub Scaffold — ${date}

**Mode:** ${mode}

## Hub Root Concepts

| Slug | Status |
|------|--------|
${conceptRows}

## Scaffold Edges

| Source -> Target | Type | Context | Status |
|---|---|---|---|
${edgeRows}

## Summary
- Hub concepts: ${conceptResults.length} (${conceptsNew} new, ${conceptsExisting} existing)
- Domain root -> knowledge edges: ${domainEdges.length} (${domainNew} new, ${domainExisting} existing)
- ACS area -> acs edges: ${acsEdges.length} (${acsNew} new, ${acsExisting} existing)
- Total new edges: ${totalNewEdges}
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const dryRun = !writeMode; // dry-run is default

  console.log('\n=== Hub Scaffold ===');
  console.log(`\nMode: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);

  // Environment safety
  const envName = await checkEnvironment(dryRun);

  // Also check via assertNotProduction if writing
  if (!dryRun) {
    assertNotProduction('hub-scaffold-write', {
      allow: process.env.ALLOW_PROD_WRITE === '1',
    });
  }

  // Step 1: Create hub root concepts
  const hubIds = await seedHubRoots(dryRun);

  // Step 2: Attach domain roots to hub:knowledge
  await attachDomainRootsToKnowledgeHub(hubIds, dryRun);

  // Step 3: Attach ACS areas to hub:acs
  await attachAcsAreasToAcsHub(hubIds, dryRun);

  // Summary
  const conceptsNew = conceptResults.filter(
    (c) => c.status === 'created' || c.status === 'dry-run',
  ).length;
  const conceptsExisting = conceptResults.filter(
    (c) => c.status === 'exists',
  ).length;
  const edgesNew = edgeResults.filter(
    (e) => e.status === 'created' || e.status === 'dry-run',
  ).length;
  const edgesExisting = edgeResults.filter(
    (e) => e.status === 'exists',
  ).length;

  console.log('\nSummary:');
  console.log(`  Concepts: ${conceptResults.length} (${conceptsNew} new, ${conceptsExisting} existing)`);
  console.log(`  Edges: ${edgeResults.length} (${edgesNew} new, ${edgesExisting} existing)`);

  // Write report
  const mode = dryRun ? 'DRY-RUN' : 'WRITE';
  const reportContent = generateReport(mode);
  const date = new Date().toISOString().slice(0, 10);
  const reportDir = path.resolve(__dirname, '../../docs/graph-reports');

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, `${date}-hub-scaffold.md`);
  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  console.log(`\nReport written to: ${reportPath}`);

  if (dryRun) {
    console.log('\nRun with --write to apply changes.');
    console.log(
      'For production: ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_hub_scaffold.ts --write',
    );
  }
}

main().catch((err) => {
  console.error('Hub scaffold error:', err);
  process.exit(1);
});
