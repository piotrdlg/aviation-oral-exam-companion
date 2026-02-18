import { test, expect } from '@playwright/test';
import { getDataLayerEvents } from '../helpers/storage';

/**
 * UTM → dataLayer integration tests.
 *
 * Covers:
 * - UTM params in URL push a `utm_captured` event to window.dataLayer
 * - No `utm_captured` event when visiting without UTM params
 *
 * Uses getDataLayerEvents helper to filter dataLayer by event name.
 * These tests run under the `no-auth` project (unauthenticated).
 */

test.describe('UTM — dataLayer Events', () => {
  test('utm_captured event pushed to dataLayer when UTM params present', async ({
    page,
  }) => {
    await page.goto(
      '/?utm_source=google&utm_medium=cpc&utm_campaign=checkride'
    );

    const events = await getDataLayerEvents(page, 'utm_captured');
    expect(events.length).toBeGreaterThanOrEqual(1);

    const captured = events[0];
    expect(captured.utm_source).toBe('google');
    expect(captured.utm_medium).toBe('cpc');
    expect(captured.utm_campaign).toBe('checkride');
  });

  test('no utm_captured event when visiting without UTM params', async ({
    page,
  }) => {
    await page.goto('/');

    const events = await getDataLayerEvents(page, 'utm_captured');
    expect(events).toHaveLength(0);
  });
});
