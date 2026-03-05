import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateUnsubscribeUrl,
} from '../unsubscribe-token';

const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

beforeAll(() => {
  process.env.UNSUBSCRIBE_HMAC_SECRET = 'test-secret-key-for-unit-tests-only';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://heydpe.com';
});

describe('generateUnsubscribeToken', () => {
  it('returns a hex string', () => {
    const token = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for same inputs', () => {
    const t1 = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    const t2 = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    expect(t1).toBe(t2);
  });

  it('produces different tokens for different categories', () => {
    const t1 = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    const t2 = generateUnsubscribeToken(TEST_USER_ID, 'motivation_nudges');
    expect(t1).not.toBe(t2);
  });

  it('produces different tokens for different users', () => {
    const t1 = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    const t2 = generateUnsubscribeToken('00000000-0000-0000-0000-000000000000', 'learning_digest');
    expect(t1).not.toBe(t2);
  });
});

describe('verifyUnsubscribeToken', () => {
  it('returns true for valid token', () => {
    const token = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    expect(verifyUnsubscribeToken(TEST_USER_ID, 'learning_digest', token)).toBe(true);
  });

  it('returns false for wrong category', () => {
    const token = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    expect(verifyUnsubscribeToken(TEST_USER_ID, 'motivation_nudges', token)).toBe(false);
  });

  it('returns false for wrong user', () => {
    const token = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    expect(verifyUnsubscribeToken('wrong-user-id', 'learning_digest', token)).toBe(false);
  });

  it('returns false for tampered token', () => {
    const token = generateUnsubscribeToken(TEST_USER_ID, 'learning_digest');
    const tampered = token.replace(token[0], token[0] === 'a' ? 'b' : 'a');
    expect(verifyUnsubscribeToken(TEST_USER_ID, 'learning_digest', tampered)).toBe(false);
  });

  it('returns false for empty token', () => {
    expect(verifyUnsubscribeToken(TEST_USER_ID, 'learning_digest', '')).toBe(false);
  });

  it('returns false for non-hex token', () => {
    expect(verifyUnsubscribeToken(TEST_USER_ID, 'learning_digest', 'not-a-valid-hex')).toBe(false);
  });
});

describe('generateUnsubscribeUrl', () => {
  it('includes user ID, category, and token', () => {
    const url = generateUnsubscribeUrl(TEST_USER_ID, 'learning_digest');
    expect(url).toContain(`uid=${TEST_USER_ID}`);
    expect(url).toContain('cat=learning_digest');
    expect(url).toContain('token=');
    expect(url.startsWith('https://heydpe.com/email/preferences')).toBe(true);
  });

  it('uses custom base URL when provided', () => {
    const url = generateUnsubscribeUrl(TEST_USER_ID, 'marketing', 'https://custom.example.com');
    expect(url.startsWith('https://custom.example.com/email/preferences')).toBe(true);
  });

  it('produces a verifiable URL', () => {
    const url = generateUnsubscribeUrl(TEST_USER_ID, 'motivation_nudges');
    const params = new URL(url).searchParams;
    const uid = params.get('uid')!;
    const cat = params.get('cat')! as 'motivation_nudges';
    const token = params.get('token')!;
    expect(verifyUnsubscribeToken(uid, cat, token)).toBe(true);
  });
});
