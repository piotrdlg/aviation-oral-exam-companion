import type { TrialStatus } from './types';

export function describeTrial(trial: TrialStatus | null | undefined, elapsedMs = 0) {
  if (!trial) return { title: 'Trial status unavailable', detail: 'Refresh to check your remaining exams and trial window.' };
  const remainingMs = trial.expiresAt ? Date.parse(trial.expiresAt) - Date.parse(trial.serverNow) - elapsedMs : null;
  const expired = remainingMs !== null && remainingMs < 0;
  const used = `${trial.examsUsed} of ${trial.examLimit} trial exams used`;
  if (trial.reason === 'resubscribe_required') return { title: 'Subscription needed', detail: used };
  if (expired || trial.reason === 'trial_expired') return { title: 'Your 7-day trial ended', detail: used };
  if (!trial.canStart) return { title: 'Trial exams used up', detail: used };
  const time = remainingMs === null ? 'Trial end date unavailable'
    : remainingMs < 3600000 ? 'Less than 1 hour left'
      : remainingMs < 86400000 ? `${Math.ceil(remainingMs / 3600000)} hours left`
        : `${Math.ceil(remainingMs / 86400000)} days left`;
  return { title: `${trial.examsRemaining} of ${trial.examLimit} trial exams left`, detail: `${time} · Ends after 3 exams or 7 days, whichever comes first.` };
}
