import { test, expect } from '@playwright/test';
import { ProgressPage } from '../pages/ProgressPage';

/**
 * Progress page tests.
 *
 * Covers:
 * - Rating filter (PPL, CPL, IR)
 * - Session history list with details
 * - ACS coverage treemap
 * - Coverage statistics
 * - Weak areas and study recommendations
 * - Empty state when no sessions exist
 */

const mockSessions = [
  {
    id: 'sess-1',
    rating: 'private',
    status: 'completed',
    started_at: '2026-02-16T09:00:00Z',
    ended_at: '2026-02-16T09:30:00Z',
    exchange_count: 15,
    study_mode: 'oral_exam',
    difficulty_preference: 'standard',
    acs_tasks_covered: [
      { task_id: 'PA.I.A', status: 'satisfactory', attempts: 1 },
      { task_id: 'PA.I.B', status: 'satisfactory', attempts: 1 },
      { task_id: 'PA.II.A', status: 'partial', attempts: 2 },
    ],
  },
  {
    id: 'sess-2',
    rating: 'private',
    status: 'completed',
    started_at: '2026-02-15T10:00:00Z',
    ended_at: '2026-02-15T10:45:00Z',
    exchange_count: 20,
    study_mode: 'oral_exam',
    difficulty_preference: 'standard',
    acs_tasks_covered: [
      { task_id: 'PA.III.A', status: 'satisfactory', attempts: 1 },
      { task_id: 'PA.VI.A', status: 'unsatisfactory', attempts: 1 },
    ],
  },
  {
    id: 'sess-3',
    rating: 'commercial',
    status: 'completed',
    started_at: '2026-02-14T08:00:00Z',
    ended_at: '2026-02-14T08:25:00Z',
    exchange_count: 12,
    study_mode: 'oral_exam',
    difficulty_preference: 'standard',
    acs_tasks_covered: [
      { task_id: 'CA.I.A', status: 'satisfactory', attempts: 1 },
    ],
  },
];

test.describe('Progress Page — Session List', () => {
  let progressPage: ProgressPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/session*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: mockSessions }),
      });
    });

    progressPage = new ProgressPage(page);
    await progressPage.goto();
  });

  test('displays session history', async () => {
    await expect(progressPage.sessionList).toBeVisible();
  });

  test('shows correct number of sessions', async () => {
    await progressPage.expectSessionCount(3);
  });

  test('session cards show rating and status', async () => {
    await progressPage.expectSessionCard(0, { rating: 'private', status: 'completed' });
  });

  test('session cards show exchange count', async ({ page }) => {
    const firstCard = page.locator('[data-testid="session-card"]').first();
    await expect(firstCard).toContainText('15');
  });
});

test.describe('Progress Page — Rating Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/session*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: mockSessions }),
      });
    });
  });

  test('filter by Private Pilot shows only PPL sessions', async ({ page }) => {
    const progressPage = new ProgressPage(page);
    await progressPage.goto();
    await progressPage.filterByRating('private');
    // Client-side filtering should show only private sessions
    const visibleCards = page.locator('[data-testid="session-card"]:visible');
    const count = await visibleCards.count();
    expect(count).toBe(2); // sess-1 and sess-2
  });

  test('filter by Commercial Pilot shows only CPL sessions', async ({ page }) => {
    const progressPage = new ProgressPage(page);
    await progressPage.goto();
    await progressPage.filterByRating('commercial');
    const visibleCards = page.locator('[data-testid="session-card"]:visible');
    const count = await visibleCards.count();
    expect(count).toBe(1); // sess-3
  });
});

test.describe('Progress Page — Coverage Stats', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/session*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: mockSessions }),
      });
    });
  });

  test('displays coverage statistics', async ({ page }) => {
    const progressPage = new ProgressPage(page);
    await progressPage.goto();
    await progressPage.expectCoverageStatsVisible();
  });

  test('displays ACS coverage treemap', async ({ page }) => {
    const progressPage = new ProgressPage(page);
    await progressPage.goto();
    await progressPage.expectTreemapVisible();
  });
});

test.describe('Progress Page — Empty State', () => {
  test('shows empty state when no sessions exist', async ({ page }) => {
    await page.route('**/api/session*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
    });

    const progressPage = new ProgressPage(page);
    await progressPage.goto();
    await progressPage.expectEmptyState();
  });
});
