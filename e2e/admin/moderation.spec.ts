import { test, expect } from '@playwright/test';

/**
 * Admin moderation queue tests.
 *
 * Covers:
 * - Moderation queue list with status filters (open, reviewing, resolved, dismissed)
 * - Report detail view with transcript context
 * - Resolve a report with admin notes
 * - Dismiss a report with reason
 * - Different report types (inaccurate_answer, safety_incident, bug_report, content_error)
 */

const mockModerationItems = [
  {
    id: 'mod-1',
    report_type: 'inaccurate_answer',
    reporter_user_id: 'user-1',
    reporter_email: 'pilot@example.com',
    session_id: 'sess-1',
    transcript_id: 'trans-1',
    details: { user_comment: 'The answer about VOR navigation was incorrect', error_type: 'factual' },
    status: 'open',
    created_at: '2026-02-16T10:00:00Z',
  },
  {
    id: 'mod-2',
    report_type: 'safety_incident',
    reporter_user_id: null,
    session_id: 'sess-2',
    details: { trigger_text: 'Unsafe advice detected', safety_rule_matched: 'medical_advice' },
    status: 'open',
    created_at: '2026-02-16T09:00:00Z',
  },
  {
    id: 'mod-3',
    report_type: 'bug_report',
    reporter_user_id: 'user-2',
    reporter_email: 'student@example.com',
    details: { description: 'Voice recording stops after 30 seconds', browser: 'Firefox 125' },
    status: 'resolved',
    resolution_notes: 'Known issue with Firefox MediaRecorder',
    resolved_at: '2026-02-15T12:00:00Z',
    created_at: '2026-02-14T10:00:00Z',
  },
];

test.describe('Admin Moderation — Queue List', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/moderation*', async (route) => {
      const url = new URL(route.request().url());
      const statusFilter = url.searchParams.get('status');
      const filtered = statusFilter
        ? mockModerationItems.filter((m) => m.status === statusFilter)
        : mockModerationItems;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: filtered, total: filtered.length }),
      });
    });
  });

  test('displays moderation queue with all items', async ({ page }) => {
    await page.goto('/admin/moderation');
    await expect(page.getByTestId('moderation-queue')).toBeVisible();
    await expect(page.locator('[data-testid="moderation-item"]')).toHaveCount(3);
  });

  test('filters by status — open only', async ({ page }) => {
    await page.goto('/admin/moderation');
    await page.getByTestId('moderation-status-filter').selectOption('open');
    await expect(page.locator('[data-testid="moderation-item"]')).toHaveCount(2);
  });

  test('filters by status — resolved only', async ({ page }) => {
    await page.goto('/admin/moderation');
    await page.getByTestId('moderation-status-filter').selectOption('resolved');
    await expect(page.locator('[data-testid="moderation-item"]')).toHaveCount(1);
  });

  test('displays report type badges', async ({ page }) => {
    await page.goto('/admin/moderation');
    await expect(page.getByText('inaccurate_answer')).toBeVisible();
    await expect(page.getByText('safety_incident')).toBeVisible();
    await expect(page.getByText('bug_report')).toBeVisible();
  });

  test('displays reporter email when available', async ({ page }) => {
    await page.goto('/admin/moderation');
    await expect(page.getByText('pilot@example.com')).toBeVisible();
  });

  test('system-generated reports show no reporter', async ({ page }) => {
    await page.goto('/admin/moderation');
    // Safety incident has null reporter — should show "System" or similar
    const safetyItem = page.locator('[data-testid="moderation-item"]').nth(1);
    await expect(safetyItem).toContainText(/system/i);
  });
});

test.describe('Admin Moderation — Resolve & Dismiss', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/moderation', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: mockModerationItems, total: 3 }),
      });
    });
  });

  test('resolve a moderation item with admin notes', async ({ page }) => {
    await page.route('**/api/admin/moderation/mod-1', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      expect(body.status).toBe('resolved');
      expect(body.resolution_notes).toBeTruthy();
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await page.goto('/admin/moderation');
    // Click on the first moderation item to open detail
    await page.locator('[data-testid="moderation-item"]').first().click();

    // Fill resolution notes and resolve
    await page.getByTestId('resolution-notes').fill('VOR answer was actually correct per AIM 1-1-3');
    await page.getByTestId('resolve-button').click();
    await expect(page.getByText(/resolved/i)).toBeVisible();
  });

  test('dismiss a moderation item with reason', async ({ page }) => {
    await page.route('**/api/admin/moderation/mod-1', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      expect(body.status).toBe('dismissed');
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await page.goto('/admin/moderation');
    await page.locator('[data-testid="moderation-item"]').first().click();

    await page.getByTestId('resolution-notes').fill('Report does not contain actionable information');
    await page.getByTestId('dismiss-button').click();
    await expect(page.getByText(/dismissed/i)).toBeVisible();
  });

  test('moderation detail shows transcript context', async ({ page }) => {
    await page.route('**/api/admin/sessions/sess-1/transcript*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transcript: [
            { role: 'examiner', text: 'Explain how a VOR works.', exchange_number: 1 },
            { role: 'student', text: 'A VOR sends out...', exchange_number: 1 },
          ],
        }),
      });
    });

    await page.goto('/admin/moderation');
    await page.locator('[data-testid="moderation-item"]').first().click();

    // Transcript context should be loaded
    await expect(page.getByTestId('transcript-context')).toBeVisible({ timeout: 10_000 });
  });
});
