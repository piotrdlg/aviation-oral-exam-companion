import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  type AcsTaskRow,
  selectRandomTask,
  buildSystemPrompt,
} from './exam-logic';
import type { AircraftClass } from '@/types/database';
import { searchChunks, formatChunksForPrompt, type ChunkSearchResult } from './rag-retrieval';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ExamMessage {
  role: 'examiner' | 'student';
  text: string;
}

export interface AssessmentData {
  score: 'satisfactory' | 'unsatisfactory' | 'partial';
  feedback: string;
  misconceptions: string[];
  follow_up_needed: boolean;
  primary_element: string | null;
  mentioned_elements: string[];
  rag_chunks?: ChunkSearchResult[];
}

export interface ExamTurn {
  examinerMessage: string;
  assessment?: AssessmentData;
}

// Re-export for consumers
export { type AcsTaskRow } from './exam-logic';

/**
 * Pick a random ACS task for the oral exam, optionally excluding already-covered tasks.
 * Filters by aircraft class when provided.
 */
export async function pickStartingTask(
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass
): Promise<AcsTaskRow | null> {
  let query = supabase
    .from('acs_tasks')
    .select('*')
    .eq('rating', 'private');

  // Filter by aircraft class at the DB level
  if (aircraftClass) {
    query = query.contains('applicable_classes', [aircraftClass]);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) return null;

  return selectRandomTask(data as AcsTaskRow[], coveredTaskIds, aircraftClass);
}

/**
 * Pick the next task, transitioning naturally from the current area.
 */
export async function pickNextTask(
  currentTaskId: string,
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass
): Promise<AcsTaskRow | null> {
  return pickStartingTask([...coveredTaskIds, currentTaskId], aircraftClass);
}

/**
 * Generate the next examiner turn given conversation history.
 */
export async function generateExaminerTurn(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass
): Promise<ExamTurn> {
  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass);

  // RAG: fetch relevant source material for context
  let ragContext = '';
  try {
    // Build a query from the task and recent conversation
    const recentText = history.slice(-2).map(m => m.text).join(' ');
    const query = `${task.task} ${recentText}`.slice(0, 500);
    const chunks = await searchChunks(query, { matchCount: 3 });
    ragContext = formatChunksForPrompt(chunks);
  } catch {
    // RAG is non-critical
  }

  const ragSection = ragContext
    ? `\n\nFAA SOURCE MATERIAL (use to ask accurate, specific questions):\n${ragContext}`
    : '';

  const messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    system: systemPrompt + ragSection,
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
 * Generate examiner turn with streaming via Server-Sent Events.
 */
export async function generateExaminerTurnStreaming(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass
): Promise<ReadableStream> {
  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass);

  // RAG: fetch relevant source material for context
  let ragContext = '';
  try {
    const recentText = history.slice(-2).map(m => m.text).join(' ');
    const query = `${task.task} ${recentText}`.slice(0, 500);
    const chunks = await searchChunks(query, { matchCount: 3 });
    ragContext = formatChunksForPrompt(chunks);
  } catch {
    // Non-critical
  }

  const ragSection = ragContext
    ? `\n\nFAA SOURCE MATERIAL (use to ask accurate, specific questions):\n${ragContext}`
    : '';

  const messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    system: systemPrompt + ragSection,
    stream: true,
    messages:
      messages.length === 0
        ? [{ role: 'user', content: 'Begin the oral examination.' }]
        : messages,
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const data = JSON.stringify({ token: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Assess the student's latest answer using Claude.
 * Returns score, feedback, and which ACS elements were addressed.
 */
export async function assessAnswer(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer: string
): Promise<AssessmentData> {
  // Build complete element list for the assessment prompt
  const allElements: string[] = [];

  if (task.knowledge_elements) {
    task.knowledge_elements.forEach((e) => {
      allElements.push(`${e.code}: ${e.description}`);
    });
  }
  if (task.risk_management_elements) {
    task.risk_management_elements.forEach((e) => {
      allElements.push(`${e.code}: ${e.description}`);
    });
  }
  if (task.skill_elements) {
    task.skill_elements.forEach((e) => {
      allElements.push(`${e.code}: ${e.description}`);
    });
  }

  const elementList = allElements.join('\n');

  const recentContext = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n');

  // RAG: search for relevant source material to validate the answer
  let ragContext = '';
  let ragChunks: ChunkSearchResult[] = [];
  try {
    const searchQuery = `${task.task} ${studentAnswer}`.slice(0, 500);
    ragChunks = await searchChunks(searchQuery, { matchCount: 4 });
    ragContext = formatChunksForPrompt(ragChunks);
  } catch {
    // RAG is non-critical; proceed without it
  }

  const ragSection = ragContext
    ? `\n\nFAA SOURCE MATERIAL (use to validate the answer):\n${ragContext}`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 400,
    system: `You are assessing a private pilot applicant's oral exam answer. Rate it against the ACS standards.

ACS Task: ${task.id} - ${task.task}
All elements for this task:
${elementList}${ragSection}

Respond in JSON only with this schema:
{
  "score": "satisfactory" | "unsatisfactory" | "partial",
  "feedback": "brief note on the answer quality",
  "misconceptions": ["list any misconceptions, or empty array"],
  "follow_up_needed": true | false,
  "primary_element": "the ACS element code (e.g., PA.I.A.K1) most directly addressed by this answer, or null",
  "mentioned_elements": ["other element codes touched on in the answer"]
}`,
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
    const parsed = JSON.parse(cleaned);
    return {
      score: parsed.score || 'partial',
      feedback: parsed.feedback || '',
      misconceptions: parsed.misconceptions || [],
      follow_up_needed: parsed.follow_up_needed ?? false,
      primary_element: parsed.primary_element || null,
      mentioned_elements: parsed.mentioned_elements || [],
      rag_chunks: ragChunks.length > 0 ? ragChunks : undefined,
    };
  } catch {
    return {
      score: 'partial',
      feedback: 'Assessment could not be parsed.',
      misconceptions: [],
      follow_up_needed: false,
      primary_element: null,
      mentioned_elements: [],
      rag_chunks: ragChunks.length > 0 ? ragChunks : undefined,
    };
  }
}
