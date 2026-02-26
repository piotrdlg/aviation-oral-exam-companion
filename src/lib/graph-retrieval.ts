import 'server-only';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * A single row from the get_concept_bundle RPC.
 */
export interface ConceptBundleRow {
  concept_id: string;
  concept_name: string;
  concept_category: string;
  concept_content: string;
  key_facts: Record<string, unknown> | string[];
  common_misconceptions: Record<string, unknown> | string[];
  depth: number;
  relation_type: string | null;
  examiner_transition: string | null;
  evidence_chunks: Array<{
    chunk_id: string;
    content: string;
    doc_title: string;
    page_ref: string | null;
    confidence: number;
  }> | null;
}

/**
 * Fetch the concept bundle for an ACS element from the graph.
 * Calls the get_concept_bundle RPC which traverses outgoing edges
 * up to maxDepth levels from the ACS element node.
 */
export async function fetchConceptBundle(
  elementCode: string,
  maxDepth: number = 2,
  maxRows: number = 50
): Promise<ConceptBundleRow[]> {
  const { data, error } = await supabase.rpc('get_concept_bundle', {
    p_element_code: elementCode,
    p_max_depth: maxDepth,
  }).limit(maxRows);

  if (error) {
    console.error('fetchConceptBundle error:', error.message);
    return [];
  }

  return (data ?? []) as ConceptBundleRow[];
}

/**
 * Format a concept bundle into structured prompt sections for the DPE examiner.
 * Groups concepts by category and extracts key information.
 */
export function formatBundleForPrompt(bundle: ConceptBundleRow[]): string {
  if (!bundle || bundle.length === 0) return '';

  const sections: string[] = [];

  // Group by category
  const regulatoryClaims = bundle.filter(r => r.concept_category === 'regulatory_claim');
  const topics = bundle.filter(r => r.concept_category === 'topic');
  const definitions = bundle.filter(r => r.concept_category === 'definition');
  const procedures = bundle.filter(r => r.concept_category === 'procedure');

  // Collect all misconceptions across all concepts
  const allMisconceptions: string[] = [];
  for (const row of bundle) {
    if (row.common_misconceptions) {
      if (Array.isArray(row.common_misconceptions)) {
        allMisconceptions.push(...row.common_misconceptions.filter(m => typeof m === 'string'));
      }
    }
  }

  // Collect evidence citations
  const citations: string[] = [];
  for (const row of bundle) {
    if (row.evidence_chunks) {
      for (const chunk of row.evidence_chunks) {
        const ref = chunk.page_ref ? ` (${chunk.doc_title}, ${chunk.page_ref})` : ` (${chunk.doc_title})`;
        if (!citations.includes(ref)) citations.push(ref);
      }
    }
  }

  // Collect examiner transitions
  const transitions: string[] = [];
  for (const row of bundle) {
    if (row.examiner_transition && row.relation_type === 'leads_to_discussion_of') {
      transitions.push(row.examiner_transition);
    }
  }

  // Build sections
  if (regulatoryClaims.length > 0) {
    sections.push('REGULATORY REQUIREMENTS:');
    for (const claim of regulatoryClaims.slice(0, 15)) {
      const keyFacts = Array.isArray(claim.key_facts)
        ? claim.key_facts.filter(f => typeof f === 'string')
        : [];
      const cfrRef = keyFacts.find(f => typeof f === 'string' && /\d+ CFR/i.test(f));
      const line = cfrRef ? `- [${cfrRef}] ${claim.concept_content}` : `- ${claim.concept_content}`;
      sections.push(line);
    }
    if (regulatoryClaims.length > 15) {
      sections.push(`  ... and ${regulatoryClaims.length - 15} more regulatory claims`);
    }
    sections.push('');
  }

  if (topics.length > 0 || definitions.length > 0 || procedures.length > 0) {
    sections.push('KEY CONCEPTS:');
    for (const concept of [...topics, ...definitions, ...procedures]) {
      sections.push(`- ${concept.concept_name}: ${concept.concept_content}`);
    }
    sections.push('');
  }

  if (definitions.length > 0) {
    sections.push('DEFINITIONS:');
    for (const def of definitions) {
      sections.push(`- ${def.concept_name}: ${def.concept_content}`);
    }
    sections.push('');
  }

  if (allMisconceptions.length > 0) {
    sections.push('COMMON STUDENT ERRORS (probe for these):');
    const unique = [...new Set(allMisconceptions)];
    for (const m of unique.slice(0, 10)) {
      sections.push(`- ${m}`);
    }
    sections.push('');
  }

  if (transitions.length > 0) {
    sections.push('SUGGESTED FOLLOW-UP DIRECTIONS:');
    for (const t of transitions.slice(0, 5)) {
      sections.push(`- ${t}`);
    }
    sections.push('');
  }

  if (citations.length > 0) {
    sections.push('REFERENCES:');
    for (const c of citations.slice(0, 10)) {
      sections.push(`- ${c}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}
