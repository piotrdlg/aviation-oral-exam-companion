/**
 * Pure logic for ACS task filtering and exam planning — no external dependencies.
 * Separated from exam-engine.ts for testability.
 */

import type { AcsElement as AcsElementDB, ElementScore, PlannerState, SessionConfig, Difficulty, AircraftClass } from '@/types/database';

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

// Oral-exam-relevant area prefixes (exclude flight maneuvers that are skill-only)
// Areas IV (Takeoffs/Landings), V (Performance Maneuvers) are excluded.
// Area X (Multiengine) IS included — it's filtered by aircraft class instead.
export const ORAL_EXAM_AREA_PREFIXES = [
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
];

/**
 * Filter tasks to oral-exam-relevant areas, by aircraft class, and exclude covered tasks.
 */
export function filterEligibleTasks(
  tasks: AcsTaskRow[],
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass
): AcsTaskRow[] {
  return tasks.filter((t) => {
    if (coveredTaskIds.includes(t.id)) return false;

    // Filter by oral-exam-relevant areas
    const inOralArea = ORAL_EXAM_AREA_PREFIXES.some((prefix) => t.id.startsWith(prefix));
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
  aircraftClass?: AircraftClass
): AcsTaskRow | null {
  if (allTasks.length === 0) return null;

  const eligible = filterEligibleTasks(allTasks, coveredTaskIds, aircraftClass);

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
 */
export function buildSystemPrompt(task: AcsTaskRow, targetDifficulty?: Difficulty, aircraftClass?: AircraftClass): string {
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
  '- Ask complex edge cases, \"what if\" chains, and regulation nuances.'}`
    : '';

  const classInstruction = aircraftClass
    ? `\nAIRCRAFT CLASS: ${aircraftClass} (${AIRCRAFT_CLASS_LABELS[aircraftClass]})
- Only ask questions relevant to this class of aircraft.
- Frame scenarios for ${AIRCRAFT_CLASS_LABELS[aircraftClass].toLowerCase()} operations.
- If element descriptions reference other classes, adapt the question to the applicable class context.`
    : '';

  return `You are a Designated Pilot Examiner (DPE) conducting an FAA Private Pilot oral examination. You are professional, thorough, and encouraging — firm but fair.

CURRENT ACS TASK: ${task.area} > ${task.task} (${task.id})
${classInstruction}

KNOWLEDGE ELEMENTS TO COVER:
${knowledgeList}

RISK MANAGEMENT ELEMENTS TO COVER:
${riskList}
${difficultyInstruction}

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

IMPORTANT: Respond ONLY as the examiner. Do not include any JSON, metadata, or system text. Just speak naturally as the DPE would.`;
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

  // Filter by difficulty
  if (config.difficulty !== 'mixed') {
    filtered = filtered.filter((el) => el.difficulty_default === config.difficulty);
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
