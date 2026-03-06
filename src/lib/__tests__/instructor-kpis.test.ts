import { describe, it, expect } from 'vitest';
import {
  computeLifecycleCounts,
  computeInviteStats,
  computeReadinessStats,
  computeMilestoneStats,
  computeEntitlementStats,
  computeInstructorKpis,
  type StudentConnectionData,
  type InviteEventData,
  type MilestoneData,
  type EntitlementData,
} from '../instructor-kpis';

// ---------------------------------------------------------------------------
// Test helper factories
// ---------------------------------------------------------------------------

function makeConnection(overrides: Partial<StudentConnectionData> = {}): StudentConnectionData {
  return {
    studentUserId: `student-${Math.random().toString(36).slice(2, 8)}`,
    state: 'connected',
    subscriptionStatus: 'active',
    sessionsLast7d: 3,
    readinessScore: 75,
    readinessTrend: 'stable',
    needsAttention: false,
    ...overrides,
  };
}

function makeInviteEvent(overrides: Partial<InviteEventData> = {}): InviteEventData {
  return {
    eventType: 'token_created',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<MilestoneData> = {}): MilestoneData {
  return {
    studentUserId: 'student-1',
    milestoneKey: 'knowledge_test_passed',
    status: 'completed',
    ...overrides,
  };
}

function makeEntitlement(overrides: Partial<EntitlementData> = {}): EntitlementData {
  return {
    hasCourtesyAccess: true,
    courtesyReason: 'paid_student',
    paidStudentCount: 1,
    hasDirectOverride: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. computeLifecycleCounts (7 tests)
// ---------------------------------------------------------------------------

describe('computeLifecycleCounts', () => {
  it('returns all zeros for empty connections', () => {
    const result = computeLifecycleCounts([]);
    expect(result).toEqual({
      totalConnected: 0,
      activeLast7d: 0,
      inactiveLast7d: 0,
      paidActive: 0,
      trialing: 0,
      free: 0,
      pendingRequests: 0,
      disconnected: 0,
    });
  });

  it('counts a single connected active student', () => {
    const result = computeLifecycleCounts([
      makeConnection({ sessionsLast7d: 5 }),
    ]);
    expect(result.totalConnected).toBe(1);
    expect(result.activeLast7d).toBe(1);
    expect(result.inactiveLast7d).toBe(0);
  });

  it('counts a single connected inactive student', () => {
    const result = computeLifecycleCounts([
      makeConnection({ sessionsLast7d: 0 }),
    ]);
    expect(result.totalConnected).toBe(1);
    expect(result.activeLast7d).toBe(0);
    expect(result.inactiveLast7d).toBe(1);
  });

  it('separates connected, pending, and disconnected correctly', () => {
    const connections = [
      makeConnection({ state: 'connected' }),
      makeConnection({ state: 'connected' }),
      makeConnection({ state: 'pending' }),
      makeConnection({ state: 'invited' }),
      makeConnection({ state: 'disconnected' }),
      makeConnection({ state: 'rejected' }),
    ];
    const result = computeLifecycleCounts(connections);
    expect(result.totalConnected).toBe(2);
    expect(result.pendingRequests).toBe(2);
    expect(result.disconnected).toBe(2);
  });

  it('categorizes paid vs trialing vs free subscriptions', () => {
    const connections = [
      makeConnection({ subscriptionStatus: 'active' }),
      makeConnection({ subscriptionStatus: 'active' }),
      makeConnection({ subscriptionStatus: 'trialing' }),
      makeConnection({ subscriptionStatus: 'free' }),
    ];
    const result = computeLifecycleCounts(connections);
    expect(result.paidActive).toBe(2);
    expect(result.trialing).toBe(1);
    expect(result.free).toBe(1);
  });

  it('counts null subscriptionStatus as free', () => {
    const result = computeLifecycleCounts([
      makeConnection({ subscriptionStatus: null }),
    ]);
    expect(result.free).toBe(1);
    expect(result.paidActive).toBe(0);
    expect(result.trialing).toBe(0);
  });

  it('counts unknown subscriptionStatus values as free', () => {
    const result = computeLifecycleCounts([
      makeConnection({ subscriptionStatus: 'expired' }),
      makeConnection({ subscriptionStatus: 'cancelled' }),
    ]);
    expect(result.free).toBe(2);
    expect(result.paidActive).toBe(0);
    expect(result.trialing).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. computeInviteStats (6 tests)
// ---------------------------------------------------------------------------

describe('computeInviteStats', () => {
  const now = new Date('2026-03-06T12:00:00Z');
  const threeDaysAgo = new Date('2026-03-03T12:00:00Z').toISOString();
  const tenDaysAgo = new Date('2026-02-24T12:00:00Z').toISOString();

  it('returns all zeros and null conversionRate for empty events', () => {
    const result = computeInviteStats([], now);
    expect(result).toEqual({
      totalTokensCreated: 0,
      tokensCreated7d: 0,
      totalEmailsSent: 0,
      emailsSent7d: 0,
      totalClaims: 0,
      claims7d: 0,
      rateLimitHits7d: 0,
      conversionRate: null,
    });
  });

  it('counts only token_created events with conversion 0 when no claims', () => {
    const events = [
      makeInviteEvent({ eventType: 'token_created', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'token_created', createdAt: tenDaysAgo }),
    ];
    const result = computeInviteStats(events, now);
    expect(result.totalTokensCreated).toBe(2);
    expect(result.tokensCreated7d).toBe(1);
    expect(result.totalClaims).toBe(0);
    // conversionRate = 0 / 2 = 0
    expect(result.conversionRate).toBe(0);
  });

  it('separates recent vs old events across the 7d window', () => {
    const events = [
      makeInviteEvent({ eventType: 'token_created', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'token_created', createdAt: tenDaysAgo }),
      makeInviteEvent({ eventType: 'email_sent', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'email_sent', createdAt: tenDaysAgo }),
      makeInviteEvent({ eventType: 'claimed', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'claimed', createdAt: tenDaysAgo }),
    ];
    const result = computeInviteStats(events, now);
    expect(result.totalTokensCreated).toBe(2);
    expect(result.tokensCreated7d).toBe(1);
    expect(result.totalEmailsSent).toBe(2);
    expect(result.emailsSent7d).toBe(1);
    expect(result.totalClaims).toBe(2);
    expect(result.claims7d).toBe(1);
  });

  it('counts rate limit hits only within 7d', () => {
    const events = [
      makeInviteEvent({ eventType: 'rate_limited', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'rate_limited', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'rate_limited', createdAt: tenDaysAgo }),
    ];
    const result = computeInviteStats(events, now);
    expect(result.rateLimitHits7d).toBe(2);
  });

  it('computes conversionRate as claims / (tokens + emails)', () => {
    const events = [
      makeInviteEvent({ eventType: 'token_created', createdAt: tenDaysAgo }),
      makeInviteEvent({ eventType: 'token_created', createdAt: tenDaysAgo }),
      makeInviteEvent({ eventType: 'email_sent', createdAt: tenDaysAgo }),
      makeInviteEvent({ eventType: 'email_sent', createdAt: tenDaysAgo }),
      makeInviteEvent({ eventType: 'claimed', createdAt: tenDaysAgo }),
    ];
    const result = computeInviteStats(events, now);
    // 1 claim / (2 tokens + 2 emails) = 0.25
    expect(result.conversionRate).toBe(0.25);
  });

  it('handles all claims with no sends (tokens only)', () => {
    const events = [
      makeInviteEvent({ eventType: 'token_created', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'claimed', createdAt: threeDaysAgo }),
    ];
    const result = computeInviteStats(events, now);
    // 1 claim / (1 token + 0 emails) = 1.0
    expect(result.conversionRate).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. computeReadinessStats (5 tests)
// ---------------------------------------------------------------------------

describe('computeReadinessStats', () => {
  it('returns null avgReadiness and zeros for no connected students', () => {
    const result = computeReadinessStats([]);
    expect(result).toEqual({
      avgReadiness: null,
      studentsWithScores: 0,
      studentsNeedingAttention: 0,
      improvingCount: 0,
      decliningCount: 0,
    });
  });

  it('returns null avgReadiness when connected students have no scores', () => {
    const connections = [
      makeConnection({ readinessScore: null }),
      makeConnection({ readinessScore: null }),
    ];
    const result = computeReadinessStats(connections);
    expect(result.avgReadiness).toBe(null);
    expect(result.studentsWithScores).toBe(0);
  });

  it('averages only scored students (ignores unscored)', () => {
    const connections = [
      makeConnection({ readinessScore: 80 }),
      makeConnection({ readinessScore: 60 }),
      makeConnection({ readinessScore: null }),
    ];
    const result = computeReadinessStats(connections);
    expect(result.avgReadiness).toBe(70); // (80+60)/2 = 70
    expect(result.studentsWithScores).toBe(2);
  });

  it('counts improving and declining students', () => {
    const connections = [
      makeConnection({ readinessTrend: 'improving' }),
      makeConnection({ readinessTrend: 'improving' }),
      makeConnection({ readinessTrend: 'declining' }),
      makeConnection({ readinessTrend: 'stable' }),
      makeConnection({ readinessTrend: 'insufficient_data' }),
    ];
    const result = computeReadinessStats(connections);
    expect(result.improvingCount).toBe(2);
    expect(result.decliningCount).toBe(1);
  });

  it('aggregates needsAttention from connection data', () => {
    const connections = [
      makeConnection({ needsAttention: true }),
      makeConnection({ needsAttention: true }),
      makeConnection({ needsAttention: false }),
    ];
    const result = computeReadinessStats(connections);
    expect(result.studentsNeedingAttention).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. computeMilestoneStats (4 tests)
// ---------------------------------------------------------------------------

describe('computeMilestoneStats', () => {
  it('returns all zeros for empty milestones', () => {
    const result = computeMilestoneStats([]);
    expect(result).toEqual({
      knowledgeTestPassed: 0,
      mockOralCompleted: 0,
      checkrideScheduled: 0,
      oralPassed: 0,
    });
  });

  it('counts different milestones from different students', () => {
    const milestones = [
      makeMilestone({ studentUserId: 's1', milestoneKey: 'knowledge_test_passed' }),
      makeMilestone({ studentUserId: 's2', milestoneKey: 'mock_oral_completed' }),
      makeMilestone({ studentUserId: 's3', milestoneKey: 'checkride_scheduled' }),
      makeMilestone({ studentUserId: 's4', milestoneKey: 'oral_passed' }),
    ];
    const result = computeMilestoneStats(milestones);
    expect(result.knowledgeTestPassed).toBe(1);
    expect(result.mockOralCompleted).toBe(1);
    expect(result.checkrideScheduled).toBe(1);
    expect(result.oralPassed).toBe(1);
  });

  it('counts same milestone completed by multiple students', () => {
    const milestones = [
      makeMilestone({ studentUserId: 's1', milestoneKey: 'knowledge_test_passed' }),
      makeMilestone({ studentUserId: 's2', milestoneKey: 'knowledge_test_passed' }),
      makeMilestone({ studentUserId: 's3', milestoneKey: 'knowledge_test_passed' }),
    ];
    const result = computeMilestoneStats(milestones);
    expect(result.knowledgeTestPassed).toBe(3);
  });

  it('does not count non-completed milestones', () => {
    const milestones = [
      makeMilestone({ milestoneKey: 'knowledge_test_passed', status: 'completed' }),
      makeMilestone({ milestoneKey: 'knowledge_test_passed', status: 'not_set' }),
      makeMilestone({ milestoneKey: 'mock_oral_completed', status: 'in_progress' }),
      makeMilestone({ milestoneKey: 'oral_passed', status: 'completed' }),
    ];
    const result = computeMilestoneStats(milestones);
    expect(result.knowledgeTestPassed).toBe(1);
    expect(result.mockOralCompleted).toBe(0);
    expect(result.oralPassed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. computeEntitlementStats (3 tests)
// ---------------------------------------------------------------------------

describe('computeEntitlementStats', () => {
  it('returns courtesy access via paid student', () => {
    const result = computeEntitlementStats(
      makeEntitlement({
        hasCourtesyAccess: true,
        courtesyReason: 'paid_student',
        paidStudentCount: 3,
        hasDirectOverride: false,
      })
    );
    expect(result.hasCourtesyAccess).toBe(true);
    expect(result.courtesyReason).toBe('paid_student');
    expect(result.paidStudentCount).toBe(3);
    expect(result.hasDirectOverride).toBe(false);
  });

  it('returns no courtesy access', () => {
    const result = computeEntitlementStats(
      makeEntitlement({
        hasCourtesyAccess: false,
        courtesyReason: 'none',
        paidStudentCount: 0,
        hasDirectOverride: false,
      })
    );
    expect(result.hasCourtesyAccess).toBe(false);
    expect(result.courtesyReason).toBe('none');
    expect(result.paidStudentCount).toBe(0);
  });

  it('returns direct admin override', () => {
    const result = computeEntitlementStats(
      makeEntitlement({
        hasCourtesyAccess: true,
        courtesyReason: 'admin_override',
        paidStudentCount: 0,
        hasDirectOverride: true,
      })
    );
    expect(result.hasCourtesyAccess).toBe(true);
    expect(result.hasDirectOverride).toBe(true);
    expect(result.courtesyReason).toBe('admin_override');
  });
});

// ---------------------------------------------------------------------------
// 6. computeInstructorKpis (orchestrator) (3 tests)
// ---------------------------------------------------------------------------

describe('computeInstructorKpis', () => {
  const fixedNow = new Date('2026-03-06T12:00:00Z');

  it('returns version=1 and all sub-objects with zero/null values for empty inputs', () => {
    const result = computeInstructorKpis(
      'instructor-abc',
      [],
      [],
      [],
      makeEntitlement({ hasCourtesyAccess: false, courtesyReason: 'none', paidStudentCount: 0 }),
      fixedNow
    );

    expect(result.version).toBe(1);
    expect(result.instructorUserId).toBe('instructor-abc');
    expect(result.computedAt).toBe('2026-03-06T12:00:00.000Z');

    // Lifecycle all zeros
    expect(result.lifecycle.totalConnected).toBe(0);
    expect(result.lifecycle.activeLast7d).toBe(0);

    // Invites all zeros
    expect(result.invites.totalTokensCreated).toBe(0);
    expect(result.invites.conversionRate).toBe(null);

    // Readiness null
    expect(result.readiness.avgReadiness).toBe(null);
    expect(result.readiness.studentsWithScores).toBe(0);

    // Milestones all zeros
    expect(result.milestones.knowledgeTestPassed).toBe(0);
    expect(result.milestones.oralPassed).toBe(0);

    // Entitlements
    expect(result.entitlements.hasCourtesyAccess).toBe(false);
  });

  it('produces correct results with a full realistic data set', () => {
    const connections: StudentConnectionData[] = [
      makeConnection({ state: 'connected', subscriptionStatus: 'active', sessionsLast7d: 5, readinessScore: 80, readinessTrend: 'improving', needsAttention: false }),
      makeConnection({ state: 'connected', subscriptionStatus: 'active', sessionsLast7d: 2, readinessScore: 90, readinessTrend: 'stable', needsAttention: false }),
      makeConnection({ state: 'connected', subscriptionStatus: 'trialing', sessionsLast7d: 0, readinessScore: 40, readinessTrend: 'declining', needsAttention: true }),
      makeConnection({ state: 'connected', subscriptionStatus: null, sessionsLast7d: 0, readinessScore: null, readinessTrend: 'insufficient_data', needsAttention: true }),
      makeConnection({ state: 'pending' }),
      makeConnection({ state: 'disconnected' }),
    ];

    const threeDaysAgo = new Date('2026-03-03T12:00:00Z').toISOString();
    const inviteEvents: InviteEventData[] = [
      makeInviteEvent({ eventType: 'token_created', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'email_sent', createdAt: threeDaysAgo }),
      makeInviteEvent({ eventType: 'claimed', createdAt: threeDaysAgo }),
    ];

    const milestones: MilestoneData[] = [
      makeMilestone({ studentUserId: 's1', milestoneKey: 'knowledge_test_passed', status: 'completed' }),
      makeMilestone({ studentUserId: 's2', milestoneKey: 'knowledge_test_passed', status: 'completed' }),
      makeMilestone({ studentUserId: 's1', milestoneKey: 'mock_oral_completed', status: 'completed' }),
    ];

    const entitlement = makeEntitlement({
      hasCourtesyAccess: true,
      courtesyReason: 'paid_student',
      paidStudentCount: 2,
    });

    const result = computeInstructorKpis(
      'instructor-xyz',
      connections,
      inviteEvents,
      milestones,
      entitlement,
      fixedNow
    );

    expect(result.version).toBe(1);
    expect(result.instructorUserId).toBe('instructor-xyz');

    // Lifecycle
    expect(result.lifecycle.totalConnected).toBe(4);
    expect(result.lifecycle.activeLast7d).toBe(2);
    expect(result.lifecycle.inactiveLast7d).toBe(2);
    expect(result.lifecycle.paidActive).toBe(2);
    expect(result.lifecycle.trialing).toBe(1);
    expect(result.lifecycle.free).toBe(1);
    expect(result.lifecycle.pendingRequests).toBe(1);
    expect(result.lifecycle.disconnected).toBe(1);

    // Invites
    expect(result.invites.totalTokensCreated).toBe(1);
    expect(result.invites.totalEmailsSent).toBe(1);
    expect(result.invites.totalClaims).toBe(1);
    expect(result.invites.conversionRate).toBe(0.5); // 1 / (1+1)

    // Readiness — avg of 80, 90, 40 = 210/3 = 70
    expect(result.readiness.avgReadiness).toBe(70);
    expect(result.readiness.studentsWithScores).toBe(3);
    expect(result.readiness.studentsNeedingAttention).toBe(2);
    expect(result.readiness.improvingCount).toBe(1);
    expect(result.readiness.decliningCount).toBe(1);

    // Milestones
    expect(result.milestones.knowledgeTestPassed).toBe(2);
    expect(result.milestones.mockOralCompleted).toBe(1);
    expect(result.milestones.checkrideScheduled).toBe(0);
    expect(result.milestones.oralPassed).toBe(0);

    // Entitlements
    expect(result.entitlements.hasCourtesyAccess).toBe(true);
    expect(result.entitlements.paidStudentCount).toBe(2);
  });

  it('is deterministic: same inputs produce identical outputs', () => {
    const connections = [makeConnection({ state: 'connected', readinessScore: 50 })];
    const events = [makeInviteEvent({ eventType: 'token_created', createdAt: '2026-03-05T00:00:00Z' })];
    const milestones = [makeMilestone({ milestoneKey: 'oral_passed' })];
    const entitlement = makeEntitlement();

    const result1 = computeInstructorKpis('inst-1', connections, events, milestones, entitlement, fixedNow);
    const result2 = computeInstructorKpis('inst-1', connections, events, milestones, entitlement, fixedNow);

    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// 7. Edge cases (4 tests)
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles large numbers of students (100) without errors', () => {
    const connections = Array.from({ length: 100 }, (_, i) =>
      makeConnection({
        studentUserId: `student-${i}`,
        sessionsLast7d: i % 2 === 0 ? 0 : i,
        readinessScore: i,
        readinessTrend: i % 3 === 0 ? 'improving' : i % 3 === 1 ? 'declining' : 'stable',
        needsAttention: i % 4 === 0,
      })
    );

    const result = computeLifecycleCounts(connections);
    expect(result.totalConnected).toBe(100);
    expect(result.activeLast7d).toBe(50); // odd indices
    expect(result.inactiveLast7d).toBe(50); // even indices

    const readiness = computeReadinessStats(connections);
    expect(readiness.studentsWithScores).toBe(100);
    expect(readiness.avgReadiness).toBe(50); // avg of 0..99 = 49.5, rounded to 50
  });

  it('handles all students in the same state without crashes', () => {
    const connections = Array.from({ length: 10 }, () =>
      makeConnection({
        state: 'pending',
        subscriptionStatus: 'trialing',
        sessionsLast7d: 0,
        readinessScore: null,
        readinessTrend: 'insufficient_data',
        needsAttention: false,
      })
    );

    const result = computeLifecycleCounts(connections);
    expect(result.totalConnected).toBe(0);
    expect(result.pendingRequests).toBe(10);
    expect(result.paidActive).toBe(0);

    const readiness = computeReadinessStats(connections);
    expect(readiness.avgReadiness).toBe(null);
    expect(readiness.studentsWithScores).toBe(0);
  });

  it('handles InviteEventData with future dates', () => {
    const now = new Date('2026-03-06T12:00:00Z');
    const futureDate = new Date('2026-03-10T12:00:00Z').toISOString();

    const events = [
      makeInviteEvent({ eventType: 'token_created', createdAt: futureDate }),
      makeInviteEvent({ eventType: 'claimed', createdAt: futureDate }),
    ];

    const result = computeInviteStats(events, now);
    // Future dates are >= sevenDaysAgo, so they count as recent
    expect(result.totalTokensCreated).toBe(1);
    expect(result.tokensCreated7d).toBe(1);
    expect(result.totalClaims).toBe(1);
    expect(result.claims7d).toBe(1);
    expect(result.conversionRate).toBe(1);
  });

  it('counts state=rejected in disconnected bucket', () => {
    const connections = [
      makeConnection({ state: 'rejected' }),
      makeConnection({ state: 'rejected' }),
      makeConnection({ state: 'disconnected' }),
    ];

    const result = computeLifecycleCounts(connections);
    expect(result.disconnected).toBe(3);
    expect(result.totalConnected).toBe(0);
    expect(result.pendingRequests).toBe(0);
  });
});
