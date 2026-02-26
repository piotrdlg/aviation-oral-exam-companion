/**
 * ExamPlan — predetermined exam shape with question budgets,
 * follow-up limits, and per-element coverage tracking.
 *
 * Stored in exam_sessions.metadata.examPlan alongside plannerState + sessionConfig.
 * No schema changes required — uses existing JSONB metadata field.
 */

import type { StudyMode } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ElementCoverageStatus =
  | 'pending'
  | 'asked'
  | 'credited_by_mention'
  | 'skipped';

export interface ExamPlanV1 {
  version: 1;
  /** Target number of examiner questions (scope-sensitive) */
  planned_question_count: number;
  /** Max additional questions on unsatisfactory answers */
  bonus_question_max: number;
  /** Max follow-up probes per element before moving on */
  follow_up_max_per_element: number;
  /** Running count of questions asked */
  asked_count: number;
  /** Running count of bonus questions used */
  bonus_used: number;
  /** Study mode this plan was built for */
  mode: StudyMode;
  /** Per-element coverage status keyed by element code */
  coverage: Record<string, ElementCoverageStatus>;
  /** ISO timestamp when the plan was created */
  created_at: string;
}

// ---------------------------------------------------------------------------
// Defaults (overridable via system_config key "exam.plan_defaults")
// ---------------------------------------------------------------------------

export interface ExamPlanDefaults {
  /** Base question count for a full-scope exam */
  full_exam_question_count: number;
  /** Minimum planned questions (floor for narrow-scope exams) */
  min_question_count: number;
  /** Maximum planned questions (ceiling) */
  max_question_count: number;
  /** Bonus questions allowed on unsatisfactory answers */
  bonus_question_max: number;
  /** Max follow-up probes per element */
  follow_up_max_per_element: number;
}

export const DEFAULT_PLAN_DEFAULTS: ExamPlanDefaults = {
  full_exam_question_count: 75,
  min_question_count: 5,
  max_question_count: 120,
  bonus_question_max: 2,
  follow_up_max_per_element: 1,
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build an ExamPlanV1 from the element queue and optional admin overrides.
 *
 * planned_question_count is scope-sensitive:
 *   - Proportional to queue length vs full element count for the rating
 *   - Clamped to [min_question_count, max_question_count]
 *   - For narrow scopes (single task), uses queue length directly
 *
 * @param queue        Element codes from buildElementQueue()
 * @param mode         Study mode (linear | cross_acs | weak_areas)
 * @param totalElementsForRating  Total oral-eligible elements for this rating (used for proportional scaling)
 * @param overrides    Admin overrides from system_config "exam.plan_defaults"
 */
export function buildExamPlan(
  queue: string[],
  mode: StudyMode,
  totalElementsForRating: number,
  overrides?: Partial<ExamPlanDefaults>
): ExamPlanV1 {
  const defaults = { ...DEFAULT_PLAN_DEFAULTS, ...overrides };

  // Scope-sensitive: proportion of full exam based on queue coverage
  const ratio = totalElementsForRating > 0
    ? queue.length / totalElementsForRating
    : 1;

  let planned = Math.ceil(defaults.full_exam_question_count * ratio);

  // Clamp to configured bounds
  planned = Math.max(defaults.min_question_count, planned);
  planned = Math.min(defaults.max_question_count, planned);

  // For very narrow scope (fewer elements than planned), cap at queue length
  if (planned > queue.length) {
    planned = queue.length;
  }

  // Build initial coverage map — all elements start as pending
  const coverage: Record<string, ElementCoverageStatus> = {};
  for (const code of queue) {
    coverage[code] = 'pending';
  }

  return {
    version: 1,
    planned_question_count: planned,
    bonus_question_max: defaults.bonus_question_max,
    follow_up_max_per_element: defaults.follow_up_max_per_element,
    asked_count: 0,
    bonus_used: 0,
    mode,
    coverage,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Plan Mutation Helpers (pure functions)
// ---------------------------------------------------------------------------

/**
 * Check if the exam should stop based on the plan.
 * Complete when asked_count >= planned_question_count + bonus_used.
 */
export function isExamComplete(plan: ExamPlanV1): boolean {
  return plan.asked_count >= plan.planned_question_count + plan.bonus_used;
}

/**
 * Record that a question was asked for an element.
 * Returns updated plan (immutable).
 */
export function recordQuestionAsked(
  plan: ExamPlanV1,
  elementCode: string
): ExamPlanV1 {
  return {
    ...plan,
    asked_count: plan.asked_count + 1,
    coverage: {
      ...plan.coverage,
      [elementCode]: 'asked',
    },
  };
}

/**
 * Use a bonus question (triggered by unsatisfactory score).
 * Returns updated plan or null if bonus budget exhausted.
 */
export function useBonusQuestion(plan: ExamPlanV1): ExamPlanV1 | null {
  if (plan.bonus_used >= plan.bonus_question_max) return null;
  return {
    ...plan,
    bonus_used: plan.bonus_used + 1,
  };
}

/**
 * Credit mentioned elements that were in the plan's pending coverage.
 * These elements are marked as credited_by_mention and won't be asked.
 */
export function creditMentionedElements(
  plan: ExamPlanV1,
  mentionedCodes: string[]
): ExamPlanV1 {
  const updatedCoverage = { ...plan.coverage };
  for (const code of mentionedCodes) {
    if (updatedCoverage[code] === 'pending') {
      updatedCoverage[code] = 'credited_by_mention';
    }
  }
  return { ...plan, coverage: updatedCoverage };
}

/**
 * Check if follow-up is allowed for an element based on attempt count and plan limits.
 */
export function canFollowUp(
  plan: ExamPlanV1,
  elementCode: string,
  currentAttempts: number
): boolean {
  return currentAttempts < plan.follow_up_max_per_element + 1; // +1 because first ask is attempt 1
}
