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
 * Fetch RAG context once for sharing between assessment and examiner generation.
 * Returns both the formatted string and raw chunks.
 */
export async function fetchRagContext(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer?: string,
  matchCount: number = 5
): Promise<{ ragContext: string; ragChunks: ChunkSearchResult[] }> {
  try {
    // Combine task, recent history, and student answer for a comprehensive query
    const recentText = history.slice(-2).map(m => m.text).join(' ');
    const answerText = studentAnswer ? ` ${studentAnswer}` : '';
    const query = `${task.task} ${recentText}${answerText}`.slice(0, 500);
    const ragChunks = await searchChunks(query, { matchCount });
    const ragContext = formatChunksForPrompt(ragChunks);
    return { ragContext, ragChunks };
  } catch {
    return { ragContext: '', ragChunks: [] };
  }
}

/**
 * Generate the next examiner turn given conversation history.
 * Accepts optional pre-fetched RAG to avoid duplicate searches.
 */
export async function generateExaminerTurn(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string }
): Promise<ExamTurn> {
  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass);

  // Use pre-fetched RAG or fetch fresh
  let ragContext = prefetchedRag?.ragContext ?? '';
  if (!prefetchedRag) {
    const result = await fetchRagContext(task, history);
    ragContext = result.ragContext;
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
 * Accepts optional pre-fetched RAG and an optional assessmentPromise
 * whose result will be sent as a final SSE event before [DONE].
 */
export async function generateExaminerTurnStreaming(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string },
  assessmentPromise?: Promise<AssessmentData>,
  onComplete?: (fullText: string) => void
): Promise<ReadableStream> {
  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass);

  // Use pre-fetched RAG or fetch fresh
  let ragContext = prefetchedRag?.ragContext ?? '';
  if (!prefetchedRag) {
    const result = await fetchRagContext(task, history);
    ragContext = result.ragContext;
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
      let fullText = '';
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            const data = JSON.stringify({ token: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        // Send the full examiner message as a separate event for client-side persistence
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ examinerMessage: fullText })}\n\n`));

        // Trigger onComplete callback for server-side persistence (e.g., writing transcript)
        if (onComplete) {
          try { onComplete(fullText); } catch { /* non-critical */ }
        }

        // If we have a parallel assessment promise, wait for it and send the result
        if (assessmentPromise) {
          try {
            const assessment = await assessmentPromise;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ assessment })}\n\n`));
          } catch (err) {
            console.error('Assessment failed during streaming:', err);
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
 * Accepts optional pre-fetched RAG to avoid duplicate searches.
 */
export async function assessAnswer(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer: string,
  prefetchedRag?: { ragContext: string; ragChunks: ChunkSearchResult[] }
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

  // Use pre-fetched RAG or fetch fresh
  let ragContext = prefetchedRag?.ragContext ?? '';
  let ragChunks = prefetchedRag?.ragChunks ?? [];
  if (!prefetchedRag) {
    try {
      const searchQuery = `${task.task} ${studentAnswer}`.slice(0, 500);
      ragChunks = await searchChunks(searchQuery, { matchCount: 4 });
      ragContext = formatChunksForPrompt(ragChunks);
    } catch {
      // RAG is non-critical; proceed without it
    }
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
