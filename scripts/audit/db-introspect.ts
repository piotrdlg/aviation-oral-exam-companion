/**
 * Database introspection script for system audit.
 * Queries production DB via Supabase REST API and outputs markdown report.
 *
 * Usage: npx tsx scripts/audit/db-introspect.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(url, key);

async function run() {
  const lines: string[] = [];
  const log = (s: string) => { lines.push(s); console.log(s); };

  log('# Database Introspection Report');
  log(`Generated: ${new Date().toISOString()}`);
  log(`Supabase URL: ${url}`);
  log('');

  // 1. Table row counts
  const knownTables = [
    'acs_tasks', 'acs_elements', 'admin_users', 'concepts', 'concept_relations',
    'concept_chunk_evidence', 'exam_sessions', 'session_transcripts', 'latency_logs',
    'off_graph_mentions', 'source_documents', 'source_chunks', 'source_images',
    'image_chunk_mappings', 'user_profiles', 'system_flags', 'system_prompts',
    'support_tickets', 'ticket_messages', 'voice_usage_logs', 'embedding_cache',
    'kb_hubs', 'kb_taxonomy_nodes', 'kb_chunk_taxonomy',
    'transcript_citations', 'voice_configs',
  ];

  log('## Table Row Counts');
  log('');
  log('| Table | Rows | Status |');
  log('|-------|------|--------|');

  for (const t of knownTables) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      log(`| ${t} | — | ERROR: ${error.message.substring(0, 60)} |`);
    } else {
      log(`| ${t} | ${count} | OK |`);
    }
  }

  // 2. exam_sessions sample
  log('');
  log('## exam_sessions — Latest Row');
  log('');
  const { data: es } = await sb.from('exam_sessions')
    .select('id,user_id,status,study_mode,difficulty_preference,rating,started_at,metadata')
    .limit(1)
    .order('started_at', { ascending: false });
  if (es && es.length > 0) {
    const row = es[0];
    log('```json');
    log(JSON.stringify({ ...row, metadata: row.metadata ? '(JSONB present)' : null }, null, 2));
    log('```');
  } else {
    log('No exam_sessions rows found.');
  }

  // 3. study_mode constraint test
  log('');
  log('## study_mode Constraint Check');
  log('');

  for (const mode of ['linear', 'cross_acs', 'weak_areas', 'quick_drill']) {
    const { error } = await sb.from('exam_sessions').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      study_mode: mode,
      status: 'active',
    });
    if (error) {
      if (error.code === '23514') {
        log(`- \`${mode}\`: **BLOCKED** by CHECK constraint`);
      } else {
        log(`- \`${mode}\`: Error (${error.code}): ${error.message.substring(0, 80)}`);
      }
    } else {
      log(`- \`${mode}\`: **ALLOWED**`);
      // cleanup
      await sb.from('exam_sessions')
        .delete()
        .eq('user_id', '00000000-0000-0000-0000-000000000000')
        .eq('study_mode', mode);
    }
  }

  // 4. system_flags
  log('');
  log('## system_flags (Feature Flags)');
  log('');
  const { data: flags, error: flagsErr } = await sb.from('system_flags').select('*');
  if (flagsErr) {
    log(`Error: ${flagsErr.message}`);
  } else if (flags && flags.length > 0) {
    log('| Key | Value | Updated |');
    log('|-----|-------|---------|');
    for (const f of flags) {
      log(`| ${f.key || f.flag_key || f.name || JSON.stringify(f).substring(0, 40)} | ${JSON.stringify(f.value ?? f.enabled ?? f.flag_value).substring(0, 40)} | ${f.updated_at || '—'} |`);
    }
  } else {
    log('No system_flags rows found.');
  }

  // 5. Concept category distribution
  log('');
  log('## Concept Category Distribution');
  log('');
  const { data: allConcepts } = await sb.from('concepts').select('category').limit(100000);
  if (allConcepts) {
    const cats: Record<string, number> = {};
    allConcepts.forEach((r: { category: string }) => { cats[r.category] = (cats[r.category] || 0) + 1; });
    log('| Category | Count |');
    log('|----------|-------|');
    for (const [cat, count] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      log(`| ${cat} | ${count} |`);
    }
  }

  // 6. Relation type distribution
  log('');
  log('## Concept Relation Type Distribution');
  log('');
  const { data: allRels } = await sb.from('concept_relations').select('relation_type').limit(100000);
  if (allRels) {
    const rels: Record<string, number> = {};
    allRels.forEach((r: { relation_type: string }) => { rels[r.relation_type] = (rels[r.relation_type] || 0) + 1; });
    log('| Relation Type | Count |');
    log('|---------------|-------|');
    for (const [rel, count] of Object.entries(rels).sort((a, b) => b[1] - a[1])) {
      log(`| ${rel} | ${count} |`);
    }
  }

  // 7. Source documents
  log('');
  log('## Source Documents');
  log('');
  const { data: docs } = await sb.from('source_documents').select('id,title,abbreviation,doc_type,chunk_count').order('title');
  if (docs && docs.length > 0) {
    log('| Title | Abbreviation | Type | Chunks |');
    log('|-------|-------------|------|--------|');
    for (const d of docs) {
      log(`| ${d.title || '—'} | ${d.abbreviation || '—'} | ${d.doc_type || '—'} | ${d.chunk_count ?? '—'} |`);
    }
  } else {
    log('No source_documents found.');
  }

  // 8. ACS tasks by rating
  log('');
  log('## ACS Tasks by Rating');
  log('');
  const { data: tasks } = await sb.from('acs_tasks').select('id,rating').limit(500);
  if (tasks) {
    const byRating: Record<string, number> = {};
    tasks.forEach((t: { rating: string }) => { byRating[t.rating || 'null'] = (byRating[t.rating || 'null'] || 0) + 1; });
    log('| Rating | Task Count |');
    log('|--------|------------|');
    for (const [r, c] of Object.entries(byRating).sort()) {
      log(`| ${r} | ${c} |`);
    }
  }

  // 9. kb_hubs
  log('');
  log('## Knowledge Base Hubs');
  log('');
  const { data: hubs, error: hubsErr } = await sb.from('kb_hubs').select('*');
  if (hubsErr) {
    log(`Error: ${hubsErr.message}`);
  } else if (hubs && hubs.length > 0) {
    log('```json');
    log(JSON.stringify(hubs, null, 2));
    log('```');
  } else {
    log('No kb_hubs found.');
  }

  // 10. kb_taxonomy_nodes count and sample
  log('');
  log('## Taxonomy Nodes');
  log('');
  const { count: taxCount } = await sb.from('kb_taxonomy_nodes').select('*', { count: 'exact', head: true });
  log(`Total: ${taxCount ?? 'error'} nodes`);
  const { data: taxSample } = await sb.from('kb_taxonomy_nodes').select('*').limit(5);
  if (taxSample && taxSample.length > 0) {
    log('');
    log('Sample (first 5):');
    log('```json');
    log(JSON.stringify(taxSample, null, 2));
    log('```');
  }

  // Write output
  const fs = await import('fs');
  const outPath = 'docs/system-audit/evidence/2026-02-27/sql/db-introspection.md';
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`\nWritten to ${outPath}`);
}

run().catch(e => { console.error(e); process.exit(1); });
