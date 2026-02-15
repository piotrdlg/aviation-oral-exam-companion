import { describe, it, expect } from 'vitest';
import { checkQuota, type UsageSummary } from '../voice/usage';

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

  it('blocks ground_school user at session limit', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      sessionsThisMonth: 30,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('session');
  });

  it('blocks at TTS char limit', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      ttsCharsThisMonth: 200_001,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('TTS');
  });

  it('blocks at exchange limit', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      exchangesThisSession: 20,
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
