/**
 * Examiner Identity Unification — ExaminerProfileV1
 *
 * Unifies persona, voice, and display identity into a single deterministic profile.
 * The user selects ONE examiner profile in Settings; the exam session resolves
 * persona style, TTS voice, and display name/avatar from that single choice.
 *
 * @module examiner-profile
 */

import type { PersonaKey } from '@/types/database';
import { getPersonaContract, formatPersonaForExaminer, resolvePersonaKey } from './persona-contract';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExaminerProfileKey =
  | 'maria_methodical'
  | 'bob_supportive'
  | 'jim_strict'
  | 'karen_scenario';

export type VoiceGender = 'male' | 'female';

export interface ExaminerProfileV1 {
  profileKey: ExaminerProfileKey;
  personaKey: PersonaKey;
  /** The voice model string stored in system_config / user_profiles.preferred_voice */
  voiceId: string;
  voiceGender: VoiceGender;
  defaultDisplayName: string;
  description: string;
  version: 1;
}

// ---------------------------------------------------------------------------
// Profile Definitions (deterministic, code-side)
// ---------------------------------------------------------------------------

export const EXAMINER_PROFILES: Record<ExaminerProfileKey, ExaminerProfileV1> = {
  maria_methodical: {
    profileKey: 'maria_methodical',
    personaKey: 'quiet_methodical',
    voiceId: 'maria_torres',
    voiceGender: 'female',
    defaultDisplayName: 'Maria Torres',
    description: 'Calm and systematic. Moves through topics steadily with a neutral tone.',
    version: 1,
  },
  bob_supportive: {
    profileKey: 'bob_supportive',
    personaKey: 'supportive_coach',
    voiceId: 'bob_mitchell',
    voiceGender: 'male',
    defaultDisplayName: 'Bob Mitchell',
    description: 'Warm and patient. Puts nervous students at ease while maintaining standards.',
    version: 1,
  },
  jim_strict: {
    profileKey: 'jim_strict',
    personaKey: 'strict_dpe',
    voiceId: 'jim_hayes',
    voiceGender: 'male',
    defaultDisplayName: 'Jim Hayes',
    description: 'By-the-book examiner. Expects precise answers and probes weak spots.',
    version: 1,
  },
  karen_scenario: {
    profileKey: 'karen_scenario',
    personaKey: 'scenario_challenger',
    voiceId: 'karen_sullivan',
    voiceGender: 'female',
    defaultDisplayName: 'Karen Sullivan',
    description: 'Builds complex scenarios. Tests decision-making under realistic pressure.',
    version: 1,
  },
};

export const ALL_PROFILE_KEYS: ExaminerProfileKey[] = Object.keys(EXAMINER_PROFILES) as ExaminerProfileKey[];

// ---------------------------------------------------------------------------
// Lookup Maps (bidirectional)
// ---------------------------------------------------------------------------

/** Voice persona_id → ExaminerProfileKey */
export const VOICE_TO_PROFILE_MAP: Record<string, ExaminerProfileKey> = Object.fromEntries(
  Object.values(EXAMINER_PROFILES).map((p) => [p.voiceId, p.profileKey])
) as Record<string, ExaminerProfileKey>;

/** PersonaKey → ExaminerProfileKey */
export const PERSONA_TO_PROFILE_MAP: Record<PersonaKey, ExaminerProfileKey> = Object.fromEntries(
  Object.values(EXAMINER_PROFILES).map((p) => [p.personaKey, p.profileKey])
) as Record<PersonaKey, ExaminerProfileKey>;

// ---------------------------------------------------------------------------
// Profile Retrieval
// ---------------------------------------------------------------------------

export function getExaminerProfile(key: ExaminerProfileKey): ExaminerProfileV1 {
  return EXAMINER_PROFILES[key];
}

// ---------------------------------------------------------------------------
// Resolution (backward-compatible)
// ---------------------------------------------------------------------------

export type ResolutionSource = 'direct_profile' | 'voice_fallback' | 'persona_fallback' | 'default';

export interface ResolvedExaminerProfile {
  profile: ExaminerProfileV1;
  source: ResolutionSource;
}

/**
 * Resolve an ExaminerProfileV1 from various legacy inputs.
 *
 * Priority:
 *   1. savedProfile — direct ExaminerProfileKey (new path)
 *   2. savedVoice — voice persona_id from user_profiles.preferred_voice (legacy voice-only)
 *   3. savedPersona — PersonaKey from session config (legacy persona-only)
 *   4. default → maria_methodical
 */
export function resolveExaminerProfile(input: {
  savedProfile?: string;
  savedVoice?: string;
  savedPersona?: string;
}): ResolvedExaminerProfile {
  // 1. Direct profile key
  if (input.savedProfile && input.savedProfile in EXAMINER_PROFILES) {
    return {
      profile: EXAMINER_PROFILES[input.savedProfile as ExaminerProfileKey],
      source: 'direct_profile',
    };
  }

  // 2. Voice-based fallback
  if (input.savedVoice && input.savedVoice in VOICE_TO_PROFILE_MAP) {
    return {
      profile: EXAMINER_PROFILES[VOICE_TO_PROFILE_MAP[input.savedVoice]],
      source: 'voice_fallback',
    };
  }

  // 3. Persona-based fallback
  if (input.savedPersona) {
    const personaKey = resolvePersonaKey(input.savedPersona);
    if (personaKey in PERSONA_TO_PROFILE_MAP) {
      return {
        profile: EXAMINER_PROFILES[PERSONA_TO_PROFILE_MAP[personaKey]],
        source: 'persona_fallback',
      };
    }
  }

  // 4. Default
  return {
    profile: EXAMINER_PROFILES.maria_methodical,
    source: 'default',
  };
}

// ---------------------------------------------------------------------------
// Convenience: format persona section from profile
// ---------------------------------------------------------------------------

/**
 * Given an ExaminerProfileV1, return the formatted persona prompt section.
 * Delegates to PersonaContractV1 formatting.
 */
export function formatProfilePersonaSection(profile: ExaminerProfileV1): string {
  const contract = getPersonaContract(profile.personaKey);
  return formatPersonaForExaminer(contract);
}

/**
 * Resolve display name: custom override > profile default.
 */
export function resolveDisplayName(profile: ExaminerProfileV1, customName?: string | null): string {
  return customName?.trim() || profile.defaultDisplayName;
}

// ---------------------------------------------------------------------------
// Summary (for PostHog / admin monitoring)
// ---------------------------------------------------------------------------

export function examinerProfileSummary(
  profile: ExaminerProfileV1,
  source: ResolutionSource,
  customDisplayName?: string | null
): Record<string, string | boolean> {
  return {
    examiner_profile_key: profile.profileKey,
    persona_key: profile.personaKey,
    voice_id: profile.voiceId,
    voice_gender: profile.voiceGender,
    display_name: resolveDisplayName(profile, customDisplayName),
    has_custom_display_name: !!(customDisplayName?.trim()),
    resolution_source: source,
  };
}
