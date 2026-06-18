import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Consent route — the kind allow-list (W6.5 + native onboarding). The native
 * onboarding records a separate 'ai_data_processing' consent (Apple 5.1.1/5.1.2);
 * the route must persist it with that exact kind (NOT coerce it to cookie) and
 * must NOT stamp disclaimer_acknowledged_at for it — only 'disclaimer' stamps.
 */
const mocks = vi.hoisted(() => ({
  getAuthedUser: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/auth', () => ({
  getAuthedUser: mocks.getAuthedUser,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.from })),
}));

import { POST } from '@/app/api/consent/route';

function req(body: unknown) {
  return new NextRequest('https://app.test/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedUser.mockResolvedValue({ user: { id: 'u1' } });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  // from('consent_records') → { insert }; from('user_profiles') → { update }
  mocks.from.mockImplementation((table: string) =>
    table === 'consent_records' ? { insert: mocks.insert } : { update: mocks.update }
  );
});

describe('POST /api/consent — kind allow-list', () => {
  it('401s when unauthenticated', async () => {
    mocks.getAuthedUser.mockResolvedValue(null);
    const res = await POST(req({ kind: 'ai_data_processing', choices: { third_party_ai_v1: true } }));
    expect(res.status).toBe(401);
  });

  it('400s when choices is missing', async () => {
    const res = await POST(req({ kind: 'ai_data_processing' }));
    expect(res.status).toBe(400);
  });

  it('persists ai_data_processing with that exact kind (not coerced) and does NOT stamp the disclaimer', async () => {
    const res = await POST(req({ kind: 'ai_data_processing', choices: { third_party_ai_v1: true } }));
    expect(res.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', kind: 'ai_data_processing', choices: { third_party_ai_v1: true } })
    );
    // ai_data_processing writes a row only — never touches user_profiles
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('stamps disclaimer_acknowledged_at only for kind disclaimer', async () => {
    const res = await POST(req({ kind: 'disclaimer', choices: { faa_disclaimer_v1: true } }));
    expect(res.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'disclaimer' }));
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ disclaimer_acknowledged_at: expect.any(String) })
    );
  });

  it('coerces an unknown kind to cookie (least-privileged), never to disclaimer', async () => {
    const res = await POST(req({ kind: 'totally_unknown', choices: { x: 1 } }));
    expect(res.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cookie' }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
