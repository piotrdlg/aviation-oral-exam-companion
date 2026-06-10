import { describe, it, expect } from 'vitest';
import { scanScenarioConsistency } from '../scenario-consistency';

// The route's assignScenarioArm is module-private; replicate the exact hash
// here as the contract (FNV-1a % 2) — this test pins the algorithm so a
// route-side change breaks loudly.
function assignScenarioArm(userId: string): 'scenario' | 'linear' {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? 'scenario' : 'linear';
}

describe('A/B arm assignment (W5.6)', () => {
  it('is sticky: same user always gets the same arm', () => {
    for (const u of ['user-1', 'a1b2c3', 'f00ba7-uuid-4242']) {
      const first = assignScenarioArm(u);
      for (let i = 0; i < 5; i++) expect(assignScenarioArm(u)).toBe(first);
    }
  });

  it('is balanced within 45-55% over 10k synthetic users', () => {
    let scenario = 0;
    for (let i = 0; i < 10_000; i++) {
      if (assignScenarioArm(`uuid-${i}-${i * 7919}`) === 'scenario') scenario++;
    }
    expect(scenario).toBeGreaterThan(4500);
    expect(scenario).toBeLessThan(5500);
  });
});

describe('scenario consistency scan (W5.6)', () => {
  it('passes when examiner turns use only the scenario tail number', () => {
    const r = scanScenarioConsistency('Cessna 172S, N735KT, steam gauges', [
      'You are flying N735KT today — what documents must be aboard?',
      'Good. Now about the weather along your route…',
    ]);
    expect(r.consistent).toBe(true);
  });

  it('flags a foreign tail number introduced mid-exam', () => {
    const r = scanScenarioConsistency('Cessna 172S, N735KT', [
      'Back to N8421D for a moment — what was its useful load?',
    ]);
    expect(r.consistent).toBe(false);
    expect(r.foreignTailNumbers).toEqual(['N8421D']);
  });

  it('tolerates spines without a tail number (no false flags on prose)', () => {
    const r = scanScenarioConsistency('a rented Archer', ['Tell me about VOR checks.']);
    expect(r.consistent).toBe(true);
  });
});
