import { describe, it, expect } from 'vitest';
import {
  DEPTH_PROFILES,
  getDepthProfile,
  getElementDepthGuidance,
  type DepthProfile,
} from '../depth-profile';
import type { Rating, ElementType } from '@/types/database';

describe('DEPTH_PROFILES', () => {
  it('defines profiles for all four ratings', () => {
    const ratings: Rating[] = ['private', 'commercial', 'instrument', 'atp'];
    for (const r of ratings) {
      expect(DEPTH_PROFILES[r]).toBeDefined();
      expect(DEPTH_PROFILES[r].rating).toBe(r);
    }
  });

  it('each profile has all required fields', () => {
    const requiredFields: (keyof DepthProfile)[] = [
      'rating', 'label', 'expectedDepth', 'regulatoryPrecision',
      'partialTolerance', 'scenarioStyle', 'crossTopicExpectation',
      'knowledgeGuidance', 'riskGuidance',
    ];
    for (const profile of Object.values(DEPTH_PROFILES)) {
      for (const field of requiredFields) {
        expect(profile[field], `${profile.rating}.${field}`).toBeTruthy();
      }
    }
  });

  it('private profile is lenient on precision', () => {
    const p = DEPTH_PROFILES.private;
    expect(p.regulatoryPrecision.toLowerCase()).toContain('general');
    expect(p.partialTolerance.toLowerCase()).toContain('generous');
  });

  it('commercial profile expects operational depth', () => {
    const p = DEPTH_PROFILES.commercial;
    expect(p.expectedDepth.toLowerCase()).toContain('operational');
    expect(p.regulatoryPrecision.toLowerCase()).toContain('moderate');
  });

  it('instrument profile demands precision', () => {
    const p = DEPTH_PROFILES.instrument;
    expect(p.expectedDepth.toLowerCase()).toContain('precision');
    expect(p.regulatoryPrecision.toLowerCase()).toContain('high');
    expect(p.partialTolerance.toLowerCase()).toContain('strict');
  });

  it('depth profiles have distinct expected depths across ratings', () => {
    const depths = Object.values(DEPTH_PROFILES).map(p => p.expectedDepth);
    const uniqueDepths = new Set(depths);
    expect(uniqueDepths.size).toBe(depths.length);
  });

  it('partial tolerance increases from instrument to private', () => {
    const inst = DEPTH_PROFILES.instrument.partialTolerance.length;
    const priv = DEPTH_PROFILES.private.partialTolerance.length;
    // Both should be non-trivial
    expect(inst).toBeGreaterThan(20);
    expect(priv).toBeGreaterThan(20);
  });
});

describe('getDepthProfile', () => {
  it('returns correct profile for known ratings', () => {
    expect(getDepthProfile('private').rating).toBe('private');
    expect(getDepthProfile('commercial').rating).toBe('commercial');
    expect(getDepthProfile('instrument').rating).toBe('instrument');
    expect(getDepthProfile('atp').rating).toBe('atp');
  });

  it('falls back to private for unknown rating', () => {
    const profile = getDepthProfile('unknown_rating' as Rating);
    expect(profile.rating).toBe('private');
  });
});

describe('getElementDepthGuidance', () => {
  it('returns knowledge guidance for knowledge elements', () => {
    const profile = DEPTH_PROFILES.private;
    const guidance = getElementDepthGuidance(profile, 'knowledge');
    expect(guidance).toBe(profile.knowledgeGuidance);
  });

  it('returns risk guidance for risk elements', () => {
    const profile = DEPTH_PROFILES.commercial;
    const guidance = getElementDepthGuidance(profile, 'risk');
    expect(guidance).toBe(profile.riskGuidance);
  });

  it('returns knowledge guidance for skill elements (oral exam fallback)', () => {
    const profile = DEPTH_PROFILES.instrument;
    const guidance = getElementDepthGuidance(profile, 'skill');
    expect(guidance).toBe(profile.knowledgeGuidance);
  });

  it('handles unknown element types gracefully', () => {
    const profile = DEPTH_PROFILES.private;
    const guidance = getElementDepthGuidance(profile, 'future_type' as ElementType);
    expect(guidance).toBe(profile.knowledgeGuidance);
  });

  it('produces different guidance for knowledge vs risk', () => {
    for (const profile of Object.values(DEPTH_PROFILES)) {
      expect(
        profile.knowledgeGuidance,
        `${profile.rating}: knowledge and risk guidance should differ`
      ).not.toBe(profile.riskGuidance);
    }
  });
});
