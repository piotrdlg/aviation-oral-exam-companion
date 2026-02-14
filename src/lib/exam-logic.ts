/**
 * Pure logic for ACS task filtering — no external dependencies.
 * Separated from exam-engine.ts for testability.
 */

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
}

// Oral-exam-relevant areas (exclude flight maneuvers that are skill-only)
export const ORAL_EXAM_AREAS = [
  'PA.I.%',   // Preflight Preparation
  'PA.II.%',  // Preflight Procedures
  'PA.III.%', // Airport and Seaplane Base Operations
  'PA.VI.%',  // Navigation
  'PA.VII.%', // Slow Flight and Stalls (knowledge/risk only)
  'PA.VIII.%',// Basic Instrument Maneuvers (knowledge/risk only)
  'PA.IX.%',  // Emergency Operations
  'PA.XI.%',  // Night Operations
  'PA.XII.%', // Postflight Procedures
];

/**
 * Filter tasks to oral-exam-relevant areas, excluding covered tasks.
 */
export function filterEligibleTasks(
  tasks: AcsTaskRow[],
  coveredTaskIds: string[] = []
): AcsTaskRow[] {
  return tasks.filter((t) => {
    if (coveredTaskIds.includes(t.id)) return false;
    return ORAL_EXAM_AREAS.some((pattern) => {
      const prefix = pattern.replace('%', '');
      return t.id.startsWith(prefix);
    });
  });
}

/**
 * Select a random task from a list, with fallback logic.
 * If all eligible tasks are covered, picks from remaining non-covered tasks.
 * If all tasks are covered, returns the first task.
 */
export function selectRandomTask(
  allTasks: AcsTaskRow[],
  coveredTaskIds: string[] = []
): AcsTaskRow | null {
  if (allTasks.length === 0) return null;

  const eligible = filterEligibleTasks(allTasks, coveredTaskIds);

  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  // Fallback: pick from any non-covered task
  const remaining = allTasks.filter((t) => !coveredTaskIds.includes(t.id));
  if (remaining.length === 0) return allTasks[0];
  return remaining[Math.floor(Math.random() * remaining.length)];
}

/**
 * Build the DPE examiner system prompt for a given task.
 */
export function buildSystemPrompt(task: AcsTaskRow): string {
  const knowledgeList = task.knowledge_elements
    .map((e) => `  - ${e.code}: ${e.description}`)
    .join('\n');
  const riskList = task.risk_management_elements
    .map((e) => `  - ${e.code}: ${e.description}`)
    .join('\n');

  return `You are a Designated Pilot Examiner (DPE) conducting an FAA Private Pilot oral examination. You are professional, thorough, and encouraging — firm but fair.

CURRENT ACS TASK: ${task.area} > ${task.task} (${task.id})

KNOWLEDGE ELEMENTS TO COVER:
${knowledgeList}

RISK MANAGEMENT ELEMENTS TO COVER:
${riskList}

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
