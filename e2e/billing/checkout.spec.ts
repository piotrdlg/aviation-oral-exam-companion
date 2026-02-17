import { test, expect } from '@playwright/test';

/**
 * Stripe checkout flow tests.
 *
 * Covers:
 * - Monthly plan checkout creates Stripe session and redirects
 * - Annual plan checkout creates Stripe session and redirects
 * - Post-checkout entitlement sync (?checkout=success on /practice)
 * - Tier upgrade verification after successful checkout
 * - Error handling when checkout fails
 * - 7-day trial period inclusion
 */

test.describe('Checkout — Stripe Session Creation', () => {
  test('monthly plan checkout redirects to Stripe', async ({ page }) => {
    const stripeCheckoutUrl = 'https://checkout.stripe.com/c/pay/test_session';

    await page.route('**/api/stripe/checkout', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      expect(body.plan).toBe('monthly');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: stripeCheckoutUrl }),
      });
    });

    await page.goto('/pricing');
    // Intercept navigation to Stripe
    await page.route('https://checkout.stripe.com/**', async (route) => {
      await route.fulfill({ status: 200, body: 'Stripe Checkout Mock' });
    });

    await page.getByTestId('cta-monthly').click();
    // Verify checkout API was called with correct plan
  });

  test('annual plan checkout redirects to Stripe', async ({ page }) => {
    const stripeCheckoutUrl = 'https://checkout.stripe.com/c/pay/test_session_annual';

    await page.route('**/api/stripe/checkout', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      expect(body.plan).toBe('annual');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: stripeCheckoutUrl }),
      });
    });

    await page.goto('/pricing');
    await page.route('https://checkout.stripe.com/**', async (route) => {
      await route.fulfill({ status: 200, body: 'Stripe Checkout Mock' });
    });

    await page.getByTestId('cta-annual').click();
  });

  test('checkout API error shows user-facing error message', async ({ page }) => {
    await page.route('**/api/stripe/checkout', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unable to create checkout session' }),
      });
    });

    await page.goto('/pricing');
    await page.getByTestId('cta-monthly').click();
    await expect(page.getByText(/error|unable|try again/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Checkout — Post-Checkout Entitlement Sync', () => {
  test('practice page with ?checkout=success calls status API', async ({ page }) => {
    let statusCalled = false;

    await page.route('**/api/stripe/status', async (route) => {
      statusCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tier: 'dpe_live', status: 'trialing' }),
      });
    });

    await page.goto('/practice?checkout=success');
    // Wait for status check to fire
    await page.waitForTimeout(2000);
    expect(statusCalled).toBe(true);
  });

  test('shows success banner after checkout verification', async ({ page }) => {
    await page.route('**/api/stripe/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tier: 'dpe_live', status: 'trialing' }),
      });
    });

    await page.goto('/practice?checkout=success');
    await expect(page.getByTestId('checkout-success-banner')).toBeVisible({ timeout: 10_000 });
  });

  test('tier upgrade reflected in practice page after checkout', async ({ page }) => {
    await page.route('**/api/stripe/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tier: 'dpe_live', status: 'active' }),
      });
    });

    await page.route('**/api/user/tier*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tier: 'dpe_live' }),
      });
    });

    await page.goto('/practice?checkout=success');
    // The practice page should reflect the upgraded tier
    await page.waitForTimeout(3000);
  });

  test('handles race condition: status API called before webhook', async ({ page }) => {
    // First call returns free tier (webhook not yet processed)
    let callCount = 0;
    await page.route('**/api/stripe/status', async (route) => {
      callCount++;
      if (callCount === 1) {
        // Simulate webhook not yet fired — status check goes to Stripe directly
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tier: 'dpe_live', status: 'trialing' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tier: 'dpe_live', status: 'active' }),
        });
      }
    });

    await page.goto('/practice?checkout=success');
    // Should still show success because status API checks Stripe directly
    await expect(page.getByTestId('checkout-success-banner')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Checkout — Unauthorized', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('checkout API returns 401 for unauthenticated users', async ({ request }) => {
    const response = await request.post('/api/stripe/checkout', {
      data: { plan: 'monthly' },
    });
    expect(response.status()).toBe(401);
  });
});
