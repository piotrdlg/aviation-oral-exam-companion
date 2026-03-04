import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/depth
 *
 * Returns depth & difficulty contract metrics from recent sessions.
 * Reports contract distribution by rating × difficulty, adoption rate,
 * and per-session details.
 *
 * Query params:
 *   ?limit=N (default 20, max 100)
 *
 * Phase 10 — Certificate Depth + Difficulty Engine
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '20'),
      100,
    );

    const { data: sessions, error } = await serviceSupabase
      .from('exam_sessions')
      .select('id, rating, status, exchange_count, ended_at, metadata')
      .order('ended_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    interface DepthSessionInfo {
      session_id: string;
      rating: string;
      status: string;
      study_mode: string;
      difficulty: string;
      exchange_count: number;
      ended_at: string | null;
      has_contract: boolean;
      contract_rating: string | null;
      contract_difficulty: string | null;
    }

    const sessionInfos: DepthSessionInfo[] = [];
    const ratingCounts: Record<string, number> = {};
    const difficultyCounts: Record<string, number> = {};
    const contractPairCounts: Record<string, number> = {};
    let totalSessions = 0;
    let sessionsWithContract = 0;

    for (const session of sessions || []) {
      const meta = session.metadata as Record<string, unknown> | null;
      const sessionConfig = meta?.sessionConfig as Record<string, unknown> | undefined;
      const contract = meta?.depthDifficultyContract as Record<string, unknown> | undefined;

      const rating = (session.rating as string) || (sessionConfig?.rating as string) || 'private';
      const studyMode = (sessionConfig?.studyMode as string) || 'unknown';
      const difficulty = (sessionConfig?.difficulty as string) || 'unset';
      const hasContract = !!contract;
      const contractRating = (contract?.rating as string) ?? null;
      const contractDifficulty = (contract?.difficulty as string) ?? null;

      totalSessions++;
      ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;
      difficultyCounts[difficulty] = (difficultyCounts[difficulty] || 0) + 1;

      if (hasContract) {
        sessionsWithContract++;
        const pairKey = `${contractRating}:${contractDifficulty}`;
        contractPairCounts[pairKey] = (contractPairCounts[pairKey] || 0) + 1;
      }

      sessionInfos.push({
        session_id: session.id as string,
        rating,
        status: session.status as string,
        study_mode: studyMode,
        difficulty,
        exchange_count: (session.exchange_count as number) || 0,
        ended_at: session.ended_at as string | null,
        has_contract: hasContract,
        contract_rating: contractRating,
        contract_difficulty: contractDifficulty,
      });
    }

    const aggregate = {
      sessions_queried: totalSessions,
      sessions_with_contract: sessionsWithContract,
      contract_adoption_rate: totalSessions > 0
        ? Math.round((sessionsWithContract / totalSessions) * 100)
        : 0,
      rating_distribution: ratingCounts,
      difficulty_distribution: difficultyCounts,
      contract_pair_distribution: contractPairCounts,
    };

    return NextResponse.json({
      aggregate,
      sessions: sessionInfos,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
