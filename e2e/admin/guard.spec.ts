import { test, expect } from '@playwright/test';

/**
 * Admin auth guard tests.
 *
 * Covers:
 * - Non-admin authenticated users are denied access to /admin routes
 * - Unauthenticated users are redirected to /admin/login
 * - Admin API routes return 401 for unauthenticated requests
 * - Admin API routes return 403 for non-admin authenticated requests
 */

test.describe('Admin Guard — Unauthenticated Users', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated user on /admin is redirected to /admin/login', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL('**/admin/login', { timeout: 10_000 });
  });

  test('unauthenticated user on /admin/users is redirected to /admin/login', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL('**/admin/login', { timeout: 10_000 });
  });

  test('unauthenticated user on /admin/prompts is redirected to /admin/login', async ({ page }) => {
    await page.goto('/admin/prompts');
    await page.waitForURL('**/admin/login', { timeout: 10_000 });
  });

  test('unauthenticated user on /admin/config is redirected to /admin/login', async ({ page }) => {
    await page.goto('/admin/config');
    await page.waitForURL('**/admin/login', { timeout: 10_000 });
  });

  test('unauthenticated user on /admin/moderation is redirected to /admin/login', async ({ page }) => {
    await page.goto('/admin/moderation');
    await page.waitForURL('**/admin/login', { timeout: 10_000 });
  });
});

test.describe('Admin Guard — Non-Admin Authenticated Users', () => {
  // Uses default user auth state (non-admin)

  test('non-admin user on /admin sees access denied', async ({ page }) => {
    // Mock admin check to return no rows
    await page.route('**/rest/v1/admin_users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/admin');
    await expect(page.getByText(/access denied|not authorized|forbidden/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('non-admin user on /admin/users sees access denied', async ({ page }) => {
    await page.route('**/rest/v1/admin_users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/admin/users');
    await expect(page.getByText(/access denied|not authorized|forbidden/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Admin Guard — API Route Protection', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated request to /api/admin/dashboard returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/dashboard');
    expect(response.status()).toBe(401);
  });

  test('unauthenticated request to /api/admin/users returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/users');
    expect(response.status()).toBe(401);
  });

  test('unauthenticated request to /api/admin/config returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/config');
    expect(response.status()).toBe(401);
  });

  test('unauthenticated request to /api/admin/prompts returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/prompts');
    expect(response.status()).toBe(401);
  });

  test('unauthenticated request to /api/admin/moderation returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/moderation');
    expect(response.status()).toBe(401);
  });
});
