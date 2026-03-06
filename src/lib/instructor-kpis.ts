// src/lib/instructor-kpis.ts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstructorStudentLifecycleCounts {
  /** Total connected students (state='connected') */
  totalConnected: number;
  /** Students with >= 1 session in last 7 days */
  activeLast7d: number;
  /** Connected students with 0 sessions in last 7 days */
  inactiveLast7d: number;
  /** Students with subscription_status='active' */
  paidActive: number;
  /** Students with subscription_status='trialing' */
  trialing: number;
  /** Students with no paid status (free/null) */
  free: number;
  /** Pending connection requests */
  pendingRequests: number;
  /** Disconnected connections (historical) */
  disconnected: number;
}

export interface InstructorInviteStats {
  /** Total invite tokens created (all time) */
  totalTokensCreated: number;
  /** Tokens created in last 7 days */
  tokensCreated7d: number;
  /** Total emails sent (all time) */
  totalEmailsSent: number;
  /** Emails sent in last 7 days */
  emailsSent7d: number;
  /** Total claims (all time) */
  totalClaims: number;
  /** Claims in last 7 days */
  claims7d: number;
  /** Rate limit hits in last 7 days */
  rateLimitHits7d: number;
  /** Invite-to-claim conversion rate (0-1, null if no invites) */
  conversionRate: number | null;
}

export interface InstructorReadinessStats {
  /** Average readiness score across connected students (0-100, null if none) */
  avgReadiness: number | null;
  /** Number of students with readiness score available */
  studentsWithScores: number;
  /** Students needing attention (readiness < 60 or no activity 7d+) */
  studentsNeedingAttention: number;
  /** Students with improving trend */
  improvingCount: number;
  /** Students with declining trend */
  decliningCount: number;
}

export interface InstructorMilestoneStats {
  /** Students who completed knowledge_test_passed */
  knowledgeTestPassed: number;
  /** Students who completed mock_oral_completed */
  mockOralCompleted: number;
  /** Students who completed checkride_scheduled */
  checkrideScheduled: number;
  /** Students who completed oral_passed */
  oralPassed: number;
}

export interface InstructorEntitlementStats {
  /** Whether instructor currently has courtesy access */
  hasCourtesyAccess: boolean;
  /** Reason for courtesy access */
  courtesyReason: string;
  /** Number of paid students contributing to courtesy */
  paidStudentCount: number;
  /** Whether a direct admin override is active */
  hasDirectOverride: boolean;
}

export interface InstructorKpiV1 {
  version: 1;
  instructorUserId: string;
  computedAt: string; // ISO timestamp
  lifecycle: InstructorStudentLifecycleCounts;
  invites: InstructorInviteStats;
  readiness: InstructorReadinessStats;
  milestones: InstructorMilestoneStats;
  entitlements: InstructorEntitlementStats;
}

// ---------------------------------------------------------------------------
// Input types (data passed from DB fetchers)
// ---------------------------------------------------------------------------

export interface StudentConnectionData {
  studentUserId: string;
  state: string; // 'connected' | 'pending' | 'disconnected' | etc
  subscriptionStatus: string | null; // 'active' | 'trialing' | 'free' | null
  sessionsLast7d: number;
  readinessScore: number | null; // 0-100
  readinessTrend: string; // 'improving' | 'declining' | 'stable' | 'insufficient_data'
  needsAttention: boolean;
}

export interface MilestoneData {
  studentUserId: string;
  milestoneKey: string;
  status: string; // 'completed' | 'not_set' | etc
}

export interface InviteEventData {
  eventType: string; // 'token_created' | 'email_sent' | 'claimed' | 'rate_limited'
  createdAt: string; // ISO
}

export interface EntitlementData {
  hasCourtesyAccess: boolean;
  courtesyReason: string;
  paidStudentCount: number;
  hasDirectOverride: boolean;
}

// ---------------------------------------------------------------------------
// Pure computation functions
// ---------------------------------------------------------------------------

/**
 * Compute student lifecycle counts from connection data.
 *
 * Definitions:
 * - "active student last 7d": connected student with sessionsLast7d >= 1
 * - "inactive student": connected student with sessionsLast7d === 0
 */
export function computeLifecycleCounts(
  connections: StudentConnectionData[]
): InstructorStudentLifecycleCounts {
  const connected = connections.filter(c => c.state === 'connected');
  const pending = connections.filter(c => c.state === 'pending' || c.state === 'invited');
  const disconnected = connections.filter(c => c.state === 'disconnected' || c.state === 'rejected');

  return {
    totalConnected: connected.length,
    activeLast7d: connected.filter(c => c.sessionsLast7d >= 1).length,
    inactiveLast7d: connected.filter(c => c.sessionsLast7d === 0).length,
    paidActive: connected.filter(c => c.subscriptionStatus === 'active').length,
    trialing: connected.filter(c => c.subscriptionStatus === 'trialing').length,
    free: connected.filter(c => !c.subscriptionStatus || c.subscriptionStatus === 'free' || (c.subscriptionStatus !== 'active' && c.subscriptionStatus !== 'trialing')).length,
    pendingRequests: pending.length,
    disconnected: disconnected.length,
  };
}

/**
 * Compute invite stats from event data.
 */
export function computeInviteStats(
  events: InviteEventData[],
  now?: Date
): InstructorInviteStats {
  const currentTime = now ?? new Date();
  const sevenDaysAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  const isRecent = (e: InviteEventData) => new Date(e.createdAt) >= sevenDaysAgo;

  const totalTokensCreated = events.filter(e => e.eventType === 'token_created').length;
  const tokensCreated7d = events.filter(e => e.eventType === 'token_created' && isRecent(e)).length;
  const totalEmailsSent = events.filter(e => e.eventType === 'email_sent').length;
  const emailsSent7d = events.filter(e => e.eventType === 'email_sent' && isRecent(e)).length;
  const totalClaims = events.filter(e => e.eventType === 'claimed').length;
  const claims7d = events.filter(e => e.eventType === 'claimed' && isRecent(e)).length;
  const rateLimitHits7d = events.filter(e => e.eventType === 'rate_limited' && isRecent(e)).length;

  const totalInvites = totalTokensCreated + totalEmailsSent;
  const conversionRate = totalInvites > 0 ? totalClaims / totalInvites : null;

  return {
    totalTokensCreated,
    tokensCreated7d,
    totalEmailsSent,
    emailsSent7d,
    totalClaims,
    claims7d,
    rateLimitHits7d,
    conversionRate,
  };
}

/**
 * Compute readiness stats from connection data.
 *
 * Readiness scoring source: exam session metadata.examResultV2.overall_score,
 * computed by src/lib/instructor-insights.ts:computeReadiness()
 */
export function computeReadinessStats(
  connections: StudentConnectionData[]
): InstructorReadinessStats {
  const connected = connections.filter(c => c.state === 'connected');
  const withScores = connected.filter(c => c.readinessScore !== null);

  const avgReadiness = withScores.length > 0
    ? Math.round(withScores.reduce((sum, c) => sum + c.readinessScore!, 0) / withScores.length)
    : null;

  return {
    avgReadiness,
    studentsWithScores: withScores.length,
    studentsNeedingAttention: connected.filter(c => c.needsAttention).length,
    improvingCount: connected.filter(c => c.readinessTrend === 'improving').length,
    decliningCount: connected.filter(c => c.readinessTrend === 'declining').length,
  };
}

/**
 * Compute milestone stats from milestone data.
 */
export function computeMilestoneStats(
  milestones: MilestoneData[]
): InstructorMilestoneStats {
  const completed = (key: string) =>
    milestones.filter(m => m.milestoneKey === key && m.status === 'completed').length;

  return {
    knowledgeTestPassed: completed('knowledge_test_passed'),
    mockOralCompleted: completed('mock_oral_completed'),
    checkrideScheduled: completed('checkride_scheduled'),
    oralPassed: completed('oral_passed'),
  };
}

/**
 * Compute entitlement stats from entitlement data.
 */
export function computeEntitlementStats(
  entitlement: EntitlementData
): InstructorEntitlementStats {
  return {
    hasCourtesyAccess: entitlement.hasCourtesyAccess,
    courtesyReason: entitlement.courtesyReason,
    paidStudentCount: entitlement.paidStudentCount,
    hasDirectOverride: entitlement.hasDirectOverride,
  };
}

/**
 * Orchestrator: compute the full InstructorKpiV1 from all input data.
 * All computation is pure — no DB calls.
 */
export function computeInstructorKpis(
  instructorUserId: string,
  connections: StudentConnectionData[],
  inviteEvents: InviteEventData[],
  milestones: MilestoneData[],
  entitlement: EntitlementData,
  now?: Date
): InstructorKpiV1 {
  const currentTime = now ?? new Date();

  return {
    version: 1,
    instructorUserId,
    computedAt: currentTime.toISOString(),
    lifecycle: computeLifecycleCounts(connections),
    invites: computeInviteStats(inviteEvents, currentTime),
    readiness: computeReadinessStats(connections),
    milestones: computeMilestoneStats(milestones),
    entitlements: computeEntitlementStats(entitlement),
  };
}
