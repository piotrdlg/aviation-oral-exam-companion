/**
 * Pure logic for ACS task filtering and exam planning — no external dependencies.
 * Separated from exam-engine.ts for testability.
 */

import type { AcsElement as AcsElementDB, ElementScore, PlannerState, SessionConfig, Difficulty, AircraftClass, Rating, ExamResult, ExamGrade, CompletionTrigger } from '@/types/database';

export interface AcsElement {
  code: string;
  description: string;
}

export interface AcsTaskRow {
  id: string;
  area: string;
  task: string;
  knowledge_elements: AcsElement[];
  risk_management_elements: AcsElement[];
  skill_elements: AcsElement[];
  applicable_classes: AircraftClass[];
}

// Oral-exam-relevant area prefixes per rating.
// Excludes flight-only areas (takeoffs/landings, performance maneuvers, instrument approaches).
export const ORAL_EXAM_AREA_PREFIXES: Record<Rating, string[]> = {
  private: [
    'PA.I.',    // Preflight Preparation
    'PA.II.',   // Preflight Procedures
    'PA.III.',  // Airport and Seaplane Base Operations
    'PA.VI.',   // Navigation
    'PA.VII.',  // Slow Flight and Stalls (knowledge/risk only)
    'PA.VIII.', // Basic Instrument Maneuvers (knowledge/risk only)
    'PA.IX.',   // Emergency Operations
    'PA.X.',    // Multiengine Operations (class-filtered, not area-excluded)
    'PA.XI.',   // Night Operations
    'PA.XII.',  // Postflight Procedures
  ],
  commercial: [
    'CA.I.',    // Preflight Preparation
    'CA.II.',   // Preflight Procedures
    'CA.III.',  // Airport and Seaplane Base Operations
    'CA.VI.',   // Navigation
    'CA.VIII.', // High-Altitude Operations
    'CA.IX.',   // Emergency Operations
    'CA.XI.',   // Postflight Procedures
  ],
  instrument: [
    'IR.I.',    // Preflight Preparation
    'IR.II.',   // Preflight Procedures
    'IR.III.',  // ATC Clearances and Procedures
    'IR.V.',    // Navigation Systems
    'IR.VII.',  // Emergency Operations
    'IR.VIII.', // Postflight Procedures
  ],
  atp: [], // Future
};

/**
 * Filter tasks to oral-exam-relevant areas, by aircraft class, and exclude covered tasks.
 */
export function filterEligibleTasks(
  tasks: AcsTaskRow[],
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'
): AcsTaskRow[] {
  const prefixes = ORAL_EXAM_AREA_PREFIXES[rating] || ORAL_EXAM_AREA_PREFIXES.private;
  return tasks.filter((t) => {
    if (coveredTaskIds.includes(t.id)) return false;

    // Filter by oral-exam-relevant areas for this rating
    const inOralArea = prefixes.some((prefix) => t.id.startsWith(prefix));
    if (!inOralArea) return false;

    // Filter by aircraft class if provided
    if (aircraftClass && t.applicable_classes) {
      if (!t.applicable_classes.includes(aircraftClass)) return false;
    }

    return true;
  });
}

/**
 * Select a random task from a list, with fallback logic.
 * If all eligible tasks are covered, picks from remaining non-covered tasks.
 * If all tasks are covered, returns the first task.
 */
export function selectRandomTask(
  allTasks: AcsTaskRow[],
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'
): AcsTaskRow | null {
  if (allTasks.length === 0) return null;

  const eligible = filterEligibleTasks(allTasks, coveredTaskIds, aircraftClass, rating);

  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  // Fallback: pick from any non-covered task (still class-filtered if provided)
  let remaining = allTasks.filter((t) => !coveredTaskIds.includes(t.id));
  if (aircraftClass) {
    remaining = remaining.filter((t) => !t.applicable_classes || t.applicable_classes.includes(aircraftClass));
  }
  if (remaining.length === 0) return allTasks[0];
  return remaining[Math.floor(Math.random() * remaining.length)];
}

export const AIRCRAFT_CLASS_LABELS: Record<AircraftClass, string> = {
  ASEL: 'Single-Engine Land',
  AMEL: 'Multi-Engine Land',
  ASES: 'Single-Engine Sea',
  AMES: 'Multi-Engine Sea',
};

/**
 * Build the DPE examiner system prompt for a given task.
 * Accepts an optional `dbPromptContent` parameter for DB-sourced prompts
 * (from prompt_versions table via loadPromptFromDB). When provided,
 * it replaces the default prompt template. Task-specific dynamic sections
 * (elements, difficulty, class) are always appended.
 */
export function buildSystemPrompt(
  task: AcsTaskRow,
  targetDifficulty?: Difficulty,
  aircraftClass?: AircraftClass,
  rating: Rating = 'private',
  dbPromptContent?: string
): string {
  const knowledgeList = task.knowledge_elements
    .map((e) => `  - ${e.code}: ${e.description}`)
    .join('\n');
  const riskList = task.risk_management_elements
    .map((e) => `  - ${e.code}: ${e.description}`)
    .join('\n');

  const difficultyInstruction = targetDifficulty
    ? `\nDIFFICULTY LEVEL: ${targetDifficulty.toUpperCase()}
${targetDifficulty === 'easy' ? '- Ask straightforward recall/definition questions.' :
  targetDifficulty === 'medium' ? '- Ask application and scenario-based questions.' :
  targetDifficulty === 'mixed' ? '- Vary difficulty naturally: mix recall, scenario-based, and challenging questions within the session.' :
  '- Ask complex edge cases, \"what if\" chains, and regulation nuances.'}`
    : '';

  const classInstruction = aircraftClass
    ? `\nAIRCRAFT CLASS: ${aircraftClass} (${AIRCRAFT_CLASS_LABELS[aircraftClass]})
- Only ask questions relevant to this class of aircraft.
- Frame scenarios for ${AIRCRAFT_CLASS_LABELS[aircraftClass].toLowerCase()} operations.
- If element descriptions reference other classes, adapt the question to the applicable class context.`
    : '';

  const ratingLabel: Record<Rating, string> = {
    private: 'Private Pilot',
    commercial: 'Commercial Pilot',
    instrument: 'Instrument Rating',
    atp: 'Airline Transport Pilot',
  };
  const examName = ratingLabel[rating] || 'Private Pilot';

  // Dynamic task-specific sections (always appended regardless of prompt source)
  const taskSection = `
CURRENT ACS TASK: ${task.area} > ${task.task} (${task.id})
${classInstruction}

KNOWLEDGE ELEMENTS TO COVER:
${knowledgeList}

RISK MANAGEMENT ELEMENTS TO COVER:
${riskList}
${difficultyInstruction}`;

  // If DB prompt content provided (via prompt_versions), use it as the base
  if (dbPromptContent) {
    return `${dbPromptContent}\n${taskSection}`;
  }

  // Default hardcoded prompt template (fallback when no DB prompt available)
  return `You are a Designated Pilot Examiner (DPE) conducting an FAA ${examName} oral examination. You are professional, thorough, and encouraging — firm but fair.
${taskSection}

INSTRUCTIONS:
1. Ask ONE clear question at a time about a specific knowledge or risk management element.
2. After the applicant responds, briefly assess their answer:
   - If correct and complete, acknowledge and move to the next element or a natural follow-up.
   - If partially correct, probe deeper with a follow-up question.
   - If incorrect, note the error and rephrase or offer a hint before moving on.
3. Use realistic DPE phrasing. For example:
   - "Tell me about..." / "Walk me through..." / "What would you do if..."
   - "Good. Now let's talk about..." / "That's close, but think about..."
4. Cover at least 2-3 knowledge elements and 1-2 risk management elements per task.
5. Keep questions conversational, not robotic. A real DPE connects topics naturally.
6. When you've covered enough elements, naturally transition by saying something like "Good, let's move on to..." or end the session.

IMPORTANT: Respond ONLY as the examiner. Do not include any JSON, metadata, or system text. Just speak naturally as the DPE would.
NEVER include stage directions, action descriptions, or parenthetical comments like *(pauses)*, *(shuffles papers)*, *(waits for response)*, or similar. Your text will be read aloud by a text-to-speech engine — only output words the examiner would actually say.`;
}

/**
 * Structured 3-chunk response instruction appended to the system prompt
 * when chunked TTS streaming is active. Forces Claude to output JSON
 * with three discrete fields, enabling server-side chunk extraction
 * for latency-optimized per-chunk TTS playback.
 */
export const STRUCTURED_RESPONSE_INSTRUCTION = `

RESPONSE FORMAT — CRITICAL: You MUST respond with a JSON object containing exactly these three fields. Output ONLY the JSON object, no markdown code blocks, no text before or after.

{
  "feedback_quick": "One sentence of immediate, natural feedback. Examples: 'That\\'s exactly right.' or 'Not quite — let me clarify.' or 'You\\'re on the right track, but missing a key detail.' Keep it to ONE brief sentence that a real DPE would say.",
  "feedback_detail": "One concise paragraph elaborating on the student\\'s answer. What they got right, what they missed or got wrong, and any relevant regulation references or clarifications. Be specific and educational.",
  "question": "One paragraph that starts with a brief natural transition connecting to the previous topic (e.g., 'Let\\'s dig deeper into that...' or 'Good — now building on what you said about...') followed by your next examination question. Ask ONE clear question."
}

All three fields are REQUIRED. Each field value must be a plain text string (no nested JSON, no markdown). The text will be read aloud by TTS — write naturally as a DPE would speak.`;

/**
 * Paragraph structure instruction appended to the system prompt when responding
 * to student answers (not on opening questions) in non-structured mode.
 * Enforces brevity for per-paragraph TTS streaming.
 */
export const PARAGRAPH_STRUCTURE_INSTRUCTION = `

RESPONSE LENGTH LIMIT: Maximum 60 words. React in one sentence, give 1-2 sentences of feedback, end with one question. Do not teach, list, or lecture — a DPE probes.`;

// ================================================================
// Structured Response Chunk Extraction
// ================================================================

export const STRUCTURED_CHUNK_FIELDS = ['feedback_quick', 'feedback_detail', 'question'] as const;
export type StructuredChunkField = typeof STRUCTURED_CHUNK_FIELDS[number];

export interface ExtractedChunk {
  field: StructuredChunkField;
  text: string;
}

/**
 * Extract completed JSON string fields from a partially-streamed JSON buffer.
 * Uses regex to detect `"field": "value"` patterns with proper escape handling.
 *
 * @param fullText - The accumulated streaming text so far (raw JSON being built)
 * @param alreadyEmitted - Fields already extracted in previous calls (skipped)
 * @returns Array of newly extracted chunks (may be empty)
 */
export function extractStructuredChunks(
  fullText: string,
  alreadyEmitted: Set<string>
): ExtractedChunk[] {
  const results: ExtractedChunk[] = [];

  for (const field of STRUCTURED_CHUNK_FIELDS) {
    if (alreadyEmitted.has(field)) continue;

    // Match a completed JSON string value: "field": "value"
    // Handles escaped quotes and other escape sequences within the value
    const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`);
    const match = fullText.match(regex);
    if (match) {
      let value: string;
      try {
        value = JSON.parse(`"${match[1]}"`);
      } catch {
        // Manual unescape fallback for malformed escape sequences
        value = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      }
      results.push({ field, text: value });
    }
  }

  return results;
}

/**
 * Build plain text from extracted chunk texts, joining with paragraph separators.
 * Falls back to full JSON parse if some chunks were missed during streaming.
 *
 * @param fullText - The complete raw JSON text from the model
 * @param chunkTexts - Already-extracted chunk texts (may be incomplete)
 * @returns Plain text suitable for display and transcript persistence
 */
export function buildPlainTextFromChunks(
  fullText: string,
  chunkTexts: Record<string, string>
): string {
  const emittedCount = Object.keys(chunkTexts).length;

  if (emittedCount > 0 && emittedCount < 3) {
    // Some chunks extracted — try full JSON parse for the rest
    try {
      const cleaned = fullText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      for (const field of STRUCTURED_CHUNK_FIELDS) {
        if (!chunkTexts[field] && parsed[field]) {
          chunkTexts[field] = parsed[field];
        }
      }
    } catch {
      // JSON parse failed — use what we have
    }
  } else if (emittedCount === 0) {
    // No chunks extracted during streaming — try full parse
    try {
      const cleaned = fullText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      for (const field of STRUCTURED_CHUNK_FIELDS) {
        if (parsed[field]) {
          chunkTexts[field] = parsed[field];
        }
      }
    } catch {
      return fullText; // Total fallback: raw text
    }
  }

  const text = STRUCTURED_CHUNK_FIELDS
    .map(f => chunkTexts[f])
    .filter(Boolean)
    .join('\n\n');

  return text || fullText;
}

// ================================================================
// Planner Pure Functions
// ================================================================

/**
 * Build an ordered element queue based on session configuration.
 *
 * - linear: elements sorted by area/task/order_index
 * - cross_acs: shuffled randomly
 * - weak_areas: weighted random favoring weak elements
 */
export function buildElementQueue(
  elements: AcsElementDB[],
  config: SessionConfig,
  weakStats?: ElementScore[]
): string[] {
  let filtered = elements;

  // Filter by selected tasks (most granular, wins over selectedAreas)
  if (config.selectedTasks && config.selectedTasks.length > 0) {
    filtered = filtered.filter((el) => {
      // el.task_id format: "PA.I.A" — match against selectedTasks
      return config.selectedTasks.includes(el.task_id);
    });
  } else if (config.selectedAreas.length > 0) {
    // Fallback: filter by selected areas
    filtered = filtered.filter((el) => {
      // el.code format: "PA.I.A.K1" — area is the Roman numeral
      const parts = el.code.split('.');
      if (parts.length >= 2) {
        return config.selectedAreas.includes(parts[1]);
      }
      return false;
    });
  }

  // Filter by difficulty (with fallback: if filtering removes all elements, skip filter)
  if (config.difficulty !== 'mixed') {
    const diffFiltered = filtered.filter((el) => el.difficulty_default === config.difficulty);
    if (diffFiltered.length > 0) {
      filtered = diffFiltered;
    }
  }

  // Filter to oral-exam-relevant areas only (K and R elements, not S)
  filtered = filtered.filter((el) => el.element_type !== 'skill');

  const codes = filtered.map((el) => el.code);

  switch (config.studyMode) {
    case 'linear':
      // Already in order_index order from DB
      return codes;

    case 'cross_acs':
      // Fisher-Yates shuffle
      return shuffleArray(codes);

    case 'weak_areas': {
      if (!weakStats || weakStats.length === 0) {
        return shuffleArray(codes);
      }
      // Weight by weakness: unsatisfactory > partial > untouched > satisfactory
      return weightedShuffle(codes, weakStats);
    }

    default:
      return codes;
  }
}

/**
 * Pick the next element from the planner queue.
 */
export function pickNextElement(
  state: PlannerState,
  config: SessionConfig
): { elementCode: string; updatedState: PlannerState } | null {
  if (state.queue.length === 0) return null;

  // Find next element not in recent list (avoid repetition)
  let candidate: string | null = null;
  let cursor = state.cursor;

  for (let i = 0; i < state.queue.length; i++) {
    const idx = (cursor + i) % state.queue.length;
    const code = state.queue[idx];
    if (!state.recent.includes(code)) {
      candidate = code;
      cursor = (idx + 1) % state.queue.length;
      break;
    }
  }

  // If all elements are in recent (short queue), just take next
  if (!candidate) {
    candidate = state.queue[cursor % state.queue.length];
    cursor = (cursor + 1) % state.queue.length;
  }

  const updatedRecent = [...state.recent, candidate].slice(-5); // Keep last 5

  return {
    elementCode: candidate,
    updatedState: {
      ...state,
      cursor,
      recent: updatedRecent,
      attempts: {
        ...state.attempts,
        [candidate]: (state.attempts[candidate] || 0) + 1,
      },
      version: state.version + 1,
    },
  };
}

/**
 * Create the initial planner state.
 */
export function initPlannerState(queue: string[]): PlannerState {
  return {
    version: 0,
    queue,
    cursor: 0,
    recent: [],
    attempts: {},
  };
}

// ================================================================
// Exam Grading
// ================================================================

/**
 * Compute the grade and result summary for a completed exam.
 * Pure function — no external dependencies.
 *
 * Point-based grading (mirrors FAA oral exam 70% pass standard):
 *   - satisfactory = 1.0 point
 *   - partial = 0.7 points
 *   - unsatisfactory = 0 points
 *   - Pass threshold: score_percentage >= 70%
 *
 * Grade rules:
 *   - incomplete: fewer elements asked than total in set (exam not finished)
 *   - satisfactory: score_percentage >= 70%
 *   - unsatisfactory: score_percentage < 70%
 */
export function computeExamResult(
  attempts: Array<{ element_code: string; score: 'satisfactory' | 'unsatisfactory' | 'partial'; area: string }>,
  totalElementsInSet: number,
  completionTrigger: CompletionTrigger
): ExamResult {
  // Degenerate case: no elements in exam set
  if (totalElementsInSet === 0) {
    return {
      grade: 'incomplete',
      score_percentage: 0,
      total_elements_in_set: 0,
      elements_asked: 0,
      elements_satisfactory: 0,
      elements_unsatisfactory: 0,
      elements_partial: 0,
      elements_not_asked: 0,
      score_by_area: {},
      completion_trigger: completionTrigger,
      graded_at: new Date().toISOString(),
    };
  }

  // Deduplicate: if an element was attempted multiple times, use the latest score (last write wins).
  // This handles planner queue wrap-around where students retry elements.
  const deduped = new Map<string, typeof attempts[0]>();
  for (const a of attempts) {
    deduped.set(a.element_code, a);
  }
  const uniqueAttempts = [...deduped.values()];

  const elementsAsked = uniqueAttempts.length;
  const elementsSatisfactory = uniqueAttempts.filter(a => a.score === 'satisfactory').length;
  const elementsUnsatisfactory = uniqueAttempts.filter(a => a.score === 'unsatisfactory').length;
  const elementsPartial = uniqueAttempts.filter(a => a.score === 'partial').length;
  const elementsNotAsked = Math.max(0, totalElementsInSet - elementsAsked);

  // Point-based scoring: sat=1.0, partial=0.7, unsat=0
  const pointsEarned = elementsSatisfactory * 1.0 + elementsPartial * 0.7;
  const pointsPossible = elementsAsked; // 1.0 per element asked
  const scorePercentage = pointsPossible > 0
    ? Math.round((pointsEarned / pointsPossible) * 100) / 100
    : 0;

  // Build score by area
  const scoreByArea: Record<string, { asked: number; satisfactory: number; unsatisfactory: number }> = {};
  for (const attempt of uniqueAttempts) {
    if (!scoreByArea[attempt.area]) {
      scoreByArea[attempt.area] = { asked: 0, satisfactory: 0, unsatisfactory: 0 };
    }
    scoreByArea[attempt.area].asked++;
    if (attempt.score === 'satisfactory') scoreByArea[attempt.area].satisfactory++;
    if (attempt.score === 'unsatisfactory') scoreByArea[attempt.area].unsatisfactory++;
  }

  // Determine grade
  let grade: ExamGrade;
  if (elementsAsked === 0) {
    // No elements were scored at all
    grade = 'incomplete';
  } else if (completionTrigger === 'user_ended') {
    // User manually ended the exam — grade against elements actually asked,
    // not the full ACS element set (which may be 100+ elements).
    grade = scorePercentage >= 0.70 ? 'satisfactory' : 'unsatisfactory';
  } else if (elementsAsked < totalElementsInSet) {
    // Natural/system completion but coverage not reached
    grade = 'incomplete';
  } else if (scorePercentage >= 0.70) {
    grade = 'satisfactory';
  } else {
    grade = 'unsatisfactory';
  }

  return {
    grade,
    score_percentage: scorePercentage,
    total_elements_in_set: totalElementsInSet,
    elements_asked: elementsAsked,
    elements_satisfactory: elementsSatisfactory,
    elements_unsatisfactory: elementsUnsatisfactory,
    elements_partial: elementsPartial,
    elements_not_asked: elementsNotAsked,
    score_by_area: scoreByArea,
    completion_trigger: completionTrigger,
    graded_at: new Date().toISOString(),
  };
}

// ================================================================
// Utility Functions
// ================================================================

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function weightedShuffle(codes: string[], stats: ElementScore[]): string[] {
  const statsMap = new Map(stats.map((s) => [s.element_code, s]));

  // Assign weights based on weakness
  const weighted = codes.map((code) => {
    const stat = statsMap.get(code);
    let weight: number;

    if (!stat || stat.total_attempts === 0) {
      weight = 3; // Untouched — high priority
    } else if (stat.latest_score === 'unsatisfactory') {
      weight = 5; // Worst — highest priority
    } else if (stat.latest_score === 'partial') {
      weight = 4;
    } else {
      weight = 1; // Satisfactory — lowest priority
    }

    return { code, weight };
  });

  // Weighted shuffle: sort by random value scaled by weight
  weighted.sort((a, b) => {
    const ra = Math.random() * a.weight;
    const rb = Math.random() * b.weight;
    return rb - ra;
  });

  return weighted.map((w) => w.code);
}
