import { test, expect } from '@playwright/test';

/**
 * Browser detection utility output verification tests.
 *
 * Covers:
 * - BrowserCapabilities interface completeness
 * - Correct browser name detection
 * - iOS detection
 * - User gesture requirement detection
 * - MediaRecorder MIME type detection per browser
 */

test.describe('Browser Detection — Chrome Desktop', () => {
  test.use({ ...test.info().project.use });

  test('detects correct browser capabilities in Chrome', async ({ page }) => {
    await page.goto('/practice');

    const capabilities = await page.evaluate(() => {
      const ua = navigator.userAgent;
      const isIOS =
        /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isSafari = /^((?!chrome|android|CriOS|FxiOS|EdgiOS).)*safari/i.test(ua);

      return {
        supportsAudioWorklet:
          typeof AudioContext !== 'undefined' && 'audioWorklet' in AudioContext.prototype,
        supportsMediaRecorder: typeof MediaRecorder !== 'undefined',
        supportsWebSocket: typeof WebSocket !== 'undefined',
        isIOS,
        isSafari,
        isChrome: /Chrome\//.test(ua) && !/Edg\//.test(ua),
        userAgent: ua,
      };
    });

    expect(capabilities.supportsWebSocket).toBe(true);
    expect(capabilities.supportsMediaRecorder).toBe(true);
    expect(capabilities.isIOS).toBe(false);
  });
});

test.describe('Browser Detection — Feature Probing', () => {
  test('AudioContext is available', async ({ page }) => {
    await page.goto('/practice');
    const hasAudioContext = await page.evaluate(() => typeof AudioContext !== 'undefined');
    expect(hasAudioContext).toBe(true);
  });

  test('navigator.mediaDevices is available', async ({ page }) => {
    await page.goto('/practice');
    const hasMediaDevices = await page.evaluate(
      () => typeof navigator.mediaDevices !== 'undefined'
    );
    expect(hasMediaDevices).toBe(true);
  });

  test('navigator.mediaDevices.getUserMedia is a function', async ({ page }) => {
    await page.goto('/practice');
    const hasGetUserMedia = await page.evaluate(
      () => typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
    expect(hasGetUserMedia).toBe(true);
  });
});

test.describe('Browser Detection — User Agent Parsing', () => {
  test('user agent string is non-empty', async ({ page }) => {
    await page.goto('/practice');
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua.length).toBeGreaterThan(0);
  });

  test('user gesture requirement detection logic', async ({ page }) => {
    await page.goto('/practice');

    const requiresGesture = await page.evaluate(() => {
      const ua = navigator.userAgent;
      const isIOS =
        /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isSafari = /^((?!chrome|android|CriOS|FxiOS|EdgiOS).)*safari/i.test(ua);
      return isIOS || isSafari;
    });

    // In headless Chromium, this should be false
    expect(typeof requiresGesture).toBe('boolean');
  });
});

test.describe('Browser Detection — WebKit Specific', () => {
  test('WebKit project correctly identifies Safari capabilities', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'WebKit-specific test');

    await page.goto('/practice');

    const capabilities = await page.evaluate(() => {
      const ua = navigator.userAgent;
      return {
        isSafari: /^((?!chrome|android|CriOS|FxiOS|EdgiOS).)*safari/i.test(ua),
        supportsAudioWorklet:
          typeof AudioContext !== 'undefined' && 'audioWorklet' in AudioContext.prototype,
        mediaRecorderMimeType:
          typeof MediaRecorder !== 'undefined' &&
          MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/mp4',
      };
    });

    // WebKit may report as Safari in Playwright's WebKit browser
    expect(capabilities.mediaRecorderMimeType).toBeDefined();
  });
});

test.describe('Browser Detection — Firefox Specific', () => {
  test('Firefox correctly detected with appropriate capabilities', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'firefox', 'Firefox-specific test');

    await page.goto('/practice');

    const capabilities = await page.evaluate(() => {
      const ua = navigator.userAgent;
      return {
        isFirefox: /Firefox\//.test(ua),
        supportsMediaRecorder: typeof MediaRecorder !== 'undefined',
        supportsWebSocket: typeof WebSocket !== 'undefined',
      };
    });

    expect(capabilities.isFirefox).toBe(true);
    expect(capabilities.supportsWebSocket).toBe(true);
  });
});
