import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Derive Supabase origin from env var so CSP stays in sync with any custom domain.
// Trim whitespace/newlines to guard against env-var formatting issues.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseOrigin = (() => {
  try { return supabaseUrl ? new URL(supabaseUrl).origin : ''; }
  catch { return ''; }
})() || 'https://pvuiwwqsumoqjepukjhz.supabase.co';

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://us.i.posthog.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${supabaseOrigin}; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self' ${supabaseOrigin} https://api.stripe.com https://us.i.posthog.com https://www.google-analytics.com https://api.deepgram.com wss://api.deepgram.com https://api.openai.com https://*.ingest.us.sentry.io; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'; report-uri /api/csp-report` },
      ],
    },
  ],
};

// Sentry build-time wrapper: uploads source maps so production stack traces are
// readable (the runtime SDK is already wired via instrumentation*.ts / W6.1).
// org/project/authToken are env-driven — when SENTRY_AUTH_TOKEN is absent (CI,
// local, or before the owner sets it), the plugin SKIPS upload and the build
// proceeds normally. So this is a safe no-op until the token is configured.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet unless explicitly debugging the upload.
  silent: !process.env.CI,
  // Upload a wider set of client bundles for better stack traces.
  widenClientFileUpload: true,
  // Tree-shake the Sentry logger from client bundles.
  disableLogger: true,
  // No Sentry telemetry about our build.
  telemetry: false,
});
