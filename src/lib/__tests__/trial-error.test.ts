import { describe, expect, it } from 'vitest';
import fixtures from '../../../docs/mobile/testing/contracts/session-trial-errors.json';
import { trialErrorBody } from '../trial-error';

describe('session trial error contract consumed by mobile', () => {
  it.each(fixtures)('emits the $error fixture', (fixture) => {
    const extra = fixture.error === 'trial_limit_reached' ? { limit: 3 }
      : fixture.error === 'trial_expired' ? { windowDays: 7 } : {};
    expect(trialErrorBody(fixture.error, extra)).toEqual(fixture);
    expect(fixture).not.toHaveProperty('reason');
  });
});
