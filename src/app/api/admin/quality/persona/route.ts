import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/persona
 *
 * Returns persona usage metrics from recent sessions.
 * Reports persona distribution, adoption rate, and per-session details.
 *
 * Query params:
 *   ?limit=N (default 20, max 100)
 *
 * Phase 11 — Examiner Personality Engine
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

    interface PersonaSessionInfo {
      session_id: string;
      rating: string;
      status: string;
      exchange_count: number;
      ended_at: string | null;
      has_persona: boolean;
      persona_key: string | null;
      persona_label: string | null;
    }

    const sessionInfos: PersonaSessionInfo[] = [];
    const personaCounts: Record<string, number> = {};
    const ratingPersonaCounts: Record<string, number> = {};
    let withPersona = 0;

    for (const s of sessions || []) {
      const meta = s.metadata as Record<string, unknown> | null;
      const persona = meta?.persona as { key?: string; label?: string } | undefined;
      const hasPersona = !!persona?.key;

      if (hasPersona) {
        withPersona++;
        const key = persona!.key!;
        personaCounts[key] = (personaCounts[key] || 0) + 1;
        const pair = `${s.rating}:${key}`;
        ratingPersonaCounts[pair] = (ratingPersonaCounts[pair] || 0) + 1;
      }

      const sessionConfig = meta?.sessionConfig as Record<string, unknown> | undefined;

      sessionInfos.push({
        session_id: s.id,
        rating: s.rating || (sessionConfig?.rating as string) || 'unknown',
        status: s.status,
        exchange_count: s.exchange_count || 0,
        ended_at: s.ended_at,
        has_persona: hasPersona,
        persona_key: persona?.key || null,
        persona_label: persona?.label || null,
      });
    }

    const total = sessions?.length || 0;

    return NextResponse.json({
      total_sessions: total,
      sessions_with_persona: withPersona,
      persona_adoption_rate: total > 0 ? `${((withPersona / total) * 100).toFixed(1)}%` : '0%',
      persona_distribution: personaCounts,
      rating_persona_distribution: ratingPersonaCounts,
      sessions: sessionInfos,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
