import { describe, expect, it, vi } from 'vitest';
import { executeOnce, type OperationReceipt, type OperationStore } from '../exam-operation';

function store() {
  let row: OperationReceipt | null = null;
  const adapter: OperationStore = {
    claim: async () => { if (row) return false; row = { request_hash: 'hash', state: 'pending', response_status: null, response_body: null }; return true; },
    read: async () => row,
    complete: async (status, body) => { row = { request_hash: 'hash', state: 'completed', response_status: status, response_body: body }; },
  };
  return adapter;
}

describe('durable exam mutation receipts', () => {
  it.each(['start', 'respond', 'next-task'])('replays %s result without another server action after a lost response', async (action) => {
    const db = store();
    const run = vi.fn(async () => Response.json({ examinerMessage: action, advance: true }));
    await executeOnce(db, 'hash', run); // response lost on the network
    const replay = await executeOnce(db, 'hash', run);
    expect(await replay.json()).toEqual({ examinerMessage: action, advance: true });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('rejects a concurrent duplicate while the first request is still generating', async () => {
    const db = store();
    let finish!: () => void;
    const run = vi.fn(async () => { await new Promise<void>((r) => { finish = r; }); return Response.json({ examinerMessage: 'One question' }); });
    const first = executeOnce(db, 'hash', run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect((await executeOnce(db, 'hash', run)).status).toBe(409);
    finish();
    await first;
    expect(run).toHaveBeenCalledOnce();
  });
  it('does not reuse a key with a changed request', async () => {
    const db = store();
    const run = vi.fn(async () => Response.json({}));
    await executeOnce(db, 'hash', run);
    expect(await (await executeOnce(db, 'different', run)).json()).toEqual({ error: 'operation_key_reused' });
    expect(run).toHaveBeenCalledOnce();
  });
  it('never reclaims an interrupted operation or a partial server failure', async () => {
    const db = store();
    const run = vi.fn(async () => Response.json({ error: 'failed after insert' }, { status: 500 }));
    await executeOnce(db, 'hash', run);
    expect((await executeOnce(db, 'hash', run)).status).toBe(409);
    expect(run).toHaveBeenCalledOnce();
  });
  it('fails closed when persistence is unavailable', async () => {
    const db = store();
    db.claim = async () => { throw new Error('database unavailable'); };
    const run = vi.fn();
    await expect(executeOnce(db, 'hash', run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});
