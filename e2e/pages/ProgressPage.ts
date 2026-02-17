import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the progress page (/progress).
 *
 * Covers:
 * - Rating filter (PPL, CPL, IR)
 * - Session history list
 * - ACS coverage treemap
 * - Weak areas and study recommendations
 * - Coverage statistics
 */
export class ProgressPage {
  readonly page: Page;
  readonly pageContainer: Locator;
  readonly ratingFilter: Locator;
  readonly sessionList: Locator;
  readonly sessionCards: Locator;
  readonly coverageTreemap: Locator;
  readonly coverageStats: Locator;
  readonly weakAreas: Locator;
  readonly studyRecommendations: Locator;
  readonly emptyState: Locator;
  readonly loadingState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('progress-page');
    this.ratingFilter = page.getByTestId('rating-filter');
    this.sessionList = page.getByTestId('session-list');
    this.sessionCards = page.locator('[data-testid="session-card"]');
    this.coverageTreemap = page.getByTestId('coverage-treemap');
    this.coverageStats = page.getByTestId('coverage-stats');
    this.weakAreas = page.getByTestId('weak-areas');
    this.studyRecommendations = page.getByTestId('study-recommendations');
    this.emptyState = page.getByTestId('progress-empty');
    this.loadingState = page.getByTestId('progress-loading');
  }

  async goto() {
    await this.page.goto('/progress');
  }

  async filterByRating(rating: 'private' | 'commercial' | 'instrument') {
    await this.ratingFilter.selectOption(rating);
  }

  async expectSessionCount(count: number) {
    await expect(this.sessionCards).toHaveCount(count);
  }

  async expectSessionCard(index: number, opts: { rating?: string; status?: string }) {
    const card = this.sessionCards.nth(index);
    if (opts.rating) {
      await expect(card).toContainText(opts.rating);
    }
    if (opts.status) {
      await expect(card).toContainText(opts.status);
    }
  }

  async expectCoverageStatsVisible() {
    await expect(this.coverageStats).toBeVisible();
  }

  async expectTreemapVisible() {
    await expect(this.coverageTreemap).toBeVisible();
  }

  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }
}
