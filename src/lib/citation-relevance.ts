/**
 * Citation Relevance Scorer
 *
 * Deterministic scoring of citation candidates for weak-area reports.
 * Used to filter irrelevant evidence-chain citations before returning
 * them to the user.
 *
 * Scoring signals:
 *   1. Direct element/task reference in heading/snippet (highest weight)
 *   2. ACS area keyword overlap
 *   3. Document-type relevance for the rating + area
 *   4. Penalties for generic/empty content
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CitationCandidate {
  /** Document abbreviation (uppercase, e.g. "PHAK", "IFH") */
  doc_abbreviation: string;
  /** Section heading from the chunk (may be null) */
  heading: string | null;
  /** Content snippet (first ~200 chars) */
  snippet: string;
  /** Citation source */
  source: 'transcript' | 'evidence';
}

export interface RelevanceInput {
  /** Element code (e.g. "PA.I.A.K1" or "IR.VI.D.K1") */
  element_code: string;
  /** ACS area (Roman numeral, e.g. "I", "VI") */
  area: string;
  /** Rating prefix (e.g. "private", "commercial", "instrument") */
  rating?: string;
}

export interface RelevanceResult {
  /** Numeric score 0-1 (higher = more relevant) */
  score: number;
  /** Human-readable reason codes */
  reasons: string[];
  /** Whether this citation should be kept */
  keep: boolean;
}

// ---------------------------------------------------------------------------
// Score threshold — citations below this are rejected
// ---------------------------------------------------------------------------

/** Minimum score to keep a citation (lowered from 0.25 in Phase 8 to
 *  accept relevant-doc + generic-content citations rather than showing
 *  "insufficient sources") */
export const RELEVANCE_THRESHOLD = 0.20;

// ---------------------------------------------------------------------------
// ACS Area → Topic Keywords
// Expanded from the Phase 7 grounding audit with broader coverage.
// Default keywords apply to Private Pilot / Commercial Pilot ratings.
// Instrument rating has its own keyword map since Area II-VII cover
// completely different topics than VFR ratings.
// ---------------------------------------------------------------------------

/** Default area keywords (Private Pilot / Commercial Pilot) */
const DEFAULT_AREA_KEYWORDS: Record<string, string[]> = {
  'I': [
    'preflight', 'airworthiness', 'certificate', 'document', 'logbook',
    'airworthiness directive', 'type certificate', 'supplemental type',
    'registration', 'weight', 'balance', 'performance', 'weather', 'notam',
    'pilot qualification', 'medical', 'currency', 'flight review',
    'aircraft maintenance', 'inspection', 'annual', '100-hour',
    'ad', 'special airworthiness', 'equipment', 'required equipment',
    'inoperative equipment', 'mel', 'minimum equipment',
  ],
  'II': [
    'preflight', 'procedures', 'inspection', 'cockpit', 'checklist',
    'engine', 'fuel', 'oil', 'flight controls', 'taxi', 'runup',
    'before takeoff', 'passenger briefing', 'safety briefing',
    'seat belt', 'configuration', 'power check',
  ],
  'III': [
    'airport', 'runway', 'taxiway', 'lighting', 'marking', 'sign',
    'atc', 'communication', 'clearance', 'tower', 'ground control',
    'ctaf', 'atis', 'radar', 'transponder', 'squawk',
    'airspace', 'class a', 'class b', 'class c', 'class d', 'class e', 'class g',
    'controlled', 'uncontrolled', 'tfr', 'sua', 'special use',
    'vfr', 'visual flight rules',
  ],
  'IV': [
    'takeoff', 'landing', 'pattern', 'approach', 'crosswind',
    'short field', 'soft field', 'go-around', 'rejected landing',
    'traffic pattern', 'downwind', 'base', 'final',
    'flap', 'configuration', 'stabilized approach',
  ],
  'V': [
    'maneuver', 'steep turn', 'slow flight', 'stall', 'spin',
    'ground reference', 'turn around a point', 's-turn',
    'chandelle', 'lazy eight', 'eights on pylons',
    'power-off stall', 'power-on stall', 'accelerated stall',
    'performance maneuver', 'maneuvering speed',
  ],
  'VI': [
    'navigation', 'pilotage', 'dead reckoning', 'vor', 'gps',
    'chart', 'sectional', 'diversion', 'lost', 'flight plan',
    'course', 'heading', 'wind correction', 'magnetic variation',
    'ndb', 'dme', 'waypoint', 'rnav', 'route',
    'cross-country', 'fuel planning', 'time en route',
  ],
  'VII': [
    'emergency', 'engine failure', 'fire', 'system malfunction',
    'forced landing', 'electrical', 'vacuum', 'pitot',
    'icing', 'weather', 'thunderstorm', 'wind shear',
    'lost communication', 'fuel emergency', 'diversion',
    'abnormal', 'caution', 'warning', 'emergency descent',
  ],
  'VIII': [
    'night', 'instrument', 'basic attitude', 'unusual attitude',
    'partial panel', 'gyroscopic', 'spatial disorientation',
    'illusion', 'night vision', 'flight by reference to instruments',
    'scan', 'instrument scan', 'primary', 'supporting',
  ],
  'IX': [
    'postflight', 'securing', 'parking', 'tiedown',
    'shutdown', 'after landing',
  ],
  'X': [
    'instrument', 'ifr', 'approach', 'holding', 'procedure turn',
    'flight plan', 'clearance', 'departure', 'arrival',
    'enroute', 'alternate', 'fuel requirements',
    'instrument approach procedure', 'decision altitude',
  ],
  'XI': [
    'aeromedical', 'physiological', 'hypoxia', 'spatial disorientation',
    'vision', 'fitness', 'medication', 'alcohol', 'fatigue',
    'stress', 'decompression', 'night vision', 'hyperventilation',
  ],
  'XII': [
    'commercial', 'privilege', 'limitation', 'hire', 'compensation',
    'operating rule', 'commercial operation',
  ],
};

/**
 * Commercial Pilot area keywords (FAA-S-ACS-7B).
 * Overrides DEFAULT keywords for areas where Commercial differs from Private:
 *   - Area I: adds commercial privileges/limitations/Part 119/135
 *   - Area VIII: High-Altitude Operations (Private VIII = Basic Instruments)
 *   - Area IX: Emergency Operations (DEFAULT['IX'] has postflight keywords)
 *   - Area XI: Postflight Procedures (Private XI = Night Operations)
 */
const COMMERCIAL_AREA_KEYWORDS: Record<string, string[]> = {
  'I': [
    // Same as Private I plus commercial-specific
    'preflight', 'airworthiness', 'certificate', 'document', 'logbook',
    'airworthiness directive', 'type certificate', 'supplemental type',
    'registration', 'weight', 'balance', 'performance', 'weather', 'notam',
    'pilot qualification', 'medical', 'currency', 'flight review',
    'aircraft maintenance', 'inspection', 'annual', '100-hour',
    'ad', 'special airworthiness', 'equipment', 'required equipment',
    'inoperative equipment', 'mel', 'minimum equipment',
    // Commercial-specific additions
    'commercial', 'privilege', 'limitation', 'hire', 'compensation',
    'operating certificate', 'part 119', 'part 135', 'part 91',
    'charter', 'commercial operation', 'for hire',
    'commercial pilot certificate', 'operating rule',
  ],
  'VIII': [
    // CA Area VIII: High-Altitude Operations (NOT Basic Instruments)
    'high-altitude', 'high altitude', 'pressurization', 'pressurized',
    'supplemental oxygen', 'oxygen', 'cabin altitude', 'cabin pressure',
    'hypoxia', 'time of useful consciousness', 'decompression',
    'rapid decompression', 'physiological', 'altitude physiology',
    'turbocharging', 'turbocharged', 'supercharger',
    'flight level', 'class a airspace', 'rvsm',
    'mach number', 'critical mach', 'high altitude weather',
    'jet stream', 'clear air turbulence', 'tropopause',
    'pressurization system', 'outflow valve', 'bleed air',
  ],
  'IX': [
    // CA Area IX: Emergency Operations (same topic as Private IX)
    'emergency', 'engine failure', 'fire', 'system malfunction',
    'forced landing', 'electrical', 'vacuum', 'pitot',
    'icing', 'weather', 'thunderstorm', 'wind shear',
    'lost communication', 'fuel emergency', 'diversion',
    'abnormal', 'caution', 'warning', 'emergency descent',
    'pressurization failure', 'rapid decompression',
  ],
  'XI': [
    // CA Area XI: Postflight Procedures
    'postflight', 'securing', 'parking', 'tiedown',
    'shutdown', 'after landing', 'logbook entry',
    'discrepancy', 'squawk', 'maintenance',
  ],
};

/**
 * Instrument Rating area keywords (FAA-S-ACS-8C).
 * These override default keywords for areas II-VII which cover
 * instrument-specific topics rather than VFR maneuver topics.
 */
const INSTRUMENT_AREA_KEYWORDS: Record<string, string[]> = {
  'I': [
    // IR Area I: Preflight Preparation (regs, weather, flight planning for IFR)
    'preflight', 'airworthiness', 'certificate', 'document', 'logbook',
    'weather', 'notam', 'pilot qualification', 'medical', 'currency',
    'instrument', 'ifr', 'flight plan', 'alternate', 'fuel requirements',
    'equipment', 'required equipment', 'inoperative equipment', 'mel',
    'instrument currency', 'instrument proficiency check', 'ipc',
    'minimum equipment', 'pitot', 'static', 'transponder',
    'altimeter', 'vor check', 'gps', 'raim',
    'icing', 'convective', 'sigmet', 'airmet', 'pirep',
    'prog chart', 'metar', 'taf', 'winds aloft',
  ],
  'II': [
    // IR Area II: Preflight Procedures (IFR departure, clearance copy, instrument checks)
    'preflight', 'clearance', 'departure', 'procedure', 'instrument check',
    'pitot', 'static', 'altimeter', 'attitude indicator', 'heading indicator',
    'vor check', 'gps', 'navigation', 'transponder', 'comm',
    'flight instruments', 'engine instruments', 'vacuum', 'electrical',
    'gyroscopic', 'magnetic compass', 'taxi', 'checklist',
    'instrument', 'ifr', 'clearance delivery', 'atis',
    'departure procedure', 'odp', 'sid',
  ],
  'III': [
    // IR Area III: ATC Clearances and Procedures
    'atc', 'clearance', 'communication', 'readback', 'departure',
    'enroute', 'arrival', 'approach', 'holding', 'procedure',
    'radar', 'transponder', 'squawk', 'ident', 'handoff',
    'minimum vectoring altitude', 'mva', 'altitude assignment',
    'cruise clearance', 'void time', 'release time',
    'ifr', 'instrument', 'clearance limit', 'expect further clearance',
    'lost communication', 'nordo',
  ],
  'IV': [
    // IR Area IV: Flight by Reference to Instruments
    'instrument', 'attitude', 'unusual attitude', 'partial panel',
    'instrument scan', 'primary', 'supporting', 'control',
    'pitch', 'bank', 'power', 'trim', 'straight and level',
    'climbing', 'descending', 'turning', 'standard rate turn',
    'compass turn', 'timed turn', 'magnetic compass',
    'gyroscopic', 'precession', 'acceleration error', 'turning error',
    'spatial disorientation', 'vestibular', 'somatogravic',
    'flight by reference', 'basic attitude',
  ],
  'V': [
    // IR Area V: Navigation Systems
    'navigation', 'vor', 'vortac', 'ndb', 'gps', 'rnav',
    'waypoint', 'course', 'bearing', 'radial', 'intercept',
    'tracking', 'cdi', 'obs', 'hsi', 'dme', 'dme arc',
    'fms', 'flight management', 'magenta line',
    'localizer', 'glideslope', 'marker beacon', 'outer marker',
    'navigation system', 'receiver', 'antenna',
    'raim', 'waas', 'lnav', 'vnav', 'lpv',
    'airway', 'victor airway', 'jet route', 'mea', 'moca', 'mra',
  ],
  'VI': [
    // IR Area VI: Instrument Approach Procedures
    'instrument approach', 'approach procedure', 'approach plate',
    'precision', 'non-precision', 'ils', 'loc', 'glideslope',
    'minimums', 'decision altitude', 'decision height', 'mda',
    'missed approach', 'holding', 'procedure turn', 'barb',
    'final approach fix', 'faf', 'final approach course',
    'circling', 'straight-in', 'visual descent point',
    'approach lighting', 'runway environment', 'visibility',
    'sid', 'star', 'departure procedure', 'arrival',
    'feeder route', 'initial approach fix', 'intermediate fix',
    'gps overlay', 'rnav approach', 'lpv', 'lnav',
  ],
  'VII': [
    // IR Area VII: Emergency Operations (IFR context)
    'emergency', 'engine failure', 'system malfunction',
    'electrical failure', 'vacuum failure', 'partial panel',
    'pitot-static failure', 'icing', 'ice',
    'lost communication', 'nordo', 'communication failure',
    'fuel emergency', 'diversion', 'alternate',
    'unusual attitude', 'recovery', 'spatial disorientation',
    'equipment malfunction', 'instrument failure',
    'abnormal', 'caution', 'warning',
  ],
};

/**
 * Get area keywords for a given area and rating.
 * Instrument and Commercial ratings use specialized keyword maps;
 * Private (and unknown ratings) use defaults.
 */
export function getAreaKeywords(area: string, rating?: string): string[] {
  if (rating === 'instrument' && INSTRUMENT_AREA_KEYWORDS[area]) {
    return INSTRUMENT_AREA_KEYWORDS[area];
  }
  if (rating === 'commercial' && COMMERCIAL_AREA_KEYWORDS[area]) {
    return COMMERCIAL_AREA_KEYWORDS[area];
  }
  return DEFAULT_AREA_KEYWORDS[area] || [];
}

/** @deprecated Use getAreaKeywords() — kept for backwards compatibility with tests */
export const AREA_TOPIC_KEYWORDS = DEFAULT_AREA_KEYWORDS;

// ---------------------------------------------------------------------------
// Document-Type Relevance Map
// Maps doc abbreviations to which ratings/areas they are most relevant for
// ---------------------------------------------------------------------------

interface DocRelevance {
  /** Universally relevant regardless of area/rating */
  universal: boolean;
  /** Ratings where this doc is primary (e.g. instrument-only docs) */
  primary_ratings: string[];
  /** ACS areas where this doc is especially relevant */
  primary_areas: string[];
}

const DOC_RELEVANCE: Record<string, DocRelevance> = {
  // Universal references
  'PHAK':  { universal: true,  primary_ratings: [],                              primary_areas: [] },
  'AIM':   { universal: true,  primary_ratings: [],                              primary_areas: ['III', 'VI', 'X'] },
  'CFR':   { universal: true,  primary_ratings: [],                              primary_areas: [] },
  '14':    { universal: true,  primary_ratings: [],                              primary_areas: [] }, // "14 CFR" may parse as just "14"
  'FAR':   { universal: true,  primary_ratings: [],                              primary_areas: [] },
  'ACS':   { universal: true,  primary_ratings: [],                              primary_areas: [] },

  // Instrument-specific
  'IFH':   { universal: false, primary_ratings: ['instrument'],                  primary_areas: ['VI', 'VIII', 'X'] },
  'IPH':   { universal: false, primary_ratings: ['instrument'],                  primary_areas: ['VI', 'X'] },

  // Flight maneuvers / aerodynamics
  'AFH':   { universal: false, primary_ratings: ['private', 'commercial'],       primary_areas: ['IV', 'V'] },

  // Weather
  'AWH':   { universal: false, primary_ratings: [],                              primary_areas: ['I', 'VII'] },

  // Risk management
  'RMH':   { universal: false, primary_ratings: [],                              primary_areas: ['I', 'VII', 'XI'] },

  // Weight & balance
  'WBH':   { universal: false, primary_ratings: [],                              primary_areas: ['I'] },

  // Advisory circulars — moderate relevance
  'AC':    { universal: false, primary_ratings: [],                              primary_areas: [] },

  // Others
  'OTHER': { universal: false, primary_ratings: [],                              primary_areas: [] },
};

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

/**
 * Score a citation candidate's relevance to a specific weak element.
 *
 * Returns a score 0–1 and whether to keep the citation.
 * Transcript citations get a bonus since they were actually used during the exam.
 */
export function scoreCitationRelevance(
  candidate: CitationCandidate,
  input: RelevanceInput,
): RelevanceResult {
  const reasons: string[] = [];
  let score = 0;

  const textToSearch = [
    candidate.heading || '',
    candidate.snippet || '',
  ].join(' ').toLowerCase();

  const docAbbr = candidate.doc_abbreviation.toUpperCase();

  // --- Signal 1: Direct element/task reference (strongest signal) ---
  // e.g. element "PA.I.A.K1" → check for "PA.I.A" or "PA.I.A.K1"
  const elementParts = input.element_code.split('.');
  const taskPrefix = elementParts.slice(0, 3).join('.'); // e.g. "PA.I.A"
  const hasDirectRef = textToSearch.includes(input.element_code.toLowerCase()) ||
    textToSearch.includes(taskPrefix.toLowerCase());

  if (hasDirectRef) {
    score += 0.50;
    reasons.push('direct_element_ref');
  }

  // --- Signal 2: Area keyword matches (rating-aware) ---
  const areaKeywords = getAreaKeywords(input.area, input.rating);
  const matchedKeywords = areaKeywords.filter(kw => textToSearch.includes(kw.toLowerCase()));

  if (matchedKeywords.length >= 3) {
    score += 0.35;
    reasons.push(`area_keywords_strong:${matchedKeywords.length}`);
  } else if (matchedKeywords.length === 2) {
    score += 0.25;
    reasons.push(`area_keywords_good:${matchedKeywords.slice(0, 2).join(',')}`);
  } else if (matchedKeywords.length === 1) {
    score += 0.15;
    reasons.push(`area_keyword_weak:${matchedKeywords[0]}`);
  }

  // --- Signal 3: Document-type relevance ---
  const docInfo = DOC_RELEVANCE[docAbbr] || DOC_RELEVANCE['OTHER'] || { universal: false, primary_ratings: [], primary_areas: [] };

  if (docInfo.universal) {
    score += 0.20;
    reasons.push(`doc_universal:${docAbbr}`);
  } else {
    // Check rating match
    const ratingMatch = input.rating && docInfo.primary_ratings.includes(input.rating);
    // Check area match
    const areaMatch = docInfo.primary_areas.includes(input.area);

    if (ratingMatch && areaMatch) {
      score += 0.25;
      reasons.push(`doc_rating_area_match:${docAbbr}`);
    } else if (ratingMatch) {
      score += 0.20;
      reasons.push(`doc_rating_match:${docAbbr}`);
    } else if (areaMatch) {
      score += 0.15;
      reasons.push(`doc_area_match:${docAbbr}`);
    } else {
      // Doc type has no known relevance to this area/rating
      score += 0.05;
      reasons.push(`doc_low_relevance:${docAbbr}`);
    }
  }

  // --- Signal 4: Transcript bonus ---
  // Citations from actual exam exchanges are inherently more relevant
  if (candidate.source === 'transcript') {
    score += 0.15;
    reasons.push('transcript_source');
  }

  // --- Penalty: Empty or very short snippet ---
  if (!candidate.snippet || candidate.snippet.trim().length < 20) {
    score -= 0.15;
    reasons.push('empty_snippet');
  }

  // --- Penalty: No heading and no keyword matches ---
  if (!candidate.heading && matchedKeywords.length === 0 && !hasDirectRef) {
    score -= 0.10;
    reasons.push('no_heading_no_keywords');
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));
  score = Math.round(score * 100) / 100;

  return {
    score,
    reasons,
    keep: score >= RELEVANCE_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Batch helper for filtering citation arrays
// ---------------------------------------------------------------------------

export interface ScoredCitation<T> {
  citation: T;
  relevance: RelevanceResult;
}

/**
 * Score and filter an array of citation candidates.
 * Returns only citations above the relevance threshold, sorted by score desc.
 */
export function filterCitations<T extends CitationCandidate>(
  candidates: T[],
  input: RelevanceInput,
  maxResults: number = 4,
): { kept: ScoredCitation<T>[]; filtered: ScoredCitation<T>[] } {
  const scored = candidates.map(citation => ({
    citation,
    relevance: scoreCitationRelevance(citation, input),
  }));

  // Sort by score desc, then by transcript source first
  scored.sort((a, b) => {
    if (b.relevance.score !== a.relevance.score) return b.relevance.score - a.relevance.score;
    if (a.citation.source === 'transcript' && b.citation.source !== 'transcript') return -1;
    if (b.citation.source === 'transcript' && a.citation.source !== 'transcript') return 1;
    return 0;
  });

  const kept = scored.filter(s => s.relevance.keep).slice(0, maxResults);
  const filtered = scored.filter(s => !s.relevance.keep);

  return { kept, filtered };
}
