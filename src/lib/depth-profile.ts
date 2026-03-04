/**
 * Depth Profiles — rating-specific expectations for oral exam depth.
 *
 * Each rating (private, commercial, instrument) has fundamentally different
 * depth expectations from the FAA. A private pilot applicant should demonstrate
 * foundational knowledge, while a commercial applicant must show operational
 * understanding, and an instrument applicant needs procedural precision.
 *
 * These profiles are used by buildDepthDifficultyContract() to generate
 * per-element contracts that are injected into examiner and assessment prompts.
 */

import type { Rating, ElementType } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepthProfile {
  /** Rating this profile applies to */
  rating: Rating;
  /** Human-readable label for prompt injection */
  label: string;
  /** What depth of understanding is expected at this certificate level */
  expectedDepth: string;
  /** What level of regulatory precision is expected */
  regulatoryPrecision: string;
  /** How tolerant should assessment be of partial answers */
  partialTolerance: string;
  /** What kind of scenarios are appropriate for this level */
  scenarioStyle: string;
  /** Expected awareness of cross-topic connections */
  crossTopicExpectation: string;
  /** Knowledge element depth guidance */
  knowledgeGuidance: string;
  /** Risk management element depth guidance */
  riskGuidance: string;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const DEPTH_PROFILES: Record<Rating, DepthProfile> = {
  private: {
    rating: 'private',
    label: 'Private Pilot',
    expectedDepth: 'Foundational recall and basic application. The applicant should know key facts, definitions, and standard procedures. They should demonstrate safe decision-making but are not expected to cite exact regulation numbers.',
    regulatoryPrecision: 'General awareness. Accept references to "the regs" or "FARs" as sufficient. Correct regulation section numbers are appreciated but not required. Focus on whether the applicant understands the concept, not whether they can cite the CFR.',
    partialTolerance: 'Generous. If the applicant demonstrates understanding of the core concept but misses secondary details, score as partial rather than unsatisfactory. First-time pilots are still building their knowledge base.',
    scenarioStyle: 'Simple, realistic scenarios. "You\'re planning a cross-country flight to a nearby airport" or "The weather is marginal VFR." Avoid multi-factor edge cases.',
    crossTopicExpectation: 'Minimal. Topics should connect naturally (weather → flight planning) but the applicant is not expected to synthesize across distant ACS areas unprompted.',
    knowledgeGuidance: 'Test recall and basic comprehension. "What are the required instruments for VFR day flight?" is appropriate. "Compare the regulatory framework for VFR minimums in Class B vs Class C vs Class D" is too deep.',
    riskGuidance: 'Test recognition of hazards and basic mitigation. "What risks does density altitude create?" is appropriate.',
  },

  commercial: {
    rating: 'commercial',
    label: 'Commercial Pilot',
    expectedDepth: 'Operational application and scenario-based reasoning. The applicant should demonstrate professional-level understanding, connecting regulations to practical operations. They should know WHY rules exist, not just WHAT the rules are.',
    regulatoryPrecision: 'Moderate specificity. The applicant should reference specific CFR parts (e.g., "Part 91" or "Part 135") and know key section numbers for commercial operations (61.129, 91.213, 91.403). Accept paraphrased regulation content if accurate.',
    partialTolerance: 'Moderate. Commercial applicants should demonstrate thorough knowledge. Missing a key regulatory detail for commercial operations (e.g., passenger-carrying limitations, maintenance responsibilities) is unsatisfactory. Missing secondary details in otherwise strong answers is partial.',
    scenarioStyle: 'Multi-factor scenarios with professional context. "You\'re hired to fly a charter passenger to an airport you haven\'t visited. The weather shows..." Include operational decision-making, economic pressures, and CRM elements.',
    crossTopicExpectation: 'Expected. Commercial pilots should connect topics — understanding how weather affects not just flight safety but also legal dispatch, passenger comfort, and commercial liability.',
    knowledgeGuidance: 'Test application and analysis. "Your aircraft has an inoperative landing light. Walk me through your decision process for a night flight with passengers" requires regulatory knowledge applied to a scenario.',
    riskGuidance: 'Test assessment and mitigation strategies. The applicant should identify cascading risks and propose specific mitigation actions, not just list hazards.',
  },

  instrument: {
    rating: 'instrument',
    label: 'Instrument Rating',
    expectedDepth: 'Procedural precision and systems-level understanding. The applicant must demonstrate exact knowledge of IFR procedures, approach minimums, and ATC protocols. Approximations are insufficient for instrument operations.',
    regulatoryPrecision: 'High specificity. The applicant should know exact minimums, specific regulation numbers for IFR operations (91.167, 91.169, 91.175, 91.177), and precise AIM procedures. Approximate values for approach minimums, fuel requirements, or alternate requirements are unsatisfactory.',
    partialTolerance: 'Strict. Instrument flying demands precision — "close enough" can be fatal in IMC. If the applicant states a minimum as 200 feet when it\'s 300 feet, that is unsatisfactory. Partial is reserved for answers that are conceptually correct but lack procedural specificity.',
    scenarioStyle: 'Complex IFR scenarios with multiple decision points. "You\'re on an ILS approach, you break out at minimums and see the approach lights but not the runway. ATC reports the preceding aircraft went missed." Expect precise procedural responses.',
    crossTopicExpectation: 'Essential. IFR operations integrate weather, navigation, ATC procedures, and aircraft systems continuously. The applicant should naturally connect these domains.',
    knowledgeGuidance: 'Test precise procedural knowledge. "What are the exact fuel requirements for an IFR flight?" demands specific numbers. "Describe the lost communication procedures" demands the exact sequence from 91.185.',
    riskGuidance: 'Test systematic risk assessment in IMC. The applicant should identify instrument-specific risks (spatial disorientation, icing, equipment failure) and articulate precise responses.',
  },

  atp: {
    rating: 'atp',
    label: 'Airline Transport Pilot',
    expectedDepth: 'Expert-level mastery. The applicant must demonstrate comprehensive understanding of all aspects of aviation operations at the highest certificate level.',
    regulatoryPrecision: 'Expert. The applicant should know Part 121/135 operations regulations in addition to Part 91. Exact regulatory citations expected.',
    partialTolerance: 'Very strict. ATP candidates are expected to know material thoroughly. Only minor omissions in otherwise exemplary answers qualify as partial.',
    scenarioStyle: 'Complex multi-crew, multi-factor scenarios involving operational control, dispatch, and regulatory compliance.',
    crossTopicExpectation: 'Comprehensive. ATP candidates must synthesize across all domains seamlessly.',
    knowledgeGuidance: 'Test expert-level synthesis and edge cases.',
    riskGuidance: 'Test systematic risk management in complex operational environments.',
  },
};

/**
 * Get the depth profile for a rating.
 * Falls back to private if rating is unrecognized.
 */
export function getDepthProfile(rating: Rating): DepthProfile {
  return DEPTH_PROFILES[rating] ?? DEPTH_PROFILES.private;
}

/**
 * Get element-type-specific depth guidance from a profile.
 */
export function getElementDepthGuidance(
  profile: DepthProfile,
  elementType: ElementType
): string {
  switch (elementType) {
    case 'knowledge':
      return profile.knowledgeGuidance;
    case 'risk':
      return profile.riskGuidance;
    case 'skill':
      return profile.knowledgeGuidance; // Skills use knowledge guidance for oral exam
    default:
      return profile.knowledgeGuidance;
  }
}
