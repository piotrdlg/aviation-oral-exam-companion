/**
 * W6.1: client-side Sentry init (Next.js instrumentation-client hook).
 * Env-gated on NEXT_PUBLIC_SENTRY_DSN — absent DSN = no-op, zero overhead.
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
