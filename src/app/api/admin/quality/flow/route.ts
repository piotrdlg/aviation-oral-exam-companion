import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/flow
 *
 * Returns flow quality metrics from recent cross_acs sessions.
 * Reports fingerprint source, coverage, and study mode distribution.
 *
 * Query params:
 *   ?limit=N (default 20, max 100)
 *
 * Phase 9 — Flow Coherence Activation
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '20'),
      100,
    );

    // Fetch recent sessions (any study mode) to get flow quality distribution
    const { data: sessions, error } = await serviceSupabase
      .from('exam_sessions')
      .select('id, rating, status, exchange_count, ended_at, metadata')
      .order('ended_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    interface FlowSessionInfo {
      session_id: string;
      rating: string;
      status: string;
      study_mode: string;
      exchange_count: number;
      ended_at: string | null;
      fingerprint_source: string | null;
      fingerprint_count: number | null;
      fingerprint_coverage_pct: number | null;
      unique_slugs: number | null;
    }

    const sessionInfos: FlowSessionInfo[] = [];
    const studyModeCounts: Record<string, number> = {};
    const fingerprintSourceCounts: Record<string, number> = {};
    let crossAcsCount = 0;
    let crossAcsWithFingerprints = 0;

    for (const session of sessions || []) {
      const meta = session.metadata as Record<string, unknown> | null;
      const sessionConfig = meta?.sessionConfig as Record<string, unknown> | undefined;
      const fingerprintMeta = meta?.fingerprintMeta as Record<string, unknown> | undefined;

      const studyMode = (sessionConfig?.studyMode as string) || 'unknown';
      studyModeCounts[studyMode] = (studyModeCounts[studyMode] || 0) + 1;

      const fpSource = (fingerprintMeta?.source as string) || null;
      if (studyMode === 'cross_acs') {
        crossAcsCount++;
        if (fpSource && fpSource !== 'none') {
          crossAcsWithFingerprints++;
          fingerprintSourceCounts[fpSource] = (fingerprintSourceCounts[fpSource] || 0) + 1;
        }
      }

      sessionInfos.push({
        session_id: session.id as string,
        rating: (session.rating as string) || 'private',
        status: session.status as string,
        study_mode: studyMode,
        exchange_count: (session.exchange_count as number) || 0,
        ended_at: session.ended_at as string | null,
        fingerprint_source: fpSource,
        fingerprint_count: (fingerprintMeta?.fingerprintCount as number) ?? null,
        fingerprint_coverage_pct: (fingerprintMeta?.coveragePercent as number) ?? null,
        unique_slugs: (fingerprintMeta?.uniqueSlugs as number) ?? null,
      });
    }

    const aggregate = {
      sessions_queried: (sessions || []).length,
      study_mode_distribution: studyModeCounts,
      cross_acs_sessions: crossAcsCount,
      cross_acs_with_fingerprints: crossAcsWithFingerprints,
      fingerprint_source_distribution: fingerprintSourceCounts,
      fingerprint_activation_rate: crossAcsCount > 0
        ? Math.round((crossAcsWithFingerprints / crossAcsCount) * 100)
        : 0,
    };

    return NextResponse.json({
      aggregate,
      sessions: sessionInfos,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
