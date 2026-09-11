import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '../api';
import { pendingExamOperation, recoverExamOperation, runExamOperation } from '../exam-operation';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { values.delete(key); }),
} }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-1111-1111-111111111111' }));
vi.mock('../api', () => ({ apiFetch: vi.fn(), ApiError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } } }));
beforeEach(() => { values.clear(); vi.mocked(apiFetch).mockReset(); });

describe('mobile timeout recovery', () => {
  it.each(['start', 'respond', 'next-task'])('recovers %s by reading its receipt, never reissuing the mutation', async (action) => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(0, 'timeout', 'timeout'));
    await expect(runExamOperation({ sessionId: 'session', action, studentAnswer: 'private answer' })).rejects.toThrow('timeout');
    expect(JSON.stringify([...values])).not.toContain('private answer');
    vi.mocked(apiFetch).mockResolvedValueOnce({ receipt: { action, state: 'completed', response_status: 200, response_body: { examinerMessage: 'Original question' } } });
    const recovered = await recoverExamOperation('session');
    expect(recovered).toMatchObject({ action, turn: { examinerMessage: 'Original question' } });
    // A subsequent transcript/resume fetch may fail: retain the key until restored.
    expect(await pendingExamOperation('session')).not.toBeNull();
    await recovered?.acknowledge();
    expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(await pendingExamOperation('session')).toBeNull();
  });
  it('retains an in-flight key across another check and prevents a new mutation', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(0, 'timeout', 'timeout'));
    await expect(runExamOperation({ sessionId: 'session', action: 'next-task' })).rejects.toThrow();
    vi.mocked(apiFetch).mockResolvedValue({ receipt: { state: 'pending' } });
    await expect(recoverExamOperation('session')).rejects.toThrow('not confirmed');
    await expect(runExamOperation({ sessionId: 'session', action: 'next-task' })).rejects.toThrow('Check saved');
    expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('does not guess when no receipt is visible yet', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(0, 'timeout', 'timeout'));
    await expect(runExamOperation({ sessionId: 'session', action: 'start' })).rejects.toThrow();
    vi.mocked(apiFetch).mockResolvedValue({ receipt: null });
    await expect(recoverExamOperation('session')).rejects.toThrow('not confirmed');
    expect(await pendingExamOperation('session')).not.toBeNull();
  });
  it('allows another attempt after a definitive trial rejection', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(403, 'trial_expired', 'trial_expired'));
    await expect(runExamOperation({ sessionId: 'session', action: 'respond' })).rejects.toThrow();
    expect(await pendingExamOperation('session')).toBeNull();
  });
});
