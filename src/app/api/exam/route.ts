import { NextRequest, NextResponse } from 'next/server';
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
import { initPlanner, advancePlanner, type PlannerResult } from '@/lib/exam-planner';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { enforceOneActiveExam, getSessionTokenHash } from '@/lib/session-enforcement';
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

    const body = await request.json();
    const { action, history, taskData, studentAnswer, coveredTaskIds, sessionId, stream, sessionConfig, plannerState: clientPlannerState } = body as {
      action: 'start' | 'respond' | 'next-task' | 'resume-current';
      history?: ExamMessage[];
      taskData?: Awaited<ReturnType<typeof pickStartingTask>>;
      studentAnswer?: string;
      coveredTaskIds?: string[];
      sessionId?: string;
      stream?: boolean;
      sessionConfig?: SessionConfig;
      plannerState?: PlannerState;
    };

    // Session enforcement: ensure only one active exam per user
    let enforcementPausedSessionId: string | undefined;
    if (sessionId) {
      try {
        // Extract token hash from the user's current session
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.access_token) {
          const tokenHash = getSessionTokenHash(authSession);
          const enforcement = await enforceOneActiveExam(
            serviceSupabase, user.id, sessionId, tokenHash, action
          );

          if (enforcement.rejected) {
            return NextResponse.json(
              { error: 'session_superseded', message: 'This exam session has been superseded by another device. Please end this session.' },
              { status: 409 }
            );
          }

          enforcementPausedSessionId = enforcement.pausedSessionId;
        }
      } catch (err) {
        // Session enforcement is non-critical — log and continue
        console.error('Session enforcement error:', err);
      }
    }

    if (action === 'start') {
      // Track last active usage — non-blocking (Task 25)
      serviceSupabase
        .from('user_profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then(({ error: profileErr }) => {
          if (profileErr) console.error('last_login_at update error:', profileErr.message);
        });

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
          plannerResult.task, [], plannerResult.difficulty, sessionConfig.aircraftClass, undefined, rating, sessionConfig.studyMode
        );

        // Log LLM usage (non-blocking)
        logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'start', call: 'generateExaminerTurn' });

        // Persist examiner opening turn to transcript
        if (sessionId) {
          await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: 0,
            role: 'examiner',
            text: turn.examinerMessage,
          });
        }

        // Persist planner state + session config + taskData to metadata for resume (non-blocking)
        if (sessionId) {
          serviceSupabase
            .from('exam_sessions')
            .update({ metadata: { plannerState: plannerResult.plannerState, sessionConfig, taskData: plannerResult.task } })
            .eq('id', sessionId)
            .then(({ error: metaErr }) => {
              if (metaErr) console.error('Planner state persist error:', metaErr.message);
            });
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

      // Support streaming for start
      if (stream) {
        const readableStream = await generateExaminerTurnStreaming(task, []);

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

      const turn = await generateExaminerTurn(task, []);

      // Log LLM usage (non-blocking)
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'start', call: 'generateExaminerTurn' });

      // Persist examiner opening turn to transcript
      if (sessionId) {
        await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: 0,
          role: 'examiner',
          text: turn.examinerMessage,
        });
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

      // Calculate exchange number from history length
      const exchangeNumber = Math.floor(history.length / 2) + 1;

      // Step 1: Persist student transcript + fetch RAG in parallel
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
        fetchRagContext(taskData, history, studentAnswer),
      ]);
      const studentTranscriptId = studentTranscriptResult.data?.id ?? null;

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
        const assessmentPromise = assessAnswer(taskData, history, studentAnswer, rag, rag.ragImages, respondRating, sessionConfig?.studyMode, respondDifficulty);

        // onComplete callback: persist examiner transcript to DB after stream finishes
        const onStreamComplete = (fullText: string) => {
          if (sessionId && fullText) {
            supabase.from('session_transcripts').insert({
              session_id: sessionId,
              exchange_number: exchangeNumber,
              role: 'examiner',
              text: fullText,
            }).then(({ error }) => {
              if (error) console.error('Examiner transcript write error:', error.message);
            });
          }
        };

        const readableStream = await generateExaminerTurnStreaming(
          taskData, updatedHistory, respondDifficulty, sessionConfig?.aircraftClass, rag, assessmentPromise, onStreamComplete, respondRating, sessionConfig?.studyMode
        );

        // DB writes happen inside the stream (assessment sent as final SSE event)
        // The client will handle persisting after receiving the full stream.
        // Write student assessment + element_attempts + citations in the background
        // after the assessment promise resolves.
        assessmentPromise.then(async (assessment) => {
          // Log assessment LLM usage (non-blocking)
          logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });

          if (studentTranscriptId && assessment) {
            const dbWrites: PromiseLike<unknown>[] = [
              supabase
                .from('session_transcripts')
                .update({ assessment })
                .eq('id', studentTranscriptId),
            ];
            if (sessionId) {
              dbWrites.push(writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment));
            }
            if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
              const citations = assessment.rag_chunks.map((chunk, idx) => ({
                transcript_id: studentTranscriptId,
                chunk_id: chunk.id,
                rank: idx + 1,
                score: chunk.score,
                snippet: chunk.content.slice(0, 300),
              }));
              dbWrites.push(
                supabase.from('transcript_citations').insert(citations).then(({ error: citErr }) => {
                  if (citErr) console.error('Citation write error:', citErr.message);
                })
              );
            }
            await Promise.all(dbWrites);
          }
        }).catch(err => console.error('Background assessment/DB error:', err));

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
      const [assessment, turn] = await Promise.all([
        assessAnswer(taskData, history, studentAnswer, rag, rag.ragImages, respondRating, sessionConfig?.studyMode, respondDifficulty),
        generateExaminerTurn(taskData, updatedHistory, respondDifficulty, sessionConfig?.aircraftClass as import('@/types/database').AircraftClass | undefined, rag, respondRating, sessionConfig?.studyMode),
      ]);

      // Log LLM usage for both calls (non-blocking)
      logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'respond', call: 'generateExaminerTurn' });

      // Step 4: Persist all DB writes in parallel (non-blocking for response)
      if (studentTranscriptId && assessment) {
        const dbWrites: PromiseLike<unknown>[] = [
          supabase
            .from('session_transcripts')
            .update({ assessment })
            .eq('id', studentTranscriptId),
        ];
        if (sessionId) {
          dbWrites.push(writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment));
        }
        if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
          const citations = assessment.rag_chunks.map((chunk, idx) => ({
            transcript_id: studentTranscriptId,
            chunk_id: chunk.id,
            rank: idx + 1,
            score: chunk.score,
            snippet: chunk.content.slice(0, 300),
          }));
          dbWrites.push(
            supabase.from('transcript_citations').insert(citations).then(({ error: citErr }) => {
              if (citErr) console.error('Citation write error:', citErr.message);
            })
          );
        }
        // Write examiner transcript in same batch
        if (sessionId) {
          dbWrites.push(
            supabase.from('session_transcripts').insert({
              session_id: sessionId,
              exchange_number: exchangeNumber,
              role: 'examiner',
              text: turn.examinerMessage,
            })
          );
        }
        // Fire all DB writes in parallel — don't block response
        Promise.all(dbWrites).catch(err => console.error('DB write error:', err));
      } else if (sessionId) {
        // No assessment to write, but still persist examiner transcript
        supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: exchangeNumber,
          role: 'examiner',
          text: turn.examinerMessage,
        }).then(({ error }) => { if (error) console.error('Examiner transcript error:', error.message); });
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
          return NextResponse.json({
            examinerMessage: 'We have covered all the elements in your study plan. Great job today!',
            sessionComplete: true,
          });
        }

        const nextTaskRating = sessionConfig.rating || 'private';
        const turn = await generateExaminerTurn(
          plannerResult.task, sessionHistory, plannerResult.difficulty, sessionConfig.aircraftClass, undefined, nextTaskRating, sessionConfig.studyMode
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

        // Persist updated planner state + taskData to metadata for resume (non-blocking)
        if (sessionId) {
          serviceSupabase
            .from('exam_sessions')
            .update({ metadata: { plannerState: plannerResult.plannerState, sessionConfig, taskData: plannerResult.task } })
            .eq('id', sessionId)
            .then(({ error: metaErr }) => {
              if (metaErr) console.error('Planner state persist error:', metaErr.message);
            });
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

      const turn = await generateExaminerTurn(task, sessionHistory);

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
