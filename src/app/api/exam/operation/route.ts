import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/supabase/auth';

/** Read an authenticated user's receipt. This endpoint never generates or advances. */
export async function GET(request: NextRequest) {
  const authed = await getAuthedUser(request);
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const key = request.nextUrl.searchParams.get('operationId');
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const { data, error } = await authed.supabase.from('exam_operation_receipts')
    .select('action, state, response_status, response_body')
    .eq('user_id', authed.user.id).eq('operation_id', key).eq('session_id', sessionId).maybeSingle();
  if (error) return NextResponse.json({ error: 'exam_operation_unavailable' }, { status: 503 });
  return NextResponse.json({ receipt: data }, { headers: { 'Cache-Control': 'no-store' } });
}
