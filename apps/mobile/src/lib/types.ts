// Response shapes for the v1 mobile API routes (pulled from route source — see
// docs/mobile/01-API-ENABLEMENT-AND-CONTRACT.md Part B).

export type Tier = 'checkride_prep' | 'dpe_live' | 'ground_school';
export type Rating = 'private' | 'commercial' | 'instrument';

export interface TierResponse {
  tier: Tier;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  usage: { sessionsThisMonth: number; ttsCharsThisMonth: number; sttSecondsThisMonth: number };
  preferredRating: Rating;
  preferredAircraftClass: string;
  onboardingCompleted: boolean;
  disclaimerAcknowledged: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  voiceEnabled: boolean;
  preferredVoice: string | null;
  examinerProfile: string | null;
  preferredTheme: string;
}

export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  totalExchanges: number;
  uniqueTasksCovered: number;
}
export interface StatsResponse {
  stats: SessionStats;
}

export interface ResumableSession {
  id: string;
  rating: string;
  study_mode: string;
  status: string;
  exchange_count: number;
  acs_tasks_covered: { task_id: string }[] | null;
  created_at: string;
}
export interface ResumableResponse {
  session: ResumableSession | null;
}
