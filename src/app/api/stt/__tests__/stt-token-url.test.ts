import { describe, it, expect } from 'vitest';
import { buildListenUrl, UnsupportedEncodingError } from '../token/listen-url';

describe('buildListenUrl', () => {
  it('omits encoding for the web container default (Nova-3 /v1)', () => {
    const { url } = buildListenUrl({ flux: false, keytermsConfig: [] });
    expect(url).toContain('wss://api.deepgram.com/v1/listen?');
    expect(url).toContain('model=nova-3');
    expect(url).not.toContain('encoding=');
    expect(url).not.toContain('sample_rate=');
  });

  it('appends encoding + sample_rate for native linear16 / 16k', () => {
    const { url } = buildListenUrl({ flux: false, keytermsConfig: [], encoding: 'linear16', sampleRate: 16000 });
    expect(url).toContain('encoding=linear16');
    expect(url).toContain('sample_rate=16000');
  });

  it('defaults the sample rate to 16000 when an out-of-allowlist rate is requested', () => {
    const { url } = buildListenUrl({ flux: false, keytermsConfig: [], encoding: 'linear16', sampleRate: 12345 });
    expect(url).toContain('sample_rate=16000');
  });

  it('accepts 48000 as the documented escape hatch', () => {
    const { url } = buildListenUrl({ flux: false, keytermsConfig: [], encoding: 'linear16', sampleRate: 48000 });
    expect(url).toContain('sample_rate=48000');
  });

  it('throws UnsupportedEncodingError for a non-allowlisted encoding (never forwarded to Deepgram)', () => {
    expect(() => buildListenUrl({ flux: false, keytermsConfig: [], encoding: 'mulaw' })).toThrow(UnsupportedEncodingError);
  });

  it('uses the Flux /v2 endpoint when flux is enabled', () => {
    const { url } = buildListenUrl({ flux: true, keytermsConfig: [] });
    expect(url).toContain('wss://api.deepgram.com/v2/listen?');
    expect(url).toContain('model=flux-general-en');
  });

  it('appends one keyterm= per configured term and reports the count', () => {
    const { url, keytermCount } = buildListenUrl({ flux: false, keytermsConfig: ['METAR', 'TAF'] });
    expect(keytermCount).toBe(2);
    expect(url).toContain('keyterm=METAR');
    expect(url).toContain('keyterm=TAF');
  });
});
