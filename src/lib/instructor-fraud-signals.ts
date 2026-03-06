// src/lib/instructor-fraud-signals.ts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';
export type RecommendedAction = 'monitor' | 'contact' | 'throttle' | 'suspend_review';

export interface FraudSignalResult {
  riskLevel: RiskLevel;
  riskScore: number; // 0-100
  reasons: string[];
  recommendedAction: RecommendedAction;
  signals: FraudSignal[];
}

export interface FraudSignal {
  name: string;
  triggered: boolean;
  weight: number;
  detail: string;
}

// Input types

export interface FraudKpiInput {
  totalConnected: number;
  paidActive: number;
  trialing: number;
  free: number;
  activeLast7d: number;
  inactiveLast7d: number;
}

export interface FraudInviteInput {
  emailsSent7d: number;
  tokensCreated7d: number;
  rateLimitHits7d: number;
  totalEmailsSent: number;
  totalTokensCreated: number;
  totalClaims: number;
}

export interface FraudConnectionInput {
  totalConnections: number; // all-time (including disconnected)
  disconnectedCount: number;
  connectionSources: Record<string, number>; // e.g. { referral_link: 5, invite_link: 3 }
}

export interface FraudMilestoneInput {
  studentsWithMilestones: number;
  totalConnected: number;
}

// ---------------------------------------------------------------------------
// Signal definitions
// ---------------------------------------------------------------------------

/**
 * Signal 1: High invite volume relative to connections
 * Triggered when sent 50+ invites but < 5 connections
 */
function checkHighInviteLowConnect(invite: FraudInviteInput, conn: FraudConnectionInput): FraudSignal {
  const totalSent = invite.totalEmailsSent + invite.totalTokensCreated;
  const triggered = totalSent >= 50 && conn.totalConnections < 5;
  return {
    name: 'high_invite_low_connect',
    triggered,
    weight: 25,
    detail: triggered
      ? `${totalSent} invites sent but only ${conn.totalConnections} connections`
      : `${totalSent} invites, ${conn.totalConnections} connections — ratio acceptable`,
  };
}

/**
 * Signal 2: Rate limit abuse
 * Triggered when hit rate limits 3+ times in 7 days
 */
function checkRateLimitAbuse(invite: FraudInviteInput): FraudSignal {
  const triggered = invite.rateLimitHits7d >= 3;
  return {
    name: 'rate_limit_abuse',
    triggered,
    weight: 20,
    detail: triggered
      ? `${invite.rateLimitHits7d} rate limit hits in 7 days`
      : `${invite.rateLimitHits7d} rate limit hits — within norms`,
  };
}

/**
 * Signal 3: Burst invite activity
 * Triggered when 15+ emails OR 30+ tokens created in a single 7-day window
 */
function checkBurstActivity(invite: FraudInviteInput): FraudSignal {
  const triggered = invite.emailsSent7d >= 15 || invite.tokensCreated7d >= 30;
  return {
    name: 'burst_invite_activity',
    triggered,
    weight: 15,
    detail: triggered
      ? `Burst: ${invite.emailsSent7d} emails + ${invite.tokensCreated7d} tokens in 7d`
      : `${invite.emailsSent7d} emails + ${invite.tokensCreated7d} tokens in 7d — normal`,
  };
}

/**
 * Signal 4: High churn (many disconnections)
 * Triggered when 50%+ of all-time connections are disconnected AND >= 5 disconnects
 */
function checkHighChurn(conn: FraudConnectionInput): FraudSignal {
  const churnRate = conn.totalConnections > 0 ? conn.disconnectedCount / conn.totalConnections : 0;
  const triggered = churnRate >= 0.5 && conn.disconnectedCount >= 5;
  return {
    name: 'high_churn',
    triggered,
    weight: 20,
    detail: triggered
      ? `${conn.disconnectedCount}/${conn.totalConnections} connections disconnected (${Math.round(churnRate * 100)}%)`
      : `${conn.disconnectedCount}/${conn.totalConnections} disconnected — acceptable`,
  };
}

/**
 * Signal 5: Zero student engagement
 * Triggered when instructor has 5+ connected students but 0 active in last 7 days
 */
function checkZeroEngagement(kpi: FraudKpiInput): FraudSignal {
  const triggered = kpi.totalConnected >= 5 && kpi.activeLast7d === 0;
  return {
    name: 'zero_engagement',
    triggered,
    weight: 15,
    detail: triggered
      ? `${kpi.totalConnected} students but 0 active in 7 days`
      : `${kpi.activeLast7d}/${kpi.totalConnected} active — engagement present`,
  };
}

/**
 * Signal 6: Suspicious paid ratio
 * Triggered when 0 paid students but instructor has courtesy access somehow
 * (would indicate override abuse or data inconsistency)
 */
function checkSuspiciousPaidRatio(kpi: FraudKpiInput): FraudSignal {
  const triggered = kpi.paidActive === 0 && kpi.totalConnected >= 3 && kpi.trialing === 0;
  return {
    name: 'suspicious_paid_ratio',
    triggered,
    weight: 10,
    detail: triggered
      ? `${kpi.totalConnected} students, 0 paid, 0 trialing — possible free-rider`
      : `${kpi.paidActive} paid, ${kpi.trialing} trialing — normal distribution`,
  };
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute fraud signals for an instructor.
 * Pure function — no DB calls, no side effects.
 *
 * Risk levels:
 * - low: riskScore < 25
 * - medium: riskScore 25-49
 * - high: riskScore >= 50
 *
 * Recommended actions:
 * - low → 'monitor'
 * - medium → 'contact'
 * - high with churn or rate limit → 'throttle'
 * - high with 3+ signals → 'suspend_review'
 */
export function computeFraudSignals(
  kpi: FraudKpiInput,
  invite: FraudInviteInput,
  connection: FraudConnectionInput,
  milestone: FraudMilestoneInput,
): FraudSignalResult {
  // Suppress milestone unused warning — reserved for future signals
  void milestone;

  const signals: FraudSignal[] = [
    checkHighInviteLowConnect(invite, connection),
    checkRateLimitAbuse(invite),
    checkBurstActivity(invite),
    checkHighChurn(connection),
    checkZeroEngagement(kpi),
    checkSuspiciousPaidRatio(kpi),
  ];

  const triggeredSignals = signals.filter(s => s.triggered);
  const riskScore = Math.min(100, triggeredSignals.reduce((sum, s) => sum + s.weight, 0));
  const reasons = triggeredSignals.map(s => s.detail);

  let riskLevel: RiskLevel;
  if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 25) riskLevel = 'medium';
  else riskLevel = 'low';

  let recommendedAction: RecommendedAction;
  if (riskLevel === 'low') {
    recommendedAction = 'monitor';
  } else if (riskLevel === 'medium') {
    recommendedAction = 'contact';
  } else {
    // high risk
    const hasChurnOrRateLimit = triggeredSignals.some(
      s => s.name === 'high_churn' || s.name === 'rate_limit_abuse'
    );
    if (triggeredSignals.length >= 3) {
      recommendedAction = 'suspend_review';
    } else if (hasChurnOrRateLimit) {
      recommendedAction = 'throttle';
    } else {
      recommendedAction = 'throttle';
    }
  }

  return {
    riskLevel,
    riskScore,
    reasons,
    recommendedAction,
    signals,
  };
}
