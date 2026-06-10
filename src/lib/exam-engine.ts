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
import { selectBestAssets, type AssetSelectionContext, type SelectedAsset } from './asset-selector';
import { searchWithFallback, inferRagFilters } from './rag-search-with-fallback';
import type { SystemConfigMap } from './system-config';
import type { TimingContext } from './timing';
import { getPromptContent } from './prompts';
import { TtlCache } from './ttl-cache';
import { captureServerEvent } from './posthog-server';

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
  /**
   * 'ungraded' (W2.2) marks infrastructure/parse failures — it is excluded
   * from element_attempts and point math, and rendered as "Not assessed".
   * It must never be conflated with 'partial' (a real half-credit answer).
   */
  score: 'satisfactory' | 'unsatisfactory' | 'partial' | 'ungraded';
  feedback: string;
  misconceptions: string[];
  follow_up_needed: boolean;
  primary_element: string | null;
  mentioned_elements: string[];
  /** Always populated — cites FAA sources or states "Insufficient FAA sources" */
  source_summary: string;
  rag_chunks?: ChunkSearchResult[];
  usage?: LlmUsage;
}

const VALID_SCORES = new Set(['satisfactory', 'unsatisfactory', 'partial']);

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  // W5.2: Anthropic prompt-cache metrics (present when caching is active)
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Anthropic system content block with optional cache breakpoint. */
type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

/**
 * W5.2: split the system prompt into [session-static (cached), dynamic].
 *
 * Anthropic caches the prompt PREFIX up to the cache_control marker, so the
 * static block must contain only parts identical across a task's exchanges:
 * the system prompt, persona, name instruction — and, when the Scenario
 * Engine flag is on (W5.4), the EXAM SCENARIO block. Per-exchange material
 * (RAG, transition hints) goes in the uncached dynamic block AFTER the
 * marker. Blocks under the model's 1024-token cache minimum no-op silently.
 */
export function buildCachedSystem(sessionStatic: string, dynamic: string): SystemBlock[] {
  const blocks: SystemBlock[] = [
    { type: 'text', text: sessionStatic, cache_control: { type: 'ephemeral' } },
  ];
  if (dynamic) blocks.push({ type: 'text', text: dynamic });
  return blocks;
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
    const { data, error } = await supabaseClient
      .from('prompt_versions')
      .select('id, content, rating, study_mode, difficulty, version')
      .eq('prompt_key', promptKey)
      .eq('status', 'published')
      .order('version', { ascending: false });
    candidates = (data ?? []) as PromptCandidate[];
    // W2.2: only cache successful queries — a transient DB error must not
    // pin every session to the hardcoded fallback prompt for 5 minutes.
    if (!error) {
      promptCache.set(promptKey, candidates);
    } else {
      console.error(`loadPromptFromDB(${promptKey}) query failed (not cached):`, error.message);
    }
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
  if (!best) {
    captureServerEvent('system', 'prompt_fallback', {
      reason: 'no_matching_prompt',
      prompt_key: promptKey,
      rating,
      study_mode: studyMode,
      difficulty,
    });
  }
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
): Promise<{ ragContext: string; ragChunks: ChunkSearchResult[]; ragImages: Promise<ImageResult[]> }> {
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
      ragChunks = await searchChunks(query, { matchCount, timing: options?.timing });
    }

    const ragContext = formatChunksForPrompt(ragChunks);

    // W5.2 (review-03 #12): the image fetch no longer blocks the critical
    // path — it starts here and resolves in parallel with prompt assembly +
    // the LLM calls; consumers await it only at the point of use.
    const chunkIds = ragChunks.map(c => c.id);
    const ragImages = getImagesForChunks(chunkIds, options?.timing).catch((err) => {
      console.error('Image fetch failed (non-critical):', err instanceof Error ? err.message : err);
      return [] as ImageResult[];
    });

    return { ragContext, ragChunks, ragImages };
  } catch (err) {
    console.error('fetchRagContext failed:', err instanceof Error ? err.message : err);
    return { ragContext: '', ragChunks: [], ragImages: Promise.resolve([]) };
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
  personaSection?: string,
  studentName?: string,
  transitionHint?: string,
  depthContractSection?: string
): Promise<ExamTurn> {
  // Load the best-matching prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'examiner_system', rating, studyMode, difficulty
  );

  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent, depthContractSection);

  // Persona personality contract injection (Phase 11)
  const personaFragment = personaSection ? `\n\n${personaSection}` : '';
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

  // Transition hint for cross_acs mode (Phase 9)
  const transitionSection = transitionHint || '';

  const messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  const startMs = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: buildCachedSystem(systemPrompt + personaFragment + nameInstruction, transitionSection + ragSection),
    messages:
      messages.length === 0
        ? [{ role: 'user', content: 'Begin the oral examination.' }]
        : messages,
  });
  const latencyMs = Date.now() - startMs;

  // W2.2: content may be empty (max-tokens edge / refusal stop) — find the
  // text block instead of indexing [0] blindly.
  const textBlock = response.content.find((b) => b.type === 'text');
  const examinerMessage = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  return {
    examinerMessage,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      latency_ms: latencyMs,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? undefined,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
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
  prefetchedRag?: { ragContext: string; ragImages?: ImageResult[] | Promise<ImageResult[]>; ragChunks?: ChunkSearchResult[] },
  assessmentPromise?: Promise<AssessmentData>,
  onComplete?: (fullText: string) => Promise<void> | void,
  rating: Rating = 'private',
  studyMode?: string,
  personaSection?: string,
  studentName?: string,
  structuredResponse?: boolean,
  timing?: TimingContext,
  depthContractSection?: string,
  assetContext?: AssetSelectionContext,
  onAssetSelected?: (asset: SelectedAsset) => void,
  onUsage?: (usage: LlmUsage) => void
): Promise<{ stream: ReadableStream; fullTextPromise: Promise<string> }> {
  // Load the best-matching prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'examiner_system', rating, studyMode, difficulty
  );

  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent, depthContractSection);

  // Persona personality contract injection (Phase 11)
  const personaFragment = personaSection ? `\n\n${personaSection}` : '';
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

  // When structured JSON response is requested, strip the conflicting free-form-only instructions
  // from the DB prompt FIRST, then inject STRUCTURED_RESPONSE_INSTRUCTION immediately after
  // the system prompt (before persona/name/RAG). This ensures the JSON format instruction
  // appears early in the prompt where Claude weights it more heavily, rather than being
  // buried after thousands of tokens of RAG material.
  let basePrompt = systemPrompt;
  if (structuredResponse) {
    basePrompt = basePrompt.replace(
      /IMPORTANT: Respond ONLY as the examiner\.[^\n]*\n?NEVER include stage directions[^\n]*\n?/,
      ''
    );
  }
  const structuredInstr = structuredResponse ? STRUCTURED_RESPONSE_INSTRUCTION : '';

  // W5.2: session-static region (cached across the task's exchanges).
  // The W5.4 Scenario Engine renders its EXAM SCENARIO block into THIS
  // region (via scenarioSection) so it is cache-priced per exchange.
  const sessionStatic = basePrompt + structuredInstr + personaFragment + nameInstruction;

  let messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  // Fix 2: When structured JSON mode is active, append a format reminder to the last
  // user message. Claude weights user-turn instructions more heavily than content buried
  // in long system prompts, making JSON compliance more reliable.
  if (structuredResponse && messages.length > 0) {
    const lastIdx = messages.length - 1;
    if (messages[lastIdx].role === 'user') {
      messages = [...messages];
      messages[lastIdx] = {
        ...messages[lastIdx],
        content: messages[lastIdx].content + '\n\n[Respond in the JSON format specified in the system prompt. Output ONLY the JSON object with feedback_quick, feedback_detail, and question fields.]',
      };
    }
  }

  // Append paragraph structure instruction when responding to student answers
  // (not on opening questions where messages is empty).
  // When NOT in structured JSON mode, append brevity instruction for paragraph TTS streaming
  const paragraphInstruction = (!structuredResponse && messages.length > 0) ? PARAGRAPH_STRUCTURE_INSTRUCTION : '';
  const dynamicTail = ragSection + paragraphInstruction;

  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: structuredResponse ? 350 : (messages.length > 0 ? 250 : 500),
    system: buildCachedSystem(sessionStatic, dynamicTail),
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

      let firstTokenRecorded = false;
      const streamStartMs = Date.now();
      const streamUsage: LlmUsage = { input_tokens: 0, output_tokens: 0, latency_ms: 0 };

      try {
        for await (const event of stream) {
          // W5.2: streaming usage (incl. prompt-cache metrics) arrives on
          // message_start (input side) and message_delta (output side).
          if (event.type === 'message_start') {
            const u = event.message.usage;
            streamUsage.input_tokens = u.input_tokens ?? 0;
            streamUsage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? undefined;
            streamUsage.cache_read_input_tokens = u.cache_read_input_tokens ?? undefined;
          } else if (event.type === 'message_delta' && event.usage) {
            streamUsage.output_tokens = event.usage.output_tokens ?? streamUsage.output_tokens;
          }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            if (!firstTokenRecorded) {
              // Matches timing.start('llm.examiner.ttft') in api/exam/route.ts
              timing?.end('llm.examiner.ttft');
              firstTokenRecorded = true;
            }
            fullText += event.delta.text;

            if (structuredResponse) {
              // Structured mode: detect completed JSON fields, emit chunk events
              const newChunks = extractStructuredChunks(fullText, emittedChunks);
              for (const chunk of newChunks) {
                chunkTexts[chunk.field] = chunk.text;
                emittedChunks.add(chunk.field);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: chunk.field, text: chunk.text, serverTs: Date.now() })}\n\n`));
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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: field, text: chunkTexts[field], serverTs: Date.now() })}\n\n`));
            }
          }
          // Safety net: if NO chunks were extracted at all (model ignored JSON instruction),
          // split the plain text into up to 3 paragraph-like chunks for progressive delivery,
          // rather than emitting the entire response as a single blob.
          if (emittedChunks.size === 0 && missingChunks) {
            // Try to split into 3 parts: first sentence, middle, rest
            const firstSentenceMatch = missingChunks.match(/^(.{10,}?[.!?])(\s)/);
            if (firstSentenceMatch) {
              const p1 = firstSentenceMatch[1].trim();
              const rest = missingChunks.slice(firstSentenceMatch[1].length + firstSentenceMatch[2].length);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: 'feedback_quick', text: p1, serverTs: Date.now(), safetyNet: true })}\n\n`));
              // Split remaining at first \n\n or midpoint sentence boundary
              const nnIdx = rest.indexOf('\n\n');
              if (nnIdx !== -1) {
                const p2 = rest.slice(0, nnIdx).trim();
                const p3 = rest.slice(nnIdx + 2).trim();
                if (p2) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: 'feedback_detail', text: p2, serverTs: Date.now(), safetyNet: true })}\n\n`));
                if (p3) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: 'question', text: p3, serverTs: Date.now(), safetyNet: true })}\n\n`));
              } else {
                // No paragraph break — emit rest as feedback_detail
                if (rest.trim()) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: 'feedback_detail', text: rest.trim(), serverTs: Date.now(), safetyNet: true })}\n\n`));
              }
            } else {
              // Can't split — emit entire text as feedback_quick (original behavior)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: 'feedback_quick', text: missingChunks, serverTs: Date.now(), safetyNet: true })}\n\n`));
            }
          }
          plainText = missingChunks;
        } else {
          plainText = fullText;
        }

        // Send the full examiner message as a separate event for client-side persistence
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ examinerMessage: plainText })}\n\n`));

        // Send linked images (if any) — semantic selection with threshold
        const ragImages = await Promise.resolve(prefetchedRag?.ragImages ?? []).catch(() => [] as ImageResult[]);
        const ragChunks = prefetchedRag?.ragChunks ?? [];
        if (ragImages.length > 0 || ragChunks.length > 0) {
          if (assetContext) {
            const asset = selectBestAssets(ragImages, ragChunks, assetContext);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ asset })}\n\n`));
            // Backward-compat: also emit legacy { images } event
            const legacyImages = asset.images.map(s => s.image);
            if (legacyImages.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ images: legacyImages })}\n\n`));
            }
            if (onAssetSelected) onAssetSelected(asset);
          } else {
            // Legacy fallback: sort by relevance, take top 3
            const selectedImages = ragImages
              .sort((a, b) => b.relevance_score - a.relevance_score)
              .slice(0, 3);
            if (selectedImages.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ images: selectedImages })}\n\n`));
            }
          }
        }

        // Resolve full text so after() block can persist reliably
        resolveFullText(plainText);

        // W5.2: report stream usage (incl. cache metrics) to the caller
        if (onUsage && streamUsage.input_tokens > 0) {
          streamUsage.latency_ms = Date.now() - streamStartMs;
          try { onUsage(streamUsage); } catch { /* telemetry must not break the stream */ }
        }

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
            const assessment = await assessmentPromise;
            clearInterval(keepAlive);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ assessment })}\n\n`));
          } catch (err) {
            clearInterval(keepAlive);
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('Assessment failed during streaming:', errMsg, err);
            // Send an explicit UNGRADED fallback (W2.2) — infrastructure
            // failures never award the 0.7-point 'partial' credit (bug 7).
            const fallback = {
              score: 'ungraded' as const,
              feedback: 'This answer could not be assessed due to a technical issue.',
              misconceptions: [],
              follow_up_needed: false,
              primary_element: null,
              mentioned_elements: [],
              source_summary: 'Insufficient FAA sources to verify this answer.',
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
  questionImages?: ImageResult[] | Promise<ImageResult[]> | null,
  rating: Rating = 'private',
  studyMode?: string,
  difficulty?: string,
  gradingContractSection?: string
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

  // W5.2: assessment needs grounding for the SPECIFIC claim, not breadth —
  // cap at 3 chunks (the examiner call keeps the full 5).
  if (ragChunks.length > 3) {
    ragChunks = ragChunks.slice(0, 3);
    ragContext = formatChunksForPrompt(ragChunks);
  }

  const ragSection = ragContext
    ? `\n\nFAA SOURCE MATERIAL (use to validate the answer):\n${ragContext}`
    : '';

  // Grading calibration contract (Phase 10) — injected when provided
  const gradingContract = gradingContractSection ? `\n\n${gradingContractSection}` : '';

  // Load the best-matching assessment prompt from DB (specificity: rating + studyMode + difficulty)
  const { content: dbPromptContent } = await loadPromptFromDB(
    supabase, 'assessment_system', rating, studyMode, difficulty
  );

  const ratingLabel = rating === 'commercial' ? 'Commercial Pilot'
    : rating === 'instrument' ? 'Instrument Rating'
    : rating === 'atp' ? 'Airline Transport Pilot'
    : 'Private Pilot';

  // W5.2 prompt-cache structure: the DB prompt, task context, element list,
  // grading contract, and output schema are all TASK-stable — they form the
  // cached static block (comfortably over the 1,024-token cache minimum,
  // which the DB prompt alone is not). Only the RAG section varies per
  // exchange and stays in the uncached dynamic block.
  const staticSection = `${dbPromptContent}

EXAM CONTEXT:
Certificate: ${ratingLabel}
ACS Task: ${task.id} - ${task.task}
All elements for this task:
${elementList}${gradingContract}

OUTPUT FORMAT — Respond in JSON only with this exact schema:
{
  "score": "satisfactory" | "unsatisfactory" | "partial",
  "feedback": "brief note on the answer quality",
  "misconceptions": ["list any misconceptions, or empty array"],
  "follow_up_needed": true | false,
  "primary_element": "the ACS element code (e.g., PA.I.A.K1) most directly addressed by this answer, or null",
  "mentioned_elements": ["other element codes touched on in the answer"],
  "source_summary": "1-3 sentences summarizing the key FAA references that apply to this question. Cite specific regulation/document names and section numbers (e.g., '14 CFR 61.23 requires...'). If no FAA source material was provided, set to: 'Insufficient FAA sources to verify this answer.'"
}`;

  const textOnlyContent = `Recent conversation:\n${recentContext}\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`;
  // W5.2: images may arrive as a promise (fetched in parallel with prompt
  // assembly); resolve them here, just before they are needed.
  const resolvedImages = questionImages ? await Promise.resolve(questionImages).catch(() => []) : null;
  const imageContent = resolvedImages && resolvedImages.length > 0
    ? [
        ...resolvedImages.map(img => ({
          type: 'image' as const,
          source: { type: 'url' as const, url: img.public_url },
        })),
        {
          type: 'text' as const,
          text: `The applicant was shown the above image(s) during this question.\n\n${textOnlyContent}`,
        },
      ]
    : null;

  // Valid element codes for this task — the LLM's element attributions are
  // validated against this set (W2.2): one hallucinated code must never
  // poison the element_attempts write.
  const validElementCodes = new Set(allElements.map((e) => e.split(':')[0].trim()));

  const callOnce = async (withImages: boolean) => {
    const startMs = Date.now();
    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        // W5.2: task-stable prefix cached; per-exchange RAG uncached.
        system: buildCachedSystem(staticSection, ragSection),
        messages: [{ role: 'user', content: withImages && imageContent ? imageContent : textOnlyContent }],
      });
    } catch (err) {
      // If the error is image-related, retry without images
      if (withImages && imageContent && String(err).includes('Unable to download')) {
        console.warn('[assessAnswer] Image download failed, retrying without images');
        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: buildCachedSystem(staticSection, ragSection),
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
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? undefined,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
    };
    // W2.2: find the text block — content can be empty on max-tokens/refusal stops
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    return { text, usageData };
  };

  // W2.2: one retry on unparseable/empty output before falling back to
  // 'ungraded'. Infrastructure failures must never masquerade as a real
  // 'partial' grade (review-02 bug 7).
  let lastUsage: LlmUsage | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usageData } = await callOnce(attempt === 0);
    lastUsage = usageData;
    if (!text) continue;
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Score validation: anything outside the enum is an LLM malfunction
      const score: AssessmentData['score'] = VALID_SCORES.has(parsed.score)
        ? parsed.score
        : 'ungraded';
      if (score === 'ungraded') {
        console.warn(`[assessAnswer] invalid score "${parsed.score}" — marking ungraded`);
      }

      // Element validation: drop hallucinated codes (review-02 bug 6)
      let primaryElement: string | null = parsed.primary_element || null;
      if (primaryElement && !validElementCodes.has(primaryElement)) {
        console.warn(`[assessAnswer] dropped hallucinated primary_element "${primaryElement}"`);
        primaryElement = null;
      }
      const rawMentions: string[] = Array.isArray(parsed.mentioned_elements) ? parsed.mentioned_elements : [];
      const seenMentions = new Set<string>();
      const mentionedElements = rawMentions.filter((code) => {
        if (typeof code !== 'string' || !validElementCodes.has(code) || code === primaryElement || seenMentions.has(code)) {
          return false;
        }
        seenMentions.add(code);
        return true;
      });
      const droppedMentions = rawMentions.length - mentionedElements.length;
      if (droppedMentions > 0) {
        console.warn(`[assessAnswer] dropped ${droppedMentions} invalid/duplicate mentioned_elements`);
      }

      return {
        score,
        feedback: parsed.feedback || '',
        misconceptions: parsed.misconceptions || [],
        follow_up_needed: parsed.follow_up_needed ?? false,
        primary_element: primaryElement,
        mentioned_elements: mentionedElements,
        source_summary: parsed.source_summary || 'Insufficient FAA sources to verify this answer.',
        rag_chunks: ragChunks.length > 0 ? ragChunks : undefined,
        usage: usageData,
      };
    } catch {
      if (attempt === 0) {
        console.warn('[assessAnswer] unparseable assessment JSON — retrying once');
      }
    }
  }

  // Both attempts failed: explicit ungraded state (never fake 'partial')
  return {
    score: 'ungraded',
    feedback: 'This answer could not be assessed due to a technical issue.',
    misconceptions: [],
    follow_up_needed: false,
    primary_element: null,
    mentioned_elements: [],
    source_summary: 'Insufficient FAA sources to verify this answer.',
    rag_chunks: ragChunks.length > 0 ? ragChunks : undefined,
    usage: lastUsage,
  };
}
