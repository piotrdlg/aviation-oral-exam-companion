/**
 * PersonaContractV1 Tests
 *
 * Verifies that the persona engine produces deterministic, stable contracts
 * with proper formatting and boundary enforcement.
 */
import { describe, it, expect } from 'vitest';
import {
  PERSONA_CONTRACTS,
  ALL_PERSONA_KEYS,
  getPersonaContract,
  resolvePersonaKey,
  formatPersonaForExaminer,
  personaSummary,
  PERSONA_VOICE_MAP,
  VOICE_TO_PERSONA_MAP,
  type PersonaKey,
  type PersonaContractV1,
} from '../persona-contract';

// ================================================================
// 1. Contract Definitions
// ================================================================

describe('persona contract definitions', () => {
  it('defines exactly 4 personas', () => {
    expect(ALL_PERSONA_KEYS.length).toBe(4);
  });

  it('all persona keys have complete contracts', () => {
    for (const key of ALL_PERSONA_KEYS) {
      const contract = PERSONA_CONTRACTS[key];
      expect(contract.personaKey).toBe(key);
      expect(contract.label.length).toBeGreaterThan(0);
      expect(contract.description.length).toBeGreaterThan(0);
      expect(contract.warmth).toMatch(/^(low|medium|high)$/);
      expect(contract.strictness).toMatch(/^(low|medium|high)$/);
      expect(contract.verbosity).toMatch(/^(terse|balanced|explanatory)$/);
      expect(contract.drilldownTendency).toMatch(/^(low|medium|high)$/);
      expect(contract.transitionStyle).toMatch(/^(abrupt|smooth|narrative)$/);
      expect(contract.challengeStyle).toMatch(/^(direct|compare_contrast|scenario_pressure)$/);
      expect(contract.correctionStyle).toMatch(/^(blunt|neutral|teaching)$/);
      expect(contract.patience).toMatch(/^(low|medium|high)$/);
      expect(contract.version).toBe(1);
    }
  });

  it('personas are meaningfully different from each other', () => {
    const contracts = ALL_PERSONA_KEYS.map(k => PERSONA_CONTRACTS[k]);
    // Check that at least 3 dimensions differ between each pair
    for (let i = 0; i < contracts.length; i++) {
      for (let j = i + 1; j < contracts.length; j++) {
        const a = contracts[i];
        const b = contracts[j];
        const dims: (keyof PersonaContractV1)[] = [
          'warmth', 'strictness', 'verbosity', 'drilldownTendency',
          'transitionStyle', 'challengeStyle', 'correctionStyle', 'patience',
        ];
        const diffs = dims.filter(d => a[d] !== b[d]).length;
        expect(diffs, `${a.personaKey} vs ${b.personaKey} differ in only ${diffs} dimensions`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('supportive_coach is warm and patient', () => {
    const c = PERSONA_CONTRACTS.supportive_coach;
    expect(c.warmth).toBe('high');
    expect(c.patience).toBe('high');
    expect(c.strictness).toBe('low');
    expect(c.correctionStyle).toBe('teaching');
  });

  it('strict_dpe is strict and terse', () => {
    const c = PERSONA_CONTRACTS.strict_dpe;
    expect(c.strictness).toBe('high');
    expect(c.verbosity).toBe('terse');
    expect(c.patience).toBe('low');
    expect(c.correctionStyle).toBe('blunt');
  });

  it('quiet_methodical is balanced', () => {
    const c = PERSONA_CONTRACTS.quiet_methodical;
    expect(c.warmth).toBe('medium');
    expect(c.strictness).toBe('medium');
    expect(c.verbosity).toBe('balanced');
    expect(c.transitionStyle).toBe('smooth');
  });

  it('scenario_challenger uses scenario pressure', () => {
    const c = PERSONA_CONTRACTS.scenario_challenger;
    expect(c.challengeStyle).toBe('scenario_pressure');
    expect(c.drilldownTendency).toBe('high');
    expect(c.transitionStyle).toBe('narrative');
  });
});

// ================================================================
// 2. Contract Retrieval
// ================================================================

describe('getPersonaContract', () => {
  it('returns correct contract for each key', () => {
    for (const key of ALL_PERSONA_KEYS) {
      const contract = getPersonaContract(key);
      expect(contract.personaKey).toBe(key);
      expect(contract.version).toBe(1);
    }
  });
});

// ================================================================
// 3. Persona Resolution
// ================================================================

describe('resolvePersonaKey', () => {
  it('resolves direct persona key strings', () => {
    expect(resolvePersonaKey('supportive_coach')).toBe('supportive_coach');
    expect(resolvePersonaKey('strict_dpe')).toBe('strict_dpe');
    expect(resolvePersonaKey('quiet_methodical')).toBe('quiet_methodical');
    expect(resolvePersonaKey('scenario_challenger')).toBe('scenario_challenger');
  });

  it('resolves voice persona_id strings', () => {
    expect(resolvePersonaKey('bob_mitchell')).toBe('supportive_coach');
    expect(resolvePersonaKey('jim_hayes')).toBe('strict_dpe');
    expect(resolvePersonaKey('maria_torres')).toBe('quiet_methodical');
    expect(resolvePersonaKey('karen_sullivan')).toBe('scenario_challenger');
  });

  it('defaults to quiet_methodical for undefined', () => {
    expect(resolvePersonaKey(undefined)).toBe('quiet_methodical');
  });

  it('defaults to quiet_methodical for unknown string', () => {
    expect(resolvePersonaKey('unknown_persona')).toBe('quiet_methodical');
  });
});

// ================================================================
// 4. Voice Map Consistency
// ================================================================

describe('voice map consistency', () => {
  it('every persona key has a voice mapping', () => {
    for (const key of ALL_PERSONA_KEYS) {
      expect(PERSONA_VOICE_MAP[key]).toBeDefined();
      expect(typeof PERSONA_VOICE_MAP[key]).toBe('string');
    }
  });

  it('reverse map is consistent with forward map', () => {
    for (const [personaKey, voiceId] of Object.entries(PERSONA_VOICE_MAP)) {
      expect(VOICE_TO_PERSONA_MAP[voiceId]).toBe(personaKey);
    }
  });

  it('maps all 4 voice personas', () => {
    expect(Object.keys(PERSONA_VOICE_MAP).length).toBe(4);
    expect(Object.keys(VOICE_TO_PERSONA_MAP).length).toBe(4);
  });
});

// ================================================================
// 5. Prompt Formatting
// ================================================================

describe('formatPersonaForExaminer', () => {
  it('produces non-empty output for all personas', () => {
    for (const key of ALL_PERSONA_KEYS) {
      const contract = PERSONA_CONTRACTS[key];
      const formatted = formatPersonaForExaminer(contract);
      expect(formatted.length).toBeGreaterThan(200);
    }
  });

  it('includes the contract header', () => {
    const formatted = formatPersonaForExaminer(PERSONA_CONTRACTS.supportive_coach);
    expect(formatted).toContain('EXAMINER PERSONALITY CONTRACT');
    expect(formatted).toContain('style only');
  });

  it('includes the persona label', () => {
    const formatted = formatPersonaForExaminer(PERSONA_CONTRACTS.strict_dpe);
    expect(formatted).toContain('Strict DPE');
  });

  it('includes all 8 style dimensions', () => {
    const formatted = formatPersonaForExaminer(PERSONA_CONTRACTS.scenario_challenger);
    expect(formatted).toContain('Warmth:');
    expect(formatted).toContain('Precision Standards:');
    expect(formatted).toContain('Communication:');
    expect(formatted).toContain('Follow-Up Approach:');
    expect(formatted).toContain('Topic Transitions:');
    expect(formatted).toContain('Question Framing:');
    expect(formatted).toContain('Error Correction:');
    expect(formatted).toContain('Pacing:');
  });

  it('includes persona boundary enforcement', () => {
    const formatted = formatPersonaForExaminer(PERSONA_CONTRACTS.supportive_coach);
    expect(formatted).toContain('PERSONA BOUNDARIES (immutable)');
    expect(formatted).toContain('STYLE and PROBING STRATEGY only');
    expect(formatted).toContain('Grounding Contract');
    expect(formatted).toContain('Depth/Difficulty Contract');
  });

  it('explicitly forbids changing grading standards', () => {
    // Persona must state that grading is off-limits
    const formatted = formatPersonaForExaminer(PERSONA_CONTRACTS.strict_dpe);
    expect(formatted).toContain('Do NOT change factual content');
    expect(formatted).toContain('grading standards');
  });

  it('produces different output for different personas', () => {
    const outputs = ALL_PERSONA_KEYS.map(k => formatPersonaForExaminer(PERSONA_CONTRACTS[k]));
    // Each pair should be different
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        expect(outputs[i]).not.toBe(outputs[j]);
      }
    }
  });
});

// ================================================================
// 6. Persona Summary (for monitoring)
// ================================================================

describe('personaSummary', () => {
  it('returns all expected fields', () => {
    const summary = personaSummary(PERSONA_CONTRACTS.supportive_coach);
    expect(summary.persona_key).toBe('supportive_coach');
    expect(summary.persona_label).toBe('Supportive Coach');
    expect(summary.warmth).toBe('high');
    expect(summary.strictness).toBe('low');
    expect(summary.verbosity).toBe('explanatory');
    expect(summary.drilldown).toBe('low');
    expect(summary.transition).toBe('narrative');
    expect(summary.challenge).toBe('compare_contrast');
    expect(summary.correction).toBe('teaching');
    expect(summary.patience).toBe('high');
  });

  it('works for all personas', () => {
    for (const key of ALL_PERSONA_KEYS) {
      const summary = personaSummary(PERSONA_CONTRACTS[key]);
      expect(Object.keys(summary).length).toBe(10);
      expect(summary.persona_key).toBe(key);
    }
  });
});

// ================================================================
// 7. Determinism
// ================================================================

describe('persona determinism', () => {
  it('same key always produces identical contract', () => {
    for (const key of ALL_PERSONA_KEYS) {
      const a = getPersonaContract(key);
      const b = getPersonaContract(key);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('same contract always produces identical formatted output', () => {
    for (const key of ALL_PERSONA_KEYS) {
      const contract = PERSONA_CONTRACTS[key];
      const a = formatPersonaForExaminer(contract);
      const b = formatPersonaForExaminer(contract);
      expect(a).toBe(b);
    }
  });
});
