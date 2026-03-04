import { describe, it, expect } from 'vitest';
import {
  EXAMINER_PROFILES,
  ALL_PROFILE_KEYS,
  VOICE_TO_PROFILE_MAP,
  PERSONA_TO_PROFILE_MAP,
  getExaminerProfile,
  resolveExaminerProfile,
  formatProfilePersonaSection,
  resolveDisplayName,
  examinerProfileSummary,
  type ExaminerProfileKey,
} from '../examiner-profile';
import { ALL_PERSONA_KEYS, PERSONA_VOICE_MAP } from '../persona-contract';

// ---------------------------------------------------------------------------
// 1. Profile Definitions
// ---------------------------------------------------------------------------

describe('profile definitions', () => {
  it('has exactly 4 profiles', () => {
    expect(ALL_PROFILE_KEYS).toHaveLength(4);
    expect(Object.keys(EXAMINER_PROFILES)).toHaveLength(4);
  });

  it('each profile has all required fields', () => {
    for (const key of ALL_PROFILE_KEYS) {
      const p = EXAMINER_PROFILES[key];
      expect(p.profileKey).toBe(key);
      expect(p.personaKey).toBeTruthy();
      expect(p.voiceId).toBeTruthy();
      expect(p.voiceGender).toMatch(/^(male|female)$/);
      expect(p.defaultDisplayName).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.version).toBe(1);
    }
  });

  it('has exactly 2 male and 2 female profiles', () => {
    const males = ALL_PROFILE_KEYS.filter(k => EXAMINER_PROFILES[k].voiceGender === 'male');
    const females = ALL_PROFILE_KEYS.filter(k => EXAMINER_PROFILES[k].voiceGender === 'female');
    expect(males).toHaveLength(2);
    expect(females).toHaveLength(2);
  });

  it('has 4 unique voice IDs', () => {
    const voiceIds = ALL_PROFILE_KEYS.map(k => EXAMINER_PROFILES[k].voiceId);
    expect(new Set(voiceIds).size).toBe(4);
  });

  it('has 4 unique persona keys', () => {
    const personaKeys = ALL_PROFILE_KEYS.map(k => EXAMINER_PROFILES[k].personaKey);
    expect(new Set(personaKeys).size).toBe(4);
  });

  it('maps 1:1 — each persona key appears in exactly one profile', () => {
    for (const pk of ALL_PERSONA_KEYS) {
      const matches = ALL_PROFILE_KEYS.filter(k => EXAMINER_PROFILES[k].personaKey === pk);
      expect(matches).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Lookup Maps
// ---------------------------------------------------------------------------

describe('lookup maps', () => {
  it('VOICE_TO_PROFILE_MAP has 4 entries', () => {
    expect(Object.keys(VOICE_TO_PROFILE_MAP)).toHaveLength(4);
  });

  it('PERSONA_TO_PROFILE_MAP has 4 entries', () => {
    expect(Object.keys(PERSONA_TO_PROFILE_MAP)).toHaveLength(4);
  });

  it('voice map is consistent with PERSONA_VOICE_MAP from persona-contract', () => {
    // Verify that the persona-contract voice mappings align with profile voice IDs
    for (const key of ALL_PROFILE_KEYS) {
      const profile = EXAMINER_PROFILES[key];
      expect(PERSONA_VOICE_MAP[profile.personaKey]).toBe(profile.voiceId);
    }
  });

  it('voice map forward/reverse is deterministic', () => {
    for (const key of ALL_PROFILE_KEYS) {
      const profile = EXAMINER_PROFILES[key];
      expect(VOICE_TO_PROFILE_MAP[profile.voiceId]).toBe(key);
      expect(PERSONA_TO_PROFILE_MAP[profile.personaKey]).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Profile Retrieval
// ---------------------------------------------------------------------------

describe('getExaminerProfile', () => {
  it('returns correct profile for each key', () => {
    for (const key of ALL_PROFILE_KEYS) {
      const profile = getExaminerProfile(key);
      expect(profile.profileKey).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Resolution (backward compatibility)
// ---------------------------------------------------------------------------

describe('resolveExaminerProfile', () => {
  it('resolves direct profile key', () => {
    const result = resolveExaminerProfile({ savedProfile: 'jim_strict' });
    expect(result.profile.profileKey).toBe('jim_strict');
    expect(result.source).toBe('direct_profile');
  });

  it('resolves from saved voice (legacy)', () => {
    const result = resolveExaminerProfile({ savedVoice: 'bob_mitchell' });
    expect(result.profile.profileKey).toBe('bob_supportive');
    expect(result.source).toBe('voice_fallback');
  });

  it('resolves from saved persona (legacy)', () => {
    const result = resolveExaminerProfile({ savedPersona: 'strict_dpe' });
    expect(result.profile.profileKey).toBe('jim_strict');
    expect(result.source).toBe('persona_fallback');
  });

  it('returns default when nothing is provided', () => {
    const result = resolveExaminerProfile({});
    expect(result.profile.profileKey).toBe('maria_methodical');
    expect(result.source).toBe('default');
  });

  it('returns default for unknown inputs via persona fallback chain', () => {
    // resolvePersonaKey('nonexistent') → 'quiet_methodical' → maria_methodical
    const result = resolveExaminerProfile({
      savedProfile: 'nonexistent',
      savedVoice: 'nonexistent',
      savedPersona: 'nonexistent',
    });
    expect(result.profile.profileKey).toBe('maria_methodical');
    expect(result.source).toBe('persona_fallback');
  });

  it('prioritizes profile over voice and persona', () => {
    const result = resolveExaminerProfile({
      savedProfile: 'karen_scenario',
      savedVoice: 'bob_mitchell',
      savedPersona: 'strict_dpe',
    });
    expect(result.profile.profileKey).toBe('karen_scenario');
    expect(result.source).toBe('direct_profile');
  });

  it('prioritizes voice over persona when no profile', () => {
    const result = resolveExaminerProfile({
      savedVoice: 'jim_hayes',
      savedPersona: 'supportive_coach',
    });
    expect(result.profile.profileKey).toBe('jim_strict');
    expect(result.source).toBe('voice_fallback');
  });

  it('all 4 voice IDs resolve correctly', () => {
    const voiceExpected: Record<string, ExaminerProfileKey> = {
      maria_torres: 'maria_methodical',
      bob_mitchell: 'bob_supportive',
      jim_hayes: 'jim_strict',
      karen_sullivan: 'karen_scenario',
    };
    for (const [voice, expectedKey] of Object.entries(voiceExpected)) {
      const result = resolveExaminerProfile({ savedVoice: voice });
      expect(result.profile.profileKey).toBe(expectedKey);
    }
  });

  it('all 4 persona keys resolve correctly', () => {
    const personaExpected: Record<string, ExaminerProfileKey> = {
      quiet_methodical: 'maria_methodical',
      supportive_coach: 'bob_supportive',
      strict_dpe: 'jim_strict',
      scenario_challenger: 'karen_scenario',
    };
    for (const [persona, expectedKey] of Object.entries(personaExpected)) {
      const result = resolveExaminerProfile({ savedPersona: persona });
      expect(result.profile.profileKey).toBe(expectedKey);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Persona Section Formatting
// ---------------------------------------------------------------------------

describe('formatProfilePersonaSection', () => {
  it('returns non-empty string for each profile', () => {
    for (const key of ALL_PROFILE_KEYS) {
      const profile = EXAMINER_PROFILES[key];
      const section = formatProfilePersonaSection(profile);
      expect(section.length).toBeGreaterThan(100);
    }
  });

  it('contains persona boundary enforcement', () => {
    for (const key of ALL_PROFILE_KEYS) {
      const profile = EXAMINER_PROFILES[key];
      const section = formatProfilePersonaSection(profile);
      expect(section).toContain('PERSONA BOUNDARIES');
      expect(section).toContain('immutable');
    }
  });

  it('produces distinct prompts for each profile', () => {
    const sections = ALL_PROFILE_KEYS.map(k => formatProfilePersonaSection(EXAMINER_PROFILES[k]));
    expect(new Set(sections).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 6. Display Name Resolution
// ---------------------------------------------------------------------------

describe('resolveDisplayName', () => {
  it('returns custom name when provided', () => {
    const profile = EXAMINER_PROFILES.maria_methodical;
    expect(resolveDisplayName(profile, 'Custom DPE')).toBe('Custom DPE');
  });

  it('returns profile default when custom is null', () => {
    const profile = EXAMINER_PROFILES.bob_supportive;
    expect(resolveDisplayName(profile, null)).toBe('Bob Mitchell');
  });

  it('returns profile default when custom is empty string', () => {
    const profile = EXAMINER_PROFILES.jim_strict;
    expect(resolveDisplayName(profile, '')).toBe('Jim Hayes');
  });

  it('returns profile default when custom is whitespace', () => {
    const profile = EXAMINER_PROFILES.karen_scenario;
    expect(resolveDisplayName(profile, '   ')).toBe('Karen Sullivan');
  });

  it('trims custom name whitespace', () => {
    const profile = EXAMINER_PROFILES.maria_methodical;
    expect(resolveDisplayName(profile, '  My DPE  ')).toBe('My DPE');
  });
});

// ---------------------------------------------------------------------------
// 7. Summary
// ---------------------------------------------------------------------------

describe('examinerProfileSummary', () => {
  it('includes all required fields', () => {
    const profile = EXAMINER_PROFILES.jim_strict;
    const summary = examinerProfileSummary(profile, 'direct_profile');
    expect(summary.examiner_profile_key).toBe('jim_strict');
    expect(summary.persona_key).toBe('strict_dpe');
    expect(summary.voice_id).toBe('jim_hayes');
    expect(summary.voice_gender).toBe('male');
    expect(summary.display_name).toBe('Jim Hayes');
    expect(summary.has_custom_display_name).toBe(false);
    expect(summary.resolution_source).toBe('direct_profile');
  });

  it('reflects custom display name when provided', () => {
    const profile = EXAMINER_PROFILES.maria_methodical;
    const summary = examinerProfileSummary(profile, 'voice_fallback', 'My Custom Name');
    expect(summary.display_name).toBe('My Custom Name');
    expect(summary.has_custom_display_name).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('same input always produces same output', () => {
    const inputs = [
      { savedProfile: 'bob_supportive' },
      { savedVoice: 'karen_sullivan' },
      { savedPersona: 'quiet_methodical' },
      {},
    ];

    for (const input of inputs) {
      const a = resolveExaminerProfile(input);
      const b = resolveExaminerProfile(input);
      expect(a.profile.profileKey).toBe(b.profile.profileKey);
      expect(a.source).toBe(b.source);
    }
  });
});
