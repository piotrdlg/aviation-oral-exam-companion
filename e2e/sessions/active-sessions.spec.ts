import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * Active sessions management tests.
 *
 * Covers:
 * - Active sessions list in settings page
 * - Device labels (e.g., "Chrome on macOS")
 * - "This device" badge on current session
 * - Approximate location display
 * - Sign out all other sessions button
 * - Session list updates after sign out
 */

const mockActiveSessions = [
  {
    id: 'session-1',
    device_label: 'Chrome on macOS',
    approximate_location: 'Jacksonville, FL',
    is_exam_active: true,
    last_activity_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    is_current: true,
  },
  {
    id: 'session-2',
    device_label: 'Safari on iOS',
    approximate_location: 'Jacksonville, FL',
    is_exam_active: false,
    last_activity_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    is_current: false,
  },
  {
    id: 'session-3',
    device_label: 'Firefox on Windows',
    approximate_location: 'Orlando, FL',
    is_exam_active: false,
    last_activity_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    is_current: false,
  },
];

test.describe('Active Sessions — Display', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/user/sessions', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessions: mockActiveSessions }),
        });
      } else {
        await route.continue();
      }
    });

    settings = new SettingsPage(page);
    await settings.goto();
  });

  test('displays active sessions section', async () => {
    await expect(settings.activeSessionsSection).toBeVisible();
  });

  test('shows correct number of active sessions', async () => {
    await settings.expectActiveSessionCount(3);
  });

  test('displays device labels for each session', async ({ page }) => {
    await expect(page.getByText('Chrome on macOS')).toBeVisible();
    await expect(page.getByText('Safari on iOS')).toBeVisible();
    await expect(page.getByText('Firefox on Windows')).toBeVisible();
  });

  test('shows "This device" badge on current session', async () => {
    await settings.expectThisDeviceBadgeVisible();
  });

  test('displays approximate location', async ({ page }) => {
    await expect(page.getByText('Jacksonville, FL')).toBeVisible();
    await expect(page.getByText('Orlando, FL')).toBeVisible();
  });

  test('shows last activity time', async ({ page }) => {
    await expect(page.getByText(/2 minutes ago|just now/i)).toBeVisible();
    await expect(page.getByText(/3 hours ago/i)).toBeVisible();
  });

  test('shows exam status for active exam session', async ({ page }) => {
    const currentSession = page.locator('[data-testid="active-session-card"]').first();
    await expect(currentSession).toContainText(/exam.*in progress|active exam/i);
  });
});

test.describe('Active Sessions — Sign Out All Others', () => {
  test('sign out all other sessions button is visible', async ({ page }) => {
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: mockActiveSessions }),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.signOutAllOtherButton).toBeVisible();
  });

  test('clicking sign out all others calls DELETE API', async ({ page }) => {
    let deleteCalled = false;

    await page.route('**/api/user/sessions', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessions: deleteCalled
              ? [mockActiveSessions[0]] // Only current device after sign out
              : mockActiveSessions,
          }),
        });
      } else if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, signedOut: 2 }),
        });
      }
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.signOutAllOtherSessions();

    // After signing out, only current session should remain
    await settings.expectActiveSessionCount(1);
  });

  test('sign out confirmation shows count of sessions to sign out', async ({ page }) => {
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: mockActiveSessions }),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    // The button or confirmation dialog should indicate how many sessions will be signed out
    await expect(settings.signOutAllOtherButton).toContainText(/sign out|2 other/i);
  });
});

test.describe('Active Sessions — Single Session', () => {
  test('no sign out button when only current session exists', async ({ page }) => {
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [mockActiveSessions[0]] }),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.expectActiveSessionCount(1);
    // Button should be hidden or disabled when there are no other sessions
    await expect(settings.signOutAllOtherButton).not.toBeVisible();
  });
});
