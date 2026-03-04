/**
 * Public Launch Gate (Phase 17)
 *
 * Checks GO / REVIEW / NO-GO across 4 categories:
 *   1. Support & Communications
 *   2. Security & Access Control
 *   3. UX & Billing
 *   4. Verification (typecheck + tests)
 *
 * Usage: npx tsx scripts/audit/public-launch-gate.ts
 * No database access required — file-content and CLI checks only.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const EVIDENCE_DIR = join(
  process.cwd(),
  'docs/system-audit/evidence/2026-03-14-phase17/commands'
);

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

/**
 * Read a project-relative file and return its contents, or null if missing.
 */
function readProjectFile(relativePath: string): string | null {
  const fullPath = join(process.cwd(), relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

/**
 * Check that a file exists and contains a specific string.
 */
function checkFileContains(
  checkName: string,
  relativePath: string,
  needle: string,
  description: string
): CheckResult {
  const content = readProjectFile(relativePath);

  if (content === null) {
    return {
      check: checkName,
      verdict: 'NO-GO',
      detail: `File not found: ${relativePath}`,
    };
  }

  if (content.includes(needle)) {
    return {
      check: checkName,
      verdict: 'GO',
      detail: `${description} \u2014 found \`${needle}\` in ${relativePath}`,
    };
  }

  return {
    check: checkName,
    verdict: 'NO-GO',
    detail: `\`${needle}\` not found in ${relativePath}`,
  };
}

/**
 * Check that a file exists at the given project-relative path.
 */
function checkFileExists(
  checkName: string,
  relativePath: string,
  description: string
): CheckResult {
  const fullPath = join(process.cwd(), relativePath);

  if (existsSync(fullPath)) {
    return {
      check: checkName,
      verdict: 'GO',
      detail: `${description} \u2014 ${relativePath} exists`,
    };
  }

  return {
    check: checkName,
    verdict: 'NO-GO',
    detail: `File not found: ${relativePath}`,
  };
}

// ---------------------------------------------------------------------------
// Category 1: Support & Communications
// ---------------------------------------------------------------------------

function checkSupportAutoReply(): CheckResult {
  return checkFileContains(
    'support_auto_reply',
    'src/lib/email.ts',
    'sendTicketAutoReply',
    'Support auto-reply email function exists'
  );
}

function checkTrialEndingReminder(): CheckResult {
  return checkFileContains(
    'trial_ending_reminder',
    'src/lib/email.ts',
    'sendTrialEndingReminder',
    'Trial ending reminder email function exists'
  );
}

function checkTrialReminderCron(): CheckResult {
  return checkFileExists(
    'trial_reminder_cron',
    'scripts/email/send-trial-ending-reminders.ts',
    'Trial reminder cron script exists'
  );
}

// ---------------------------------------------------------------------------
// Category 2: Security & Access Control
// ---------------------------------------------------------------------------

function checkCspHeader(): CheckResult {
  return checkFileContains(
    'csp_header',
    'next.config.ts',
    'Content-Security-Policy',
    'CSP header configured'
  );
}

function checkReportSessionOwnership(): CheckResult {
  return checkFileContains(
    'report_session_ownership',
    'src/app/api/report/route.ts',
    'session.user_id !== user.id',
    'Report endpoint has session ownership check'
  );
}

function checkTtsTierGating(): CheckResult {
  return checkFileContains(
    'tts_tier_gating',
    'src/lib/voice/usage.ts',
    'hasTtsAccess',
    'TTS tier gating enforced'
  );
}

// ---------------------------------------------------------------------------
// Category 3: UX & Billing
// ---------------------------------------------------------------------------

function checkPricingActiveSubscribers(): CheckResult {
  return checkFileContains(
    'pricing_active_subscribers',
    'src/app/pricing/page.tsx',
    'isActiveSubscriber',
    'Pricing page handles active subscribers'
  );
}

// ---------------------------------------------------------------------------
// Category 4: Verification
// ---------------------------------------------------------------------------

function checkTypeScript(): CheckResult {
  try {
    execSync('npx tsc --noEmit', {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 120_000,
    });
    return {
      check: 'typecheck',
      verdict: 'GO',
      detail: 'TypeScript compiles without errors',
    };
  } catch (err: unknown) {
    const stderr = err instanceof Error && 'stderr' in err
      ? (err as { stderr: Buffer }).stderr?.toString().slice(0, 500)
      : 'unknown error';
    return {
      check: 'typecheck',
      verdict: 'NO-GO',
      detail: `TypeScript compilation failed: ${stderr}`,
    };
  }
}

function checkTests(): CheckResult {
  try {
    const stdout = execSync('npx vitest run', {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 120_000,
    }).toString();

    // Extract summary line (e.g., "Tests  235 passed (235)")
    const summaryMatch = stdout.match(/Tests\s+(\d+)\s+passed/);
    const testCount = summaryMatch ? summaryMatch[1] : '?';

    return {
      check: 'tests',
      verdict: 'GO',
      detail: `All tests pass (${testCount} passed)`,
    };
  } catch (err: unknown) {
    const stdout = err instanceof Error && 'stdout' in err
      ? (err as { stdout: Buffer }).stdout?.toString().slice(-500)
      : 'unknown error';
    return {
      check: 'tests',
      verdict: 'NO-GO',
      detail: `Test suite failed: ${stdout}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Public Launch Gate (Phase 17) ===\n');

  // --- Category 1: Support & Communications ---
  const supportChecks: CheckResult[] = [
    checkSupportAutoReply(),
    checkTrialEndingReminder(),
    checkTrialReminderCron(),
  ];

  const cat1: CategoryResult = {
    name: 'Support & Communications',
    checks: supportChecks,
    verdict: categoryVerdict(supportChecks),
  };

  // --- Category 2: Security & Access Control ---
  const securityChecks: CheckResult[] = [
    checkCspHeader(),
    checkReportSessionOwnership(),
    checkTtsTierGating(),
  ];

  const cat2: CategoryResult = {
    name: 'Security & Access Control',
    checks: securityChecks,
    verdict: categoryVerdict(securityChecks),
  };

  // --- Category 3: UX & Billing ---
  const uxChecks: CheckResult[] = [
    checkPricingActiveSubscribers(),
  ];

  const cat3: CategoryResult = {
    name: 'UX & Billing',
    checks: uxChecks,
    verdict: categoryVerdict(uxChecks),
  };

  // --- Category 4: Verification ---
  console.log('Running typecheck (this may take a moment)...');
  const typecheckResult = checkTypeScript();
  console.log(`  ${verdictIcon(typecheckResult.verdict)} typecheck`);

  console.log('Running tests (this may take a moment)...');
  const testsResult = checkTests();
  console.log(`  ${verdictIcon(testsResult.verdict)} tests\n`);

  const verificationChecks: CheckResult[] = [typecheckResult, testsResult];

  const cat4: CategoryResult = {
    name: 'Verification',
    checks: verificationChecks,
    verdict: categoryVerdict(verificationChecks),
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
    const padded = cat.name.padEnd(28);
    console.log(`  ${padded} ${verdictLabel(cat.verdict)}  (${goCount}/${cat.checks.length} checks GO)`);
  }
  console.log('');

  const totalGo = allChecks.filter(c => c.verdict === 'GO').length;
  console.log(`  OVERALL: ${verdictLabel(overall)} (${totalGo}/${allChecks.length} checks GO)`);

  // --- Write Evidence ---
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // Text report (as specified — output to commands/public-launch-gate.txt)
  let txt = `Public Launch Gate (Phase 17)\n`;
  txt += `${'='.repeat(40)}\n`;
  txt += `Date: ${new Date().toISOString().split('T')[0]}\n`;
  txt += `Timestamp: ${new Date().toISOString()}\n`;
  txt += `Overall Verdict: ${overall}\n\n`;

  for (const cat of categories) {
    txt += `--- ${cat.name} (${cat.verdict}) ---\n`;
    for (const c of cat.checks) {
      const icon = c.verdict === 'GO' ? '[GO]    ' : c.verdict === 'REVIEW' ? '[REVIEW]' : '[NO-GO] ';
      txt += `  ${icon} ${c.check}: ${c.detail}\n`;
    }
    txt += '\n';
  }

  txt += `--- SUMMARY ---\n`;
  for (const cat of categories) {
    const goCount = cat.checks.filter(c => c.verdict === 'GO').length;
    const padded = cat.name.padEnd(28);
    txt += `  ${padded} ${verdictLabel(cat.verdict)}  (${goCount}/${cat.checks.length} checks GO)\n`;
  }
  txt += `\n  OVERALL: ${verdictLabel(overall)} (${totalGo}/${allChecks.length} checks GO)\n`;

  txt += `\n--- METHODOLOGY ---\n`;
  txt += `\nCategory 1: Support & Communications\n`;
  txt += `  - support_auto_reply: Checks src/lib/email.ts contains 'sendTicketAutoReply'\n`;
  txt += `  - trial_ending_reminder: Checks src/lib/email.ts contains 'sendTrialEndingReminder'\n`;
  txt += `  - trial_reminder_cron: Checks scripts/email/send-trial-ending-reminders.ts exists\n`;
  txt += `\nCategory 2: Security & Access Control\n`;
  txt += `  - csp_header: Checks next.config.ts contains 'Content-Security-Policy'\n`;
  txt += `  - report_session_ownership: Checks src/app/api/report/route.ts contains 'session.user_id !== user.id'\n`;
  txt += `  - tts_tier_gating: Checks src/lib/voice/usage.ts contains 'hasTtsAccess'\n`;
  txt += `\nCategory 3: UX & Billing\n`;
  txt += `  - pricing_active_subscribers: Checks src/app/pricing/page.tsx contains 'isActiveSubscriber'\n`;
  txt += `\nCategory 4: Verification\n`;
  txt += `  - typecheck: Runs 'npx tsc --noEmit' and checks exit code\n`;
  txt += `  - tests: Runs 'npx vitest run' and checks exit code\n`;

  writeFileSync(join(EVIDENCE_DIR, 'public-launch-gate.txt'), txt);

  // JSON evidence (same pattern as launch-readiness)
  const jsonEvidence = {
    timestamp: new Date().toISOString(),
    phase: 'Phase 17 — Public Launch Gate',
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
    join(EVIDENCE_DIR, 'public-launch-gate.json'),
    JSON.stringify(jsonEvidence, null, 2)
  );

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/public-launch-gate.{txt,json}`);

  if (overall !== 'GO') {
    process.exit(1);
  }
}

main();
