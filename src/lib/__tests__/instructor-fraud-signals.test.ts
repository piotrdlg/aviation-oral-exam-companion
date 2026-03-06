import { describe, it, expect } from 'vitest';
import {
  computeFraudSignals,
  type FraudKpiInput,
  type FraudInviteInput,
  type FraudConnectionInput,
  type FraudMilestoneInput,
} from '../instructor-fraud-signals';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeKpi(overrides: Partial<FraudKpiInput> = {}): FraudKpiInput {
  return {
    totalConnected: 5,
    paidActive: 2,
    trialing: 1,
    free: 2,
    activeLast7d: 3,
    inactiveLast7d: 2,
    ...overrides,
  };
}

function makeInvite(overrides: Partial<FraudInviteInput> = {}): FraudInviteInput {
  return {
    emailsSent7d: 2,
    tokensCreated7d: 3,
    rateLimitHits7d: 0,
    totalEmailsSent: 10,
    totalTokensCreated: 15,
    totalClaims: 5,
    ...overrides,
  };
}

function makeConnection(overrides: Partial<FraudConnectionInput> = {}): FraudConnectionInput {
  return {
    totalConnections: 10,
    disconnectedCount: 2,
    connectionSources: { referral_link: 5, invite_link: 3, student_search: 2 },
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<FraudMilestoneInput> = {}): FraudMilestoneInput {
  return {
    studentsWithMilestones: 2,
    totalConnected: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Clean instructor (3 tests)
// ---------------------------------------------------------------------------

describe('Clean instructor', () => {
  it('returns low risk and monitor action for normal activity', () => {
    const result = computeFraudSignals(makeKpi(), makeInvite(), makeConnection(), makeMilestone());

    expect(result.riskLevel).toBe('low');
    expect(result.recommendedAction).toBe('monitor');
    expect(result.reasons).toHaveLength(0);
  });

  it('returns low risk when all inputs are zeros', () => {
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 0, paidActive: 0, trialing: 0, free: 0, activeLast7d: 0, inactiveLast7d: 0 }),
      makeInvite({ emailsSent7d: 0, tokensCreated7d: 0, rateLimitHits7d: 0, totalEmailsSent: 0, totalTokensCreated: 0, totalClaims: 0 }),
      makeConnection({ totalConnections: 0, disconnectedCount: 0, connectionSources: {} }),
      makeMilestone({ studentsWithMilestones: 0, totalConnected: 0 }),
    );

    expect(result.riskLevel).toBe('low');
  });

  it('returns risk score of 0 for a clean instructor', () => {
    const result = computeFraudSignals(makeKpi(), makeInvite(), makeConnection(), makeMilestone());

    expect(result.riskScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Individual signals (6 tests)
// ---------------------------------------------------------------------------

describe('Individual signals', () => {
  it('triggers high_invite_low_connect when 50+ invites but < 5 connections', () => {
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite({ totalEmailsSent: 30, totalTokensCreated: 20 }),
      makeConnection({ totalConnections: 3 }),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'high_invite_low_connect');
    expect(signal?.triggered).toBe(true);
    expect(signal?.detail).toContain('50 invites sent but only 3 connections');
  });

  it('triggers rate_limit_abuse when 3+ rate limit hits in 7 days', () => {
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite({ rateLimitHits7d: 3 }),
      makeConnection(),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'rate_limit_abuse');
    expect(signal?.triggered).toBe(true);
    expect(signal?.detail).toContain('3 rate limit hits in 7 days');
  });

  it('triggers burst_invite_activity when 15+ emails sent in 7 days', () => {
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite({ emailsSent7d: 15 }),
      makeConnection(),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'burst_invite_activity');
    expect(signal?.triggered).toBe(true);
    expect(signal?.detail).toContain('Burst:');
  });

  it('triggers high_churn when 50%+ connections disconnected and >= 5 disconnects', () => {
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite(),
      makeConnection({ totalConnections: 10, disconnectedCount: 6 }),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'high_churn');
    expect(signal?.triggered).toBe(true);
    expect(signal?.detail).toContain('6/10 connections disconnected (60%)');
  });

  it('triggers zero_engagement when 5+ connected but 0 active in 7 days', () => {
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 5, activeLast7d: 0 }),
      makeInvite(),
      makeConnection(),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'zero_engagement');
    expect(signal?.triggered).toBe(true);
    expect(signal?.detail).toContain('5 students but 0 active in 7 days');
  });

  it('triggers suspicious_paid_ratio when 3+ connected, 0 paid, 0 trialing', () => {
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 3, paidActive: 0, trialing: 0 }),
      makeInvite(),
      makeConnection(),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'suspicious_paid_ratio');
    expect(signal?.triggered).toBe(true);
    expect(signal?.detail).toContain('3 students, 0 paid, 0 trialing');
  });
});

// ---------------------------------------------------------------------------
// 3. Risk levels (4 tests)
// ---------------------------------------------------------------------------

describe('Risk levels', () => {
  it('remains low when a single low-weight signal triggers (score < 25)', () => {
    // suspicious_paid_ratio has weight 10
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 3, paidActive: 0, trialing: 0 }),
      makeInvite(),
      makeConnection(),
      makeMilestone(),
    );

    expect(result.riskScore).toBe(10);
    expect(result.riskLevel).toBe('low');
  });

  it('returns medium risk when two medium-weight signals trigger (score 25-49)', () => {
    // rate_limit_abuse (20) + suspicious_paid_ratio (10) = 30
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 3, paidActive: 0, trialing: 0 }),
      makeInvite({ rateLimitHits7d: 5 }),
      makeConnection(),
      makeMilestone(),
    );

    expect(result.riskScore).toBe(30);
    expect(result.riskLevel).toBe('medium');
  });

  it('returns high risk when three signals trigger (score >= 50)', () => {
    // high_invite_low_connect (25) + rate_limit_abuse (20) + burst_invite_activity (15) = 60
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite({ totalEmailsSent: 40, totalTokensCreated: 20, rateLimitHits7d: 5, emailsSent7d: 20 }),
      makeConnection({ totalConnections: 3 }),
      makeMilestone(),
    );

    expect(result.riskScore).toBe(60);
    expect(result.riskLevel).toBe('high');
  });

  it('caps risk score at 100 even when all signals trigger', () => {
    // All 6 signals: 25 + 20 + 15 + 20 + 15 + 10 = 105 → capped at 100
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 5, paidActive: 0, trialing: 0, activeLast7d: 0 }),
      makeInvite({ totalEmailsSent: 40, totalTokensCreated: 20, rateLimitHits7d: 5, emailsSent7d: 20 }),
      makeConnection({ totalConnections: 4, disconnectedCount: 5 }),
      makeMilestone(),
    );

    expect(result.riskScore).toBe(100);
    expect(result.riskLevel).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// 4. Recommended actions (4 tests)
// ---------------------------------------------------------------------------

describe('Recommended actions', () => {
  it('recommends monitor for low risk', () => {
    const result = computeFraudSignals(makeKpi(), makeInvite(), makeConnection(), makeMilestone());

    expect(result.recommendedAction).toBe('monitor');
  });

  it('recommends contact for medium risk', () => {
    // rate_limit_abuse (20) + suspicious_paid_ratio (10) = 30 → medium
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 3, paidActive: 0, trialing: 0 }),
      makeInvite({ rateLimitHits7d: 5 }),
      makeConnection(),
      makeMilestone(),
    );

    expect(result.recommendedAction).toBe('contact');
  });

  it('returns suspend_review (not throttle) when high risk has churn plus 3+ signals', () => {
    // With current signal weights, no 2-signal combination can reach the high-risk
    // threshold (>= 50). The throttle branch requires high risk + < 3 signals +
    // churn/rate_limit, which is unreachable. Instead, verify that when churn is
    // present alongside 3+ signals, suspend_review correctly takes priority.
    //
    // high_invite_low_connect (25) + high_churn (20) + zero_engagement (15) = 60
    // totalConnections must be < 5 for high_invite_low_connect AND disconnectedCount >= 5
    // for high_churn. Using totalConnections: 4, disconnectedCount: 5 (logically odd but
    // tests the code path — the function doesn't validate conn consistency).
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 5, activeLast7d: 0 }),
      makeInvite({ totalEmailsSent: 40, totalTokensCreated: 20 }),
      makeConnection({ totalConnections: 4, disconnectedCount: 5 }),
      makeMilestone(),
    );

    expect(result.riskLevel).toBe('high');
    expect(result.riskScore).toBe(60);
    // suspend_review takes priority over throttle when 3+ signals present
    expect(result.recommendedAction).toBe('suspend_review');
    const churnSignal = result.signals.find(s => s.name === 'high_churn');
    expect(churnSignal?.triggered).toBe(true);
  });

  it('recommends suspend_review for high risk with 3+ triggered signals', () => {
    // high_invite_low_connect (25) + rate_limit_abuse (20) + burst_invite_activity (15) = 60
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite({ totalEmailsSent: 40, totalTokensCreated: 20, rateLimitHits7d: 5, emailsSent7d: 20 }),
      makeConnection({ totalConnections: 3 }),
      makeMilestone(),
    );

    expect(result.riskScore).toBe(60);
    expect(result.recommendedAction).toBe('suspend_review');
    expect(result.signals.filter(s => s.triggered)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 5. Signal details (3 tests)
// ---------------------------------------------------------------------------

describe('Signal details', () => {
  it('includes non-empty detail for every triggered signal', () => {
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 5, paidActive: 0, trialing: 0, activeLast7d: 0 }),
      makeInvite({ totalEmailsSent: 40, totalTokensCreated: 20, rateLimitHits7d: 5, emailsSent7d: 20 }),
      makeConnection({ totalConnections: 4, disconnectedCount: 5 }),
      makeMilestone(),
    );

    const triggered = result.signals.filter(s => s.triggered);
    expect(triggered.length).toBeGreaterThan(0);
    for (const signal of triggered) {
      expect(signal.detail).toBeTruthy();
      expect(signal.detail.length).toBeGreaterThan(0);
    }
  });

  it('populates reasons array with details from triggered signals only', () => {
    // Trigger just rate_limit_abuse (20) + suspicious_paid_ratio (10) = 30
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 3, paidActive: 0, trialing: 0 }),
      makeInvite({ rateLimitHits7d: 5 }),
      makeConnection(),
      makeMilestone(),
    );

    const triggeredDetails = result.signals.filter(s => s.triggered).map(s => s.detail);
    expect(result.reasons).toEqual(triggeredDetails);
    expect(result.reasons).toHaveLength(2);
  });

  it('includes descriptive detail for non-triggered signals too', () => {
    const result = computeFraudSignals(makeKpi(), makeInvite(), makeConnection(), makeMilestone());

    const nonTriggered = result.signals.filter(s => !s.triggered);
    expect(nonTriggered.length).toBe(6); // all clean
    for (const signal of nonTriggered) {
      expect(signal.detail).toBeTruthy();
      expect(signal.detail.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases and boundary conditions (4 bonus tests)
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('does not trigger high_churn when disconnected count < 5 even with high ratio', () => {
    // 4/5 = 80% disconnected, but only 4 disconnects (< 5 threshold)
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite(),
      makeConnection({ totalConnections: 5, disconnectedCount: 4 }),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'high_churn');
    expect(signal?.triggered).toBe(false);
  });

  it('does not trigger zero_engagement when fewer than 5 students connected', () => {
    const result = computeFraudSignals(
      makeKpi({ totalConnected: 4, activeLast7d: 0 }),
      makeInvite(),
      makeConnection(),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'zero_engagement');
    expect(signal?.triggered).toBe(false);
  });

  it('triggers burst_invite_activity via tokens threshold (30+) even with low emails', () => {
    const result = computeFraudSignals(
      makeKpi(),
      makeInvite({ emailsSent7d: 1, tokensCreated7d: 30 }),
      makeConnection(),
      makeMilestone(),
    );

    const signal = result.signals.find(s => s.name === 'burst_invite_activity');
    expect(signal?.triggered).toBe(true);
  });

  it('always returns exactly 6 signals regardless of how many are triggered', () => {
    const cleanResult = computeFraudSignals(makeKpi(), makeInvite(), makeConnection(), makeMilestone());
    expect(cleanResult.signals).toHaveLength(6);

    const dirtyResult = computeFraudSignals(
      makeKpi({ totalConnected: 5, paidActive: 0, trialing: 0, activeLast7d: 0 }),
      makeInvite({ totalEmailsSent: 40, totalTokensCreated: 20, rateLimitHits7d: 5, emailsSent7d: 20 }),
      makeConnection({ totalConnections: 4, disconnectedCount: 5 }),
      makeMilestone(),
    );
    expect(dirtyResult.signals).toHaveLength(6);
  });
});
