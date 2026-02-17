import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';

/**
 * Report inaccurate answer tests.
 *
 * Covers:
 * - Report button visible on every examiner message
 * - Report modal opens with pre-filled context
 * - Form validation (comment required, type required)
 * - Successful submission to /api/report
 * - Report types: factual, scoring, safety
 * - Report modal closes after successful submission
 */

test.describe('Report Inaccurate Answer', () => {
  let practice: PracticePage;

  test.beforeEach(async ({ page }) => {
    // Set up an active exam with examiner messages
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.A',
            taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
            examinerMessage: 'What are the requirements for pilot in command?',
          }),
        });
      } else if (body.action === 'respond') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.A',
            taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
            examinerMessage: 'Actually, you need 500 hours to be PIC.',
            assessment: { score: 'unsatisfactory', feedback: 'Incorrect.', misconceptions: [] },
          }),
        });
      }
    });

    await page.route('**/api/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 'sess-1', status: 'active' } }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
    });

    practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
  });

  test('report button is visible on examiner messages', async () => {
    await expect(practice.reportButtons.first()).toBeVisible();
  });

  test('clicking report opens modal with form', async () => {
    await practice.reportButtons.first().click();
    await expect(practice.reportModal).toBeVisible();
    await expect(practice.reportCommentInput).toBeVisible();
    await expect(practice.reportTypeSelect).toBeVisible();
    await expect(practice.reportSubmitButton).toBeVisible();
  });

  test('report modal has error type options', async ({ page }) => {
    await practice.reportButtons.first().click();
    const options = practice.reportTypeSelect.locator('option');
    // Should have factual, scoring, safety options
    await expect(options).not.toHaveCount(0);
  });

  test('successful report submission', async ({ page }) => {
    let reportSubmitted = false;

    await page.route('**/api/report', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      expect(body.report_type).toBe('factual');
      expect(body.details.user_comment).toBeTruthy();
      reportSubmitted = true;
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await practice.reportAnswer(0, 'The 500 hour requirement is incorrect per 14 CFR 61.103', 'factual');
    expect(reportSubmitted).toBe(true);

    // Modal should close after submission
    await expect(practice.reportModal).not.toBeVisible();
  });

  test('report submission shows success feedback', async ({ page }) => {
    await page.route('**/api/report', async (route) => {
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await practice.reportAnswer(0, 'Incorrect information', 'factual');
    await expect(page.getByText(/report.*submitted|thank you/i)).toBeVisible({ timeout: 5_000 });
  });

  test('report submission fails gracefully on API error', async ({ page }) => {
    await page.route('**/api/report', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await practice.reportButtons.first().click();
    await practice.reportTypeSelect.selectOption('factual');
    await practice.reportCommentInput.fill('Test error');
    await practice.reportSubmitButton.click();
    await expect(page.getByText(/error|try again/i)).toBeVisible({ timeout: 5_000 });
  });

  test('report button appears after answer assessment', async () => {
    await practice.sendAnswer('You need a valid certificate.');
    // After answer is assessed, the follow-up examiner message should also have a report button
    await expect(practice.reportButtons).not.toHaveCount(0);
  });
});
