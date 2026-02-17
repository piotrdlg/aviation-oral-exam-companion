import { test, expect } from '@playwright/test';

/**
 * Account status enforcement tests.
 *
 * Covers:
 * - Banned user gets signed out and redirected to /banned
 * - Suspended user is redirected to /suspended
 * - Middleware enforces account_status on every protected route
 * - Banned/suspended pages display appropriate messages
 */

test.describe('Account Status — Banned User', () => {
  test('banned user is redirected to /banned page', async ({ page }) => {
    // Mock the user profile to return banned status
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      const url = route.request().url();
      if (url.includes('select=account_status') || url.includes('account_status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ account_status: 'banned' }]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/practice');
    await page.waitForURL('**/banned', { timeout: 10_000 });
  });

  test('/banned page displays appropriate message', async ({ page }) => {
    await page.goto('/banned');
    await expect(page.getByText(/account.*banned|suspended|disabled/i)).toBeVisible();
    await expect(page.getByText(/contact.*support/i)).toBeVisible();
  });

  test('banned user cannot access any protected route', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      const url = route.request().url();
      if (url.includes('account_status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ account_status: 'banned' }]),
        });
      } else {
        await route.continue();
      }
    });

    // Try various protected routes
    for (const path of ['/practice', '/progress', '/settings']) {
      await page.goto(path);
      await page.waitForURL('**/banned', { timeout: 10_000 });
    }
  });
});

test.describe('Account Status — Suspended User', () => {
  test('suspended user is redirected to /suspended page', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      const url = route.request().url();
      if (url.includes('account_status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ account_status: 'suspended' }]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/practice');
    await page.waitForURL('**/suspended', { timeout: 10_000 });
  });

  test('/suspended page displays appropriate message', async ({ page }) => {
    await page.goto('/suspended');
    await expect(page.getByText(/account.*suspended/i)).toBeVisible();
    await expect(page.getByText(/contact.*support/i)).toBeVisible();
  });

  test('suspended user cannot access protected routes', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      const url = route.request().url();
      if (url.includes('account_status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ account_status: 'suspended' }]),
        });
      } else {
        await route.continue();
      }
    });

    for (const path of ['/practice', '/progress', '/settings']) {
      await page.goto(path);
      await page.waitForURL('**/suspended', { timeout: 10_000 });
    }
  });
});

test.describe('Account Status — Active User', () => {
  test('active user can access all protected routes', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      const url = route.request().url();
      if (url.includes('account_status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ account_status: 'active' }]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/practice');
    // Active user should NOT be redirected to /banned or /suspended
    await expect(page).not.toHaveURL(/\/(banned|suspended)/);
  });
});

test.describe('Account Status — Unauthenticated User', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated user is redirected to /login from protected routes', async ({ page }) => {
    await page.goto('/practice');
    await page.waitForURL('**/login', { timeout: 10_000 });
  });

  test('unauthenticated user is redirected from /progress', async ({ page }) => {
    await page.goto('/progress');
    await page.waitForURL('**/login', { timeout: 10_000 });
  });

  test('unauthenticated user is redirected from /settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL('**/login', { timeout: 10_000 });
  });
});
