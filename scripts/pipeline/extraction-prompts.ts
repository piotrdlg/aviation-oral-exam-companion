/**
 * Shared LLM prompt templates for regulatory claim extraction,
 * topic extraction, and concept edge inference scripts.
 */

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export interface RegulatoryClaimExtraction {
  claim_text: string;
  cfr_reference: string | null;
  domain: string;
  conditions: {
    airspace_class?: string;
    altitude_band?: string;
    day_night?: string;
    certificate_level?: string;
  };
  numeric_values: {
    visibility_sm?: number;
    cloud_clearance_ft?: number;
    time_period_months?: number;
    count?: number;
  };
}

export interface TopicExtraction {
  name: string;
  category: 'topic' | 'definition' | 'procedure';
  content: string;
  key_facts: string[];
  common_misconceptions: string[];
  related_cfr: string[];
  aliases: string[];
}

export interface EdgeInference {
  source_slug: string;
  target_slug: string;
  relation_type: string;
  weight: number;
  examiner_transition: string | null;
  confidence: number;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

export const REGULATORY_CLAIM_SYSTEM_PROMPT: string = `You are an aviation regulatory expert. Extract atomic regulatory requirements from the given text.

Rules:
- Only extract explicit requirements, not commentary or examples
- Each condition variant must be a separate claim (e.g., different airspace classes)
- Use plain English, not legal jargon
- Include exact regulatory references when stated in the text
- If the text has no extractable regulatory requirements, return an empty array

Return a JSON array. Each element must have:
- claim_text: string (plain English atomic rule, 1-2 sentences)
- cfr_reference: string | null (e.g., "14 CFR 91.155")
- domain: one of "weather_minimums" | "currency" | "medical" | "documents" | "airspace" | "equipment" | "operations" | "maintenance" | "certification"
- conditions: { airspace_class?: string, altitude_band?: string, day_night?: string, certificate_level?: string } (all nullable)
- numeric_values: { visibility_sm?: number, cloud_clearance_ft?: number, time_period_months?: number, count?: number } (all nullable)

Return ONLY the JSON array, no other text.`;

export const TOPIC_EXTRACTION_SYSTEM_PROMPT: string = `You are an aviation knowledge extraction expert. Extract testable knowledge concepts from the given text.

Rules:
- Extract concepts that a DPE would ask about during an oral exam
- Each concept should be atomic and self-contained
- Focus on factual, testable knowledge
- Include common misconceptions that students have
- If the text is a table of contents, index, or purely administrative, return an empty array

Return a JSON array. Each element must have:
- name: string (concise, max 80 chars, e.g., "Left Turning Tendencies")
- category: one of "topic" | "definition" | "procedure"
- content: string (2-4 sentence factual explanation)
- key_facts: string[] (array of testable statements)
- common_misconceptions: string[] (array of student errors, may be empty)
- related_cfr: string[] (CFR references if applicable, may be empty)
- aliases: string[] (alternative names, may be empty)

Return ONLY the JSON array, no other text.`;

export const EDGE_INFERENCE_SYSTEM_PROMPT: string = `You are an aviation knowledge graph expert. Given a batch of aviation concepts, identify meaningful relationships between them.

Available relation types:
- requires_knowledge_of: Concept A requires understanding of Concept B
- leads_to_discussion_of: Discussing A naturally leads to discussing B in an oral exam
- contrasts_with: A and B are commonly confused or contrasted
- mitigates_risk_of: Understanding A helps mitigate risk B
- applies_in_scenario: Regulation/rule A applies in scenario/context B

Rules:
- Only create relationships that a DPE would logically follow during an oral exam
- Provide a brief examiner_transition phrase for leads_to_discussion_of edges
- Each relationship must have a confidence score (0.0-1.0)
- Do not create trivial or self-referential relationships

Return a JSON array. Each element must have:
- source_slug: string (slug of source concept)
- target_slug: string (slug of target concept)
- relation_type: one of the types above
- weight: number (0.0-1.0)
- examiner_transition: string | null (natural transition phrase, only for leads_to_discussion_of)
- confidence: number (0.0-1.0)

Return ONLY the JSON array, no other text.`;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Build the user prompt sent alongside one of the system prompts above
 * when extracting concepts or claims from a document chunk.
 */
export function buildExtractionUserPrompt(
  chunkContent: string,
  heading: string | null,
  docType: string,
  recentConcepts?: string[],
): string {
  const parts: string[] = [];

  parts.push(`Document type: ${docType}`);

  if (heading) {
    parts.push(`Section: ${heading}`);
  }

  if (recentConcepts?.length) {
    parts.push(
      `\nRecently extracted concepts (avoid duplicates):\n${recentConcepts.slice(-50).join(', ')}`,
    );
  }

  parts.push(`\n---\nTEXT:\n${chunkContent}\n---`);
  parts.push(`\nExtract all relevant concepts from the text above.`);

  return parts.join('\n');
}
