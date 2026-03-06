import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export type VerificationConfidence = 'high' | 'medium' | 'low' | 'none';

export type ReasonCode =
  | 'unique_name_certtype_match'       // Exactly 1 FAA record with matching name + instructor cert type
  | 'multiple_candidates'              // Multiple FAA records match — ambiguous
  | 'name_match_no_instructor_cert'    // Name found but no instructor certificate
  | 'no_name_match'                    // No FAA record matches this name
  | 'partial_name_match'              // First name partial/initial match only
  | 'certificate_number_unverifiable'  // Downloadable dataset lacks cert numbers
  | 'manual_review_required'           // Catch-all for medium/low confidence
  | 'faa_data_not_available';          // No FAA data imported yet

export interface FaaCandidate {
  faaUniqueId: string;
  firstName: string;
  lastName: string;
  city: string | null;
  state: string | null;
  certTypes: string[];     // e.g., ['F', 'G'] from cert records
  certLevels: string[];    // e.g., ['AIRPLANE SINGLE ENGINE LAND']
}

export interface VerificationResult {
  confidence: VerificationConfidence;
  status: 'verified_auto' | 'needs_manual_review' | 'no_match';
  candidates: FaaCandidate[];
  reasonCodes: ReasonCode[];
  explanation: string;      // Human-readable summary for admin
  dataSource: 'faa_database';
  attemptedAt: string;      // ISO timestamp
}

export interface VerificationInput {
  firstName: string;
  lastName: string;
  certificateNumber: string;
  certificateType: 'CFI' | 'CFII' | 'MEI' | 'AGI' | 'IGI';
}

// --- Certificate Type Mapping ---

const CERT_TYPE_MAP: Record<string, { faaCertType: string; levelKeywords?: string[] }> = {
  CFI:  { faaCertType: 'F' },                                    // Flight Instructor
  CFII: { faaCertType: 'F', levelKeywords: ['INSTRUMENT'] },     // Flight Instructor - Instrument
  MEI:  { faaCertType: 'F', levelKeywords: ['MULTI'] },          // Flight Instructor - Multi-Engine
  AGI:  { faaCertType: 'G', levelKeywords: ['ADVANCED'] },       // Ground Instructor - Advanced
  IGI:  { faaCertType: 'G', levelKeywords: ['INSTRUMENT'] },     // Ground Instructor - Instrument
};

// --- Helpers ---

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Check if two first names match, supporting initial/partial matching.
 * Returns 'exact' for full match, 'partial' for initial/prefix match, or false.
 */
function firstNameMatchType(
  inputFirst: string,
  candidateFirst: string,
): 'exact' | 'partial' | false {
  const a = normalizeName(inputFirst);
  const b = normalizeName(candidateFirst);

  if (!a || !b) return false;

  if (a === b) return 'exact';

  // Initial/prefix matching: one starts with the other
  // e.g., "J" matches "john", "james" matches "ja"
  if (a.startsWith(b) || b.startsWith(a)) return 'partial';

  return false;
}

/**
 * Check if a candidate has the expected certificate type (and level keywords if applicable).
 */
function candidateHasCertType(
  candidate: FaaCandidate,
  certTypeConfig: { faaCertType: string; levelKeywords?: string[] },
): boolean {
  const hasCertType = candidate.certTypes.includes(certTypeConfig.faaCertType);
  if (!hasCertType) return false;

  // If no level keywords required, the cert type alone is sufficient
  if (!certTypeConfig.levelKeywords || certTypeConfig.levelKeywords.length === 0) {
    return true;
  }

  // Check that at least one cert level contains all required keywords
  return candidate.certLevels.some((level) => {
    const upperLevel = level.toUpperCase();
    return certTypeConfig.levelKeywords!.every((kw) => upperLevel.includes(kw));
  });
}

/**
 * Check if a candidate has ANY instructor certificate (F or G type).
 */
function candidateHasAnyInstructorCert(candidate: FaaCandidate): boolean {
  return candidate.certTypes.includes('F') || candidate.certTypes.includes('G');
}

function formatCandidateLocation(candidate: FaaCandidate): string {
  const parts: string[] = [];
  if (candidate.city) parts.push(candidate.city);
  if (candidate.state) parts.push(candidate.state);
  return parts.length > 0 ? parts.join(', ') : 'location unknown';
}

function formatCertDescription(certType: string): string {
  switch (certType) {
    case 'CFI':  return 'Flight Instructor';
    case 'CFII': return 'Flight Instructor - Instrument';
    case 'MEI':  return 'Flight Instructor - Multi-Engine';
    case 'AGI':  return 'Advanced Ground Instructor';
    case 'IGI':  return 'Instrument Ground Instructor';
    default:     return 'Instructor';
  }
}

// --- Pure Matching Logic (testable without DB) ---

/**
 * Compute the verification result from pre-fetched candidates.
 * This is a pure function for unit testing.
 */
export function computeVerificationResult(
  input: VerificationInput,
  candidates: FaaCandidate[],
  hasFaaData: boolean,
): VerificationResult {
  const now = new Date().toISOString();
  const reasonCodes: ReasonCode[] = ['certificate_number_unverifiable'];
  const certConfig = CERT_TYPE_MAP[input.certificateType];
  const inputFirstNorm = normalizeName(input.firstName);
  const inputLastNorm = normalizeName(input.lastName);

  // No FAA data imported yet
  if (!hasFaaData) {
    return {
      confidence: 'none',
      status: 'needs_manual_review',
      candidates: [],
      reasonCodes: ['faa_data_not_available', 'certificate_number_unverifiable'],
      explanation:
        'No FAA airmen data has been imported yet. Manual verification required.',
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // No candidates at all (no last name match)
  if (candidates.length === 0) {
    reasonCodes.push('no_name_match');
    return {
      confidence: 'none',
      status: 'no_match',
      candidates: [],
      reasonCodes,
      explanation:
        `No FAA record found for '${inputLastNorm.toUpperCase()}, ${inputFirstNorm.toUpperCase()}' in downloaded dataset.`,
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // Categorize candidates by name match quality and cert match
  const exactNameWithCert: FaaCandidate[] = [];
  const exactNameNoCert: FaaCandidate[] = [];
  const partialNameWithCert: FaaCandidate[] = [];
  const partialNameNoCert: FaaCandidate[] = [];
  let hasPartialMatch = false;

  for (const candidate of candidates) {
    const nameMatch = firstNameMatchType(input.firstName, candidate.firstName);
    if (!nameMatch) continue;

    if (nameMatch === 'partial') hasPartialMatch = true;

    const hasCert = candidateHasCertType(candidate, certConfig);
    const hasAnyInstructorCert = candidateHasAnyInstructorCert(candidate);

    if (nameMatch === 'exact' && hasCert) {
      exactNameWithCert.push(candidate);
    } else if (nameMatch === 'exact' && hasAnyInstructorCert) {
      // Has instructor cert but not the exact type claimed
      exactNameNoCert.push(candidate);
    } else if (nameMatch === 'exact') {
      exactNameNoCert.push(candidate);
    } else if (nameMatch === 'partial' && hasCert) {
      partialNameWithCert.push(candidate);
    } else {
      partialNameNoCert.push(candidate);
    }
  }

  // All matched candidates for the result
  const allMatched = [
    ...exactNameWithCert,
    ...exactNameNoCert,
    ...partialNameWithCert,
    ...partialNameNoCert,
  ];

  // No first name match at all among the last-name candidates
  if (allMatched.length === 0) {
    reasonCodes.push('no_name_match');
    return {
      confidence: 'none',
      status: 'no_match',
      candidates: [],
      reasonCodes,
      explanation:
        `No FAA record found for '${inputLastNorm.toUpperCase()}, ${inputFirstNorm.toUpperCase()}' in downloaded dataset. ` +
        `${candidates.length} record(s) with last name '${inputLastNorm.toUpperCase()}' exist but none match the first name.`,
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // --- HIGH confidence: exactly 1 exact name match with correct cert type ---
  if (exactNameWithCert.length === 1 && !hasPartialMatch) {
    const match = exactNameWithCert[0];
    reasonCodes.push('unique_name_certtype_match');
    return {
      confidence: 'high',
      status: 'verified_auto',
      candidates: [match],
      reasonCodes,
      explanation:
        `Unique match: ${match.firstName.toUpperCase()} ${match.lastName.toUpperCase()}, ` +
        `${formatCertDescription(input.certificateType)}, ${formatCandidateLocation(match)}. ` +
        `Certificate number not verifiable from FAA dataset.`,
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // --- MEDIUM confidence: multiple cert-matching candidates, or partial name match ---
  if (exactNameWithCert.length > 1) {
    reasonCodes.push('multiple_candidates');
    reasonCodes.push('manual_review_required');
    return {
      confidence: 'medium',
      status: 'needs_manual_review',
      candidates: exactNameWithCert,
      reasonCodes,
      explanation:
        `${exactNameWithCert.length} candidates named ` +
        `${inputLastNorm.toUpperCase()}, ${inputFirstNorm.toUpperCase()} found ` +
        `with ${formatCertDescription(input.certificateType)} certificates. ` +
        `Manual review recommended to disambiguate.`,
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // Exact name match exists but no matching cert type (they have an instructor cert of a different kind)
  if (exactNameNoCert.length > 0) {
    const hasAnyInstructor = exactNameNoCert.some(candidateHasAnyInstructorCert);

    if (hasAnyInstructor) {
      // Name matches and they have SOME instructor cert, just not the claimed type
      reasonCodes.push('name_match_no_instructor_cert');
      reasonCodes.push('manual_review_required');
      return {
        confidence: 'medium',
        status: 'needs_manual_review',
        candidates: exactNameNoCert,
        reasonCodes,
        explanation:
          `${exactNameNoCert.length} record(s) found for ` +
          `${inputFirstNorm.toUpperCase()} ${inputLastNorm.toUpperCase()} ` +
          `with instructor certificate(s), but none match the claimed type ` +
          `(${input.certificateType}). Manual review recommended.`,
        dataSource: 'faa_database',
        attemptedAt: now,
      };
    }

    // Name matches but no instructor cert at all
    reasonCodes.push('name_match_no_instructor_cert');
    reasonCodes.push('manual_review_required');
    return {
      confidence: 'low',
      status: 'needs_manual_review',
      candidates: exactNameNoCert,
      reasonCodes,
      explanation:
        `${exactNameNoCert.length} record(s) found for ` +
        `${inputFirstNorm.toUpperCase()} ${inputLastNorm.toUpperCase()} ` +
        `in FAA data, but none hold any instructor certificate. Manual review required.`,
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // Only partial name matches remain
  if (partialNameWithCert.length > 0) {
    reasonCodes.push('partial_name_match');
    if (partialNameWithCert.length > 1) {
      reasonCodes.push('multiple_candidates');
    }
    reasonCodes.push('manual_review_required');
    return {
      confidence: 'medium',
      status: 'needs_manual_review',
      candidates: partialNameWithCert,
      reasonCodes,
      explanation:
        `${partialNameWithCert.length} partial name match(es) found for ` +
        `'${inputFirstNorm.toUpperCase()} ${inputLastNorm.toUpperCase()}' ` +
        `with matching instructor certificates. First name is a partial/initial match only. ` +
        `Manual review recommended.`,
      dataSource: 'faa_database',
      attemptedAt: now,
    };
  }

  // Partial name match but no instructor cert
  reasonCodes.push('partial_name_match');
  reasonCodes.push('name_match_no_instructor_cert');
  reasonCodes.push('manual_review_required');
  return {
    confidence: 'low',
    status: 'needs_manual_review',
    candidates: partialNameNoCert,
    reasonCodes,
    explanation:
      `${partialNameNoCert.length} partial name match(es) found for ` +
      `'${inputFirstNorm.toUpperCase()} ${inputLastNorm.toUpperCase()}', ` +
      `but none hold instructor certificates. Manual review required.`,
    dataSource: 'faa_database',
    attemptedAt: now,
  };
}

// --- Main Verification Function ---

/**
 * Verify an instructor's identity against imported FAA Airmen data.
 * Uses the service-role Supabase client to access FAA reference tables.
 */
export async function verifyInstructor(
  serviceSupabase: SupabaseClient,
  input: VerificationInput,
): Promise<VerificationResult> {
  // 1. Check if any FAA data has been imported
  const { data: importLog, error: importError } = await serviceSupabase
    .from('faa_import_log')
    .select('id')
    .eq('status', 'completed')
    .limit(1);

  if (importError) {
    console.error('[instructor-verification] Error checking import log:', importError.message);
  }

  const hasFaaData = !!(importLog && importLog.length > 0);

  if (!hasFaaData) {
    return computeVerificationResult(input, [], false);
  }

  // 2. Normalize names
  const lastNameNorm = normalizeName(input.lastName);

  // 3. Query faa_airmen by last_name_normalized exact match
  const { data: airmenRows, error: airmenError } = await serviceSupabase
    .from('faa_airmen')
    .select('faa_unique_id, first_name, last_name, city, state, first_name_normalized')
    .eq('last_name_normalized', lastNameNorm);

  if (airmenError) {
    console.error('[instructor-verification] Error querying faa_airmen:', airmenError.message);
    return computeVerificationResult(input, [], true);
  }

  if (!airmenRows || airmenRows.length === 0) {
    return computeVerificationResult(input, [], true);
  }

  // 4. Filter by first name match (exact or partial)
  const firstNameNorm = normalizeName(input.firstName);
  const nameMatchedRows = airmenRows.filter((row) => {
    const candidateFirst = (row.first_name_normalized as string) || '';
    return firstNameMatchType(firstNameNorm, candidateFirst) !== false;
  });

  if (nameMatchedRows.length === 0) {
    // Pass all last-name matches as candidates so the pure function can report accurately
    return computeVerificationResult(input, [], true);
  }

  // 5. Deduplicate by faa_unique_id (same person may appear from multiple imports)
  const uniqueIds = Array.from(new Set(nameMatchedRows.map((r) => r.faa_unique_id as string)));

  // 6. Fetch certificate records for all matched candidates
  const { data: certRows, error: certError } = await serviceSupabase
    .from('faa_airmen_certs')
    .select('faa_unique_id, cert_type, cert_level')
    .in('faa_unique_id', uniqueIds);

  if (certError) {
    console.error('[instructor-verification] Error querying faa_airmen_certs:', certError.message);
  }

  // 7. Build FaaCandidate objects
  const certsByUniqueId = new Map<string, { certTypes: Set<string>; certLevels: Set<string> }>();
  for (const cert of certRows ?? []) {
    const uid = cert.faa_unique_id as string;
    if (!certsByUniqueId.has(uid)) {
      certsByUniqueId.set(uid, { certTypes: new Set(), certLevels: new Set() });
    }
    const entry = certsByUniqueId.get(uid)!;
    if (cert.cert_type) entry.certTypes.add(cert.cert_type as string);
    if (cert.cert_level) entry.certLevels.add(cert.cert_level as string);
  }

  // Build one candidate per unique FAA ID (take first row's name/location data)
  const candidateMap = new Map<string, FaaCandidate>();
  for (const row of nameMatchedRows) {
    const uid = row.faa_unique_id as string;
    if (candidateMap.has(uid)) continue;

    const certs = certsByUniqueId.get(uid);
    candidateMap.set(uid, {
      faaUniqueId: uid,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      city: (row.city as string) || null,
      state: (row.state as string) || null,
      certTypes: certs ? Array.from(certs.certTypes) : [],
      certLevels: certs ? Array.from(certs.certLevels) : [],
    });
  }

  const candidates = Array.from(candidateMap.values());

  // 8. Compute and return verification result
  return computeVerificationResult(input, candidates, true);
}
