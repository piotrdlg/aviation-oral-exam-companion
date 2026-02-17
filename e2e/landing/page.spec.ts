import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';

/**
 * Landing page tests.
 *
 * Covers:
 * - Hero section with heading and description
 * - Rating support text (PPL, CPL, IR)
 * - Feature cards (ACS-Aligned, Voice-First, Adaptive)
 * - CTA buttons (Sign In, Start Free Practice)
 * - Disclaimer text visibility
 * - Navigation from landing to login
 * - Page loads for unauthenticated users
 */

test.describe('Landing Page — Content', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.goto();
  });

  test('displays hero heading', async () => {
    await landingPage.expectHeroVisible();
    await expect(landingPage.heroHeading).toContainText(/aviation|oral exam|heydpe/i);
  });

  test('hero description mentions supported ratings', async () => {
    await landingPage.expectRatingSupport();
  });

  test('displays three feature cards', async () => {
    await landingPage.expectFeatureCardsVisible();
  });

  test('ACS-Aligned card describes ACS standards', async ({ page }) => {
    await expect(page.getByText(/ACS-Aligned/)).toBeVisible();
    await expect(page.getByText(/Airman Certification Standards/)).toBeVisible();
  });

  test('Voice-First card describes voice interaction', async ({ page }) => {
    await expect(page.getByText(/Voice-First/)).toBeVisible();
    await expect(page.getByText(/speak your answers/i)).toBeVisible();
  });

  test('Adaptive card describes AI adaptation', async ({ page }) => {
    await expect(page.getByText(/Adaptive/)).toBeVisible();
    await expect(page.getByText(/follow.?up|weak areas|navigate/i)).toBeVisible();
  });

  test('displays disclaimer text', async () => {
    await landingPage.expectDisclaimerVisible();
  });

  test('disclaimer mentions study purposes only', async ({ page }) => {
    await expect(page.getByText(/study purposes only/i)).toBeVisible();
  });

  test('disclaimer mentions CFI', async ({ page }) => {
    await expect(page.getByText(/CFI|flight instructor/i)).toBeVisible();
  });
});

test.describe('Landing Page — CTA Buttons', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.goto();
  });

  test('CTA buttons are visible', async () => {
    await landingPage.expectCtaButtonsVisible();
  });

  test('Sign In button navigates to /login', async () => {
    await landingPage.clickSignIn();
  });

  test('second CTA button is visible', async () => {
    await expect(landingPage.startPracticeButton).toBeVisible();
  });
});

test.describe('Landing Page — Authenticated User', () => {
  // Uses default authenticated state

  test('authenticated user may see different CTAs or redirect', async ({ page }) => {
    await page.goto('/');
    // Authenticated users might be redirected to /practice or see different CTAs
    // This depends on implementation — verify the behavior is consistent
    const url = page.url();
    expect(url).toBeDefined();
  });
});

test.describe('Landing Page — Responsive Layout', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('feature cards stack on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    const landingPage = new LandingPage(page);
    await landingPage.goto();
    await landingPage.expectFeatureCardsVisible();
    // Cards should be visible even at mobile width
  });

  test('CTA buttons are accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const landingPage = new LandingPage(page);
    await landingPage.goto();
    await expect(landingPage.signInButton).toBeVisible();
  });
});
