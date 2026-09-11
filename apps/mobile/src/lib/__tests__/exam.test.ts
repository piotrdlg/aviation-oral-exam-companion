import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { createSession, restoreTranscript, startExam, type ExamConfig, type TranscriptRow } from '../exam';
import { planLabel } from '../endpoints';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));
const cfg: ExamConfig = { rating: 'private', studyMode: 'linear', difficulty: 'mixed', aircraftClass: 'ASEL' };
beforeEach(() => vi.mocked(apiFetch).mockResolvedValue({ session: { id: 'session' } }));

describe('exam route contract', () => {
  it('maps camelCase config to snake_case create fields', async () => {
    await expect(createSession(cfg)).resolves.toEqual({ id: 'session' });
    expect(apiFetch).toHaveBeenCalledWith('/api/session', expect.objectContaining({ json: {
      action: 'create', rating: 'private', aircraft_class: 'ASEL', study_mode: 'linear',
      difficulty_preference: 'mixed', selected_areas: [], selected_tasks: [], is_onboarding: false,
    } }));
  });
  it('explicitly requests the uncounted onboarding session', async () => {
    await createSession(cfg, true);
    expect(apiFetch).toHaveBeenCalledWith('/api/session', expect.objectContaining({ json: expect.objectContaining({ is_onboarding: true }) }));
  });
  it('defaults selection arrays on start without mutating caller config', async () => {
    await startExam('id', cfg);
    expect(apiFetch).toHaveBeenCalledWith('/api/exam', expect.objectContaining({ json: expect.objectContaining({ sessionConfig: { ...cfg, selectedAreas: [], selectedTasks: [] } }) }));
    expect(cfg.selectedAreas).toBeUndefined();
  });
  it('restores score badges to examiner feedback', () => {
    const assessment = { score: 'partial' as const, feedback: 'More detail' };
    const rows: TranscriptRow[] = [
      { role: 'student', text: 'Answer', exchange_number: 1, assessment },
      { role: 'examiner', text: 'Feedback', exchange_number: 1, assessment: null },
    ];
    expect(restoreTranscript(rows)[1].assessment).toEqual(assessment);
    expect(rows[1].assessment).toBeNull();
  });
  it('appends an absent pending question', () => { expect(restoreTranscript([], 'Pending')).toEqual([{ role: 'examiner', text: 'Pending' }]); });
  it('does not duplicate the pending examiner question', () => {
    expect(restoreTranscript([{ role: 'examiner', text: 'Pending', exchange_number: 1, assessment: null }], 'Pending')).toHaveLength(1);
  });
  it.each([['ground_school', false, 'Trial'], ['checkride_prep', false, 'Trial'], ['dpe_live', false, 'Paid'], ['checkride_prep', true, 'Tester']])('labels %s override=%s as %s', (tier, override, label) => {
    expect(planLabel(tier as string, override as boolean)).toBe(label);
  });
});
