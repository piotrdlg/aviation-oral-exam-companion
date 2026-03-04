/**
 * Rating Parity Tests
 *
 * Verifies that all 3 active ratings (private, commercial, instrument)
 * are supported equally across every subsystem that handles rating.
 *
 * These tests are regression guards — if any subsystem adds Private or
 * Instrument handling without also handling Commercial, these will fail.
 */
import { describe, it, expect } from 'vitest';
import type { Rating, Difficulty } from '@/types/database';

const RATINGS: Rating[] = ['private', 'commercial', 'instrument'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'mixed'];

// ================================================================
// 1. Depth Profiles — all 3 ratings have distinct profiles
// ================================================================

describe('depth profile parity', () => {
  it('DEPTH_PROFILES has entries for all 3 ratings', async () => {
    const { DEPTH_PROFILES } = await import('../depth-profile');
    for (const rating of RATINGS) {
      expect(DEPTH_PROFILES[rating], `Missing depth profile for ${rating}`).toBeDefined();
      expect(DEPTH_PROFILES[rating].rating).toBe(rating);
    }
  });

  it('each rating has distinct expectedDepth', async () => {
    const { DEPTH_PROFILES } = await import('../depth-profile');
    const depths = RATINGS.map(r => DEPTH_PROFILES[r].expectedDepth);
    // All three should be different
    expect(new Set(depths).size).toBe(3);
  });

  it('getDepthProfile returns valid profile for all ratings', async () => {
    const { getDepthProfile } = await import('../depth-profile');
    for (const rating of RATINGS) {
      const profile = getDepthProfile(rating);
      expect(profile.rating).toBe(rating);
      expect(profile.expectedDepth.length).toBeGreaterThan(0);
      expect(profile.regulatoryPrecision.length).toBeGreaterThan(0);
      expect(profile.partialTolerance.length).toBeGreaterThan(0);
    }
  });
});

// ================================================================
// 2. Difficulty Contracts — all 3 ratings build valid contracts
// ================================================================

describe('difficulty contract parity', () => {
  it('builds contract for all rating x difficulty combinations', async () => {
    const { buildDepthDifficultyContract } = await import('../difficulty-contract');
    for (const rating of RATINGS) {
      for (const difficulty of DIFFICULTIES) {
        const contract = buildDepthDifficultyContract(rating, difficulty);
        expect(contract.rating, `Missing rating in ${rating}/${difficulty}`).toBe(rating);
        expect(contract.difficulty).toBe(difficulty);
        expect(contract.targetDepth.length).toBeGreaterThan(0);
        expect(contract.requiredPrecision.length).toBeGreaterThan(0);
        expect(contract.partialTolerance.length).toBeGreaterThan(0);
      }
    }
  });

  it('formatContractForExaminer produces output for all ratings', async () => {
    const { buildDepthDifficultyContract, formatContractForExaminer } = await import('../difficulty-contract');
    for (const rating of RATINGS) {
      const contract = buildDepthDifficultyContract(rating, 'medium');
      const formatted = formatContractForExaminer(contract);
      expect(formatted.length, `Empty examiner format for ${rating}`).toBeGreaterThan(100);
      expect(formatted).toContain('DEPTH & DIFFICULTY CONTRACT');
    }
  });

  it('formatContractForAssessment produces output for all ratings', async () => {
    const { buildDepthDifficultyContract, formatContractForAssessment } = await import('../difficulty-contract');
    for (const rating of RATINGS) {
      const contract = buildDepthDifficultyContract(rating, 'medium');
      const formatted = formatContractForAssessment(contract);
      expect(formatted.length, `Empty assessment format for ${rating}`).toBeGreaterThan(100);
      expect(formatted).toContain('GRADING CALIBRATION CONTRACT');
    }
  });
});

// ================================================================
// 3. Area Keywords — all 3 ratings have working keyword maps
// ================================================================

describe('area keyword parity', () => {
  it('getAreaKeywords returns non-empty for all oral exam areas per rating', async () => {
    const { getAreaKeywords } = await import('../citation-relevance');
    const { ORAL_EXAM_AREA_PREFIXES } = await import('../exam-logic');

    for (const rating of RATINGS) {
      const areaPrefixes = ORAL_EXAM_AREA_PREFIXES[rating];
      for (const prefix of areaPrefixes) {
        // Extract area roman numeral from prefix like "CA.VIII."
        const area = prefix.split('.')[1];
        const keywords = getAreaKeywords(area, rating);
        expect(
          keywords.length,
          `No keywords for ${rating} area ${area}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('commercial Area VIII uses high-altitude keywords, not instrument keywords', async () => {
    const { getAreaKeywords } = await import('../citation-relevance');
    const keywords = getAreaKeywords('VIII', 'commercial');
    expect(keywords).toContain('pressurization');
    expect(keywords).toContain('high altitude');
    expect(keywords).toContain('oxygen');
    // Should NOT have private VIII keywords
    expect(keywords).not.toContain('basic attitude');
    expect(keywords).not.toContain('night vision');
  });

  it('commercial Area IX uses emergency keywords', async () => {
    const { getAreaKeywords } = await import('../citation-relevance');
    const keywords = getAreaKeywords('IX', 'commercial');
    expect(keywords).toContain('emergency');
    expect(keywords).toContain('engine failure');
    // Should NOT have postflight keywords
    expect(keywords).not.toContain('tiedown');
  });

  it('commercial Area XI uses postflight keywords', async () => {
    const { getAreaKeywords } = await import('../citation-relevance');
    const keywords = getAreaKeywords('XI', 'commercial');
    expect(keywords).toContain('postflight');
    expect(keywords).toContain('securing');
    // Should NOT have aeromedical (Private XI) keywords
    expect(keywords).not.toContain('hypoxia');
  });

  it('commercial Area I includes commercial privilege keywords', async () => {
    const { getAreaKeywords } = await import('../citation-relevance');
    const keywords = getAreaKeywords('I', 'commercial');
    expect(keywords).toContain('commercial');
    expect(keywords).toContain('privilege');
    expect(keywords).toContain('limitation');
    // Should also have standard preflight keywords
    expect(keywords).toContain('preflight');
    expect(keywords).toContain('airworthiness');
  });
});

// ================================================================
// 4. Structural Fingerprints — all 3 ratings produce fingerprints
// ================================================================

describe('structural fingerprint parity', () => {
  it('builds fingerprints for elements of all 3 ratings', async () => {
    const { buildStructuralFingerprints } = await import('../structural-fingerprints');
    const testElements = [
      'PA.I.A.K1',  // Private
      'CA.I.A.K1',  // Commercial
      'IR.I.A.K1',  // Instrument
    ];
    const fps = buildStructuralFingerprints(testElements);
    for (const code of testElements) {
      expect(fps.has(code), `No fingerprint for ${code}`).toBe(true);
      expect(fps.get(code)!.size, `Empty fingerprint for ${code}`).toBeGreaterThan(0);
    }
  });

  it('commercial fingerprints use commercial-specific keywords for Area VIII', async () => {
    const { buildStructuralFingerprints } = await import('../structural-fingerprints');
    const fps = buildStructuralFingerprints(['CA.VIII.A.K1']);
    const slugs = fps.get('CA.VIII.A.K1')!;
    expect(slugs.has('topic:pressurization')).toBe(true);
    expect(slugs.has('topic:high altitude')).toBe(true);
    // Should not have Private VIII topics
    expect(slugs.has('topic:basic attitude')).toBe(false);
  });
});

// ================================================================
// 5. Transition Explanations — all 3 ratings have area labels
// ================================================================

describe('transition explanation parity', () => {
  it('generates transitions for all 3 ratings', async () => {
    const { generateTransition } = await import('../transition-explanation');
    const tests: [string, string, string][] = [
      ['PA.I.A.K1', 'PA.VI.A.K1', 'private'],
      ['CA.I.A.K1', 'CA.VI.A.K1', 'commercial'],
      ['IR.I.A.K1', 'IR.V.A.K1', 'instrument'],
    ];
    for (const [from, to, rating] of tests) {
      const result = generateTransition(from, to, rating);
      expect(result, `No transition for ${rating}`).not.toBeNull();
      expect(result!.sameArea).toBe(false);
      expect(result!.sentence.length).toBeGreaterThan(10);
    }
  });

  it('commercial Area VIII label is High-Altitude Operations', async () => {
    const { generateTransition } = await import('../transition-explanation');
    const result = generateTransition('CA.I.A.K1', 'CA.VIII.A.K1', 'commercial');
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('High-Altitude Operations');
  });
});

// ================================================================
// 6. ORAL_EXAM_AREA_PREFIXES — all 3 ratings have non-empty area lists
// ================================================================

describe('oral exam area parity', () => {
  it('all 3 ratings have non-empty area prefix lists', async () => {
    const { ORAL_EXAM_AREA_PREFIXES } = await import('../exam-logic');
    for (const rating of RATINGS) {
      expect(
        ORAL_EXAM_AREA_PREFIXES[rating].length,
        `No oral exam areas for ${rating}`
      ).toBeGreaterThan(0);
    }
  });
});

// ================================================================
// 7. Rating Labels — buildSystemPrompt handles all 3 ratings
// ================================================================

describe('system prompt rating parity', () => {
  it('buildSystemPrompt produces different exam names for all 3 ratings', async () => {
    const { buildSystemPrompt } = await import('../exam-logic');
    const mockTask = {
      id: 'TEST.I.A',
      area: 'Test Area',
      task: 'Test Task',
      knowledge_elements: [{ code: 'TEST.I.A.K1', description: 'Test knowledge' }],
      risk_management_elements: [{ code: 'TEST.I.A.R1', description: 'Test risk' }],
      skill_elements: [],
      applicable_classes: ['ASEL' as const],
    };

    const prompts: string[] = [];
    for (const rating of RATINGS) {
      const prompt = buildSystemPrompt(mockTask, 'medium', undefined, rating);
      prompts.push(prompt);
    }

    // Each should contain its rating-specific exam name
    expect(prompts[0]).toContain('Private Pilot');
    expect(prompts[1]).toContain('Commercial Pilot');
    expect(prompts[2]).toContain('Instrument Rating');
  });
});

// ================================================================
// 8. Critical Areas (grading) — all 3 ratings defined
// ================================================================

describe('grading parity', () => {
  it('CRITICAL_AREAS_BY_RATING has entries for all 3 ratings', async () => {
    const { CRITICAL_AREAS_BY_RATING } = await import('../exam-result');
    for (const rating of RATINGS) {
      expect(
        CRITICAL_AREAS_BY_RATING[rating],
        `No critical areas for ${rating}`
      ).toBeDefined();
      expect(CRITICAL_AREAS_BY_RATING[rating].length).toBeGreaterThan(0);
    }
  });
});

// ================================================================
// 9. Quick Drill — all 3 ratings produce valid element queues
// ================================================================

describe('quick drill parity', () => {
  it('buildElementQueue accepts quick_drill for all 3 ratings', async () => {
    const { buildElementQueue } = await import('../exam-logic');
    // buildElementQueue takes pre-filtered elements + SessionConfig.
    // Quick drill works identically regardless of which rating's elements are passed in.
    for (const rating of RATINGS) {
      const prefix = rating === 'private' ? 'PA' : rating === 'commercial' ? 'CA' : 'IR';
      const mockElements = [
        {
          code: `${prefix}.I.A.K1`,
          description: 'Test knowledge',
          element_type: 'knowledge' as const,
          task_id: `${prefix}.I.A`,
          difficulty_default: 'medium' as const,
          order_index: 1,
          short_code: 'K1',
          weight: 1.0,
          created_at: '2026-01-01T00:00:00Z',
        },
      ];
      const config = {
        rating: rating as Rating,
        aircraftClass: 'ASEL' as const,
        studyMode: 'quick_drill' as const,
        difficulty: 'mixed' as const,
        selectedAreas: [],
        selectedTasks: [],
      };
      const queue = buildElementQueue(mockElements, config, []);
      expect(queue.length, `Empty quick_drill queue for ${rating}`).toBeGreaterThan(0);
    }
  });
});
