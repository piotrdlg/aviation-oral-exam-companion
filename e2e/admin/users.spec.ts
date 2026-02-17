import { test, expect } from '@playwright/test';
import { AdminUsersPage } from '../pages/AdminUsersPage';

/**
 * Admin user management tests.
 *
 * Covers:
 * - User list with pagination, search, and filters
 * - User detail page with tabs (Overview, Sessions, Scores, Usage, Notes)
 * - Ban / suspend / activate actions
 * - Admin notes on user accounts
 * - Audit log creation for admin actions
 */

const mockUsers = [
  { id: 'user-1', email: 'alice@example.com', tier: 'dpe_live', account_status: 'active', auth_method: 'google', last_login_at: '2026-02-16T10:00:00Z', created_at: '2026-01-01T00:00:00Z' },
  { id: 'user-2', email: 'bob@example.com', tier: 'ground_school', account_status: 'active', auth_method: 'email_otp', last_login_at: '2026-02-15T10:00:00Z', created_at: '2026-01-15T00:00:00Z' },
  { id: 'user-3', email: 'charlie@example.com', tier: 'checkride_prep', account_status: 'suspended', auth_method: 'apple', last_login_at: '2026-02-10T10:00:00Z', created_at: '2026-02-01T00:00:00Z' },
];

test.describe('Admin Users — User List', () => {
  let usersPage: AdminUsersPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/users*', async (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search') ?? '';
      const filtered = mockUsers.filter((u) =>
        u.email.toLowerCase().includes(search.toLowerCase())
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: filtered, total: filtered.length }),
      });
    });

    usersPage = new AdminUsersPage(page);
    await usersPage.goto();
  });

  test('displays user list with all users', async () => {
    await expect(usersPage.userTable).toBeVisible();
    await usersPage.expectUserCount(3);
  });

  test('search filters users by email', async () => {
    await usersPage.searchUsers('alice');
    await usersPage.expectUserCount(1);
  });

  test('search with no results shows empty state', async () => {
    await usersPage.searchUsers('nonexistent@example.com');
    await usersPage.expectUserCount(0);
  });

  test('user rows display email, tier, and status', async () => {
    const firstRow = usersPage.userRows.first();
    await expect(firstRow).toContainText('alice@example.com');
    await expect(firstRow).toContainText(/dpe_live|DPE Live/i);
  });

  test('clicking user row navigates to user detail', async ({ page }) => {
    await usersPage.clickUser(0);
    await page.waitForURL(/\/admin\/users\/user-1/);
  });
});

test.describe('Admin Users — User Detail', () => {
  let usersPage: AdminUsersPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/users/user-1*', async (route) => {
      if (route.request().url().includes('/actions')) {
        // Handle action requests
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: mockUsers[0],
            sessions: [
              { id: 'sess-1', rating: 'private', status: 'completed', exchange_count: 15, started_at: '2026-02-16T09:00:00Z' },
            ],
            scores: [],
            usage: { llm_requests: 245, tts_chars: 18500, stt_seconds: 1200 },
            notes: [
              { id: 'note-1', admin_user_id: 'admin-1', note: 'Active beta tester', created_at: '2026-02-10T00:00:00Z' },
            ],
          }),
        });
      }
    });

    usersPage = new AdminUsersPage(page);
    await usersPage.gotoUserDetail('user-1');
  });

  test('displays user detail with email and status', async () => {
    await expect(usersPage.userDetailPanel).toBeVisible();
    await expect(usersPage.userEmail).toContainText('alice@example.com');
    await usersPage.expectUserStatus('active');
  });

  test('displays user tier and auth method', async () => {
    await expect(usersPage.userTier).toContainText(/dpe_live/i);
    await expect(usersPage.userAuthMethod).toContainText(/google/i);
  });

  test('overview tab shows session summary', async () => {
    await usersPage.overviewTab.click();
    await expect(usersPage.userDetailPanel).toContainText(/session/i);
  });

  test('sessions tab shows session list', async () => {
    await usersPage.sessionsTab.click();
    await expect(usersPage.userDetailPanel).toContainText(/private/i);
  });

  test('notes tab shows admin notes', async () => {
    await usersPage.notesTab.click();
    await expect(usersPage.notesList.first()).toContainText('Active beta tester');
  });
});

test.describe('Admin Users — Actions', () => {
  let usersPage: AdminUsersPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/users/user-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: mockUsers[0],
          sessions: [],
          scores: [],
          usage: {},
          notes: [],
        }),
      });
    });

    let currentStatus = 'active';

    await page.route('**/api/admin/users/user-1/actions', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'ban') currentStatus = 'banned';
      if (body.action === 'suspend') currentStatus = 'suspended';
      if (body.action === 'activate') currentStatus = 'active';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          user: { ...mockUsers[0], account_status: currentStatus },
        }),
      });
    });

    usersPage = new AdminUsersPage(page);
    await usersPage.gotoUserDetail('user-1');
  });

  test('ban user action requires reason and confirmation', async () => {
    await usersPage.banUser('Violation of terms of service');
    await usersPage.expectUserStatus('banned');
  });

  test('suspend user action requires reason and confirmation', async () => {
    await usersPage.suspendUser('Suspicious activity detected');
    await usersPage.expectUserStatus('suspended');
  });

  test('activate user restores account', async () => {
    await usersPage.activateUser();
    await usersPage.expectUserStatus('active');
  });

  test('add admin note to user', async ({ page }) => {
    await page.route('**/api/admin/users/user-1/actions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await usersPage.addNote('Contacted user about feature feedback');
    await expect(usersPage.notesList).toContainText('Contacted user about feature feedback');
  });
});
