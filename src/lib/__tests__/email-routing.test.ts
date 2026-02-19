import { describe, it, expect } from 'vitest';
import { routeEmail, extractEmailAddress, extractEmailName } from '../email-routing';

describe('routeEmail', () => {
  it('routes support@heydpe.com to create_ticket(support)', () => {
    const result = routeEmail(['support@heydpe.com'], undefined);
    expect(result).toEqual({ action: 'create_ticket', type: 'support' });
  });

  it('routes feedback@heydpe.com to create_ticket(feedback)', () => {
    const result = routeEmail(['feedback@heydpe.com'], undefined);
    expect(result).toEqual({ action: 'create_ticket', type: 'feedback' });
  });

  it('forwards pd@heydpe.com when forwardTo is set', () => {
    const result = routeEmail(['pd@heydpe.com'], 'pd@imagineflying.com');
    expect(result).toEqual({ action: 'forward', to: 'pd@imagineflying.com' });
  });

  it('forwards random@heydpe.com when forwardTo is set (catch-all)', () => {
    const result = routeEmail(['random@heydpe.com'], 'pd@imagineflying.com');
    expect(result).toEqual({ action: 'forward', to: 'pd@imagineflying.com' });
  });

  it('ignores random@heydpe.com without forwardTo', () => {
    const result = routeEmail(['random@heydpe.com'], undefined);
    expect(result).toEqual({ action: 'ignore' });
  });

  it('is case insensitive: Support@HeyDPE.com routes to create_ticket(support)', () => {
    const result = routeEmail(['Support@HeyDPE.com'], undefined);
    expect(result).toEqual({ action: 'create_ticket', type: 'support' });
  });

  it('prioritizes ticket address when multiple recipients include both ticket and non-ticket', () => {
    const result = routeEmail(['support@heydpe.com', 'pd@heydpe.com'], 'pd@imagineflying.com');
    expect(result).toEqual({ action: 'create_ticket', type: 'support' });
  });

  it('forwards when toAddresses is empty and forwardTo is set', () => {
    const result = routeEmail([], 'pd@imagineflying.com');
    expect(result).toEqual({ action: 'forward', to: 'pd@imagineflying.com' });
  });

  it('ignores when toAddresses is empty and forwardTo is not set', () => {
    const result = routeEmail([], undefined);
    expect(result).toEqual({ action: 'ignore' });
  });
});

describe('extractEmailAddress', () => {
  it('extracts email from "John Doe <john@example.com>"', () => {
    expect(extractEmailAddress('John Doe <john@example.com>')).toBe('john@example.com');
  });

  it('returns plain email address as-is', () => {
    expect(extractEmailAddress('john@example.com')).toBe('john@example.com');
  });

  it('lowercases and extracts from "<JOHN@Example.Com>"', () => {
    expect(extractEmailAddress('<JOHN@Example.Com>')).toBe('john@example.com');
  });

  it('trims whitespace from " john@example.com "', () => {
    expect(extractEmailAddress(' john@example.com ')).toBe('john@example.com');
  });
});

describe('extractEmailName', () => {
  it('extracts name from "John Doe <john@example.com>"', () => {
    expect(extractEmailName('John Doe <john@example.com>')).toBe('John Doe');
  });

  it('returns null for plain email "john@example.com"', () => {
    expect(extractEmailName('john@example.com')).toBeNull();
  });

  it('returns null for "<john@example.com>" (no name portion)', () => {
    expect(extractEmailName('<john@example.com>')).toBeNull();
  });

  it('trims leading whitespace from " John Doe <john@example.com>"', () => {
    expect(extractEmailName(' John Doe <john@example.com>')).toBe('John Doe');
  });
});
