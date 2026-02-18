import { test, expect } from '@playwright/test';
import { TryPage } from '../pages/TryPage';

/**
 * /try landing page tests (ad traffic destination).
 *
 * Covers:
 * - Hero heading visible
 * - Minimal header (logo only, no nav links)
 * - All CTA links point to /signup
 * - Three "How It Works" feature cards
 * - Footer has privacy and terms links
 */

test.describe('/try Landing Page', () => {
  let tryPage: TryPage;

  test.beforeEach(async ({ page }) => {
    tryPage = new TryPage(page);
    await tryPage.goto();
  });

  test('renders hero heading', async () => {
    await tryPage.expectHeadingVisible();
    await expect(tryPage.heading).toContainText(/checkride oral|practice/i);
  });

  test('minimal header: logo visible, no nav links', async () => {
    await tryPage.expectMinimalHeader();
  });

  test('all CTA links point to /signup', async () => {
    await tryPage.expectAllCtasPointToSignup();
  });

  test('three "How It Works" feature cards are visible', async ({ page }) => {
    const cards = page.locator('h3', { hasText: /SPEAK TO AN AI DPE|GET ACS-LEVEL SCORING|TRACK EVERY WEAK SPOT/i });
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i)).toBeVisible();
    }
  });

  test('footer has privacy and terms links', async () => {
    await tryPage.expectFooterLinks();
  });
});
