/**
 * Stateful planner wrapper — loads config from DB, drives element queue,
 * persists planner state. Bridges pure functions in exam-logic.ts with Supabase.
 *
 * Phase 4: Integrates ExamPlanV1 for predetermined exam shape —
 * planned question count, bonus questions, follow-up limits, mention credit.
 */

import { createClient } from '@supabase/supabase-js';
import type { AcsElement as AcsElementDB, ElementScore, PlannerState, SessionConfig, Difficulty } from '@/types/database';
import { buildElementQueue, pickNextElement, initPlannerState, buildSystemPrompt, type AcsTaskRow, type TaxonomyFingerprints } from './exam-logic';
import {
  buildExamPlan,
  isExamComplete,
  recordQuestionAsked,
  useBonusQuestion,
  creditMentionedElements,
  canFollowUp,
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

export interface PlannerResult {
  elementCode: string;
  element: AcsElementDB;
  task: AcsTaskRow;
  difficulty: Difficulty;
  plannerState: PlannerState;
  examPlan: ExamPlanV1;
  systemPrompt: string;
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
 */
async function countTotalOralElements(rating: string): Promise<number> {
  const prefix = RATING_PREFIX[rating] || 'PA.';
  const { count } = await supabase
    .from('acs_elements')
    .select('*', { count: 'exact', head: true })
    .like('code', `${prefix}%`)
    .neq('element_type', 'skill');
  return count || 0;
}

/**
 * Load taxonomy fingerprints for ACS elements.
 * Path: acs_element.code → concepts.slug (acs:element:CODE) → concept_chunk_evidence → source_chunks → kb_chunk_taxonomy → kb_taxonomy_nodes.slug
 *
 * For efficiency, uses a single RPC-like join query:
 *   acs_elements → concepts (via matching slug pattern) → evidence → chunk taxonomy
 * Falls back gracefully to empty map if graph data unavailable.
 */
async function loadTaxonomyFingerprints(
  elementCodes: string[]
): Promise<TaxonomyFingerprints> {
  const fingerprints: TaxonomyFingerprints = new Map();
  if (elementCodes.length === 0) return fingerprints;

  try {
    // Build a map of element_code → concept_id by matching ACS element concepts
    // ACS element concepts have slugs like "acs:element:pa-i-a-k1" (lowercase, hyphenated)
    const slugPatterns = elementCodes.map(code =>
      `acs:element:${code.toLowerCase().replace(/\./g, '-')}`
    );

    // Batch fetch: concept IDs for these slugs
    const { data: concepts } = await supabase
      .from('concepts')
      .select('id, slug')
      .in('slug', slugPatterns);

    if (!concepts || concepts.length === 0) return fingerprints;

    const slugToCode = new Map<string, string>();
    for (const code of elementCodes) {
      const slug = `acs:element:${code.toLowerCase().replace(/\./g, '-')}`;
      slugToCode.set(slug, code);
    }

    const conceptIdToCode = new Map<string, string>();
    for (const c of concepts) {
      const code = slugToCode.get(c.slug);
      if (code) conceptIdToCode.set(c.id, code);
    }

    if (conceptIdToCode.size === 0) return fingerprints;

    // Fetch evidence chunk IDs for these concepts
    const conceptIds = [...conceptIdToCode.keys()];
    const { data: evidence } = await supabase
      .from('concept_chunk_evidence')
      .select('concept_id, chunk_id')
      .in('concept_id', conceptIds);

    if (!evidence || evidence.length === 0) return fingerprints;

    // Build concept → chunk_ids map
    const conceptChunks = new Map<string, string[]>();
    for (const ev of evidence) {
      const chunks = conceptChunks.get(ev.concept_id) || [];
      chunks.push(ev.chunk_id);
      conceptChunks.set(ev.concept_id, chunks);
    }

    // Fetch taxonomy assignments for these chunks
    const allChunkIds = [...new Set(evidence.map(e => e.chunk_id))];
    // Supabase has a query limit, so batch if needed
    const taxonomyMap = new Map<string, string>();
    for (let i = 0; i < allChunkIds.length; i += 500) {
      const batch = allChunkIds.slice(i, i + 500);
      const { data: taxRows } = await supabase
        .from('kb_chunk_taxonomy')
        .select('chunk_id, taxonomy_node_id')
        .in('chunk_id', batch);

      if (taxRows) {
        for (const row of taxRows) {
          taxonomyMap.set(row.chunk_id, row.taxonomy_node_id);
        }
      }
    }

    // Fetch taxonomy node slugs
    const taxNodeIds = [...new Set(taxonomyMap.values())];
    const taxSlugMap = new Map<string, string>();
    if (taxNodeIds.length > 0) {
      for (let i = 0; i < taxNodeIds.length; i += 500) {
        const batch = taxNodeIds.slice(i, i + 500);
        const { data: nodes } = await supabase
          .from('kb_taxonomy_nodes')
          .select('id, slug')
          .in('id', batch);

        if (nodes) {
          for (const node of nodes) {
            taxSlugMap.set(node.id, node.slug);
          }
        }
      }
    }

    // Build final fingerprints: element_code → Set<taxonomy_slug>
    for (const [conceptId, code] of conceptIdToCode) {
      const chunkIds = conceptChunks.get(conceptId) || [];
      const slugs = new Set<string>();
      for (const chunkId of chunkIds) {
        const taxNodeId = taxonomyMap.get(chunkId);
        if (taxNodeId) {
          const taxSlug = taxSlugMap.get(taxNodeId);
          if (taxSlug && !taxSlug.includes('triage-unclassified')) {
            slugs.add(taxSlug);
          }
        }
      }
      if (slugs.size > 0) {
        fingerprints.set(code, slugs);
      }
    }
  } catch (err) {
    console.error('Taxonomy fingerprint loading failed (non-critical):', err instanceof Error ? err.message : err);
  }

  return fingerprints;
}

/**
 * Initialize a planner for a new session: load elements, build queue, pick first element.
 * Now also builds an ExamPlanV1 with scope-sensitive question count.
 */
export async function initPlanner(
  config: SessionConfig,
  userId: string
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
  if (config.studyMode === 'cross_acs') {
    const elementCodes = filteredElements
      .filter(el => el.element_type !== 'skill')
      .map(el => el.code);
    taxonomyFingerprints = await loadTaxonomyFingerprints(elementCodes);
  }

  // Build queue using pure function
  const queue = buildElementQueue(filteredElements, config, weakStats, taxonomyFingerprints);

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

  // Build system prompt with difficulty, aircraft class, and rating
  const systemPrompt = buildSystemPrompt(task as AcsTaskRow, difficulty, config.aircraftClass, config.rating || 'private');

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
  };
}

// Re-export plan mutation helpers for use by route.ts
export {
  isExamComplete,
  useBonusQuestion,
  creditMentionedElements,
  canFollowUp,
  type ExamPlanV1,
};
