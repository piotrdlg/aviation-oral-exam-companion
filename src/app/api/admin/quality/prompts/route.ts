import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/prompts
 *
 * Returns prompt governance quality metrics including prompt inventory,
 * fallback rates, coverage warnings, and recent session prompt traces.
 *
 * Query params:
 *   ?limit=N (default 50, max 200) — number of recent sessions to sample
 *
 * Returns:
 *   - prompt_inventory: counts grouped by prompt_key and status
 *   - fallback_rate: db vs fallback vs missing source breakdown
 *   - coverage_warnings: missing required prompt_keys
 *   - latest_traced_sessions: 10 most recent sessions with promptTrace
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '50'),
      200,
    );

    // 1. Prompt inventory — group by prompt_key and status
    const { data: promptRows, error: promptError } = await serviceSupabase
      .from('prompt_versions')
      .select('prompt_key, status');

    if (promptError) {
      return NextResponse.json({ error: promptError.message }, { status: 500 });
    }

    const inventory: Record<string, Record<string, number>> = {};
    let totalPrompts = 0;

    for (const row of promptRows || []) {
      const key = row.prompt_key as string;
      const status = row.status as string;
      if (!inventory[key]) {
        inventory[key] = {};
      }
      inventory[key][status] = (inventory[key][status] || 0) + 1;
      totalPrompts++;
    }

    // 2. Fallback rate — sample recent sessions
    const { data: sessions, error: sessionError } = await serviceSupabase
      .from('exam_sessions')
      .select('id, started_at, metadata')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    let dbCount = 0;
    let fallbackCount = 0;
    let missingCount = 0;

    interface PromptTrace {
      examiner_prompt_version_id: string | null;
      source: 'db' | 'fallback';
      rating: string;
      study_mode: string;
      difficulty: string;
      profile_key: string;
      timestamp: string;
    }

    interface TracedSession {
      session_id: string;
      started_at: string;
      promptTrace: PromptTrace;
    }

    const tracedSessions: TracedSession[] = [];

    for (const session of sessions || []) {
      const meta = session.metadata as Record<string, unknown> | null;
      const promptTrace = meta?.promptTrace as PromptTrace | undefined;

      if (!promptTrace) {
        missingCount++;
      } else if (promptTrace.source === 'db') {
        dbCount++;
      } else if (promptTrace.source === 'fallback') {
        fallbackCount++;
      } else {
        missingCount++;
      }

      // Collect traced sessions (up to 10)
      if (promptTrace && tracedSessions.length < 10) {
        tracedSessions.push({
          session_id: session.id as string,
          started_at: session.started_at as string,
          promptTrace,
        });
      }
    }

    const sampled = (sessions || []).length;

    const fallbackRate = {
      sessions_sampled: sampled,
      db: dbCount,
      fallback: fallbackCount,
      missing: missingCount,
      db_rate: sampled > 0 ? `${((dbCount / sampled) * 100).toFixed(1)}%` : '0%',
      fallback_rate: sampled > 0 ? `${((fallbackCount / sampled) * 100).toFixed(1)}%` : '0%',
    };

    // 3. Coverage warnings — check required prompt_keys have at least 1 published row
    const REQUIRED_PROMPT_KEYS = [
      'examiner_system',
      'assessment_system',
      'persona_maria_torres',
      'persona_bob_mitchell',
      'persona_jim_hayes',
      'persona_karen_sullivan',
    ];

    const coverageWarnings: string[] = [];

    for (const key of REQUIRED_PROMPT_KEYS) {
      const published = inventory[key]?.['published'] || 0;
      if (published === 0) {
        coverageWarnings.push(key);
      }
    }

    return NextResponse.json({
      prompt_inventory: {
        total_versions: totalPrompts,
        by_key: inventory,
      },
      fallback_rate: fallbackRate,
      coverage_warnings: {
        missing_published: coverageWarnings,
        all_required_covered: coverageWarnings.length === 0,
        required_keys: REQUIRED_PROMPT_KEYS,
      },
      latest_traced_sessions: tracedSessions,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
