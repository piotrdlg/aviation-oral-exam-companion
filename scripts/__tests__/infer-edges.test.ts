import { describe, it, expect } from 'vitest';
import { extractCfrReferences, parseEdgeResponse, buildEdgeBatchPrompt } from '../infer-edges';

// ---------------------------------------------------------------------------
// extractCfrReferences
// ---------------------------------------------------------------------------

describe('extractCfrReferences', () => {
  it('extracts "14 CFR 91.155" from text', () => {
    const text = 'Basic VFR weather minimums are defined in 14 CFR 91.155 for various airspace classes.';
    const result = extractCfrReferences(text);
    expect(result).toEqual(['14 CFR 91.155']);
  });

  it('extracts multiple CFR references', () => {
    const text =
      'Pilot currency requirements under 14 CFR 61.57 must be met. ' +
      'Medical certificate requirements are in 14 CFR 61.23. ' +
      'Flight review is required per 14 CFR 61.56.';
    const result = extractCfrReferences(text);
    expect(result).toEqual(['14 CFR 61.57', '14 CFR 61.23', '14 CFR 61.56']);
  });

  it('returns empty array when no CFR references', () => {
    const text = 'The four forces of flight are lift, weight, thrust, and drag.';
    const result = extractCfrReferences(text);
    expect(result).toEqual([]);
  });

  it('handles "14 CFR §91.155(a)" format', () => {
    const text = 'Per 14 CFR §91.155(a), the basic VFR minimums below 10,000 feet MSL are...';
    const result = extractCfrReferences(text);
    expect(result).toEqual(['14 CFR 91.155(a)']);
  });

  it('deduplicates repeated references', () => {
    const text =
      '14 CFR 91.155 defines weather minimums. ' +
      'Remember that 14 CFR 91.155 applies in all controlled airspace.';
    const result = extractCfrReferences(text);
    expect(result).toEqual(['14 CFR 91.155']);
  });

  it('handles subsection references like 61.57(c)(1)', () => {
    const text = 'Instrument currency per 14 CFR 61.57(c)(1) requires six approaches.';
    const result = extractCfrReferences(text);
    expect(result).toEqual(['14 CFR 61.57(c)(1)']);
  });

  it('returns empty array for empty string', () => {
    expect(extractCfrReferences('')).toEqual([]);
  });

  it('returns empty array for null-like input', () => {
    expect(extractCfrReferences(null as unknown as string)).toEqual([]);
    expect(extractCfrReferences(undefined as unknown as string)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseEdgeResponse
// ---------------------------------------------------------------------------

describe('parseEdgeResponse', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify([
      {
        source_slug: 'topic:airspace-classification',
        target_slug: 'regulatory_claim:class-b-clearance',
        relation_type: 'requires_knowledge_of',
        weight: 0.9,
        examiner_transition: null,
        confidence: 0.85,
      },
    ]);
    const result = parseEdgeResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0].source_slug).toBe('topic:airspace-classification');
    expect(result[0].relation_type).toBe('requires_knowledge_of');
    expect(result[0].weight).toBe(0.9);
  });

  it('returns empty for invalid JSON', () => {
    const result = parseEdgeResponse('this is not json at all');
    expect(result).toEqual([]);
  });

  it('handles markdown code fences', () => {
    const text = `Here are the relationships I found:

\`\`\`json
[
  {
    "source_slug": "topic:vfr-minimums",
    "target_slug": "regulatory_claim:basic-vfr-weather",
    "relation_type": "leads_to_discussion_of",
    "weight": 0.8,
    "examiner_transition": "Speaking of VFR minimums, let's look at the specific requirements...",
    "confidence": 0.9
  }
]
\`\`\``;

    const result = parseEdgeResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].source_slug).toBe('topic:vfr-minimums');
    expect(result[0].examiner_transition).toContain('Speaking of VFR minimums');
  });

  it('filters out edges with missing required fields', () => {
    const json = JSON.stringify([
      {
        source_slug: 'topic:stalls',
        target_slug: 'topic:angle-of-attack',
        relation_type: 'requires_knowledge_of',
        weight: 0.9,
        examiner_transition: null,
        confidence: 0.85,
      },
      {
        // Missing target_slug
        source_slug: 'topic:weight-balance',
        relation_type: 'requires_knowledge_of',
        weight: 0.7,
        confidence: 0.6,
      },
      {
        // Missing weight
        source_slug: 'topic:aeromedical',
        target_slug: 'topic:hypoxia',
        relation_type: 'leads_to_discussion_of',
        confidence: 0.8,
      },
      {
        // Missing confidence
        source_slug: 'topic:navigation',
        target_slug: 'topic:vor',
        relation_type: 'requires_knowledge_of',
        weight: 0.75,
      },
    ]);

    const result = parseEdgeResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0].source_slug).toBe('topic:stalls');
  });

  it('returns empty for empty string', () => {
    expect(parseEdgeResponse('')).toEqual([]);
  });

  it('returns empty for non-array JSON', () => {
    expect(parseEdgeResponse('{"not": "an array"}')).toEqual([]);
  });

  it('handles code fences without json language tag', () => {
    const text = `\`\`\`
[
  {
    "source_slug": "topic:crosswind",
    "target_slug": "topic:wind-correction",
    "relation_type": "requires_knowledge_of",
    "weight": 0.85,
    "examiner_transition": null,
    "confidence": 0.9
  }
]
\`\`\``;

    const result = parseEdgeResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].source_slug).toBe('topic:crosswind');
  });
});

// ---------------------------------------------------------------------------
// buildEdgeBatchPrompt
// ---------------------------------------------------------------------------

describe('buildEdgeBatchPrompt', () => {
  const sampleConcepts = [
    {
      slug: 'topic:airspace-classification',
      name: 'Airspace Classification',
      content: 'The National Airspace System is divided into classes A through G.',
      category: 'topic',
    },
    {
      slug: 'regulatory_claim:class-b-entry',
      name: 'Class B Entry Requirements',
      content: 'An ATC clearance is required to enter Class B airspace.',
      category: 'regulatory_claim',
    },
    {
      slug: 'procedure:weather-briefing',
      name: 'Weather Briefing Procedure',
      content: 'Pilots should obtain a standard weather briefing from 1800wxbrief.',
      category: 'procedure',
    },
  ];

  it('includes concept names and categories', () => {
    const result = buildEdgeBatchPrompt(sampleConcepts);

    expect(result).toContain('Airspace Classification');
    expect(result).toContain('[topic]');
    expect(result).toContain('Class B Entry Requirements');
    expect(result).toContain('[regulatory_claim]');
    expect(result).toContain('Weather Briefing Procedure');
    expect(result).toContain('[procedure]');
  });

  it('includes concept slugs for reference', () => {
    const result = buildEdgeBatchPrompt(sampleConcepts);

    expect(result).toContain('slug: topic:airspace-classification');
    expect(result).toContain('slug: regulatory_claim:class-b-entry');
    expect(result).toContain('slug: procedure:weather-briefing');
  });

  it('includes concept content', () => {
    const result = buildEdgeBatchPrompt(sampleConcepts);

    expect(result).toContain('National Airspace System');
    expect(result).toContain('ATC clearance');
    expect(result).toContain('1800wxbrief');
  });

  it('truncates long content', () => {
    const longContent = 'A'.repeat(500);
    const concepts = [
      {
        slug: 'topic:long-concept',
        name: 'Long Concept',
        content: longContent,
        category: 'topic',
      },
    ];

    const result = buildEdgeBatchPrompt(concepts);

    // Content should be truncated to 200 chars + "..."
    expect(result).not.toContain('A'.repeat(500));
    expect(result).toContain('A'.repeat(200) + '...');
  });

  it('does not truncate short content', () => {
    const shortContent = 'This is a short explanation.';
    const concepts = [
      {
        slug: 'topic:short',
        name: 'Short Concept',
        content: shortContent,
        category: 'topic',
      },
    ];

    const result = buildEdgeBatchPrompt(concepts);

    expect(result).toContain(shortContent);
    // Should not end with "..." after the content
    expect(result).not.toContain(shortContent + '...');
  });

  it('includes instruction text for the LLM', () => {
    const result = buildEdgeBatchPrompt(sampleConcepts);

    expect(result).toContain('Analyze the following aviation concepts');
    expect(result).toContain('Identify all meaningful relationships');
  });

  it('handles empty concept list', () => {
    const result = buildEdgeBatchPrompt([]);

    expect(result).toContain('Analyze the following aviation concepts');
    expect(result).toContain('Identify all meaningful relationships');
    // Should still produce valid prompt structure
    expect(result).toContain('---');
  });
});
