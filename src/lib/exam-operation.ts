import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface OperationReceipt {
  request_hash: string;
  state: 'pending' | 'completed';
  response_status: number | null;
  response_body: unknown;
}

export interface OperationStore {
  claim(): Promise<boolean>;
  read(): Promise<OperationReceipt | null>;
  complete(status: number, body: unknown): Promise<void>;
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** No lease timeout: an interrupted operation's outcome must never be guessed. */
export async function executeOnce(store: OperationStore, hash: string, run: () => Promise<Response>): Promise<Response> {
  if (!await store.claim()) {
    const receipt = await store.read();
    if (!receipt) return json({ error: 'exam_operation_pending' }, 409);
    if (receipt.request_hash !== hash) return json({ error: 'operation_key_reused' }, 409);
    if (receipt.state !== 'completed') return json({ error: 'exam_operation_pending' }, 409);
    return json(receipt.response_body, receipt.response_status!);
  }
  const response = await run();
  // A server error can follow partial writes. Leave it pending for investigation.
  if (response.status >= 500) return response;
  const body: unknown = await response.clone().json();
  await store.complete(response.status, body);
  return response;
}

export function requestHash(body: unknown) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function operationStore(db: SupabaseClient, userId: string, operationId: string, sessionId: string, action: string, hash: string): OperationStore {
  return {
    async claim() {
      const { error } = await db.from('exam_operation_receipts').insert({
        user_id: userId, operation_id: operationId, session_id: sessionId, action, request_hash: hash,
      });
      if (error && error.code !== '23505') throw new Error('exam_operation_store_unavailable');
      return !error;
    },
    async read() {
      const { data, error } = await db.from('exam_operation_receipts')
        .select('request_hash, state, response_status, response_body').eq('user_id', userId).eq('operation_id', operationId).maybeSingle();
      if (error) throw new Error('exam_operation_store_unavailable');
      return data as OperationReceipt | null;
    },
    async complete(status, body) {
      const { error } = await db.from('exam_operation_receipts').update({ state: 'completed', response_status: status, response_body: body })
        .eq('user_id', userId).eq('operation_id', operationId);
      if (error) throw new Error('exam_operation_store_unavailable');
    },
  };
}
