import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Use your Stripe account's default API version.
  // To pin: set STRIPE_API_VERSION env var to a valid date from https://docs.stripe.com/upgrades
  ...(process.env.STRIPE_API_VERSION ? { apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion } : {}),
  typescript: true,
});

export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  annual: process.env.STRIPE_PRICE_ANNUAL!,
};
