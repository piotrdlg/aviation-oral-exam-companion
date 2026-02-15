/**
 * Aviation-aware sentence boundary detection for LLM token streaming.
 *
 * Designed for splitting Claude's streaming text output into complete sentences
 * before sending each sentence to a TTS provider. Handles:
 * - Standard sentence endings (. ? !)
 * - Aviation abbreviations (e.g., i.e., etc., alt., hdg.)
 * - FAA references (14 CFR 91.205, AIM 7-1-11)
 * - Decimal numbers (122.8 MHz, 3.5 degrees)
 * - List markers (1). A). (a).)
 * - Colon soft boundaries for long buffers
 * - Force flush for very long buffers without punctuation
 */

/** Aviation and common abbreviations that contain periods but are NOT sentence endings. */
const ABBREVIATIONS = new Set([
  'e.g.', 'i.e.', 'vs.', 'approx.', 'min.', 'max.', 'alt.', 'hdg.',
  'mr.', 'dr.', 'jr.', 'sr.', 'inc.', 'ltd.', 'etc.',
  'dept.', 'est.', 'ft.', 'no.', 'vol.', 'fig.', 'ref.',
]);

/** Don't send tiny fragments to TTS. */
const MIN_SENTENCE_LENGTH = 20;

/** Force flush at this length even without a sentence boundary. */
const MAX_BUFFER_CHARS = 200;

/** Minimum buffer length before considering colon as a soft boundary. */
const COLON_MIN_LENGTH = 80;

export interface BoundaryResult {
  /** Complete sentence to send to TTS. */
  sentence: string;
  /** Remaining text to keep in the buffer. */
  remainder: string;
}

/**
 * Detect a sentence boundary in the buffer.
 *
 * Returns the first complete sentence found, or null if no boundary is detected yet.
 * The caller accumulates LLM tokens into the buffer and calls this after each token.
 *
 * @param buffer - The accumulated text buffer.
 * @returns The sentence and remainder, or null if no boundary found.
 */
export function detectSentenceBoundary(buffer: string): BoundaryResult | null {
  // Force flush if buffer is very long (handles edge case of no punctuation)
  if (buffer.length > MAX_BUFFER_CHARS) {
    const cutPoint = buffer.lastIndexOf(' ', MAX_BUFFER_CHARS);
    if (cutPoint > MIN_SENTENCE_LENGTH) {
      return { sentence: buffer.slice(0, cutPoint).trim(), remainder: buffer.slice(cutPoint) };
    }
    // No space found -- flush the whole thing
    if (buffer.length > MIN_SENTENCE_LENGTH) {
      return { sentence: buffer.trim(), remainder: '' };
    }
  }

  // Look for sentence-ending punctuation followed by whitespace
  const candidates = [...buffer.matchAll(/[.?!]\s+/g)];

  for (const match of candidates) {
    const periodIndex = match.index!;
    const endPos = periodIndex + match[0].length;
    const candidate = buffer.slice(0, endPos).trim();

    // Skip if too short
    if (candidate.length < MIN_SENTENCE_LENGTH) continue;

    const periodChar = buffer[periodIndex];

    // Only check abbreviations/decimals/refs for periods, not ? or !
    if (periodChar === '.') {
      // Check if the period is part of an abbreviation
      if (isAbbreviation(candidate)) continue;

      // Check if period is part of a FAA reference (e.g., "91.205")
      if (isFAAReference(buffer, periodIndex)) continue;

      // Check if period is a decimal number (e.g., "122.8", "3.5")
      if (isDecimalNumber(buffer, periodIndex)) continue;

      // Check if period follows a list marker: "1).", "(a).", etc.
      if (isListMarker(candidate)) continue;
    }

    // Valid sentence boundary found
    return { sentence: candidate, remainder: buffer.slice(endPos) };
  }

  // Colon handling: "Here are the requirements: ..." is a soft boundary
  // Only split on colon if buffer is already long enough to be meaningful
  if (buffer.length > COLON_MIN_LENGTH) {
    const colonMatch = buffer.match(/:\s+/);
    if (colonMatch && colonMatch.index! > MIN_SENTENCE_LENGTH) {
      const endPos = colonMatch.index! + colonMatch[0].length;
      return { sentence: buffer.slice(0, endPos).trim(), remainder: buffer.slice(endPos) };
    }
  }

  return null;
}

/** Check if the candidate sentence ends with a known abbreviation. */
function isAbbreviation(candidate: string): boolean {
  // Extract the last "word" ending with a period
  const match = candidate.match(/(\S+\.)$/);
  if (!match) return false;
  return ABBREVIATIONS.has(match[1].toLowerCase());
}

/** Check if the period is part of a FAA reference like "91.205", "AIM 7-1-11", "AC 61-98". */
function isFAAReference(buffer: string, periodIndex: number): boolean {
  const window = buffer.slice(Math.max(0, periodIndex - 20), periodIndex + 5);
  return /\d+\s*CFR\s*\d+\.\d/.test(window) ||
    /\bAIM\s+\d+-\d+-\d+/.test(window) ||
    /\bAC\s+\d+-\d+/.test(window) ||
    // General pattern: digit(s).digit(s) like "91.205", "61.113"
    /\d+\.\d+/.test(buffer.slice(Math.max(0, periodIndex - 5), periodIndex + 4));
}

/** Check if the period is part of a decimal number like "122.8", "3.5". */
function isDecimalNumber(buffer: string, periodIndex: number): boolean {
  // Look for digit before period and digit after period
  if (periodIndex > 0 && periodIndex < buffer.length - 1) {
    const charBefore = buffer[periodIndex - 1];
    const charAfter = buffer[periodIndex + 1];
    if (/\d/.test(charBefore) && /\d/.test(charAfter)) {
      return true;
    }
  }
  return false;
}

/** Check if the period follows a list marker like "1).", "(a).", "A).", "(1).". */
function isListMarker(candidate: string): boolean {
  return /(?:\(\d+\)|\d+\)|\([a-zA-Z]\)|[a-zA-Z]\))\.\s*$/.test(candidate);
}
