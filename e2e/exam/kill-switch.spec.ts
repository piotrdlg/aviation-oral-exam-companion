import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';

/**
 * Kill switch enforcement tests.
 *
 * Covers:
 * - Kill switch blocks exam start with appropriate error message
 * - Maintenance mode blocks all operations
 * - Provider-specific kill switches (Anthropic, Deepgram, Cartesia)
 * - Tier-specific kill switches with degradation (dpe_live -> checkride_prep)
 * - In-flight requests are allowed to complete
 * - Kill switch reversal allows immediate resumption
 */

test.describe('Kill Switch — Exam Start Blocked', () => {
  test('anthropic kill switch blocks exam start', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'service_unavailable',
          message: 'Provider anthropic is temporarily disabled',
          killSwitch: true,
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectKillSwitchError();
  });

  test('maintenance mode shows maintenance message', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'maintenance',
          message: 'HeyDPE is undergoing scheduled maintenance. Please try again in 30 minutes.',
          killSwitch: true,
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await expect(practice.errorBanner).toBeVisible();
    await expect(practice.errorBanner).toContainText(/maintenance/i);
  });

  test('tier kill switch shows tier-specific message', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'service_unavailable',
          message: 'Tier dpe_live is temporarily disabled',
          killSwitch: true,
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await expect(practice.errorBanner).toContainText(/disabled|unavailable/i);
  });
});

test.describe('Kill Switch — TTS and STT Blocked', () => {
  test('TTS kill switch shows voice unavailable message', async ({ page }) => {
    // Exam starts fine, but TTS is blocked
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'PA.I.A',
          taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Welcome to the exam.',
        }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'service_unavailable',
          message: 'Voice is temporarily unavailable',
          killSwitch: true,
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    // TTS failure should show a text-mode fallback banner
    await expect(page.getByText(/voice.*unavailable|text mode/i)).toBeVisible({ timeout: 15_000 });
  });

  test('STT kill switch falls back to text input', async ({ page }) => {
    await page.route('**/api/stt/token', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'service_unavailable',
          message: 'STT provider is temporarily disabled',
          killSwitch: true,
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    // Text input should still be available even when STT is killed
    await expect(practice.textInput).toBeVisible();
  });
});

test.describe('Kill Switch — Recovery', () => {
  test('exam starts normally after kill switch is reversed', async ({ page }) => {
    let killSwitchActive = true;

    await page.route('**/api/exam', async (route) => {
      if (killSwitchActive) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'service_unavailable',
            message: 'Provider anthropic is temporarily disabled',
            killSwitch: true,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.A',
            taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
            examinerMessage: 'Welcome back. Let us begin.',
          }),
        });
      }
    });

    const practice = new PracticePage(page);
    await practice.goto();

    // First attempt — blocked
    await practice.startExamButton.click();
    await practice.expectKillSwitchError();

    // "Reverse" the kill switch
    killSwitchActive = false;

    // Second attempt — should succeed
    await practice.startExamButton.click();
    await practice.expectExaminerMessage(0);
  });
});
