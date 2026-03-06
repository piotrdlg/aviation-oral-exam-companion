import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before any imports
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import {
  normalizeSlug,
  generateReferralCode,
  generateUniqueSlug,
  generateUniqueReferralCode,
  ensureInstructorIdentity,
  lookupByReferralCode,
  lookupBySlug,
} from '../instructor-identity';

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function mockSupabase(overrides?: Record<string, unknown>) {
  const mockChain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return mockChain;
}

// ---------------------------------------------------------------------------
// normalizeSlug
// ---------------------------------------------------------------------------

describe('normalizeSlug', () => {
  it('converts names to lowercase hyphenated slug', () => {
    expect(normalizeSlug('John', 'Smith')).toBe('john-smith');
  });

  it('handles accented characters', () => {
    expect(normalizeSlug('José', 'García')).toBe('jose-garcia');
  });

  it('removes special characters', () => {
    expect(normalizeSlug("O'Brien", 'Jr.')).toBe('obrien-jr');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(normalizeSlug('Mary  Jane', 'Watson - Parker')).toBe('mary-jane-watson-parker');
  });

  it('handles empty strings', () => {
    expect(normalizeSlug('', '')).toBe('instructor');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeSlug(' John ', ' Doe ')).toBe('john-doe');
  });

  it('handles single-word names', () => {
    expect(normalizeSlug('Madonna', '')).toBe('madonna');
  });

  it('handles numbers in names', () => {
    expect(normalizeSlug('John', 'Smith3rd')).toBe('john-smith3rd');
  });
});

// ---------------------------------------------------------------------------
// generateReferralCode
// ---------------------------------------------------------------------------

describe('generateReferralCode', () => {
  it('produces 8-character code', () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(8);
  });

  it('uses only uppercase alphanumeric characters (no 0/O/I/1)', () => {
    // Generate multiple codes to increase coverage
    for (let i = 0; i < 20; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('produces different codes on successive calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateReferralCode());
    }
    // With 32^8 possibilities, 50 codes should all be unique
    expect(codes.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueSlug
// ---------------------------------------------------------------------------

describe('generateUniqueSlug', () => {
  it('returns base slug when no collision', async () => {
    const sb = mockSupabase();
    const slug = await generateUniqueSlug(sb as never, 'John', 'Smith');
    expect(slug).toBe('john-smith');
  });

  it('appends -2 on first collision', async () => {
    let callCount = 0;
    const sb = mockSupabase({
      maybeSingle: vi.fn().mockImplementation(async () => {
        callCount++;
        // First call (john-smith) → collision, second (john-smith-2) → free
        return { data: callCount === 1 ? { id: 'exists' } : null, error: null };
      }),
    });
    const slug = await generateUniqueSlug(sb as never, 'John', 'Smith');
    expect(slug).toBe('john-smith-2');
  });

  it('falls back to random suffix after max attempts', async () => {
    const sb = mockSupabase({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'exists' }, error: null }),
    });
    const slug = await generateUniqueSlug(sb as never, 'John', 'Smith');
    // Should start with john-smith- and end with a 6-char hex suffix
    expect(slug).toMatch(/^john-smith-[a-f0-9]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueReferralCode
// ---------------------------------------------------------------------------

describe('generateUniqueReferralCode', () => {
  it('returns a code when no collision', async () => {
    const sb = mockSupabase();
    const code = await generateUniqueReferralCode(sb as never);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it('retries on collision', async () => {
    let callCount = 0;
    const sb = mockSupabase({
      maybeSingle: vi.fn().mockImplementation(async () => {
        callCount++;
        return { data: callCount <= 2 ? { id: 'exists' } : null, error: null };
      }),
    });
    const code = await generateUniqueReferralCode(sb as never);
    expect(code).toHaveLength(8);
    expect(callCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ensureInstructorIdentity
// ---------------------------------------------------------------------------

describe('ensureInstructorIdentity', () => {
  it('returns null for non-existent profile', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const result = await ensureInstructorIdentity(sb as never, 'user-1');
    expect(result).toBeNull();
  });

  it('returns null for non-approved profile', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'u1', first_name: 'J', last_name: 'S', slug: null, referral_code: null, status: 'pending' },
        error: null,
      }),
    });
    const result = await ensureInstructorIdentity(sb as never, 'u1');
    expect(result).toBeNull();
  });

  it('returns existing slug + referral_code without updating', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({
        data: {
          user_id: 'u1', first_name: 'J', last_name: 'S',
          slug: 'j-s', referral_code: 'ABCD1234', status: 'approved',
        },
        error: null,
      }),
    });
    const result = await ensureInstructorIdentity(sb as never, 'u1');
    expect(result).toEqual({ slug: 'j-s', referralCode: 'ABCD1234' });
  });
});

// ---------------------------------------------------------------------------
// lookupByReferralCode
// ---------------------------------------------------------------------------

describe('lookupByReferralCode', () => {
  it('returns null when not found', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const result = await lookupByReferralCode(sb as never, 'NONEXIST');
    expect(result).toBeNull();
  });

  it('returns public-safe info for valid code', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({
        data: {
          user_id: 'u1', first_name: 'John', last_name: 'Smith',
          certificate_type: 'CFI', bio: 'Experienced instructor', slug: 'john-smith',
        },
        error: null,
      }),
    });
    const result = await lookupByReferralCode(sb as never, 'abcd1234');
    expect(result).toEqual({
      instructorUserId: 'u1',
      instructorName: 'John Smith',
      certType: 'CFI',
      bio: 'Experienced instructor',
      slug: 'john-smith',
    });
  });

  it('uppercases the input code', async () => {
    const eqCalls: string[] = [];
    const sb = mockSupabase({
      eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
        eqCalls.push(String(val));
        return sb;
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    await lookupByReferralCode(sb as never, 'abcd1234');
    expect(eqCalls).toContain('ABCD1234');
  });
});

// ---------------------------------------------------------------------------
// lookupBySlug
// ---------------------------------------------------------------------------

describe('lookupBySlug', () => {
  it('returns null when not found', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const result = await lookupBySlug(sb as never, 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns public-safe info with referral code', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({
        data: {
          user_id: 'u1', first_name: 'John', last_name: 'Smith',
          certificate_type: 'CFI', bio: 'Great CFI', slug: 'john-smith', referral_code: 'XY12AB34',
        },
        error: null,
      }),
    });
    const result = await lookupBySlug(sb as never, 'John-Smith');
    expect(result).toEqual({
      instructorUserId: 'u1',
      instructorName: 'John Smith',
      certType: 'CFI',
      bio: 'Great CFI',
      slug: 'john-smith',
      referralCode: 'XY12AB34',
    });
  });

  it('lowercases the input slug', async () => {
    const eqCalls: [string, unknown][] = [];
    const sb = mockSupabase({
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return sb;
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    await lookupBySlug(sb as never, 'John-Smith');
    const slugCall = eqCalls.find(([col]) => col === 'slug');
    expect(slugCall?.[1]).toBe('john-smith');
  });
});
