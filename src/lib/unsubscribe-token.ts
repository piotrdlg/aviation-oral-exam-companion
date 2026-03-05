import { createHmac, timingSafeEqual } from 'crypto';
import type { EmailCategory } from '@/types/database';

const SEPARATOR = ':';

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET;
  if (!secret) {
    throw new Error('UNSUBSCRIBE_HMAC_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Generate an HMAC-SHA256 token for a user+category pair.
 * Stateless — no DB lookup needed to verify.
 */
export function generateUnsubscribeToken(
  userId: string,
  category: EmailCategory,
): string {
  const payload = `${userId}${SEPARATOR}${category}`;
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/**
 * Verify an unsubscribe token against the expected user+category.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyUnsubscribeToken(
  userId: string,
  category: EmailCategory,
  token: string,
): boolean {
  try {
    const expected = generateUnsubscribeToken(userId, category);
    const tokenBuf = Buffer.from(token, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (tokenBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(tokenBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Generate a full unsubscribe URL for embedding in emails.
 */
export function generateUnsubscribeUrl(
  userId: string,
  category: EmailCategory,
  baseUrl?: string,
): string {
  const token = generateUnsubscribeToken(userId, category);
  const base = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://aviation-oral-exam-companion.vercel.app';
  return `${base}/email/preferences?uid=${userId}&cat=${category}&token=${token}`;
}
