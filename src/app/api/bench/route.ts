/**
 * Temporary benchmark endpoint for latency testing.
 * Accepts Bearer token auth, runs a mini exam session, returns timing data.
 * DELETE THIS FILE after benchmarking is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initPlanner } from '@/lib/exam-planner';
import { assessAnswer, generateExaminerTurn, type ExamMessage } from '@/lib/exam-engine';
import type { SessionConfig } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Timing {
  step: string;
  ms: number;
}

async function timed<T>(step: string, fn: () => Promise<T>): Promise<{ result: T; timing: Timing }> {
  const start = performance.now();
  const result = await fn();
  return { result, timing: { step, ms: Math.round(performance.now() - start) } };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const body = await request.json();
  const answers: string[] = body.answers || [
    'The four forces are lift, weight, thrust, and drag.',
  ];

  const timings: Timing[] = [];

  try {

  // 1. Create session
  const config: SessionConfig = {
    rating: 'private',
    aircraftClass: 'ASEL',
    studyMode: 'cross_acs',
    difficulty: 'mixed',
    selectedAreas: [],
    selectedTasks: [],
  };

  const { result: session, timing: sessionTiming } = await timed('db.session_create', async () => {
    const { data, error } = await supabase.from('exam_sessions').insert({
      user_id: user.id,
      status: 'active',
      rating: 'private',
      study_mode: 'cross_acs',
      difficulty_preference: 'mixed',
    }).select().single();
    if (error) throw error;
    return data;
  });
  timings.push(sessionTiming);

  // 2. Init planner (DB queries + element selection)
  const { result: plannerResult, timing: plannerTiming } = await timed('db.planner_init', async () => {
    return await initPlanner(config, user.id);
  });
  timings.push(plannerTiming);

  if (!plannerResult) {
    return NextResponse.json({ error: 'Planner init failed', timings }, { status: 500 });
  }

  // 3. Generate first examiner question (Claude API)
  // generateExaminerTurn(task, history, difficulty?, aircraftClass?, prefetchedRag?)
  const { result: firstQuestion, timing: firstQTiming } = await timed('claude.first_question', async () => {
    return await generateExaminerTurn(
      plannerResult.task,
      [],
      plannerResult.difficulty,
    );
  });
  timings.push(firstQTiming);

  // 4. For each answer: assess + generate follow-up
  let history: ExamMessage[] = [
    { role: 'examiner', text: firstQuestion.examinerMessage },
  ];

  for (let i = 0; i < answers.length; i++) {
    // assessAnswer(task, history, studentAnswer)
    const { timing: assessTiming } = await timed(`claude.assess[${i}]`, async () => {
      return await assessAnswer(
        plannerResult.task,
        [...history, { role: 'student', text: answers[i] }],
        answers[i],
      );
    });
    timings.push(assessTiming);

    history.push({ role: 'student', text: answers[i] });

    // generateExaminerTurn(task, history, difficulty?)
    const { result: followUp, timing: followTiming } = await timed(`claude.followup[${i}]`, async () => {
      return await generateExaminerTurn(
        plannerResult.task,
        history,
        plannerResult.difficulty,
      );
    });
    timings.push(followTiming);

    history.push({ role: 'examiner', text: followUp.examinerMessage });
  }

  // 5. Clean up — mark session completed
  const { timing: cleanupTiming } = await timed('db.session_complete', async () => {
    await supabase.from('exam_sessions').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    }).eq('id', session.id);
  });
  timings.push(cleanupTiming);

  const totalMs = timings.reduce((sum, t) => sum + t.ms, 0);

  return NextResponse.json({ timings, totalMs, sessionId: session.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ error: message, stack, timings }, { status: 500 });
  }
}
