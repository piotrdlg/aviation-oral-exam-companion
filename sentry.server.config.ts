import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV || 'development',
  tracesSampleRate: 0.1, // 10% traces per W6.1 spec
  // No PII beyond the user id; never send request bodies.
  sendDefaultPii: false,
});
