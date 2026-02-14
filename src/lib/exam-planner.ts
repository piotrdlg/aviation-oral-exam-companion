/**
 * Stateful planner wrapper — loads config from DB, drives element queue,
 * persists planner state. Bridges pure functions in exam-logic.ts with Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import type { AcsElement as AcsElementDB, ElementScore, PlannerState, SessionConfig, Difficulty } from '@/types/database';
import { buildElementQueue, pickNextElement, initPlannerState, buildSystemPrompt, type AcsTaskRow } from './exam-logic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  // Load all ACS elements
  const { data: elements, error: elErr } = await supabase
    .from('acs_elements')
    .select('*')
    .order('order_index');

  if (elErr || !elements || elements.length === 0) {
    console.error('Failed to load ACS elements:', elErr?.message);
    return null;
  }

  // Load weak stats if using weak_areas mode
  let weakStats: ElementScore[] = [];
  if (config.studyMode === 'weak_areas') {
    const { data: scores } = await supabase.rpc('get_element_scores', {
      p_user_id: userId,
      p_rating: 'private',
    });
    weakStats = (scores || []) as ElementScore[];
  }

  // Build queue using pure function
  const queue = buildElementQueue(elements as AcsElementDB[], config, weakStats);

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
    const { data } = await supabase
      .from('acs_elements')
      .select('*')
      .order('order_index');
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

  // Build system prompt with difficulty
  const systemPrompt = buildSystemPrompt(task as AcsTaskRow, difficulty);

  return {
    elementCode,
    element,
    task: task as AcsTaskRow,
    difficulty,
    plannerState: updatedState,
    systemPrompt,
  };
}
