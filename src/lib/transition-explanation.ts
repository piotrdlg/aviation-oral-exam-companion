/**
 * Transition Explanation Generator
 *
 * Produces short deterministic bridge sentences explaining why the DPE
 * examiner moved from one ACS area to another. Injected into the system
 * prompt when the planner transitions across areas in cross_acs mode.
 *
 * No LLM call — all transitions are keyword-driven and deterministic.
 *
 * Phase 9 — Flow Coherence Activation
 */

import { getAreaKeywords } from './citation-relevance';
import { parseElementCode } from './structural-fingerprints';

// ---------------------------------------------------------------------------
// Area labels (human-readable)
// ---------------------------------------------------------------------------

const AREA_LABELS: Record<string, Record<string, string>> = {
  private: {
    'I': 'Preflight Preparation',
    'II': 'Preflight Procedures',
    'III': 'Airport and Seaplane Base Operations',
    'IV': 'Takeoffs, Landings, and Go-Arounds',
    'V': 'Performance and Ground Reference Maneuvers',
    'VI': 'Navigation',
    'VII': 'Slow Flight and Stalls',
    'VIII': 'Basic Instrument Maneuvers',
    'IX': 'Emergency Operations',
    'X': 'Multiengine Operations',
    'XI': 'Night Operations',
    'XII': 'Postflight Procedures',
  },
  commercial: {
    'I': 'Preflight Preparation',
    'II': 'Preflight Procedures',
    'III': 'Airport and Seaplane Base Operations',
    'IV': 'Takeoffs, Landings, and Go-Arounds',
    'V': 'Performance and Ground Reference Maneuvers',
    'VI': 'Navigation',
    'VII': 'Slow Flight and Stalls',
    'VIII': 'High-Altitude Operations',
    'IX': 'Emergency Operations',
    'X': 'Multiengine Operations',
    'XI': 'Postflight Procedures',
  },
  instrument: {
    'I': 'Preflight Preparation',
    'II': 'Preflight Procedures',
    'III': 'ATC Clearances and Procedures',
    'IV': 'Flight by Reference to Instruments',
    'V': 'Navigation Systems',
    'VI': 'Instrument Approach Procedures',
    'VII': 'Emergency Operations',
    'VIII': 'Postflight Procedures',
  },
};

function getAreaLabel(area: string, rating: string): string {
  return AREA_LABELS[rating]?.[area] ?? `Area ${area}`;
}

// ---------------------------------------------------------------------------
// Bridge keyword detection
// ---------------------------------------------------------------------------

/**
 * Find shared topic keywords between two areas (for a given rating).
 * Returns the keywords that appear in both area keyword lists.
 */
export function findSharedKeywords(
  fromArea: string,
  toArea: string,
  rating: string
): string[] {
  const fromKws = new Set(getAreaKeywords(fromArea, rating));
  const toKws = getAreaKeywords(toArea, rating);
  return toKws.filter(kw => fromKws.has(kw));
}

// ---------------------------------------------------------------------------
// Bridge sentence templates
// ---------------------------------------------------------------------------

/**
 * Hand-crafted bridge templates keyed by shared keyword patterns.
 * Each template produces a natural DPE transition sentence.
 */
const BRIDGE_TEMPLATES: Array<{
  keywords: string[];
  template: (from: string, to: string) => string;
}> = [
  {
    keywords: ['weather'],
    template: (from, to) =>
      `Speaking of weather — we touched on that during ${from}. Let's see how weather factors play into ${to}.`,
  },
  {
    keywords: ['emergency', 'engine failure'],
    template: (from, to) =>
      `Good — now since emergencies can happen at any phase of flight, let's talk about ${to}.`,
  },
  {
    keywords: ['airspace', 'atc'],
    template: (from, to) =>
      `We talked about airspace and ATC in ${from}. That connects nicely to ${to}.`,
  },
  {
    keywords: ['navigation', 'gps', 'vor'],
    template: (from, to) =>
      `Navigation is a thread through the whole checkride. Let's move from ${from} to ${to}.`,
  },
  {
    keywords: ['instrument', 'ifr'],
    template: (from, to) =>
      `That instrument knowledge carries over — let's apply it to ${to}.`,
  },
  {
    keywords: ['preflight', 'checklist'],
    template: (from, to) =>
      `Preflight preparation sets the stage for everything. Now let's transition to ${to}.`,
  },
  {
    keywords: ['fuel'],
    template: (from, to) =>
      `Fuel planning is critical at every stage. Let's see how it applies to ${to}.`,
  },
  {
    keywords: ['communication', 'clearance'],
    template: (from, to) =>
      `Communication is key throughout. Let's move on to ${to} and see how that applies.`,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TransitionExplanation {
  /** The bridge sentence for the system prompt */
  sentence: string;
  /** Shared keywords that motivated this bridge */
  bridgeKeywords: string[];
  /** Whether this was a same-area transition (no bridge needed) */
  sameArea: boolean;
}

/**
 * Generate a transition explanation between two ACS elements.
 *
 * Returns null if either element code cannot be parsed.
 * Returns a sameArea transition (short sentence) if both elements are in the same area.
 * Returns a keyword-bridge transition if shared keywords exist between areas.
 * Returns a generic transition if no specific bridge keywords match.
 */
export function generateTransition(
  fromElementCode: string,
  toElementCode: string,
  rating: string = 'private'
): TransitionExplanation | null {
  const fromParsed = parseElementCode(fromElementCode);
  const toParsed = parseElementCode(toElementCode);
  if (!fromParsed || !toParsed) return null;

  const fromLabel = getAreaLabel(fromParsed.area, rating);
  const toLabel = getAreaLabel(toParsed.area, rating);

  // Same area — minimal transition
  if (fromParsed.area === toParsed.area) {
    return {
      sentence: `Let's continue with ${toLabel}.`,
      bridgeKeywords: [],
      sameArea: true,
    };
  }

  // Different area — find shared keywords for bridge
  const shared = findSharedKeywords(fromParsed.area, toParsed.area, rating);

  // Try bridge templates (first match wins)
  for (const bridge of BRIDGE_TEMPLATES) {
    const matchCount = bridge.keywords.filter(kw => shared.includes(kw)).length;
    if (matchCount > 0) {
      return {
        sentence: bridge.template(fromLabel, toLabel),
        bridgeKeywords: bridge.keywords.filter(kw => shared.includes(kw)),
        sameArea: false,
      };
    }
  }

  // No specific bridge — generic transition
  return {
    sentence: `Good — now let's shift gears from ${fromLabel} to ${toLabel}.`,
    bridgeKeywords: shared.slice(0, 3),
    sameArea: false,
  };
}

/**
 * Build a transition hint for the system prompt.
 * Only returns non-empty string for cross-area transitions in cross_acs mode.
 */
export function buildTransitionHint(
  fromElementCode: string | undefined,
  toElementCode: string,
  studyMode: string,
  rating: string = 'private'
): string {
  // Only inject transitions for cross_acs mode
  if (studyMode !== 'cross_acs') return '';
  if (!fromElementCode) return '';

  const transition = generateTransition(fromElementCode, toElementCode, rating);
  if (!transition || transition.sameArea) return '';

  return `\nTOPIC TRANSITION: You are moving from a different ACS area. ${transition.sentence} Use this natural bridge to introduce the new topic area to the applicant. Do not read this instruction aloud — just use it to frame your next question naturally.`;
}
