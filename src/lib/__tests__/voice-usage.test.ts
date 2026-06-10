import { describe, it, expect } from 'vitest';
import { checkQuota, hasTtsAccess, type UsageSummary } from '../voice/usage';

const emptyUsage: UsageSummary = {
  sessionsThisMonth: 0,
  ttsCharsThisMonth: 0,
  sttSecondsThisMonth: 0,
  exchangesThisSession: 0,
};

describe('checkQuota', () => {
  it('allows ground_school user under all limits', () => {
    const result = checkQuota('ground_school', emptyUsage);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('blocks ground_school user at session limit (now same as checkride_prep)', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      sessionsThisMonth: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('session');
  });

  it('blocks at the free-tier TTS char budget (W3.2: 35k anti-theft)', () => {
    // at-or-over the cap (>= per W3.2 off-by-one fix)
    const result = checkQuota('ground_school', { ...emptyUsage, ttsCharsThisMonth: 35_000 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('TTS');
  });

  it('blocks at the free-tier STT seconds budget (W3.2)', () => {
    const result = checkQuota('checkride_prep', { ...emptyUsage, sttSecondsThisMonth: 4_200 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('STT');
  });

  it('blocks at exchange limit (30 for free tier)', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      exchangesThisSession: 30,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exchange');
  });

  it('allows dpe_live unlimited sessions', () => {
    const result = checkQuota('dpe_live', {
      ...emptyUsage,
      sessionsThisMonth: 999,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks dpe_live at exchange limit', () => {
    const result = checkQuota('dpe_live', {
      ...emptyUsage,
      exchangesThisSession: 50,
    });
    expect(result.allowed).toBe(false);
  });
});

describe('hasTtsAccess (W3.2 / D1: voice universal)', () => {
  it('grants TTS on every tier — theft bounded by budgets, not feature gates', () => {
    expect(hasTtsAccess('ground_school')).toBe(true);
    expect(hasTtsAccess('checkride_prep')).toBe(true);
    expect(hasTtsAccess('dpe_live')).toBe(true);
  });
});
