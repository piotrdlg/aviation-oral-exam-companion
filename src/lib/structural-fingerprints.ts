/**
 * Structural Taxonomy Fingerprints for ACS Elements
 *
 * Builds deterministic fingerprints from ACS element codes using area-level
 * topic keywords. Used by connectedWalk() to order elements so adjacent
 * elements share conceptual overlap.
 *
 * Strategy:
 *   - Parse element code → extract rating, area, element type
 *   - Map area → keyword set (rating-aware, from citation-relevance.ts)
 *   - Use keywords as fingerprint slugs prefixed with "topic:"
 *   - Cross-area connections emerge naturally from shared keywords
 *     (e.g. "weather" in Area I and Area VII)
 *
 * Phase 9 — Flow Coherence Activation
 */

import { getAreaKeywords } from './citation-relevance';
import type { TaxonomyFingerprints } from './exam-logic';

// ---------------------------------------------------------------------------
// Element Code Parsing
// ---------------------------------------------------------------------------

const RATING_PREFIX_MAP: Record<string, string> = {
  PA: 'private',
  CA: 'commercial',
  IR: 'instrument',
  ATP: 'atp',
};

interface ParsedElement {
  prefix: string;       // PA, CA, IR
  rating: string;       // private, commercial, instrument
  area: string;         // Roman numeral (I, II, III, ...)
  task: string;         // Letter (A, B, C, ...)
  elementType: string;  // K, R, or S
  elementNum: number;   // 1, 2, 3, ...
}

/**
 * Parse an ACS element code like "PA.I.A.K1" into its components.
 * Returns null if the code doesn't match expected format.
 */
export function parseElementCode(code: string): ParsedElement | null {
  const parts = code.split('.');
  if (parts.length !== 4) return null;

  const [prefix, area, task, elementPart] = parts;
  const rating = RATING_PREFIX_MAP[prefix];
  if (!rating) return null;

  // Element part: K1, R2, S3, etc.
  const typeMatch = elementPart.match(/^([KRS])(\d+)$/);
  if (!typeMatch) return null;

  return {
    prefix,
    rating,
    area,
    task,
    elementType: typeMatch[1],
    elementNum: parseInt(typeMatch[2], 10),
  };
}

// ---------------------------------------------------------------------------
// Fingerprint Builder
// ---------------------------------------------------------------------------

/**
 * Build structural taxonomy fingerprints for a list of ACS element codes.
 *
 * Each element gets a set of "topic:keyword" slugs derived from its area's
 * topic keyword list. Elements in the same area share most slugs; elements
 * in different areas share slugs only where keywords overlap (creating
 * natural cross-area bridges).
 *
 * Additional structural tags:
 *   - "area:{roman}" — groups elements within the same area
 *   - "task:{prefix}.{area}.{task}" — groups elements within the same task
 *   - "etype:knowledge" or "etype:risk" — groups by element type
 */
export function buildStructuralFingerprints(
  elementCodes: string[]
): TaxonomyFingerprints {
  const fingerprints: TaxonomyFingerprints = new Map();

  for (const code of elementCodes) {
    const parsed = parseElementCode(code);
    if (!parsed) continue;

    const slugs = new Set<string>();

    // 1. Area-level topic keywords (rating-aware)
    const keywords = getAreaKeywords(parsed.area, parsed.rating);
    for (const kw of keywords) {
      slugs.add(`topic:${kw}`);
    }

    // 2. Structural tags for grouping
    slugs.add(`area:${parsed.area}`);
    slugs.add(`task:${parsed.prefix}.${parsed.area}.${parsed.task}`);

    if (parsed.elementType === 'K') {
      slugs.add('etype:knowledge');
    } else if (parsed.elementType === 'R') {
      slugs.add('etype:risk');
    }

    if (slugs.size > 0) {
      fingerprints.set(code, slugs);
    }
  }

  return fingerprints;
}

/**
 * Report fingerprint statistics for monitoring/audit purposes.
 */
export interface FingerprintStats {
  totalElements: number;
  elementsWithFingerprints: number;
  elementsWithoutFingerprints: number;
  coveragePercent: number;
  avgFingerprintSize: number;
  uniqueSlugs: number;
  /** Elements that failed to parse */
  unparseable: string[];
}

export function computeFingerprintStats(
  elementCodes: string[],
  fingerprints: TaxonomyFingerprints
): FingerprintStats {
  const unparseable: string[] = [];
  let totalSize = 0;
  const allSlugs = new Set<string>();

  for (const code of elementCodes) {
    const fp = fingerprints.get(code);
    if (fp && fp.size > 0) {
      totalSize += fp.size;
      for (const slug of fp) allSlugs.add(slug);
    } else {
      if (!parseElementCode(code)) unparseable.push(code);
    }
  }

  const withFP = elementCodes.filter(c => fingerprints.has(c) && fingerprints.get(c)!.size > 0).length;

  return {
    totalElements: elementCodes.length,
    elementsWithFingerprints: withFP,
    elementsWithoutFingerprints: elementCodes.length - withFP,
    coveragePercent: elementCodes.length > 0
      ? Math.round((withFP / elementCodes.length) * 1000) / 10
      : 0,
    avgFingerprintSize: withFP > 0 ? Math.round((totalSize / withFP) * 10) / 10 : 0,
    uniqueSlugs: allSlugs.size,
    unparseable,
  };
}
