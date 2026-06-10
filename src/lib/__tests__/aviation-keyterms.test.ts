import { describe, it, expect } from 'vitest';
import { AVIATION_KEYTERMS, appendKeytermParams } from '../voice/aviation-keyterms';

describe('aviation keyterms (W4.3)', () => {
  it('stays far under the Deepgram 500-token budget', () => {
    // Rough upper bound: 1 token ≈ a word or acronym chunk; count words ×1.5
    // for safety. The live handshake was verified, but this guards growth.
    const approxTokens = AVIATION_KEYTERMS
      .flatMap((t) => t.split(/\s+/))
      .length * 1.5;
    expect(approxTokens).toBeLessThan(400);
  });

  it('keeps the URL within sane handshake limits', () => {
    const params = new URLSearchParams({ model: 'nova-3' });
    appendKeytermParams(params);
    const url = 'wss://api.deepgram.com/v1/listen?' + params.toString();
    // The old keywords= incident URL was rejected; the verified W4.3 URL is
    // ~830 chars. Guard against unbounded growth past common URL limits.
    expect(url.length).toBeLessThan(2000);
  });

  it('appends one keyterm param per term', () => {
    const params = new URLSearchParams();
    appendKeytermParams(params);
    expect(params.getAll('keyterm')).toEqual(AVIATION_KEYTERMS);
  });

  it('honors a valid system_config override', () => {
    const params = new URLSearchParams();
    const used = appendKeytermParams(params, ['METAR', 'VOR']);
    expect(used).toEqual(['METAR', 'VOR']);
    expect(params.getAll('keyterm')).toEqual(['METAR', 'VOR']);
  });

  it('an empty-array override disables keyterms entirely', () => {
    const params = new URLSearchParams();
    expect(appendKeytermParams(params, [])).toEqual([]);
    expect(params.getAll('keyterm')).toEqual([]);
  });

  it('falls back to the default list on a malformed override', () => {
    const params = new URLSearchParams();
    expect(appendKeytermParams(params, [1, 2] as unknown)).toEqual(AVIATION_KEYTERMS);
    expect(appendKeytermParams(new URLSearchParams(), 'METAR' as unknown)).toEqual(AVIATION_KEYTERMS);
  });

  it('contains the high-confusion exam terms', () => {
    for (const must of ['METAR', 'CTAF', 'Vso', 'hypoxia', 'pitot static']) {
      expect(AVIATION_KEYTERMS).toContain(must);
    }
  });
});
