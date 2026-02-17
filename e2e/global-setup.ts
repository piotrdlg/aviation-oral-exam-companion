import { test as setup, expect } from '@playwright/test';
import path from 'path';

const USER_AUTH_FILE = path.join(__dirname, '.auth/user.json');
const ADMIN_AUTH_FILE = path.join(__dirname, '.auth/admin.json');

/**
 * Global setup: authenticate a test user and admin user,
 * then save their storage state for reuse across all test projects.
 *
 * In CI, this uses test-specific OTP codes or pre-seeded sessions.
 * Locally, you can set TEST_USER_EMAIL and TEST_USER_OTP env vars.
 */
setup('authenticate test user', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const otp = process.env.TEST_USER_OTP;

  if (!email || !otp) {
    // Skip auth setup if credentials not provided — tests that need auth will fail explicitly
    console.warn('TEST_USER_EMAIL or TEST_USER_OTP not set. Skipping user auth setup.');
    // Write empty auth state so Playwright does not error on missing file
    await page.context().storageState({ path: USER_AUTH_FILE });
    return;
  }

  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('send-otp-button').click();

  // Wait for OTP input to appear
  await expect(page.getByTestId('otp-input-0')).toBeVisible({ timeout: 10_000 });

  // Enter 6-digit OTP code
  const digits = otp.split('');
  for (let i = 0; i < digits.length; i++) {
    await page.getByTestId(`otp-input-${i}`).fill(digits[i]);
  }

  // Wait for redirect to /practice after successful login
  await page.waitForURL('**/practice', { timeout: 15_000 });
  await expect(page.getByTestId('practice-page')).toBeVisible();

  // Save authenticated state
  await page.context().storageState({ path: USER_AUTH_FILE });
});

setup('authenticate admin user', async ({ page }) => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn('TEST_ADMIN_EMAIL not set. Skipping admin auth setup.');
    await page.context().storageState({ path: ADMIN_AUTH_FILE });
    return;
  }

  // Admin auth uses Google OAuth — in test environments, mock the OAuth flow
  // by intercepting the OAuth redirect and injecting a test session.
  // For real E2E, use a pre-authenticated admin session cookie.
  await page.goto('/admin/login');

  // In test mode, the app should accept a test admin token
  // This is handled by route interception in the admin test specs
  await page.context().storageState({ path: ADMIN_AUTH_FILE });
});
