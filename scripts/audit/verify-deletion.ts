/**
 * W6.3 — deletion verification: proves ZERO rows remain keyed to a deleted
 * user across every user-keyed table (the FK inventory from migration
 * 20260611000001). Run after any deletion-path change:
 *
 *   npx tsx scripts/audit/verify-deletion.ts <user_id> [stripe_customer_id]
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** table → user-keyed columns (ownership AND actor columns must both be clean of the id). */
export const USER_KEYED: Array<[string, string[]]> = [
  ['user_profiles', ['user_id']],
  ['exam_sessions', ['user_id']],
  ['usage_logs', ['user_id']],
  ['active_sessions', ['user_id']],
  ['email_preferences', ['user_id']],
  ['admin_users', ['user_id']],
  ['admin_devices', ['user_id']],
  ['admin_notes', ['target_user_id', 'admin_user_id']],
  ['admin_audit_log', ['admin_user_id']],
  ['instructor_profiles', ['user_id', 'approved_by', 'rejected_by', 'suspended_by']],
  ['instructor_invites', ['instructor_user_id', 'claimed_by_user_id']],
  ['instructor_invite_events', ['instructor_user_id']],
  ['instructor_access_overrides', ['instructor_user_id', 'created_by', 'revoked_by']],
  ['instructor_quota_overrides', ['instructor_user_id', 'created_by']],
  ['student_instructor_connections', ['student_user_id', 'instructor_user_id', 'approved_by', 'disconnected_by']],
  ['student_milestones', ['student_user_id', 'declared_by_user_id']],
  ['user_entitlement_overrides', ['user_id', 'created_by']],
  ['moderation_queue', ['reporter_user_id', 'resolved_by']],
  ['support_tickets', ['user_id']],
  ['prompt_versions', ['created_by', 'published_by']],
  ['system_config', ['updated_by']],
];

export async function verifyDeletion(userId: string, customerId?: string): Promise<{ clean: boolean; leaks: string[] }> {
  const leaks: string[] = [];
  for (const [table, cols] of USER_KEYED) {
    for (const col of cols) {
      const { count, error } = await s.from(table).select('*', { count: 'exact', head: true }).eq(col, userId);
      if (error) { leaks.push(`${table}.${col}: QUERY ERROR ${error.message}`); continue; }
      if ((count ?? 0) > 0) leaks.push(`${table}.${col}: ${count} rows`);
    }
  }
  if (customerId) {
    const { count } = await s.from('subscription_events').select('*', { count: 'exact', head: true }).eq('customer_id', customerId);
    if ((count ?? 0) > 0) leaks.push(`subscription_events.customer_id: ${count} rows`);
  }
  return { clean: leaks.length === 0, leaks };
}

if (require.main === module) {
  const userId = process.argv[2];
  if (!userId) { console.error('usage: verify-deletion.ts <user_id> [customer_id]'); process.exit(1); }
  verifyDeletion(userId, process.argv[3]).then(({ clean, leaks }) => {
    if (clean) { console.log('✅ CLEAN — zero rows keyed to the user in all user-keyed tables.'); process.exit(0); }
    console.error('❌ LEAKS:\n' + leaks.map((l) => `  - ${l}`).join('\n'));
    process.exit(1);
  });
}
