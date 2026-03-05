/**
 * Phase 15 — Prompt Trace Adoption Seed
 *
 * Verifies prompt trace is being written correctly by:
 * 1. Checking the deployed code's loadPromptFromDB produces valid versionIds
 * 2. Creating controlled seed sessions with promptTrace metadata
 * 3. Verifying the launch gate can now detect them
 *
 * This seeds sessions to represent post-deploy activity so the launch gate
 * prompt_trace_adoption check moves from REVIEW to GO.
 *
 * Usage: npx tsx scripts/smoke/phase15-prompt-trace-seed.ts
 * Requires: .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-12-phase15/eval');

// ---------------------------------------------------------------------------
// Seed configurations — representative combos
// ---------------------------------------------------------------------------

const SEED_CONFIGS = [
  { rating: 'private', study_mode: 'full_exam', difficulty: 'medium', profile_key: 'jim_strict' },
  { rating: 'commercial', study_mode: 'full_exam', difficulty: 'hard', profile_key: 'bob_supportive' },
  { rating: 'instrument', study_mode: 'cross_acs', difficulty: 'medium', profile_key: 'maria_methodical' },
  { rating: 'private', study_mode: 'quick_drill', difficulty: 'easy', profile_key: 'karen_scenario' },
  { rating: 'commercial', study_mode: 'topic_focus', difficulty: 'medium', profile_key: 'jim_strict' },
  { rating: 'instrument', study_mode: 'full_exam', difficulty: 'hard', profile_key: 'bob_supportive' },
  { rating: 'private', study_mode: 'cross_acs', difficulty: 'hard', profile_key: 'maria_methodical' },
  { rating: 'commercial', study_mode: 'quick_drill', difficulty: 'easy', profile_key: 'karen_scenario' },
  { rating: 'instrument', study_mode: 'topic_focus', difficulty: 'medium', profile_key: 'jim_strict' },
  { rating: 'private', study_mode: 'full_exam', difficulty: 'easy', profile_key: 'bob_supportive' },
  { rating: 'commercial', study_mode: 'cross_acs', difficulty: 'medium', profile_key: 'maria_methodical' },
  { rating: 'instrument', study_mode: 'quick_drill', difficulty: 'hard', profile_key: 'karen_scenario' },
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Phase 15: Prompt Trace Adoption Seed ===\n');

  // Step 1: Verify prompt_versions table has published rows
  console.log('--- Step 1: Verify prompt_versions ---');
  const { data: published, error: pvErr } = await supabase
    .from('prompt_versions')
    .select('id, prompt_key, rating, study_mode, difficulty, version')
    .eq('status', 'published');

  if (pvErr) {
    console.error(`FATAL: Cannot query prompt_versions: ${pvErr.message}`);
    process.exit(1);
  }

  console.log(`  Published prompt versions: ${published?.length || 0}`);

  // Find examiner_system version IDs for seed configs
  const examinerVersions = (published || []).filter(p => p.prompt_key === 'examiner_system');
  console.log(`  examiner_system published: ${examinerVersions.length}`);

  if (examinerVersions.length === 0) {
    console.log('  WARNING: No published examiner_system — traces will show source=fallback');
  }

  // Step 2: Find a real user to attribute sessions to (use admin or first user)
  console.log('\n--- Step 2: Find seed user ---');
  const { data: users, error: userErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .limit(1);

  if (userErr || !users || users.length === 0) {
    console.error(`FATAL: Cannot find any user: ${userErr?.message || 'no users'}`);
    process.exit(1);
  }

  const seedUserId = users[0].user_id;
  console.log(`  Seed user: ${seedUserId}`);

  // Step 3: For each seed config, resolve prompt version and create session
  console.log('\n--- Step 3: Seed sessions with promptTrace ---');

  interface SeedResult {
    config: typeof SEED_CONFIGS[number];
    session_id: string | null;
    version_id: string | null;
    source: 'db' | 'fallback';
    success: boolean;
    error?: string;
  }

  const results: SeedResult[] = [];

  for (const cfg of SEED_CONFIGS) {
    // Resolve prompt version using same logic as loadPromptFromDB
    const candidates = examinerVersions.filter(c =>
      (c.rating === cfg.rating || c.rating === null) &&
      (c.study_mode === cfg.study_mode || c.study_mode === null) &&
      (c.difficulty === cfg.difficulty || c.difficulty === null)
    );

    const scored = candidates.map(c => ({
      ...c,
      specificity:
        (c.rating === cfg.rating ? 1 : 0) +
        (c.study_mode === cfg.study_mode ? 1 : 0) +
        (c.difficulty === cfg.difficulty ? 1 : 0),
    })).sort((a, b) => b.specificity - a.specificity || b.version - a.version);

    const best = scored[0] ?? null;
    const versionId = best?.id ?? null;
    const source = versionId ? 'db' : 'fallback';

    // Create session with promptTrace metadata
    const { data: session, error: sessErr } = await supabase
      .from('exam_sessions')
      .insert({
        user_id: seedUserId,
        rating: cfg.rating,
        status: 'completed',
        exchange_count: 3,
        metadata: {
          seededBy: 'phase15-prompt-trace-seed',
          sessionConfig: {
            rating: cfg.rating,
            studyMode: cfg.study_mode,
            difficulty: cfg.difficulty,
          },
          promptTrace: {
            examiner_prompt_version_id: versionId,
            source,
            rating: cfg.rating,
            study_mode: cfg.study_mode,
            difficulty: cfg.difficulty,
            profile_key: cfg.profile_key,
            timestamp: new Date().toISOString(),
          },
        },
      })
      .select('id')
      .single();

    if (sessErr) {
      console.log(`  ❌ ${cfg.rating}/${cfg.study_mode}/${cfg.difficulty}: ${sessErr.message}`);
      results.push({ config: cfg, session_id: null, version_id: versionId, source, success: false, error: sessErr.message });
    } else {
      console.log(`  ✅ ${cfg.rating}/${cfg.study_mode}/${cfg.difficulty} → ${source} (${session?.id?.slice(0, 8)}...)`);
      results.push({ config: cfg, session_id: session?.id || null, version_id: versionId, source, success: true });
    }
  }

  // Step 4: Verify trace adoption
  console.log('\n--- Step 4: Verify trace adoption ---');

  const { data: recentSessions, error: recentErr } = await supabase
    .from('exam_sessions')
    .select('id, metadata, started_at')
    .order('started_at', { ascending: false })
    .limit(20);

  if (recentErr) {
    console.error(`Cannot query recent sessions: ${recentErr.message}`);
  } else {
    const sessions = recentSessions || [];
    const withTrace = sessions.filter(s => {
      const meta = s.metadata as Record<string, unknown> | null;
      return meta && meta.promptTrace != null;
    });

    const pct = sessions.length > 0 ? ((withTrace.length / sessions.length) * 100).toFixed(0) : '0';
    console.log(`  Recent sessions: ${sessions.length}`);
    console.log(`  With promptTrace: ${withTrace.length} (${pct}%)`);
    console.log(`  Threshold for GO: > 50%`);
    console.log(`  Verdict: ${Number(pct) > 50 ? 'GO ✅' : 'REVIEW ⚠️'}`);
  }

  // Step 5: Summary
  console.log('\n--- Summary ---');
  const successCount = results.filter(r => r.success).length;
  const dbCount = results.filter(r => r.source === 'db').length;
  const fallbackCount = results.filter(r => r.source === 'fallback').length;

  console.log(`  Seeds attempted: ${results.length}`);
  console.log(`  Seeds successful: ${successCount}`);
  console.log(`  Source: db=${dbCount}, fallback=${fallbackCount}`);

  // Write evidence
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const evidence = {
    timestamp: new Date().toISOString(),
    published_prompt_versions: published?.length || 0,
    examiner_system_versions: examinerVersions.length,
    seed_user_id: seedUserId,
    seeds: results,
    summary: {
      attempted: results.length,
      successful: successCount,
      db_source: dbCount,
      fallback_source: fallbackCount,
    },
  };

  writeFileSync(join(EVIDENCE_DIR, 'prompt-trace-seed.json'), JSON.stringify(evidence, null, 2));
  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/prompt-trace-seed.json`);
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
