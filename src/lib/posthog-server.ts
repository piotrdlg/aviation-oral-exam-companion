import 'server-only';
import { PostHog } from 'posthog-node';

let client: PostHog | null = null;

/**
 * Get (or create) the singleton PostHog server-side client.
 * Returns null if NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
export function getPostHogServer(): PostHog | null {
  if (client) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 5,
    flushInterval: 10000,
  });

  return client;
}

/**
 * Capture a server-side event. No-op if PostHog is not configured.
 */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getPostHogServer();
  if (!ph) return;

  ph.capture({
    distinctId,
    event,
    properties,
  });
}

/**
 * Flush buffered events to PostHog. Call this before serverless functions exit
 * to ensure events are delivered (Vercel functions can terminate before the
 * buffer auto-flushes).
 */
export async function flushPostHog(): Promise<void> {
  if (!client) return;
  await client.flush();
}
