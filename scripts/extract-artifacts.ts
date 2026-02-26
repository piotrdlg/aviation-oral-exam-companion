#!/usr/bin/env npx tsx
/**
 * extract-artifacts.ts — Generate artifact concept nodes from source_documents rows.
 *
 * Creates parent document artifacts (e.g., artifact:phak) and chapter artifacts
 * (e.g., artifact:phak:ch4) from the source_documents table, then links them
 * to related concepts via concept_relations edges.
 *
 * Pipeline:
 *   1. Fetch all source_documents rows
 *   2. Group by abbreviation to create parent document artifacts
 *   3. Create chapter artifacts for documents with chapter_number
 *   4. Create is_component_of edges from chapter -> parent
 *   5. Link artifacts to regulatory_claim/topic concepts referencing them
 *
 * Usage:
 *   npx tsx scripts/extract-artifacts.ts            # Create artifacts + edges
 *   npx tsx scripts/extract-artifacts.ts --dry-run   # Preview only, no writes
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic slug for an artifact concept.
 *
 * @param abbreviation - The document abbreviation (e.g., 'phak', 'afh')
 * @param chapterNumber - Optional chapter number for chapter-level artifacts
 * @returns Slug string (e.g., 'artifact:phak' or 'artifact:phak:ch4')
 */
export function generateArtifactSlug(
  abbreviation: string,
  chapterNumber?: number,
): string {
  const base = `artifact:${abbreviation.toLowerCase()}`;
  if (chapterNumber != null) {
    return `${base}:ch${chapterNumber}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceDocumentRow {
  id: string;
  title: string;
  abbreviation: string;
  chapter_number: number | null;
  chapter_title: string | null;
}

interface ConceptUpsert {
  slug: string;
  name: string;
  name_normalized: string;
  category: 'artifact';
  content: string;
  key_facts: string[];
  embedding_status: 'stale';
  validation_status: 'validated';
}

interface EdgeInsert {
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

  // --- Environment safety guard ---
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('extract-artifacts', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 — production write override active!');
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`\nExtract Artifacts Pipeline`);
  console.log(`==========================`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  // --- Step 1: Fetch all source_documents ---
  console.log('Fetching source_documents...');

  const { data: documents, error: fetchError } = await supabase
    .from('source_documents')
    .select('id, title, abbreviation, chapter_number, chapter_title')
    .order('abbreviation')
    .order('chapter_number');

  if (fetchError) {
    console.error('Error fetching source_documents:', fetchError.message);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.error('No source_documents found. Run ingest-sources first.');
    process.exit(1);
  }

  console.log(`Found ${documents.length} source documents\n`);

  // --- Step 2: Group documents by abbreviation ---
  const grouped = new Map<string, SourceDocumentRow[]>();
  for (const doc of documents as SourceDocumentRow[]) {
    const abbrev = doc.abbreviation.toLowerCase();
    if (!grouped.has(abbrev)) {
      grouped.set(abbrev, []);
    }
    grouped.get(abbrev)!.push(doc);
  }

  console.log(`Unique abbreviations: ${grouped.size}`);
  for (const [abbrev, docs] of grouped) {
    console.log(`  ${abbrev}: ${docs.length} documents`);
  }
  console.log();

  // --- Step 3: Create parent document artifacts ---
  let artifactsCreated = 0;
  let edgesCreated = 0;

  const parentArtifactSlugs: string[] = [];
  const parentConceptUpserts: ConceptUpsert[] = [];

  for (const [abbrev, docs] of grouped) {
    const slug = generateArtifactSlug(abbrev);
    parentArtifactSlugs.push(slug);

    // Use the first document's title or abbreviation upper-cased
    const name = docs[0].title || abbrev.toUpperCase();

    // Collect chapter titles for key_facts
    const chapterTitles = docs
      .filter((d) => d.chapter_title)
      .map((d) => d.chapter_title!);

    parentConceptUpserts.push({
      slug,
      name,
      name_normalized: name.toLowerCase(),
      category: 'artifact',
      content: `${abbrev.toUpperCase()} - FAA publication with ${docs.length} chapters/sections`,
      key_facts: chapterTitles.length > 0 ? chapterTitles : docs.map((d) => d.title),
      embedding_status: 'stale',
      validation_status: 'validated',
    });
  }

  console.log(`Upserting ${parentConceptUpserts.length} parent document artifacts...`);

  if (!dryRun) {
    for (const upsert of parentConceptUpserts) {
      const { error: upsertError } = await supabase
        .from('concepts')
        .upsert(upsert, { onConflict: 'slug' });

      if (upsertError) {
        console.error(`  Error upserting parent artifact "${upsert.slug}":`, upsertError.message);
        continue;
      }
      artifactsCreated++;
    }
  } else {
    artifactsCreated += parentConceptUpserts.length;
    for (const upsert of parentConceptUpserts) {
      console.log(`  [DRY RUN] Would upsert parent: ${upsert.slug} ("${upsert.name}")`);
    }
  }

  // --- Step 4: Create chapter artifacts and is_component_of edges ---
  console.log('\nCreating chapter artifacts...');

  const chapterConceptUpserts: ConceptUpsert[] = [];
  const chapterToParent: Array<{ chapterSlug: string; parentSlug: string }> = [];

  for (const [abbrev, docs] of grouped) {
    const parentSlug = generateArtifactSlug(abbrev);

    for (const doc of docs) {
      if (doc.chapter_number == null) continue;

      const slug = generateArtifactSlug(abbrev, doc.chapter_number);
      const name =
        doc.chapter_title || `${abbrev.toUpperCase()} Chapter ${doc.chapter_number}`;

      chapterConceptUpserts.push({
        slug,
        name,
        name_normalized: name.toLowerCase(),
        category: 'artifact',
        content: `Chapter ${doc.chapter_number} of ${abbrev.toUpperCase()}: ${doc.chapter_title || name}`,
        key_facts: [],
        embedding_status: 'stale',
        validation_status: 'validated',
      });

      chapterToParent.push({ chapterSlug: slug, parentSlug });
    }
  }

  console.log(`Upserting ${chapterConceptUpserts.length} chapter artifacts...`);

  if (!dryRun) {
    for (const upsert of chapterConceptUpserts) {
      const { error: upsertError } = await supabase
        .from('concepts')
        .upsert(upsert, { onConflict: 'slug' });

      if (upsertError) {
        console.error(`  Error upserting chapter artifact "${upsert.slug}":`, upsertError.message);
        continue;
      }
      artifactsCreated++;
    }
  } else {
    artifactsCreated += chapterConceptUpserts.length;
    for (const upsert of chapterConceptUpserts.slice(0, 10)) {
      console.log(`  [DRY RUN] Would upsert chapter: ${upsert.slug}`);
    }
    if (chapterConceptUpserts.length > 10) {
      console.log(`  ... and ${chapterConceptUpserts.length - 10} more`);
    }
  }

  // --- Step 5: Create is_component_of edges (chapter -> parent) ---
  console.log('\nCreating is_component_of edges (chapter -> parent)...');

  if (chapterToParent.length > 0) {
    // Fetch all artifact concepts to get their IDs
    const allArtifactSlugs = [
      ...parentArtifactSlugs,
      ...chapterConceptUpserts.map((c) => c.slug),
    ];

    const slugToId = new Map<string, string>();

    // Fetch in batches (Supabase .in() has a limit)
    const BATCH_SIZE = 100;
    for (let i = 0; i < allArtifactSlugs.length; i += BATCH_SIZE) {
      const batch = allArtifactSlugs.slice(i, i + BATCH_SIZE);
      const { data: conceptRows, error: lookupError } = await supabase
        .from('concepts')
        .select('id, slug')
        .in('slug', batch);

      if (lookupError) {
        console.error('Error looking up artifact concept IDs:', lookupError.message);
        break;
      }
      for (const row of conceptRows ?? []) {
        slugToId.set(row.slug, row.id);
      }
    }

    for (const { chapterSlug, parentSlug } of chapterToParent) {
      const sourceId = slugToId.get(chapterSlug);
      const targetId = slugToId.get(parentSlug);

      if (!sourceId || !targetId) {
        console.warn(
          `  SKIP edge: missing ID for ${chapterSlug} (${sourceId ? 'found' : 'missing'}) ` +
            `-> ${parentSlug} (${targetId ? 'found' : 'missing'})`,
        );
        continue;
      }

      if (dryRun) {
        edgesCreated++;
        continue;
      }

      // Check if edge already exists
      const { data: existing } = await supabase
        .from('concept_relations')
        .select('id')
        .eq('source_id', sourceId)
        .eq('target_id', targetId)
        .eq('relation_type', 'is_component_of')
        .limit(1);

      if (existing && existing.length > 0) {
        continue; // Edge already exists
      }

      const { error: edgeError } = await supabase.from('concept_relations').insert({
        source_id: sourceId,
        target_id: targetId,
        relation_type: 'is_component_of',
        weight: 1.0,
        confidence: 1.0,
      });

      if (edgeError) {
        console.error(
          `  Error creating edge ${chapterSlug} -> ${parentSlug}:`,
          edgeError.message,
        );
        continue;
      }
      edgesCreated++;
    }
  }

  console.log(`  is_component_of edges: ${edgesCreated}${dryRun ? ' (dry run)' : ''}`);

  // --- Step 6: Link artifacts to concepts that reference these documents ---
  console.log('\nLinking artifacts to regulatory_claim and topic concepts...');

  // Fetch all artifact concept IDs we just created
  const artifactSlugToId = new Map<string, string>();

  if (!dryRun) {
    const allSlugs = [
      ...parentArtifactSlugs,
      ...chapterConceptUpserts.map((c) => c.slug),
    ];

    for (let i = 0; i < allSlugs.length; i += 100) {
      const batch = allSlugs.slice(i, i + 100);
      const { data: rows } = await supabase
        .from('concepts')
        .select('id, slug')
        .in('slug', batch);

      for (const row of rows ?? []) {
        artifactSlugToId.set(row.slug, row.id);
      }
    }
  }

  // Fetch regulatory_claim and topic concepts with key_facts
  const { data: claimAndTopicConcepts, error: conceptFetchError } = await supabase
    .from('concepts')
    .select('id, slug, key_facts, category')
    .in('category', ['regulatory_claim', 'topic']);

  if (conceptFetchError) {
    console.error('Error fetching claim/topic concepts:', conceptFetchError.message);
  }

  let crossRefEdges = 0;

  if (claimAndTopicConcepts && claimAndTopicConcepts.length > 0) {
    console.log(`  Found ${claimAndTopicConcepts.length} claim/topic concepts to check`);

    // Build abbreviation -> parent artifact ID map
    const abbrevToArtifactId = new Map<string, string>();
    for (const [abbrev] of grouped) {
      const parentSlug = generateArtifactSlug(abbrev);
      const parentId = artifactSlugToId.get(parentSlug);
      if (parentId) {
        abbrevToArtifactId.set(abbrev.toLowerCase(), parentId);
        // Also add uppercase version for matching
        abbrevToArtifactId.set(abbrev.toUpperCase(), parentId);
      }
    }

    // Known abbreviation patterns to search for in key_facts
    const knownAbbreviations = Array.from(grouped.keys());

    for (const concept of claimAndTopicConcepts) {
      if (!concept.key_facts || !Array.isArray(concept.key_facts)) continue;

      const keyFactsText = concept.key_facts.join(' ').toLowerCase();

      for (const abbrev of knownAbbreviations) {
        // Check if this concept's key_facts reference this abbreviation
        if (!keyFactsText.includes(abbrev.toLowerCase())) continue;

        const artifactId = abbrevToArtifactId.get(abbrev.toLowerCase());
        if (!artifactId) continue;

        if (dryRun) {
          crossRefEdges++;
          continue;
        }

        // Check if edge already exists
        const { data: existing } = await supabase
          .from('concept_relations')
          .select('id')
          .eq('source_id', concept.id)
          .eq('target_id', artifactId)
          .eq('relation_type', 'applies_in_scenario')
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error: edgeError } = await supabase.from('concept_relations').insert({
          source_id: concept.id,
          target_id: artifactId,
          relation_type: 'applies_in_scenario',
          weight: 0.7,
          confidence: 0.7,
        });

        if (edgeError) {
          console.error(
            `  Error creating cross-ref edge ${concept.slug} -> artifact:${abbrev}:`,
            edgeError.message,
          );
          continue;
        }
        crossRefEdges++;
      }
    }
  }

  console.log(`  applies_in_scenario edges: ${crossRefEdges}${dryRun ? ' (dry run)' : ''}`);

  // --- Summary ---
  console.log(`\n==========================`);
  console.log(`Artifacts created/updated:  ${artifactsCreated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`  Parent documents:         ${parentConceptUpserts.length}`);
  console.log(`  Chapter artifacts:        ${chapterConceptUpserts.length}`);
  console.log(`is_component_of edges:      ${edgesCreated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`applies_in_scenario edges:  ${crossRefEdges}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Total edges:                ${edgesCreated + crossRefEdges}`);
  console.log(`Done!`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
