import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type AcsTaskRow,
  selectRandomTask,
  buildSystemPrompt,
  STRUCTURED_RESPONSE_INSTRUCTION,
  STRUCTURED_CHUNK_FIELDS,
  extractStructuredChunks,
  buildPlainTextFromChunks,
  PARAGRAPH_STRUCTURE_INSTRUCTION,
} from './exam-logic';
import type { AircraftClass, Rating } from '@/types/database';
import { searchChunks, formatChunksForPrompt, getImagesForChunks, type ChunkSearchResult, type ImageResult } from './rag-retrieval';
import { searchWithFallback, inferRagFilters } from './rag-search-with-fallback';
import type { SystemConfigMap } from './system-config';
import type { TimingContext } from './timing';
import { getPromptContent } from './prompts';
import { TtlCache } from './ttl-cache';

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

// Module-level prompt cache: 5-min TTL. Keyed by promptKey,
// caches the full candidate list (specificity scoring happens in-memory).
type PromptCandidate = {
  id: string; content: string; rating: string | null;
  study_mode: string | null; difficulty: string | null; version: number;
};
const promptCache = new TtlCache<PromptCandidate[]>(5 * 60_000);

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
  let candidates = promptCache.get(promptKey);
  if (!candidates) {
    const { data } = await supabaseClient
      .from('prompt_versions')
      .select('id, content, rating, study_mode, difficulty, version')
      .eq('prompt_key', promptKey)
      .eq('status', 'published')
      .order('version', { ascending: false });
    candidates = (data ?? []) as PromptCandidate[];
    promptCache.set(promptKey, candidates);
  }

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
 * Load persona personality fragment from prompt_versions.
 * Returns raw content (no safety prefix) — appended to an already-prefixed prompt.
 * Returns empty string if no persona prompt exists (backwards compatible).
 */
async function loadPersonaFragment(personaId: string): Promise<string> {
  const { data } = await supabase
    .from('prompt_versions')
    .select('content')
    .eq('prompt_key', `persona_${personaId}`)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.content ? `\n\n${data.content}` : '';
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
 *
 * When `systemConfig` is provided and `rag.metadata_filter` is enabled,
 * uses inferRagFilters + searchWithFallback for metadata-aware retrieval.
 * Otherwise falls back to plain unfiltered searchChunks (default behavior).
 */
export async function fetchRagContext(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer?: string,
  matchCount: number = 5,
  options?: {
    systemConfig?: SystemConfigMap;
    timing?: TimingContext;
  }
): Promise<{ ragContext: string; ragChunks: ChunkSearchResult[]; ragImages: ImageResult[] }> {
  try {
    // Combine task, recent history, and student answer for a comprehensive query
    const recentText = history.slice(-2).map(m => m.text).join(' ');
    const answerText = studentAnswer ? ` ${studentAnswer}` : '';
    const query = `${task.task} ${recentText}${answerText}`.slice(0, 500);

    const filterEnabled = !!(options?.systemConfig?.['rag.metadata_filter'] as { enabled?: boolean } | undefined)?.enabled;

    let ragChunks: ChunkSearchResult[];

    if (filterEnabled) {
      // Infer metadata filters from conversation context
      options?.timing?.start('rag.filters.infer');
      const lastExaminerMsg = history.slice().reverse().find(m => m.role === 'examiner')?.text;
      const filterHint = inferRagFilters({
        taskId: task.id,
        studentAnswer,
        examinerQuestion: lastExaminerMsg,
      });
      options?.timing?.end('rag.filters.infer');

      ragChunks = await searchWithFallback(query, {
        matchCount,
        filterHint,
        featureEnabled: true,
        timing: options?.timing,
      });
    } else {
      ragChunks = await searchChunks(query, { matchCount });
    }

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
  studyMode?: string,
  personaId?: string,
  studentName?: string
): Promise<ExamTurn> {
  // Load the best-matching prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'examiner_system', rating, studyMode, difficulty
  );

  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent);

  // Persona personality + student name injection
  const personaFragment = personaId ? await loadPersonaFragment(personaId) : '';
  const nameInstruction = studentName
    ? `\n\nADDRESS THE STUDENT: Address the student as "${studentName}" naturally in conversation. Use their name occasionally, not in every sentence.`
    : '';

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
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt + personaFragment + nameInstruction + ragSection,
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
 * Accepts optional pre-fetched RAG and an optional assessmentPromise
 * whose result will be sent as a final SSE event before [DONE].
 */
export async function generateExaminerTurnStreaming(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: import('@/types/database').Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string; ragImages?: ImageResult[] },
  assessmentPromise?: Promise<AssessmentData>,
  onComplete?: (fullText: string) => Promise<void> | void,
  rating: Rating = 'private',
  studyMode?: string,
  personaId?: string,
  studentName?: string,
  structuredResponse?: boolean
): Promise<{ stream: ReadableStream; fullTextPromise: Promise<string> }> {
  // Load the best-matching prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'examiner_system', rating, studyMode, difficulty
  );

  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent);

  // Persona personality + student name injection
  const personaFragment = personaId ? await loadPersonaFragment(personaId) : '';
  const nameInstruction = studentName
    ? `\n\nADDRESS THE STUDENT: Address the student as "${studentName}" naturally in conversation. Use their name occasionally, not in every sentence.`
    : '';

  // Use pre-fetched RAG or fetch fresh
  let ragContext = prefetchedRag?.ragContext ?? '';
  if (!prefetchedRag) {
    const result = await fetchRagContext(task, history);
    ragContext = result.ragContext;
  }

  const ragSection = ragContext
    ? `\n\nFAA SOURCE MATERIAL (use to ask accurate, specific questions):\n${ragContext}`
    : '';

  // Append structured response instruction when chunked TTS is requested
  const structuredInstr = structuredResponse ? STRUCTURED_RESPONSE_INSTRUCTION : '';

  // When structured JSON response is requested, remove the conflicting free-form-only instructions.
  // The prompt ends with TWO lines that contradict JSON output:
  //   1. "IMPORTANT: Respond ONLY as the examiner. No JSON, metadata, or system text."
  //   2. "NEVER include stage directions... only output words the examiner would actually say."
  // Both lines must be stripped — they tell Claude to avoid JSON and output only spoken words,
  // which directly contradicts the STRUCTURED_RESPONSE_INSTRUCTION requiring JSON output.
  let composedSystem = systemPrompt + personaFragment + nameInstruction + ragSection + structuredInstr;
  if (structuredResponse) {
    composedSystem = composedSystem.replace(
      /IMPORTANT: Respond ONLY as the examiner\.[^\n]*\n?NEVER include stage directions[^\n]*\n?/,
      ''
    );
  }

  const messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  // Append paragraph structure instruction when responding to student answers
  // (not on opening questions where messages is empty).
  // Placed BEFORE ragSection so it's not buried after thousands of tokens of reference material.
  // When NOT in structured JSON mode, append brevity instruction for paragraph TTS streaming
  const paragraphInstruction = (!structuredResponse && messages.length > 0) ? PARAGRAPH_STRUCTURE_INSTRUCTION : '';
  const finalSystem = composedSystem + paragraphInstruction;

  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: structuredResponse ? 800 : (messages.length > 0 ? 250 : 500),
    system: finalSystem,
    stream: true,
    messages:
      messages.length === 0
        ? [{ role: 'user', content: 'Begin the oral examination.' }]
        : messages,
  });

  const encoder = new TextEncoder();

  let resolveFullText: (text: string) => void;
  const fullTextPromise = new Promise<string>((resolve) => { resolveFullText = resolve; });

  const readableStream = new ReadableStream({
    async start(controller) {
      let fullText = '';

      // Chunk extraction state for structured response mode
      const emittedChunks = new Set<string>();
      const chunkTexts: Record<string, string> = {};

      // Exactly-3-paragraph detection for per-paragraph TTS:
      //   P1 = first sentence (force-split via regex)
      //   P2 = content up to first \n\n after P1
      //   P3 = everything remaining (emitted when stream ends)
      let p1Emitted = false;
      let p2Emitted = false;
      let lastEmitBoundary = 0;
      const isResponseToStudent = messages.length > 0;

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;

            if (structuredResponse) {
              // Structured mode: detect completed JSON fields, emit chunk events
              const newChunks = extractStructuredChunks(fullText, emittedChunks);
              for (const chunk of newChunks) {
                chunkTexts[chunk.field] = chunk.text;
                emittedChunks.add(chunk.field);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: chunk.field, text: chunk.text })}\n\n`));
              }
            } else {
              // Traditional mode: emit raw token events
              const data = JSON.stringify({ token: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));

              // Paragraph detection (only when responding to student answers)
              if (isResponseToStudent) {
                // Phase 1: Force-split first sentence as P1 (quick reaction)
                if (!p1Emitted && fullText.length >= 10) {
                  const match = fullText.match(/^(.{10,}?[.!?])(\s)/);
                  if (match) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ paragraph: match[1].trim() })}\n\n`));
                    p1Emitted = true;
                    lastEmitBoundary = match[1].length + match[2].length;
                  }
                }

                // Phase 2: Detect FIRST \n\n after P1 → emit as P2 (only one)
                if (p1Emitted && !p2Emitted) {
                  const remaining = fullText.slice(lastEmitBoundary);
                  const idx = remaining.indexOf('\n\n');
                  if (idx !== -1) {
                    const para = remaining.slice(0, idx).trim();
                    if (para) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ paragraph: para })}\n\n`));
                    }
                    p2Emitted = true;
                    lastEmitBoundary += idx + 2;
                  }
                }
                // After P2, stop detecting — P3 is emitted when stream ends
              }
            }
          }
        }

        // After stream ends: emit everything remaining as P3 (non-structured mode only)
        if (!structuredResponse && isResponseToStudent) {
          const finalPara = fullText.slice(lastEmitBoundary).trim();
          if (finalPara) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ paragraph: finalPara })}\n\n`));
          }
        }

        // Build the plain-text examiner message
        let plainText: string;
        if (structuredResponse) {
          // Emit any chunks missed during streaming (fallback full JSON parse)
          const missingChunks = buildPlainTextFromChunks(fullText, chunkTexts);
          // Emit late-discovered chunks that weren't sent during streaming
          for (const field of STRUCTURED_CHUNK_FIELDS) {
            if (!emittedChunks.has(field) && chunkTexts[field]) {
              emittedChunks.add(field);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: field, text: chunkTexts[field] })}\n\n`));
            }
          }
          // Safety net: if NO chunks were extracted at all (model ignored JSON instruction),
          // emit the entire plain text as a single feedback_quick chunk so the client still receives it.
          if (emittedChunks.size === 0 && missingChunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: 'feedback_quick', text: missingChunks })}\n\n`));
          }
          plainText = missingChunks;
        } else {
          plainText = fullText;
        }

        // Send the full examiner message as a separate event for client-side persistence
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ examinerMessage: plainText })}\n\n`));

        // Send linked images (if any) — max 3, filtered by relevance
        const ragImages = prefetchedRag?.ragImages ?? [];
        if (ragImages.length > 0) {
          const selectedImages = ragImages
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, 3);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ images: selectedImages })}\n\n`));
        }

        // Resolve full text so after() block can persist reliably
        resolveFullText(plainText);

        // Legacy onComplete callback (fire-and-forget, non-critical)
        if (onComplete) {
          Promise.resolve(onComplete(plainText)).catch((err: unknown) => console.error('onComplete callback error:', err));
        }

        // If we have a parallel assessment promise, wait for it and send the result.
        // Send keep-alive comments every 2s to prevent proxies from closing the connection.
        if (assessmentPromise) {
          const keepAlive = setInterval(() => {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          }, 2000);
          try {
            const keepAlive = setInterval(() => {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            }, 2000);
            const assessment = await assessmentPromise;
            clearInterval(keepAlive);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ assessment })}\n\n`));
          } catch (err) {
            clearInterval(keepAlive);
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('Assessment failed during streaming:', errMsg, err);
            // Send fallback assessment so the client always receives grading
            const fallback = {
              score: 'partial' as const,
              feedback: 'Assessment could not be completed.',
              misconceptions: [],
              follow_up_needed: false,
              primary_element: null,
              mentioned_elements: [],
              source_summary: null,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ assessment: fallback })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        resolveFullText('');
        controller.error(err);
      }
    },
  });

  return { stream: readableStream, fullTextPromise };
}

/**
 * Assess the student's latest answer using Claude.
 * Returns score, feedback, and which ACS elements were addressed.
 * Loads the best-matching assessment prompt from prompt_versions DB table,
 * mirroring how examiner prompts are loaded with specificity scoring.
 * Accepts optional pre-fetched RAG to avoid duplicate searches.
 */
export async function assessAnswer(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer: string,
  prefetchedRag?: { ragContext: string; ragChunks: ChunkSearchResult[] },
  questionImages?: ImageResult[],
  rating: Rating = 'private',
  studyMode?: string,
  difficulty?: string
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

  // Load the best-matching assessment prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'assessment_system', rating, studyMode, difficulty
  );

  const ratingLabel = rating === 'commercial' ? 'Commercial Pilot'
    : rating === 'instrument' ? 'Instrument Rating'
    : rating === 'atp' ? 'Airline Transport Pilot'
    : 'Private Pilot';

  // Dynamic section always appended (task context + JSON schema)
  const dynamicSection = `
EXAM CONTEXT:
Certificate: ${ratingLabel}
ACS Task: ${task.id} - ${task.task}
All elements for this task:
${elementList}${ragSection}

OUTPUT FORMAT — Respond in JSON only with this exact schema:
{
  "score": "satisfactory" | "unsatisfactory" | "partial",
  "feedback": "brief note on the answer quality",
  "misconceptions": ["list any misconceptions, or empty array"],
  "follow_up_needed": true | false,
  "primary_element": "the ACS element code (e.g., PA.I.A.K1) most directly addressed by this answer, or null",
  "mentioned_elements": ["other element codes touched on in the answer"],
  "source_summary": "1-3 sentences summarizing the key FAA references that apply to this question. Cite specific regulation/document names and section numbers (e.g., '14 CFR 61.23 requires...'). If no FAA source material was provided, set to null."
}`;

  const textOnlyContent = `Recent conversation:\n${recentContext}\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`;
  const imageContent = questionImages && questionImages.length > 0
    ? [
        ...questionImages.map(img => ({
          type: 'image' as const,
          source: { type: 'url' as const, url: img.public_url },
        })),
        {
          type: 'text' as const,
          text: `The applicant was shown the above image(s) during this question.\n\n${textOnlyContent}`,
        },
      ]
    : null;

  const startMs = Date.now();
  let response;
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: dbPromptContent + dynamicSection,
      messages: [{ role: 'user', content: imageContent ?? textOnlyContent }],
    });
  } catch (err) {
    // If the error is image-related, retry without images
    if (imageContent && String(err).includes('Unable to download')) {
      console.warn('[assessAnswer] Image download failed, retrying without images');
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: dbPromptContent + dynamicSection,
        messages: [{ role: 'user', content: textOnlyContent }],
      });
    } else {
      throw err;
    }
  }
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
