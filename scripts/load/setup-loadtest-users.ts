/**
 * W6.2 — create/teardown the load-test user pool (20 users) and emit the
 * Supabase SSR auth cookies k6 needs.
 *
 *   npx tsx scripts/load/setup-loadtest-users.ts create   → scripts/load/users.local.json
 *   npx tsx scripts/load/setup-loadtest-users.ts teardown → deletes loadtest+* users
 *
 * Users are clearly marked (loadtest+n@heydpe-loadtest.example) and MUST be
 * torn down after the run (the final gate's anon checks don't mind, but the
 * user table should not accumulate fixtures).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });

// Deployed environments use the custom auth domain (auth.heydpe.com) — the
// SSR cookie NAME derives from this URL, so cookies must be generated with
// the SAME url the target deployment uses. Override with LOADTEST_SUPABASE_URL.
const URL_ = process.env.LOADTEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const REF = URL_.split('//')[1].split('.')[0];
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PASSWORD = 'LoadTest!2026-fixed';
const N = 50;

async function create() {
  const out: Array<{ email: string; cookieName: string; cookieValue: string }> = [];
  // single upfront listing (a per-user listUsers call flaked at scale)
  const { data: existingAll } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (let i = 0; i < N; i++) {
    const email = `loadtest+${i}@heydpe-loadtest.example`;
    const old = existingAll?.users.find((u) => u.email === email);
    if (old) await admin.auth.admin.deleteUser(old.id).catch(() => {});
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !created.user) throw new Error(`create ${email}: ${error?.message}`);
    await admin.from('user_profiles').upsert({ user_id: created.user.id, tier: 'dpe_live' }, { onConflict: 'user_id' });

    // password-grant sign-in for a real session
    const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    // auth endpoints rate-limit; back off and retry rather than abort the pool
    let signIn: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>['data'] | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
      if (data?.session) { signIn = data; break; }
      if (error && /rate limit/i.test(error.message)) { await new Promise((r) => setTimeout(r, 8000)); continue; }
      throw new Error(`signin ${email}: ${error?.message}`);
    }
    if (!signIn?.session) throw new Error(`signin ${email}: exhausted retries`);

    // Let @supabase/ssr ITSELF serialize the cookie (codec + chunking parity
    // with the server parser) by capturing what setSession writes.
    const captured: Array<{ name: string; value: string }> = [];
    const { createServerClient } = await import('@supabase/ssr');
    const ssrClient = createServerClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => captured,
        setAll: (cookies: Array<{ name: string; value: string }>) => {
          for (const c of cookies) {
            const idx = captured.findIndex((x) => x.name === c.name);
            if (idx >= 0) captured[idx] = { name: c.name, value: c.value };
            else captured.push({ name: c.name, value: c.value });
          }
        },
      },
    });
    await ssrClient.auth.setSession({
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    });
    const cookieHeader = captured
      .filter((c) => c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    out.push({ email, cookieName: 'COOKIE_HEADER', cookieValue: cookieHeader });
    fs.writeFileSync('scripts/load/users.local.json', JSON.stringify(out, null, 1)); // incremental
    process.stdout.write(`  ${i + 1}/${N}\r`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  fs.writeFileSync('scripts/load/users.local.json', JSON.stringify(out, null, 1));
  console.log(`\n${N} users → scripts/load/users.local.json (gitignored)`);
}

async function teardown() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const fixtures = (data?.users ?? []).filter((u) => u.email?.includes('@heydpe-loadtest.example'));
  for (const u of fixtures) await admin.auth.admin.deleteUser(u.id);
  console.log(`deleted ${fixtures.length} load-test users (cascades cleaned their data)`);
  try { fs.unlinkSync('scripts/load/users.local.json'); } catch { /* absent ok */ }
}

(process.argv[2] === 'teardown' ? teardown() : create()).catch((e) => { console.error(e); process.exit(1); });
