import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  pickStartingTask,
  pickNextTask,
  generateExaminerTurn,
  generateExaminerTurnStreaming,
  assessAnswer,
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

        const turn = await generateExaminerTurn(plannerResult.task, []);

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

      // Fallback: random task selection (legacy mode)
      const task = await pickStartingTask();
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

      // Step 1: Persist student transcript (get back transcript_id)
      let studentTranscriptId: string | null = null;
      if (sessionId) {
        const { data: transcriptRow } = await supabase
          .from('session_transcripts')
          .insert({
            session_id: sessionId,
            exchange_number: exchangeNumber,
            role: 'student',
            text: studentAnswer,
          })
          .select('id')
          .single();
        studentTranscriptId = transcriptRow?.id ?? null;
      }

      // Step 2: Assess the answer (now returns element codes)
      const assessment = await assessAnswer(taskData, history, studentAnswer);

      // Step 3: Update student transcript with assessment + write element_attempts + citations
      if (studentTranscriptId && assessment) {
        await supabase
          .from('session_transcripts')
          .update({ assessment })
          .eq('id', studentTranscriptId);

        // Step 3b: Write element_attempts rows
        if (sessionId) {
          await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
        }

        // Step 3c: Write transcript_citations from RAG chunks
        if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
          const citations = assessment.rag_chunks.map((chunk, idx) => ({
            transcript_id: studentTranscriptId,
            chunk_id: chunk.id,
            rank: idx + 1,
            score: chunk.score,
            snippet: chunk.content.slice(0, 300),
          }));
          const { error: citErr } = await supabase.from('transcript_citations').insert(citations);
          if (citErr) console.error('Citation write error:', citErr.message);
        }
      }

      // Step 4: Generate next examiner turn (support streaming)
      const updatedHistory: ExamMessage[] = [
        ...history,
        { role: 'student', text: studentAnswer },
      ];

      if (stream) {
        const readableStream = await generateExaminerTurnStreaming(taskData, updatedHistory);

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Assessment': Buffer.from(JSON.stringify(assessment)).toString('base64'),
            'X-Task-Id': taskData.id,
          },
        });
      }

      const turn = await generateExaminerTurn(taskData, updatedHistory);

      // Step 5: Persist examiner transcript
      if (sessionId) {
        await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: exchangeNumber,
          role: 'examiner',
          text: turn.examinerMessage,
        });
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

        const turn = await generateExaminerTurn(plannerResult.task, []);

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

      // Fallback: random task selection (legacy mode)
      const currentTaskId = taskData?.id || '';
      const task = await pickNextTask(currentTaskId, coveredTaskIds || []);
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
