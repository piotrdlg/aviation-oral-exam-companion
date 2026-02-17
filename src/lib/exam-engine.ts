import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type AcsTaskRow,
  selectRandomTask,
  buildSystemPrompt,
} from './exam-logic';
import type { AircraftClass, Rating } from '@/types/database';
import { searchChunks, formatChunksForPrompt, getImagesForChunks, type ChunkSearchResult, type ImageResult } from './rag-retrieval';
import { getPromptContent } from './prompts';

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
  source_summary: string | null;
  rag_chunks?: ChunkSearchResult[];
  usage?: LlmUsage;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export interface ExamTurn {
  examinerMessage: string;
  assessment?: AssessmentData;
  usage?: LlmUsage;
}

// Re-export for consumers
export { type AcsTaskRow } from './exam-logic';
export { type ImageResult } from './rag-retrieval';

/**
 * Load the best-matching prompt version from the DB with specificity scoring.
 * Falls back gracefully via getPromptContent() if no DB rows found.
 *
 * Specificity scoring:
 *   +1 if rating matches, +1 if study_mode matches, +1 if difficulty matches
 *   Ties broken by higher version number
 *   Rows with non-matching rating/study_mode/difficulty (that aren't null) are excluded.
 */
export async function loadPromptFromDB(
  supabaseClient: SupabaseClient,
  promptKey: string,
  rating?: string,
  studyMode?: string,
  difficulty?: string
): Promise<{ content: string; versionId: string | null }> {
  const { data: candidates } = await supabaseClient
    .from('prompt_versions')
    .select('id, content, rating, study_mode, difficulty, version')
    .eq('prompt_key', promptKey)
    .eq('status', 'published')
    .order('version', { ascending: false });

  const scored = (candidates ?? [])
    .filter(c =>
      (c.rating === rating || c.rating === null) &&
      (c.study_mode === studyMode || c.study_mode === null) &&
      (c.difficulty === difficulty || c.difficulty === null)
    )
    .map(c => ({
      ...c,
      specificity:
        (c.rating === rating ? 1 : 0) +
        (c.study_mode === studyMode ? 1 : 0) +
        (c.difficulty === difficulty ? 1 : 0),
    }))
    .sort((a, b) => b.specificity - a.specificity || b.version - a.version);

  const best = scored[0] ?? null;
  return {
    content: getPromptContent(best, promptKey),
    versionId: best?.id ?? null,
  };
}

/**
 * Pick a random ACS task for the oral exam, optionally excluding already-covered tasks.
 * Filters by aircraft class when provided.
 */
export async function pickStartingTask(
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'
): Promise<AcsTaskRow | null> {
  let query = supabase
    .from('acs_tasks')
    .select('*')
    .eq('rating', rating);

  // Filter by aircraft class at the DB level
  if (aircraftClass) {
    query = query.contains('applicable_classes', [aircraftClass]);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) return null;

  return selectRandomTask(data as AcsTaskRow[], coveredTaskIds, aircraftClass, rating);
}

/**
 * Pick the next task, transitioning naturally from the current area.
 */
export async function pickNextTask(
  currentTaskId: string,
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'
): Promise<AcsTaskRow | null> {
  return pickStartingTask([...coveredTaskIds, currentTaskId], aircraftClass, rating);
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
): Promise<{ ragContext: string; ragChunks: ChunkSearchResult[]; ragImages: ImageResult[] }> {
  try {
    // Combine task, recent history, and student answer for a comprehensive query
    const recentText = history.slice(-2).map(m => m.text).join(' ');
    const answerText = studentAnswer ? ` ${studentAnswer}` : '';
    const query = `${task.task} ${recentText}${answerText}`.slice(0, 500);
    const ragChunks = await searchChunks(query, { matchCount });
    const ragContext = formatChunksForPrompt(ragChunks);

    // Fetch linked images for the retrieved chunks
    const chunkIds = ragChunks.map(c => c.id);
    const ragImages = await getImagesForChunks(chunkIds);

    return { ragContext, ragChunks, ragImages };
  } catch (err) {
    console.error('fetchRagContext failed:', err instanceof Error ? err.message : err);
    return { ragContext: '', ragChunks: [], ragImages: [] };
  }
}

/**
 * Generate the next examiner turn given conversation history.
 * Accepts optional pre-fetched RAG to avoid duplicate searches.
 * Loads the best-matching prompt from prompt_versions DB table.
 */
export async function generateExaminerTurn(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string },
  rating: Rating = 'private',
  studyMode?: string
): Promise<ExamTurn> {
  // Load the best-matching prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'examiner_system', rating, studyMode, difficulty
  );

  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent);

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

  const startMs = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    system: systemPrompt + ragSection,
    messages:
      messages.length === 0
        ? [{ role: 'user', content: 'Begin the oral examination.' }]
        : messages,
  });
  const latencyMs = Date.now() - startMs;

  const examinerMessage =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return {
    examinerMessage,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      latency_ms: latencyMs,
    },
  };
}

/**
 * Generate examiner turn with streaming via Server-Sent Events.
 * Accepts optional pre-fetched RAG and an optional assessment promise.
 * The assessment is awaited after streaming completes and sent as a final SSE event.
 */
export async function generateExaminerTurnStreaming(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string; ragImages?: ImageResult[] },
  assessmentPromise?: Promise<AssessmentData>,
  onComplete?: (fullText: string) => void,
  rating: Rating = 'private',
  studyMode?: string
): Promise<ReadableStream> {
  // Load the best-matching prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'examiner_system', rating, studyMode, difficulty
  );

  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent);

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

        // Send linked images (if any) — max 3, filtered by relevance
        const ragImages = prefetchedRag?.ragImages ?? [];
        if (ragImages.length > 0) {
          const selectedImages = ragImages
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, 3);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ images: selectedImages })}\n\n`));
        }

        // Trigger onComplete callback for server-side persistence (e.g., writing transcript)
        if (onComplete) {
          try { onComplete(fullText); } catch { /* non-critical */ }
        }

        // Await the assessment (runs in parallel, should be done by now) and send as SSE event
        if (assessmentPromise) {
          try {
            const assessment = await assessmentPromise;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ assessment })}\n\n`));
          } catch (err) {
            console.error('Assessment promise failed:', err);
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
  prefetchedRag?: { ragContext: string; ragChunks: ChunkSearchResult[] },
  questionImages?: ImageResult[],
  rating: Rating = 'private'
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

  const startMs = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 400,
    system: `You are assessing a ${rating === 'commercial' ? 'commercial pilot' : rating === 'instrument' ? 'instrument rating' : rating === 'atp' ? 'airline transport pilot' : 'private pilot'} applicant's oral exam answer. Rate it against the ACS standards.

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
  "mentioned_elements": ["other element codes touched on in the answer"],
  "source_summary": "1-3 sentences summarizing the key FAA references that apply to this question. Cite specific regulation/document names and section numbers (e.g., '14 CFR 61.23 requires...'). If no FAA source material was provided, set to null."
}`,
    messages: [
      {
        role: 'user',
        content: questionImages && questionImages.length > 0
          ? [
              ...questionImages.map(img => ({
                type: 'image' as const,
                source: { type: 'url' as const, url: img.public_url },
              })),
              {
                type: 'text' as const,
                text: `The applicant was shown the above image(s) during this question.\n\nRecent conversation:\n${recentContext}\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`,
              },
            ]
          : `Recent conversation:\n${recentContext}\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`,
      },
    ],
  });
  const latencyMs = Date.now() - startMs;

  const usageData: LlmUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    latency_ms: latencyMs,
  };

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
      source_summary: parsed.source_summary || null,
      rag_chunks: ragChunks.length > 0 ? ragChunks : undefined,
      usage: usageData,
    };
  } catch {
    return {
      score: 'partial',
      feedback: 'Assessment could not be parsed.',
      misconceptions: [],
      follow_up_needed: false,
      primary_element: null,
      mentioned_elements: [],
      source_summary: null,
      rag_chunks: ragChunks.length > 0 ? ragChunks : undefined,
      usage: usageData,
    };
  }
}
