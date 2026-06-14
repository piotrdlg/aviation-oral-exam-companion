/**
 * Open-exam summary helpers — turn a resumable exam_session row into the
 * differentiating display data shown on the practice "Continue previous exam"
 * card and the "Open exams" modal. Pure, zero-dependency, fully unit-testable.
 *
 * Users always practice the same rating/class, so rating+date carry no signal.
 * What actually distinguishes one open exam from another is the ACS *areas* it
 * covers (or, before it's started, its planned scope) — so that's what we lead
 * with, expandable to the individual tasks and their pass/partial/fail status.
 */

/**
 * ACS area-prefix → human area name, for all three ratings. Sourced from the
 * seed migrations (`acs_tasks.area`, the authoritative names) — keep in sync if
 * the ACS area titles ever change. Keyed by the full prefix (incl. rating) so a
 * mixed-rating open-exams list resolves names without any per-row fetch.
 */
export const ACS_AREA_NAMES: Record<string, string> = {
  // Private Pilot (FAA-S-ACS-6C)
  'PA.I.': 'Preflight Preparation',
  'PA.II.': 'Preflight Procedures',
  'PA.III.': 'Airport and Seaplane Base Operations',
  'PA.IV.': 'Takeoffs, Landings, and Go-Arounds',
  'PA.V.': 'Performance Maneuvers and Ground Reference Maneuvers',
  'PA.VI.': 'Navigation',
  'PA.VII.': 'Slow Flight and Stalls',
  'PA.VIII.': 'Basic Instrument Maneuvers',
  'PA.IX.': 'Emergency Operations',
  'PA.X.': 'Multiengine Operations',
  'PA.XI.': 'Night Operations',
  'PA.XII.': 'Postflight Procedures',
  // Commercial Pilot (FAA-S-ACS-7B)
  'CA.I.': 'Preflight Preparation',
  'CA.II.': 'Preflight Procedures',
  'CA.III.': 'Airport and Seaplane Base Operations',
  'CA.IV.': 'Takeoffs, Landings, and Go-Arounds',
  'CA.V.': 'Performance Maneuvers and Ground Reference Maneuvers',
  'CA.VI.': 'Navigation',
  'CA.VII.': 'Slow Flight and Stalls',
  'CA.VIII.': 'High-Altitude Operations',
  'CA.IX.': 'Emergency Operations',
  'CA.X.': 'Multiengine Operations',
  'CA.XI.': 'Postflight Procedures',
  // Instrument Rating (FAA-S-ACS-8C)
  'IR.I.': 'Preflight Preparation',
  'IR.II.': 'Preflight Procedures',
  'IR.III.': 'Air Traffic Control (ATC) Clearances and Procedures',
  'IR.IV.': 'Flight by Reference to Instruments',
  'IR.V.': 'Navigation Systems',
  'IR.VI.': 'Instrument Approach Procedures',
  'IR.VII.': 'Emergency Operations',
  'IR.VIII.': 'Postflight Procedures',
};

/** Human label for each study mode. Complete map (the old inline ternary fell
 *  through to "Weak Areas" for quick_drill/scenario — this fixes that). */
const STUDY_MODE_LABELS: Record<string, string> = {
  linear: 'Area by Area',
  cross_acs: 'Across ACS',
  weak_areas: 'Weak Areas',
  quick_drill: 'Quick Drill',
  scenario: 'Mock Checkride',
};

export function studyModeLabel(mode: string | null | undefined): string {
  return (mode && STUDY_MODE_LABELS[mode]) || 'Area by Area';
}

/** `'PA.I.B'` → `'PA.I.'`; tolerant of an already-area id (`'PA.I.'`/`'PA.I'`). */
export function areaIdFromTaskId(taskId: string): string {
  const parts = (taskId ?? '').split('.');
  if (parts.length >= 2 && parts[0] && parts[1]) return `${parts[0]}.${parts[1]}.`;
  return taskId ?? '';
}

/** Human area name for a task or area id; falls back to the raw area id. */
export function areaNameFromTaskId(taskId: string): string {
  const id = areaIdFromTaskId(taskId);
  return ACS_AREA_NAMES[id] ?? id;
}

/** Comma-join area names, collapsing the tail to "+N" past `max`. */
export function joinAreas(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}

/** Rating → ACS task-id prefix (the rating segment of every task/area id). */
const RATING_PREFIX: Record<string, string> = {
  private: 'PA',
  commercial: 'CA',
  instrument: 'IR',
  atp: 'AT',
};

/**
 * Human area name for a stored scope entry. `selected_areas` stores BARE Roman
 * numerals ('VIII') without the rating segment, so a bare numeral needs the
 * session rating to form the full prefix ('IR.VIII.'). Already-qualified ids
 * ('IR.VIII.', 'IR.VIII.A') resolve directly. Falls back to the raw value.
 */
export function scopeAreaName(rawArea: string, rating?: string | null): string {
  if (!rawArea) return rawArea;
  if (rawArea.includes('.')) return areaNameFromTaskId(rawArea);
  const prefix = (rating && RATING_PREFIX[rating]) || '';
  if (prefix) return ACS_AREA_NAMES[`${prefix}.${rawArea}.`] ?? rawArea;
  return rawArea;
}

export interface CoveredTask {
  task_id: string;
  status: string;
}

export interface CoveredArea {
  areaId: string;
  areaName: string;
  tasks: CoveredTask[];
}

/** Minimal shape of a resumable session this module needs (decoupled from the
 *  page's full state type). */
export interface ExamSummaryInput {
  rating?: string | null;
  exchange_count?: number | null;
  selected_areas?: string[] | null;
  selected_tasks?: string[] | null;
  acs_tasks_covered?: { task_id: string; status?: string | null; attempts?: number }[] | null;
}

export interface ExamSummary {
  /** ACS areas the exam has actually touched, grouped + deduped in first-seen
   *  order. Empty for a not-yet-started exam. */
  coveredAreas: CoveredArea[];
  /** Planned scope as area names (from `selected_areas`), or `['All areas']`
   *  when nothing specific was selected. Used when `coveredAreas` is empty. */
  scopeAreaNames: string[];
}

/**
 * Derive the area differentiation for one open exam. Started exams surface what
 * they've covered (with per-task status); not-yet-started exams surface their
 * planned scope so they're still distinguishable from one another.
 */
export function summarizeExam(session: ExamSummaryInput): ExamSummary {
  const byArea = new Map<string, CoveredArea>();
  for (const t of session.acs_tasks_covered ?? []) {
    if (!t?.task_id) continue;
    const areaId = areaIdFromTaskId(t.task_id);
    let entry = byArea.get(areaId);
    if (!entry) {
      entry = { areaId, areaName: areaNameFromTaskId(t.task_id), tasks: [] };
      byArea.set(areaId, entry);
    }
    entry.tasks.push({ task_id: t.task_id, status: t.status || 'unknown' });
  }

  const selected = (session.selected_areas ?? []).filter(Boolean);
  const scopeAreaNames = selected.length > 0
    ? selected.map((a) => scopeAreaName(a, session.rating))
    : ['All areas'];

  return { coveredAreas: [...byArea.values()], scopeAreaNames };
}
