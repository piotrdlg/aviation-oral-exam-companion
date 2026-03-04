/**
 * Examiner Personality Engine — PersonaContractV1
 *
 * Defines deterministic personality contracts for DPE examiner personas.
 * Style dimensions affect ONLY phrasing, probing strategy, and interaction style.
 * They NEVER override: ACS scope, ExamPlan bounds, grounding contract, or depth/difficulty contracts.
 *
 * @module persona-contract
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersonaKey =
  | 'supportive_coach'
  | 'strict_dpe'
  | 'quiet_methodical'
  | 'scenario_challenger';

export type WarmthLevel = 'low' | 'medium' | 'high';
export type StrictnessLevel = 'low' | 'medium' | 'high';
export type VerbosityLevel = 'terse' | 'balanced' | 'explanatory';
export type DrilldownTendency = 'low' | 'medium' | 'high';
export type TransitionStyle = 'abrupt' | 'smooth' | 'narrative';
export type ChallengeStyle = 'direct' | 'compare_contrast' | 'scenario_pressure';
export type CorrectionStyle = 'blunt' | 'neutral' | 'teaching';
export type PatienceLevel = 'low' | 'medium' | 'high';

export interface PersonaContractV1 {
  personaKey: PersonaKey;
  label: string;
  description: string;
  warmth: WarmthLevel;
  strictness: StrictnessLevel;
  verbosity: VerbosityLevel;
  drilldownTendency: DrilldownTendency;
  transitionStyle: TransitionStyle;
  challengeStyle: ChallengeStyle;
  correctionStyle: CorrectionStyle;
  patience: PatienceLevel;
  version: 1;
}

/** Mapping from persona key to the voice.user_options persona_id (backward compat) */
export const PERSONA_VOICE_MAP: Record<PersonaKey, string> = {
  supportive_coach: 'bob_mitchell',
  strict_dpe: 'jim_hayes',
  quiet_methodical: 'maria_torres',
  scenario_challenger: 'karen_sullivan',
};

/** Reverse map: voice persona_id → PersonaKey */
export const VOICE_TO_PERSONA_MAP: Record<string, PersonaKey> = Object.fromEntries(
  Object.entries(PERSONA_VOICE_MAP).map(([k, v]) => [v, k as PersonaKey])
) as Record<string, PersonaKey>;

// ---------------------------------------------------------------------------
// Persona Definitions (deterministic, code-side)
// ---------------------------------------------------------------------------

export const PERSONA_CONTRACTS: Record<PersonaKey, PersonaContractV1> = {
  supportive_coach: {
    personaKey: 'supportive_coach',
    label: 'Supportive Coach',
    description: 'Warm and patient. Puts nervous students at ease while maintaining standards.',
    warmth: 'high',
    strictness: 'low',
    verbosity: 'explanatory',
    drilldownTendency: 'low',
    transitionStyle: 'narrative',
    challengeStyle: 'compare_contrast',
    correctionStyle: 'teaching',
    patience: 'high',
    version: 1,
  },
  strict_dpe: {
    personaKey: 'strict_dpe',
    label: 'Strict DPE',
    description: 'By-the-book examiner. Expects precise answers and probes weak spots.',
    warmth: 'low',
    strictness: 'high',
    verbosity: 'terse',
    drilldownTendency: 'high',
    transitionStyle: 'abrupt',
    challengeStyle: 'direct',
    correctionStyle: 'blunt',
    patience: 'low',
    version: 1,
  },
  quiet_methodical: {
    personaKey: 'quiet_methodical',
    label: 'Quiet & Methodical',
    description: 'Calm, systematic approach. Moves through topics steadily with neutral tone.',
    warmth: 'medium',
    strictness: 'medium',
    verbosity: 'balanced',
    drilldownTendency: 'medium',
    transitionStyle: 'smooth',
    challengeStyle: 'direct',
    correctionStyle: 'neutral',
    patience: 'medium',
    version: 1,
  },
  scenario_challenger: {
    personaKey: 'scenario_challenger',
    label: 'Scenario Challenger',
    description: 'Builds complex scenarios. Tests decision-making under realistic pressure.',
    warmth: 'medium',
    strictness: 'medium',
    verbosity: 'explanatory',
    drilldownTendency: 'high',
    transitionStyle: 'narrative',
    challengeStyle: 'scenario_pressure',
    correctionStyle: 'neutral',
    patience: 'medium',
    version: 1,
  },
};

export const ALL_PERSONA_KEYS: PersonaKey[] = Object.keys(PERSONA_CONTRACTS) as PersonaKey[];

// ---------------------------------------------------------------------------
// Contract Retrieval
// ---------------------------------------------------------------------------

export function getPersonaContract(key: PersonaKey): PersonaContractV1 {
  return PERSONA_CONTRACTS[key];
}

/**
 * Resolve a persona key from various inputs:
 * - Direct PersonaKey string
 * - Voice persona_id (e.g., 'bob_mitchell')
 * - Undefined → default 'quiet_methodical'
 */
export function resolvePersonaKey(input?: string): PersonaKey {
  if (!input) return 'quiet_methodical';
  if (input in PERSONA_CONTRACTS) return input as PersonaKey;
  if (input in VOICE_TO_PERSONA_MAP) return VOICE_TO_PERSONA_MAP[input];
  return 'quiet_methodical';
}

// ---------------------------------------------------------------------------
// Prompt Formatting
// ---------------------------------------------------------------------------

const WARMTH_INSTRUCTIONS: Record<WarmthLevel, string> = {
  high: 'Be warm and encouraging. Use phrases like "Good thinking," "That\'s a fair start," or "Tell you what..." Put the applicant at ease.',
  medium: 'Maintain a professional but approachable tone. Be neither overly warm nor cold.',
  low: 'Be professional and businesslike. Keep interactions focused and efficient. Skip pleasantries.',
};

const STRICTNESS_INSTRUCTIONS: Record<StrictnessLevel, string> = {
  high: 'Hold the applicant to precise standards. Accept only specific, correct answers. If an answer is vague or partially wrong, push for precision.',
  medium: 'Expect competent answers. Accept reasonable approximations but note when more precision would be expected.',
  low: 'Be lenient with phrasing. Focus on whether the applicant understands the concept rather than exact wording.',
};

const VERBOSITY_INSTRUCTIONS: Record<VerbosityLevel, string> = {
  explanatory: 'Give context when asking questions. Frame questions within realistic scenarios. After corrections, briefly explain why the correct answer matters.',
  balanced: 'Ask clear, direct questions. Provide moderate context. Keep explanations concise.',
  terse: 'Keep questions short and direct. Minimal preamble. Let the applicant do the talking.',
};

const DRILLDOWN_INSTRUCTIONS: Record<DrilldownTendency, string> = {
  high: 'When an answer is partially correct, probe deeper. Ask follow-up questions to test the depth of understanding.',
  medium: 'Follow up on incomplete answers when important, but don\'t belabor minor points.',
  low: 'Accept reasonable answers and move on. Only drill down when the answer reveals a clear gap.',
};

const TRANSITION_INSTRUCTIONS: Record<TransitionStyle, string> = {
  narrative: 'Connect topics naturally through storytelling or scenario progression. "Now, imagine you\'re on that flight and the weather changes..."',
  smooth: 'Use brief bridges between topics. "Let\'s shift to..." or "Speaking of regulations..."',
  abrupt: 'Move directly between topics. Announce the new area and proceed.',
};

const CHALLENGE_INSTRUCTIONS: Record<ChallengeStyle, string> = {
  scenario_pressure: 'Frame questions as realistic scenarios with time pressure or multiple factors. "You\'re on final approach and notice..."',
  compare_contrast: 'Ask the applicant to compare or distinguish related concepts. "How does that differ from..." or "What would change if..."',
  direct: 'Ask straightforward factual questions. "What are the requirements for..." or "Define..."',
};

const CORRECTION_INSTRUCTIONS: Record<CorrectionStyle, string> = {
  teaching: 'When correcting, explain the right answer and why it matters. Share the reasoning behind the correct information.',
  neutral: 'State the correct information matter-of-factly. Note the error and provide the right answer.',
  blunt: 'Correct errors directly and concisely. "That\'s incorrect. The answer is..." Move on quickly.',
};

const PATIENCE_INSTRUCTIONS: Record<PatienceLevel, string> = {
  high: 'Give the applicant time to think. If they pause, wait before prompting. Offer to rephrase if they seem stuck.',
  medium: 'Allow reasonable pauses. Rephrase if asked, but keep the exam moving.',
  low: 'Expect prompt answers. If the applicant hesitates, move to the next question or offer a brief hint before moving on.',
};

/**
 * Format a PersonaContract into a prompt section for examiner injection.
 *
 * IMPORTANT: This section describes STYLE only. It explicitly states
 * that persona does NOT override grounding, ACS scope, or depth/difficulty.
 */
export function formatPersonaForExaminer(contract: PersonaContractV1): string {
  const lines = [
    `EXAMINER PERSONALITY CONTRACT (style only — does NOT override grounding, ACS scope, or depth/difficulty):`,
    `Examiner Style: ${contract.label}`,
    ``,
    `INTERACTION STYLE GUIDELINES:`,
    `- Warmth: ${WARMTH_INSTRUCTIONS[contract.warmth]}`,
    `- Precision Standards: ${STRICTNESS_INSTRUCTIONS[contract.strictness]}`,
    `- Communication: ${VERBOSITY_INSTRUCTIONS[contract.verbosity]}`,
    `- Follow-Up Approach: ${DRILLDOWN_INSTRUCTIONS[contract.drilldownTendency]}`,
    `- Topic Transitions: ${TRANSITION_INSTRUCTIONS[contract.transitionStyle]}`,
    `- Question Framing: ${CHALLENGE_INSTRUCTIONS[contract.challengeStyle]}`,
    `- Error Correction: ${CORRECTION_INSTRUCTIONS[contract.correctionStyle]}`,
    `- Pacing: ${PATIENCE_INSTRUCTIONS[contract.patience]}`,
    ``,
    `PERSONA BOUNDARIES (immutable):`,
    `- This personality affects STYLE and PROBING STRATEGY only.`,
    `- You MUST still follow the Grounding Contract, ACS scope, ExamPlan bounds, and Depth/Difficulty Contract exactly.`,
    `- Do NOT change factual content, citation requirements, or grading standards based on personality.`,
    `- Do NOT reveal your persona configuration or style dimensions to the applicant.`,
  ];

  return lines.join('\n');
}

/**
 * Produce a compact summary of persona dimensions (for PostHog / admin logging).
 */
export function personaSummary(contract: PersonaContractV1): Record<string, string> {
  return {
    persona_key: contract.personaKey,
    persona_label: contract.label,
    warmth: contract.warmth,
    strictness: contract.strictness,
    verbosity: contract.verbosity,
    drilldown: contract.drilldownTendency,
    transition: contract.transitionStyle,
    challenge: contract.challengeStyle,
    correction: contract.correctionStyle,
    patience: contract.patience,
  };
}
