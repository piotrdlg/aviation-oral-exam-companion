import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/users/[id]
 *
 * Full user detail: profile, email, sessions, element scores, usage summary, admin notes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const { id: userId } = await params;

    // Run all queries in parallel
    const [
      profileResult,
      authUserResult,
      sessionsResult,
      elementScoresResult,
      usageSummaryResult,
      adminNotesResult,
    ] = await Promise.all([
      // User profile
      serviceSupabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single(),

      // Auth user details (email, created_at, etc.)
      serviceSupabase.auth.admin.getUserById(userId),

      // All exam sessions
      serviceSupabase
        .from('exam_sessions')
        .select('id, rating, status, study_mode, difficulty_preference, aircraft_class, exchange_count, started_at, ended_at, selected_areas, selected_tasks')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(50),

      // Element scores (aggregated from element_attempts via session ownership)
      serviceSupabase
        .from('element_attempts')
        .select('element_code, tag_type, score, is_primary, session_id, created_at')
        .in(
          'session_id',
          // Subquery: get session IDs for this user
          // We'll handle this after fetching sessions
          []
        ),

      // Usage summary (last 30 days)
      serviceSupabase
        .from('usage_logs')
        .select('event_type, provider, quantity, status, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500),

      // Admin notes
      serviceSupabase
        .from('admin_notes')
        .select('*')
        .eq('target_user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Now fetch element attempts using actual session IDs
    const sessionIds = (sessionsResult.data || []).map((s) => s.id);
    let elementAttempts: Array<{
      element_code: string;
      tag_type: string;
      score: string | null;
      is_primary: boolean;
      created_at: string;
    }> = [];

    if (sessionIds.length > 0) {
      const { data: attempts } = await serviceSupabase
        .from('element_attempts')
        .select('element_code, tag_type, score, is_primary, created_at')
        .in('session_id', sessionIds)
        .eq('tag_type', 'attempt')
        .eq('is_primary', true);

      elementAttempts = attempts || [];
    }

    // Aggregate element scores
    const elementScoreMap: Record<string, {
      total_attempts: number;
      satisfactory: number;
      partial: number;
      unsatisfactory: number;
      latest_score: string | null;
      latest_at: string | null;
    }> = {};

    for (const attempt of elementAttempts) {
      if (!elementScoreMap[attempt.element_code]) {
        elementScoreMap[attempt.element_code] = {
          total_attempts: 0,
          satisfactory: 0,
          partial: 0,
          unsatisfactory: 0,
          latest_score: null,
          latest_at: null,
        };
      }
      const entry = elementScoreMap[attempt.element_code];
      entry.total_attempts += 1;
      if (attempt.score === 'satisfactory') entry.satisfactory += 1;
      else if (attempt.score === 'partial') entry.partial += 1;
      else if (attempt.score === 'unsatisfactory') entry.unsatisfactory += 1;

      if (!entry.latest_at || attempt.created_at > entry.latest_at) {
        entry.latest_at = attempt.created_at;
        entry.latest_score = attempt.score;
      }
    }

    // Aggregate usage summary
    const usageSummary: Record<string, { total_quantity: number; request_count: number; error_count: number }> = {};
    if (usageSummaryResult.data) {
      for (const log of usageSummaryResult.data) {
        const key = `${log.provider}/${log.event_type}`;
        if (!usageSummary[key]) {
          usageSummary[key] = { total_quantity: 0, request_count: 0, error_count: 0 };
        }
        usageSummary[key].total_quantity += log.quantity as number;
        usageSummary[key].request_count += 1;
        if (log.status === 'error' || log.status === 'timeout') {
          usageSummary[key].error_count += 1;
        }
      }
    }

    return NextResponse.json({
      profile: profileResult.data,
      email: authUserResult.data?.user?.email || null,
      auth_created_at: authUserResult.data?.user?.created_at || null,
      last_sign_in_at: authUserResult.data?.user?.last_sign_in_at || null,
      sessions: sessionsResult.data || [],
      element_scores: elementScoreMap,
      usage_summary_30d: usageSummary,
      admin_notes: adminNotesResult.data || [],
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
