import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before any imports
vi.mock('server-only', () => ({}));

// Mock dependencies
const mockGetInstructorStudentList = vi.fn();
const mockGetStudentInsights = vi.fn();
const mockGenerateUnsubscribeUrl = vi.fn();

vi.mock('@/lib/instructor-student-summary', () => ({
  getInstructorStudentList: (...args: unknown[]) => mockGetInstructorStudentList(...args),
}));

vi.mock('@/lib/instructor-insights', () => ({
  getStudentInsights: (...args: unknown[]) => mockGetStudentInsights(...args),
}));

vi.mock('@/lib/unsubscribe-token', () => ({
  generateUnsubscribeUrl: (...args: unknown[]) => mockGenerateUnsubscribeUrl(...args),
}));

import { buildInstructorWeeklySummary } from '../instructor-summary-builder';
import type { InstructorForEmail } from '../instructor-summary-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SITE_URL = 'https://heydpe.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSb = {} as any;

function makeInstructor(overrides: Partial<InstructorForEmail> = {}): InstructorForEmail {
  return {
    userId: 'instr-001',
    email: 'cfi@example.com',
    displayName: 'John Smith',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
  process.env.UNSUBSCRIBE_HMAC_SECRET = 'test-secret';
  mockGenerateUnsubscribeUrl.mockReturnValue('https://heydpe.com/email/preferences?uid=instr-001&cat=instructor_weekly_summary&token=abc');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildInstructorWeeklySummary', () => {
  // ------------------------------------------------------------------
  // 0-students referral nudge variant
  // ------------------------------------------------------------------

  it('returns data with referral CTA when 0 students', async () => {
    mockGetInstructorStudentList.mockResolvedValue([]);

    const result = await buildInstructorWeeklySummary(
      fakeSb,
      makeInstructor({ referralCode: 'ABCD1234' }),
    );

    expect(result).not.toBeNull();
    expect(result!.totalStudents).toBe(0);
    expect(result!.activeStudents).toBe(0);
    expect(result!.needsAttentionCount).toBe(0);
    expect(result!.students).toEqual([]);
    expect(result!.referralCode).toBe('ABCD1234');
    expect(result!.referralLink).toBe(`${SITE_URL}/ref/ABCD1234`);
    expect(result!.qrUrl).toBe(`${SITE_URL}/api/public/qr/referral/ABCD1234`);
    expect(result!.instructorName).toBe('John Smith');
    expect(result!.unsubscribeUrl).toBeDefined();
  });

  it('returns data without referral CTA when >= 1 students', async () => {
    mockGetInstructorStudentList.mockResolvedValue([
      {
        studentUserId: 'stu-001',
        displayName: 'Alice',
        readinessScore: 72,
        sessionsLast7Days: 3,
      },
    ]);
    mockGetStudentInsights.mockResolvedValue(null);

    const result = await buildInstructorWeeklySummary(
      fakeSb,
      makeInstructor({ referralCode: 'ABCD1234' }),
    );

    expect(result).not.toBeNull();
    expect(result!.totalStudents).toBe(1);
    expect(result!.students).toHaveLength(1);
    // Should NOT include referral props
    expect(result!.referralCode).toBeUndefined();
    expect(result!.referralLink).toBeUndefined();
    expect(result!.qrUrl).toBeUndefined();
  });

  it('referralLink and qrUrl are populated from referralCode', async () => {
    mockGetInstructorStudentList.mockResolvedValue([]);

    const result = await buildInstructorWeeklySummary(
      fakeSb,
      makeInstructor({ referralCode: 'XY56ZW78' }),
    );

    expect(result).not.toBeNull();
    expect(result!.referralLink).toBe(`${SITE_URL}/ref/XY56ZW78`);
    expect(result!.qrUrl).toBe(`${SITE_URL}/api/public/qr/referral/XY56ZW78`);
  });

  it('referralLink and qrUrl are undefined when no referralCode', async () => {
    mockGetInstructorStudentList.mockResolvedValue([]);

    const result = await buildInstructorWeeklySummary(
      fakeSb,
      makeInstructor({ referralCode: undefined }),
    );

    expect(result).not.toBeNull();
    expect(result!.totalStudents).toBe(0);
    expect(result!.referralCode).toBeUndefined();
    expect(result!.referralLink).toBeUndefined();
    expect(result!.qrUrl).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // Existing behavior preserved
  // ------------------------------------------------------------------

  it('uses fallback base URL when NEXT_PUBLIC_SITE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mockGetInstructorStudentList.mockResolvedValue([]);

    const result = await buildInstructorWeeklySummary(
      fakeSb,
      makeInstructor({ referralCode: 'TEST1234' }),
    );

    expect(result!.referralLink).toBe(
      'https://aviation-oral-exam-companion.vercel.app/ref/TEST1234',
    );
    expect(result!.qrUrl).toBe(
      'https://aviation-oral-exam-companion.vercel.app/api/public/qr/referral/TEST1234',
    );
  });

  it('uses "Instructor" as fallback name when displayName is null', async () => {
    mockGetInstructorStudentList.mockResolvedValue([]);

    const result = await buildInstructorWeeklySummary(
      fakeSb,
      makeInstructor({ displayName: null }),
    );

    expect(result!.instructorName).toBe('Instructor');
  });
});
