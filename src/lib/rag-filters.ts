export interface RagFilterHint {
  filterDocType?: string;
  filterAbbreviation?: string;
}

/**
 * Infer metadata filters for RAG retrieval based on question context.
 * Returns null if no high-confidence filter can be inferred.
 * Conservative: only filters when strong textual signals are present.
 */
export function inferRagFilters(context: {
  taskId?: string;
  elementCode?: string;
  studentAnswer?: string;
  examinerQuestion?: string;
}): RagFilterHint | null {
  // Combine all available text into a single string for matching
  const parts: string[] = [];
  if (context.taskId) parts.push(context.taskId);
  if (context.elementCode) parts.push(context.elementCode);
  if (context.studentAnswer) parts.push(context.studentAnswer);
  if (context.examinerQuestion) parts.push(context.examinerQuestion);

  const text = parts.join(' ');

  if (!text.trim()) return null;

  // Check for PHAK signal first (more specific than generic CFR patterns)
  if (/\bPHAK\b/i.test(text) || /Pilot['']s Handbook/i.test(text)) {
    return { filterAbbreviation: 'phak' };
  }

  // Check for AFH signal
  if (/\bAFH\b/i.test(text) || /Airplane Flying Handbook/i.test(text)) {
    return { filterAbbreviation: 'afh' };
  }

  // Check for AIM signal (word boundary to avoid matching words like "claim")
  if (/\bAIM\b/i.test(text)) {
    return { filterAbbreviation: 'aim' };
  }

  // CFR signals: explicit CFR / FAR references
  // NOTE: bare "14 CFR" is NOT enough — requires Part/section number to avoid
  // over-filtering (e.g., airspace questions that casually mention "14 CFR").
  const hasCfrExplicit =
    /14\s+CFR\s+(?:Part\s+)?\d{2,3}/i.test(text) ||   // "14 CFR 91" or "14 CFR Part 91"
    /\bFAR\b/i.test(text) ||
    /Part\s+\d{2,3}\b/i.test(text) ||
    /§\s*\d{2,3}\.\d+/.test(text) ||                   // "§ 91.155"
    /\b\d{2,3}\.\d{2,}\b/.test(text);                  // bare "91.155", "61.57"

  if (hasCfrExplicit) {
    return { filterDocType: 'cfr' };
  }

  // CFR signals: regulatory keywords combined with contextual cues
  // "certificate" and "endorsement" removed as standalone keywords because they
  // appear as qualifiers in non-regulatory contexts (e.g., "private pilot certificate"
  // in airspace descriptions). Compound patterns below catch the regulatory uses.
  const regulatoryKeywords =
    /\b(regulation|currency|medical|logbook)\b/i.test(text);
  const regulatoryCompound =
    /\b(airworthiness|registration)\s+certificate/i.test(text);

  if (regulatoryKeywords || regulatoryCompound) {
    return { filterDocType: 'cfr' };
  }

  return null;
}
