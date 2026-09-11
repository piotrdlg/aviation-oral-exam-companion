import { describe, expect, it } from 'vitest';
import { describeTrial } from '../trial-display';
const trial = { examsUsed: 1, examLimit: 3, examsRemaining: 2, expiresAt: '2026-09-11T13:00:00Z', serverNow: '2026-09-11T12:00:00Z', canStart: true, reason: null };
describe('Home trial counter', () => {
  it('uses the server lifetime count', () => { expect(describeTrial(trial).title).toBe('2 of 3 trial exams left'); });
  it('expires while Home is open using elapsed time against the server clock', () => { expect(describeTrial(trial, 3600001).title).toBe('Your 7-day trial ended'); });
  it('does not invent a count on an older backend', () => { expect(describeTrial(undefined).title).toBe('Trial status unavailable'); });
  it('reports exhausted lifetime exams', () => { expect(describeTrial({ ...trial, examsUsed: 3, examsRemaining: 0, reason: 'trial_limit_reached', canStart: false }).title).toBe('Trial exams used up'); });
});
