/**
 * Launch Readiness Gate (Phase 14)
 *
 * Checks GO / REVIEW / NO-GO across 4 categories:
 *   1. Core Exam Behavior
 *   2. Operational Readiness
 *   3. Commercial Readiness
 *   4. PromptOps Readiness
 *
 * Usage: npx tsx scripts/audit/launch-readiness.ts
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

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-11-phase14/eval');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = 'GO' | 'REVIEW' | 'NO-GO';

interface CheckResult {
  check: string;
  verdict: Verdict;
  detail: string;
}

interface CategoryResult {
  name: string;
  checks: CheckResult[];
  verdict: Verdict;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryVerdict(checks: CheckResult[]): Verdict {
  if (checks.some(c => c.verdict === 'NO-GO')) return 'NO-GO';
  if (checks.some(c => c.verdict === 'REVIEW')) return 'REVIEW';
  return 'GO';
}

function overallVerdict(categories: CategoryResult[]): Verdict {
  if (categories.some(c => c.verdict === 'NO-GO')) return 'NO-GO';
  if (categories.some(c => c.verdict === 'REVIEW')) return 'REVIEW';
  return 'GO';
}

function verdictIcon(v: Verdict): string {
  switch (v) {
    case 'GO': return '\u2705 GO  ';
    case 'REVIEW': return '\u26A0\uFE0F  REVIEW';
    case 'NO-GO': return '\u274C NO-GO';
  }
}

function verdictLabel(v: Verdict): string {
  return v;
}

// ---------------------------------------------------------------------------
// Category 1: Core Exam Behavior
// ---------------------------------------------------------------------------

async function checkAcsTaskCoverage(): Promise<CheckResult> {
  // acs_tasks has a `rating` column: 'private', 'commercial', 'instrument'
  // and `id` column with format like PA.I.A, CA.II.B, IR.III.A
  const ratings = [
    { label: 'PA', rating: 'private' },
    { label: 'CA', rating: 'commercial' },
    { label: 'IR', rating: 'instrument' },
  ] as const;
  const counts: Record<string, number> = {};
  const missing: string[] = [];

  for (const { label, rating } of ratings) {
    const { count, error } = await supabase
      .from('acs_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('rating', rating);

    if (error) {
      return { check: 'acs_task_coverage', verdict: 'NO-GO', detail: `Error querying acs_tasks: ${error.message}` };
    }

    counts[label] = count ?? 0;
    if ((count ?? 0) === 0) missing.push(label);
  }

  const detail = `PA=${counts.PA}, CA=${counts.CA}, IR=${counts.IR}`;

  if (missing.length > 0) {
    return { check: 'acs_task_coverage', verdict: 'NO-GO', detail: `Missing tasks for: ${missing.join(', ')} (${detail})` };
  }

  return { check: 'acs_task_coverage', verdict: 'GO', detail };
}

async function checkPromptVersions(): Promise<CheckResult> {
  const requiredKeys = ['examiner_system', 'assessment_system'];
  const missing: string[] = [];

  for (const key of requiredKeys) {
    const { count, error } = await supabase
      .from('prompt_versions')
      .select('*', { count: 'exact', head: true })
      .eq('prompt_key', key)
      .eq('status', 'published');

    if (error) {
      return { check: 'prompt_versions', verdict: 'NO-GO', detail: `Error querying prompt_versions: ${error.message}` };
    }

    if ((count ?? 0) === 0) missing.push(key);
  }

  if (missing.length > 0) {
    return { check: 'prompt_versions', verdict: 'NO-GO', detail: `Missing published prompt(s): ${missing.join(', ')}` };
  }

  return { check: 'prompt_versions', verdict: 'GO', detail: 'examiner_system + assessment_system published' };
}

async function checkKnowledgeGraph(): Promise<CheckResult> {
  const { count, error } = await supabase
    .from('concepts')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return { check: 'knowledge_graph', verdict: 'NO-GO', detail: `Error querying concepts: ${error.message}` };
  }

  const n = count ?? 0;

  if (n > 1000) {
    return { check: 'knowledge_graph', verdict: 'GO', detail: `${n} concepts` };
  }
  if (n > 100) {
    return { check: 'knowledge_graph', verdict: 'REVIEW', detail: `${n} concepts (> 100 but < 1000)` };
  }
  return { check: 'knowledge_graph', verdict: 'NO-GO', detail: `${n} concepts (< 100)` };
}

async function checkSourceChunks(): Promise<CheckResult> {
  const { count, error } = await supabase
    .from('source_chunks')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return { check: 'source_chunks', verdict: 'NO-GO', detail: `Error querying source_chunks: ${error.message}` };
  }

  const n = count ?? 0;

  if (n > 500) {
    return { check: 'source_chunks', verdict: 'GO', detail: `${n} chunks` };
  }
  if (n > 100) {
    return { check: 'source_chunks', verdict: 'REVIEW', detail: `${n} chunks (> 100 but < 500)` };
  }
  return { check: 'source_chunks', verdict: 'NO-GO', detail: `${n} chunks (< 100)` };
}

// ---------------------------------------------------------------------------
// Category 2: Operational Readiness
// ---------------------------------------------------------------------------

async function checkSessionTracking(): Promise<CheckResult> {
  const { count, error } = await supabase
    .from('exam_sessions')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    return { check: 'session_tracking', verdict: 'REVIEW', detail: `Error querying exam_sessions: ${error.message}` };
  }

  const n = count ?? 0;

  if (n > 0) {
    return { check: 'session_tracking', verdict: 'GO', detail: `${n} sessions in last 90 days` };
  }
  return { check: 'session_tracking', verdict: 'REVIEW', detail: '0 sessions in last 90 days (new env or no usage)' };
}

async function checkPromptTraceAdoption(): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('id, metadata')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    return { check: 'prompt_trace_adoption', verdict: 'REVIEW', detail: `Error querying exam_sessions: ${error.message}` };
  }

  const sessions = data || [];

  if (sessions.length === 0) {
    return { check: 'prompt_trace_adoption', verdict: 'REVIEW', detail: 'No sessions to evaluate trace adoption' };
  }

  const withTrace = sessions.filter(s => {
    const meta = s.metadata as Record<string, unknown> | null;
    return meta && meta.promptTrace != null;
  }).length;

  const pct = ((withTrace / sessions.length) * 100).toFixed(0);

  if (withTrace / sessions.length > 0.5) {
    return { check: 'prompt_trace_adoption', verdict: 'GO', detail: `${withTrace}/${sessions.length} recent sessions have promptTrace (${pct}%)` };
  }
  return { check: 'prompt_trace_adoption', verdict: 'REVIEW', detail: `${withTrace}/${sessions.length} recent sessions have promptTrace (${pct}%)` };
}

async function checkImageAssets(): Promise<CheckResult> {
  const { count, error } = await supabase
    .from('source_images')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return { check: 'image_assets', verdict: 'NO-GO', detail: `Error querying source_images: ${error.message}` };
  }

  const n = count ?? 0;

  if (n > 100) {
    return { check: 'image_assets', verdict: 'GO', detail: `${n} images` };
  }
  if (n > 0) {
    return { check: 'image_assets', verdict: 'REVIEW', detail: `${n} images (> 0 but < 100)` };
  }
  return { check: 'image_assets', verdict: 'NO-GO', detail: '0 images' };
}

// ---------------------------------------------------------------------------
// Category 3: Commercial Readiness
// ---------------------------------------------------------------------------

async function checkAuthSystem(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    return { check: 'auth_system', verdict: 'GO', detail: 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set' };
  }

  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return { check: 'auth_system', verdict: 'NO-GO', detail: `Missing env var(s): ${missing.join(', ')}` };
}

async function checkAiProvider(): Promise<CheckResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    return { check: 'ai_provider', verdict: 'GO', detail: 'ANTHROPIC_API_KEY set' };
  }
  return { check: 'ai_provider', verdict: 'NO-GO', detail: 'ANTHROPIC_API_KEY not set' };
}

async function checkUserProfiles(): Promise<CheckResult> {
  const { count, error } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return { check: 'user_profiles', verdict: 'NO-GO', detail: `Error querying user_profiles: ${error.message}` };
  }

  return { check: 'user_profiles', verdict: 'GO', detail: `Table queryable (${count ?? 0} rows)` };
}

// ---------------------------------------------------------------------------
// Category 4: PromptOps Readiness
// ---------------------------------------------------------------------------

async function checkPersonaPrompts(): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('prompt_versions')
    .select('prompt_key')
    .like('prompt_key', 'persona_%')
    .eq('status', 'published');

  if (error) {
    return { check: 'persona_prompts', verdict: 'NO-GO', detail: `Error querying prompt_versions: ${error.message}` };
  }

  const distinctKeys = new Set((data || []).map(r => r.prompt_key));
  const n = distinctKeys.size;

  if (n >= 4) {
    return { check: 'persona_prompts', verdict: 'GO', detail: `${n} distinct published persona prompts: ${[...distinctKeys].join(', ')}` };
  }
  if (n >= 1) {
    return { check: 'persona_prompts', verdict: 'REVIEW', detail: `${n} published persona prompt(s) (need >= 4): ${[...distinctKeys].join(', ')}` };
  }
  return { check: 'persona_prompts', verdict: 'NO-GO', detail: '0 published persona prompts' };
}

async function checkVersionAmbiguity(): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('prompt_versions')
    .select('prompt_key, rating, study_mode, difficulty')
    .eq('status', 'published');

  if (error) {
    return { check: 'version_ambiguity', verdict: 'REVIEW', detail: `Error querying prompt_versions: ${error.message}` };
  }

  const rows = data || [];
  const groups = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.prompt_key}|${row.rating ?? '*'}|${row.study_mode ?? '*'}|${row.difficulty ?? '*'}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const ambiguous = [...groups.entries()].filter(([, count]) => count > 1);

  if (ambiguous.length === 0) {
    return { check: 'version_ambiguity', verdict: 'GO', detail: 'No published dimension groups have multiple rows' };
  }

  const details = ambiguous.map(([key, count]) => `${key} (${count})`).join('; ');
  return { check: 'version_ambiguity', verdict: 'REVIEW', detail: `${ambiguous.length} ambiguous group(s): ${details}` };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Launch Readiness Gate (Phase 14) ===\n');

  // --- Category 1: Core Exam Behavior ---
  const coreChecks: CheckResult[] = await Promise.all([
    checkAcsTaskCoverage(),
    checkPromptVersions(),
    checkKnowledgeGraph(),
    checkSourceChunks(),
  ]);

  const cat1: CategoryResult = {
    name: 'Core Exam Behavior',
    checks: coreChecks,
    verdict: categoryVerdict(coreChecks),
  };

  // --- Category 2: Operational Readiness ---
  const opsChecks: CheckResult[] = await Promise.all([
    checkSessionTracking(),
    checkPromptTraceAdoption(),
    checkImageAssets(),
  ]);

  const cat2: CategoryResult = {
    name: 'Operational Readiness',
    checks: opsChecks,
    verdict: categoryVerdict(opsChecks),
  };

  // --- Category 3: Commercial Readiness ---
  const commercialChecks: CheckResult[] = await Promise.all([
    checkAuthSystem(),
    checkAiProvider(),
    checkUserProfiles(),
  ]);

  const cat3: CategoryResult = {
    name: 'Commercial Readiness',
    checks: commercialChecks,
    verdict: categoryVerdict(commercialChecks),
  };

  // --- Category 4: PromptOps Readiness ---
  const promptOpsChecks: CheckResult[] = await Promise.all([
    checkPersonaPrompts(),
    checkVersionAmbiguity(),
  ]);

  const cat4: CategoryResult = {
    name: 'PromptOps Readiness',
    checks: promptOpsChecks,
    verdict: categoryVerdict(promptOpsChecks),
  };

  const categories = [cat1, cat2, cat3, cat4];
  const overall = overallVerdict(categories);

  // --- Console Output ---
  for (const cat of categories) {
    console.log(`--- Category: ${cat.name} ---`);
    for (const c of cat.checks) {
      console.log(`  ${verdictIcon(c.verdict)} ${c.check}: ${c.detail}`);
    }
    console.log('');
  }

  console.log('--- SUMMARY ---');
  const allChecks = categories.flatMap(c => c.checks);
  for (const cat of categories) {
    const goCount = cat.checks.filter(c => c.verdict === 'GO').length;
    const padded = cat.name.padEnd(24);
    console.log(`  ${padded} ${verdictLabel(cat.verdict)}  (${goCount}/${cat.checks.length} checks GO)`);
  }
  console.log('');

  const totalGo = allChecks.filter(c => c.verdict === 'GO').length;
  console.log(`  OVERALL: ${verdictLabel(overall)} (${totalGo}/${allChecks.length} checks GO)`);

  // --- Write Evidence ---
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // JSON evidence
  const jsonEvidence = {
    timestamp: new Date().toISOString(),
    overall_verdict: overall,
    categories: categories.map(cat => ({
      name: cat.name,
      verdict: cat.verdict,
      checks: cat.checks,
    })),
    summary: {
      total_checks: allChecks.length,
      go_count: allChecks.filter(c => c.verdict === 'GO').length,
      review_count: allChecks.filter(c => c.verdict === 'REVIEW').length,
      nogo_count: allChecks.filter(c => c.verdict === 'NO-GO').length,
    },
  };

  writeFileSync(
    join(EVIDENCE_DIR, 'launch-readiness.json'),
    JSON.stringify(jsonEvidence, null, 2)
  );

  // Markdown evidence
  let md = `# Launch Readiness Gate (Phase 14)\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Overall Verdict:** ${overall}\n\n`;

  for (const cat of categories) {
    md += `## ${cat.name}\n\n`;
    md += `**Category Verdict:** ${cat.verdict}\n\n`;
    md += `| Check | Verdict | Detail |\n`;
    md += `|-------|---------|--------|\n`;
    for (const c of cat.checks) {
      const icon = c.verdict === 'GO' ? '\u2705' : c.verdict === 'REVIEW' ? '\u26A0\uFE0F' : '\u274C';
      md += `| ${c.check} | ${icon} ${c.verdict} | ${c.detail} |\n`;
    }
    md += '\n';
  }

  md += `## Summary\n\n`;
  md += `| Category | Verdict | GO Checks |\n`;
  md += `|----------|---------|----------|\n`;
  for (const cat of categories) {
    const goCount = cat.checks.filter(c => c.verdict === 'GO').length;
    const icon = cat.verdict === 'GO' ? '\u2705' : cat.verdict === 'REVIEW' ? '\u26A0\uFE0F' : '\u274C';
    md += `| ${cat.name} | ${icon} ${cat.verdict} | ${goCount}/${cat.checks.length} |\n`;
  }
  md += `\n**Overall:** ${overall} (${totalGo}/${allChecks.length} checks GO)\n`;

  md += `\n## Methodology\n\n`;
  md += `### Category 1: Core Exam Behavior\n`;
  md += `- **acs_task_coverage**: Queries \`acs_tasks\` for PA, CA, IR prefixes. GO if all 3 have tasks.\n`;
  md += `- **prompt_versions**: Checks \`prompt_versions\` for published \`examiner_system\` and \`assessment_system\`.\n`;
  md += `- **knowledge_graph**: Counts \`concepts\` table. GO > 1000; REVIEW > 100; NO-GO < 100.\n`;
  md += `- **source_chunks**: Counts \`source_chunks\` table. GO > 500; REVIEW > 100; NO-GO < 100.\n`;
  md += `\n### Category 2: Operational Readiness\n`;
  md += `- **session_tracking**: Checks for \`exam_sessions\` created in last 90 days. GO if > 0.\n`;
  md += `- **prompt_trace_adoption**: Checks last 20 sessions for \`metadata->promptTrace\`. GO if > 50%.\n`;
  md += `- **image_assets**: Counts \`source_images\`. GO > 100; REVIEW > 0; NO-GO = 0.\n`;
  md += `\n### Category 3: Commercial Readiness\n`;
  md += `- **auth_system**: Verifies \`NEXT_PUBLIC_SUPABASE_URL\` and \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` env vars.\n`;
  md += `- **ai_provider**: Verifies \`ANTHROPIC_API_KEY\` env var.\n`;
  md += `- **user_profiles**: Queries \`user_profiles\` table to confirm it exists and is accessible.\n`;
  md += `\n### Category 4: PromptOps Readiness\n`;
  md += `- **persona_prompts**: Counts distinct published \`persona_%\` prompt keys. GO >= 4; REVIEW 1-3; NO-GO = 0.\n`;
  md += `- **version_ambiguity**: Groups published rows by (prompt_key, rating, study_mode, difficulty). GO if no group has count > 1.\n`;

  writeFileSync(join(EVIDENCE_DIR, 'launch-readiness.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/launch-readiness.{json,md}`);

  if (overall !== 'GO') {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Launch readiness gate failed:', err);
  process.exit(1);
});
