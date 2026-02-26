import { describe, it, expect, vi } from 'vitest';

// Mock 'server-only' since graph-retrieval.ts imports it
vi.mock('server-only', () => ({}));

// Mock @supabase/supabase-js to avoid module-level createClient call
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

import { formatBundleForPrompt, type ConceptBundleRow } from '../graph-retrieval';

/**
 * Helper to construct a ConceptBundleRow with sensible defaults.
 */
function makeBundleRow(overrides: Partial<ConceptBundleRow> = {}): ConceptBundleRow {
  return {
    concept_id: 'concept-001',
    concept_name: 'Test Concept',
    concept_category: 'topic',
    concept_content: 'This is a test concept.',
    key_facts: [],
    common_misconceptions: [],
    depth: 0,
    relation_type: null,
    examiner_transition: null,
    evidence_chunks: null,
    ...overrides,
  };
}

describe('formatBundleForPrompt', () => {
  it('returns empty string for empty bundle', () => {
    expect(formatBundleForPrompt([])).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatBundleForPrompt(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatBundleForPrompt(undefined as any)).toBe('');
  });

  it('formats regulatory claims with CFR references', () => {
    const bundle = [
      makeBundleRow({
        concept_category: 'regulatory_claim',
        concept_name: 'Currency Requirements',
        concept_content: 'Pilot must have 3 takeoffs and landings in 90 days.',
        key_facts: ['14 CFR 61.57', 'Recent experience requirements'],
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('REGULATORY REQUIREMENTS:');
    expect(result).toContain('[14 CFR 61.57]');
    expect(result).toContain('Pilot must have 3 takeoffs and landings in 90 days.');
  });

  it('formats regulatory claims without CFR reference', () => {
    const bundle = [
      makeBundleRow({
        concept_category: 'regulatory_claim',
        concept_content: 'Must carry medical certificate.',
        key_facts: ['General requirement'],
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('REGULATORY REQUIREMENTS:');
    expect(result).toContain('- Must carry medical certificate.');
    expect(result).not.toContain('[');
  });

  it('formats topics under KEY CONCEPTS section', () => {
    const bundle = [
      makeBundleRow({
        concept_category: 'topic',
        concept_name: 'Aerodynamics',
        concept_content: 'Study of forces acting on aircraft in flight.',
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('KEY CONCEPTS:');
    expect(result).toContain('- Aerodynamics: Study of forces acting on aircraft in flight.');
  });

  it('formats definitions under both KEY CONCEPTS and DEFINITIONS sections', () => {
    const bundle = [
      makeBundleRow({
        concept_category: 'definition',
        concept_name: 'Stall',
        concept_content: 'Loss of lift due to exceeding critical angle of attack.',
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('KEY CONCEPTS:');
    expect(result).toContain('DEFINITIONS:');
    // Should appear in both sections
    const matches = result.split('- Stall: Loss of lift due to exceeding critical angle of attack.');
    expect(matches.length).toBe(3); // 2 occurrences = 3 splits
  });

  it('collects and deduplicates misconceptions', () => {
    const bundle = [
      makeBundleRow({
        concept_name: 'Concept A',
        common_misconceptions: ['Stalls only happen at low speed', 'Trim changes airspeed'],
      }),
      makeBundleRow({
        concept_name: 'Concept B',
        common_misconceptions: ['Stalls only happen at low speed', 'Flaps increase stall speed'],
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('COMMON STUDENT ERRORS (probe for these):');
    // "Stalls only happen at low speed" should appear exactly once
    const misconceptionSection = result.split('COMMON STUDENT ERRORS (probe for these):')[1];
    const occurrences = misconceptionSection.split('Stalls only happen at low speed').length - 1;
    expect(occurrences).toBe(1);
    expect(result).toContain('Trim changes airspeed');
    expect(result).toContain('Flaps increase stall speed');
  });

  it('includes examiner transitions under SUGGESTED FOLLOW-UP DIRECTIONS', () => {
    const bundle = [
      makeBundleRow({
        relation_type: 'leads_to_discussion_of',
        examiner_transition: 'Now let us discuss weather minimums.',
      }),
      makeBundleRow({
        relation_type: 'leads_to_discussion_of',
        examiner_transition: 'That brings us to airspace requirements.',
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('SUGGESTED FOLLOW-UP DIRECTIONS:');
    expect(result).toContain('- Now let us discuss weather minimums.');
    expect(result).toContain('- That brings us to airspace requirements.');
  });

  it('excludes transitions with non-matching relation_type', () => {
    const bundle = [
      makeBundleRow({
        relation_type: 'is_component_of',
        examiner_transition: 'This should not appear.',
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).not.toContain('SUGGESTED FOLLOW-UP DIRECTIONS:');
    expect(result).not.toContain('This should not appear.');
  });

  it('includes evidence citations under REFERENCES', () => {
    const bundle = [
      makeBundleRow({
        evidence_chunks: [
          {
            chunk_id: 'c1',
            content: 'Some text',
            doc_title: 'FAR/AIM',
            page_ref: 'p. 42',
            confidence: 0.95,
          },
          {
            chunk_id: 'c2',
            content: 'More text',
            doc_title: 'PHAK',
            page_ref: null,
            confidence: 0.88,
          },
        ],
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('REFERENCES:');
    expect(result).toContain('(FAR/AIM, p. 42)');
    expect(result).toContain('(PHAK)');
  });

  it('handles full bundle with all concept categories', () => {
    const bundle = [
      makeBundleRow({
        concept_category: 'regulatory_claim',
        concept_name: 'Reg 1',
        concept_content: 'Regulatory content.',
        key_facts: ['14 CFR 91.103'],
      }),
      makeBundleRow({
        concept_category: 'topic',
        concept_name: 'Topic 1',
        concept_content: 'Topic content.',
      }),
      makeBundleRow({
        concept_category: 'definition',
        concept_name: 'Def 1',
        concept_content: 'Definition content.',
      }),
      makeBundleRow({
        concept_category: 'procedure',
        concept_name: 'Proc 1',
        concept_content: 'Procedure content.',
        common_misconceptions: ['Common mistake here'],
        relation_type: 'leads_to_discussion_of',
        examiner_transition: 'Moving on to the next topic.',
        evidence_chunks: [
          {
            chunk_id: 'e1',
            content: 'Evidence text',
            doc_title: 'AFH',
            page_ref: 'Ch. 5',
            confidence: 0.92,
          },
        ],
      }),
    ];

    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('REGULATORY REQUIREMENTS:');
    expect(result).toContain('KEY CONCEPTS:');
    expect(result).toContain('DEFINITIONS:');
    expect(result).toContain('COMMON STUDENT ERRORS (probe for these):');
    expect(result).toContain('SUGGESTED FOLLOW-UP DIRECTIONS:');
    expect(result).toContain('REFERENCES:');
  });

  it('handles bundle with only one category (topics only)', () => {
    const bundle = [
      makeBundleRow({
        concept_category: 'topic',
        concept_name: 'Weather',
        concept_content: 'Weather patterns and forecasting.',
      }),
      makeBundleRow({
        concept_category: 'topic',
        concept_name: 'Navigation',
        concept_content: 'Pilotage and dead reckoning.',
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('KEY CONCEPTS:');
    expect(result).toContain('- Weather: Weather patterns and forecasting.');
    expect(result).toContain('- Navigation: Pilotage and dead reckoning.');
    expect(result).not.toContain('REGULATORY REQUIREMENTS:');
    expect(result).not.toContain('DEFINITIONS:');
    expect(result).not.toContain('COMMON STUDENT ERRORS');
    expect(result).not.toContain('SUGGESTED FOLLOW-UP DIRECTIONS:');
    expect(result).not.toContain('REFERENCES:');
  });

  it('limits misconceptions to 10 entries', () => {
    const misconceptions = Array.from({ length: 15 }, (_, i) => `Misconception ${i + 1}`);
    const bundle = [
      makeBundleRow({
        common_misconceptions: misconceptions,
      }),
    ];
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('Misconception 1');
    expect(result).toContain('Misconception 10');
    expect(result).not.toContain('Misconception 11');
    expect(result).not.toContain('Misconception 15');
  });

  it('limits transitions to 5 entries', () => {
    const bundle = Array.from({ length: 8 }, (_, i) =>
      makeBundleRow({
        relation_type: 'leads_to_discussion_of',
        examiner_transition: `Transition ${i + 1}`,
      })
    );
    const result = formatBundleForPrompt(bundle);
    expect(result).toContain('Transition 1');
    expect(result).toContain('Transition 5');
    expect(result).not.toContain('Transition 6');
    expect(result).not.toContain('Transition 8');
  });
});
