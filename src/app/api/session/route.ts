import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { getSystemConfig } from '@/lib/system-config';
import { requireSafeDbTarget } from '@/lib/app-env';

// Service-role client for tier lookups + grading queries (bypasses RLS)
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FREE_TRIAL_EXAM_LIMIT = 3;
const FREE_TRIAL_EXPIRY_DAYS = 7;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  if (action === 'create') {
    const { study_mode, difficulty_preference, selected_areas, aircraft_class, selected_tasks, rating } = body;

    // Check trial limit + load config for guardrail in parallel
    const [tier, sessionConfig_guard] = await Promise.all([
      getUserTier(serviceSupabase, user.id),
      getSystemConfig(serviceSupabase),
    ]);
    requireSafeDbTarget(sessionConfig_guard, 'session-api');
    const isPaying = tier === 'dpe_live';

    // Determine is_onboarding server-side (never trust client).
    // Onboarding is allowed only when the user has not completed onboarding
    // AND has no existing onboarding exams (capped at 1 per user).
    let isOnboarding = false;
    if (body.is_onboarding) {
      const [{ data: profile }, { count: existingOnboarding }] = await Promise.all([
        serviceSupabase
          .from('user_profiles')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .single(),
        serviceSupabase
          .from('exam_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_onboarding', true),
      ]);
      isOnboarding = !profile?.onboarding_completed && (existingOnboarding ?? 0) === 0;
    }

    let expiresAt: string | null = null;

    if (!isPaying && !isOnboarding) {
      // Count non-onboarding, non-abandoned exams for this user (service role bypasses RLS for accurate count)
      const { count, error: countError } = await serviceSupabase
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_onboarding', false)
        .neq('status', 'abandoned');

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if ((count ?? 0) >= FREE_TRIAL_EXAM_LIMIT) {
        return NextResponse.json(
          { error: 'trial_limit_reached', limit: FREE_TRIAL_EXAM_LIMIT, upgrade_url: '/pricing' },
          { status: 403 }
        );
      }
    }

    // Set expiration for free-tier exams (onboarding exams don't expire)
    if (!isPaying && !isOnboarding) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + FREE_TRIAL_EXPIRY_DAYS);
      expiresAt = expiry.toISOString();
    }

    // Use service role to insert — prevents RLS bypass of is_onboarding/expires_at fields
    const { data, error } = await serviceSupabase
      .from('exam_sessions')
      .insert({
        user_id: user.id,
        rating: rating || 'private',
        status: 'active',
        study_mode: study_mode || 'cross_acs',
        difficulty_preference: difficulty_preference || 'mixed',
        selected_areas: selected_areas || [],
        aircraft_class: aircraft_class || 'ASEL',
        selected_tasks: selected_tasks || [],
        is_onboarding: isOnboarding,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ session: data });
  }

  if (action === 'update') {
    const { sessionId, status, acs_tasks_covered, exchange_count, planner_state, session_config, task_data, voice_enabled } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (acs_tasks_covered) updateData.acs_tasks_covered = acs_tasks_covered;
    if (exchange_count !== undefined) updateData.exchange_count = exchange_count;

    // Grade the exam when completing
    if (status === 'completed') {
      updateData.ended_at = new Date().toISOString();

      try {
        const { computeExamResult } = await import('@/lib/exam-logic');

        // Load scored element attempts for this session
        const { data: attempts } = await supabase
          .from('element_attempts')
          .select('element_code, score')
          .eq('session_id', sessionId)
          .eq('tag_type', 'attempt')
          .not('score', 'is', null);

        // Load the planner state to determine total elements in the exam set
        const { data: examRow } = await supabase
          .from('exam_sessions')
          .select('metadata')
          .eq('id', sessionId)
          .eq('user_id', user.id)
          .single();

        const plannerState = (examRow?.metadata as Record<string, unknown>)?.plannerState as { queue: string[] } | undefined;
        const totalElements = plannerState?.queue?.length || 0;

        if (attempts && attempts.length > 0) {
          const attemptData = attempts.map(a => ({
            element_code: a.element_code,
            score: a.score as 'satisfactory' | 'unsatisfactory' | 'partial',
            area: a.element_code.split('.')[1],
          }));
          // Use planner queue length if available, otherwise fall back to number of attempts
          const effectiveTotal = totalElements > 0 ? totalElements : attemptData.length;
          const result = computeExamResult(attemptData, effectiveTotal, 'user_ended');
          updateData.result = result;
        } else {
          console.warn(`Exam grading skipped for session ${sessionId}: attempts=${attempts?.length ?? 'null'}, totalElements=${totalElements}`);
        }
      } catch (err) {
        console.error('Exam grading error:', err);
      }
    }

    // Persist planner state, session config, task data, and voice pref in metadata for session resume
    if (planner_state || session_config || task_data || voice_enabled !== undefined) {
      const { data: existing } = await supabase
        .from('exam_sessions')
        .select('metadata')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      const currentMetadata = (existing?.metadata as Record<string, unknown>) || {};
      updateData.metadata = {
        ...currentMetadata,
        ...(planner_state ? { plannerState: planner_state } : {}),
        ...(session_config ? { sessionConfig: session_config } : {}),
        ...(task_data ? { taskData: task_data } : {}),
        ...(voice_enabled !== undefined ? { voiceEnabled: voice_enabled } : {}),
      };
    }

    const { error } = await supabase
      .from('exam_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, result: updateData.result ?? null });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // Element scores endpoint (lifetime, all sessions)
  if (action === 'element-scores') {
    const rating = searchParams.get('rating') || 'private';
    const { data, error } = await supabase.rpc('get_element_scores', {
      p_user_id: user.id,
      p_rating: rating,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scores: data || [] });
  }

  // Session-scoped element scores
  if (action === 'session-element-scores') {
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Verify user owns this session
    const { data: session } = await supabase
      .from('exam_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data, error } = await supabase.rpc('get_session_element_scores', {
      p_session_id: sessionId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scores: data || [] });
  }

  // Get most recent resumable session (active or paused)
  if (action === 'get-resumable') {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('id, rating, status, started_at, exchange_count, study_mode, difficulty_preference, aircraft_class, selected_areas, selected_tasks, metadata, acs_tasks_covered')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('started_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session: data?.[0] || null });
  }

  // Get ALL resumable sessions (active or paused)
  if (action === 'get-all-resumable') {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('id, rating, status, started_at, exchange_count, study_mode, difficulty_preference, aircraft_class, selected_areas, selected_tasks, metadata, acs_tasks_covered')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('started_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data || [] });
  }

  // Load session transcripts for resume
  if (action === 'transcripts') {
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Verify user owns this session
    const { data: session } = await supabase
      .from('exam_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('session_transcripts')
      .select('role, text, assessment')
      .eq('session_id', sessionId)
      .order('exchange_number')
      .order('timestamp');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ transcripts: data || [] });
  }

  // Default: list sessions
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data });
}
