import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const { data, error } = await supabase
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
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ session: data });
  }

  if (action === 'update') {
    const { sessionId, status, acs_tasks_covered, exchange_count, planner_state, session_config } = body;
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (acs_tasks_covered) updateData.acs_tasks_covered = acs_tasks_covered;
    if (exchange_count !== undefined) updateData.exchange_count = exchange_count;
    if (status === 'completed') updateData.ended_at = new Date().toISOString();

    // Persist planner state and session config in metadata for session resume
    if (planner_state || session_config) {
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
    return NextResponse.json({ ok: true });
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
      .order('created_at');

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
