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
    const { study_mode, difficulty_preference, selected_areas } = body;
    const { data, error } = await supabase
      .from('exam_sessions')
      .insert({
        user_id: user.id,
        rating: 'private',
        status: 'active',
        study_mode: study_mode || 'cross_acs',
        difficulty_preference: difficulty_preference || 'mixed',
        selected_areas: selected_areas || [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ session: data });
  }

  if (action === 'update') {
    const { sessionId, status, acs_tasks_covered, exchange_count } = body;
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (acs_tasks_covered) updateData.acs_tasks_covered = acs_tasks_covered;
    if (exchange_count !== undefined) updateData.exchange_count = exchange_count;
    if (status === 'completed') updateData.ended_at = new Date().toISOString();

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

  // Element scores endpoint
  if (action === 'element-scores') {
    const { data, error } = await supabase.rpc('get_element_scores', {
      p_user_id: user.id,
      p_rating: 'private',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scores: data || [] });
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
