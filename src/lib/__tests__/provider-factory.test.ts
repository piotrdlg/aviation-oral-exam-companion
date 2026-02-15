import { describe, it, expect } from 'vitest';
import { getTTSProviderName } from '../voice/provider-factory';

describe('getTTSProviderName', () => {
  it('returns openai for ground_school', () => {
    expect(getTTSProviderName('ground_school')).toBe('openai');
  });

  it('returns deepgram for checkride_prep', () => {
    expect(getTTSProviderName('checkride_prep')).toBe('deepgram');
  });

  it('returns cartesia for dpe_live', () => {
    expect(getTTSProviderName('dpe_live')).toBe('cartesia');
  });
});
