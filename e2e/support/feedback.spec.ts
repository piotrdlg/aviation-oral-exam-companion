import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * Feedback widget tests.
 *
 * Covers:
 * - Feedback section visible in settings
 * - Bug report form with browser info capture
 * - Content accuracy error form
 * - Form validation (description required)
 * - Successful submission to /api/report
 * - Success feedback after submission
 */

test.describe('Feedback Widget — Bug Report', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/report', async (route) => {
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    settings = new SettingsPage(page);
    await settings.goto();
  });

  test('feedback section is visible in settings', async () => {
    await expect(settings.feedbackSection).toBeVisible();
  });

  test('bug report and content error buttons are visible', async () => {
    await expect(settings.bugReportButton).toBeVisible();
    await expect(settings.contentErrorButton).toBeVisible();
  });

  test('bug report form opens when button clicked', async () => {
    await settings.bugReportButton.click();
    await expect(settings.feedbackForm).toBeVisible();
    await expect(settings.feedbackDescription).toBeVisible();
  });

  test('submitting bug report sends to API', async ({ page }) => {
    let reportPayload: Record<string, unknown> = {};

    await page.route('**/api/report', async (route) => {
      reportPayload = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await settings.submitBugReport('Voice recording stops after 30 seconds on Firefox');

    expect(reportPayload).toHaveProperty('report_type', 'bug_report');
    expect((reportPayload.details as Record<string, unknown>)?.description).toContain(
      'Voice recording stops'
    );
  });

  test('bug report captures browser info', async ({ page }) => {
    let reportPayload: Record<string, unknown> = {};

    await page.route('**/api/report', async (route) => {
      reportPayload = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await settings.submitBugReport('Test bug report');

    const details = reportPayload.details as Record<string, unknown>;
    expect(details).toHaveProperty('browser');
  });

  test('shows success message after bug report submission', async () => {
    await settings.submitBugReport('Test bug report');
    await settings.expectFeedbackSuccess();
  });
});

test.describe('Feedback Widget — Content Error', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/report', async (route) => {
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    settings = new SettingsPage(page);
    await settings.goto();
  });

  test('content error form opens when button clicked', async () => {
    await settings.contentErrorButton.click();
    await expect(settings.feedbackForm).toBeVisible();
  });

  test('submitting content error sends correct report type', async ({ page }) => {
    let reportPayload: Record<string, unknown> = {};

    await page.route('**/api/report', async (route) => {
      reportPayload = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await settings.submitContentError('VOR explanation references outdated AIM section');

    expect(reportPayload).toHaveProperty('report_type', 'content_error');
  });

  test('shows success message after content error submission', async () => {
    await settings.submitContentError('Test content error');
    await settings.expectFeedbackSuccess();
  });
});

test.describe('Feedback Widget — Validation', () => {
  test('cannot submit feedback without description', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.bugReportButton.click();
    await expect(settings.feedbackForm).toBeVisible();

    // Try to submit without filling description
    await settings.feedbackSubmitButton.click();
    // Should show validation error
    await expect(page.getByText(/description.*required|please.*provide/i)).toBeVisible();
  });
});
