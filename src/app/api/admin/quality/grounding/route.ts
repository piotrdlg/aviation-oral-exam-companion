import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/grounding
 *
 * Returns grounding quality metrics from recent sessions that have
 * `grounding_quality_metrics` persisted in their metadata.
 *
 * Query params:
 *   ?limit=N (default 20, max 100)
 *
 * Returns:
 *   - per-session quality metrics
 *   - aggregate stats (avg relevance, unsupported rate, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '20'),
      100,
    );

    // Fetch recent completed sessions with V2 data
    const { data: sessions, error } = await serviceSupabase
      .from('exam_sessions')
      .select('id, rating, status, exchange_count, ended_at, metadata')
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extract quality metrics from metadata
    interface QualityMetrics {
      candidate_count: number;
      returned_count: number;
      filtered_out_count: number;
      avg_relevance_score: number;
      low_confidence_count: number;
      insufficient_sources_count: number;
      top_doc_types: string[];
      generated_at: string;
    }

    interface SessionQuality {
      session_id: string;
      rating: string;
      exchange_count: number;
      ended_at: string;
      has_v2: boolean;
      quality_metrics: QualityMetrics | null;
    }

    const sessionQualities: SessionQuality[] = [];
    let totalCandidates = 0;
    let totalReturned = 0;
    let totalFiltered = 0;
    let totalRelevanceScore = 0;
    let relevanceCount = 0;
    let totalLowConfidence = 0;
    let totalInsufficientSources = 0;
    let sessionsWithMetrics = 0;

    for (const session of sessions || []) {
      const meta = session.metadata as Record<string, unknown> | null;
      const hasV2 = !!meta?.examResultV2;
      const qm = meta?.grounding_quality_metrics as QualityMetrics | undefined;

      sessionQualities.push({
        session_id: session.id as string,
        rating: (session.rating as string) || 'private',
        exchange_count: (session.exchange_count as number) || 0,
        ended_at: session.ended_at as string,
        has_v2: hasV2,
        quality_metrics: qm || null,
      });

      if (qm) {
        sessionsWithMetrics++;
        totalCandidates += qm.candidate_count;
        totalReturned += qm.returned_count;
        totalFiltered += qm.filtered_out_count;
        totalRelevanceScore += qm.avg_relevance_score;
        relevanceCount++;
        totalLowConfidence += qm.low_confidence_count;
        totalInsufficientSources += qm.insufficient_sources_count;
      }
    }

    const aggregate = {
      sessions_queried: (sessions || []).length,
      sessions_with_metrics: sessionsWithMetrics,
      total_candidates: totalCandidates,
      total_returned: totalReturned,
      total_filtered: totalFiltered,
      filter_rate: totalCandidates > 0
        ? Math.round((totalFiltered / totalCandidates) * 100) / 100
        : 0,
      avg_relevance_score: relevanceCount > 0
        ? Math.round((totalRelevanceScore / relevanceCount) * 100) / 100
        : 0,
      total_low_confidence: totalLowConfidence,
      total_insufficient_sources: totalInsufficientSources,
    };

    return NextResponse.json({
      aggregate,
      sessions: sessionQualities,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
