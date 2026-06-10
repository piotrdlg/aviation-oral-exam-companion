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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const REF = URL_.split('//')[1].split('.')[0];
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PASSWORD = 'LoadTest!2026-fixed';
const N = 20;

async function create() {
  const out: Array<{ email: string; cookieName: string; cookieValue: string }> = [];
  for (let i = 0; i < N; i++) {
    const email = `loadtest+${i}@heydpe-loadtest.example`;
    // idempotent: delete an existing fixture user first
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const old = existing?.users.find((u) => u.email === email);
    if (old) await admin.auth.admin.deleteUser(old.id);
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !created.user) throw new Error(`create ${email}: ${error?.message}`);
    await admin.from('user_profiles').upsert({ user_id: created.user.id, tier: 'dpe_live' }, { onConflict: 'user_id' });

    // password-grant sign-in for a real session
    const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    if (sErr || !signIn.session) throw new Error(`signin ${email}: ${sErr?.message}`);

    // @supabase/ssr cookie format: sb-<ref>-auth-token = "base64-" + b64url(JSON(session))
    const sessionJson = JSON.stringify(signIn.session);
    const cookieValue = 'base64-' + Buffer.from(sessionJson).toString('base64url');
    out.push({ email, cookieName: `sb-${REF}-auth-token`, cookieValue });
    process.stdout.write(`  ${i + 1}/${N}\r`);
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
