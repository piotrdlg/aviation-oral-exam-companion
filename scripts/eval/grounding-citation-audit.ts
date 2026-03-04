/**
 * Grounding / Citation Accuracy Audit (R1)
 *
 * Validates that weak-area citations are actually relevant to the identified
 * weak element, simulating the runtime filtering pipeline (Phase 8).
 *
 * Measures TWO metrics:
 *   1. Element grounding rate: % of weak elements with ≥1 citation after filtering
 *   2. Post-filter citation quality: SUPPORTS vs WEAK_SUPPORT distribution
 *
 * The "unsupported rate" threshold (<=10%) maps to:
 *   % of weak elements with ZERO citations after relevance filtering
 *
 * Scoring rubric (via shared citation-relevance module):
 *   SUPPORTS      — score >= 0.40 (strong match)
 *   WEAK_SUPPORT  — score >= 0.25 (above filter threshold)
 *   FILTERED_OUT  — score < 0.25 (removed by runtime filter)
 *
 * Usage:
 *   npx tsx scripts/eval/grounding-citation-audit.ts [--limit N]
 *
 * Requires: .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { scoreCitationRelevance, filterCitations, RELEVANCE_THRESHOLD, type CitationCandidate } from '../../src/lib/citation-relevance';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-05-phase8/eval');
const MAX_CITATIONS_PER_ELEMENT = 4;
const MAX_CANDIDATES = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelevanceScore = 'SUPPORTS' | 'WEAK_SUPPORT' | 'FILTERED_OUT';

interface CitationAuditRow {
  session_id: string;
  element_code: string;
  area: string;
  severity: string;
  citation_doc: string;
  citation_heading: string | null;
  citation_snippet: string;
  citation_source: string;
  citation_confidence: number;
  relevance: RelevanceScore;
  reason: string;
  relevance_score: number;
  kept: boolean;
}

interface ElementAudit {
  session_id: string;
  element_code: string;
  area: string;
  severity: string;
  raw_candidates: number;
  kept_citations: number;
  filtered_out: number;
  grounded: boolean;
  top_relevance_score: number;
  citations: CitationAuditRow[];
}

// ---------------------------------------------------------------------------
// Scorer helper
// ---------------------------------------------------------------------------

function classifyScore(score: number): RelevanceScore {
  if (score >= 0.40) return 'SUPPORTS';
  if (score >= RELEVANCE_THRESHOLD) return 'WEAK_SUPPORT';
  return 'FILTERED_OUT';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;

  console.log('=== Grounding / Citation Accuracy Audit (Phase 8) ===\n');
  console.log(`Runtime filter threshold: ${RELEVANCE_THRESHOLD}`);
  console.log(`Max candidates per element: ${MAX_CANDIDATES}`);
  console.log(`Max kept per element: ${MAX_CITATIONS_PER_ELEMENT}\n`);

  // Find completed sessions with V2 data
  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('id, metadata, rating, study_mode, exchange_count, ended_at')
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(50);

  const v2Sessions = (sessions || []).filter(s => {
    const meta = s.metadata as Record<string, unknown> | null;
    return meta?.examResultV2;
  }).slice(0, limit);

  console.log(`Found ${v2Sessions.length} session(s) with V2 data (limit: ${limit})\n`);

  if (v2Sessions.length === 0) {
    console.log('No V2 sessions to audit. Exiting.');
    process.exit(0);
  }

  const allElementAudits: ElementAudit[] = [];
  const allCitationRows: CitationAuditRow[] = [];
  const sessionSummaries: Array<Record<string, unknown>> = [];

  for (const session of v2Sessions) {
    const metadata = session.metadata as Record<string, unknown>;
    const v2 = metadata.examResultV2 as Record<string, unknown>;
    const weakElements = (v2.weak_elements || []) as Array<{
      element_code: string; area: string; score: string | null; severity: string;
    }>;

    console.log(`Session ${session.id.slice(0, 8)}... | ${session.rating} | ${session.study_mode} | ${weakElements.length} weak elements`);

    if (weakElements.length === 0) {
      sessionSummaries.push({
        session_id: session.id,
        rating: session.rating,
        weak_count: 0,
        grounded: 0, insufficient: 0,
        grounding_rate: 1.0,
      });
      continue;
    }

    // Load transcript citations for this session
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
      .eq('session_transcripts.session_id', session.id)
      .order('score', { ascending: false });

    let sessionGrounded = 0, sessionInsufficient = 0;
    let sessionSupports = 0, sessionWeakSupport = 0, sessionFilteredOut = 0;

    for (const weak of weakElements) {
      // Gather candidates (up to MAX_CANDIDATES, like runtime)
      const candidates: Array<CitationCandidate & { confidence: number }> = [];
      const seenChunks = new Set<string>();

      // Source 1: Transcript citations for this element
      const elementTcRows = (tcData || []).filter(row => {
        const transcript = row.session_transcripts as unknown as { assessment: { primary_element?: string } | null };
        return transcript?.assessment?.primary_element === weak.element_code;
      });

      for (const row of elementTcRows) {
        if (candidates.length >= MAX_CANDIDATES) break;
        const chunk = row.source_chunks as unknown as {
          content: string; heading: string | null; page_start: number | null;
          source_documents: { abbreviation: string; title: string; faa_number: string | null };
        };
        const chunkId = row.chunk_id as string;
        if (seenChunks.has(chunkId)) continue;
        seenChunks.add(chunkId);

        candidates.push({
          doc_abbreviation: chunk.source_documents.abbreviation.toUpperCase(),
          heading: chunk.heading,
          snippet: (row.snippet || chunk.content).slice(0, 200),
          source: 'transcript',
          confidence: (row.score as number) ?? 0.5,
        });
      }

      // Source 2: Evidence from concept bundle RPC
      if (candidates.length < MAX_CANDIDATES) {
        try {
          const { data: bundleRows } = await supabase.rpc('get_concept_bundle', {
            p_element_code: weak.element_code,
            p_max_depth: 1,
          }).limit(10);

          if (bundleRows) {
            for (const row of bundleRows) {
              if (candidates.length >= MAX_CANDIDATES) break;
              const chunks = (row as { evidence_chunks: Array<{
                chunk_id: string; content: string; doc_title: string; page_ref: string | null; confidence: number;
              }> | null }).evidence_chunks;
              if (!chunks) continue;
              for (const chunk of chunks) {
                if (candidates.length >= MAX_CANDIDATES) break;
                if (seenChunks.has(chunk.chunk_id)) continue;
                seenChunks.add(chunk.chunk_id);
                candidates.push({
                  doc_abbreviation: chunk.doc_title.split(' ')[0].toUpperCase(),
                  heading: null,
                  snippet: chunk.content.slice(0, 200),
                  source: 'evidence',
                  confidence: chunk.confidence,
                });
              }
            }
          }
        } catch {
          // RPC failure is non-fatal
        }
      }

      // Apply the SAME filter as the runtime pipeline
      const { kept, filtered } = filterCitations(
        candidates,
        {
          element_code: weak.element_code,
          area: weak.area,
          rating: session.rating as string | undefined,
        },
        MAX_CITATIONS_PER_ELEMENT,
      );

      const isGrounded = kept.length > 0;
      if (isGrounded) sessionGrounded++;
      else sessionInsufficient++;

      const elementCitations: CitationAuditRow[] = [];

      // Record kept citations
      for (const s of kept) {
        const relevance = classifyScore(s.relevance.score);
        if (relevance === 'SUPPORTS') sessionSupports++;
        else sessionWeakSupport++;

        const row: CitationAuditRow = {
          session_id: session.id,
          element_code: weak.element_code,
          area: weak.area,
          severity: weak.severity,
          citation_doc: s.citation.doc_abbreviation,
          citation_heading: s.citation.heading,
          citation_snippet: s.citation.snippet.slice(0, 100),
          citation_source: s.citation.source,
          citation_confidence: (s.citation as unknown as { confidence: number }).confidence,
          relevance,
          reason: s.relevance.reasons.join(', '),
          relevance_score: s.relevance.score,
          kept: true,
        };
        elementCitations.push(row);
        allCitationRows.push(row);
      }

      // Record filtered-out citations (for diagnostics)
      for (const s of filtered.slice(0, 3)) {
        sessionFilteredOut++;
        const row: CitationAuditRow = {
          session_id: session.id,
          element_code: weak.element_code,
          area: weak.area,
          severity: weak.severity,
          citation_doc: s.citation.doc_abbreviation,
          citation_heading: s.citation.heading,
          citation_snippet: s.citation.snippet.slice(0, 100),
          citation_source: s.citation.source,
          citation_confidence: (s.citation as unknown as { confidence: number }).confidence,
          relevance: 'FILTERED_OUT',
          reason: s.relevance.reasons.join(', '),
          relevance_score: s.relevance.score,
          kept: false,
        };
        elementCitations.push(row);
        allCitationRows.push(row);
      }

      allElementAudits.push({
        session_id: session.id,
        element_code: weak.element_code,
        area: weak.area,
        severity: weak.severity,
        raw_candidates: candidates.length,
        kept_citations: kept.length,
        filtered_out: filtered.length,
        grounded: isGrounded,
        top_relevance_score: kept.length > 0 ? kept[0].relevance.score : 0,
        citations: elementCitations,
      });
    }

    const totalElements = weakElements.length;
    const groundingRate = totalElements > 0 ? sessionGrounded / totalElements : 1;
    console.log(`  Grounded: ${sessionGrounded}/${totalElements} (${(groundingRate * 100).toFixed(1)}%) | Insufficient: ${sessionInsufficient} | Kept citations: S=${sessionSupports} WS=${sessionWeakSupport} | Filtered: ${sessionFilteredOut}`);

    sessionSummaries.push({
      session_id: session.id,
      rating: session.rating,
      weak_count: totalElements,
      grounded: sessionGrounded,
      insufficient: sessionInsufficient,
      grounding_rate: Math.round(groundingRate * 100) / 100,
      supports: sessionSupports,
      weak_support: sessionWeakSupport,
      filtered_out: sessionFilteredOut,
    });
  }

  // Aggregate
  const totalElements = allElementAudits.length;
  const groundedElements = allElementAudits.filter(e => e.grounded).length;
  const insufficientElements = allElementAudits.filter(e => !e.grounded).length;
  const elementGroundingRate = totalElements > 0 ? groundedElements / totalElements : 1;
  const insufficientRate = totalElements > 0 ? insufficientElements / totalElements : 0;

  const keptRows = allCitationRows.filter(r => r.kept);
  const totalKept = keptRows.length;
  const totalSupports = keptRows.filter(r => r.relevance === 'SUPPORTS').length;
  const totalWeakSupport = keptRows.filter(r => r.relevance === 'WEAK_SUPPORT').length;
  const totalFilteredOut = allCitationRows.filter(r => !r.kept).length;
  const totalRawCandidates = allElementAudits.reduce((sum, e) => sum + e.raw_candidates, 0);

  const avgRelevance = totalKept > 0
    ? keptRows.reduce((sum, r) => sum + r.relevance_score, 0) / totalKept
    : 0;

  console.log('\n=== AGGREGATE RESULTS ===');
  console.log(`Total weak elements audited: ${totalElements}`);
  console.log(`Grounded (≥1 citation after filter): ${groundedElements} (${(elementGroundingRate * 100).toFixed(1)}%)`);
  console.log(`Insufficient sources (0 after filter): ${insufficientElements} (${(insufficientRate * 100).toFixed(1)}%)`);
  console.log(`\nPost-filter citation quality:`);
  console.log(`  Total kept: ${totalKept} (from ${totalRawCandidates} raw candidates)`);
  console.log(`  SUPPORTS: ${totalSupports} (${totalKept > 0 ? (totalSupports / totalKept * 100).toFixed(1) : 0}%)`);
  console.log(`  WEAK_SUPPORT: ${totalWeakSupport} (${totalKept > 0 ? (totalWeakSupport / totalKept * 100).toFixed(1) : 0}%)`);
  console.log(`  Filtered out: ${totalFilteredOut}`);
  console.log(`  Avg relevance score (kept): ${(avgRelevance * 100).toFixed(1)}%`);
  console.log(`\nInsufficient sources rate: ${(insufficientRate * 100).toFixed(1)}% (threshold: <=10%)`);

  // Failure patterns: which areas have the most insufficient-sources elements?
  const insufficientByArea = new Map<string, number>();
  for (const elem of allElementAudits.filter(e => !e.grounded)) {
    insufficientByArea.set(elem.area, (insufficientByArea.get(elem.area) || 0) + 1);
  }

  if (insufficientElements > 0) {
    console.log('\nInsufficient sources by area:');
    for (const [area, count] of [...insufficientByArea.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  Area ${area}: ${count} element(s) with no grounded citations`);
    }
  }

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    phase: 8,
    runtime_filter_threshold: RELEVANCE_THRESHOLD,
    sessions_audited: v2Sessions.length,
    total_elements: totalElements,
    grounded_elements: groundedElements,
    insufficient_elements: insufficientElements,
    element_grounding_rate: Math.round(elementGroundingRate * 100) / 100,
    insufficient_rate: Math.round(insufficientRate * 100) / 100,
    passes_threshold: insufficientRate <= 0.10,
    post_filter_citations: {
      total_kept: totalKept,
      supports: totalSupports,
      weak_support: totalWeakSupport,
      filtered_out: totalFilteredOut,
      raw_candidates: totalRawCandidates,
      avg_relevance_score: Math.round(avgRelevance * 100) / 100,
    },
    session_summaries: sessionSummaries,
    insufficient_by_area: Object.fromEntries(insufficientByArea),
    sample_insufficient: allElementAudits
      .filter(e => !e.grounded)
      .slice(0, 5)
      .map(e => ({
        element: e.element_code,
        area: e.area,
        raw_candidates: e.raw_candidates,
        reason: e.raw_candidates === 0 ? 'No citations in DB' : 'All candidates below relevance threshold',
      })),
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, 'grounding-citation-audit.json'),
    JSON.stringify(report, null, 2)
  );

  // Write markdown report
  let md = `# Grounding / Citation Accuracy Audit (R1) — Phase 8\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Sessions audited:** ${v2Sessions.length}\n`;
  md += `**Runtime filter threshold:** ${RELEVANCE_THRESHOLD}\n\n`;
  md += `## Element Grounding Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total weak elements | ${totalElements} |\n`;
  md += `| Grounded (≥1 citation) | ${groundedElements} (${(elementGroundingRate * 100).toFixed(1)}%) |\n`;
  md += `| Insufficient sources | ${insufficientElements} (${(insufficientRate * 100).toFixed(1)}%) |\n`;
  md += `| **Passes threshold (<=10%)** | **${insufficientRate <= 0.10 ? 'YES' : 'NO'}** |\n\n`;

  md += `## Post-Filter Citation Quality\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Raw candidates | ${totalRawCandidates} |\n`;
  md += `| Kept after filter | ${totalKept} |\n`;
  md += `| Filtered out | ${totalFilteredOut} |\n`;
  md += `| SUPPORTS (score ≥ 0.40) | ${totalSupports} (${totalKept > 0 ? (totalSupports / totalKept * 100).toFixed(1) : 0}%) |\n`;
  md += `| WEAK_SUPPORT (score ≥ 0.25) | ${totalWeakSupport} (${totalKept > 0 ? (totalWeakSupport / totalKept * 100).toFixed(1) : 0}%) |\n`;
  md += `| Avg relevance score (kept) | ${(avgRelevance * 100).toFixed(1)}% |\n\n`;

  md += `## Per-Session Summary\n\n`;
  md += `| Session | Rating | Weak | Grounded | Insufficient | Rate | Kept |\n`;
  md += `|---------|--------|------|----------|--------------|------|------|\n`;
  for (const s of sessionSummaries) {
    md += `| ${(s.session_id as string).slice(0, 8)}... | ${s.rating} | ${s.weak_count} | ${s.grounded} | ${s.insufficient} | ${((s.grounding_rate as number) * 100).toFixed(0)}% | S=${s.supports} WS=${s.weak_support} |\n`;
  }

  if (insufficientElements > 0) {
    md += `\n## Insufficient Sources by Area\n\n`;
    for (const [area, count] of [...insufficientByArea.entries()].sort((a, b) => b[1] - a[1])) {
      md += `- **Area ${area}:** ${count} element(s)\n`;
    }
    md += `\n### Sample Insufficient Elements\n\n`;
    for (const elem of allElementAudits.filter(e => !e.grounded).slice(0, 5)) {
      md += `- \`${elem.element_code}\` (Area ${elem.area}): ${elem.raw_candidates} raw candidates, 0 passed filter\n`;
    }
  }

  writeFileSync(join(EVIDENCE_DIR, 'grounding-citation-audit.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/grounding-citation-audit.{json,md}`);

  if (insufficientRate > 0.10) {
    console.log('\n\u274C FAIL: Insufficient sources rate exceeds 10% threshold');
    process.exit(1);
  } else {
    console.log('\n\u2705 PASS: Insufficient sources rate within threshold');
  }
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
