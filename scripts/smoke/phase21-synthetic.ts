#!/usr/bin/env tsx
/**
 * Phase 21 — Synthetic Monitoring (Observability Readiness)
 *
 * Performs 12 offline (no network) checks across 5 categories to validate
 * observability infrastructure readiness:
 *   1. Health & Monitoring Infrastructure
 *   2. Cron Job Reliability
 *   3. Admin Monitoring Endpoints
 *   4. Email Infrastructure
 *   5. Error Handling
 *
 * Usage: npm run smoke:phase21
 * No database or network access required — file-content checks only.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const EVIDENCE_DIR = join(
  ROOT,
  'docs/system-audit/evidence/2026-03-04-phase21/commands'
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = 'PASS' | 'FAIL' | 'WARN';

interface CheckResult {
  check: string;
  category: string;
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
  if (checks.some(c => c.verdict === 'FAIL')) return 'FAIL';
  if (checks.some(c => c.verdict === 'WARN')) return 'WARN';
  return 'PASS';
}

function overallVerdict(categories: CategoryResult[]): Verdict {
  if (categories.some(c => c.verdict === 'FAIL')) return 'FAIL';
  if (categories.some(c => c.verdict === 'WARN')) return 'WARN';
  return 'PASS';
}

function verdictIcon(v: Verdict): string {
  switch (v) {
    case 'PASS': return '\u2705 PASS';
    case 'WARN': return '\u26A0\uFE0F  WARN';
    case 'FAIL': return '\u274C FAIL';
  }
}

function verdictLabel(v: Verdict): string {
  return v;
}

/**
 * Read a project-relative file and return its contents, or null if missing.
 */
function readProjectFile(relativePath: string): string | null {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

/**
 * Check that a file exists at the given project-relative path.
 */
function fileExists(relativePath: string): boolean {
  return existsSync(join(ROOT, relativePath));
}

// ---------------------------------------------------------------------------
// Category 1: Health & Monitoring Infrastructure
// ---------------------------------------------------------------------------

function checkHealthEndpointExists(): CheckResult {
  const category = 'Health & Monitoring Infrastructure';
  const filePath = 'src/app/api/health/route.ts';
  const content = readProjectFile(filePath);

  if (content === null) {
    return {
      check: 'health_endpoint_exists',
      category,
      verdict: 'FAIL',
      detail: `File not found: ${filePath}`,
    };
  }

  if (content.includes('export') && content.includes('GET')) {
    return {
      check: 'health_endpoint_exists',
      category,
      verdict: 'PASS',
      detail: `${filePath} exists and exports GET handler`,
    };
  }

  return {
    check: 'health_endpoint_exists',
    category,
    verdict: 'FAIL',
    detail: `${filePath} exists but does not export GET handler`,
  };
}

function checkPosthogServerConfigured(): CheckResult {
  const category = 'Health & Monitoring Infrastructure';
  const filePath = 'src/lib/posthog-server.ts';
  const content = readProjectFile(filePath);

  if (content === null) {
    return {
      check: 'posthog_server_configured',
      category,
      verdict: 'FAIL',
      detail: `File not found: ${filePath}`,
    };
  }

  if (content.includes('captureServerEvent')) {
    return {
      check: 'posthog_server_configured',
      category,
      verdict: 'PASS',
      detail: `${filePath} exists and exports captureServerEvent`,
    };
  }

  return {
    check: 'posthog_server_configured',
    category,
    verdict: 'FAIL',
    detail: `${filePath} exists but does not export captureServerEvent`,
  };
}

function checkPosthogClientConfigured(): CheckResult {
  const category = 'Health & Monitoring Infrastructure';

  // Check for PostHog provider in layout or dedicated provider file
  const layoutContent = readProjectFile('src/app/layout.tsx');
  const providerExists = fileExists('src/components/PostHogProvider.tsx');

  const layoutHasPosthog = layoutContent !== null && (
    layoutContent.includes('PostHogProvider') || layoutContent.includes('posthog')
  );

  if (providerExists && layoutHasPosthog) {
    return {
      check: 'posthog_client_configured',
      category,
      verdict: 'PASS',
      detail: 'PostHogProvider component exists and is used in app layout',
    };
  }

  if (providerExists) {
    return {
      check: 'posthog_client_configured',
      category,
      verdict: 'WARN',
      detail: 'PostHogProvider component exists but not confirmed in layout',
    };
  }

  return {
    check: 'posthog_client_configured',
    category,
    verdict: 'FAIL',
    detail: 'PostHog client provider not found in components or layout',
  };
}

// ---------------------------------------------------------------------------
// Category 2: Cron Job Reliability
// ---------------------------------------------------------------------------

function checkCronDailyDigestExists(): CheckResult {
  const category = 'Cron Job Reliability';
  const filePath = 'src/app/api/cron/daily-digest/route.ts';
  const content = readProjectFile(filePath);

  if (content === null) {
    return {
      check: 'cron_daily_digest_exists',
      category,
      verdict: 'FAIL',
      detail: `File not found: ${filePath}`,
    };
  }

  const hasCronSecret = content.includes('CRON_SECRET');
  const hasGetExport = content.includes('GET');

  if (hasCronSecret && hasGetExport) {
    return {
      check: 'cron_daily_digest_exists',
      category,
      verdict: 'PASS',
      detail: `${filePath} exists with GET handler and CRON_SECRET auth`,
    };
  }

  if (hasGetExport && !hasCronSecret) {
    return {
      check: 'cron_daily_digest_exists',
      category,
      verdict: 'WARN',
      detail: `${filePath} has GET handler but missing CRON_SECRET auth check`,
    };
  }

  return {
    check: 'cron_daily_digest_exists',
    category,
    verdict: 'FAIL',
    detail: `${filePath} exists but missing GET handler or CRON_SECRET auth`,
  };
}

function checkCronNudgesExists(): CheckResult {
  const category = 'Cron Job Reliability';
  const filePath = 'src/app/api/cron/nudges/route.ts';
  const content = readProjectFile(filePath);

  if (content === null) {
    return {
      check: 'cron_nudges_exists',
      category,
      verdict: 'FAIL',
      detail: `File not found: ${filePath}`,
    };
  }

  const hasCronSecret = content.includes('CRON_SECRET');
  const hasGetExport = content.includes('GET');

  if (hasCronSecret && hasGetExport) {
    return {
      check: 'cron_nudges_exists',
      category,
      verdict: 'PASS',
      detail: `${filePath} exists with GET handler and CRON_SECRET auth`,
    };
  }

  if (hasGetExport && !hasCronSecret) {
    return {
      check: 'cron_nudges_exists',
      category,
      verdict: 'WARN',
      detail: `${filePath} has GET handler but missing CRON_SECRET auth check`,
    };
  }

  return {
    check: 'cron_nudges_exists',
    category,
    verdict: 'FAIL',
    detail: `${filePath} exists but missing GET handler or CRON_SECRET auth`,
  };
}

function checkVercelCronConfig(): CheckResult {
  const category = 'Cron Job Reliability';
  const content = readProjectFile('vercel.json');

  if (content === null) {
    return {
      check: 'vercel_cron_config',
      category,
      verdict: 'FAIL',
      detail: 'vercel.json not found',
    };
  }

  try {
    const config = JSON.parse(content);
    const crons = config.crons as Array<{ path: string; schedule: string }> | undefined;

    if (!crons || !Array.isArray(crons)) {
      return {
        check: 'vercel_cron_config',
        category,
        verdict: 'FAIL',
        detail: 'vercel.json exists but has no crons array',
      };
    }

    const hasDigest = crons.some(c => c.path?.includes('daily-digest') && c.schedule);
    const hasNudges = crons.some(c => c.path?.includes('nudges') && c.schedule);

    // Validate cron schedule format (basic: 5 space-separated fields)
    const validSchedules = crons.every(c => {
      const parts = c.schedule?.trim().split(/\s+/);
      return parts && parts.length === 5;
    });

    if (hasDigest && hasNudges && validSchedules) {
      const schedules = crons.map(c => `${c.path} @ ${c.schedule}`).join(', ');
      return {
        check: 'vercel_cron_config',
        category,
        verdict: 'PASS',
        detail: `vercel.json has both cron entries with valid schedules: ${schedules}`,
      };
    }

    const missing: string[] = [];
    if (!hasDigest) missing.push('daily-digest');
    if (!hasNudges) missing.push('nudges');
    if (!validSchedules) missing.push('invalid schedule format');

    return {
      check: 'vercel_cron_config',
      category,
      verdict: 'FAIL',
      detail: `vercel.json crons incomplete: missing ${missing.join(', ')}`,
    };
  } catch {
    return {
      check: 'vercel_cron_config',
      category,
      verdict: 'FAIL',
      detail: 'vercel.json exists but is not valid JSON',
    };
  }
}

// ---------------------------------------------------------------------------
// Category 3: Admin Monitoring Endpoints
// ---------------------------------------------------------------------------

function checkAdminQualityEndpoints(): CheckResult {
  const category = 'Admin Monitoring Endpoints';
  const qualityDir = join(ROOT, 'src/app/api/admin/quality');

  if (!existsSync(qualityDir)) {
    return {
      check: 'admin_quality_endpoints',
      category,
      verdict: 'FAIL',
      detail: 'Directory src/app/api/admin/quality/ does not exist',
    };
  }

  // Count subdirectories with route.ts files
  const endpoints: string[] = [];
  try {
    const entries = readdirSync(qualityDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const routeFile = join(qualityDir, entry.name, 'route.ts');
        if (existsSync(routeFile)) {
          endpoints.push(entry.name);
        }
      }
    }
  } catch {
    return {
      check: 'admin_quality_endpoints',
      category,
      verdict: 'FAIL',
      detail: 'Failed to read src/app/api/admin/quality/ directory',
    };
  }

  if (endpoints.length >= 3) {
    return {
      check: 'admin_quality_endpoints',
      category,
      verdict: 'PASS',
      detail: `Found ${endpoints.length} admin quality endpoints: ${endpoints.join(', ')}`,
    };
  }

  return {
    check: 'admin_quality_endpoints',
    category,
    verdict: 'FAIL',
    detail: `Only ${endpoints.length} quality endpoints found (need >= 3): ${endpoints.join(', ')}`,
  };
}

function checkAdminAuthGuard(): CheckResult {
  const category = 'Admin Monitoring Endpoints';
  const adminDir = join(ROOT, 'src/app/api/admin');

  if (!existsSync(adminDir)) {
    return {
      check: 'admin_auth_guard',
      category,
      verdict: 'FAIL',
      detail: 'Directory src/app/api/admin/ does not exist',
    };
  }

  // Recursively find all route.ts files under admin/
  const routeFiles: string[] = [];
  function findRoutes(dir: string) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          findRoutes(fullPath);
        } else if (entry.name === 'route.ts') {
          routeFiles.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }
  findRoutes(adminDir);

  if (routeFiles.length === 0) {
    return {
      check: 'admin_auth_guard',
      category,
      verdict: 'FAIL',
      detail: 'No route.ts files found under src/app/api/admin/',
    };
  }

  // Check how many use requireAdmin from @/lib/admin-guard
  let guarded = 0;
  let unguarded: string[] = [];

  for (const routeFile of routeFiles) {
    const content = readFileSync(routeFile, 'utf-8');
    if (content.includes('requireAdmin') && content.includes('@/lib/admin-guard')) {
      guarded++;
    } else {
      unguarded.push(relative(ROOT, routeFile));
    }
  }

  if (guarded === routeFiles.length) {
    return {
      check: 'admin_auth_guard',
      category,
      verdict: 'PASS',
      detail: `All ${routeFiles.length} admin endpoints use requireAdmin from @/lib/admin-guard`,
    };
  }

  if (guarded >= routeFiles.length * 0.8) {
    return {
      check: 'admin_auth_guard',
      category,
      verdict: 'WARN',
      detail: `${guarded}/${routeFiles.length} admin endpoints guarded. Unguarded: ${unguarded.join(', ')}`,
    };
  }

  return {
    check: 'admin_auth_guard',
    category,
    verdict: 'FAIL',
    detail: `Only ${guarded}/${routeFiles.length} admin endpoints guarded. Unguarded: ${unguarded.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Category 4: Email Infrastructure
// ---------------------------------------------------------------------------

function checkEmailLoggingExists(): CheckResult {
  const category = 'Email Infrastructure';
  const filePath = 'src/lib/email-logging.ts';
  const content = readProjectFile(filePath);

  if (content === null) {
    return {
      check: 'email_logging_exists',
      category,
      verdict: 'FAIL',
      detail: `File not found: ${filePath}`,
    };
  }

  if (content.includes('logEmailSent')) {
    return {
      check: 'email_logging_exists',
      category,
      verdict: 'PASS',
      detail: `${filePath} exists and exports logEmailSent`,
    };
  }

  return {
    check: 'email_logging_exists',
    category,
    verdict: 'FAIL',
    detail: `${filePath} exists but does not export logEmailSent`,
  };
}

function checkEmailTemplatesExist(): CheckResult {
  const category = 'Email Infrastructure';
  const emailsDir = join(ROOT, 'src/emails');

  if (!existsSync(emailsDir)) {
    return {
      check: 'email_templates_exist',
      category,
      verdict: 'FAIL',
      detail: 'Directory src/emails/ does not exist',
    };
  }

  const templates: string[] = [];
  try {
    const entries = readdirSync(emailsDir);
    for (const entry of entries) {
      if (entry.endsWith('.tsx') && entry !== 'layout.tsx') {
        templates.push(entry.replace('.tsx', ''));
      }
    }
  } catch {
    return {
      check: 'email_templates_exist',
      category,
      verdict: 'FAIL',
      detail: 'Failed to read src/emails/ directory',
    };
  }

  if (templates.length >= 5) {
    return {
      check: 'email_templates_exist',
      category,
      verdict: 'PASS',
      detail: `Found ${templates.length} email templates: ${templates.join(', ')}`,
    };
  }

  return {
    check: 'email_templates_exist',
    category,
    verdict: 'FAIL',
    detail: `Only ${templates.length} email templates found (need >= 5): ${templates.join(', ')}`,
  };
}

function checkUnsubscribeSystem(): CheckResult {
  const category = 'Email Infrastructure';
  const filePath = 'src/lib/unsubscribe-token.ts';
  const content = readProjectFile(filePath);

  if (content === null) {
    return {
      check: 'unsubscribe_system',
      category,
      verdict: 'FAIL',
      detail: `File not found: ${filePath}`,
    };
  }

  const hasGenerate = content.includes('generateUnsubscribeToken');
  const hasVerify = content.includes('verifyUnsubscribeToken');

  if (hasGenerate && hasVerify) {
    return {
      check: 'unsubscribe_system',
      category,
      verdict: 'PASS',
      detail: `${filePath} exists with generateUnsubscribeToken and verifyUnsubscribeToken`,
    };
  }

  return {
    check: 'unsubscribe_system',
    category,
    verdict: 'WARN',
    detail: `${filePath} exists but missing ${!hasGenerate ? 'generateUnsubscribeToken' : 'verifyUnsubscribeToken'}`,
  };
}

// ---------------------------------------------------------------------------
// Category 5: Error Handling
// ---------------------------------------------------------------------------

function checkErrorBoundariesExist(): CheckResult {
  const category = 'Error Handling';
  const errorFile = 'src/app/error.tsx';
  const notFoundFile = 'src/app/not-found.tsx';

  const hasError = fileExists(errorFile);
  const hasNotFound = fileExists(notFoundFile);

  if (hasError && hasNotFound) {
    return {
      check: 'error_boundaries_exist',
      category,
      verdict: 'PASS',
      detail: `Both ${errorFile} and ${notFoundFile} exist`,
    };
  }

  const missing: string[] = [];
  if (!hasError) missing.push(errorFile);
  if (!hasNotFound) missing.push(notFoundFile);

  return {
    check: 'error_boundaries_exist',
    category,
    verdict: 'FAIL',
    detail: `Missing error boundary files: ${missing.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('');
  console.log('\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
  console.log('\u2502  Phase 21 \u2014 Synthetic Monitoring (Observability Readiness)  \u2502');
  console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('');

  // --- Category 1: Health & Monitoring Infrastructure ---
  const cat1Checks: CheckResult[] = [
    checkHealthEndpointExists(),
    checkPosthogServerConfigured(),
    checkPosthogClientConfigured(),
  ];
  const cat1: CategoryResult = {
    name: 'Health & Monitoring Infrastructure',
    checks: cat1Checks,
    verdict: categoryVerdict(cat1Checks),
  };

  // --- Category 2: Cron Job Reliability ---
  const cat2Checks: CheckResult[] = [
    checkCronDailyDigestExists(),
    checkCronNudgesExists(),
    checkVercelCronConfig(),
  ];
  const cat2: CategoryResult = {
    name: 'Cron Job Reliability',
    checks: cat2Checks,
    verdict: categoryVerdict(cat2Checks),
  };

  // --- Category 3: Admin Monitoring Endpoints ---
  const cat3Checks: CheckResult[] = [
    checkAdminQualityEndpoints(),
    checkAdminAuthGuard(),
  ];
  const cat3: CategoryResult = {
    name: 'Admin Monitoring Endpoints',
    checks: cat3Checks,
    verdict: categoryVerdict(cat3Checks),
  };

  // --- Category 4: Email Infrastructure ---
  const cat4Checks: CheckResult[] = [
    checkEmailLoggingExists(),
    checkEmailTemplatesExist(),
    checkUnsubscribeSystem(),
  ];
  const cat4: CategoryResult = {
    name: 'Email Infrastructure',
    checks: cat4Checks,
    verdict: categoryVerdict(cat4Checks),
  };

  // --- Category 5: Error Handling ---
  const cat5Checks: CheckResult[] = [
    checkErrorBoundariesExist(),
  ];
  const cat5: CategoryResult = {
    name: 'Error Handling',
    checks: cat5Checks,
    verdict: categoryVerdict(cat5Checks),
  };

  const categories = [cat1, cat2, cat3, cat4, cat5];
  const overall = overallVerdict(categories);
  const allChecks = categories.flatMap(c => c.checks);

  // --- Console Output ---
  for (const cat of categories) {
    console.log(`--- ${cat.name} ---`);
    for (const c of cat.checks) {
      console.log(`  ${verdictIcon(c.verdict)} ${c.check}: ${c.detail}`);
    }
    console.log('');
  }

  console.log('\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
  console.log('\u2502               SUMMARY                           \u2502');
  console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');

  for (const cat of categories) {
    const passCount = cat.checks.filter(c => c.verdict === 'PASS').length;
    const padded = cat.name.padEnd(36);
    console.log(`  ${padded} ${verdictLabel(cat.verdict).padEnd(4)}  (${passCount}/${cat.checks.length} PASS)`);
  }
  console.log('');

  const totalPass = allChecks.filter(c => c.verdict === 'PASS').length;
  const totalWarn = allChecks.filter(c => c.verdict === 'WARN').length;
  const totalFail = allChecks.filter(c => c.verdict === 'FAIL').length;

  console.log(`  PASS: ${totalPass}  |  WARN: ${totalWarn}  |  FAIL: ${totalFail}  |  TOTAL: ${allChecks.length}`);
  console.log(`  OVERALL: ${verdictLabel(overall)}`);
  console.log('');

  // --- Write Evidence ---
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // JSON evidence
  const jsonEvidence = {
    timestamp: new Date().toISOString(),
    phase: 'Phase 21 \u2014 Synthetic Monitoring (Observability Readiness)',
    overall_verdict: overall,
    categories: categories.map(cat => ({
      name: cat.name,
      verdict: cat.verdict,
      checks: cat.checks,
    })),
    summary: {
      total_checks: allChecks.length,
      pass_count: totalPass,
      warn_count: totalWarn,
      fail_count: totalFail,
    },
  };

  writeFileSync(
    join(EVIDENCE_DIR, 'phase21-synthetic.json'),
    JSON.stringify(jsonEvidence, null, 2)
  );

  // TXT evidence
  let txt = '';
  txt += '='.repeat(60) + '\n';
  txt += '  Phase 21 — Synthetic Monitoring (Observability Readiness)\n';
  txt += '='.repeat(60) + '\n';
  txt += `Date: ${new Date().toISOString().split('T')[0]}\n`;
  txt += `Timestamp: ${new Date().toISOString()}\n`;
  txt += `Overall Verdict: ${overall}\n\n`;

  for (const cat of categories) {
    txt += `--- ${cat.name} (${cat.verdict}) ---\n`;
    for (const c of cat.checks) {
      const icon =
        c.verdict === 'PASS' ? '[PASS]' :
        c.verdict === 'WARN' ? '[WARN]' :
        '[FAIL]';
      txt += `  ${icon.padEnd(6)} ${c.check}: ${c.detail}\n`;
    }
    txt += '\n';
  }

  txt += `--- SUMMARY ---\n`;
  for (const cat of categories) {
    const passCount = cat.checks.filter(c => c.verdict === 'PASS').length;
    const padded = cat.name.padEnd(36);
    txt += `  ${padded} ${verdictLabel(cat.verdict).padEnd(4)}  (${passCount}/${cat.checks.length} PASS)\n`;
  }
  txt += `\n  PASS: ${totalPass}  |  WARN: ${totalWarn}  |  FAIL: ${totalFail}  |  TOTAL: ${allChecks.length}\n`;
  txt += `  OVERALL: ${verdictLabel(overall)}\n`;

  txt += `\n--- METHODOLOGY ---\n`;
  txt += `\nCategory 1: Health & Monitoring Infrastructure\n`;
  txt += `  - health_endpoint_exists: Verifies src/app/api/health/route.ts exists and exports GET\n`;
  txt += `  - posthog_server_configured: Verifies src/lib/posthog-server.ts exports captureServerEvent\n`;
  txt += `  - posthog_client_configured: Verifies PostHog provider exists in app layout or providers\n`;
  txt += `\nCategory 2: Cron Job Reliability\n`;
  txt += `  - cron_daily_digest_exists: Verifies cron route exists with CRON_SECRET auth\n`;
  txt += `  - cron_nudges_exists: Verifies cron route exists with CRON_SECRET auth\n`;
  txt += `  - vercel_cron_config: Verifies vercel.json has both cron entries with valid schedules\n`;
  txt += `\nCategory 3: Admin Monitoring Endpoints\n`;
  txt += `  - admin_quality_endpoints: Verifies >= 3 quality endpoints under src/app/api/admin/quality/\n`;
  txt += `  - admin_auth_guard: Verifies admin endpoints use requireAdmin from @/lib/admin-guard\n`;
  txt += `\nCategory 4: Email Infrastructure\n`;
  txt += `  - email_logging_exists: Verifies src/lib/email-logging.ts exports logEmailSent\n`;
  txt += `  - email_templates_exist: Verifies >= 5 email templates in src/emails/\n`;
  txt += `  - unsubscribe_system: Verifies src/lib/unsubscribe-token.ts has generate + verify functions\n`;
  txt += `\nCategory 5: Error Handling\n`;
  txt += `  - error_boundaries_exist: Verifies src/app/error.tsx and src/app/not-found.tsx exist\n`;

  writeFileSync(join(EVIDENCE_DIR, 'phase21-synthetic.txt'), txt);

  console.log(`Evidence saved to ${relative(ROOT, EVIDENCE_DIR)}/phase21-synthetic.{json,txt}`);

  if (overall === 'FAIL') {
    process.exit(1);
  }
}

main();
