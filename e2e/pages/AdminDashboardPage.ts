import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the admin dashboard (/admin).
 *
 * Covers:
 * - Stats cards (total users, active sessions, avg exchanges, daily cost)
 * - Recent sessions table
 * - Anomaly alerts
 * - Sidebar navigation
 */
export class AdminDashboardPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Sidebar navigation
  readonly sidebarNav: Locator;
  readonly dashboardLink: Locator;
  readonly usersLink: Locator;
  readonly promptsLink: Locator;
  readonly configLink: Locator;
  readonly moderationLink: Locator;
  readonly adminUserBadge: Locator;

  // Stats cards
  readonly totalUsersCard: Locator;
  readonly activeSessionsCard: Locator;
  readonly avgExchangesCard: Locator;
  readonly dailyCostCard: Locator;

  // Recent sessions
  readonly recentSessionsTable: Locator;
  readonly sessionRows: Locator;

  // Anomaly alerts
  readonly anomalyAlerts: Locator;
  readonly anomalyAlertItems: Locator;

  // Loading
  readonly dashboardLoading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('admin-dashboard');

    // Sidebar
    this.sidebarNav = page.getByTestId('admin-sidebar');
    this.dashboardLink = page.getByTestId('admin-nav-dashboard');
    this.usersLink = page.getByTestId('admin-nav-users');
    this.promptsLink = page.getByTestId('admin-nav-prompts');
    this.configLink = page.getByTestId('admin-nav-config');
    this.moderationLink = page.getByTestId('admin-nav-moderation');
    this.adminUserBadge = page.getByTestId('admin-user-badge');

    // Stats
    this.totalUsersCard = page.getByTestId('stat-total-users');
    this.activeSessionsCard = page.getByTestId('stat-active-sessions');
    this.avgExchangesCard = page.getByTestId('stat-avg-exchanges');
    this.dailyCostCard = page.getByTestId('stat-daily-cost');

    // Recent sessions
    this.recentSessionsTable = page.getByTestId('recent-sessions-table');
    this.sessionRows = page.locator('[data-testid="recent-session-row"]');

    // Anomalies
    this.anomalyAlerts = page.getByTestId('anomaly-alerts');
    this.anomalyAlertItems = page.locator('[data-testid="anomaly-alert-item"]');

    // Loading
    this.dashboardLoading = page.getByTestId('admin-dashboard-loading');
  }

  async goto() {
    await this.page.goto('/admin');
  }

  async expectStatsCardsVisible() {
    await expect(this.totalUsersCard).toBeVisible();
    await expect(this.activeSessionsCard).toBeVisible();
    await expect(this.avgExchangesCard).toBeVisible();
    await expect(this.dailyCostCard).toBeVisible();
  }

  async expectRecentSessionsTable() {
    await expect(this.recentSessionsTable).toBeVisible();
  }

  async navigateToUsers() {
    await this.usersLink.click();
    await this.page.waitForURL('**/admin/users');
  }

  async navigateToPrompts() {
    await this.promptsLink.click();
    await this.page.waitForURL('**/admin/prompts');
  }

  async navigateToConfig() {
    await this.configLink.click();
    await this.page.waitForURL('**/admin/config');
  }

  async navigateToModeration() {
    await this.moderationLink.click();
    await this.page.waitForURL('**/admin/moderation');
  }

  async expectAdminBadge(email: string) {
    await expect(this.adminUserBadge).toContainText(email);
  }
}
