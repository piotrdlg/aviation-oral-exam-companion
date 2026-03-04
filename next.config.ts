import type { NextConfig } from "next";

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
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://us.i.posthog.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://pvuiwwqsumoqjepukjhz.supabase.co; font-src 'self' data:; connect-src 'self' https://pvuiwwqsumoqjepukjhz.supabase.co https://api.stripe.com https://us.i.posthog.com https://www.google-analytics.com https://api.cartesia.ai https://api.deepgram.com https://api.openai.com; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'" },
      ],
    },
  ],
};

export default nextConfig;
