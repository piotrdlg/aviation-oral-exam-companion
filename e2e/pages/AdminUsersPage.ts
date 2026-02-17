import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the admin users page (/admin/users).
 *
 * Covers:
 * - User list with search and filter
 * - User detail page (tabs: Overview, Sessions, Scores, Usage, Notes)
 * - User actions (ban, suspend, activate, change tier, add note)
 */
export class AdminUsersPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // User list
  readonly searchInput: Locator;
  readonly tierFilter: Locator;
  readonly statusFilter: Locator;
  readonly sortSelect: Locator;
  readonly userTable: Locator;
  readonly userRows: Locator;
  readonly paginationNext: Locator;
  readonly paginationPrev: Locator;
  readonly totalUsersCount: Locator;

  // User detail
  readonly userDetailPanel: Locator;
  readonly userEmail: Locator;
  readonly userTier: Locator;
  readonly userStatus: Locator;
  readonly userAuthMethod: Locator;
  readonly userLastLogin: Locator;

  // Detail tabs
  readonly overviewTab: Locator;
  readonly sessionsTab: Locator;
  readonly scoresTab: Locator;
  readonly usageTab: Locator;
  readonly notesTab: Locator;

  // Actions
  readonly banButton: Locator;
  readonly suspendButton: Locator;
  readonly activateButton: Locator;
  readonly changeTierButton: Locator;
  readonly addNoteButton: Locator;
  readonly actionReasonInput: Locator;
  readonly actionConfirmButton: Locator;
  readonly actionModal: Locator;

  // Notes
  readonly noteInput: Locator;
  readonly noteSubmitButton: Locator;
  readonly notesList: Locator;

  // Transcript viewer
  readonly viewTranscriptButton: Locator;
  readonly transcriptViewer: Locator;
  readonly transcriptMessages: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('admin-users-page');

    // List
    this.searchInput = page.getByTestId('user-search-input');
    this.tierFilter = page.getByTestId('user-tier-filter');
    this.statusFilter = page.getByTestId('user-status-filter');
    this.sortSelect = page.getByTestId('user-sort-select');
    this.userTable = page.getByTestId('user-table');
    this.userRows = page.locator('[data-testid="user-row"]');
    this.paginationNext = page.getByTestId('pagination-next');
    this.paginationPrev = page.getByTestId('pagination-prev');
    this.totalUsersCount = page.getByTestId('total-users-count');

    // Detail
    this.userDetailPanel = page.getByTestId('user-detail-panel');
    this.userEmail = page.getByTestId('user-detail-email');
    this.userTier = page.getByTestId('user-detail-tier');
    this.userStatus = page.getByTestId('user-detail-status');
    this.userAuthMethod = page.getByTestId('user-detail-auth-method');
    this.userLastLogin = page.getByTestId('user-detail-last-login');

    // Tabs
    this.overviewTab = page.getByTestId('tab-overview');
    this.sessionsTab = page.getByTestId('tab-sessions');
    this.scoresTab = page.getByTestId('tab-scores');
    this.usageTab = page.getByTestId('tab-usage');
    this.notesTab = page.getByTestId('tab-notes');

    // Actions
    this.banButton = page.getByTestId('action-ban');
    this.suspendButton = page.getByTestId('action-suspend');
    this.activateButton = page.getByTestId('action-activate');
    this.changeTierButton = page.getByTestId('action-change-tier');
    this.addNoteButton = page.getByTestId('action-add-note');
    this.actionReasonInput = page.getByTestId('action-reason');
    this.actionConfirmButton = page.getByTestId('action-confirm');
    this.actionModal = page.getByTestId('action-modal');

    // Notes
    this.noteInput = page.getByTestId('note-input');
    this.noteSubmitButton = page.getByTestId('note-submit');
    this.notesList = page.locator('[data-testid="admin-note"]');

    // Transcript
    this.viewTranscriptButton = page.getByTestId('view-transcript');
    this.transcriptViewer = page.getByTestId('transcript-viewer');
    this.transcriptMessages = page.locator('[data-testid="transcript-message"]');
  }

  async goto() {
    await this.page.goto('/admin/users');
  }

  async gotoUserDetail(userId: string) {
    await this.page.goto(`/admin/users/${userId}`);
  }

  async searchUsers(query: string) {
    await this.searchInput.fill(query);
    // Debounce wait
    await this.page.waitForTimeout(500);
  }

  async filterByTier(tier: string) {
    await this.tierFilter.selectOption(tier);
  }

  async filterByStatus(status: string) {
    await this.statusFilter.selectOption(status);
  }

  async clickUser(index: number) {
    await this.userRows.nth(index).click();
  }

  async banUser(reason: string) {
    await this.banButton.click();
    await expect(this.actionModal).toBeVisible();
    await this.actionReasonInput.fill(reason);
    await this.actionConfirmButton.click();
  }

  async suspendUser(reason: string) {
    await this.suspendButton.click();
    await expect(this.actionModal).toBeVisible();
    await this.actionReasonInput.fill(reason);
    await this.actionConfirmButton.click();
  }

  async activateUser() {
    await this.activateButton.click();
    await this.actionConfirmButton.click();
  }

  async addNote(note: string) {
    await this.notesTab.click();
    await this.noteInput.fill(note);
    await this.noteSubmitButton.click();
  }

  async expectUserStatus(status: string) {
    await expect(this.userStatus).toContainText(status);
  }

  async expectUserCount(count: number) {
    await expect(this.userRows).toHaveCount(count);
  }
}
