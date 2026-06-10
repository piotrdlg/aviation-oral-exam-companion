import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Lazy-initialized Stripe client. Throws a clear error only when actually
 * called (not at import time), so a missing key surfaces a readable message
 * instead of the old `null as unknown as Stripe` footgun.
 *
 * W3.4 guard: refuse to run a production deployment against a Stripe TEST key —
 * that would silently process real customers in test mode.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  const isProd =
    process.env.NEXT_PUBLIC_APP_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProd && key.startsWith('sk_test_')) {
    throw new Error('Refusing to initialize Stripe: production environment is configured with a TEST key (sk_test_…).');
  }
  _stripe = new Stripe(key, {
    ...(process.env.STRIPE_API_VERSION ? { apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion } : {}),
    typescript: true,
  });
  return _stripe;
}

export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
  annual: process.env.STRIPE_PRICE_ANNUAL ?? '',
};
