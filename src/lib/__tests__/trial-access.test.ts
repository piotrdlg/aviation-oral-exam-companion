import { describe, expect, it } from 'vitest';
import { trialStatus } from '../trial-access';
const now = Date.parse('2026-09-11T12:00:00Z');
const fresh = { created_at: '2026-09-10T12:00:00Z', subscription_status: 'active' };
describe('shared session-create and Home trial decision', () => {
  it('shows remaining lifetime non-onboarding slots', () => {
    expect(trialStatus('checkride_prep', fresh, 2, now)).toMatchObject({ examsUsed: 2, examsRemaining: 1, canStart: true });
  });
  it('checks count before expiry and churn', () => {
    expect(trialStatus('checkride_prep', { created_at: '2026-01-01', has_trialed: true }, 3, now)?.reason).toBe('trial_limit_reached');
  });
  it('does not offer unused slots after day seven', () => {
    expect(trialStatus('checkride_prep', { created_at: '2026-09-01' }, 1, now)).toMatchObject({ examsRemaining: 0, reason: 'trial_expired' });
  });
  it('keeps the exact existing expiry boundary', () => {
    const profile = { created_at: new Date(now - 7 * 86400000).toISOString() };
    expect(trialStatus('checkride_prep', profile, 0, now)?.canStart).toBe(true);
    expect(trialStatus('checkride_prep', profile, 0, now + 1)?.reason).toBe('trial_expired');
  });
  it('hides the trial for paid and tester-resolved tiers', () => {
    expect(trialStatus('dpe_live', fresh, 100, now)).toBeNull();
  });
  it('honors live paid access over a stale cache even after three old trial exams', () => {
    expect(trialStatus('checkride_prep', { ...fresh, stripe_subscription_id: 'sub_test' }, 3, now)).toBeNull();
  });
  it.each(['canceled', 'unpaid', 'past_due'])('blocks churned %s users', (subscription_status) => {
    expect(trialStatus('checkride_prep', { ...fresh, subscription_status }, 0, now)?.reason).toBe('resubscribe_required');
  });
  it('does not treat a default active status as paid or churned', () => {
    expect(trialStatus('checkride_prep', fresh, 0, now)?.canStart).toBe(true);
  });
  it('retains the count cap when signup date is missing', () => {
    expect(trialStatus('checkride_prep', null, 0, now)).toMatchObject({ expiresAt: null, canStart: true });
  });
});
