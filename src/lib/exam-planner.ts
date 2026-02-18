/**
 * Stateful planner wrapper — loads config from DB, drives element queue,
 * persists planner state. Bridges pure functions in exam-logic.ts with Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import type { AcsElement as AcsElementDB, ElementScore, PlannerState, SessionConfig, Difficulty, AircraftClass } from '@/types/database';
import { buildElementQueue, pickNextElement, initPlannerState, buildSystemPrompt, type AcsTaskRow } from './exam-logic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RATING_PREFIX: Record<string, string> = {
  private: 'PA.', commercial: 'CA.', instrument: 'IR.', atp: 'ATP.',
};

export interface PlannerResult {
  elementCode: string;
  element: AcsElementDB;
  task: AcsTaskRow;
  difficulty: Difficulty;
  plannerState: PlannerState;
  systemPrompt: string;
}

/**
 * Initialize a planner for a new session: load elements, build queue, pick first element.
 */
export async function initPlanner(
  config: SessionConfig,
  userId: string
): Promise<PlannerResult | null> {
  const prefix = RATING_PREFIX[config.rating] || 'PA.';

  // Load ACS elements filtered by rating prefix
  // Order by code (e.g. PA.I.A.K1) for correct task-sequential ordering in linear mode.
  // order_index is per-task so it interleaves elements from different tasks.
  const elementQuery = supabase
    .from('acs_elements')
    .select('*')
    .like('code', `${prefix}%`)
    .order('code');

  const { data: elements, error: elErr } = await elementQuery;

  if (elErr || !elements || elements.length === 0) {
    console.error('Failed to load ACS elements:', elErr?.message);
    return null;
  }

  // Filter elements by aircraft class: only include elements whose parent task
  // is applicable to the selected class
  let filteredElements = elements as AcsElementDB[];
  if (config.aircraftClass) {
    const { data: classTasks } = await supabase
      .from('acs_tasks')
      .select('id')
      .eq('rating', config.rating || 'private')
      .contains('applicable_classes', [config.aircraftClass]);

    if (classTasks) {
      const validTaskIds = new Set(classTasks.map((t: { id: string }) => t.id));
      filteredElements = filteredElements.filter((el) => validTaskIds.has(el.task_id));
    }
  }

  // Load weak stats if using weak_areas mode
  let weakStats: ElementScore[] = [];
  if (config.studyMode === 'weak_areas') {
    const { data: scores } = await supabase.rpc('get_element_scores', {
      p_user_id: userId,
      p_rating: config.rating || 'private',
    });
    weakStats = (scores || []) as ElementScore[];
  }

  // Build queue using pure function
  const queue = buildElementQueue(filteredElements, config, weakStats);

  if (queue.length === 0) {
    console.error('Empty element queue after filtering');
    return null;
  }

  // Initialize planner state
  const state = initPlannerState(queue);

  // Pick first element
  return advancePlanner(state, config, elements as AcsElementDB[]);
}

/**
 * Advance the planner to pick the next element and build a system prompt.
 */
export async function advancePlanner(
  state: PlannerState,
  config: SessionConfig,
  cachedElements?: AcsElementDB[]
): Promise<PlannerResult | null> {
  // Load elements if not cached
  let elements = cachedElements;
  if (!elements) {
    const prefix = RATING_PREFIX[config.rating] || 'PA.';
    const { data } = await supabase
      .from('acs_elements')
      .select('*')
      .like('code', `${prefix}%`)
      .order('code');
    elements = (data || []) as AcsElementDB[];
  }

  const result = pickNextElement(state, config);
  if (!result) return null;

  const { elementCode, updatedState } = result;

  // Find the element details
  const element = elements.find((el) => el.code === elementCode);
  if (!element) return null;

  // Load the parent ACS task for this element
  const { data: task } = await supabase
    .from('acs_tasks')
    .select('*')
    .eq('id', element.task_id)
    .single();

  if (!task) return null;

  // Determine difficulty
  const difficulty: Difficulty =
    config.difficulty === 'mixed' ? element.difficulty_default : (config.difficulty as Difficulty);

  // Build system prompt with difficulty, aircraft class, and rating
  const systemPrompt = buildSystemPrompt(task as AcsTaskRow, difficulty, config.aircraftClass, config.rating || 'private');

  return {
    elementCode,
    element,
    task: task as AcsTaskRow,
    difficulty,
    plannerState: updatedState,
    systemPrompt,
  };
}
