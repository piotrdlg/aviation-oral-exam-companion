import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for HeyDPE E2E tests.
 *
 * Environment variables:
 *   BASE_URL             - App base URL (default: http://localhost:3000)
 *   TEST_USER_EMAIL      - Test user email for OTP login
 *   TEST_USER_OTP        - Test user OTP code (for local/staging)
 *   TEST_ADMIN_EMAIL     - Admin user email for Google OAuth
 *   STRIPE_TEST_CARD     - Stripe test card number (default: 4242424242424242)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Auth setup — runs once before all browser projects
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },

    // Desktop browsers
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: path.join(__dirname, 'e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: path.join(__dirname, 'e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },

    // Admin project — uses admin auth state
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'e2e/.auth/admin.json'),
      },
      dependencies: ['setup'],
    },

    // Unauthenticated tests — no stored auth state
    {
      name: 'no-auth',
      testMatch: /(landing|seo|consent|analytics|utm|marketing-pages|integration)\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
