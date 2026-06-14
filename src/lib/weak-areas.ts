/**
 * Weak-area classification — the single source of truth for "which ACS tasks
 * are weak / unpracticed", shared by the Progress Weak Areas panel and the
 * practice Focus pre-fill so they never drift apart. Pure, zero-dependency
 * (only the oral-area constant), fully unit-testable.
 */
import type { ElementScore, Rating } from '@/types/database';
import { ORAL_EXAM_AREA_PREFIXES } from './exam-logic';

export type StudyMode = 'linear' | 'cross_acs' | 'weak_areas' | 'quick_drill' | 'scenario';
export type WeaknessSeverity = 'critical' | 'moderate';

/**
 * Canonical per-element weakness classifier — mirrors the Progress "Weak Areas"
 * panel (`WeakAreas.tsx`). Never-attempted elements (`total_attempts === 0`)
 * are NOT weak (they're "unpracticed", handled separately).
 *   - latest `unsatisfactory`, or unsatisfactory-rate ≥ 0.5 → 'critical'
 *   - latest `partial`, or partial-rate ≥ 0.5             → 'moderate'
 *   - otherwise                                            → null (not weak)
 */
export function weaknessSeverity(score: ElementScore): WeaknessSeverity | null {
  if (score.total_attempts === 0) return null;
  const unsatRate = score.unsatisfactory_count / score.total_attempts;
  const partialRate = score.partial_count / score.total_attempts;
  if (score.latest_score === 'unsatisfactory' || unsatRate >= 0.5) return 'critical';
  if (score.latest_score === 'partial' || partialRate >= 0.5) return 'moderate';
  return null;
}

/** Distinct task IDs (e.g. "PA.I.B") that contain at least one weak element. */
export function weakTaskIds(scores: ElementScore[]): string[] {
  const ids = new Set<string>();
  for (const s of scores) {
    if (weaknessSeverity(s) !== null) ids.add(s.task_id);
  }
  return [...ids];
}

/**
 * Task IDs from `allTaskIds` the user has never attempted (no scored element).
 * A task is "touched" once any of its elements has > 0 attempts.
 */
export function untouchedTaskIds(allTaskIds: string[], scores: ElementScore[]): string[] {
  const attempted = new Set<string>();
  for (const s of scores) {
    if (s.total_attempts > 0) attempted.add(s.task_id);
  }
  return allTaskIds.filter((id) => !attempted.has(id));
}

/** True if a task ID belongs to an oral-exam area for the rating. */
export function isOralTaskId(taskId: string, rating: Rating): boolean {
  const prefixes = ORAL_EXAM_AREA_PREFIXES[rating] || ORAL_EXAM_AREA_PREFIXES.private;
  return prefixes.some((p) => taskId.startsWith(p));
}

/** Keep only oral-exam task IDs for the rating (drops flight-only areas IV/V/X…). */
export function oralTaskIds(taskIds: string[], rating: Rating): string[] {
  return taskIds.filter((id) => isOralTaskId(id, rating));
}

/**
 * The task IDs to PRE-CHECK in the Focus picker for a given study mode. The
 * mode is a macro that fills the (editable) scope:
 *   - weak_areas  → struggled tasks only
 *   - quick_drill → struggled ∪ never-practiced (untouched)
 *   - linear / cross_acs / scenario → the full (already oral-filtered) set
 *
 * `allOralTaskIds` MUST already be filtered to oral areas + aircraft class
 * (pass the picker's task list). Returned IDs are always a subset of it.
 */
export function focusTasksForMode(
  mode: StudyMode,
  allOralTaskIds: string[],
  scores: ElementScore[]
): string[] {
  const oralSet = new Set(allOralTaskIds);
  switch (mode) {
    case 'weak_areas':
      return weakTaskIds(scores).filter((id) => oralSet.has(id));
    case 'quick_drill': {
      const weak = weakTaskIds(scores).filter((id) => oralSet.has(id));
      const untouched = untouchedTaskIds(allOralTaskIds, scores);
      // Preserve allOralTaskIds order for a stable, predictable pre-fill.
      const want = new Set([...weak, ...untouched]);
      return allOralTaskIds.filter((id) => want.has(id));
    }
    case 'linear':
    case 'cross_acs':
    case 'scenario':
    default:
      return [...allOralTaskIds];
  }
}
