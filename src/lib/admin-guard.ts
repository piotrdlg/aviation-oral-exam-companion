import 'server-only'; // Prevents accidental client-side import
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class AdminAuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

// For route handlers (have NextRequest):
export async function requireAdmin(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new AdminAuthError('Not authenticated', 401);
  }

  const { data: adminRow } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle(); // Returns null (not error) when user is not admin

  if (!adminRow) {
    throw new AdminAuthError('Not authorized as admin', 403);
  }

  return { user, supabase, serviceSupabase };
}

// For server components (no NextRequest — e.g., admin layout):
export async function checkAdminAccess(): Promise<{ user: User } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: adminRow } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle(); // Returns null (not error) when no rows found

  if (!adminRow) return null;
  return { user };
}

export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  reason: string | null,
  request: NextRequest
) {
  const { error } = await serviceSupabase.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
    device_fingerprint: request.headers.get('x-device-fingerprint') ?? null,
    reason,
  });

  if (error) {
    console.error('Failed to write admin audit log:', { action, targetType, targetId, error });
  }
}

export function handleAdminError(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  console.error('Admin route error:', error);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
