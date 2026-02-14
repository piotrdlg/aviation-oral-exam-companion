import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  type AcsTaskRow,
  selectRandomTask,
  buildSystemPrompt,
} from './exam-logic';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ExamMessage {
  role: 'examiner' | 'student';
  text: string;
}

export interface ExamTurn {
  examinerMessage: string;
  assessment?: {
    score: 'satisfactory' | 'unsatisfactory' | 'partial';
    feedback: string;
    misconceptions: string[];
    follow_up_needed: boolean;
  };
}

// Re-export for consumers
export { type AcsTaskRow } from './exam-logic';

/**
 * Pick a random ACS task for the oral exam, optionally excluding already-covered tasks.
 */
export async function pickStartingTask(
  coveredTaskIds: string[] = []
): Promise<AcsTaskRow | null> {
  const { data, error } = await supabase
    .from('acs_tasks')
    .select('*')
    .eq('rating', 'private');

  if (error || !data || data.length === 0) return null;

  return selectRandomTask(data as AcsTaskRow[], coveredTaskIds);
}

/**
 * Pick the next task, transitioning naturally from the current area.
 */
export async function pickNextTask(
  currentTaskId: string,
  coveredTaskIds: string[] = []
): Promise<AcsTaskRow | null> {
  return pickStartingTask([...coveredTaskIds, currentTaskId]);
}

/**
 * Generate the next examiner turn given conversation history.
 */
export async function generateExaminerTurn(
  task: AcsTaskRow,
  history: ExamMessage[]
): Promise<ExamTurn> {
  const systemPrompt = buildSystemPrompt(task);

  const messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    system: systemPrompt,
    messages:
      messages.length === 0
        ? [{ role: 'user', content: 'Begin the oral examination.' }]
        : messages,
  });

  const examinerMessage =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return { examinerMessage };
}

/**
 * Assess the student's latest answer using Claude.
 */
export async function assessAnswer(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer: string
): Promise<ExamTurn['assessment']> {
  const knowledgeList = task.knowledge_elements
    .map((e) => `${e.code}: ${e.description}`)
    .join('\n');

  const recentContext = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 300,
    system: `You are assessing a private pilot applicant's oral exam answer. Rate it against the ACS standards.

ACS Task: ${task.id} - ${task.task}
Knowledge elements: ${knowledgeList}

Respond in JSON only: {"score":"satisfactory"|"unsatisfactory"|"partial","feedback":"brief note","misconceptions":["if any"],"follow_up_needed":true|false}`,
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${recentContext}\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '{}';

  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      score: 'partial',
      feedback: 'Assessment could not be parsed.',
      misconceptions: [],
      follow_up_needed: false,
    };
  }
}
