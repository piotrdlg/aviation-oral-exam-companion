/** The session route's existing 403 response shape; shared with contract fixtures. */
export function trialErrorBody(reason: string, extra: Record<string, unknown> = {}) {
  return { error: reason, upgrade_url: '/pricing', ...extra };
}
