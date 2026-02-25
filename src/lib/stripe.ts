import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/** Lazy-initialized Stripe client — only throws when actually called, not at import time. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    ...(process.env.STRIPE_API_VERSION ? { apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion } : {}),
    typescript: true,
  });
  return _stripe;
}

/** @deprecated Use getStripe() instead — kept for backwards compatibility */
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      ...(process.env.STRIPE_API_VERSION ? { apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion } : {}),
      typescript: true,
    })
  : (null as unknown as Stripe);

export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
  annual: process.env.STRIPE_PRICE_ANNUAL ?? '',
};
