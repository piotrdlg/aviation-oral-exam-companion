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

    // Build user object matching frontend's UserDetail interface
    const profile = profileResult.data;
    const authUser = authUserResult.data?.user;
    const user_detail = {
      id: profile.user_id,
      email: authUser?.email || 'unknown',
      tier: profile.tier,
      account_status: profile.account_status,
      subscription_status: profile.subscription_status,
      status_reason: profile.status_reason || null,
      auth_method: profile.auth_method || null,
      last_login_at: profile.last_login_at || null,
      created_at: profile.created_at,
      stripe_customer_id: profile.stripe_customer_id || null,
    };

    // Build sessions matching frontend's UserSession interface
    const sessions = (sessionsResult.data || []).map((s) => ({
      id: s.id,
      rating: s.rating || 'private',
      status: s.status,
      exchange_count: s.exchange_count || 0,
      started_at: s.started_at,
      ended_at: s.ended_at || null,
      study_mode: s.study_mode || 'linear',
      acs_tasks_covered: [], // Not fetched in this query for performance
    }));

    // Build scores array matching frontend's UserScore interface
    // We need ACS element metadata to populate task_id and area
    const elementCodes = Object.keys(elementScoreMap);
    let elementsMap: Record<string, { task_id: string; area: string }> = {};
    if (elementCodes.length > 0) {
      const { data: elements } = await serviceSupabase
        .from('acs_elements')
        .select('code, task_id')
        .in('code', elementCodes);

      if (elements) {
        // We also need task area info
        const taskIds = [...new Set(elements.map((e) => e.task_id as string))];
        const { data: tasks } = await serviceSupabase
          .from('acs_tasks')
          .select('id, area')
          .in('id', taskIds);

        const taskAreaMap: Record<string, string> = {};
        if (tasks) {
          for (const t of tasks) {
            taskAreaMap[t.id as string] = t.area as string;
          }
        }

        for (const e of elements) {
          elementsMap[e.code as string] = {
            task_id: e.task_id as string,
            area: taskAreaMap[e.task_id as string] || 'Unknown',
          };
        }
      }
    }

    const scores = Object.entries(elementScoreMap).map(([code, data]) => ({
      element_code: code,
      task_id: elementsMap[code]?.task_id || '',
      area: elementsMap[code]?.area || 'Unknown',
      total_attempts: data.total_attempts,
      satisfactory_count: data.satisfactory,
      partial_count: data.partial,
      unsatisfactory_count: data.unsatisfactory,
      latest_score: data.latest_score,
    }));

    // Build usage array matching frontend's UsageEntry interface
    // Group by date
    const usageByDate: Record<string, { llm_requests: number; tts_requests: number; stt_sessions: number; total_tokens: number }> = {};
    if (usageSummaryResult.data) {
      for (const log of usageSummaryResult.data) {
        const date = (log.created_at as string).slice(0, 10); // YYYY-MM-DD
        if (!usageByDate[date]) {
          usageByDate[date] = { llm_requests: 0, tts_requests: 0, stt_sessions: 0, total_tokens: 0 };
        }
        const eventType = log.event_type as string;
        if (eventType === 'llm_request') {
          usageByDate[date].llm_requests += 1;
          usageByDate[date].total_tokens += (log.quantity as number) || 0;
        } else if (eventType === 'tts_request') {
          usageByDate[date].tts_requests += 1;
        } else if (eventType === 'stt_session' || eventType === 'token_issued') {
          usageByDate[date].stt_sessions += 1;
        }
      }
    }

    const usage = Object.entries(usageByDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, data]) => ({ date, ...data }));

    // Build notes matching frontend's AdminNoteEntry interface
    // Look up admin emails
    const adminIds = [...new Set((adminNotesResult.data || []).map((n) => n.admin_user_id as string))];
    let adminEmailMap: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: authUsers } = await serviceSupabase.auth.admin.listUsers({ perPage: 100 });
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (adminIds.includes(u.id)) {
            adminEmailMap[u.id] = u.email || 'unknown';
          }
        }
      }
    }

    const notes = (adminNotesResult.data || []).map((n) => ({
      id: n.id as string,
      admin_email: adminEmailMap[n.admin_user_id as string] || (n.admin_user_id as string).slice(0, 8) + '...',
      note: n.note as string,
      created_at: n.created_at as string,
    }));

    return NextResponse.json({
      user: user_detail,
      sessions,
      scores,
      usage,
      notes,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
