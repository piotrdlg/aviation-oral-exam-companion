import { apiFetch } from './api';
import { runExamOperation } from './exam-operation';

// Opaque server-owned state (W2.1): the client passes these back unchanged; the
// server loads the authoritative copies from exam_sessions.metadata and ignores
// the client's, so we treat them as black boxes.
type Json = Record<string, unknown>;

export interface ExamMessage {
  role: 'examiner' | 'student';
  text: string;
}

export type Score = 'satisfactory' | 'partial' | 'unsatisfactory' | 'ungraded';

export interface Assessment {
  score: Score;
  feedback: string;
  misconceptions?: string[];
  follow_up_needed?: boolean;
  advance?: boolean;
}

/** Unified shape across start / respond / next-task / resume-current responses. */
export interface ExamTurn {
  taskId?: string;
  taskData?: Json;
  examinerMessage?: string;
  elementCode?: string;
  plannerState?: Json;
  examPlan?: Json;
  assessment?: Assessment;
  advance?: boolean;
  sessionComplete?: boolean;
  pausedSessionId?: string;
}

export type StudyMode = 'linear' | 'cross_acs' | 'weak_areas' | 'quick_drill' | 'scenario';
export type Rating = 'private' | 'instrument' | 'commercial' | 'atp';
export type AircraftClass = 'ASEL' | 'AMEL' | 'ASES' | 'AMES';
/** Must match the exam_sessions_difficulty_preference_check DB constraint. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

/**
 * The exam-engine config (camelCase) — the shape `/api/exam` reads from
 * `sessionConfig` (studyMode/difficulty/aircraftClass/...). The DB-facing
 * `/api/session` create endpoint takes snake_case columns instead, so
 * createSession() maps to those at that single boundary. Keep this aligned with
 * `SessionConfig` in src/types/database.ts.
 */
export interface ExamConfig {
  rating: Rating;
  aircraftClass: AircraftClass;
  studyMode: StudyMode;
  difficulty: Difficulty;
  selectedAreas?: string[];
  selectedTasks?: string[];
  examinerProfileKey?: string;
  persona?: string;
}

export interface TranscriptRow {
  role: 'examiner' | 'student';
  text: string;
  exchange_number?: number;
  assessment: Assessment | null;
}

export function restoreTranscript(rows: TranscriptRow[], pending?: string): (ExamMessage & { assessment?: Assessment })[] {
  const messages: (ExamMessage & { assessment?: Assessment })[] = rows.map(({ role, text }) => ({ role, text }));
  rows.forEach((row, index) => {
    if (row.role === 'student' && row.assessment && messages[index + 1]?.role === 'examiner') {
      messages[index + 1].assessment = row.assessment;
    }
  });
  const last = messages.at(-1);
  if (pending?.trim() && !(last?.role === 'examiner' && last.text.trim() === pending.trim())) {
    messages.push({ role: 'examiner', text: pending });
  }
  return messages;
}

/**
 * POST /api/session create → the new exam session (403 trial blocks surface via
 * ApiError). The create endpoint is DB-column shaped (snake_case), so we map the
 * camelCase ExamConfig here — this is the ONLY place the two shapes meet.
 */
export async function createSession(cfg: ExamConfig, isOnboarding = false): Promise<{ id: string }> {
  const res = await apiFetch<{ session: { id: string } }>('/api/session', {
    method: 'POST',
    json: {
      action: 'create',
      rating: cfg.rating,
      aircraft_class: cfg.aircraftClass,
      study_mode: cfg.studyMode,
      difficulty_preference: cfg.difficulty,
      selected_areas: cfg.selectedAreas ?? [],
      selected_tasks: cfg.selectedTasks ?? [],
      // is_onboarding is recomputed + capped (1/user) server-side; the free
      // uncounted onboarding exam requests it, normal exams send false.
      is_onboarding: isOnboarding,
    },
  });
  return res.session;
}

/** start (planner path) → opening question as JSON. The exam engine reads camelCase sessionConfig.
 *  selectedAreas/selectedTasks default to [] — the planner's buildElementQueue reads their
 *  .length, so a missing field would 500 the start (server now guards this too). */
export function startExam(sessionId: string, sessionConfig: ExamConfig): Promise<ExamTurn> {
  return runExamOperation({
      action: 'start',
      sessionId,
      sessionConfig: {
        ...sessionConfig,
        selectedAreas: sessionConfig.selectedAreas ?? [],
        selectedTasks: sessionConfig.selectedTasks ?? [],
      },
      stream: false,
  });
}

/** respond (non-streaming) → examiner feedback + assessment{advance}. */
export function respond(args: {
  sessionId: string;
  studentAnswer: string;
  history: ExamMessage[];
  taskData?: Json;
  plannerState?: Json;
  examPlan?: Json;
  sessionConfig?: ExamConfig;
}): Promise<ExamTurn> {
  return runExamOperation({ action: 'respond', stream: false, chunkedResponse: false, ...args });
}

/** next-task → next element question, or { sessionComplete:true }. */
export function nextTask(args: {
  sessionId: string;
  history?: ExamMessage[];
  taskData?: Json;
  plannerState?: Json;
  examPlan?: Json;
  sessionConfig?: ExamConfig;
}): Promise<ExamTurn> {
  return runExamOperation({ action: 'next-task', ...args });
}

/** resume-current → re-render the pending element question (no LLM). */
export function resumeCurrent(args: {
  sessionId: string;
  plannerState?: Json;
  sessionConfig?: ExamConfig;
}): Promise<ExamTurn> {
  return apiFetch<ExamTurn>('/api/exam', {
    method: 'POST',
    json: { action: 'resume-current', ...args },
  });
}

/** The persisted Q&A transcript for a session (to rebuild history on resume). */
export async function getTranscripts(sessionId: string): Promise<TranscriptRow[]> {
  const res = await apiFetch<{ transcripts: TranscriptRow[] }>(
    `/api/session?action=transcripts&sessionId=${encodeURIComponent(sessionId)}`
  );
  return res.transcripts ?? [];
}
