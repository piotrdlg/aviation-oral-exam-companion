import { describe, it, expect } from 'vitest';
import { getTTSProviderName } from '../voice/provider-factory';

describe('getTTSProviderName', () => {
  it('returns deepgram for ground_school', () => {
    expect(getTTSProviderName('ground_school')).toBe('deepgram');
  });

  it('returns deepgram for checkride_prep', () => {
    expect(getTTSProviderName('checkride_prep')).toBe('deepgram');
  });

  it('returns deepgram for dpe_live', () => {
    expect(getTTSProviderName('dpe_live')).toBe('deepgram');
  });
});
