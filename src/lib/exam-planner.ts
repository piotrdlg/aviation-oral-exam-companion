/**
 * Stateful planner wrapper — loads config from DB, drives element queue,
 * persists planner state. Bridges pure functions in exam-logic.ts with Supabase.
 *
 * Phase 4: Integrates ExamPlanV1 for predetermined exam shape —
 * planned question count, bonus questions, follow-up limits, mention credit.
 */

import { createClient } from '@supabase/supabase-js';
import type { AcsElement as AcsElementDB, ElementScore, PlannerState, SessionConfig, Difficulty } from '@/types/database';
import { buildElementQueue, pickNextElement, initPlannerState, buildSystemPrompt, ORAL_EXAM_AREA_PREFIXES, type AcsTaskRow, type TaxonomyFingerprints } from './exam-logic';
import { buildStructuralFingerprints, computeFingerprintStats } from './structural-fingerprints';
import type { AdjacencyNeighbors } from './element-adjacency';
import { buildDepthDifficultyContract, type DepthDifficultyContract } from './difficulty-contract';
import {
  buildExamPlan,
  isExamComplete,
  recordQuestionAsked,
  useBonusQuestion,
  creditMentionedElements,
  canFollowUp,
  shouldAdvanceElement,
  type ExamPlanV1,
  type ExamPlanDefaults,
  DEFAULT_PLAN_DEFAULTS,
} from './exam-plan';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RATING_PREFIX: Record<string, string> = {
  private: 'PA.', commercial: 'CA.', instrument: 'IR.', atp: 'ATP.',
};

export interface FingerprintMeta {
  source: 'evidence_chain' | 'structural' | 'none';
  elementCount: number;
  fingerprintCount: number;
  coveragePercent: number;
  uniqueSlugs: number;
}

export interface PlannerResult {
  elementCode: string;
  element: AcsElementDB;
  task: AcsTaskRow;
  difficulty: Difficulty;
  plannerState: PlannerState;
  examPlan: ExamPlanV1;
  systemPrompt: string;
  fingerprintMeta?: FingerprintMeta;
  depthDifficultyContract?: DepthDifficultyContract;
}

/**
 * Load exam plan defaults from system_config (if configured).
 */
async function loadPlanDefaults(): Promise<Partial<ExamPlanDefaults>> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'exam.plan_defaults')
      .maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      return data.value as Partial<ExamPlanDefaults>;
    }
  } catch {
    // Non-critical: fall through to defaults
  }
  return {};
}

/**
 * Count total oral-eligible elements for a rating (used for proportional scaling).
 * W2.5 (bug 18): counts only elements in oral-exam areas, matching
 * buildElementQueue's filter — keeps plan-size ratios consistent.
 */
async function countTotalOralElements(rating: string): Promise<number> {
  const prefix = RATING_PREFIX[rating] || 'PA.';
  const oralPrefixes = ORAL_EXAM_AREA_PREFIXES[(rating || 'private') as keyof typeof ORAL_EXAM_AREA_PREFIXES] || [];
  let query = supabase
    .from('acs_elements')
    .select('*', { count: 'exact', head: true })
    .like('code', `${prefix}%`)
    .neq('element_type', 'skill');
  if (oralPrefixes.length > 0) {
    query = query.or(oralPrefixes.map((p) => `code.like.${p}%`).join(','));
  }
  const { count } = await query;
  return count || 0;
}

/**
 * Load element_adjacency neighbor lists for a set of element codes (W5.3).
 * Batched .in() queries keep request URLs under PostgREST limits.
 */
export async function loadAdjacencyNeighbors(
  elementCodes: string[]
): Promise<AdjacencyNeighbors | undefined> {
  const neighbors: AdjacencyNeighbors = new Map();
  for (let i = 0; i < elementCodes.length; i += 200) {
    const batch = elementCodes.slice(i, i + 200);
    const { data, error } = await supabase
      .from('element_adjacency')
      .select('element_code, related_code, score')
      .in('element_code', batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const list = neighbors.get(row.element_code) ?? [];
      list.push({ code: row.related_code, score: Number(row.score) });
      neighbors.set(row.element_code, list);
    }
  }
  if (neighbors.size === 0) return undefined;
  for (const list of neighbors.values()) list.sort((a, b) => b.score - a.score);
  return neighbors;
}

/**
 * Load fingerprints for ACS elements.
 *
 * W5.1 / decision D4: the graph evidence-chain loader
 * (concepts → concept_chunk_evidence → kb_chunk_taxonomy) was REMOVED — it
 * never produced fingerprints in production (the slug-format bug meant zero
 * concept matches), so structural fingerprints were always the real
 * implementation. They are now the explicit one, until W5.3 replaces this
 * layer with the element_adjacency table.
 */
interface FingerprintLoadResult {
  fingerprints: TaxonomyFingerprints;
  meta: FingerprintMeta;
}

async function loadTaxonomyFingerprints(
  elementCodes: string[]
): Promise<FingerprintLoadResult> {
  const emptyResult: FingerprintLoadResult = {
    fingerprints: new Map(),
    meta: { source: 'none', elementCount: elementCodes.length, fingerprintCount: 0, coveragePercent: 0, uniqueSlugs: 0 },
  };
  if (elementCodes.length === 0) return emptyResult;

  const structural = buildStructuralFingerprints(elementCodes);
  if (structural.size > 0) {
    const stats = computeFingerprintStats(elementCodes, structural);
    return {
      fingerprints: structural,
      meta: {
        source: 'structural',
        elementCount: elementCodes.length,
        fingerprintCount: stats.elementsWithFingerprints,
        coveragePercent: stats.coveragePercent,
        uniqueSlugs: stats.uniqueSlugs,
      },
    };
  }

  return emptyResult;
}

/**
 * Initialize a planner for a new session: load elements, build queue, pick first element.
 * Now also builds an ExamPlanV1 with scope-sensitive question count.
 */
export async function initPlanner(
  config: SessionConfig,
  userId: string,
  opts?: { adjacencyOrdering?: boolean }
): Promise<PlannerResult | null> {
  const prefix = RATING_PREFIX[config.rating] || 'PA.';

  // Load ACS elements filtered by rating prefix
  // Order by code (e.g. PA.I.A.K1) for correct task-sequential ordering in linear mode.
  const elementQuery = supabase
    .from('acs_elements')
    .select('*')
    .like('code', `${prefix}%`)
    .order('code');

  // Load elements, plan defaults, and total oral elements in parallel
  const [elemResult, planOverrides, totalOralElements] = await Promise.all([
    elementQuery,
    loadPlanDefaults(),
    countTotalOralElements(config.rating || 'private'),
  ]);

  const { data: elements, error: elErr } = elemResult;
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

  // Load weak stats if using weak_areas or quick_drill mode
  let weakStats: ElementScore[] = [];
  if (config.studyMode === 'weak_areas' || config.studyMode === 'quick_drill') {
    const { data: scores } = await supabase.rpc('get_element_scores', {
      p_user_id: userId,
      p_rating: config.rating || 'private',
    });
    weakStats = (scores || []) as ElementScore[];
  }

  // Load taxonomy fingerprints for cross_acs connected walk
  let taxonomyFingerprints: TaxonomyFingerprints | undefined;
  let fingerprintMeta: FingerprintMeta | undefined;
  if (config.studyMode === 'cross_acs') {
    const elementCodes = filteredElements
      .filter(el => el.element_type !== 'skill')
      .map(el => el.code);
    const fpResult = await loadTaxonomyFingerprints(elementCodes);
    taxonomyFingerprints = fpResult.fingerprints;
    fingerprintMeta = fpResult.meta;
  }

  // W5.3 (flag exam.adjacency_ordering): load precomputed adjacency for the
  // rating's elements and order the cross_acs walk by it. Loaded only when
  // the flag is on; absent rows degrade to the fingerprint walk unchanged.
  let adjacencyNeighbors: AdjacencyNeighbors | undefined;
  if (opts?.adjacencyOrdering && config.studyMode === 'cross_acs') {
    try {
      adjacencyNeighbors = await loadAdjacencyNeighbors(
        filteredElements.map((el) => el.code)
      );
    } catch (err) {
      console.error('Adjacency load failed (falling back to fingerprints):', err instanceof Error ? err.message : err);
    }
  }

  // Build queue using pure function
  const queue = buildElementQueue(filteredElements, config, weakStats, taxonomyFingerprints, adjacencyNeighbors);

  if (queue.length === 0) {
    console.error('Empty element queue after filtering');
    return null;
  }

  // Build exam plan with scope-sensitive question count
  // Quick Drill: short focused exam (10-20 questions, no bonus)
  const effectivePlanOverrides = config.studyMode === 'quick_drill'
    ? {
        ...planOverrides,
        full_exam_question_count: 15,
        min_question_count: 10,
        max_question_count: 20,
        bonus_question_max: 0,
      }
    : planOverrides;
  const examPlan = buildExamPlan(queue, config.studyMode, totalOralElements, effectivePlanOverrides);

  // Initialize planner state
  const state = initPlannerState(queue);

  // Pick first element and record it in the plan
  const result = await advancePlannerInternal(state, config, examPlan, elements as AcsElementDB[]);
  if (result) {
    result.fingerprintMeta = fingerprintMeta;
  }
  return result;
}

/**
 * Advance the planner to pick the next element and build a system prompt.
 * Now checks ExamPlan stop condition and records question in plan.
 */
export async function advancePlanner(
  state: PlannerState,
  config: SessionConfig,
  cachedElements?: AcsElementDB[],
  examPlan?: ExamPlanV1
): Promise<PlannerResult | null> {
  // If no plan provided, create a minimal one for backwards compatibility
  const plan = examPlan ?? buildExamPlan(
    state.queue,
    config.studyMode,
    state.queue.length,
    DEFAULT_PLAN_DEFAULTS
  );

  return advancePlannerInternal(state, config, plan, cachedElements);
}

/**
 * Internal advance implementation shared by initPlanner and advancePlanner.
 */
async function advancePlannerInternal(
  state: PlannerState,
  config: SessionConfig,
  examPlan: ExamPlanV1,
  cachedElements?: AcsElementDB[]
): Promise<PlannerResult | null> {
  // Check plan stop condition
  if (isExamComplete(examPlan)) {
    return null;
  }

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

  // Skip elements already credited by mention
  let result = pickNextElement(state, config);
  while (result && examPlan.coverage[result.elementCode] === 'credited_by_mention') {
    result = pickNextElement(result.updatedState, config);
  }
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

  // Build depth & difficulty contract (Phase 10)
  const rating = config.rating || 'private';
  const depthDifficultyContract = buildDepthDifficultyContract(
    rating,
    difficulty,
    element.element_type
  );

  // Build system prompt with difficulty, aircraft class, and rating
  const systemPrompt = buildSystemPrompt(task as AcsTaskRow, difficulty, config.aircraftClass, rating);

  // Record question asked in the plan
  const updatedPlan = recordQuestionAsked(examPlan, elementCode);

  return {
    elementCode,
    element,
    task: task as AcsTaskRow,
    difficulty,
    plannerState: updatedState,
    examPlan: updatedPlan,
    systemPrompt,
    depthDifficultyContract,
  };
}

// Re-export plan mutation helpers for use by route.ts
export {
  isExamComplete,
  useBonusQuestion,
  creditMentionedElements,
  canFollowUp,
  shouldAdvanceElement,
  type ExamPlanV1,
};
export { type DepthDifficultyContract } from './difficulty-contract';
