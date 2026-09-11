import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { ApiError, apiFetch } from './api';
import type { ExamTurn } from './exam';

interface Pending { key: string; action: string }
const storageKey = (id: string) => `heydpe_pending_operation_${id}`;

export async function pendingExamOperation(sessionId: string): Promise<Pending | null> {
  const value = await AsyncStorage.getItem(storageKey(sessionId));
  return value ? JSON.parse(value) as Pending : null;
}

/** Persist only an opaque receipt key + action, never an answer or transcript. */
export async function runExamOperation(body: { sessionId: string; action: string; [key: string]: unknown }): Promise<ExamTurn> {
  if (await pendingExamOperation(body.sessionId)) throw new Error('Check saved progress before continuing this exam.');
  const key = randomUUID();
  await AsyncStorage.setItem(storageKey(body.sessionId), JSON.stringify({ key, action: body.action }));
  try {
    const turn = await apiFetch<ExamTurn>('/api/exam', {
      method: 'POST', timeoutMs: 70_000, headers: { 'Idempotency-Key': key }, json: body,
    });
    await AsyncStorage.removeItem(storageKey(body.sessionId));
    return turn;
  } catch (error) {
    // Explicit validation/paywall failures have a definitive outcome; timeouts,
    // 5xx and in-flight conflicts retain the durable key across app restarts.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 409) {
      await AsyncStorage.removeItem(storageKey(body.sessionId));
    }
    throw error;
  }
}

export async function recoverExamOperation(sessionId: string): Promise<{ action: string; turn: ExamTurn; acknowledge(): Promise<void> } | null> {
  const pending = await pendingExamOperation(sessionId);
  if (!pending) return null;
  const { receipt } = await apiFetch<{ receipt: null | { state: string; action: string; response_status: number; response_body: ExamTurn & { error?: string } } }>(
    `/api/exam/operation?sessionId=${encodeURIComponent(sessionId)}&operationId=${encodeURIComponent(pending.key)}`,
  );
  if (!receipt || receipt.state !== 'completed') {
    throw new Error('The examiner’s result is not confirmed yet. Check saved progress again shortly. Your answer will not be sent twice.');
  }
  const acknowledge = async () => {
    if ((await pendingExamOperation(sessionId))?.key === pending.key) await AsyncStorage.removeItem(storageKey(sessionId));
  };
  if (receipt.response_status >= 400) {
    await acknowledge();
    throw new ApiError(receipt.response_status, receipt.response_body.error, receipt.response_body.error ?? 'Exam request failed');
  }
  // Keep the key until the caller has restored its supporting session data.
  return { action: receipt.action, turn: receipt.response_body, acknowledge };
}
