import { apiFetch } from './api';
import type { ResumableResponse, StatsResponse, TierResponse } from './types';

/** Tier, trial/subscription status, monthly usage, and prefs. */
export const getTier = () => apiFetch<TierResponse>('/api/user/tier');

/** Lifetime session stats for a rating (exams, exchanges, ACS tasks covered). */
export const getStats = (rating: string) =>
  apiFetch<StatsResponse>(`/api/session?action=stats&rating=${encodeURIComponent(rating)}`);

/** The most recent resumable (paused/in-progress) exam, or null. */
export const getResumable = () => apiFetch<ResumableResponse>('/api/session?action=get-resumable');
