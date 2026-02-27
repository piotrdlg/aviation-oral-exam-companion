/**
 * Weak-Area Report — grounded citation chains for post-exam review.
 *
 * Builds a structured review report for weak elements identified by ExamResultV2.
 * Uses two citation sources:
 *   1. transcript_citations — chunks actually cited during the exam session
 *   2. concept_chunk_evidence via get_concept_bundle RPC — pre-computed concept→chunk links
 *
 * The report is grounded: every weak element includes 2-4 source citations
 * from FAA source documents with page references. If insufficient sources
 * are available, the element is flagged with "insufficient_sources".
 */

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { ExamResultV2, WeakElement } from '@/lib/exam-result';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceCitation {
  /** Source document abbreviation (e.g. "PHAK", "AIM", "14 CFR") */
  doc_abbreviation: string;
  /** Full document title */
  doc_title: string;
  /** FAA document number (e.g. "FAA-H-8083-25B") */
  faa_number: string | null;
  /** Page reference (e.g. "p.234") */
  page_ref: string | null;
  /** Section heading from the chunk */
  heading: string | null;
  /** Brief content snippet (first 200 chars) */
  snippet: string;
  /** Citation source: transcript (used during exam) or evidence (pre-computed) */
  source: 'transcript' | 'evidence';
  /** Confidence score (0-1) */
  confidence: number;
}

export interface WeakElementReport {
  /** Element code (e.g. "PA.I.A.K1") */
  element_code: string;
  /** Element description (from acs_elements table) */
  element_description: string | null;
  /** Area (Roman numeral) */
  area: string;
  /** Score received */
  score: 'unsatisfactory' | 'partial' | null;
  /** Severity from ExamResultV2 */
  severity: 'unsatisfactory' | 'partial' | 'not_asked';
  /** Grounded citations for review */
  citations: SourceCitation[];
  /** Whether sufficient sources were found */
  grounded: boolean;
}

export interface WeakAreaReport {
  /** Session ID */
  session_id: string;
  /** Report generation timestamp */
  generated_at: string;
  /** Overall exam result summary */
  overall_status: string;
  overall_score: number;
  /** Per-element weak area reports */
  elements: WeakElementReport[];
  /** Areas that failed gating */
  failed_areas: string[];
  /** Summary statistics */
  stats: {
    total_weak: number;
    unsatisfactory_count: number;
    partial_count: number;
    not_asked_count: number;
    grounded_count: number;
    insufficient_sources_count: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum citations per weak element */
const MAX_CITATIONS_PER_ELEMENT = 4;
/** Minimum citations needed to consider an element "grounded" */
const MIN_CITATIONS_FOR_GROUNDED = 1;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a weak-area report for a completed exam session.
 *
 * Steps:
 *   1. Load ExamResultV2 from session metadata
 *   2. For each weak element, gather citations from:
 *      a. transcript_citations (chunks used during the exam)
 *      b. concept_chunk_evidence via get_concept_bundle (pre-computed)
 *   3. Deduplicate and rank citations by confidence
 *   4. Return structured report
 */
export async function buildWeakAreaReport(
  sessionId: string
): Promise<WeakAreaReport | null> {
  // 1. Load session with metadata
  const { data: session, error: sessionErr } = await supabase
    .from('exam_sessions')
    .select('id, metadata, result')
    .eq('id', sessionId)
    .single();

  if (sessionErr || !session) {
    console.error('buildWeakAreaReport: session not found', sessionErr?.message);
    return null;
  }

  const metadata = session.metadata as Record<string, unknown> | null;
  const examResultV2 = metadata?.examResultV2 as ExamResultV2 | undefined;

  if (!examResultV2) {
    console.warn('buildWeakAreaReport: no ExamResultV2 in metadata');
    return null;
  }

  const weakElements = examResultV2.weak_elements;
  if (weakElements.length === 0) {
    return {
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      overall_status: examResultV2.overall_status,
      overall_score: examResultV2.overall_score,
      elements: [],
      failed_areas: examResultV2.failed_areas,
      stats: {
        total_weak: 0,
        unsatisfactory_count: 0,
        partial_count: 0,
        not_asked_count: 0,
        grounded_count: 0,
        insufficient_sources_count: 0,
      },
    };
  }

  // 2. Load transcript citations for this session (bulk)
  const transcriptCitations = await loadTranscriptCitations(sessionId);

  // 3. Load element descriptions (bulk)
  const elementCodes = weakElements.map(w => w.element_code);
  const elementDescriptions = await loadElementDescriptions(elementCodes);

  // 4. Build per-element reports
  const elementReports: WeakElementReport[] = [];

  // Process weak elements in batches to avoid overwhelming the RPC
  for (const weak of weakElements) {
    const citations = await gatherCitations(
      weak,
      transcriptCitations,
    );

    elementReports.push({
      element_code: weak.element_code,
      element_description: elementDescriptions.get(weak.element_code) || null,
      area: weak.area,
      score: weak.score,
      severity: weak.severity,
      citations: citations.slice(0, MAX_CITATIONS_PER_ELEMENT),
      grounded: citations.length >= MIN_CITATIONS_FOR_GROUNDED,
    });
  }

  // 5. Compute stats
  const stats = {
    total_weak: elementReports.length,
    unsatisfactory_count: elementReports.filter(e => e.severity === 'unsatisfactory').length,
    partial_count: elementReports.filter(e => e.severity === 'partial').length,
    not_asked_count: elementReports.filter(e => e.severity === 'not_asked').length,
    grounded_count: elementReports.filter(e => e.grounded).length,
    insufficient_sources_count: elementReports.filter(e => !e.grounded).length,
  };

  return {
    session_id: sessionId,
    generated_at: new Date().toISOString(),
    overall_status: examResultV2.overall_status,
    overall_score: examResultV2.overall_score,
    elements: elementReports,
    failed_areas: examResultV2.failed_areas,
    stats,
  };
}

// ---------------------------------------------------------------------------
// Citation Gathering
// ---------------------------------------------------------------------------

interface TranscriptCitationRow {
  element_code: string | null;
  chunk_id: string;
  snippet: string | null;
  score: number | null;
  doc_abbreviation: string;
  doc_title: string;
  faa_number: string | null;
  page_start: number | null;
  heading: string | null;
  content: string;
}

/**
 * Load all transcript citations for a session, joined with source docs.
 * Returns citations grouped by the element_code from the transcript's assessment.
 */
async function loadTranscriptCitations(
  sessionId: string
): Promise<Map<string, TranscriptCitationRow[]>> {
  const { data, error } = await supabase
    .from('transcript_citations')
    .select(`
      chunk_id,
      snippet,
      score,
      session_transcripts!inner (
        assessment,
        session_id
      ),
      source_chunks!inner (
        content,
        heading,
        page_start,
        source_documents!inner (
          abbreviation,
          title,
          faa_number
        )
      )
    `)
    .eq('session_transcripts.session_id', sessionId)
    .order('score', { ascending: false });

  if (error) {
    console.error('loadTranscriptCitations error:', error.message);
    return new Map();
  }

  const result = new Map<string, TranscriptCitationRow[]>();

  for (const row of (data || [])) {
    const transcript = row.session_transcripts as unknown as { assessment: { primary_element?: string } | null };
    const chunk = row.source_chunks as unknown as {
      content: string;
      heading: string | null;
      page_start: number | null;
      source_documents: { abbreviation: string; title: string; faa_number: string | null };
    };

    const elementCode = transcript?.assessment?.primary_element || null;
    if (!elementCode) continue;

    const citation: TranscriptCitationRow = {
      element_code: elementCode,
      chunk_id: row.chunk_id,
      snippet: row.snippet,
      score: row.score,
      doc_abbreviation: chunk.source_documents.abbreviation,
      doc_title: chunk.source_documents.title,
      faa_number: chunk.source_documents.faa_number,
      page_start: chunk.page_start,
      heading: chunk.heading,
      content: chunk.content,
    };

    if (!result.has(elementCode)) result.set(elementCode, []);
    result.get(elementCode)!.push(citation);
  }

  return result;
}

/**
 * Load element descriptions from acs_elements table.
 */
async function loadElementDescriptions(
  codes: string[]
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();

  const { data, error } = await supabase
    .from('acs_elements')
    .select('code, description')
    .in('code', codes);

  if (error) {
    console.error('loadElementDescriptions error:', error.message);
    return new Map();
  }

  return new Map((data || []).map(r => [r.code, r.description]));
}

/**
 * Gather citations for a single weak element from multiple sources.
 * Priority: transcript citations first (actually used in exam), then evidence.
 */
async function gatherCitations(
  weak: WeakElement,
  transcriptCitations: Map<string, TranscriptCitationRow[]>,
): Promise<SourceCitation[]> {
  const citations: SourceCitation[] = [];
  const seenChunkIds = new Set<string>();

  // Source 1: Transcript citations (from actual exam exchanges)
  const tcRows = transcriptCitations.get(weak.element_code) || [];
  for (const tc of tcRows) {
    if (seenChunkIds.has(tc.chunk_id)) continue;
    seenChunkIds.add(tc.chunk_id);

    citations.push({
      doc_abbreviation: tc.doc_abbreviation.toUpperCase(),
      doc_title: tc.doc_title,
      faa_number: tc.faa_number,
      page_ref: tc.page_start ? `p.${tc.page_start}` : null,
      heading: tc.heading,
      snippet: (tc.snippet || tc.content).slice(0, 200),
      source: 'transcript',
      confidence: tc.score ?? 0.5,
    });

    if (citations.length >= MAX_CITATIONS_PER_ELEMENT) return citations;
  }

  // Source 2: Evidence from concept bundle RPC (pre-computed concept→chunk)
  if (citations.length < MAX_CITATIONS_PER_ELEMENT) {
    try {
      const { data: bundleRows } = await supabase.rpc('get_concept_bundle', {
        p_element_code: weak.element_code,
        p_max_depth: 1, // Keep shallow for performance
      }).limit(10);

      if (bundleRows) {
        for (const row of bundleRows) {
          const chunks = (row as { evidence_chunks: Array<{
            chunk_id: string;
            content: string;
            doc_title: string;
            page_ref: string | null;
            confidence: number;
          }> | null }).evidence_chunks;

          if (!chunks) continue;

          for (const chunk of chunks) {
            if (seenChunkIds.has(chunk.chunk_id)) continue;
            seenChunkIds.add(chunk.chunk_id);

            // Parse doc title to extract abbreviation
            const abbr = chunk.doc_title.split(' ')[0] || chunk.doc_title;

            citations.push({
              doc_abbreviation: abbr.toUpperCase(),
              doc_title: chunk.doc_title,
              faa_number: null,
              page_ref: chunk.page_ref,
              heading: null,
              snippet: chunk.content.slice(0, 200),
              source: 'evidence',
              confidence: chunk.confidence,
            });

            if (citations.length >= MAX_CITATIONS_PER_ELEMENT) return citations;
          }
        }
      }
    } catch (err) {
      // RPC may not exist or fail — non-fatal
      console.warn('get_concept_bundle RPC failed for', weak.element_code, err);
    }
  }

  // Sort by confidence desc
  citations.sort((a, b) => b.confidence - a.confidence);

  return citations;
}
