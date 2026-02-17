import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';

/**
 * Admin dashboard tests.
 *
 * Covers:
 * - Stats cards display (total users, active sessions, avg exchanges, daily cost)
 * - Recent sessions table
 * - Anomaly alerts for high-usage users
 * - Sidebar navigation to all admin pages
 * - Admin user badge display
 */

test.describe('Admin Dashboard', () => {
  let dashboard: AdminDashboardPage;

  test.beforeEach(async ({ page }) => {
    // Mock admin API responses
    await page.route('**/api/admin/dashboard*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: { total: 142, dau: 23, wau: 67, mau: 112 },
          sessions: {
            activeNow: 5,
            today: 34,
            thisWeek: 189,
            avgExchanges7d: 12.4,
            avgDurationMin7d: 18.7,
          },
          cost: {
            providers: [
              { provider: 'anthropic', event_type: 'llm_request', request_count: 1240, total_quantity: 15600000, avg_latency: 1200, error_count: 3 },
              { provider: 'deepgram', event_type: 'stt_request', request_count: 890, total_quantity: 26700, avg_latency: 150, error_count: 0 },
              { provider: 'cartesia', event_type: 'tts_request', request_count: 760, total_quantity: 340000, avg_latency: 80, error_count: 1 },
            ],
          },
          anomalies: [
            { id: 'user-123', email: 'heavy@user.com', request_count: 2400 },
          ],
        }),
      });
    });

    dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
  });

  test('displays all four stats cards', async () => {
    await dashboard.expectStatsCardsVisible();
  });

  test('total users card shows correct count', async () => {
    await expect(dashboard.totalUsersCard).toContainText('142');
  });

  test('active sessions card shows current count', async () => {
    await expect(dashboard.activeSessionsCard).toContainText('5');
  });

  test('average exchanges card shows 7-day average', async () => {
    await expect(dashboard.avgExchangesCard).toContainText('12');
  });

  test('displays recent sessions table', async () => {
    await dashboard.expectRecentSessionsTable();
  });

  test('displays anomaly alerts when high-usage users exist', async () => {
    await expect(dashboard.anomalyAlerts).toBeVisible();
    await expect(dashboard.anomalyAlertItems.first()).toContainText('heavy@user.com');
  });

  test('sidebar navigation contains all admin sections', async () => {
    await expect(dashboard.dashboardLink).toBeVisible();
    await expect(dashboard.usersLink).toBeVisible();
    await expect(dashboard.promptsLink).toBeVisible();
    await expect(dashboard.configLink).toBeVisible();
    await expect(dashboard.moderationLink).toBeVisible();
  });

  test('sidebar navigation to users page works', async () => {
    await dashboard.navigateToUsers();
  });

  test('sidebar navigation to prompts page works', async () => {
    await dashboard.navigateToPrompts();
  });

  test('sidebar navigation to config page works', async () => {
    await dashboard.navigateToConfig();
  });

  test('sidebar navigation to moderation page works', async () => {
    await dashboard.navigateToModeration();
  });
});

test.describe('Admin Dashboard — Empty State', () => {
  test('handles empty dashboard data gracefully', async ({ page }) => {
    await page.route('**/api/admin/dashboard*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: { total: 0, dau: 0, wau: 0, mau: 0 },
          sessions: { activeNow: 0, today: 0, thisWeek: 0, avgExchanges7d: 0, avgDurationMin7d: 0 },
          cost: { providers: [] },
          anomalies: [],
        }),
      });
    });

    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
    await dashboard.expectStatsCardsVisible();
    await expect(dashboard.totalUsersCard).toContainText('0');
    // Anomaly section should not show alerts when empty
    await expect(dashboard.anomalyAlertItems).toHaveCount(0);
  });
});
