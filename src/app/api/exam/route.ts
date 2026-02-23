import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  pickStartingTask,
  pickNextTask,
  generateExaminerTurn,
  generateExaminerTurnStreaming,
  assessAnswer,
  fetchRagContext,
  type ExamMessage,
  type AssessmentData,
  type LlmUsage,
} from '@/lib/exam-engine';
import { computeExamResult } from '@/lib/exam-logic';
import { initPlanner, advancePlanner } from '@/lib/exam-planner';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';
import { requireSafeDbTarget } from '@/lib/app-env';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { enforceOneActiveExam, getSessionTokenHash } from '@/lib/session-enforcement';
import { createTimingContext, writeTimings } from '@/lib/timing';
import type { SessionConfig, PlannerState } from '@/types/database';

// Service-role client for usage logging + config lookups (bypasses RLS)
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Log LLM usage to usage_logs (non-blocking).
 * Called after each Anthropic API call for cost tracking and monitoring.
 */
function logLlmUsage(
  userId: string,
  usage: LlmUsage | undefined,
  tier: string,
  sessionId?: string,
  metadata?: Record<string, unknown>
): void {
  if (!usage) return;
  serviceSupabase
    .from('usage_logs')
    .insert({
      user_id: userId,
      session_id: sessionId ?? null,
      event_type: 'llm_request',
      provider: 'anthropic',
      tier,
      quantity: usage.input_tokens + usage.output_tokens,
      latency_ms: usage.latency_ms,
      status: 'ok',
      metadata: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        ...metadata,
      },
    })
    .then(({ error }) => {
      if (error) console.error('LLM usage log error:', error.message);
    });
}

/**
 * Write element_attempts rows based on assessment element codes.
 * Follows the invariant: student transcript -> assessment -> element_attempts
 */
async function writeElementAttempts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  transcriptId: string,
  assessment: AssessmentData
) {
  const rows: Array<{
    session_id: string;
    transcript_id: string;
    element_code: string;
    tag_type: 'attempt' | 'mention';
    score: string | null;
    is_primary: boolean;
    confidence: number | null;
  }> = [];

  // Primary element as scored attempt
  if (assessment.primary_element) {
    rows.push({
      session_id: sessionId,
      transcript_id: transcriptId,
      element_code: assessment.primary_element,
      tag_type: 'attempt',
      score: assessment.score,
      is_primary: true,
      confidence: null,
    });
  }

  // Mentioned elements as unscored mentions
  for (const code of assessment.mentioned_elements) {
    // Skip if it's the same as primary (already added)
    if (code === assessment.primary_element) continue;
    rows.push({
      session_id: sessionId,
      transcript_id: transcriptId,
      element_code: code,
      tag_type: 'mention',
      score: null,
      is_primary: false,
      confidence: null,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('element_attempts')
      .insert(rows);

    if (error) {
      // Log but don't fail the request — element tracking is non-critical
      console.error('Error writing element_attempts:', error.message);
    }
  }
}

/**
 * GET /api/exam?action=list-tasks — return all ACS tasks for the task picker.
 */
// Allow up to 60s for streaming responses (examiner generation + assessment)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'list-tasks') {
      const rating = searchParams.get('rating') || 'private';
      const { data, error } = await supabase
        .from('acs_tasks')
        .select('id, area, task, applicable_classes')
        .eq('rating', rating)
        .order('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ tasks: data || [] });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Exam GET API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Kill switch check: fetch config + tier, block if Anthropic or tier is disabled
    const [config, tier] = await Promise.all([
      getSystemConfig(serviceSupabase),
      getUserTier(serviceSupabase, user.id),
    ]);

    const killResult = checkKillSwitch(config, 'anthropic', tier);
    if (killResult.blocked) {
      return NextResponse.json(
        { error: 'service_unavailable', reason: killResult.reason },
        { status: 503 }
      );
    }

    requireSafeDbTarget(config, 'exam-api');

    // Latency instrumentation: record spans for key operations
    const timing = createTimingContext();
    timing.start('prechecks');

    const body = await request.json();
    const { action, history, taskData, studentAnswer, coveredTaskIds, sessionId, stream, sessionConfig, plannerState: clientPlannerState, chunkedResponse } = body as {
      action: 'start' | 'respond' | 'next-task' | 'resume-current';
      history?: ExamMessage[];
      taskData?: Awaited<ReturnType<typeof pickStartingTask>>;
      studentAnswer?: string;
      coveredTaskIds?: string[];
      sessionId?: string;
      stream?: boolean;
      sessionConfig?: SessionConfig;
      plannerState?: PlannerState;
      chunkedResponse?: boolean;
    };

    // Parallel pre-checks: profile fetch + session enforcement are independent.
    // Persona resolution depends on the profile result but is fast (cached config).
    const profilePromise = serviceSupabase
      .from('user_profiles')
      .select('display_name, preferred_voice')
      .eq('user_id', user.id)
      .single();

    const enforcementPromise = (async () => {
      if (!sessionId) return { rejected: false, pausedSessionId: undefined as string | undefined };
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.access_token) {
          const tokenHash = getSessionTokenHash(authSession);
          return enforceOneActiveExam(serviceSupabase, user.id, sessionId, tokenHash, action);
        }
      } catch (err) {
        console.error('Session enforcement error:', err);
      }
      return { rejected: false, pausedSessionId: undefined as string | undefined };
    })();

    const [{ data: examUserProfile }, enforcementResult] = await Promise.all([
      profilePromise,
      enforcementPromise,
    ]);

    if (enforcementResult.rejected) {
      return NextResponse.json(
        { error: 'session_superseded', message: 'This exam session has been superseded by another device. Please end this session.' },
        { status: 409 }
      );
    }
    const enforcementPausedSessionId = enforcementResult.pausedSessionId;

    // Persona resolution (depends on profile, but voice.user_options is TTL-cached)
    let personaId: string | undefined;
    if (examUserProfile?.preferred_voice) {
      const { data: voiceConfig } = await serviceSupabase
        .from('system_config')
        .select('value')
        .eq('key', 'voice.user_options')
        .maybeSingle();
      const personas = ((voiceConfig?.value || []) as Array<{ persona_id: string; model: string }>);
      personaId = personas.find(p => p.model === examUserProfile.preferred_voice)?.persona_id;
    }
    const studentName = examUserProfile?.display_name || undefined;

    timing.end('prechecks');

    if (action === 'start') {
      // Track last active usage
      const { error: profileErr } = await serviceSupabase
        .from('user_profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (profileErr) console.error('last_login_at update error:', profileErr.message);

      // If session config provided, use the planner for element-level scheduling
      if (sessionConfig) {
        const plannerResult = await initPlanner(sessionConfig, user.id);
        if (!plannerResult) {
          return NextResponse.json(
            { error: 'No elements found for your session configuration.' },
            { status: 500 }
          );
        }

        const rating = sessionConfig.rating || 'private';
        const turn = await generateExaminerTurn(
          plannerResult.task, [], plannerResult.difficulty, sessionConfig.aircraftClass, undefined, rating, sessionConfig.studyMode, personaId, studentName
        );

        // Log LLM usage (non-blocking)
        logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'start', call: 'generateExaminerTurn' });

        // Persist examiner opening turn to transcript
        if (sessionId) {
          const { error: openErr } = await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: 0,
            role: 'examiner',
            text: turn.examinerMessage,
          });
          if (openErr) console.error('Opening examiner transcript write error:', openErr.message);
        }

        // Persist planner state + session config + taskData to metadata for resume
        if (sessionId) {
          const { error: metaErr } = await serviceSupabase
            .from('exam_sessions')
            .update({ metadata: { plannerState: plannerResult.plannerState, sessionConfig, taskData: plannerResult.task } })
            .eq('id', sessionId);
          if (metaErr) console.error('Planner state persist error:', metaErr.message);
        }

        return NextResponse.json({
          taskId: plannerResult.task.id,
          taskData: plannerResult.task,
          examinerMessage: turn.examinerMessage,
          elementCode: plannerResult.elementCode,
          plannerState: plannerResult.plannerState,
          ...(enforcementPausedSessionId ? { pausedSessionId: enforcementPausedSessionId } : {}),
        });
      }

      // Fallback: random task selection (legacy mode, no class filtering)
      const rating = (body.sessionConfig as SessionConfig | undefined)?.rating || 'private';
      const task = await pickStartingTask([], undefined, rating);
      if (!task) {
        return NextResponse.json(
          { error: 'No ACS tasks found. Check database seed.' },
          { status: 500 }
        );
      }

      // Support streaming for start — no chunkedResponse here intentionally:
      // the opening examiner question has no student feedback to split into 3 chunks.
      if (stream) {
        const { stream: readableStream, fullTextPromise: startTextPromise } = await generateExaminerTurnStreaming(task, [], undefined, undefined, undefined, undefined, undefined, undefined, undefined, personaId, studentName);

        after(async () => {
          try {
            const fullText = await startTextPromise;
            if (sessionId && fullText) {
              const { error } = await serviceSupabase.from('session_transcripts').insert({
                session_id: sessionId,
                exchange_number: 0,
                role: 'examiner',
                text: fullText,
              });
              if (error) console.error('Start examiner transcript write error:', error.message);
            }
          } catch (err) {
            console.error('Start transcript write error:', err);
          }
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Task-Id': task.id,
            'X-Task-Data': Buffer.from(JSON.stringify(task)).toString('base64'),
          },
        });
      }

      const turn = await generateExaminerTurn(task, [], undefined, undefined, undefined, undefined, undefined, personaId, studentName);

      // Log LLM usage (non-blocking)
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'start', call: 'generateExaminerTurn' });

      // Persist examiner opening turn to transcript
      if (sessionId) {
        const { error: openErr } = await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: 0,
          role: 'examiner',
          text: turn.examinerMessage,
        });
        if (openErr) console.error('Opening examiner transcript write error:', openErr.message);
      }

      return NextResponse.json({
        taskId: task.id,
        taskData: task,
        examinerMessage: turn.examinerMessage,
        ...(enforcementPausedSessionId ? { pausedSessionId: enforcementPausedSessionId } : {}),
      });
    }

    if (action === 'respond') {
      if (!taskData || !history || !studentAnswer) {
        return NextResponse.json(
          { error: 'Missing taskData, history, or studentAnswer' },
          { status: 400 }
        );
      }

      timing.start('exchange.total');

      // Calculate exchange number from history length
      const exchangeNumber = Math.floor(history.length / 2) + 1;

      // Step 1: Persist student transcript + fetch RAG in parallel
      timing.start('rag.total');
      const [studentTranscriptResult, rag] = await Promise.all([
        sessionId
          ? supabase
              .from('session_transcripts')
              .insert({
                session_id: sessionId,
                exchange_number: exchangeNumber,
                role: 'student',
                text: studentAnswer,
              })
              .select('id')
              .single()
          : Promise.resolve({ data: null }),
        fetchRagContext(taskData, history, studentAnswer, 5, { systemConfig: config, timing }),
      ]);
      const studentTranscriptId = studentTranscriptResult.data?.id ?? null;
      if (!studentTranscriptId && sessionId) {
        const insertErr = 'error' in studentTranscriptResult ? (studentTranscriptResult as { error?: { message?: string } }).error?.message : 'unknown';
        console.error('Student transcript insert failed:', insertErr, '— assessment, element_attempts, and citations will NOT be persisted for this exchange');
      }

      timing.end('rag.total');

      // Step 2: Build updated history for examiner
      const updatedHistory: ExamMessage[] = [
        ...history,
        { role: 'student', text: studentAnswer },
      ];

      // Step 3: Run assessment + examiner generation IN PARALLEL (key optimization)
      // The examiner's next question depends on history, NOT on the assessment result.
      const respondRating = sessionConfig?.rating || 'private';
      // Pass difficulty as-is (including 'mixed') for prompt selection
      const respondDifficulty = sessionConfig?.difficulty || undefined;
      if (stream) {
        // Streaming path: start assessment in background, stream examiner immediately
        timing.start('llm.assessment.total');
        timing.start('llm.examiner.total');
        const assessmentPromise = assessAnswer(taskData, history, studentAnswer, rag, rag.ragImages, respondRating, sessionConfig?.studyMode, respondDifficulty)
          .then(a => { timing.end('llm.assessment.total'); return a; });

        const { stream: readableStream, fullTextPromise } = await generateExaminerTurnStreaming(
          taskData, updatedHistory, respondDifficulty, sessionConfig?.aircraftClass, rag, assessmentPromise, undefined, respondRating, sessionConfig?.studyMode, personaId, studentName, chunkedResponse
        );

        // Use after() to ensure ALL DB writes complete even after stream closes.
        // This keeps the serverless function alive until all writes finish.
        after(async () => {
          try {
            const [examinerFullText, assessment] = await Promise.all([
              fullTextPromise,
              assessmentPromise,
            ]);

            // 1. Persist examiner transcript (guaranteed by after(), not fire-and-forget)
            if (sessionId && examinerFullText) {
              const { error } = await serviceSupabase.from('session_transcripts').insert({
                session_id: sessionId,
                exchange_number: exchangeNumber,
                role: 'examiner',
                text: examinerFullText,
              });
              if (error) console.error('Examiner transcript write error:', error.message);
            }

            // Log assessment LLM usage
            logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });

            if (studentTranscriptId && assessment) {
              // 2. Assessment update on student transcript
              const { error: assessErr } = await serviceSupabase
                .from('session_transcripts')
                .update({ assessment })
                .eq('id', studentTranscriptId);
              if (assessErr) console.error('Assessment update error:', assessErr.message);

              // 3. Element attempts
              if (sessionId) {
                await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
              }

              // 4. Citations
              if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
                const citations = assessment.rag_chunks.map((chunk, idx) => ({
                  transcript_id: studentTranscriptId,
                  chunk_id: chunk.id,
                  rank: idx + 1,
                  score: chunk.score,
                  snippet: chunk.content.slice(0, 300),
                }));
                const { error: citErr } = await serviceSupabase
                  .from('transcript_citations')
                  .insert(citations);
                if (citErr) console.error('Citation write error:', citErr.message);
              }
            }
          } catch (err) {
            console.error('Background DB write error:', err);
          }

          // Write latency instrumentation (non-blocking, best-effort)
          if (sessionId) {
            await writeTimings(serviceSupabase, sessionId, exchangeNumber, timing);
          }
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Task-Id': taskData.id,
          },
        });
      }

      // Non-streaming path: run both in parallel, wait for both
      timing.start('llm.assessment.total');
      timing.start('llm.examiner.total');
      const [assessment, turn] = await Promise.all([
        assessAnswer(taskData, history, studentAnswer, rag, rag.ragImages, respondRating, sessionConfig?.studyMode, respondDifficulty)
          .then(a => { timing.end('llm.assessment.total'); return a; }),
        generateExaminerTurn(taskData, updatedHistory, respondDifficulty, sessionConfig?.aircraftClass as import('@/types/database').AircraftClass | undefined, rag, respondRating, sessionConfig?.studyMode, personaId, studentName)
          .then(t => { timing.end('llm.examiner.total'); return t; }),
      ]);
      timing.end('exchange.total');

      // Log LLM usage for both calls (non-blocking)
      logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'respond', call: 'generateExaminerTurn' });

      // Step 4: Persist all DB writes (awaited to prevent silent data loss)
      if (studentTranscriptId && assessment) {
        // 1. Assessment update on student transcript
        const { error: assessErr } = await serviceSupabase
          .from('session_transcripts')
          .update({ assessment })
          .eq('id', studentTranscriptId);
        if (assessErr) console.error('Assessment update error:', assessErr.message);

        // 2. Element attempts
        if (sessionId) {
          await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
        }

        // 3. Citations
        if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
          const citations = assessment.rag_chunks.map((chunk, idx) => ({
            transcript_id: studentTranscriptId,
            chunk_id: chunk.id,
            rank: idx + 1,
            score: chunk.score,
            snippet: chunk.content.slice(0, 300),
          }));
          const { error: citErr } = await serviceSupabase
            .from('transcript_citations')
            .insert(citations);
          if (citErr) console.error('Citation write error:', citErr.message);
        }

        // 4. Examiner transcript
        if (sessionId) {
          const { error: examErr } = await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: exchangeNumber,
            role: 'examiner',
            text: turn.examinerMessage,
          });
          if (examErr) console.error('Examiner transcript write error:', examErr.message);
        }
      } else if (sessionId) {
        // No assessment to write, but still persist examiner transcript
        const { error: examErr } = await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: exchangeNumber,
          role: 'examiner',
          text: turn.examinerMessage,
        });
        if (examErr) console.error('Examiner transcript write error:', examErr.message);
      }

      // Write latency instrumentation (non-blocking, best-effort)
      if (sessionId) {
        writeTimings(serviceSupabase, sessionId, exchangeNumber, timing);
      }

      return NextResponse.json({
        taskId: taskData.id,
        taskData,
        examinerMessage: turn.examinerMessage,
        assessment,
      });
    }

    if (action === 'resume-current') {
      // Return current element's task data without advancing the planner or calling LLM.
      // Used by session resume when the examiner's last question is still pending.
      if (!clientPlannerState || !sessionConfig) {
        return NextResponse.json({ error: 'Missing plannerState or sessionConfig' }, { status: 400 });
      }

      const currentElementCode = clientPlannerState.queue[clientPlannerState.cursor];
      if (!currentElementCode) {
        return NextResponse.json({ examinerMessage: 'Session complete', sessionComplete: true });
      }

      // Derive task_id from element code (e.g., "PA.I.A.K1" → "PA.I.A")
      const parts = currentElementCode.split('.');
      const taskId = parts.slice(0, -1).join('.');

      const { data: task } = await supabase
        .from('acs_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json({
        taskId: task.id,
        taskData: task,
        elementCode: currentElementCode,
      });
    }

    if (action === 'next-task') {
      // Load conversation history from DB for session continuity.
      // This allows the DPE to reference earlier discussion across task transitions
      // ("earlier you mentioned X, and now...") — just like a real checkride.
      let sessionHistory: ExamMessage[] = [];
      if (sessionId) {
        const { data: transcripts } = await supabase
          .from('session_transcripts')
          .select('role, text')
          .eq('session_id', sessionId)
          .order('exchange_number', { ascending: true })
          .order('timestamp', { ascending: true });

        if (transcripts) {
          sessionHistory = transcripts.map(t => ({
            role: t.role as 'examiner' | 'student',
            text: t.text as string,
          }));
        }
      }

      // If planner state provided, advance via planner
      if (clientPlannerState && sessionConfig) {
        const plannerResult = await advancePlanner(clientPlannerState, sessionConfig);
        if (!plannerResult) {
          // All elements exhausted — auto-complete with grading
          if (sessionId) {
            try {
              // Load attempts + server-side planner state (don't trust client for totalElements)
              const [{ data: attempts }, { data: examRow }] = await Promise.all([
                serviceSupabase
                  .from('element_attempts')
                  .select('element_code, score')
                  .eq('session_id', sessionId)
                  .eq('tag_type', 'attempt')
                  .not('score', 'is', null),
                serviceSupabase
                  .from('exam_sessions')
                  .select('metadata')
                  .eq('id', sessionId)
                  .single(),
              ]);

              const serverPlannerState = (examRow?.metadata as Record<string, unknown>)?.plannerState as { queue: string[] } | undefined;
              const totalElements = serverPlannerState?.queue?.length || clientPlannerState.queue.length;

              if (totalElements > 0) {
                const attemptData = (attempts || []).map(a => ({
                  element_code: a.element_code,
                  score: a.score as 'satisfactory' | 'unsatisfactory' | 'partial',
                  area: a.element_code.split('.')[1],
                }));
                const result = computeExamResult(attemptData, totalElements, 'all_tasks_covered');

                const { error: completeErr } = await serviceSupabase
                  .from('exam_sessions')
                  .update({ status: 'completed', ended_at: new Date().toISOString(), result })
                  .eq('id', sessionId);
                if (completeErr) console.error('Auto-complete session update error:', completeErr.message);
              } else {
                console.warn(`Auto-complete grading skipped for session ${sessionId}: totalElements=0`);
              }
            } catch (err) {
              console.error('Auto-complete grading error:', err);
            }
          }

          return NextResponse.json({
            examinerMessage: 'We have covered all the elements in your study plan. Great job today!',
            sessionComplete: true,
          });
        }

        const nextTaskRating = sessionConfig.rating || 'private';
        const turn = await generateExaminerTurn(
          plannerResult.task, sessionHistory, plannerResult.difficulty, sessionConfig.aircraftClass, undefined, nextTaskRating, sessionConfig.studyMode, personaId, studentName
        );

        // Log LLM usage (non-blocking)
        logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'next-task', call: 'generateExaminerTurn' });

        if (sessionId) {
          const { count } = await supabase
            .from('session_transcripts')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId);
          const exchangeNumber = (count || 0) + 1;

          await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: exchangeNumber,
            role: 'examiner',
            text: turn.examinerMessage,
          });
        }

        // Persist updated planner state + taskData to metadata for resume
        if (sessionId) {
          const { error: metaErr } = await serviceSupabase
            .from('exam_sessions')
            .update({ metadata: { plannerState: plannerResult.plannerState, sessionConfig, taskData: plannerResult.task } })
            .eq('id', sessionId);
          if (metaErr) console.error('Planner state persist error:', metaErr.message);
        }

        return NextResponse.json({
          taskId: plannerResult.task.id,
          taskData: plannerResult.task,
          examinerMessage: turn.examinerMessage,
          elementCode: plannerResult.elementCode,
          plannerState: plannerResult.plannerState,
        });
      }

      // Fallback: random task selection (legacy mode, no class filtering)
      const currentTaskId = taskData?.id || '';
      const legacyRating = sessionConfig?.rating || 'private';
      const task = await pickNextTask(currentTaskId, coveredTaskIds || [], undefined, legacyRating);
      if (!task) {
        return NextResponse.json({
          examinerMessage: 'We have covered all the areas. Great job today!',
          sessionComplete: true,
        });
      }

      const turn = await generateExaminerTurn(task, sessionHistory, undefined, undefined, undefined, undefined, undefined, personaId, studentName);

      // Log LLM usage (non-blocking)
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'next-task', call: 'generateExaminerTurn' });

      // Persist examiner transition to transcript
      if (sessionId) {
        const { count } = await supabase
          .from('session_transcripts')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId);
        const exchangeNumber = (count || 0) + 1;

        await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: exchangeNumber,
          role: 'examiner',
          text: turn.examinerMessage,
        });
      }

      return NextResponse.json({
        taskId: task.id,
        taskData: task,
        examinerMessage: turn.examinerMessage,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Exam API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
