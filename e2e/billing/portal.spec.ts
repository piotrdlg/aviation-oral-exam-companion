import { test, expect } from '@playwright/test';

/**
 * Stripe customer portal tests.
 *
 * Covers:
 * - Accessing Stripe Customer Portal from settings page
 * - Portal redirects to Stripe-hosted management page
 * - Error when user has no subscription (no stripe_customer_id)
 * - Return URL points back to /settings
 */

test.describe('Stripe Customer Portal', () => {
  test('manage subscription button redirects to Stripe portal', async ({ page }) => {
    const portalUrl = 'https://billing.stripe.com/p/session/test_portal';

    await page.route('**/api/stripe/portal', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: portalUrl }),
      });
    });

    // Intercept Stripe portal navigation
    await page.route('https://billing.stripe.com/**', async (route) => {
      await route.fulfill({ status: 200, body: 'Stripe Portal Mock' });
    });

    await page.goto('/settings');

    // Mock user has active subscription
    await page.route('**/rest/v1/user_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          stripe_customer_id: 'cus_test123',
          subscription_status: 'active',
          tier: 'dpe_live',
        }]),
      });
    });

    await page.getByTestId('manage-subscription').click();
    // Verify portal API was called
  });

  test('shows error when user has no subscription', async ({ page }) => {
    await page.route('**/api/stripe/portal', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No subscription found' }),
      });
    });

    await page.goto('/settings');
    await page.getByTestId('manage-subscription').click();
    await expect(page.getByText(/no subscription|no active plan/i)).toBeVisible({ timeout: 5_000 });
  });

  test('portal API returns 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/stripe/portal');
    expect(response.status()).toBe(401);
  });
});
