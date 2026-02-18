import { test, expect } from '@playwright/test';

/**
 * Security headers tests.
 *
 * Covers:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 1; mode=block
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy includes microphone=(self)
 *
 * Parametrized across all 7 public pages.
 */

const PUBLIC_PAGES = [
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/try',
  '/login',
  '/signup',
];

for (const path of PUBLIC_PAGES) {
  test.describe(`Security Headers — ${path}`, () => {
    test('X-Content-Type-Options is nosniff', async ({ request }) => {
      const response = await request.get(path);
      const header = response.headers()['x-content-type-options'];
      expect(header).toBe('nosniff');
    });

    test('X-Frame-Options is DENY', async ({ request }) => {
      const response = await request.get(path);
      const header = response.headers()['x-frame-options'];
      expect(header).toBe('DENY');
    });

    test('X-XSS-Protection is 1; mode=block', async ({ request }) => {
      const response = await request.get(path);
      const header = response.headers()['x-xss-protection'];
      expect(header).toBe('1; mode=block');
    });

    test('Referrer-Policy is strict-origin-when-cross-origin', async ({ request }) => {
      const response = await request.get(path);
      const header = response.headers()['referrer-policy'];
      expect(header).toBe('strict-origin-when-cross-origin');
    });

    test('Permissions-Policy contains microphone=(self)', async ({ request }) => {
      const response = await request.get(path);
      const header = response.headers()['permissions-policy'] ?? '';
      expect(header).toContain('microphone=(self)');
    });
  });
}
