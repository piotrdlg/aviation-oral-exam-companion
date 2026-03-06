import { describe, it, expect, vi } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

// --- Imports (after mocks) ---

import {
  computeVerificationResult,
  type FaaCandidate,
  type VerificationInput,
  type VerificationResult,
} from '../instructor-verification';

// --- Test Helpers ---

function makeCandidate(overrides: Partial<FaaCandidate> = {}): FaaCandidate {
  return {
    faaUniqueId: 'FAA-001',
    firstName: 'JOHN',
    lastName: 'SMITH',
    city: 'JACKSONVILLE',
    state: 'FL',
    certTypes: ['F'],
    certLevels: ['AIRPLANE SINGLE ENGINE LAND'],
    ...overrides,
  };
}

function makeInput(overrides: Partial<VerificationInput> = {}): VerificationInput {
  return {
    firstName: 'John',
    lastName: 'Smith',
    certificateNumber: '12345678',
    certificateType: 'CFI',
    ...overrides,
  };
}

// ================================================================
// TESTS
// ================================================================

describe('instructor-verification: computeVerificationResult', () => {
  // ---------------------------------------------------------------
  // Group 1: No FAA data
  // ---------------------------------------------------------------
  describe('when hasFaaData is false', () => {
    it('returns confidence=none, status=needs_manual_review, and faa_data_not_available reason', () => {
      const result = computeVerificationResult(makeInput(), [], false);

      expect(result.confidence).toBe('none');
      expect(result.status).toBe('needs_manual_review');
      expect(result.reasonCodes).toContain('faa_data_not_available');
      expect(result.candidates).toEqual([]);
      expect(result.explanation).toContain('No FAA airmen data');
    });
  });

  // ---------------------------------------------------------------
  // Group 2: No candidates
  // ---------------------------------------------------------------
  describe('when candidates are empty and hasFaaData is true', () => {
    it('returns confidence=none, status=no_match, and no_name_match reason', () => {
      const result = computeVerificationResult(makeInput(), [], true);

      expect(result.confidence).toBe('none');
      expect(result.status).toBe('no_match');
      expect(result.reasonCodes).toContain('no_name_match');
    });

    it('includes the input name in the explanation', () => {
      const result = computeVerificationResult(
        makeInput({ firstName: 'Jane', lastName: 'Doe' }),
        [],
        true,
      );

      expect(result.explanation).toContain('JANE');
      expect(result.explanation).toContain('DOE');
    });
  });

  // ---------------------------------------------------------------
  // Group 3: HIGH confidence (auto-approve path)
  // ---------------------------------------------------------------
  describe('HIGH confidence — single exact name + cert type match', () => {
    it('returns confidence=high and status=verified_auto', () => {
      const candidate = makeCandidate();
      const result = computeVerificationResult(makeInput(), [candidate], true);

      expect(result.confidence).toBe('high');
      expect(result.status).toBe('verified_auto');
      expect(result.candidates).toEqual([candidate]);
    });

    it('includes unique_name_certtype_match and certificate_number_unverifiable reason codes', () => {
      const result = computeVerificationResult(makeInput(), [makeCandidate()], true);

      expect(result.reasonCodes).toContain('unique_name_certtype_match');
      expect(result.reasonCodes).toContain('certificate_number_unverifiable');
    });

    it('includes the candidate name and location in the explanation', () => {
      const candidate = makeCandidate({ city: 'MIAMI', state: 'FL' });
      const result = computeVerificationResult(makeInput(), [candidate], true);

      expect(result.explanation).toContain('JOHN');
      expect(result.explanation).toContain('SMITH');
      expect(result.explanation).toContain('MIAMI');
      expect(result.explanation).toContain('FL');
    });
  });

  // ---------------------------------------------------------------
  // Group 4: Multiple candidates (MEDIUM)
  // ---------------------------------------------------------------
  describe('MEDIUM confidence — multiple exact name matches with cert', () => {
    it('returns confidence=medium and status=needs_manual_review for two exact matches', () => {
      const candidate1 = makeCandidate({ faaUniqueId: 'FAA-001', city: 'MIAMI' });
      const candidate2 = makeCandidate({ faaUniqueId: 'FAA-002', city: 'TAMPA' });

      const result = computeVerificationResult(makeInput(), [candidate1, candidate2], true);

      expect(result.confidence).toBe('medium');
      expect(result.status).toBe('needs_manual_review');
      expect(result.reasonCodes).toContain('multiple_candidates');
    });
  });

  // ---------------------------------------------------------------
  // Group 5: Name match but wrong cert type
  // ---------------------------------------------------------------
  describe('name match but wrong certificate type', () => {
    it('returns confidence=medium when candidate has an instructor cert but wrong specific type', () => {
      // User claims CFII, candidate has F cert but only AIRPLANE SINGLE ENGINE LAND (no INSTRUMENT)
      const candidate = makeCandidate({
        certTypes: ['F'],
        certLevels: ['AIRPLANE SINGLE ENGINE LAND'],
      });
      const input = makeInput({ certificateType: 'CFII' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('medium');
      expect(result.status).toBe('needs_manual_review');
      expect(result.reasonCodes).toContain('name_match_no_instructor_cert');
    });

    it('returns confidence=low when candidate has no instructor cert at all', () => {
      // Candidate has pilot cert (P) but no instructor cert (F or G)
      const candidate = makeCandidate({
        certTypes: ['P'],
        certLevels: ['PRIVATE PILOT'],
      });

      const result = computeVerificationResult(makeInput(), [candidate], true);

      expect(result.confidence).toBe('low');
      expect(result.status).toBe('needs_manual_review');
      expect(result.reasonCodes).toContain('name_match_no_instructor_cert');
    });
  });

  // ---------------------------------------------------------------
  // Group 6: Partial name matches
  // ---------------------------------------------------------------
  describe('partial name matches', () => {
    it('returns confidence=medium with partial_name_match for initial match with cert', () => {
      // Input "J" should partial-match candidate "JOHN"
      const candidate = makeCandidate({ firstName: 'JOHN' });
      const input = makeInput({ firstName: 'J' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('medium');
      expect(result.status).toBe('needs_manual_review');
      expect(result.reasonCodes).toContain('partial_name_match');
    });

    it('returns confidence=low for partial name match without instructor cert', () => {
      const candidate = makeCandidate({
        firstName: 'JOHN',
        certTypes: ['P'],
        certLevels: ['PRIVATE PILOT'],
      });
      const input = makeInput({ firstName: 'J' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('low');
      expect(result.status).toBe('needs_manual_review');
      expect(result.reasonCodes).toContain('partial_name_match');
      expect(result.reasonCodes).toContain('name_match_no_instructor_cert');
    });
  });

  // ---------------------------------------------------------------
  // Group 7: Exact match + partial match prevents auto-approve
  // ---------------------------------------------------------------
  describe('exact match plus partial match — guards against auto-approve', () => {
    it('does NOT return high confidence when a partial match is also present', () => {
      // One exact match with cert + one partial match
      const exactCandidate = makeCandidate({ faaUniqueId: 'FAA-001', firstName: 'JOHN' });
      const partialCandidate = makeCandidate({
        faaUniqueId: 'FAA-002',
        firstName: 'JOHNNY',
        city: 'ORLANDO',
      });
      const input = makeInput({ firstName: 'John' });

      const result = computeVerificationResult(input, [exactCandidate, partialCandidate], true);

      // hasPartialMatch is true because "JOHNNY" starts with "john", so HIGH confidence is blocked
      expect(result.confidence).not.toBe('high');
      expect(result.status).not.toBe('verified_auto');
    });
  });

  // ---------------------------------------------------------------
  // Group 8: Edge cases
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('returns no_match when input first name is empty', () => {
      const candidate = makeCandidate();
      const input = makeInput({ firstName: '' });

      const result = computeVerificationResult(input, [candidate], true);

      // firstNameMatchType returns false for empty first name
      expect(result.confidence).toBe('none');
      expect(result.status).toBe('no_match');
      expect(result.reasonCodes).toContain('no_name_match');
    });

    it('CFI maps correctly — no levelKeywords needed', () => {
      // CFI requires only 'F' cert type, no keyword check
      const candidate = makeCandidate({
        certTypes: ['F'],
        certLevels: ['AIRPLANE SINGLE ENGINE LAND'],
      });
      const input = makeInput({ certificateType: 'CFI' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('high');
      expect(result.status).toBe('verified_auto');
    });

    it('CFII requires INSTRUMENT keyword in cert level', () => {
      // Candidate has F cert with INSTRUMENT in level — should match CFII
      const candidate = makeCandidate({
        certTypes: ['F'],
        certLevels: ['AIRPLANE SINGLE ENGINE LAND INSTRUMENT AIRPLANE'],
      });
      const input = makeInput({ certificateType: 'CFII' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('high');
      expect(result.status).toBe('verified_auto');
    });

    it('MEI requires MULTI keyword in cert level', () => {
      const candidate = makeCandidate({
        certTypes: ['F'],
        certLevels: ['AIRPLANE MULTI ENGINE LAND'],
      });
      const input = makeInput({ certificateType: 'MEI' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('high');
      expect(result.status).toBe('verified_auto');
    });

    it('AGI requires G cert type and ADVANCED keyword', () => {
      const candidate = makeCandidate({
        certTypes: ['G'],
        certLevels: ['ADVANCED GROUND INSTRUCTOR'],
      });
      const input = makeInput({ certificateType: 'AGI' });

      const result = computeVerificationResult(input, [candidate], true);

      expect(result.confidence).toBe('high');
      expect(result.status).toBe('verified_auto');
    });

    it('every result includes certificate_number_unverifiable in reasonCodes', () => {
      // Test across multiple scenarios
      const scenarios: Array<{ candidates: FaaCandidate[]; hasFaaData: boolean }> = [
        { candidates: [], hasFaaData: false },
        { candidates: [], hasFaaData: true },
        { candidates: [makeCandidate()], hasFaaData: true },
        {
          candidates: [makeCandidate({ certTypes: ['P'], certLevels: ['PRIVATE PILOT'] })],
          hasFaaData: true,
        },
      ];

      for (const scenario of scenarios) {
        const result = computeVerificationResult(
          makeInput(),
          scenario.candidates,
          scenario.hasFaaData,
        );
        expect(result.reasonCodes).toContain('certificate_number_unverifiable');
      }
    });
  });

  // ---------------------------------------------------------------
  // Group 9: Result structure
  // ---------------------------------------------------------------
  describe('result structure', () => {
    it('all results have dataSource=faa_database', () => {
      const results: VerificationResult[] = [
        computeVerificationResult(makeInput(), [], false),
        computeVerificationResult(makeInput(), [], true),
        computeVerificationResult(makeInput(), [makeCandidate()], true),
      ];

      for (const result of results) {
        expect(result.dataSource).toBe('faa_database');
      }
    });

    it('all results have attemptedAt as an ISO timestamp', () => {
      const result = computeVerificationResult(makeInput(), [makeCandidate()], true);

      // ISO 8601 format check — should be parseable and produce a valid date
      const parsed = new Date(result.attemptedAt);
      expect(parsed.getTime()).not.toBeNaN();
      // Should contain 'T' and 'Z' as expected in ISO format
      expect(result.attemptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
