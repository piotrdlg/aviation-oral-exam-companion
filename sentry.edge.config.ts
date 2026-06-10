import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV || 'development',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
