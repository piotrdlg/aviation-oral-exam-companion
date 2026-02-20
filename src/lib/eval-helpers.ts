/**
 * Pure helpers for the regulatory assertion evaluator.
 *
 * These live in src/lib/ so they are testable by vitest,
 * and importable from scripts/eval/ via relative path with tsx.
 */

export interface DocMeta {
  documentType: string;   // 'handbook' | 'ac' | 'cfr' | 'aim' | 'other'
  abbreviation: string;   // 'phak', 'afh', 'aim', 'cfr', etc.
}

export interface ResolvedAuthority {
  docType: string | null;
  abbreviation: string;
}

/**
 * Resolve the authoritative doc_type for a chunk by looking up its
 * document_id in the pre-loaded source_documents map.
 *
 * Falls back to abbreviation-only if document_id is missing from the map.
 */
export function resolveChunkAuthority(
  chunk: { document_id: string; doc_abbreviation: string },
  docMap: Map<string, DocMeta>
): ResolvedAuthority {
  const meta = docMap.get(chunk.document_id);
  return {
    docType: meta?.documentType ?? null,
    abbreviation: meta?.abbreviation ?? chunk.doc_abbreviation,
  };
}

export interface AuthorityMatchResult {
  matched: boolean;
  matchedField: 'doc_type' | 'abbreviation' | 'any' | null;
  matchedValue: string | null;
  unmappedDocumentId?: string;  // set when chunk's document_id wasn't in the map
}

/**
 * Check whether a chunk's resolved authority matches an assertion's expectations.
 *
 * Logic:
 * - If assertion has expected_abbreviation, check resolved.abbreviation (case-insensitive)
 * - If assertion has expected_doc_type, check resolved.docType (case-insensitive)
 * - If neither is set, always matches (no authority constraint)
 * - If resolved.docType is null (unmapped document_id), the doc_type check fails
 *   and unmappedDocumentId is set for diagnostics
 */
export function matchesAuthority(
  assertion: { expected_doc_type: string | null; expected_abbreviation: string | null },
  resolved: ResolvedAuthority,
  documentId?: string
): AuthorityMatchResult {
  // No authority constraint — auto-pass
  if (!assertion.expected_abbreviation && !assertion.expected_doc_type) {
    return { matched: true, matchedField: 'any', matchedValue: null };
  }

  // Check abbreviation first (more specific)
  if (assertion.expected_abbreviation) {
    if (resolved.abbreviation.toLowerCase() === assertion.expected_abbreviation.toLowerCase()) {
      return { matched: true, matchedField: 'abbreviation', matchedValue: resolved.abbreviation };
    }
    return { matched: false, matchedField: null, matchedValue: null };
  }

  // Check doc_type
  if (assertion.expected_doc_type) {
    if (resolved.docType === null) {
      return {
        matched: false,
        matchedField: null,
        matchedValue: null,
        unmappedDocumentId: documentId,
      };
    }
    if (resolved.docType.toLowerCase() === assertion.expected_doc_type.toLowerCase()) {
      return { matched: true, matchedField: 'doc_type', matchedValue: resolved.docType };
    }
    return { matched: false, matchedField: null, matchedValue: null };
  }

  return { matched: false, matchedField: null, matchedValue: null };
}
