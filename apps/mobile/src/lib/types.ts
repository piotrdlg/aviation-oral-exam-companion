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

export type AssessmentScore = 'satisfactory' | 'partial' | 'unsatisfactory' | 'ungraded';

/** A row from get_element_scores — lifetime per-element performance for a rating. */
export interface ElementScore {
  element_code: string;
  task_id: string;
  area: string; // full area name, e.g. "Preflight Preparation"
  element_type: string;
  total_attempts: number;
  satisfactory_count: number;
  partial_count: number;
  unsatisfactory_count: number;
  latest_score: AssessmentScore | null;
  latest_attempt_at: string | null;
}
export interface ElementScoresResponse {
  scores: ElementScore[];
}

/** A row from the default GET /api/session list (recent sessions). */
export interface SessionRow {
  id: string;
  rating: string;
  study_mode: string;
  status: string;
  exchange_count: number;
  started_at: string;
  ended_at: string | null;
  result: { grade?: string } | null;
}
export interface SessionsResponse {
  sessions: SessionRow[];
}
