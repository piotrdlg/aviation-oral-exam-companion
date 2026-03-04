import { describe, it, expect } from 'vitest';
import {
  buildDepthDifficultyContract,
  formatContractForExaminer,
  formatContractForAssessment,
  contractSummary,
  type DepthDifficultyContract,
} from '../difficulty-contract';
import type { Rating, Difficulty, ElementType } from '@/types/database';

describe('buildDepthDifficultyContract', () => {
  it('produces a contract with all required fields', () => {
    const contract = buildDepthDifficultyContract('private', 'easy');
    expect(contract.rating).toBe('private');
    expect(contract.difficulty).toBe('easy');
    expect(contract.targetDepth).toBeTruthy();
    expect(contract.requiredPrecision).toBeTruthy();
    expect(contract.partialTolerance).toBeTruthy();
    expect(contract.followUpStyle).toBeTruthy();
    expect(contract.scenarioComplexity).toBeTruthy();
    expect(contract.crossHubExpectation).toBeTruthy();
  });

  it('generates contracts for all rating × difficulty combinations', () => {
    const ratings: Rating[] = ['private', 'commercial', 'instrument', 'atp'];
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'mixed'];

    for (const rating of ratings) {
      for (const difficulty of difficulties) {
        const contract = buildDepthDifficultyContract(rating, difficulty);
        expect(contract.rating).toBe(rating);
        expect(contract.difficulty).toBe(difficulty);
        expect(contract.targetDepth.length).toBeGreaterThan(50);
        expect(contract.requiredPrecision.length).toBeGreaterThan(50);
      }
    }
  });

  it('private+easy is more lenient than instrument+hard', () => {
    const lenient = buildDepthDifficultyContract('private', 'easy');
    const strict = buildDepthDifficultyContract('instrument', 'hard');

    // Private+easy should mention general/lenient
    expect(lenient.requiredPrecision.toLowerCase()).toContain('general');
    expect(lenient.partialTolerance.toLowerCase()).toContain('lenient');

    // Instrument+hard should mention high/strict
    expect(strict.requiredPrecision.toLowerCase()).toContain('high');
    expect(strict.partialTolerance.toLowerCase()).toContain('strict');
  });

  it('hard difficulty includes challenging follow-up style', () => {
    const contract = buildDepthDifficultyContract('commercial', 'hard');
    expect(contract.followUpStyle.toLowerCase()).toContain('what-if');
  });

  it('easy difficulty includes supportive follow-up style', () => {
    const contract = buildDepthDifficultyContract('commercial', 'easy');
    expect(contract.followUpStyle.toLowerCase()).toContain('supportive');
  });

  it('mixed difficulty mentions variation', () => {
    const contract = buildDepthDifficultyContract('private', 'mixed');
    expect(contract.followUpStyle.toLowerCase()).toContain('natural');
    expect(contract.scenarioComplexity.toLowerCase()).toContain('mix');
  });

  it('includes element-type guidance for knowledge elements', () => {
    const contract = buildDepthDifficultyContract('commercial', 'medium', 'knowledge');
    expect(contract.targetDepth).toContain('Element-specific');
    expect(contract.targetDepth.toLowerCase()).toContain('application');
  });

  it('includes element-type guidance for risk elements', () => {
    const contract = buildDepthDifficultyContract('commercial', 'medium', 'risk');
    expect(contract.targetDepth).toContain('Element-specific');
    expect(contract.targetDepth.toLowerCase()).toContain('risk');
  });

  it('same rating with different difficulties produces different contracts', () => {
    const easy = buildDepthDifficultyContract('private', 'easy');
    const hard = buildDepthDifficultyContract('private', 'hard');

    expect(easy.requiredPrecision).not.toBe(hard.requiredPrecision);
    expect(easy.partialTolerance).not.toBe(hard.partialTolerance);
    expect(easy.followUpStyle).not.toBe(hard.followUpStyle);
    expect(easy.scenarioComplexity).not.toBe(hard.scenarioComplexity);
  });

  it('same difficulty with different ratings produces different contracts', () => {
    const priv = buildDepthDifficultyContract('private', 'medium');
    const inst = buildDepthDifficultyContract('instrument', 'medium');

    expect(priv.targetDepth).not.toBe(inst.targetDepth);
    expect(priv.requiredPrecision).not.toBe(inst.requiredPrecision);
    expect(priv.crossHubExpectation).not.toBe(inst.crossHubExpectation);
  });

  it('is deterministic — same inputs produce same output', () => {
    const a = buildDepthDifficultyContract('commercial', 'hard', 'knowledge');
    const b = buildDepthDifficultyContract('commercial', 'hard', 'knowledge');
    expect(a).toEqual(b);
  });
});

describe('formatContractForExaminer', () => {
  it('includes contract header', () => {
    const contract = buildDepthDifficultyContract('private', 'easy');
    const formatted = formatContractForExaminer(contract);
    expect(formatted).toContain('DEPTH & DIFFICULTY CONTRACT');
  });

  it('includes all key sections', () => {
    const contract = buildDepthDifficultyContract('commercial', 'medium');
    const formatted = formatContractForExaminer(contract);
    expect(formatted).toContain('Target Depth:');
    expect(formatted).toContain('Required Precision:');
    expect(formatted).toContain('Scenario Complexity:');
    expect(formatted).toContain('Follow-Up Style:');
    expect(formatted).toContain('Cross-Topic Awareness:');
  });

  it('does not include assessment-specific tolerance', () => {
    const contract = buildDepthDifficultyContract('private', 'easy');
    const formatted = formatContractForExaminer(contract);
    expect(formatted).not.toContain('Partial Tolerance:');
  });
});

describe('formatContractForAssessment', () => {
  it('includes grading calibration header', () => {
    const contract = buildDepthDifficultyContract('instrument', 'hard');
    const formatted = formatContractForAssessment(contract);
    expect(formatted).toContain('GRADING CALIBRATION CONTRACT');
  });

  it('includes certificate level and difficulty', () => {
    const contract = buildDepthDifficultyContract('instrument', 'hard');
    const formatted = formatContractForAssessment(contract);
    expect(formatted).toContain('Certificate Level: instrument');
    expect(formatted).toContain('Difficulty: hard');
  });

  it('includes tolerance and precision', () => {
    const contract = buildDepthDifficultyContract('commercial', 'medium');
    const formatted = formatContractForAssessment(contract);
    expect(formatted).toContain('Required Precision:');
    expect(formatted).toContain('Partial Tolerance:');
    expect(formatted).toContain('Cross-Topic Awareness:');
  });

  it('does not include scenario or follow-up style (examiner-only)', () => {
    const contract = buildDepthDifficultyContract('private', 'hard');
    const formatted = formatContractForAssessment(contract);
    expect(formatted).not.toContain('Scenario Complexity:');
    expect(formatted).not.toContain('Follow-Up Style:');
  });
});

describe('contractSummary', () => {
  it('produces compact summary with character counts', () => {
    const contract = buildDepthDifficultyContract('commercial', 'hard');
    const summary = contractSummary(contract);

    expect(summary.rating).toBe('commercial');
    expect(summary.difficulty).toBe('hard');
    expect(summary.targetDepthChars).toBeGreaterThan(100);
    expect(summary.precisionChars).toBeGreaterThan(50);
    expect(summary.toleranceChars).toBeGreaterThan(50);
  });

  it('summary char counts match actual contract lengths', () => {
    const contract = buildDepthDifficultyContract('private', 'easy');
    const summary = contractSummary(contract);

    expect(summary.targetDepthChars).toBe(contract.targetDepth.length);
    expect(summary.precisionChars).toBe(contract.requiredPrecision.length);
    expect(summary.toleranceChars).toBe(contract.partialTolerance.length);
  });
});
