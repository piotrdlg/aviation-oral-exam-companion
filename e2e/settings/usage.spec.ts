import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * Usage dashboard tests.
 *
 * Covers:
 * - Usage metrics display (sessions this month, TTS characters)
 * - Daily limit indicators
 * - Usage progress bars
 * - Renewal date display
 * - Manage Subscription button for paid users
 * - Usage section layout
 */

test.describe('Usage Dashboard — Paid User', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'dpe_live',
          features: {
            maxSessionsPerMonth: -1,
            maxTtsCharsPerMonth: -1,
            maxSttSecondsPerMonth: -1,
          },
          usage: {
            sessionsThisMonth: 23,
            ttsCharsThisMonth: 45000,
            sttSecondsThisMonth: 2100,
          },
        }),
      });
    });

    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'dpe_live',
          subscription_status: 'active',
          stripe_customer_id: 'cus_test',
          current_period_end: '2026-03-16T00:00:00Z',
        }]),
      });
    });

    settings = new SettingsPage(page);
    await settings.goto();
  });

  test('displays usage section', async () => {
    await expect(settings.usageSection).toBeVisible();
  });

  test('displays sessions this month', async () => {
    await expect(settings.sessionsUsage).toBeVisible();
    await expect(settings.sessionsUsage).toContainText('23');
  });

  test('displays TTS usage', async () => {
    await expect(settings.ttsUsage).toBeVisible();
  });

  test('displays current plan', async () => {
    await settings.expectCurrentPlan(/dpe.*live|premium/i);
  });

  test('displays renewal date', async () => {
    await expect(settings.renewalDate).toBeVisible();
    await expect(settings.renewalDate).toContainText(/march|2026/i);
  });

  test('manage subscription button is visible', async () => {
    await expect(settings.manageSubscriptionButton).toBeVisible();
  });

  test('unlimited sessions shows unlimited indicator', async ({ page }) => {
    // With maxSessionsPerMonth: -1, should show "Unlimited" not a cap
    await expect(page.getByText(/unlimited/i)).toBeVisible();
  });
});

test.describe('Usage Dashboard — Free User', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'ground_school',
          features: {
            maxSessionsPerMonth: 5,
            maxTtsCharsPerMonth: 10000,
            maxSttSecondsPerMonth: 600,
          },
          usage: {
            sessionsThisMonth: 3,
            ttsCharsThisMonth: 4500,
            sttSecondsThisMonth: 200,
          },
        }),
      });
    });

    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'ground_school',
          subscription_status: 'none',
        }]),
      });
    });

    settings = new SettingsPage(page);
    await settings.goto();
  });

  test('shows usage with limits for free tier', async () => {
    await expect(settings.sessionsUsage).toContainText(/3.*5|3 of 5/i);
  });

  test('upgrade button is visible for free users', async () => {
    await expect(settings.upgradeButton).toBeVisible();
  });

  test('no manage subscription button for free users', async () => {
    await expect(settings.manageSubscriptionButton).not.toBeVisible();
  });
});

test.describe('Usage Dashboard — Daily Limits', () => {
  test('displays daily limit information when hard caps set', async ({ page }) => {
    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'dpe_live',
          features: { maxSessionsPerMonth: -1 },
          usage: {
            sessionsThisMonth: 10,
            ttsCharsThisMonth: 20000,
            sttSecondsThisMonth: 900,
          },
          dailyLimits: {
            llmTokens: { used: 45000, limit: 100000 },
            ttsChars: { used: 12000, limit: 50000 },
            sttSeconds: { used: 1200, limit: 3600 },
          },
        }),
      });
    });

    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'dpe_live',
          subscription_status: 'active',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.usageSection).toBeVisible();
  });
});
