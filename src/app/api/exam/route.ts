import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  pickStartingTask,
  pickNextTask,
  generateExaminerTurn,
  generateExaminerTurnStreaming,
  assessAnswer,
  fetchRagContext,
  type ExamMessage,
  type AssessmentData,
} from '@/lib/exam-engine';
import { initPlanner, advancePlanner, type PlannerResult } from '@/lib/exam-planner';
import type { SessionConfig, PlannerState } from '@/types/database';

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

    const body = await request.json();
    const { action, history, taskData, studentAnswer, coveredTaskIds, sessionId, stream, sessionConfig, plannerState: clientPlannerState } = body as {
      action: 'start' | 'respond' | 'next-task';
      history?: ExamMessage[];
      taskData?: Awaited<ReturnType<typeof pickStartingTask>>;
      studentAnswer?: string;
      coveredTaskIds?: string[];
      sessionId?: string;
      stream?: boolean;
      sessionConfig?: SessionConfig;
      plannerState?: PlannerState;
    };

    if (action === 'start') {
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
          plannerResult.task, [], plannerResult.difficulty, sessionConfig.aircraftClass, undefined, rating
        );

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
          taskId: plannerResult.task.id,
          taskData: plannerResult.task,
          examinerMessage: turn.examinerMessage,
          elementCode: plannerResult.elementCode,
          plannerState: plannerResult.plannerState,
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
      if (stream) {
        // Streaming path: start assessment in background, stream examiner immediately
        const assessmentPromise = assessAnswer(taskData, history, studentAnswer, rag, rag.ragImages, respondRating);

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
          taskData, updatedHistory, undefined, undefined, rag, assessmentPromise, onStreamComplete, respondRating
        );

        // DB writes happen inside the stream (assessment sent as final SSE event)
        // The client will handle persisting after receiving the full stream.
        // Write student assessment + element_attempts + citations in the background
        // after the assessment promise resolves.
        assessmentPromise.then(async (assessment) => {
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
        assessAnswer(taskData, history, studentAnswer, rag, rag.ragImages, respondRating),
        generateExaminerTurn(taskData, updatedHistory, undefined, undefined, rag, respondRating),
      ]);

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

    if (action === 'next-task') {
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
          plannerResult.task, [], plannerResult.difficulty, sessionConfig.aircraftClass, undefined, nextTaskRating
        );

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

      const turn = await generateExaminerTurn(task, []);

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
