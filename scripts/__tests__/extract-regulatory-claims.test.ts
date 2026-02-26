import { describe, it, expect } from 'vitest';
import {
  generateClaimSlug,
  parseClaimsResponse,
  normalizeCfrReference,
} from '../extract-regulatory-claims';

// ---------------------------------------------------------------------------
// normalizeCfrReference
// ---------------------------------------------------------------------------

describe('normalizeCfrReference', () => {
  it('normalizes "14 CFR 91.155" to "14_cfr_91.155"', () => {
    expect(normalizeCfrReference('14 CFR 91.155')).toBe('14_cfr_91.155');
  });

  it('strips section signs', () => {
    expect(normalizeCfrReference('§91.155')).toBe('91.155');
  });

  it('handles "14 CFR §91.155(a)"', () => {
    expect(normalizeCfrReference('14 CFR §91.155(a)')).toBe('14_cfr_91.155(a)');
  });
});

// ---------------------------------------------------------------------------
// generateClaimSlug
// ---------------------------------------------------------------------------

describe('generateClaimSlug', () => {
  it('generates correct slug for a claim with CFR reference', () => {
    const claim = {
      claim_text: 'VFR visibility must be at least 3 statute miles in Class B airspace.',
      cfr_reference: '14 CFR 91.155',
      domain: 'weather_minimums',
      conditions: { airspace_class: 'B' },
      numeric_values: { visibility_sm: 3 },
    };

    const slug = generateClaimSlug(claim);

    // Should start with the normalized CFR reference prefix
    expect(slug).toMatch(/^regulatory_claim:14_cfr_91\.155:[a-f0-9]{8}$/);
  });

  it('generates unref slug when cfr_reference is null', () => {
    const claim = {
      claim_text: 'Pilots must maintain situational awareness at all times.',
      cfr_reference: null,
      domain: 'operations',
      conditions: {},
      numeric_values: {},
    };

    const slug = generateClaimSlug(claim);

    expect(slug).toMatch(/^regulatory_claim:unref:[a-f0-9]{8}$/);
  });

  it('different conditions produce different slugs', () => {
    const baseClaim = {
      claim_text: 'VFR visibility minimum.',
      cfr_reference: '14 CFR 91.155',
      domain: 'weather_minimums',
      numeric_values: {},
    };

    const slugA = generateClaimSlug({
      ...baseClaim,
      conditions: { airspace_class: 'B' },
    });

    const slugB = generateClaimSlug({
      ...baseClaim,
      conditions: { airspace_class: 'C' },
    });

    expect(slugA).not.toBe(slugB);
    // Both should share the same CFR prefix but differ in hash
    expect(slugA.slice(0, 'regulatory_claim:14_cfr_91.155:'.length)).toBe(
      slugB.slice(0, 'regulatory_claim:14_cfr_91.155:'.length),
    );
  });
});

// ---------------------------------------------------------------------------
// parseClaimsResponse
// ---------------------------------------------------------------------------

describe('parseClaimsResponse', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify([
      {
        claim_text: 'Minimum visibility is 3 SM in Class B.',
        cfr_reference: '14 CFR 91.155',
        domain: 'weather_minimums',
        conditions: { airspace_class: 'B' },
        numeric_values: { visibility_sm: 3 },
      },
    ]);

    const result = parseClaimsResponse(json);

    expect(result).toHaveLength(1);
    expect(result[0].claim_text).toBe('Minimum visibility is 3 SM in Class B.');
    expect(result[0].domain).toBe('weather_minimums');
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseClaimsResponse('not valid json {')).toEqual([]);
    expect(parseClaimsResponse('')).toEqual([]);
    expect(parseClaimsResponse('I cannot extract any claims.')).toEqual([]);
  });

  it('handles JSON wrapped in markdown code fence', () => {
    const fenced = '```json\n[\n  {\n    "claim_text": "Test claim.",\n    "cfr_reference": null,\n    "domain": "operations",\n    "conditions": {},\n    "numeric_values": {}\n  }\n]\n```';

    const result = parseClaimsResponse(fenced);

    expect(result).toHaveLength(1);
    expect(result[0].claim_text).toBe('Test claim.');
  });

  it('filters out claims missing required fields (claim_text, domain)', () => {
    const json = JSON.stringify([
      // Valid claim
      {
        claim_text: 'Valid claim text.',
        cfr_reference: null,
        domain: 'operations',
        conditions: {},
        numeric_values: {},
      },
      // Missing claim_text
      {
        cfr_reference: '14 CFR 91.3',
        domain: 'operations',
        conditions: {},
        numeric_values: {},
      },
      // Missing domain
      {
        claim_text: 'Another claim.',
        cfr_reference: null,
        conditions: {},
        numeric_values: {},
      },
      // Empty claim_text
      {
        claim_text: '',
        cfr_reference: null,
        domain: 'operations',
        conditions: {},
        numeric_values: {},
      },
      // Empty domain
      {
        claim_text: 'Yet another claim.',
        cfr_reference: null,
        domain: '',
        conditions: {},
        numeric_values: {},
      },
      // Null entry
      null,
      // Numeric instead of object
      42,
    ]);

    const result = parseClaimsResponse(json);

    expect(result).toHaveLength(1);
    expect(result[0].claim_text).toBe('Valid claim text.');
  });
});
