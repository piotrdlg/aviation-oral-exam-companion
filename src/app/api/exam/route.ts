import { NextRequest, NextResponse } from 'next/server';
import {
  pickStartingTask,
  generateExaminerTurn,
  assessAnswer,
  type ExamMessage,
} from '@/lib/exam-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, history, taskId, taskData, studentAnswer } = body as {
      action: 'start' | 'respond';
      history?: ExamMessage[];
      taskId?: string;
      taskData?: ReturnType<typeof pickStartingTask> extends Promise<infer T> ? T : never;
      studentAnswer?: string;
    };

    if (action === 'start') {
      // Pick a task and generate the opening question
      const task = await pickStartingTask();
      if (!task) {
        return NextResponse.json(
          { error: 'No ACS tasks found. Check database seed.' },
          { status: 500 }
        );
      }

      const turn = await generateExaminerTurn(task, []);
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

      // Assess the student's answer
      const assessment = await assessAnswer(
        taskData,
        history,
        studentAnswer
      );

      // Generate the next examiner question based on full history
      const updatedHistory: ExamMessage[] = [
        ...history,
        { role: 'student', text: studentAnswer },
      ];

      const turn = await generateExaminerTurn(taskData, updatedHistory);

      return NextResponse.json({
        taskId: taskData.id,
        taskData,
        examinerMessage: turn.examinerMessage,
        assessment,
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
