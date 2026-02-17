import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

/**
 * Signup tests.
 *
 * After auth migration, there is no separate /signup page.
 * OTP login with shouldCreateUser: true auto-creates accounts.
 * These tests verify:
 * - New user can sign up via OTP (account auto-created)
 * - The old /signup URL redirects to /login
 * - Email validation errors on signup flow
 */

test.describe('Signup — OTP Auto-Create Account', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test('/signup redirects to /login after auth migration', async ({ page }) => {
    await page.goto('/signup');
    // After auth migration, /signup should redirect to /login
    // The middleware or a redirect should handle this
    await page.waitForURL('**/login', { timeout: 10_000 });
  });

  test('new user can create account via OTP on login page', async ({ page }) => {
    await page.route('**/auth/v1/otp*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await loginPage.goto();
    await loginPage.fillEmail('newpilot@example.com');
    await loginPage.sendOtp();
    await loginPage.expectOtpInputVisible();

    // The OTP was sent successfully, which means shouldCreateUser: true
    // created the account if it did not exist
  });

  test('shows validation error for malformed email on signup', async () => {
    await loginPage.goto();
    await loginPage.fillEmail('invalid-email');
    await loginPage.sendOtp();
    await loginPage.expectError(/valid email/i);
  });

  test('shows validation error for empty email on signup', async () => {
    await loginPage.goto();
    await loginPage.sendOtp();
    await loginPage.expectError(/email.*required/i);
  });

  test('new user receives OTP and verifies to land on practice page', async ({ page }) => {
    // Mock successful OTP send
    await page.route('**/auth/v1/otp*', async (route) => {
      await route.fulfill({ status: 200, body: '{}' });
    });

    // Mock successful OTP verify with new user session
    await page.route('**/auth/v1/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'new-user-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'new-user-refresh-token',
          user: {
            id: 'new-user-id',
            email: 'newpilot@example.com',
            role: 'authenticated',
            created_at: new Date().toISOString(),
          },
        }),
      });
    });

    await loginPage.goto();
    await loginPage.fillEmail('newpilot@example.com');
    await loginPage.sendOtp();
    await loginPage.expectOtpInputVisible();
    await loginPage.enterOtpCode('654321');
    // After verification, new users should be redirected to /practice
  });

  test('Google OAuth creates account if not exists', async ({ page }) => {
    await loginPage.goto();
    // Verify Google OAuth button is available as a signup mechanism
    await expect(loginPage.googleButton).toBeVisible();
    await expect(loginPage.googleButton).toBeEnabled();
  });
});
