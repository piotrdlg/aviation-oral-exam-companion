/**
 * Pure logic for inbound email routing — no external dependencies.
 * Separated from webhook handler for testability.
 *
 * When Resend receives an email to *@heydpe.com, the webhook handler
 * uses these functions to decide what to do: create a support ticket,
 * forward the email, or ignore it.
 */

export type EmailRoute =
  | { action: 'create_ticket'; type: 'support' | 'feedback' }
  | { action: 'forward'; to: string }
  | { action: 'ignore' };

const TICKET_ADDRESSES: Record<string, 'support' | 'feedback'> = {
  'support@heydpe.com': 'support',
  'feedback@heydpe.com': 'feedback',
};

export function routeEmail(
  toAddresses: string[],
  forwardTo: string | undefined
): EmailRoute {
  // Check each recipient against ticket addresses
  for (const addr of toAddresses) {
    const normalized = addr.toLowerCase().trim();
    if (normalized in TICKET_ADDRESSES) {
      return { action: 'create_ticket', type: TICKET_ADDRESSES[normalized] };
    }
  }

  // Forward if configured
  if (forwardTo) {
    return { action: 'forward', to: forwardTo };
  }

  return { action: 'ignore' };
}

export function extractEmailAddress(rawFrom: string): string {
  // "John Doe <john@example.com>" -> "john@example.com"
  // "john@example.com" -> "john@example.com"
  const match = rawFrom.match(/<([^>]+)>/);
  return (match ? match[1] : rawFrom).toLowerCase().trim();
}

export function extractEmailName(rawFrom: string): string | null {
  // "John Doe <john@example.com>" -> "John Doe"
  const match = rawFrom.match(/^([^<]+)</);
  return match ? match[1].trim() : null;
}
