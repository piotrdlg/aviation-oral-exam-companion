#!/usr/bin/env npx tsx
/**
 * attach_artifacts_to_hub_root.ts — Direct-attach artifact concepts to hub:knowledge
 *
 * Phase 3 Step E (artifacts): All 118 artifact concepts have 0 evidence rows,
 * so evidence-based attachment can't work. This script directly creates
 * is_component_of edges from each artifact → hub:knowledge root.
 *
 * Context: phase3_artifact_anchor:v1:hub-root
 *
 * Flags:
 *   --dry-run         Print plan but don't write to DB (default)
 *   --write           Write to DB (requires ALLOW_PROD_WRITE=1 for production)
 *
 * Usage:
 *   npx tsx scripts/graph/attach_artifacts_to_hub_root.ts
 *   npx tsx scripts/graph/attach_artifacts_to_hub_root.ts --write
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/graph/attach_artifacts_to_hub_root.ts --write
 *
 * npm: npm run graph:attach:artifacts
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

const CONTEXT_PREFIX = 'phase3_artifact_anchor:v1:hub-root';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  if (args.includes('--write')) return { dryRun: false };
  return { dryRun: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  if (!flags.dryRun) {
    assertNotProduction();
  }

  console.log('\n=== Attach Artifacts to Hub Root ===');
  console.log(`Mode: ${flags.dryRun ? 'DRY-RUN' : 'WRITE'}\n`);

  // 1. Load hub:knowledge concept
  const { data: hubData } = await supabase
    .from('concepts')
    .select('id, slug')
    .eq('slug', 'hub:knowledge')
    .single();

  if (!hubData) {
    console.error('ERROR: Cannot find hub:knowledge concept. Aborting.');
    process.exit(1);
  }

  const hubConceptId = hubData.id;
  console.log(`Hub root: hub:knowledge (${hubConceptId})`);

  // 2. Load all artifact concepts
  const { data: artifacts, error } = await supabase
    .from('concepts')
    .select('id, slug, name')
    .eq('category', 'artifact');

  if (error || !artifacts) {
    console.error('ERROR: Cannot load artifact concepts:', error?.message);
    process.exit(1);
  }

  console.log(`Artifact concepts found: ${artifacts.length}`);

  // 3. Check which already have is_component_of to hub root
  const artifactIds = artifacts.map(a => a.id);
  const { data: existingEdges } = await supabase
    .from('concept_relations')
    .select('source_id')
    .in('source_id', artifactIds)
    .eq('target_id', hubConceptId)
    .eq('relation_type', 'is_component_of');

  const alreadyAttached = new Set((existingEdges || []).map(e => e.source_id));
  const toAttach = artifacts.filter(a => !alreadyAttached.has(a.id));

  console.log(`Already attached: ${alreadyAttached.size}`);
  console.log(`To attach: ${toAttach.length}`);

  if (toAttach.length === 0) {
    console.log('\nAll artifacts already attached. Nothing to do.');
    return;
  }

  // List what will be attached
  console.log('\nArtifacts to attach:');
  for (const a of toAttach) {
    console.log(`  ${a.slug} — "${a.name}"`);
  }

  if (flags.dryRun) {
    console.log(`\n[DRY-RUN] Would create ${toAttach.length} edges (context: ${CONTEXT_PREFIX})`);
    console.log('[DRY-RUN] Run with --write to execute.');
    return;
  }

  // 4. Create edges
  const edges = toAttach.map(a => ({
    source_id: a.id,
    target_id: hubConceptId,
    relation_type: 'is_component_of',
    weight: 0.5,
    confidence: 1.0,
    context: CONTEXT_PREFIX,
  }));

  const { data: result, error: writeError } = await supabase
    .from('concept_relations')
    .upsert(edges, { onConflict: 'source_id,target_id,relation_type' })
    .select('id');

  if (writeError) {
    console.error('ERROR writing edges:', writeError.message);
    process.exit(1);
  }

  console.log(`\nCreated ${result?.length || 0} edges (context: ${CONTEXT_PREFIX})`);
}

main().catch((err) => {
  console.error('Attach artifacts error:', err);
  process.exit(1);
});
