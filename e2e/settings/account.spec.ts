import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * Settings page — account info and subscription tests.
 *
 * Covers:
 * - Account email display
 * - Auth method display
 * - Subscription status display (active, trialing, canceled, past_due)
 * - Current plan display
 * - Manage subscription button (Stripe portal)
 * - Upgrade button for free tier users
 */

test.describe('Settings — Account Info', () => {
  test('displays user email', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          user_id: 'test-user',
          account_status: 'active',
          auth_method: 'google',
          tier: 'dpe_live',
          subscription_status: 'active',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.emailDisplay).toBeVisible();
  });

  test('displays auth method', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          auth_method: 'google',
          account_status: 'active',
          tier: 'dpe_live',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.authMethodDisplay).toContainText(/google/i);
  });
});

test.describe('Settings — Subscription Status', () => {
  test('active subscription shows plan details', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'dpe_live',
          subscription_status: 'active',
          stripe_customer_id: 'cus_test',
          current_period_end: '2026-03-16T00:00:00Z',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.expectCurrentPlan(/dpe.*live|premium/i);
    await expect(settings.manageSubscriptionButton).toBeVisible();
  });

  test('trial subscription shows trial badge', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'dpe_live',
          subscription_status: 'trialing',
          trial_end: '2026-02-23T00:00:00Z',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(page.getByText(/trial|free trial/i)).toBeVisible();
  });

  test('free tier shows upgrade button', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'ground_school',
          subscription_status: 'none',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.upgradeButton).toBeVisible();
  });

  test('upgrade button links to pricing page', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'ground_school',
          subscription_status: 'none',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickUpgrade();
    await page.waitForURL('**/pricing', { timeout: 10_000 });
  });

  test('past_due status shows payment warning', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'dpe_live',
          subscription_status: 'past_due',
          latest_invoice_status: 'failed',
          stripe_customer_id: 'cus_test',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(page.getByText(/past due|payment failed|update.*payment/i)).toBeVisible();
  });

  test('canceled subscription shows end date', async ({ page }) => {
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          tier: 'dpe_live',
          subscription_status: 'active',
          cancel_at_period_end: true,
          current_period_end: '2026-03-16T00:00:00Z',
        }]),
      });
    });

    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(page.getByText(/cancel|ending|march/i)).toBeVisible();
  });
});
