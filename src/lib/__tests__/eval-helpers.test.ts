import { describe, it, expect } from 'vitest';
import {
  resolveChunkAuthority,
  matchesAuthority,
  type DocMeta,
} from '../eval-helpers';

// Shared fixtures
const docMap = new Map<string, DocMeta>([
  ['doc-cfr-91', { documentType: 'cfr', abbreviation: 'cfr' }],
  ['doc-aim-ch3', { documentType: 'aim', abbreviation: 'aim' }],
  ['doc-phak-ch7', { documentType: 'handbook', abbreviation: 'phak' }],
  ['doc-ac-120', { documentType: 'ac', abbreviation: 'ac' }],
]);

describe('resolveChunkAuthority', () => {
  it('resolves doc_type from map for known document_id', () => {
    const result = resolveChunkAuthority(
      { document_id: 'doc-cfr-91', doc_abbreviation: 'cfr' },
      docMap
    );
    expect(result.docType).toBe('cfr');
    expect(result.abbreviation).toBe('cfr');
  });

  it('resolves handbook type for PHAK', () => {
    const result = resolveChunkAuthority(
      { document_id: 'doc-phak-ch7', doc_abbreviation: 'phak' },
      docMap
    );
    expect(result.docType).toBe('handbook');
    expect(result.abbreviation).toBe('phak');
  });

  it('falls back to abbreviation when document_id missing from map', () => {
    const result = resolveChunkAuthority(
      { document_id: 'unknown-doc', doc_abbreviation: 'ifh' },
      docMap
    );
    expect(result.docType).toBeNull();
    expect(result.abbreviation).toBe('ifh');
  });

  it('uses map abbreviation over chunk abbreviation', () => {
    // If map has a different abbreviation, prefer map
    const customMap = new Map<string, DocMeta>([
      ['doc-x', { documentType: 'handbook', abbreviation: 'afh' }],
    ]);
    const result = resolveChunkAuthority(
      { document_id: 'doc-x', doc_abbreviation: 'wrong' },
      customMap
    );
    expect(result.abbreviation).toBe('afh');
  });
});

describe('matchesAuthority', () => {
  it('auto-passes when neither expected field is set', () => {
    const result = matchesAuthority(
      { expected_doc_type: null, expected_abbreviation: null },
      { docType: 'cfr', abbreviation: 'cfr' }
    );
    expect(result.matched).toBe(true);
    expect(result.matchedField).toBe('any');
  });

  it('matches expected_abbreviation (case-insensitive)', () => {
    const result = matchesAuthority(
      { expected_doc_type: null, expected_abbreviation: 'AIM' },
      { docType: 'aim', abbreviation: 'aim' }
    );
    expect(result.matched).toBe(true);
    expect(result.matchedField).toBe('abbreviation');
    expect(result.matchedValue).toBe('aim');
  });

  it('fails on abbreviation mismatch', () => {
    const result = matchesAuthority(
      { expected_doc_type: null, expected_abbreviation: 'aim' },
      { docType: 'handbook', abbreviation: 'phak' }
    );
    expect(result.matched).toBe(false);
  });

  it('matches expected_doc_type via resolved docType', () => {
    const result = matchesAuthority(
      { expected_doc_type: 'cfr', expected_abbreviation: null },
      { docType: 'cfr', abbreviation: 'cfr' }
    );
    expect(result.matched).toBe(true);
    expect(result.matchedField).toBe('doc_type');
    expect(result.matchedValue).toBe('cfr');
  });

  it('fails when expected_doc_type is cfr but resolved is handbook', () => {
    const result = matchesAuthority(
      { expected_doc_type: 'cfr', expected_abbreviation: null },
      { docType: 'handbook', abbreviation: 'phak' }
    );
    expect(result.matched).toBe(false);
  });

  it('fails with unmappedDocumentId when docType is null', () => {
    const result = matchesAuthority(
      { expected_doc_type: 'cfr', expected_abbreviation: null },
      { docType: null, abbreviation: 'unknown' },
      'missing-doc-id'
    );
    expect(result.matched).toBe(false);
    expect(result.unmappedDocumentId).toBe('missing-doc-id');
  });

  it('abbreviation check takes priority over doc_type when both are set', () => {
    // When expected_abbreviation is set, doc_type is ignored
    const result = matchesAuthority(
      { expected_doc_type: 'cfr', expected_abbreviation: 'aim' },
      { docType: 'cfr', abbreviation: 'aim' }
    );
    expect(result.matched).toBe(true);
    expect(result.matchedField).toBe('abbreviation');
  });

  it('case insensitive doc_type match', () => {
    const result = matchesAuthority(
      { expected_doc_type: 'CFR', expected_abbreviation: null },
      { docType: 'cfr', abbreviation: 'cfr' }
    );
    expect(result.matched).toBe(true);
  });
});
