/**
 * W6.1: server-side Sentry capture helper for the silent-data-loss catch
 * blocks. Env-gated and dynamically imported — without SENTRY_DSN this is a
 * cheap no-op, and the SDK never loads into the function bundle's hot path.
 */
export function captureToSentry(err: unknown, context: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        extra: context,
        tags: { route: String(context.route ?? 'unknown'), tier: String(context.tier ?? '') },
      });
    })
    .catch(() => { /* telemetry must never break the request */ });
}
