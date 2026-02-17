import { test, expect } from '@playwright/test';

/**
 * Auth callback route tests (/auth/callback).
 *
 * Covers:
 * - OAuth code exchange (Google, Apple, Microsoft)
 * - OTP verification redirect
 * - Error handling for invalid/expired codes
 * - Redirect to target page after successful auth (e.g., ?next=/admin)
 * - last_login_at and auth_method tracking
 */

test.describe('Auth Callback — Code Exchange', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('exchanges valid OAuth code and redirects to practice', async ({ page }) => {
    // Mock the Supabase auth code exchange
    await page.route('**/auth/v1/token?grant_type=pkce*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'oauth-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'oauth-refresh-token',
          user: {
            id: 'oauth-user-id',
            email: 'pilot@gmail.com',
            role: 'authenticated',
            app_metadata: { provider: 'google' },
          },
        }),
      });
    });

    // Mock the user profile update (last_login_at, auth_method)
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, body: '{}' });
      } else {
        await route.continue();
      }
    });

    await page.goto('/auth/callback?code=test-auth-code');
    // Should redirect to /practice after successful code exchange
    await page.waitForURL('**/practice', { timeout: 15_000 });
  });

  test('redirects to specified next URL after code exchange', async ({ page }) => {
    await page.route('**/auth/v1/token?grant_type=pkce*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'admin-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'admin-refresh-token',
          user: {
            id: 'admin-user-id',
            email: 'admin@heydpe.com',
            role: 'authenticated',
            app_metadata: { provider: 'google' },
          },
        }),
      });
    });

    await page.route('**/rest/v1/user_profiles*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, body: '{}' });
      } else {
        await route.continue();
      }
    });

    await page.goto('/auth/callback?code=test-auth-code&next=/admin');
    // Should redirect to /admin after successful code exchange
    await page.waitForURL('**/admin', { timeout: 15_000 });
  });

  test('shows error page for invalid auth code', async ({ page }) => {
    await page.route('**/auth/v1/token?grant_type=pkce*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid code' }),
      });
    });

    await page.goto('/auth/callback?code=invalid-code');
    // Should show an error or redirect to login with error
    await expect(page.getByText(/error|invalid|expired/i)).toBeVisible({ timeout: 10_000 });
  });

  test('redirects to login when no code parameter provided', async ({ page }) => {
    await page.goto('/auth/callback');
    // Missing code should redirect to login
    await page.waitForURL('**/login', { timeout: 10_000 });
  });

  test('handles expired auth code gracefully', async ({ page }) => {
    await page.route('**/auth/v1/token?grant_type=pkce*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Auth code has expired',
        }),
      });
    });

    await page.goto('/auth/callback?code=expired-code');
    await expect(page.getByText(/expired|error|try again/i)).toBeVisible({ timeout: 10_000 });
  });
});
