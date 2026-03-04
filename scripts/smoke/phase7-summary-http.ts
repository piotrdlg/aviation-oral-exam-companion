/**
 * Phase 7 Smoke Test — Weak-Area Summary Report (Direct DB)
 *
 * Validates that buildWeakAreaReport() logic works by reimplementing the
 * evidence chain directly against Supabase (avoiding server-only import).
 *
 * Checks:
 * 1. Finds completed sessions with examResultV2
 * 2. For each, loads weak elements + gathers citations via both sources
 * 3. Verifies report shape and grounding stats
 *
 * Usage:
 *   npx tsx scripts/smoke/phase7-summary-http.ts [--sessionId <id>]
 *
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('FAIL: Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-04-phase7/api');

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const results: CheckResult[] = [];

async function main() {
  const args = process.argv.slice(2);
  const sessionIdArg = args.includes('--sessionId') ? args[args.indexOf('--sessionId') + 1] : null;

  console.log('=== Phase 7 Summary Smoke Test ===\n');

  // Find sessions with V2 data
  let targetSessionIds: string[] = [];

  if (sessionIdArg) {
    targetSessionIds = [sessionIdArg];
  } else {
    const { data: sessions } = await supabase
      .from('exam_sessions')
      .select('id, metadata, status, ended_at')
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(20);

    const v2Sessions = (sessions || []).filter(s => {
      const meta = s.metadata as Record<string, unknown> | null;
      return meta?.examResultV2;
    });

    if (v2Sessions.length === 0) {
      results.push({ name: 'find_v2_sessions', status: 'SKIP', detail: 'No completed sessions with examResultV2 found' });
      printResults();
      return;
    }

    console.log(`Found ${v2Sessions.length} session(s) with V2 data\n`);
    targetSessionIds = v2Sessions.map(s => s.id);
  }

  results.push({
    name: 'find_v2_sessions',
    status: 'PASS',
    detail: `${targetSessionIds.length} session(s) with examResultV2`,
  });

  // Process each session
  for (const sessionId of targetSessionIds) {
    console.log(`\n--- Session ${sessionId.slice(0, 8)}... ---`);

    // Load session metadata
    const { data: session } = await supabase
      .from('exam_sessions')
      .select('id, metadata, result, status, rating, study_mode, exchange_count')
      .eq('id', sessionId)
      .single();

    if (!session) {
      results.push({ name: `report_${sessionId.slice(0, 8)}`, status: 'FAIL', detail: 'Session not found' });
      continue;
    }

    const metadata = session.metadata as Record<string, unknown> | null;
    const examResultV2 = metadata?.examResultV2 as Record<string, unknown> | undefined;

    if (!examResultV2) {
      results.push({ name: `report_${sessionId.slice(0, 8)}`, status: 'SKIP', detail: 'No examResultV2' });
      continue;
    }

    const weakElements = (examResultV2.weak_elements || []) as Array<{
      element_code: string; area: string; score: string | null; severity: string;
    }>;

    console.log(`  V2 status: ${examResultV2.overall_status}`);
    console.log(`  V2 score: ${examResultV2.overall_score}`);
    console.log(`  Weak elements: ${weakElements.length}`);

    // Gather citations for each weak element
    let groundedCount = 0;
    let insufficientCount = 0;
    const elementReports: Array<Record<string, unknown>> = [];

    for (const weak of weakElements.slice(0, 10)) { // Cap at 10 for speed
      // Source 1: transcript_citations
      const { data: tcData } = await supabase
        .from('transcript_citations')
        .select(`
          chunk_id, snippet, score,
          session_transcripts!inner ( assessment, session_id ),
          source_chunks!inner (
            content, heading, page_start,
            source_documents!inner ( abbreviation, title, faa_number )
          )
        `)
        .eq('session_transcripts.session_id', sessionId)
        .order('score', { ascending: false });

      const transcriptCitations = (tcData || []).filter(row => {
        const transcript = row.session_transcripts as unknown as { assessment: { primary_element?: string } | null };
        return transcript?.assessment?.primary_element === weak.element_code;
      });

      // Source 2: concept bundle RPC
      let evidenceCitations: Array<Record<string, unknown>> = [];
      try {
        const { data: bundleRows } = await supabase.rpc('get_concept_bundle', {
          p_element_code: weak.element_code,
          p_max_depth: 1,
        }).limit(10);

        if (bundleRows) {
          for (const row of bundleRows) {
            const chunks = (row as { evidence_chunks: Array<{
              chunk_id: string; content: string; doc_title: string; page_ref: string | null; confidence: number;
            }> | null }).evidence_chunks;
            if (chunks) {
              evidenceCitations.push(...chunks.map(c => ({
                doc_title: c.doc_title,
                page_ref: c.page_ref,
                snippet: c.content.slice(0, 200),
                source: 'evidence',
                confidence: c.confidence,
              })));
            }
          }
        }
      } catch {
        // RPC may not exist
      }

      const totalCitations = transcriptCitations.length + evidenceCitations.length;
      const grounded = totalCitations >= 1;
      if (grounded) groundedCount++;
      else insufficientCount++;

      const report = {
        element_code: weak.element_code,
        area: weak.area,
        severity: weak.severity,
        transcript_citations: transcriptCitations.length,
        evidence_citations: evidenceCitations.length,
        total_citations: totalCitations,
        grounded,
        sample_citation: transcriptCitations[0]
          ? (() => {
              const chunk = (transcriptCitations[0] as Record<string, unknown>).source_chunks as {
                source_documents: { abbreviation: string }; heading: string | null
              };
              return `${chunk.source_documents.abbreviation}: ${chunk.heading || '(no heading)'}`;
            })()
          : evidenceCitations[0]
            ? `${(evidenceCitations[0] as Record<string, unknown>).doc_title}`
            : '(none)',
      };

      elementReports.push(report);
      console.log(`  ${weak.element_code}: ${totalCitations} citations, grounded=${grounded}`);
    }

    // Save evidence
    const evidence = {
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      rating: session.rating,
      study_mode: session.study_mode,
      exchange_count: session.exchange_count,
      v2_status: examResultV2.overall_status,
      v2_score: examResultV2.overall_score,
      weak_elements_total: weakElements.length,
      weak_elements_audited: elementReports.length,
      grounded_count: groundedCount,
      insufficient_count: insufficientCount,
      grounding_rate: elementReports.length > 0
        ? Math.round((groundedCount / elementReports.length) * 100)
        : 0,
      elements: elementReports,
    };

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `summary-${sessionId.slice(0, 8)}.json`),
      JSON.stringify(evidence, null, 2)
    );

    const groundingRate = evidence.grounding_rate;
    results.push({
      name: `report_${sessionId.slice(0, 8)}`,
      status: groundingRate >= 50 ? 'PASS' : 'FAIL',
      detail: `${groundedCount}/${elementReports.length} grounded (${groundingRate}%), V2: ${examResultV2.overall_status}`,
    });
  }

  printResults();
}

function printResults() {
  console.log('\n=== RESULTS ===');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '\u2705' : r.status === 'FAIL' ? '\u274C' : '\u23ED\uFE0F';
    console.log(`${icon} ${r.name}: ${r.status} \u2014 ${r.detail}`);
  }

  const fails = results.filter(r => r.status === 'FAIL');
  const passes = results.filter(r => r.status === 'PASS');
  console.log(`\nOVERALL: ${fails.length > 0 ? 'FAIL' : passes.length > 0 ? 'PASS' : 'INCONCLUSIVE'}`);
  if (fails.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
