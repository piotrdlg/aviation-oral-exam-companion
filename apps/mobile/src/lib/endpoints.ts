import { apiFetch } from './api';
import type {
  ElementScoresResponse,
  ResumableResponse,
  SessionsResponse,
  StatsResponse,
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

/** Display-only plan label (the stored enum + every gate is unchanged — decision D5). */
export function planLabel(tier: string): string {
  if (tier === 'dpe_live') return 'Paid';
  if (tier === 'ground_school') return 'Tester';
  return 'Trial';
}
