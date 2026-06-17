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
