import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

/** W6.2 TEMP diagnostics — only exists when the load-test mock env is set; never in production. */
export async function GET() {
  if (process.env.LOAD_TEST_MOCK_LLM !== '1' || process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const store = await cookies();
  const names = store.getAll().map((c) => `${c.name}(${c.value.length})`);
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return NextResponse.json({
    cookieNames: names,
    supabaseUrlHost: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', ''),
    hasUser: !!user,
    authError: error?.message ?? null,
  });
}
