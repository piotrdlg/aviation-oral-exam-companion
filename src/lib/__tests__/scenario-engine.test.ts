import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  create: vi.fn(),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.create };
  },
}));

import {
  validateSpine,
  generateScenarioSpine,
  buildTransitionShortlist,
  buildTransitionAddendum,
  parseTransitionChoice,
  matchPendingEvent,
  pendingPlanCodes,
  areaProgressFromPlan,
  renderScenarioBlock,
  TRANSITION_ADDENDUM_MAX_TOKENS,
  type ScenarioState,
} from '../scenario-engine';
import type { ExamPlanV1 } from '../exam-plan';
import type { PlannerState } from '@/types/database';

const VALID_SPINE = {
  scenario: {
    aircraft: 'Cessna 172S, N735KT',
    mission: 'KCRG to KOCF day VFR',
    conditions: 'July afternoon, buildups west',
    pilot: 'You, a private pilot applicant',
    constraints: ['friend gets airsick', 'back by 6pm'],
  },
  hooks: [
    { element_code: 'PA.I.A.K1', hook: 'carrying your friend legally' },
    { element_code: 'PA.II.A.K1', hook: 'the buildups west' },
    { element_code: 'PA.IX.A.K1', hook: 'engine failure over the pines' },
    { element_code: 'ZZ.NOT.IN.PLAN', hook: 'stray hook' },
  ],
  events: [{ trigger: 'after_area:II', event: 'alternator light flickers' }],
};
const PLAN_CODES = new Set(['PA.I.A.K1', 'PA.II.A.K1', 'PA.IX.A.K1', 'PA.I.A.K2']);

beforeEach(() => h.create.mockReset());

describe('validateSpine', () => {
  it('accepts a valid spine and drops stray hooks', () => {
    const spine = validateSpine(VALID_SPINE, PLAN_CODES);
    expect(spine).not.toBeNull();
    expect(spine!.hooks.map((x) => x.element_code)).toEqual(['PA.I.A.K1', 'PA.II.A.K1', 'PA.IX.A.K1']);
    expect(spine!.events).toHaveLength(1);
  });

  it('rejects missing scenario fields', () => {
    expect(validateSpine({ scenario: { aircraft: 'C172' } }, PLAN_CODES)).toBeNull();
    expect(validateSpine('garbage', PLAN_CODES)).toBeNull();
    expect(validateSpine(null, PLAN_CODES)).toBeNull();
  });
});

describe('generateScenarioSpine (retry + template fallback)', () => {
  const input = {
    rating: 'private' as const,
    planElements: [...PLAN_CODES].map((code) => ({ code, description: 'desc' })),
  };

  it('returns a generated spine on the first valid response', async () => {
    h.create.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(VALID_SPINE) }] });
    const state = await generateScenarioSpine(input);
    expect(state.source).toBe('generated');
    expect(state.spine.scenario.aircraft).toContain('N735KT');
    expect(state.usedHooks).toEqual([]);
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it('retries once on invalid JSON, then falls back to a template', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'text', text: 'not json at all' }] });
    const state = await generateScenarioSpine(input);
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(state.source).toBe('template');
    // template spines are complete scenarios
    expect(state.spine.scenario.aircraft.length).toBeGreaterThan(5);
  });

  it('falls back to a template when the API throws twice', async () => {
    // vitest 4.0.18 quirk: a PERSISTENT rejecting mockImplementation left on
    // a hoisted mock at teardown falsely fails the test (even fully awaited;
    // minimally reproduced outside this module). Self-consuming Once-chains
    // avoid it; the behavior under test is identical.
    h.create
      .mockImplementationOnce(async () => { throw new Error('api down'); })
      .mockImplementationOnce(async () => { throw new Error('api down'); });
    const state = await generateScenarioSpine(input);
    expect(state.source).toBe('template');
    expect(h.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Shortlist ranking
// ---------------------------------------------------------------------------

function scenarioState(overrides?: Partial<ScenarioState>): ScenarioState {
  return {
    spine: validateSpine(VALID_SPINE, PLAN_CODES)!,
    usedHooks: [],
    firedEvents: [],
    source: 'generated',
    ...overrides,
  };
}

describe('buildTransitionShortlist (0.45/0.25/0.20/0.10)', () => {
  const base = {
    currentElement: 'PA.I.A.K1',
    descriptions: new Map([
      ['PA.I.A.K2', 'Currency requirements'],
      ['PA.II.A.K1', 'Weather information'],
      ['PA.IX.A.K1', 'Emergency descent'],
    ]),
    adjacency: new Map([
      ['PA.I.A.K1', [
        { code: 'PA.I.A.K2', score: 0.9 },
        { code: 'PA.II.A.K1', score: 0.5 },
      ]],
    ]),
    scenario: null as ScenarioState | null,
    weakElements: new Set<string>(),
    areaProgress: new Map([
      ['I', { planned: 2, covered: 1 }],
      ['II', { planned: 1, covered: 0 }],
      ['IX', { planned: 1, covered: 0 }],
    ]),
  };

  it('ranks by adjacency when other signals are flat', () => {
    const sl = buildTransitionShortlist({ ...base, pendingCodes: ['PA.I.A.K2', 'PA.II.A.K1'] });
    expect(sl[0].code).toBe('PA.I.A.K2'); // 0.45×0.9 beats 0.45×0.5 (+urgency diff)
    expect(sl).toHaveLength(2);
  });

  it('urgency raises underrepresented areas', () => {
    // No adjacency at all: urgency dominates. Area II/IX deficit 1 vs I deficit 1 — equalize
    const sl = buildTransitionShortlist({
      ...base,
      adjacency: new Map(),
      pendingCodes: ['PA.I.A.K2', 'PA.II.A.K1'],
      areaProgress: new Map([
        ['I', { planned: 5, covered: 5 }],   // done — deficit 0
        ['II', { planned: 4, covered: 0 }],  // way behind
      ]),
    });
    expect(sl[0].code).toBe('PA.II.A.K1');
    expect(sl[0].signals.urgency).toBe(1);
  });

  it('weak elements get the 0.20 boost', () => {
    const sl = buildTransitionShortlist({
      ...base,
      adjacency: new Map(),
      weakElements: new Set(['PA.IX.A.K1']),
      pendingCodes: ['PA.I.A.K2', 'PA.IX.A.K1'],
      areaProgress: new Map(),
    });
    expect(sl[0].code).toBe('PA.IX.A.K1');
    expect(sl[0].signals.weak).toBe(1);
  });

  it('unused hooks add the bonus; used hooks lose it', () => {
    const withHook = buildTransitionShortlist({
      ...base,
      adjacency: new Map(),
      scenario: scenarioState(),
      pendingCodes: ['PA.I.A.K2', 'PA.II.A.K1'],
      areaProgress: new Map(),
    });
    expect(withHook[0].code).toBe('PA.II.A.K1'); // has an unused hook
    expect(withHook[0].hook).toContain('buildups');

    const used = buildTransitionShortlist({
      ...base,
      adjacency: new Map(),
      scenario: scenarioState({ usedHooks: ['PA.II.A.K1'] }),
      pendingCodes: ['PA.I.A.K2', 'PA.II.A.K1'],
      areaProgress: new Map(),
    });
    expect(used.find((c) => c.code === 'PA.II.A.K1')?.signals.hookBonus).toBe(0);
  });

  it('only pending codes are candidates and the list caps at 5', () => {
    const many = Array.from({ length: 9 }, (_, i) => `PA.II.A.K${i}`);
    const sl = buildTransitionShortlist({ ...base, pendingCodes: many });
    expect(sl).toHaveLength(5);
    for (const c of sl) expect(many).toContain(c.code);
  });
});

describe('buildTransitionAddendum', () => {
  it('stays within the 500-token budget even with long inputs', () => {
    const shortlist = Array.from({ length: 5 }, (_, i) => ({
      code: `PA.II.A.K${i}`,
      text: 'A very long element description that goes on and on '.repeat(4),
      score: 0.5,
      hook: 'an extremely detailed scenario hook with lots of words in it '.repeat(3),
      signals: { adjacency: 0, urgency: 0, weak: 0, hookBonus: 1 },
    }));
    const addendum = buildTransitionAddendum(shortlist, 'a long event '.repeat(20));
    expect(addendum.length).toBeLessThanOrEqual(TRANSITION_ADDENDUM_MAX_TOKENS * 4);
    expect(addendum).toContain('<next_element>');
  });

  it('includes the pending event instruction', () => {
    const addendum = buildTransitionAddendum(
      [{ code: 'PA.I.A.K1', text: 'x', score: 1, signals: { adjacency: 0, urgency: 0, weak: 0, hookBonus: 0 } }],
      'alternator light flickers'
    );
    expect(addendum).toContain('SCENARIO EVENT: alternator light flickers');
  });
});

describe('parseTransitionChoice', () => {
  it('extracts and strips a valid tag', () => {
    const { code, cleanText } = parseTransitionChoice(
      '<next_element>PA.II.A.K1</next_element>\nSpeaking of those buildups — what would you check?'
    );
    expect(code).toBe('PA.II.A.K1');
    expect(cleanText).toBe('Speaking of those buildups — what would you check?');
  });

  it('returns null code when the tag is absent', () => {
    const { code, cleanText } = parseTransitionChoice('Just a normal reply.');
    expect(code).toBeNull();
    expect(cleanText).toBe('Just a normal reply.');
  });

  it('tolerates garbage tags', () => {
    const { code, cleanText } = parseTransitionChoice('<next_element>NOT-A-CODE</next_element> hi');
    expect(code).toBeNull();
    expect(cleanText).toContain('hi');
  });
});

describe('matchPendingEvent', () => {
  it('fires after_area when the area completes, once', () => {
    const st = scenarioState();
    expect(matchPendingEvent(st, new Set(['II']), 3)?.event).toContain('alternator');
    expect(matchPendingEvent(scenarioState({ firedEvents: ['after_area:II'] }), new Set(['II']), 3)).toBeNull();
  });

  it('fires after_exchange at the count', () => {
    const st = scenarioState();
    st.spine.events = [{ trigger: 'after_exchange:10', event: 'GTN goes dark' }];
    expect(matchPendingEvent(st, new Set(), 9)).toBeNull();
    expect(matchPendingEvent(st, new Set(), 10)?.event).toContain('GTN');
  });
});

describe('plan helpers', () => {
  const plan = {
    coverage: {
      'PA.I.A.K1': 'covered',
      'PA.I.A.K2': 'pending',
      'PA.II.A.K1': 'pending',
      'PA.II.A.K2': 'credited_by_mention',
    },
  } as unknown as ExamPlanV1;
  const planner = { recent: ['PA.I.A.K1'], queue: [], cursor: 0, attempts: {}, version: 1 } as unknown as PlannerState;

  it('pendingPlanCodes excludes covered/credited/recent', () => {
    expect(pendingPlanCodes(plan, planner).sort()).toEqual(['PA.I.A.K2', 'PA.II.A.K1']);
  });

  it('areaProgressFromPlan counts planned vs covered per area', () => {
    const m = areaProgressFromPlan(plan);
    expect(m.get('I')).toEqual({ planned: 2, covered: 1 });
    expect(m.get('II')).toEqual({ planned: 2, covered: 1 });
  });
});

describe('renderScenarioBlock', () => {
  it('renders all scenario facts with the consistency instruction', () => {
    const block = renderScenarioBlock(validateSpine(VALID_SPINE, PLAN_CODES)!.scenario ? validateSpine(VALID_SPINE, PLAN_CODES)! : (null as never));
    expect(block).toContain('EXAM SCENARIO');
    expect(block).toContain('N735KT');
    expect(block).toContain('NEVER contradict');
  });
});
