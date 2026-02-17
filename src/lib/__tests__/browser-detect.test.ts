import { describe, it, expect } from 'vitest';
import { parseUserAgent } from '../browser-detect';

describe('parseUserAgent', () => {
  describe('Desktop Chrome', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);

    it('detects Chrome', () => {
      expect(result.isChrome).toBe(true);
    });

    it('is not iOS', () => {
      expect(result.isIOS).toBe(false);
    });

    it('is not Safari', () => {
      expect(result.isSafari).toBe(false);
    });

    it('is not iOS Safari', () => {
      expect(result.isIOSSafari).toBe(false);
    });
  });

  describe('Desktop Safari', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
    const result = parseUserAgent(ua);

    it('detects Safari', () => {
      expect(result.isSafari).toBe(true);
    });

    it('is not Chrome', () => {
      expect(result.isChrome).toBe(false);
    });

    it('is not iOS', () => {
      expect(result.isIOS).toBe(false);
    });
  });

  describe('Desktop Firefox', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
    const result = parseUserAgent(ua);

    it('detects Firefox', () => {
      expect(result.isFirefox).toBe(true);
    });

    it('is not Chrome', () => {
      expect(result.isChrome).toBe(false);
    });

    it('is not Safari', () => {
      expect(result.isSafari).toBe(false);
    });
  });

  describe('iOS Safari (iPhone)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    it('detects iOS', () => {
      expect(result.isIOS).toBe(true);
    });

    it('detects iOS Safari', () => {
      expect(result.isIOSSafari).toBe(true);
    });

    it('is not iOS Chrome', () => {
      expect(result.isIOSChrome).toBe(false);
    });

    it('is not iOS Firefox', () => {
      expect(result.isIOSFirefox).toBe(false);
    });
  });

  describe('iOS Safari (iPad)', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    it('detects iOS', () => {
      expect(result.isIOS).toBe(true);
    });

    it('detects iOS Safari', () => {
      expect(result.isIOSSafari).toBe(true);
    });
  });

  describe('iOS Chrome (CriOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    it('detects iOS', () => {
      expect(result.isIOS).toBe(true);
    });

    it('detects iOS Chrome', () => {
      expect(result.isIOSChrome).toBe(true);
    });

    it('is NOT iOS Safari', () => {
      expect(result.isIOSSafari).toBe(false);
    });
  });

  describe('iOS Firefox (FxiOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    it('detects iOS', () => {
      expect(result.isIOS).toBe(true);
    });

    it('detects iOS Firefox', () => {
      expect(result.isIOSFirefox).toBe(true);
    });

    it('is NOT iOS Safari', () => {
      expect(result.isIOSSafari).toBe(false);
    });

    it('is NOT iOS Chrome', () => {
      expect(result.isIOSChrome).toBe(false);
    });
  });

  describe('iOS Edge (EdgiOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.2210.126 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    it('detects iOS', () => {
      expect(result.isIOS).toBe(true);
    });

    it('detects iOS Edge', () => {
      expect(result.isIOSEdge).toBe(true);
    });

    it('is NOT iOS Safari', () => {
      expect(result.isIOSSafari).toBe(false);
    });
  });

  describe('iPadOS (desktop mode via Macintosh + Mobile)', () => {
    // Modern iPadOS reports as Macintosh with Mobile in UA
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    it('detects iOS (iPadOS desktop mode)', () => {
      expect(result.isIOS).toBe(true);
    });

    it('detects iOS Safari', () => {
      expect(result.isIOSSafari).toBe(true);
    });
  });

  describe('Edge (desktop)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/120.0.0.0';
    const result = parseUserAgent(ua);

    it('is not Safari', () => {
      expect(result.isSafari).toBe(false);
    });

    // Edge includes "Chrome" in UA but our regex filters it out with !/Edge/
    it('is not detected as Chrome', () => {
      expect(result.isChrome).toBe(false);
    });
  });

  describe('empty user agent', () => {
    const result = parseUserAgent('');

    it('returns false for all flags', () => {
      expect(result.isIOS).toBe(false);
      expect(result.isIOSSafari).toBe(false);
      expect(result.isIOSChrome).toBe(false);
      expect(result.isSafari).toBe(false);
      expect(result.isChrome).toBe(false);
      expect(result.isFirefox).toBe(false);
    });
  });
});
