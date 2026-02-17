import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';

/**
 * Upgrade prompt tests.
 *
 * Covers:
 * - Free tier session limit triggers upgrade modal
 * - 80% quota warning banner
 * - Upgrade modal CTA links to /pricing
 * - Dismiss behavior for upgrade prompts
 * - Quota exceeded (429) response handling
 */

test.describe('Upgrade Prompts — Quota Exceeded', () => {
  test('shows upgrade modal when exam API returns 429 quota_exceeded', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'quota_exceeded',
          message: 'You have reached your session limit for this month',
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();

    // Attempt to start an exam
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();
  });

  test('upgrade modal contains link to pricing page', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'quota_exceeded' }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();

    const upgradeLink = page.getByTestId('upgrade-modal').getByRole('link', { name: /upgrade|pricing/i });
    await expect(upgradeLink).toBeVisible();
    await expect(upgradeLink).toHaveAttribute('href', /\/pricing/);
  });

  test('upgrade modal can be dismissed', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'quota_exceeded' }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();

    await practice.upgradeDismissButton.click();
    await expect(practice.upgradeModal).not.toBeVisible();
  });
});

test.describe('Upgrade Prompts — Proactive Warning', () => {
  test('shows warning banner at 80% quota usage', async ({ page }) => {
    // Mock user tier info with high usage
    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'ground_school',
          features: { maxSessionsPerMonth: 5 },
          usage: {
            sessionsThisMonth: 4, // 80% of 5
            ttsCharsThisMonth: 0,
            sttSecondsThisMonth: 0,
          },
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();

    await expect(practice.upgradeBanner).toBeVisible({ timeout: 5_000 });
    await expect(practice.upgradeBanner).toContainText(/80%|running low|upgrade/i);
  });

  test('no warning banner when usage is below 80%', async ({ page }) => {
    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'ground_school',
          features: { maxSessionsPerMonth: 5 },
          usage: {
            sessionsThisMonth: 2, // 40%
            ttsCharsThisMonth: 0,
            sttSecondsThisMonth: 0,
          },
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();

    await expect(practice.upgradeBanner).not.toBeVisible();
  });

  test('no upgrade prompts for paid users with unlimited sessions', async ({ page }) => {
    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'dpe_live',
          features: { maxSessionsPerMonth: -1 }, // unlimited
          usage: {
            sessionsThisMonth: 50,
            ttsCharsThisMonth: 100000,
            sttSecondsThisMonth: 5000,
          },
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();

    await expect(practice.upgradeBanner).not.toBeVisible();
    await expect(practice.upgradeModal).not.toBeVisible();
  });
});
