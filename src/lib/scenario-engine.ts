/**
 * Scenario Engine core (W5.4) — design §§4-6.
 *
 * Layer 2: scenario spine — one Claude call at exam start producing a
 * structured scenario JSON, validated hard, with a template fallback so
 * exam start NEVER blocks on it.
 *
 * Layer 3: transition policy — a server-built ranked shortlist of next
 * elements; the examiner LLM picks the most natural one and bridges to it;
 * the server validates the choice and advances the planner. The LLM chooses
 * ORDER AND SEGUE only — never coverage, budgets, or grading.
 *
 * Everything here is flag-gated by exam.scenario_engine (default off).
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { SCENARIO_TEMPLATES } from './scenario-templates';
import type { AdjacencyNeighbors } from './element-adjacency';
import type { ExamPlanV1 } from './exam-plan';
import type { PlannerState } from '@/types/database';

// Lazy client — this module loads in test/route contexts where the key may
// be absent; construction only happens when a spine is actually generated.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Types (design §4)
// ---------------------------------------------------------------------------

export interface ScenarioSpine {
  scenario: {
    aircraft: string;
    mission: string;
    conditions: string;
    pilot: string;
    constraints: string[];
  };
  hooks: Array<{ element_code: string; hook: string }>;
  events: Array<{ trigger: string; event: string }>;
}

export interface ScenarioState {
  spine: ScenarioSpine;
  /** Hooks already used in transitions (lose their bonus). */
  usedHooks: string[];
  /** Event triggers already fired. */
  firedEvents: string[];
  /** 'generated' | 'template' — for telemetry. */
  source: 'generated' | 'template';
}

export interface TransitionCandidate {
  code: string;
  text: string;
  score: number;
  hook?: string;
  signals: { adjacency: number; urgency: number; weak: number; hookBonus: number };
}

// ---------------------------------------------------------------------------
// Spine validation
// ---------------------------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Hard schema validation (no zod dependency — the shape is small).
 * Returns a CLEANED spine or null. hooks with element codes outside the
 * plan are dropped (design: "drop strays").
 */
export function validateSpine(raw: unknown, planCodes: Set<string>): ScenarioSpine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sc = r.scenario as Record<string, unknown> | undefined;
  if (!sc || typeof sc !== 'object') return null;
  for (const k of ['aircraft', 'mission', 'conditions', 'pilot']) {
    if (typeof sc[k] !== 'string' || !(sc[k] as string).trim()) return null;
  }
  const constraints = isStringArray(sc.constraints) ? (sc.constraints as string[]) : [];

  const hooksRaw = Array.isArray(r.hooks) ? r.hooks : [];
  const hooks: ScenarioSpine['hooks'] = [];
  for (const h of hooksRaw) {
    if (h && typeof h === 'object'
      && typeof (h as Record<string, unknown>).element_code === 'string'
      && typeof (h as Record<string, unknown>).hook === 'string'
      && planCodes.has((h as Record<string, unknown>).element_code as string)) {
      hooks.push({ element_code: (h as { element_code: string }).element_code, hook: (h as { hook: string }).hook });
    }
  }

  const eventsRaw = Array.isArray(r.events) ? r.events : [];
  const events: ScenarioSpine['events'] = [];
  for (const e of eventsRaw) {
    if (e && typeof e === 'object'
      && typeof (e as Record<string, unknown>).trigger === 'string'
      && typeof (e as Record<string, unknown>).event === 'string') {
      events.push({ trigger: (e as { trigger: string }).trigger, event: (e as { event: string }).event });
    }
  }

  return {
    scenario: {
      aircraft: sc.aircraft as string,
      mission: sc.mission as string,
      conditions: sc.conditions as string,
      pilot: sc.pilot as string,
      constraints,
    },
    hooks,
    events: events.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Spine generation (design §4) — one Claude call, retry once, template fallback
// ---------------------------------------------------------------------------

const SPINE_SYSTEM = `You design the SCENARIO SPINE for a simulated FAA oral exam, the way a real DPE assigns a flight scenario before a checkride.

Given the rating, the planned ACS elements, and the session configuration, output ONLY a JSON object (no markdown fences, no commentary) with this exact shape:
{
  "scenario": {
    "aircraft": "specific make/model, tail number, avionics fit",
    "mission": "a concrete, realistic flight with real airports (use ICAO codes)",
    "conditions": "season, time of day, weather setup with at least one decision-relevant feature",
    "pilot": "second person — who the applicant is in this scenario",
    "constraints": ["2-3 human pressures or limitations that create realistic decision tension"]
  },
  "hooks": [ { "element_code": "<code from the provided plan>", "hook": "one concrete scenario detail that naturally opens this element" } ],
  "events": [ { "trigger": "after_area:<roman>", "event": "a plausible in-flight development" } ]
}

Rules:
- Aviation accuracy is paramount: aircraft capabilities, airspace, weather, and regulations must be plausible and internally consistent.
- The aircraft and mission must fit the RATING (private: simple single; commercial: paid/complex context; instrument: IFR mission in IMC).
- 6-8 hooks, each element_code copied EXACTLY from the provided plan list; spread across different areas; each hook ≤ 12 words.
- 1-2 events, each tied to "after_area:<roman numeral>" or "after_exchange:<number>".
- No flight beyond the aircraft's realistic capability; no invented regulations.
- Output COMPACT JSON on a single line — no pretty-printing, no trailing commentary.`;

export interface SpineGenInput {
  rating: 'private' | 'commercial' | 'instrument';
  planElements: Array<{ code: string; description: string }>;
  difficulty?: string;
  studyMode?: string;
  personaName?: string;
}

/** Deterministic template pick keyed on plan size (stable per session). */
function pickTemplate(input: SpineGenInput): ScenarioSpine {
  const templates = SCENARIO_TEMPLATES[input.rating] ?? SCENARIO_TEMPLATES.private;
  const idx = input.planElements.length % templates.length;
  const planCodes = new Set(input.planElements.map((e) => e.code));
  // Templates carry hooks for common elements; drop those outside this plan.
  const cleaned = validateSpine(templates[idx] as unknown, planCodes);
  return cleaned ?? { ...templates[idx], hooks: [] };
}

export async function generateScenarioSpine(input: SpineGenInput): Promise<ScenarioState> {
  const planCodes = new Set(input.planElements.map((e) => e.code));
  const planList = input.planElements
    .slice(0, 80) // prompt economy: 80 elements is plenty of hook surface
    .map((e) => `${e.code}: ${e.description.slice(0, 100)}`)
    .join('\n');

  const userMsg = `RATING: ${input.rating}
DIFFICULTY: ${input.difficulty ?? 'medium'}${input.personaName ? `\nEXAMINER PERSONA: ${input.personaName}` : ''}

PLANNED ELEMENTS (use these codes for hooks):
${planList}

Generate the scenario spine JSON now.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-6',
        // Gate-1 failure analysis: 1,200 was too small — the JSON truncated
        // mid-hooks on every attempt. 2,500 gives ~2x headroom over the
        // largest observed spine; the prompt now also demands compact JSON.
        max_tokens: 2500,
        system: SPINE_SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const spine = validateSpine(JSON.parse(jsonMatch[0]), planCodes);
      if (spine && spine.hooks.length >= 3) {
        return { spine, usedHooks: [], firedEvents: [], source: 'generated' };
      }
    } catch (err) {
      console.error(`[scenario] spine generation attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.warn('[scenario] falling back to template spine');
  return { spine: pickTemplate(input), usedHooks: [], firedEvents: [], source: 'template' };
}

// ---------------------------------------------------------------------------
// Prompt rendering (design §4/§5)
// ---------------------------------------------------------------------------

/**
 * The EXAM SCENARIO block — rendered INSIDE the session-static cached prompt
 * region (W5.2), so its per-exchange cost is cache-priced.
 */
export function renderScenarioBlock(spine: ScenarioSpine): string {
  const s = spine.scenario;
  return `

=== EXAM SCENARIO (the assigned flight for this oral exam) ===
AIRCRAFT: ${s.aircraft}
MISSION: ${s.mission}
CONDITIONS: ${s.conditions}
APPLICANT ROLE: ${s.pilot}
PRESSURES: ${s.constraints.join('; ')}

Anchor your questions in this scenario where natural — reference its aircraft, route, weather, and pressures instead of asking abstract questions. NEVER contradict the scenario facts above; they are fixed for the whole exam.
=== END EXAM SCENARIO ===`;
}

// ---------------------------------------------------------------------------
// Transition shortlist (design §5) — pure, server-side
// ---------------------------------------------------------------------------

export const TRANSITION_WEIGHTS = { adjacency: 0.45, urgency: 0.25, weak: 0.20, hook: 0.10 } as const;
export const SHORTLIST_SIZE = 5;

export interface ShortlistInput {
  currentElement: string | undefined;
  /** Plan-pending element codes (the only legal candidates). */
  pendingCodes: string[];
  /** code → description (one-liners for the prompt). */
  descriptions: Map<string, string>;
  adjacency: AdjacencyNeighbors;
  scenario: ScenarioState | null;
  /** Element codes the user is historically weak on. */
  weakElements: Set<string>;
  /** Per-area planned vs covered counts for urgency. */
  areaProgress: Map<string, { planned: number; covered: number }>;
}

function areaOf(code: string): string {
  const parts = code.split('.');
  return parts.length >= 2 ? parts[1] : '';
}

/**
 * Ranked 5-candidate shortlist:
 * 0.45 adjacency(current, candidate) + 0.25 coverage_urgency
 * + 0.20 weak_area_weight + 0.10 hook_bonus.
 * Pure function — fully unit-tested with fixtures.
 */
export function buildTransitionShortlist(input: ShortlistInput): TransitionCandidate[] {
  const { currentElement, pendingCodes, adjacency, scenario, weakElements, areaProgress } = input;
  if (pendingCodes.length === 0) return [];

  const neighborScores = new Map<string, number>();
  if (currentElement) {
    for (const n of adjacency.get(currentElement) ?? []) neighborScores.set(n.code, n.score);
  }

  // Coverage urgency: areas furthest BEHIND their planned share rank higher.
  let maxDeficit = 0;
  const deficits = new Map<string, number>();
  for (const [area, p] of areaProgress) {
    const deficit = Math.max(0, p.planned - p.covered);
    deficits.set(area, deficit);
    if (deficit > maxDeficit) maxDeficit = deficit;
  }

  const unusedHooks = new Map<string, string>();
  for (const h of scenario?.spine.hooks ?? []) {
    if (!scenario?.usedHooks.includes(h.element_code)) unusedHooks.set(h.element_code, h.hook);
  }

  const candidates: TransitionCandidate[] = pendingCodes.map((code) => {
    const adjacencyScore = neighborScores.get(code) ?? 0;
    const urgency = maxDeficit > 0 ? (deficits.get(areaOf(code)) ?? 0) / maxDeficit : 0;
    const weak = weakElements.has(code) ? 1 : 0;
    const hookBonus = unusedHooks.has(code) ? 1 : 0;
    const score =
      TRANSITION_WEIGHTS.adjacency * adjacencyScore +
      TRANSITION_WEIGHTS.urgency * urgency +
      TRANSITION_WEIGHTS.weak * weak +
      TRANSITION_WEIGHTS.hook * hookBonus;
    return {
      code,
      text: (input.descriptions.get(code) ?? '').slice(0, 80),
      score: Math.round(score * 10_000) / 10_000,
      hook: unusedHooks.get(code),
      signals: { adjacency: adjacencyScore, urgency, weak, hookBonus },
    };
  });

  return candidates
    .sort((a, b) => b.score - a.score || (a.code < b.code ? -1 : 1))
    .slice(0, SHORTLIST_SIZE);
}

// ---------------------------------------------------------------------------
// Transition addendum (design §5.2) — ≤ 500 tokens, asserted
// ---------------------------------------------------------------------------

export const TRANSITION_ADDENDUM_MAX_TOKENS = 500;

export function buildTransitionAddendum(
  shortlist: TransitionCandidate[],
  pendingEvent?: string
): string {
  const lines = shortlist.map(
    (c) => `- ${c.code} — ${c.text}${c.hook ? ` — scenario hook: ${c.hook.slice(0, 90)}` : ''}`
  );
  const eventLine = pendingEvent
    ? `\nSCENARIO EVENT: ${pendingEvent.slice(0, 150)} Work this development into your next question naturally.\n`
    : '';
  let addendum = `

TRANSITION NOW. Candidate next topics (server-selected; you MUST pick one):
${lines.join('\n')}
${eventLine}
Choose the candidate that connects most naturally to the student's last answer or to the scenario. Bridge to it explicitly in one sentence — reference what they said or the scenario, never announce "moving to Area X". Then ask your first question on it.
START your reply with the tag <next_element>CODE</next_element> on its own line (it is stripped before the student sees your reply), then the bridge and question.`;

  // Budget guard (design §6): ≈4 chars/token; truncate candidate lines first.
  if (addendum.length > TRANSITION_ADDENDUM_MAX_TOKENS * 4) {
    const shortLines = shortlist.map((c) => `- ${c.code} — ${c.text.slice(0, 50)}`);
    addendum = addendum.replace(lines.join('\n'), shortLines.join('\n'));
  }
  return addendum;
}

// ---------------------------------------------------------------------------
// Choice parsing (design §5.3)
// ---------------------------------------------------------------------------

const NEXT_ELEMENT_RE = /<next_element>\s*([A-Z]{2}\.[IVXLC]+\.[A-Za-z]+\.[KRS]\d+)\s*<\/next_element>/;

/**
 * Extract the examiner's <next_element> choice and strip the tag from the
 * user-visible/TTS text. Garbage-tolerant: missing/malformed tag → null code,
 * text returned as-is.
 */
export function parseTransitionChoice(examinerText: string): { code: string | null; cleanText: string } {
  const m = examinerText.match(NEXT_ELEMENT_RE);
  if (!m) return { code: null, cleanText: examinerText };
  const cleanText = examinerText.replace(NEXT_ELEMENT_RE, '').replace(/^\s+/, '');
  return { code: m[1], cleanText };
}

// ---------------------------------------------------------------------------
// Events (design §5.4)
// ---------------------------------------------------------------------------

/**
 * Returns the first unfired event whose trigger matches the current state.
 * Triggers: "after_area:<roman>" (area fully covered) or "after_exchange:<n>".
 */
export function matchPendingEvent(
  scenario: ScenarioState,
  completedAreas: Set<string>,
  exchangeCount: number
): { trigger: string; event: string } | null {
  for (const e of scenario.spine.events) {
    if (scenario.firedEvents.includes(e.trigger)) continue;
    const [kind, arg] = e.trigger.split(':');
    if (kind === 'after_area' && arg && completedAreas.has(arg.replace(/^[A-Z]{2}\./, ''))) return e;
    if (kind === 'after_exchange' && arg && exchangeCount >= parseInt(arg, 10)) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plan-derived helpers for the route
// ---------------------------------------------------------------------------

/** Pending (not yet covered/credited) element codes from the plan. */
export function pendingPlanCodes(examPlan: ExamPlanV1, plannerState: PlannerState): string[] {
  const recent = new Set(plannerState.recent ?? []);
  return Object.entries(examPlan.coverage ?? {})
    .filter(([code, status]) => status === 'pending' && !recent.has(code))
    .map(([code]) => code);
}

/** Per-area planned/covered counts for the urgency signal. */
export function areaProgressFromPlan(examPlan: ExamPlanV1): Map<string, { planned: number; covered: number }> {
  const m = new Map<string, { planned: number; covered: number }>();
  for (const [code, status] of Object.entries(examPlan.coverage ?? {})) {
    const area = areaOf(code);
    const entry = m.get(area) ?? { planned: 0, covered: 0 };
    entry.planned++;
    if (status !== 'pending') entry.covered++;
    m.set(area, entry);
  }
  return m;
}

/** Areas with zero pending elements (for after_area event triggers). */
export function completedAreas(examPlan: ExamPlanV1): Set<string> {
  const done = new Set<string>();
  for (const [area, p] of areaProgressFromPlan(examPlan)) {
    if (p.covered >= p.planned && p.planned > 0) done.add(area);
  }
  return done;
}
