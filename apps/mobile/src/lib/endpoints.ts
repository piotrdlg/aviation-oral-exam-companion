import { apiFetch } from './api';
import type {
  ConsentKind,
  ElementScoresResponse,
  OnboardingPrefs,
  ResumableResponse,
  SessionsResponse,
  StatsResponse,
  SttTokenResponse,
  TierResponse,
} from './types';

/** Tier, trial/subscription status, monthly usage, and prefs. */
export const getTier = () => apiFetch<TierResponse>('/api/user/tier');

/** Lifetime session stats for a rating (exams, exchanges, ACS tasks covered). */
export const getStats = (rating: string) =>
  apiFetch<StatsResponse>(`/api/session?action=stats&rating=${encodeURIComponent(rating)}`);

/** The most recent resumable (paused/in-progress) exam, or null. */
export const getResumable = () => apiFetch<ResumableResponse>('/api/session?action=get-resumable');

/** Lifetime per-element scores for a rating (drives ACS coverage). */
export const getElementScores = (rating: string) =>
  apiFetch<ElementScoresResponse>(
    `/api/session?action=element-scores&rating=${encodeURIComponent(rating)}`
  );

/** Recent sessions (most recent first). */
export const getSessions = () => apiFetch<SessionsResponse>('/api/session');

/** Short-lived Deepgram token + listen URL for native raw-PCM16 STT (linear16@16000). */
export const getSttToken = (signal?: AbortSignal) =>
  apiFetch<SttTokenResponse>('/api/stt/token?encoding=linear16&sample_rate=16000', { signal });

/** Reactivate a paused session so /api/exam respond/next-task (which require
 *  status 'active') don't 409 on the first answer after a resume. */
export const reactivateSession = (sessionId: string) =>
  apiFetch<{ session?: unknown }>('/api/session', {
    method: 'POST',
    json: { action: 'update', sessionId, status: 'active' },
  });

/** Finish + grade an in-progress exam (returns to the completion screen). */
export const completeSession = (sessionId: string) =>
  apiFetch<{ session?: unknown }>('/api/session', {
    method: 'POST',
    json: { action: 'update', sessionId, status: 'completed' },
  });

/** Permanently delete the account + all data (type-to-confirm guarded server-side). */
export const deleteAccount = () =>
  apiFetch<{ deleted: boolean }>('/api/user/delete', {
    method: 'POST',
    json: { confirm: 'DELETE' },
  });

/** Persist account preferences; callers must handle failure before continuing. */
export const updateTier = (prefs: Partial<OnboardingPrefs>) =>
  apiFetch<{ ok: boolean }>('/api/user/tier', { method: 'POST', json: prefs });

/** Skip onboarding: marks it complete only (no prefs) → lands on Practice config. */
export const skipOnboarding = () =>
  apiFetch<{ ok: boolean }>('/api/user/tier', {
    method: 'POST',
    json: { onboardingCompleted: true },
  });

/** Record a consent server-side. 'disclaimer' also stamps disclaimer_acknowledged_at;
 *  'ai_data_processing' writes a consent_records row only. `choices` is required. */
export const recordConsent = (kind: ConsentKind, choices: Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>('/api/consent', { method: 'POST', json: { kind, choices } });

/** Display-only plan label (the stored enum + every gate is unchanged — decision D5). */
export function planLabel(tier: string, hasPaidOverride = false): string {
  if (hasPaidOverride) return 'Tester';
  if (tier === 'dpe_live') return 'Paid';
  return 'Trial';
}
