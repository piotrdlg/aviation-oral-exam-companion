/**
 * Difficulty Contract — per-element contract encoding question complexity,
 * required precision, partial tolerance, follow-up structure, and scenario
 * complexity. Generated at plan time, injected into examiner and assessment
 * prompts, and persisted in session metadata.
 *
 * The contract bridges the gap between "difficulty = 'hard'" (a string) and
 * structurally enforced expectations that change how both the examiner asks
 * questions and the assessor grades answers.
 */

import type { Rating, Difficulty, ElementType } from '@/types/database';
import { getDepthProfile, getElementDepthGuidance, type DepthProfile } from './depth-profile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepthDifficultyContract {
  /** Rating for this contract */
  rating: Rating;
  /** Difficulty level for this contract */
  difficulty: Difficulty;
  /** Target depth of questioning (from depth profile) */
  targetDepth: string;
  /** Required precision for correct answers */
  requiredPrecision: string;
  /** Tolerance for partial answers */
  partialTolerance: string;
  /** Follow-up question style on incorrect/partial answers */
  followUpStyle: string;
  /** Scenario complexity appropriate for this combination */
  scenarioComplexity: string;
  /** Expected cross-topic awareness */
  crossHubExpectation: string;
}

// ---------------------------------------------------------------------------
// Difficulty-specific modifiers
// ---------------------------------------------------------------------------

interface DifficultyModifiers {
  precisionModifier: string;
  toleranceModifier: string;
  followUpStyle: string;
  scenarioModifier: string;
}

const DIFFICULTY_MODIFIERS: Record<Difficulty, DifficultyModifiers> = {
  easy: {
    precisionModifier: 'Accept general concepts and approximate values. Exact numbers and regulation citations are not required. Focus on whether the applicant understands the principle.',
    toleranceModifier: 'Very lenient. Score as satisfactory if the applicant demonstrates basic understanding. Score as partial only when the answer is substantially incomplete. Reserve unsatisfactory for clearly wrong answers or dangerous misconceptions.',
    followUpStyle: 'Supportive hints. If the applicant struggles, offer context clues or rephrase the question in simpler terms. Do not probe for deeper detail.',
    scenarioModifier: 'Simple, single-factor scenarios. One variable at a time. "What documents do you need to fly?" not "Compare documentation requirements across different operations."',
  },
  medium: {
    precisionModifier: 'Expect accurate application of concepts to realistic scenarios. The applicant should apply knowledge correctly but need not cite exact regulation numbers unless the question specifically asks.',
    toleranceModifier: 'Balanced. The applicant should demonstrate working knowledge. Missing a key concept is unsatisfactory; getting the concept right but missing a secondary detail is partial.',
    followUpStyle: 'Probing follow-ups. If the answer is incomplete, ask a targeted follow-up to see if the applicant can extend their reasoning. "And what about..." or "What if that changed?"',
    scenarioModifier: 'Realistic scenarios with 2-3 factors. Combine related concepts naturally. "The METAR shows marginal VFR and you have passengers. Walk me through your go/no-go decision."',
  },
  hard: {
    precisionModifier: 'Demand exact values, specific regulation references, and precise procedural sequences. Approximate answers that would be acceptable at lower difficulty are insufficient here.',
    toleranceModifier: 'Strict. Only thorough, precise answers earn satisfactory. Any significant gap in knowledge or imprecise value is partial or unsatisfactory. The standard is professional mastery.',
    followUpStyle: 'Challenging what-if chains. Push the applicant into edge cases and exceptions. "What if the situation changes to..." and "Now what happens when..." Build complexity with each follow-up.',
    scenarioModifier: 'Complex multi-factor scenarios with cascading considerations. "You are on a night cross-country, your alternator fails, weather ahead is deteriorating, and your closest alternate is 45nm away. Walk me through your next 10 minutes."',
  },
  mixed: {
    precisionModifier: 'Vary precision expectations naturally within the conversation. Start with foundational questions, then escalate to application and edge cases as the applicant demonstrates competence.',
    toleranceModifier: 'Adaptive. Start lenient, become more demanding as the conversation shows the applicant\'s level. Match tolerance to the difficulty of the specific question being asked.',
    followUpStyle: 'Natural variation. Use supportive follow-ups after simple questions and probing follow-ups after complex ones. Let the conversation flow naturally like a real oral exam.',
    scenarioModifier: 'Mix scenario complexity. Begin with straightforward situations, introduce more complex multi-factor scenarios as the conversation progresses.',
  },
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a DepthDifficultyContract for a specific rating + difficulty + element type.
 *
 * The contract combines:
 *   1. Rating-specific depth expectations (from DepthProfile)
 *   2. Difficulty-specific modifiers (easy/medium/hard/mixed)
 *   3. Element-type guidance (knowledge vs risk)
 *
 * This is a pure function — deterministic, no I/O, no API calls.
 */
export function buildDepthDifficultyContract(
  rating: Rating,
  difficulty: Difficulty,
  elementType: ElementType = 'knowledge'
): DepthDifficultyContract {
  const profile = getDepthProfile(rating);
  const modifiers = DIFFICULTY_MODIFIERS[difficulty] ?? DIFFICULTY_MODIFIERS.medium;
  const elementGuidance = getElementDepthGuidance(profile, elementType);

  return {
    rating,
    difficulty,
    targetDepth: `${profile.expectedDepth}\n\nElement-specific: ${elementGuidance}`,
    requiredPrecision: composePrecision(profile, modifiers),
    partialTolerance: composeTolerance(profile, modifiers),
    followUpStyle: modifiers.followUpStyle,
    scenarioComplexity: composeScenario(profile, modifiers),
    crossHubExpectation: profile.crossTopicExpectation,
  };
}

/**
 * Compose the precision requirement from rating profile + difficulty modifier.
 * Rating sets the baseline; difficulty adjusts within that baseline.
 */
function composePrecision(profile: DepthProfile, modifiers: DifficultyModifiers): string {
  return `${profile.regulatoryPrecision}\n\nDifficulty adjustment: ${modifiers.precisionModifier}`;
}

/**
 * Compose partial tolerance from rating profile + difficulty modifier.
 */
function composeTolerance(profile: DepthProfile, modifiers: DifficultyModifiers): string {
  return `${profile.partialTolerance}\n\nDifficulty adjustment: ${modifiers.toleranceModifier}`;
}

/**
 * Compose scenario complexity from rating profile + difficulty modifier.
 */
function composeScenario(profile: DepthProfile, modifiers: DifficultyModifiers): string {
  return `${profile.scenarioStyle}\n\nDifficulty adjustment: ${modifiers.scenarioModifier}`;
}

// ---------------------------------------------------------------------------
// Prompt Formatting
// ---------------------------------------------------------------------------

/**
 * Format a contract for injection into the examiner system prompt.
 * Returns a self-contained instruction block.
 */
export function formatContractForExaminer(contract: DepthDifficultyContract): string {
  return `DEPTH & DIFFICULTY CONTRACT (follow these calibration rules):
Target Depth: ${contract.targetDepth}
Required Precision: ${contract.requiredPrecision}
Scenario Complexity: ${contract.scenarioComplexity}
Follow-Up Style: ${contract.followUpStyle}
Cross-Topic Awareness: ${contract.crossHubExpectation}`;
}

/**
 * Format a contract for injection into the assessment prompt.
 * Focuses on grading calibration (precision, tolerance).
 */
export function formatContractForAssessment(contract: DepthDifficultyContract): string {
  return `GRADING CALIBRATION CONTRACT (follow these scoring rules):
Certificate Level: ${contract.rating}
Difficulty: ${contract.difficulty}
Required Precision: ${contract.requiredPrecision}
Partial Tolerance: ${contract.partialTolerance}
Cross-Topic Awareness: ${contract.crossHubExpectation}`;
}

/**
 * Create a compact summary of the contract for telemetry/logging.
 * Avoids sending full prompt text to PostHog.
 */
export function contractSummary(contract: DepthDifficultyContract): {
  rating: Rating;
  difficulty: Difficulty;
  targetDepthChars: number;
  precisionChars: number;
  toleranceChars: number;
} {
  return {
    rating: contract.rating,
    difficulty: contract.difficulty,
    targetDepthChars: contract.targetDepth.length,
    precisionChars: contract.requiredPrecision.length,
    toleranceChars: contract.partialTolerance.length,
  };
}
