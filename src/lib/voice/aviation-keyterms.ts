/**
 * Aviation keyterm vocabulary for Deepgram Nova-3 / Flux STT (W4.3).
 *
 * Nova-3's `keyterm` parameter boosts recognition of domain terminology and
 * preserves the formatting given here (so acronyms come back uppercase).
 * Budget: Deepgram enforces 500 tokens TOTAL across all keyterms per request
 * — this list is ~60 tokens, far under the cap. The unit test guards growth.
 *
 * HISTORY: an earlier attempt passed ~30 `keywords=` params (the NOVA-2-era
 * feature) and Deepgram REJECTED the WebSocket handshake — that incident is
 * why the token route went minimal-params. `keyterm` is the Nova-3
 * replacement and was verified against the live handshake before this
 * shipped (see scripts/eval/verify-keyterm-handshake.ts).
 *
 * Selection criteria: terms students actually SAY in orals that generic STT
 * mishears (acronyms spelled out, aviation jargon, phonetically ambiguous
 * terms like "pitot" → "pee-toe"). Not exhaustive — high-confusion only.
 */
export const AVIATION_KEYTERMS: string[] = [
  // Weather products & services
  'METAR', 'TAF', 'AIRMET', 'SIGMET', 'PIREP', 'ATIS', 'AWOS', 'ASOS',
  // Navigation & airspace
  'VOR', 'ILS', 'NOTAM', 'CTAF', 'UNICOM', 'AGL', 'MSL', 'ADS-B',
  'Class Bravo', 'Class Charlie', 'Class Delta', 'Class Echo', 'Class Golf',
  // Aircraft systems
  'pitot static', 'magnetos', 'carburetor icing', 'transponder', 'squawk',
  'empennage', 'ailerons', 'annunciator',
  // Performance & limitations
  'Vso', 'Vfe', 'Vno', 'Vne', 'Vx', 'Vy', 'Va',
  'density altitude', 'airworthiness directives',
  // Physiology & regulations
  'hypoxia', 'hyperventilation', 'IMSAFE', 'PAVE', 'TOMATO FLAMES',
];

/**
 * Appends keyterm params to a URLSearchParams (one `keyterm=` per term, as
 * the Deepgram docs specify for multi-term boosts). An admin can override the
 * list via the `stt.keyterms` system_config key (array of strings) without a
 * deploy; an empty array disables keyterms entirely.
 */
export function appendKeytermParams(
  params: URLSearchParams,
  configOverride?: unknown
): string[] {
  const terms = Array.isArray(configOverride)
    && configOverride.every((t): t is string => typeof t === 'string')
    ? configOverride
    : AVIATION_KEYTERMS;
  for (const term of terms) {
    params.append('keyterm', term);
  }
  return terms;
}
