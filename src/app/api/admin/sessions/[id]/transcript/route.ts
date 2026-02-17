import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/sessions/[id]/transcript
 *
 * Returns the full transcript for any exam session (admin only).
 * Includes: exchange_number, role, text, assessment, element_attempts,
 * citations (via transcript_citations), and prompt_version_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const { id: sessionId } = await params;

    // Verify session exists and get basic info
    const { data: session, error: sessionError } = await serviceSupabase
      .from('exam_sessions')
      .select('id, user_id, rating, status, study_mode, difficulty_preference, aircraft_class, exchange_count, started_at, ended_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch transcripts ordered by exchange_number and role
    const { data: transcripts, error: transcriptError } = await serviceSupabase
      .from('session_transcripts')
      .select('id, exchange_number, role, text, assessment, prompt_version_id, timestamp')
      .eq('session_id', sessionId)
      .order('exchange_number', { ascending: true })
      .order('role', { ascending: true }); // 'examiner' before 'student' within same exchange

    if (transcriptError) {
      return NextResponse.json({ error: transcriptError.message }, { status: 500 });
    }

    const transcriptIds = (transcripts || []).map((t) => t.id);

    // Fetch element attempts and citations in parallel
    const [elementAttemptsResult, citationsResult] = await Promise.all([
      transcriptIds.length > 0
        ? serviceSupabase
            .from('element_attempts')
            .select('id, transcript_id, element_code, tag_type, score, is_primary, confidence')
            .in('transcript_id', transcriptIds)
        : Promise.resolve({ data: [], error: null }),

      transcriptIds.length > 0
        ? serviceSupabase
            .from('transcript_citations')
            .select('id, transcript_id, chunk_id, rank, score, snippet')
            .in('transcript_id', transcriptIds)
            .order('rank', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Index element attempts and citations by transcript_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptsByTranscript: Record<string, any[]> = {};
    if (elementAttemptsResult.data) {
      for (const attempt of elementAttemptsResult.data as any[]) {
        const tid = attempt.transcript_id as string;
        if (!attemptsByTranscript[tid]) attemptsByTranscript[tid] = [];
        attemptsByTranscript[tid]!.push(attempt);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const citationsByTranscript: Record<string, any[]> = {};
    if (citationsResult.data) {
      for (const citation of citationsResult.data as any[]) {
        const tid = citation.transcript_id as string;
        if (!citationsByTranscript[tid]) citationsByTranscript[tid] = [];
        citationsByTranscript[tid]!.push(citation);
      }
    }

    // Assemble enriched transcript
    const enrichedTranscripts = (transcripts || []).map((t) => ({
      ...t,
      element_attempts: attemptsByTranscript[t.id] || [],
      citations: citationsByTranscript[t.id] || [],
    }));

    return NextResponse.json({
      session,
      transcripts: enrichedTranscripts,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
